import type { FrameScheduler } from '@novasheet/core'

/** `DomGridHost` 等实现的构造参数。 */
export interface WebHostOptions {
  container: HTMLElement
  /** 与 Grid 共享的 `FrameScheduler`，供 `NativeScroller` 合并 scroll RAF。 */
  scheduler: FrameScheduler
  /** 原生 scroll 事件（经 `NativeScroller` RAF 节流后回调）。 */
  onScroll: (scrollTop: number, scrollLeft: number) => void
  /** 容器尺寸变化（`ResizeObserver`）。 */
  onResize: (cssWidth: number, cssHeight: number, dpr: number) => void
  /** DPR 变化（窗口拖到另一块屏幕等）。 */
  onDprChange?: (dpr: number) => void
}

/**
 * 浏览器宿主契约（spec §6 `WebHost`）。
 *
 * 拥有 scrollHost + scrollSpacer 与滚动/尺寸/DPR 监听；**不**拥有 canvas。
 * canvas 由具体 `WebRenderer` 实现挂载。
 */
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
