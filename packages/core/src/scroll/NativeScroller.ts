/**
 * NativeScroller——把宿主元素（`<scroll-host>`）的原生 scroll 事件适配为 logical 回调。
 *
 * 与 FrameScheduler 协作：每次 scroll 事件以 key `'scroll:read'` 入队；同一帧多次滚动
 * 自动合并为最后一次（key 去重），与 Renderer 的 `'renderer:flush'` 在同一帧合并执行
 * （CLAUDE.md 不变量 #5）。
 *
 * 本类**不做数学映射**——只读 scrollHost.scrollTop / scrollLeft 后透传给 onScroll 回调。
 * Grid 持有 ScrollMapper 并在回调里做转换，避免本类持有过多依赖（axis / viewport / theme）。
 *
 * destroy() 之后即使回调入队也不会触发——内部 destroyed 标志直接吞掉。
 */

import type { FrameScheduler } from '../util/raf'

export type ScrollListener = (scrollTop: number, scrollLeft: number) => void

export class NativeScroller {
  private destroyed = false
  private listenerAttached = false

  constructor(
    private scrollHost: HTMLElement,
    private scheduler: FrameScheduler,
    private onScroll: ScrollListener,
  ) {}

  attach(): void {
    if (this.listenerAttached || this.destroyed) return
    this.scrollHost.addEventListener('scroll', this.handler, { passive: true })
    this.listenerAttached = true
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    if (this.listenerAttached) {
      this.scrollHost.removeEventListener('scroll', this.handler)
      this.listenerAttached = false
    }
  }

  scrollTo(scrollTop: number, scrollLeft: number): void {
    this.scrollHost.scrollTo({ top: scrollTop, left: scrollLeft })
  }

  private handler = (): void => {
    this.scheduler.schedule('scroll:read', () => {
      if (this.destroyed) return
      this.onScroll(this.scrollHost.scrollTop, this.scrollHost.scrollLeft)
    })
  }
}
