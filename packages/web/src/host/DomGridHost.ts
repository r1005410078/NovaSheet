import type { FrameScheduler, ThemeScrollbar } from '@novasheet/core'
import { NativeScroller } from '../scroll/NativeScroller'
import { applyScrollbarTheme } from './scrollbar-style'
import type { WebHost, WebHostOptions } from './WebHost'

/**
 * `WebHost` 的 DOM 实现：原生滚动容器 + 占位 spacer。
 *
 * - 创建 `scrollHost` / `scrollSpacer`，监听 scroll、resize、DPR
 * - 若 container 为 `position: static`，临时改为 `relative` 并在 `destroy` 还原
 * - 程序化滚动委托给 `NativeScroller`
 */
export class DomGridHost implements WebHost {
  private container: HTMLElement
  private scheduler: FrameScheduler
  private onScroll: WebHostOptions['onScroll']
  private onResize: WebHostOptions['onResize']
  private onDprChange?: WebHostOptions['onDprChange']
  private onPointerDown?: WebHostOptions['onPointerDown']
  private onPointerMove?: WebHostOptions['onPointerMove']
  private onPointerUp?: WebHostOptions['onPointerUp']
  private onKeyDown?: WebHostOptions['onKeyDown']
  private onDoubleClick?: WebHostOptions['onDoubleClick']
  private onContextMenu?: WebHostOptions['onContextMenu']
  private scrollHost!: HTMLDivElement
  private scrollSpacer!: HTMLDivElement
  private nativeScroller!: NativeScroller
  private resizeObserver: ResizeObserver | null = null
  private dprMedia: MediaQueryList | null = null
  private dprHandler: (() => void) | null = null
  private originalPosition = ''
  private destroyed = false
  private attached = false
  private currentDpr = 1
  private pendingScrollbar: ThemeScrollbar | null = null

  constructor(options: WebHostOptions) {
    this.container = options.container
    this.scheduler = options.scheduler
    this.onScroll = options.onScroll
    this.onResize = options.onResize
    this.onDprChange = options.onDprChange
    this.onPointerDown = options.onPointerDown
    this.onPointerMove = options.onPointerMove
    this.onPointerUp = options.onPointerUp
    this.onKeyDown = options.onKeyDown
    this.onDoubleClick = options.onDoubleClick
    this.onContextMenu = options.onContextMenu
  }

  attach(): void {
    if (this.attached || this.destroyed) return
    this.attached = true
    this.currentDpr = window.devicePixelRatio || 1

    const computedPos = getComputedStyle(this.container).position
    this.originalPosition = this.container.style.position
    if (computedPos === 'static') {
      this.container.style.position = 'relative'
    }

    this.scrollHost = document.createElement('div')
    this.scrollHost.setAttribute('data-novasheet-scroll-host', '')
    this.scrollHost.tabIndex = 0
    Object.assign(this.scrollHost.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      overflow: 'auto',
      zIndex: '1',
      outline: 'none',
    })

    this.scrollSpacer = document.createElement('div')
    this.scrollSpacer.setAttribute('data-novasheet-scroll-spacer', '')
    Object.assign(this.scrollSpacer.style, {
      display: 'block',
      width: '0px',
      height: '0px',
    })
    this.scrollHost.appendChild(this.scrollSpacer)
    this.container.appendChild(this.scrollHost)

    this.nativeScroller = new NativeScroller(this.scrollHost, this.scheduler, this.onScroll)
    this.nativeScroller.attach()
    this.scrollHost.addEventListener('pointerdown', this.handlePointerDown)
    this.scrollHost.addEventListener('pointermove', this.handlePointerMove)
    this.scrollHost.addEventListener('pointerup', this.handlePointerUp)
    this.scrollHost.addEventListener('pointercancel', this.handlePointerUp)
    this.scrollHost.addEventListener('keydown', this.handleKeyDown)
    this.scrollHost.addEventListener('dblclick', this.handleDoubleClick)
    this.scrollHost.addEventListener('contextmenu', this.handleContextMenu)

