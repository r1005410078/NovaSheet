/**
 * Phase 3.4 — DOM resize handle 层（spec §6.1）。
 *
 * 容器 `pointer-events: none`，单个 handle `pointer-events: auto`，不挡滚动。
 */

import type { ResizeHandleRect, ThemeColors, ThemeMetrics } from '@novasheet/core'
import {
  MIN_RESIZE_SIZE,
  RESIZE_HANDLE_HIT_SIZE,
  RESIZE_KEYBOARD_STEP,
  RESIZE_KEYBOARD_STEP_LARGE,
} from '@novasheet/core'
import { applyResizeHandleTheme, ensureResizeHandleStylesheet } from '../host/resize-handle-style'

/** Sheets 式预览：列 = 竖线（x 为右缘），行 = 横线（y 为下缘）。 */
export type ResizeIndicatorLine =
  | { readonly kind: 'column'; readonly x: number }
  | { readonly kind: 'row'; readonly y: number }

export interface DomHandleLayerCallbacks {
  onResizePointerDown: (handle: ResizeHandleRect, pointerId: number, clientX: number, clientY: number) => void
  onResizePointerMove: (pointerId: number, clientX: number, clientY: number) => void
  onResizePointerUp: (pointerId: number) => void
  onResizeKeyboard: (handle: ResizeHandleRect, delta: number) => void
}

export class DomHandleLayer {
  private container: HTMLElement
  private callbacks: DomHandleLayerCallbacks
  private layer!: HTMLDivElement
  private indicator!: HTMLDivElement
  private pool = new Map<string, HTMLDivElement>()
  private attached = false
  private destroyed = false

  constructor(container: HTMLElement, callbacks: DomHandleLayerCallbacks) {
    this.container = container
    this.callbacks = callbacks
  }

  attach(): void {
    if (this.attached || this.destroyed) return
    this.attached = true

    this.layer = document.createElement('div')
    this.layer.setAttribute('data-novasheet-handle-layer', '')
    Object.assign(this.layer.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      pointerEvents: 'none',
      zIndex: '2',
    })

    this.indicator = document.createElement('div')
    this.indicator.setAttribute('data-novasheet-resize-indicator', '')
    const cap = document.createElement('div')
    cap.setAttribute('data-novasheet-resize-indicator-cap', '')
    for (let i = 0; i < 2; i++) {
      const grip = document.createElement('span')
      grip.setAttribute('data-novasheet-resize-grip', '')
      grip.setAttribute('aria-hidden', 'true')
      cap.appendChild(grip)
    }
    this.indicator.appendChild(cap)

