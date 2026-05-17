import type { FrameScheduler } from '@novasheet/core'

export interface WebHostOptions {
  container: HTMLElement
  /** Shared per-Grid scheduler for NativeScroller RAF coalescing. */
  scheduler: FrameScheduler
  /** Called every native scroll event (RAF-throttled by NativeScroller). */
  onScroll: (scrollTop: number, scrollLeft: number) => void
  /** Called when container size changes (via ResizeObserver). */
  onResize: (cssWidth: number, cssHeight: number, dpr: number) => void
  /** Called when DPR changes (window moved between displays). */
  onDprChange?: (dpr: number) => void
}

export interface WebHost {
  attach(): void
  setScrollSize(width: number, height: number): void
  scrollTo(scrollTop: number, scrollLeft: number): void
  getScrollPosition(): { scrollTop: number; scrollLeft: number }
  getDpr(): number
  getContainerSize(): { width: number; height: number }
  destroy(): void
}

export type WebHostFactory = (options: WebHostOptions) => WebHost
