import type { CellValue } from '../Schema'

interface CachedBlock {
  rowSpan: number
  colSpan: number
  values: (CellValue | undefined)[]
  freshAtMs: number
  stale: boolean
}

export interface BlockCacheOptions {
  readonly maxCachedBlocks: number
}

export interface SetBlockParams {
  readonly rowSpan: number
  readonly colSpan: number
  readonly values: (CellValue | undefined)[]
  readonly nowMs: number
}

/** 二维缓存块存储；Map 迭代顺序 = 插入顺序，充当 LRU 队列（触达即重插到末尾）。 */
export class BlockCache {
  private readonly blocks = new Map<string, CachedBlock>()

  constructor(private readonly options: BlockCacheOptions) {}

  has(key: string): boolean {
    return this.blocks.has(key)
  }

  isStale(key: string): boolean {
    return this.blocks.get(key)?.stale ?? false
  }

  getFreshAt(key: string): number | undefined {
    return this.blocks.get(key)?.freshAtMs
  }

  get(key: string, localRow: number, localCol: number): CellValue | undefined {
    const block = this.blocks.get(key)
    if (!block) return undefined
    this.touch(key)
    return block.values[localRow * block.colSpan + localCol]
  }

  set(key: string, params: SetBlockParams): void {
    this.blocks.delete(key)
    this.blocks.set(key, {
      rowSpan: params.rowSpan,
      colSpan: params.colSpan,
      values: params.values,
      freshAtMs: params.nowMs,
      stale: false,
    })
  }

  setCell(key: string, localRow: number, localCol: number, value: CellValue): void {
    const block = this.blocks.get(key)
    if (!block) return
    block.values[localRow * block.colSpan + localCol] = value
    this.touch(key)
  }

  touch(key: string): void {
    const block = this.blocks.get(key)
    if (!block) return
    this.blocks.delete(key)
    this.blocks.set(key, block)
  }

  refreshFreshness(key: string, nowMs: number): void {
    const block = this.blocks.get(key)
    if (block) block.freshAtMs = nowMs
  }

  markAllStale(): void {
    for (const block of this.blocks.values()) block.stale = true
  }

  delete(key: string): void {
    this.blocks.delete(key)
  }

  clear(): void {
    this.blocks.clear()
  }

  /** 超上限时淘汰最久未访问块（Map 前部），跳过 protectedKeys。 */
  evictExcess(protectedKeys: ReadonlySet<string>): void {
    if (this.blocks.size <= this.options.maxCachedBlocks) return
    for (const key of this.blocks.keys()) {
      if (this.blocks.size <= this.options.maxCachedBlocks) break
      if (protectedKeys.has(key)) continue
      this.blocks.delete(key)
    }
  }
}