    this.layer.appendChild(this.indicator)
    this.container.appendChild(this.layer)
    ensureResizeHandleStylesheet(this.container.ownerDocument)
  }

  applyTheme(
    colors: ThemeColors,
    metrics: Pick<ThemeMetrics, 'headerHeight' | 'rowHeaderWidth'>,
  ): void {
    if (this.destroyed) return
    applyResizeHandleTheme(this.container, colors, metrics)
  }

  sync(handles: readonly ResizeHandleRect[]): void {
    if (!this.attached || this.destroyed) return

    const nextKeys = new Set<string>()
    for (const handle of handles) {
      const key = handleKey(handle)
      nextKeys.add(key)
      const el = this.ensureHandle(key, handle)
      Object.assign(el.style, {
        left: `${handle.x}px`,
        top: `${handle.y}px`,
        width: `${handle.width}px`,
        height: `${handle.height}px`,
      })
    }

    for (const [key, el] of this.pool) {
      if (!nextKeys.has(key)) {
        el.remove()
        this.pool.delete(key)
      }
    }
  }

  showIndicator(line: ResizeIndicatorLine): void {
    if (!this.attached) return
    this.layer.setAttribute('data-ns-resize-dragging', '')
    this.indicator.dataset.nsOrientation = line.kind
    this.indicator.style.display = 'block'
    if (line.kind === 'column') {
      this.indicator.style.left = `${line.x}px`
      this.indicator.style.top = ''
      this.indicator.style.bottom = ''
      this.indicator.style.right = ''
    } else {
      this.indicator.style.top = `${line.y}px`
      this.indicator.style.left = ''
      this.indicator.style.right = ''
      this.indicator.style.bottom = ''
    }
  }

  hideIndicator(): void {
    if (!this.attached) return
    this.layer.removeAttribute('data-ns-resize-dragging')
    this.indicator.style.display = 'none'
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    for (const el of this.pool.values()) el.remove()
    this.pool.clear()
    if (this.layer?.parentNode === this.container) {
      this.container.removeChild(this.layer)
    }
    this.attached = false
  }

  private ensureHandle(key: string, handle: ResizeHandleRect): HTMLDivElement {
    let el = this.pool.get(key)
    if (el) return el

    el = document.createElement('div')
    el.setAttribute('data-novasheet-resize-handle', '')
    el.dataset.nsResize = handle.kind
    if (handle.fieldId) el.dataset.fieldId = handle.fieldId
    if (handle.colIndex !== undefined) el.dataset.colIndex = String(handle.colIndex)
    if (handle.rowIndex !== undefined) el.dataset.rowIndex = String(handle.rowIndex)

    const vertical = handle.kind === 'column'
    el.setAttribute('role', 'separator')
    el.setAttribute('aria-orientation', vertical ? 'vertical' : 'horizontal')
    el.tabIndex = 0
    Object.assign(el.style, {
      position: 'absolute',
      pointerEvents: 'auto',
      touchAction: 'none',
      cursor: vertical ? 'col-resize' : 'row-resize',
    })

    for (let i = 0; i < 2; i++) {
      const grip = document.createElement('span')
      grip.setAttribute('data-novasheet-resize-grip', '')
      grip.setAttribute('aria-hidden', 'true')
      el.appendChild(grip)
    }

    el.addEventListener('pointerenter', this.onPointerEnter)
    el.addEventListener('pointerleave', this.onPointerLeave)
    el.addEventListener('pointerdown', this.onPointerDown)
    el.addEventListener('pointermove', this.onPointerMove)
    el.addEventListener('pointerup', this.onPointerUp)
    el.addEventListener('pointercancel', this.onPointerUp)
    el.addEventListener('keydown', this.onKeyDown)
    this.layer.appendChild(el)
    this.pool.set(key, el)
    return el
  }

  private setHandleActive(el: HTMLElement, active: boolean): void {
    if (active) el.setAttribute('data-ns-resize-active', '')
    else el.removeAttribute('data-ns-resize-active')
  }

  private onPointerEnter = (event: PointerEvent): void => {
    this.setHandleActive(event.currentTarget as HTMLElement, true)
  }

  private onPointerLeave = (event: PointerEvent): void => {
    const el = event.currentTarget as HTMLElement
    if (!el.hasPointerCapture?.(event.pointerId)) {
      this.setHandleActive(el, false)
    }
  }

  private onPointerDown = (event: PointerEvent): void => {
    const handle = this.readHandle(event.currentTarget as HTMLElement)
    if (!handle) return
    event.preventDefault()
    event.stopPropagation()
    const target = event.currentTarget as HTMLElement
    this.setHandleActive(target, true)
    target.setPointerCapture(event.pointerId)
    this.callbacks.onResizePointerDown(handle, event.pointerId, event.clientX, event.clientY)
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (!event.currentTarget || !(event.currentTarget as HTMLElement).hasPointerCapture?.(event.pointerId)) {
      return
    }
    this.callbacks.onResizePointerMove(event.pointerId, event.clientX, event.clientY)
  }

  private onPointerUp = (event: PointerEvent): void => {
    const target = event.currentTarget as HTMLElement
    if (target.hasPointerCapture?.(event.pointerId)) {
      target.releasePointerCapture(event.pointerId)
    }
    this.setHandleActive(target, false)
    this.callbacks.onResizePointerUp(event.pointerId)
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    const handle = this.readHandle(event.currentTarget as HTMLElement)
    if (!handle) return

    const step = event.shiftKey ? RESIZE_KEYBOARD_STEP_LARGE : RESIZE_KEYBOARD_STEP
    let delta = 0
    if (handle.kind === 'column') {
      if (event.key === 'ArrowLeft') delta = -step
      else if (event.key === 'ArrowRight') delta = step
    } else {
      if (event.key === 'ArrowUp') delta = -step
      else if (event.key === 'ArrowDown') delta = step
    }
    if (delta === 0) return

    event.preventDefault()
    this.callbacks.onResizeKeyboard(handle, delta)
  }

  private readHandle(el: HTMLElement): ResizeHandleRect | null {
    const kind = el.dataset.nsResize
    if (kind !== 'column' && kind !== 'row') return null
    const x = Number.parseFloat(el.style.left)
    const y = Number.parseFloat(el.style.top)
    const width = Number.parseFloat(el.style.width)
    const height = Number.parseFloat(el.style.height)
    if (kind === 'column') {
      const fieldId = el.dataset.fieldId
      if (!fieldId) return null
      const colIndex = Number.parseInt(el.dataset.colIndex ?? '', 10)
      return {
        kind: 'column',
        id: fieldId,
        fieldId,
        colIndex: Number.isNaN(colIndex) ? undefined : colIndex,
        x,
        y,
        width,
        height,
      }
    }
    const rowIndex = Number.parseInt(el.dataset.rowIndex ?? '', 10)
    if (Number.isNaN(rowIndex)) return null
    return {
      kind: 'row',
      id: `row-${rowIndex}`,
      rowIndex,
      x,
      y,
      width,
      height,
    }
  }
}

function handleKey(handle: ResizeHandleRect): string {
  if (handle.kind === 'column') return `col:${handle.colIndex ?? handle.id}`
  return `row:${handle.rowIndex ?? handle.id}`
}

export { MIN_RESIZE_SIZE, RESIZE_HANDLE_HIT_SIZE }
