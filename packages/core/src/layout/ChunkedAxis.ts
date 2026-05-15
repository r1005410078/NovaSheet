import { upperBound } from '../util/BinarySearch'
import { type Chunk, createDefaultChunk } from '../util/ChunkArray'

/** 每个分块包含的行/列数量，固定为 1024 */
export const CHUNK_SIZE = 1024

/** ChunkedAxis 构造选项 */
export interface ChunkedAxisOptions {
  /** 行/列总数 */
  count: number
  /** 默认行高或列宽（px） */
  defaultSize: number
}

/**
 * 分块轴：以 CHUNK_SIZE 为单位管理行高/列宽，支持 O(1) 前缀和查询与局部写入。
 * 未显式设置尺寸的行/列共用 defaultSize（chunk.sizes === null），零内存开销。
 */
export class ChunkedAxis {
  /** 未显式设置时的默认行高/列宽 */
  private defaultSize: number
  /** 行/列总数 */
  private count: number
  /** 分块数组，每块最多 CHUNK_SIZE 个条目 */
  private chunks: Chunk[] = []
  /** chunkPrefixSum[i] = chunks[0..i) 的 totalSize 之和，长度为 chunks.length + 1 */
  private chunkPrefixSum!: Float64Array
  /** 所有行/列的总像素尺寸 */
  private totalSize = 0
  /** 每次写操作后递增，供 Viewport 检测轴数据变更 */
  private _version = 0

  constructor(opts: ChunkedAxisOptions) {
    this.defaultSize = opts.defaultSize
    this.count = opts.count
    this.rebuild()
  }

  /** 轴版本号，每次尺寸变更时递增 */
  get version(): number {
    return this._version
  }

  /** 所有行/列的总像素尺寸 */
  getTotalSize(): number {
    return this.totalSize
  }

  /** 行/列总数 */
  getCount(): number {
    return this.count
  }

  /** 当前分块数量 */
  getChunkCount(): number {
    return this.chunks.length
  }

  /** 返回当前默认行高/列宽 */
  getDefaultSize(): number {
    return this.defaultSize
  }

  /**
   * 返回 index 处行/列的像素尺寸。
   * 边界安全：getSize(count-1) 返回最后一行的真实高度，
   * 而非 indexToPosition(count) - indexToPosition(count-1) 在末尾因钳位返回 0 的错误结果。
   */
  getSize(index: number): number {
    if (index < 0 || index >= this.count) return 0
    const chunkIdx = index >>> 10
    const offsetInChunk = index & 1023
    const chunk = this.chunks[chunkIdx]!
    if (chunk.sizes === null) return this.defaultSize
    return chunk.sizes[offsetInChunk]!
  }

  /** 将行/列索引转换为其起始像素坐标（index 超出范围时钳位至边界） */
  indexToPosition(index: number): number {
    if (this.count === 0) return 0
    const clamped = Math.max(0, Math.min(this.count - 1, index))
    const chunkIdx = clamped >>> 10
    const offsetInChunk = clamped & 1023
    const base = this.chunkPrefixSum[chunkIdx]!
    const chunk = this.chunks[chunkIdx]!
    if (chunk.sizes === null) {
      return base + offsetInChunk * this.defaultSize
    }
    let sum = 0
    for (let i = 0; i < offsetInChunk; i++) sum += chunk.sizes[i]!
    return base + sum
  }

  /** 将像素坐标反查为对应的行/列索引（结果钳位至 [0, count-1]） */
  positionToIndex(position: number): number {
    if (this.count === 0) return 0
    if (position <= 0) return 0
    if (position >= this.totalSize) return this.count - 1
    const chunkIdx = upperBound(this.chunkPrefixSum, this.chunks.length + 1, position) - 1
    const chunk = this.chunks[chunkIdx]!
    const yInChunk = position - this.chunkPrefixSum[chunkIdx]!
    if (chunk.sizes === null) {
      const inner = Math.min(CHUNK_SIZE - 1, Math.floor(yInChunk / this.defaultSize))
      return Math.min(this.count - 1, chunkIdx * CHUNK_SIZE + inner)
    }
    let acc = 0
    for (let i = 0; i < chunk.length; i++) {
      acc += chunk.sizes[i]!
      if (acc > yInChunk) {
        return Math.min(this.count - 1, chunkIdx * CHUNK_SIZE + i)
      }
    }
    return Math.min(this.count - 1, chunkIdx * CHUNK_SIZE + chunk.length - 1)
  }

