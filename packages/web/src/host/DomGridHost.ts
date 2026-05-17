import type { FrameScheduler } from '@novasheet/core'
import { NativeScroller } from '../scroll/NativeScroller'
import type { WebHost, WebHostOptions } from './WebHost'

export class DomGridHost implements WebHost {
  private container: HTMLElement
  private scheduler: FrameScheduler
  private onScroll: WebHostOptions['onScroll']
  private onResize: WebHostOptions['onResize']
  private onDprChange?: WebHostOptions['onDprChange']
  private scrollHost!: HTMLDivElement
  private scrollSpacer!: HTMLDivElement
  private nativeScroller!: NativeScroller
  private resizeObserver: ResizeObserver | null = null
  private dprMedia: MediaQueryList | null = null
  private originalPosition = ''
  private destroyed = false
  private attached = false
  private currentDpr = 1

  constructor(options: WebHostOptions) {
    this.container = options.container
    this.scheduler = options.scheduler
    this.onScroll = options.onScroll
    this.onResize = options.onResize
    this.onDprChange = options.onDprChange
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
    Object.assign(this.scrollHost.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      overflow: 'auto',
      zIndex: '1',
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

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.emitResize())
      this.resizeObserver.observe(this.container)
    }

    this.watchDpr()
    this.emitResize()
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

  getContainerSize(): { width: number; height: number } {
    const width =
      this.container.clientWidth || this.container.getBoundingClientRect().width || 400
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

  private watchDpr(): void {
    if (!this.onDprChange || typeof window.matchMedia !== 'function') return
    const query = `(resolution: ${window.devicePixelRatio}dppx)`
    this.dprMedia = window.matchMedia(query)
    const handler = (): void => {
      if (this.destroyed) return
      this.unwatchDpr()
      this.currentDpr = window.devicePixelRatio || 1
      this.onDprChange?.(this.currentDpr)
      this.watchDpr()
    }
    this.dprMedia.addEventListener('change', handler)
  }

  private unwatchDpr(): void {
    if (!this.dprMedia) return
    this.dprMedia = null
  }
}
