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
    let node = this.head

    while (node && processed < this.options.batchSize) {
      const k = `${node.rawRow}:${node.rawCol}`
      const canonical = this.taskMap.get(k)

      if (canonical && canonical.version === node.version) {
        this.taskMap.delete(k)
        const { rawRow, rawCol } = node

        if (this.asyncPool.size < this.options.maxConcurrent) {
          const p: Promise<void> = this.validate(rawRow, rawCol).then(() => {
            this.asyncPool.delete(p)
            if (!this.destroyed) this.scheduleRedraw()
          })
          this.asyncPool.add(p)
        } else {
          // Pool full: re-queue
          const requeue: TaskNode = { rawRow, rawCol, version: 0, next: null }
          this.taskMap.set(k, requeue)
          if (this.tail) this.tail.next = requeue
          else this.head = requeue
          this.tail = requeue
        }
        processed++
      }

      node = node.next
    }

    this.head = node
    if (!node) this.tail = null

    if (this.head && !this.destroyed) this.scheduleFlush()
  }
}