  /** 设置单个行/列的像素尺寸，增量更新前缀和，O(chunks) 时间 */
  setSize(index: number, size: number): void {
    if (index < 0 || index >= this.count) return
    const chunkIdx = index >>> 10
    const offsetInChunk = index & 1023
    const chunk = this.chunks[chunkIdx]!

    if (chunk.sizes === null) {
      if (size === this.defaultSize) return
      const rowsInChunk =
        chunkIdx === this.chunks.length - 1
          ? this.count - chunkIdx * CHUNK_SIZE
          : CHUNK_SIZE
      const sizes = new Float32Array(CHUNK_SIZE)
      for (let i = 0; i < rowsInChunk; i++) sizes[i] = this.defaultSize
      chunk.sizes = sizes
    }

    const old = chunk.sizes[offsetInChunk]!
    const delta = size - old
    if (delta === 0) return
    chunk.sizes[offsetInChunk] = size
    chunk.totalSize += delta

    for (let i = chunkIdx + 1; i <= this.chunks.length; i++) {
      this.chunkPrefixSum[i] = this.chunkPrefixSum[i]! + delta
    }
    this.totalSize += delta
    this._version++
  }

  /**
   * 根据像素区间 [startPos, endPos] 返回可见的 [首行索引, 末行索引]（均含）。
   * 空轴返回 [0, -1]（空范围）。
   */
  getVisibleRange(startPos: number, endPos: number): [number, number] {
    if (this.count === 0) return [0, -1]
    const first = this.positionToIndex(startPos)
    const last = this.positionToIndex(endPos)
    return [first, last]
  }

  /**
   * 更新默认尺寸：已显式设置且值等于旧默认值的行/列同步缩放；
   * 未设置（sizes === null）的块整体更新 totalSize，无需遍历每行。
   */
  setDefaultSize(newDefault: number): void {
    if (newDefault === this.defaultSize) return
    const oldDefault = this.defaultSize
    this.defaultSize = newDefault
    // 逐块重新计算前缀和
    this.totalSize = 0
    this.chunkPrefixSum = new Float64Array(this.chunks.length + 1)
    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i]!
      if (chunk.sizes === null) {
        const rowsInChunk =
          i === this.chunks.length - 1 ? this.count - i * CHUNK_SIZE : CHUNK_SIZE
        chunk.totalSize = rowsInChunk * newDefault
      } else {
        // 块有显式尺寸数组：仅将值等于旧默认值的条目同步为新默认值
        let sum = 0
        for (let k = 0; k < chunk.length; k++) {
          if (chunk.sizes[k] === oldDefault) chunk.sizes[k] = newDefault
          sum += chunk.sizes[k]!
        }
        chunk.totalSize = sum
      }
      this.chunkPrefixSum[i + 1] = this.chunkPrefixSum[i]! + chunk.totalSize
      this.totalSize += chunk.totalSize
    }
    this._version++
  }

  /** 从头重建分块数组与前缀和，构造时及 count/defaultSize 整体变更时调用 */
  private rebuild(): void {
    const nChunks = Math.ceil(this.count / CHUNK_SIZE)
    this.chunks = new Array(nChunks)
    this.chunkPrefixSum = new Float64Array(nChunks + 1)
    this.totalSize = 0
    for (let i = 0; i < nChunks; i++) {
      const rowsInChunk = i === nChunks - 1 ? this.count - i * CHUNK_SIZE : CHUNK_SIZE
      const chunk = createDefaultChunk(rowsInChunk, this.defaultSize)
      this.chunks[i] = chunk
      this.chunkPrefixSum[i + 1] = this.chunkPrefixSum[i]! + chunk.totalSize
      this.totalSize += chunk.totalSize
    }
    this._version++
  }
}
