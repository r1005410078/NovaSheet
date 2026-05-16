/**
 * 共享 RAF 调度器（CLAUDE.md 不变量 #5：「一个 Grid 实例只有一个 frameScheduler」）。
 *
 * 同一个 key 的 task 后写覆盖前写（按 key 去重）；不同 key 的 task 在同一帧内
 * 按 Map 插入顺序依次执行。这样多个子系统（scroll / resize / render）能合并到
 * 同一帧 RAF，避免一帧内多次 RAF 触发的开销与时序竞态。
 *
 * 典型 key：
 * - `renderer:flush`（Renderer.invalidate）
 * - `scroll:read`（NativeScroller，M2 引入）
 * - `dpr:resize`（HighDPI 重算，M2+）
 */
export class FrameScheduler {
  /** 待执行的任务映射，key → 最新一次注册的回调 */
  private pending = new Map<string, () => void>()
  /** 当前已申请但未执行的 RAF id，null 表示无待执行帧 */
  private rafId: number | null = null

  /** 入队（同 key 覆盖）。首个任务入队时启动 RAF。 */
  schedule(key: string, task: () => void): void {
    this.pending.set(key, task)
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => this.flush())
    }
  }

  /** 撤销待执行任务。Grid.destroy → Renderer.destroy 用它清理挂起的绘制。 */
  cancel(key: string): void {
    this.pending.delete(key)
  }

  /** RAF 回调：快照所有待执行任务后清空 pending，顺序执行 */
  private flush(): void {
    // 先快照再清空——避免 task 内部再次 schedule 导致死循环或被当前帧吞掉。
    const tasks = Array.from(this.pending.values())
    this.pending.clear()
    this.rafId = null
    for (const task of tasks) task()
  }
}

/**
 * 进程级单例。M1 里 Renderer 默认 new 一个独立实例（通过 RendererOptions.scheduler 注入），
 * 也可以使用这个全局单例让 scroll / renderer / resize 强制共用一个 RAF。
 */
export const frameScheduler = new FrameScheduler()
