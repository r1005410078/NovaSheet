export interface RawCell {
  rawRow: number
  rawCol: number
}

type TaskNode = {
  rawRow: number
  rawCol: number
  version: number
  next: TaskNode | null
}

export interface ValidationSchedulerOptions {
  batchSize: number
  maxConcurrent: number
}

export class ValidationScheduler {
  private head: TaskNode | null = null
  private tail: TaskNode | null = null
  private taskMap = new Map<string, TaskNode>()
  private flushHandle: ReturnType<typeof setTimeout> | null = null
  private asyncPool = new Set<Promise<void>>()
  private destroyed = false

  constructor(
    private readonly validate: (rawRow: number, rawCol: number) => Promise<void>,
    private readonly scheduleRedraw: () => void,
    private readonly options: ValidationSchedulerOptions,
  ) {}

  push(cells: readonly RawCell[]): void {
    if (this.destroyed) return
    for (const { rawRow, rawCol } of cells) {
      const k = `${rawRow}:${rawCol}`
      const existing = this.taskMap.get(k)
      if (existing) {
        existing.version++
      } else {
        const node: TaskNode = { rawRow, rawCol, version: 0, next: null }
        this.taskMap.set(k, node)
        if (this.tail) this.tail.next = node
        else this.head = node
        this.tail = node
      }
    }
    this.scheduleFlush()
  }

  pushAll(allCells: readonly RawCell[]): void {
    if (this.destroyed) return
    this.head = null
    this.tail = null
    this.taskMap.clear()
    if (this.flushHandle !== null) {
      clearTimeout(this.flushHandle)
      this.flushHandle = null
    }
    if (allCells.length > 0) this.push(allCells)
  }

  destroy(): void {
    this.destroyed = true
    if (this.flushHandle !== null) {
      clearTimeout(this.flushHandle)
      this.flushHandle = null
    }
    this.head = null
    this.tail = null
    this.taskMap.clear()
  }

  private scheduleFlush(): void {
    if (this.flushHandle !== null || this.destroyed) return
    this.flushHandle = setTimeout(() => {
      this.flushHandle = null
      void this.flush()
    }, 0)
  }

  private async flush(): Promise<void> {
    if (this.destroyed) return
    let processed = 0

    while (this.head && processed < this.options.batchSize) {
      // Pool full: stop here; the .then() chain will continue when space frees up.
      if (this.asyncPool.size >= this.options.maxConcurrent) break

      const node = this.head
      this.head = node.next

      const k = `${node.rawRow}:${node.rawCol}`
      const canonical = this.taskMap.get(k)
      // Stale: superseded by newer push (version mismatch) or already processed.
      if (!canonical || canonical.version !== node.version) continue

      this.taskMap.delete(k)
      const { rawRow, rawCol } = node
      const p: Promise<void> = this.validate(rawRow, rawCol).then(() => {
        this.asyncPool.delete(p)
        if (!this.destroyed && this.asyncPool.size === 0) {
          // Redraw once per batch drain (not once per cell) to avoid RAF spam.
          this.scheduleRedraw()
          // For sync validators this becomes a microtask chain with no setTimeout overhead.
          // For async validators the pool drains when the last concurrent task finishes.
          if (this.head) void this.flush()
        }
      })
      this.asyncPool.add(p)
      processed++
    }

    if (!this.head) this.tail = null
  }
}
