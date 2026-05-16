import { upperBound } from '../util/BinarySearch'
import { type Chunk, createDefaultChunk } from '../util/ChunkArray'

/**
 * 单 chunk 容量。按 CHUNK_SIZE 把行/列切块：未被修改过的 chunk 维持 sizes = null（O(1) 内存），
 * 一旦有一项偏离 defaultSize 才懒分配 Float32Array(CHUNK_SIZE)。1M 行下 ≈ 977 chunks，
 * chunkPrefixSum 占用 977 × 8 字节 ≈ 8KB 基线。
 */
export const CHUNK_SIZE = 1024

/** ChunkedAxis 构造选项 */
export interface ChunkedAxisOptions {
  /** 行/列总数 */
  count: number
  /** 默认行高或列宽（px） */
  defaultSize: number
}

/**
 * 行 / 列轴的分块累计偏移索引——行轴与列轴共用同一实现。
 *
 * 为什么选「分块累加」而非 Fenwick/BIT 或扁平 prefix 数组：
 * - 内存基线 O(1)：只保留 chunk 级别的 prefix sum；per-item 数组按需分配。
 *   1M 行未做尺寸调整时只占 ~8KB。
 * - 查询 O(log n_chunks)：先二分 chunkPrefixSum 定位 chunk，再块内最多扫 CHUNK_SIZE 项。
 *   最坏 O(log n + 1024)，典型 O(log n)。
 * - 未来 M3/M4 的排序/筛选/插入可以只 invalidate 命中的 chunk，无需重建整轴；
 *   而 Fenwick/扁平 prefix 都需要全量重算。
 *
 * 不变量：
 * - chunks.length == ceil(count / CHUNK_SIZE)；count == 0 时为 0
 * - chunkPrefixSum.length == chunks.length + 1，prefixSum[0] == 0
 * - totalSize == chunkPrefixSum[chunks.length]
 * - chunk.sizes 非空 iff 该 chunk 内至少有一项被写成了 !== defaultSize 的值
 * - 即使 chunk.sizes 分配成 Float32Array(CHUNK_SIZE)，也只有前 chunk.length 项是有效数据；
 *   遍历用 chunk.length 而非 sizes.length，以跳过末尾 chunk 的零填充
 */
export class ChunkedAxis {
  /** 未显式设置时的默认行高/列宽 */
  private defaultSize: number
  /** 行/列总数 */
  private count: number
  /** 分块数组，每块最多 CHUNK_SIZE 个条目 */
  private chunks: Chunk[] = []
  /** chunkPrefixSum[i] = chunks[0..i) 的 totalSize 之和；长度 = chunks.length + 1 */
  private chunkPrefixSum!: Float64Array
  /** 所有行/列的总像素尺寸 */
  private totalSize = 0
  /** 每次 mutate 自增；Viewport.snapshot 把它作为 Renderer 的 invalidate 缓存键 */
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
   * 返回 `index` 处行/列的尺寸（宽或高）。
   *
   * 为什么单独有这个方法、而不是用 `indexToPosition(i + 1) - indexToPosition(i)`：
   * 在边界 `index === count - 1` 处，`indexToPosition(index + 1)` 会被 clamp 到 count - 1，
   * 导致差值为 0。任何需要单项尺寸的地方都应该走 getSize（painter 据此画末行/末列边界）。
   * 索引越界返回 0（不抛错——painter 可以安全调用）。
   */
  getSize(index: number): number {
    if (index < 0 || index >= this.count) return 0
    const chunkIdx = index >>> 10
    const offsetInChunk = index & 1023
    const chunk = this.chunks[chunkIdx]!
    if (chunk.sizes === null) return this.defaultSize
    return chunk.sizes[offsetInChunk]!
  }

  /**
   * 返回 `index` 项左/上边界的像素位置。越界 clamp 到 [0, count - 1]。
   * 默认 chunk 走 O(1) 快路径；已物化 chunk 块内最多遍历 CHUNK_SIZE 项。
   */
  indexToPosition(index: number): number {
    if (this.count === 0) return 0
    const clamped = Math.max(0, Math.min(this.count - 1, index))
    const chunkIdx = clamped >>> 10
    const offsetInChunk = clamped & 1023
    const base = this.chunkPrefixSum[chunkIdx]!
    const chunk = this.chunks[chunkIdx]!
    if (chunk.sizes === null) {
      // 整 chunk 都是默认尺寸：跳过逐项累加。
      return base + offsetInChunk * this.defaultSize
    }
    let sum = 0
    for (let i = 0; i < offsetInChunk; i++) sum += chunk.sizes[i]!
    return base + sum
  }

