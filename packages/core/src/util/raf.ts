export class FrameScheduler {
  private pending = new Map<string, () => void>()
  private rafId: number | null = null

  schedule(key: string, task: () => void): void {
    this.pending.set(key, task)
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => this.flush())
    }
  }

  cancel(key: string): void {
    this.pending.delete(key)
  }

  private flush(): void {
    const tasks = Array.from(this.pending.values())
    this.pending.clear()
    this.rafId = null
    for (const task of tasks) task()
  }
}

export const frameScheduler = new FrameScheduler()