    if (this.pendingScrollbar) {
      applyScrollbarTheme(this.scrollHost, this.pendingScrollbar)
    }

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.emitResize())
      this.resizeObserver.observe(this.container)
    }

    this.watchDpr()
    this.emitResize()
  }

  applyScrollbarTheme(scrollbar: ThemeScrollbar): void {
    this.pendingScrollbar = scrollbar
    if (this.scrollHost) {
      applyScrollbarTheme(this.scrollHost, scrollbar)
    }
  }

  setScrollSize(width: number, height: number): void {
    this.scrollSpacer.style.width = `${width}px`
    this.scrollSpacer.style.height = `${height}px`
  }

  scrollTo(scrollTop: number, scrollLeft: number): void {
    this.nativeScroller.scrollTo(scrollTop, scrollLeft)
  }

  getScrollPosition(): { scrollTop: number; scrollLeft: number } {
    return {
      scrollTop: this.scrollHost.scrollTop,
      scrollLeft: this.scrollHost.scrollLeft,
    }
  }

  getDpr(): number {
    return this.currentDpr
  }

  focusScrollHost(): void {
    this.scrollHost?.focus({ preventScroll: true })
  }

  getContainerBoundingRect(): { left: number; top: number } {
    const rect = this.scrollHost.getBoundingClientRect()
    return { left: rect.left, top: rect.top }
  }

  getContainerSize(): { width: number; height: number } {
    const width = this.container.clientWidth || this.container.getBoundingClientRect().width || 400
    const height =
      this.container.clientHeight || this.container.getBoundingClientRect().height || 300
    return { width, height }
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true

    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }

    this.unwatchDpr()
    this.scrollHost?.removeEventListener('pointerdown', this.handlePointerDown)
    this.scrollHost?.removeEventListener('pointermove', this.handlePointerMove)
    this.scrollHost?.removeEventListener('pointerup', this.handlePointerUp)
    this.scrollHost?.removeEventListener('pointercancel', this.handlePointerUp)
    this.scrollHost?.removeEventListener('keydown', this.handleKeyDown)
    this.scrollHost?.removeEventListener('dblclick', this.handleDoubleClick)
    this.scrollHost?.removeEventListener('contextmenu', this.handleContextMenu)
    this.nativeScroller?.destroy()

    if (this.scrollHost?.parentNode === this.container) {
      this.container.removeChild(this.scrollHost)
    }

    this.container.style.position = this.originalPosition
    this.attached = false
  }

  private emitResize(): void {
    if (this.destroyed) return
    const { width, height } = this.getContainerSize()
    this.currentDpr = window.devicePixelRatio || 1
    this.onResize(width, height, this.currentDpr)
  }

  private handlePointerDown = (event: PointerEvent): void => {
    if (!this.onPointerDown) return
    const local = this.toLocalPointerEvent(event)
    if (this.isScrollbarPointer(local)) return
    this.scrollHost.focus({ preventScroll: true })
    this.scrollHost.setPointerCapture?.(event.pointerId)
    this.onPointerDown(local)
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.onKeyDown) return
    const handled = this.onKeyDown({
      key: event.key,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
    })
    if (handled) event.preventDefault()
  }

  private handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
    if (!this.onContextMenu) return
    const rect = this.scrollHost.getBoundingClientRect()
    this.onContextMenu({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      shiftKey: event.shiftKey,
      button: event.button,
      clientX: event.clientX,
      clientY: event.clientY,
    })
  }

  private handleDoubleClick = (event: MouseEvent): void => {
    if (!this.onDoubleClick) return
    const local = this.toLocalPointerEvent(event)
    if (this.isScrollbarPointer(local)) return
    event.preventDefault()
    this.onDoubleClick(local)
  }

  private handlePointerMove = (event: PointerEvent): void => {
    const local = this.toLocalPointerEvent(event)
    if (this.isScrollbarPointer(local)) return
    this.onPointerMove?.(local)
  }

  private handlePointerUp = (event: PointerEvent): void => {
    this.scrollHost.releasePointerCapture?.(event.pointerId)
    this.onPointerUp?.()
  }

  private toLocalPointerEvent(event: {
    clientX: number
    clientY: number
    shiftKey: boolean
    button?: number
  }): { x: number; y: number; shiftKey: boolean; button: number } {
    const rect = this.scrollHost.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      shiftKey: event.shiftKey,
      button: event.button ?? 0,
    }
  }

  private isScrollbarPointer(point: { x: number; y: number }): boolean {
    const clientWidth = this.scrollHost.clientWidth
    const clientHeight = this.scrollHost.clientHeight
    return (
      (clientWidth > 0 && point.x >= clientWidth) || (clientHeight > 0 && point.y >= clientHeight)
    )
  }

  private watchDpr(): void {
    if (!this.onDprChange || typeof window.matchMedia !== 'function') return
    const query = `(resolution: ${window.devicePixelRatio}dppx)`
    this.dprMedia = window.matchMedia(query)
    this.dprHandler = (): void => {
      if (this.destroyed) return
      this.unwatchDpr()
      this.currentDpr = window.devicePixelRatio || 1
      this.onDprChange?.(this.currentDpr)
      this.watchDpr()
    }
    this.dprMedia.addEventListener('change', this.dprHandler)
  }

  private unwatchDpr(): void {
    if (this.dprMedia && this.dprHandler) {
      this.dprMedia.removeEventListener('change', this.dprHandler)
    }
    this.dprMedia = null
    this.dprHandler = null
  }
}
