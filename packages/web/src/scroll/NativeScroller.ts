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

import type { FrameScheduler } from '@novasheet/core'

export type ScrollListener = (scrollTop: number, scrollLeft: number) => void

export class NativeScroller {
  private destroyed = false
  private listenerAttached = false

  /**
   * 创建一个原生滚动事件适配器。
   *
   * @example
   * ```ts
   * const scroller = new NativeScroller(scrollHost, scheduler, (scrollTop, scrollLeft) => {
   *   // Grid 在这里把 DOM scrollTop/scrollLeft 映射为 logicalX/logicalY。
   * })
   * ```
   */
  constructor(
    private scrollHost: HTMLElement,
    private scheduler: FrameScheduler,
    private onScroll: ScrollListener,
  ) {}

  /**
   * 绑定 scroll 事件监听。
   *
   * @example
   * ```ts
   * const scroller = new NativeScroller(scrollHost, scheduler, onScroll)
   * scroller.attach()
   *
   * // 重复 attach 是安全的：listenerAttached 会阻止重复绑定。
   * scroller.attach()
   * ```
   */
  attach(): void {
    if (this.listenerAttached || this.destroyed) return
    // passive: true 表示这个监听器只观察滚动，不会调用 preventDefault() 阻止浏览器滚动。
    // NativeScroller 只读取 scrollTop/scrollLeft，因此可以让浏览器放心走原生滚动路径。
    this.scrollHost.addEventListener('scroll', this.handler, { passive: true })
    this.listenerAttached = true
  }

  /**
   * 销毁滚动适配器：移除事件监听，并取消已入队但尚未执行的 scroll:read。
   *
   * @example
   * ```ts
   * scroller.destroy()
   *
   * // 重复 destroy 是安全的，不会重复 remove listener。
   * scroller.destroy()
   * ```
   */
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    // 取消任何已入队但未执行的 scroll:read，避免 destroy 后多余的 RAF 唤醒
    // （destroyed 标志兜底也行，但提前 cancel 更干净）
    this.scheduler.cancel('scroll:read')
    if (this.listenerAttached) {
      this.scrollHost.removeEventListener('scroll', this.handler)
      this.listenerAttached = false
    }
  }

  /**
   * 程序化滚动 scrollHost。
   *
   * @example
   * ```ts
   * // 滚到 DOM scrollTop=1000、scrollLeft=240 的位置。
   * // Grid.scrollToRow / scrollToCell 会先把 logical 坐标转成 DOM scroll 坐标，再调用这里。
   * scroller.scrollTo(1000, 240)
   * ```
   */
  scrollTo(scrollTop: number, scrollLeft: number): void {
    this.scrollHost.scrollTo({ top: scrollTop, left: scrollLeft })
  }

  /**
   * 原生 scroll 事件处理器。
   *
   * @example
   * ```ts
   * // 浏览器触发很多次 scroll：
   * // handler()
   * // handler()
   * // handler()
   * //
   * // FrameScheduler 用 key = 'scroll:read' 去重，
   * // 下一帧只读取一次最新 scrollTop/scrollLeft。
   * ```
   */
  private handler = (): void => {
    this.scheduler.schedule('scroll:read', () => {
      if (this.destroyed) return
      this.onScroll(this.scrollHost.scrollTop, this.scrollHost.scrollLeft)
    })
  }
}
