/**
 * 帧调度器：将多个命名任务合并到同一个 RAF 回调中执行，避免单帧内多次 paint。
 * 同一 key 重复 schedule 时后者覆盖前者（幂等写入）。
 */
export class FrameScheduler {
  /** 待执行的任务映射，key → 最新一次注册的回调 */
  private pending = new Map<string, () => void>()
  /** 当前已申请但未执行的 RAF id，null 表示无待执行帧 */
  private rafId: number | null = null

  /** 注册（或覆盖）一个命名任务，若尚无待执行 RAF 则申请一帧 */
  schedule(key: string, task: () => void): void {
    this.pending.set(key, task)
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => this.flush())
    }
  }

  /** 取消指定 key 的待执行任务（不影响同帧内其他任务） */
  cancel(key: string): void {
    this.pending.delete(key)
  }

  /** RAF 回调：快照所有待执行任务后清空 pending，顺序执行 */
  private flush(): void {
    const tasks = Array.from(this.pending.values())
    this.pending.clear()
    this.rafId = null
    for (const task of tasks) task()
  }
}

export const frameScheduler = new FrameScheduler()