  /**
   * indexToPosition 的逆映射：像素 `position` 落在哪一项内。
   *
   * 语义上 `position` 包含（inclusive）：返回像素区间覆盖 position 的那一项。
   * 越界 clamp 到 [0, count - 1]。
   *
   * 两步搜索：先二分 chunk 级 prefixSum（O(log n_chunks)）定位 chunk；再按 chunk 类型
   * 直接计算块内偏移（默认 chunk）或块内累加（已物化 chunk，最坏 O(CHUNK_SIZE)）。
   */
  positionToIndex(position: number): number {
    if (this.count === 0) return 0
    if (position <= 0) return 0
    if (position >= this.totalSize) return this.count - 1
    // upperBound 返回最小的 i 使 prefixSum[i] > position；减 1 得到
    // prefixSum <= position 的 chunk 索引。
    const chunkIdx = upperBound(this.chunkPrefixSum, this.chunks.length + 1, position) - 1
    const chunk = this.chunks[chunkIdx]!
    const yInChunk = position - this.chunkPrefixSum[chunkIdx]!
    if (chunk.sizes === null) {
      const inner = Math.min(CHUNK_SIZE - 1, Math.floor(yInChunk / this.defaultSize))
      return Math.min(this.count - 1, chunkIdx * CHUNK_SIZE + inner)
    }
    // 用 chunk.length（而非 chunk.sizes.length）遍历——Float32Array 统一按 CHUNK_SIZE 分配，
    // 末尾 partial chunk 只填充前 length 项，剩余为零填充必须跳过。
    let acc = 0
    for (let i = 0; i < chunk.length; i++) {
      acc += chunk.sizes[i]!
      if (acc > yInChunk) {
        return Math.min(this.count - 1, chunkIdx * CHUNK_SIZE + i)
      }
    }
    return Math.min(this.count - 1, chunkIdx * CHUNK_SIZE + chunk.length - 1)
  }

  /**
   * 设置单项尺寸。首次偏离默认时懒分配 chunk 的 sizes 数组（成本：1 次 Float32Array(CHUNK_SIZE)
   * 分配 + 1 次 fill）。以下情况是无操作：
   *   1) 索引越界
   *   2) chunk 仍是默认状态，且新值就是 defaultSize
   *   3) 新值与旧值相同（delta === 0）
   *
   * 热点开销在尾部 chunk 的 prefix sum 增量传播：O(n_chunks) 次 Float64 写。
   * 1M 行 / 977 chunks 实测 ~3μs——交互拖拽 resize 完全无感。
   */
  setSize(index: number, size: number): void {
    if (index < 0 || index >= this.count) return
    const chunkIdx = index >>> 10
    const offsetInChunk = index & 1023
    const chunk = this.chunks[chunkIdx]!

    if (chunk.sizes === null) {
      // 新值就等于默认值，没必要物化整 chunk。
      if (size === this.defaultSize) return
      const rowsInChunk =
        chunkIdx === this.chunks.length - 1
          ? this.count - chunkIdx * CHUNK_SIZE
          : CHUNK_SIZE
      // 即使最后一个 partial chunk 也按 CHUNK_SIZE 分配——超出 rowsInChunk 的位置保持 0，
      // 通过 chunk.length 控制遍历范围。这样未来 count 扩张时不需要 reallocate。
      const sizes = new Float32Array(CHUNK_SIZE)
      for (let i = 0; i < rowsInChunk; i++) sizes[i] = this.defaultSize
      chunk.sizes = sizes
    }

    const old = chunk.sizes[offsetInChunk]!
    const delta = size - old
    if (delta === 0) return
    chunk.sizes[offsetInChunk] = size
    chunk.totalSize += delta

    // 把 delta 向后传播到所有更高的 chunkPrefixSum。这是分块轴上等价于 Fenwick 的更新，
    // 但用固定 O(n_chunks) 的循环换更简单的代码（Fenwick 是 O(log n) 但需要二级结构）。
    for (let i = chunkIdx + 1; i <= this.chunks.length; i++) {
      this.chunkPrefixSum[i] = this.chunkPrefixSum[i]! + delta
    }
    this.totalSize += delta
    this._version++
  }

  /**
   * 返回与像素区间 [startPos, endPos] 相交的项索引区间（**两端均闭**）。
   * count === 0 时返回 [0, -1]——空区间哨兵，让调用方可以安全用 `for (i = range[0]; i <= range[1]; i++)`
   * 而不会执行。
   */
  getVisibleRange(startPos: number, endPos: number): [number, number] {
    if (this.count === 0) return [0, -1]
    const first = this.positionToIndex(startPos)
    const last = this.positionToIndex(endPos)
    return [first, last]
  }

  /**
   * 修改默认尺寸并重算所有 chunk。Per-item override 的处理规则：
   * - 显式被改成 == oldDefault 的项视为「跟随默认」，自动提升到 newDefault
   * - 真正 override 的项（!= oldDefault）保持原值
   * 这条路径就是 `setTheme` 在用户没固定 defaultRowHeight 时走的逻辑。
   */
  setDefaultSize(newDefault: number): void {
    if (newDefault === this.defaultSize) return
    const oldDefault = this.defaultSize
    this.defaultSize = newDefault
    // 重算每个 chunk 的 totalSize 与全局 prefix-sum 表。
    this.totalSize = 0
    this.chunkPrefixSum = new Float64Array(this.chunks.length + 1)
    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i]!
      if (chunk.sizes === null) {
        const rowsInChunk =
          i === this.chunks.length - 1 ? this.count - i * CHUNK_SIZE : CHUNK_SIZE
        chunk.totalSize = rowsInChunk * newDefault
      } else {
        // 遍历 chunk.length（避免末尾填充零）；把等于 oldDefault 的项提升到 newDefault。
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

  /** 构造期初始化 chunks 与 chunkPrefixSum，仅在构造函数里调用一次。 */
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
