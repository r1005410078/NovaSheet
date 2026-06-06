import type { OverlayRect } from '../overlay/RangeOverlayRects'

/** DOM 层只转发原始 client 坐标；runtime 负责转换成 container-local 坐标。 */
export interface DomFillHandleLayerCallbacks {
  readonly onFillPointerDown: (pointerId: number, clientX: number, clientY: number) => void
  readonly onFillPointerMove: (pointerId: number, clientX: number, clientY: number) => void
  readonly onFillPointerUp: (pointerId: number) => void
}

/** 填充柄和拖拽预览的 DOM overlay；独立于 canvas，保证手柄命中和样式可控。 */
export class DomFillHandleLayer {
  private layer!: HTMLDivElement
  private handle!: HTMLDivElement
  private previewEls: HTMLDivElement[] = []
  private attached = false
  private destroyed = false
  private activePointerId: number | null = null

  constructor(
    private readonly container: HTMLElement,
    private readonly callbacks: DomFillHandleLayerCallbacks,
  ) {}

  attach(): void {
    if (this.attached || this.destroyed) return
    this.attached = true
    this.layer = document.createElement('div')
    this.layer.setAttribute('data-novasheet-fill-layer', '')
    Object.assign(this.layer.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '3',
    })

    this.handle = document.createElement('div')
    this.handle.setAttribute('data-novasheet-fill-handle', '')
    Object.assign(this.handle.style, {
      position: 'absolute',
      display: 'none',
      pointerEvents: 'auto',
      touchAction: 'none',
      cursor: 'crosshair',
      background: 'var(--novasheet-selection-border, #0969da)',
      border: '1px solid #fff',
      borderRadius: '50%',
      boxSizing: 'border-box',
    })
    this.handle.addEventListener('pointerdown', this.onPointerDown)
    this.handle.addEventListener('pointermove', this.onPointerMove)
    this.handle.addEventListener('pointerup', this.onPointerUp)
    this.handle.addEventListener('pointercancel', this.onPointerUp)
    this.layer.appendChild(this.handle)
    this.container.appendChild(this.layer)
  }

  sync(rect: OverlayRect | null): void {
    if (!this.attached || this.destroyed) return
    if (!rect) {
      this.handle.style.display = 'none'
      return
    }
    Object.assign(this.handle.style, {
      display: 'block',
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    })
  }

  showPreview(rects: readonly OverlayRect[]): void {
    if (!this.attached || this.destroyed) return
    this.hidePreview()
    for (const rect of rects) {
      const el = document.createElement('div')
      el.setAttribute('data-novasheet-fill-preview', '')
      Object.assign(el.style, {
        position: 'absolute',
        pointerEvents: 'none',
        boxSizing: 'border-box',
        // 预览框按 Google Sheets 的感觉处理得比选中框更轻：细虚线 + 低不透明度。
        borderWidth: '1px',
        borderStyle: 'dashed',
        borderColor: 'var(--novasheet-selection-border, #0969da)',
        opacity: '0.72',
        background: 'rgba(9,105,218,0.06)',
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      })
      this.layer.appendChild(el)
      this.previewEls.push(el)
    }
  }

  hidePreview(): void {
    for (const el of this.previewEls) el.remove()
    this.previewEls = []
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.hidePreview()
    this.handle?.removeEventListener('pointerdown', this.onPointerDown)
    this.handle?.removeEventListener('pointermove', this.onPointerMove)
    this.handle?.removeEventListener('pointerup', this.onPointerUp)
    this.handle?.removeEventListener('pointercancel', this.onPointerUp)
    this.layer?.remove()
    this.attached = false
  }

  private onPointerDown = (event: PointerEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    this.activePointerId = event.pointerId
    this.handle.setPointerCapture?.(event.pointerId)
    this.callbacks.onFillPointerDown(event.pointerId, event.clientX, event.clientY)
  }

  private onPointerMove = (event: PointerEvent): void => {
    if (this.activePointerId !== event.pointerId) return
    this.callbacks.onFillPointerMove(event.pointerId, event.clientX, event.clientY)
  }

  private onPointerUp = (event: PointerEvent): void => {
    if (this.handle.hasPointerCapture?.(event.pointerId))
      this.handle.releasePointerCapture(event.pointerId)
    if (this.activePointerId === event.pointerId) this.activePointerId = null
    this.callbacks.onFillPointerUp(event.pointerId)
  }
}
