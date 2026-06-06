/**
 * ChunkedAxis——行轴 / 列轴共用的尺寸-偏移算法核心（spec §4）。
 *
 * 它用来解决的问题：
 *   - Renderer 要画第 N 行 / 第 M 列时，需要快速知道它的 x/y 位置和宽高。
 *   - 滚动到某个像素位置时，需要快速反查“这个位置落在哪一行/哪一列”。
 *   - 1,000,000+ 行不能为每一行都维护昂贵的完整偏移表，同时还要支持单行/单列改尺寸。
 *
 * 换句话说，ChunkedAxis 是一根“绘制坐标索引器”：
 *
 * ```
 * 行轴：rowIndex <-> y position, rowHeight
 * 列轴：colIndex <-> x position, colWidth
 * ```
 *
 * Renderer / FrozenRegions / Viewport 不自己计算行列坐标，而是统一问 ChunkedAxis。
 *
 * 设计动机：1,000,000+ 行的偏移数组若每行单独存储，仅 Float64 累计就要 8MB 且不利于
 * 局部失效。CHUNKED 设计把项切成长度 = `CHUNK_SIZE` 的 chunk，整 chunk 未偏离默认值时
 * `sizes = null`（O(1) 存储），任何一项偏离才懒分配 Float32Array(CHUNK_SIZE)。
 *
 * 核心操作复杂度（n = 1M，n_chunks ≈ 977）：
 *   - indexToPosition / getSize / positionToIndex：默认 chunk 走 O(1) 快路径，
 *     非默认 chunk 在 chunk 内累加，最坏 O(CHUNK_SIZE)，受 SIMD-友好的 Float32Array 加持
 *     单次 < 1μs
 *   - setSize：单 chunk 内更新 + O(n_chunks) 维护 chunkPrefixSum，~3μs（写 977 个 Float64）
 *   - getVisibleRange：两次 positionToIndex（半开区间在调用方处理，spec §6.4）
 *
 * 关键不变量（破坏 = 渲染崩）：
 *   - `chunkPrefixSum[i]` = chunks[0..i) 的尺寸总和；长度 = chunks.length + 1
 *   - `chunk.length` 是该 chunk 实际行数（末块可能 < CHUNK_SIZE）；迭代 `chunk.sizes` 必须
 *     用 `chunk.length`，不能用 `chunk.sizes.length`（M1 hardening 修复，CLAUDE.md 不变量 #7）
 *   - `getSize(index)` 是边界正确的尺寸访问器；不要用 `indexToPosition(i+1) - indexToPosition(i)`
 *     在 `i = count - 1` 时会因 clamp 返回 0
 *
 * version 字段：每次 mutate 自增，Viewport.snapshot 据此判脏；Renderer 不直接读 axis。
 */

import { upperBound } from '../util/BinarySearch'
import { type Chunk, createDefaultChunk } from '../util/ChunkArray'

/**
 * 单 chunk 容量。按 CHUNK_SIZE 把行/列切块：未被修改过的 chunk 维持 sizes = null（O(1) 内存），
 * 一旦有一项偏离 defaultSize 才懒分配 Float32Array(CHUNK_SIZE)。1M 行下 ≈ 977 chunks，
 * chunkPrefixSum 占用 977 × 8 字节 ≈ 8KB 基线。
 */
export const CHUNK_SIZE = 1024

/** 单 chunk 超过此长度触发分裂，避免块内线性扫退化二分收益。 */
const SPLIT_THRESHOLD = CHUNK_SIZE * 2
/** 相邻两 chunk 长度之和不超过此值时合并，避免删除后碎片化。 */
const MERGE_THRESHOLD = CHUNK_SIZE

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
 * 使用者把它当成一根可查询的“尺子”：
 * - `indexToPosition(index)`：第 N 行/列从哪个像素开始？
 * - `positionToIndex(position)`：这个像素位置落在哪一行/列？
 * - `getVisibleRange(start, end)`：当前 viewport 覆盖哪些行/列？
 * - `getSize(index)` / `setSize(index, size)`：读取或修改单项尺寸。
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
 *
 * @example
 * ```ts
 * // 10 行，每行默认 28px。
 * const rows = new ChunkedAxis({ count: 10, defaultSize: 28 })
 *
 * rows.indexToPosition(0) // 0：第 0 行顶部
 * rows.indexToPosition(3) // 84：第 3 行顶部 = 3 * 28
 * rows.positionToIndex(90) // 3：y=90px 落在第 3 行内
 * rows.getVisibleRange(56, 140) // [2, 5]：可见区域覆盖第 2~5 行
 *
 * // 单独把第 3 行改成 56px。只有命中的 chunk 会被懒物化。
 * rows.setSize(3, 56)
 * rows.getSize(3) // 56
 * rows.indexToPosition(4) // 140：第 4 行顶部会跟着后移
 * ```
 */

/**
 * Read-only axis contract — what painters / engine consumers need.
 *
 * Implementations: `ChunkedAxis` (default, this file). Future implementations
 * (e.g. small-dataset flat array) implement the same interface. Mutation
 * capability is on `MutableAxis` so consumers that only read can't mutate.
 */
export interface Axis {
  readonly version: number
  getTotalSize(): number
  getCount(): number
  getDefaultSize(): number
  getSize(index: number): number
  indexToPosition(index: number): number
  positionToIndex(position: number): number
  getVisibleRange(startPos: number, endPos: number): [number, number]
}

/**
 * Mutable axis — for engine state holders. Painters should depend on `Axis`,
 * not `MutableAxis`, so they can't accidentally mutate during render.
 */
export interface MutableAxis extends Axis {
  setSize(index: number, size: number): void
  setDefaultSize(size: number): void
}

export class ChunkedAxis {
  /** 未显式设置时的默认行高/列宽 */
  private defaultSize: number
  /** 行/列总数 */
  private count: number
  /** 分块数组，每块最多 CHUNK_SIZE 个条目 */
  private chunks: Chunk[] = []
  /** chunkPrefixSum[i] = chunks[0..i) 的 totalSize 之和；长度 = chunks.length + 1 */
  private chunkPrefixSum!: Float64Array
  /** chunkCountPrefix[i] = chunks[0..i) 的项数累计；长度 = chunks.length + 1，[0]=0，[last]=count */
  private chunkCountPrefix!: Float64Array
  /** 所有行/列的总像素尺寸 */
  private totalSize = 0
  /** 每次 mutate 自增；Viewport.snapshot 把它作为 Renderer 的 invalidate 缓存键 */
  private _version = 0

  /**
   * 创建一根行轴或列轴：本质上是一把“index ↔ 像素位置”的尺子。
   *
   * 行轴示意（纵向）：
   *
   * ```
   * y=0    ┌──────── row 0, height 28
   * y=28   ├──────── row 1, height 28
   * y=56   ├──────── row 2, height 28
   * y=84   ├──────── row 3, height 56  ← setSize(3, 56)
   * y=140  ├──────── row 4, height 28
   *        └──────── ...
   *
   * indexToPosition(3) = 84
   * positionToIndex(90) = 3
   * ```
   *
   * 列轴是同一个模型，只是方向从 y/height 换成 x/width。
   *
   * @example
   * ```ts
   * const rows = new ChunkedAxis({ count: 1_000_000, defaultSize: 28 })
   * const cols = new ChunkedAxis({ count: 500, defaultSize: 120 })
   * ```
   */
  constructor(opts: ChunkedAxisOptions) {
    this.defaultSize = opts.defaultSize
    this.count = opts.count
    this.rebuild()
  }

  /**
   * 轴版本号，每次尺寸变更时递增。
   *
   * @example
   * ```ts
   * const rows = new ChunkedAxis({ count: 10, defaultSize: 28 })
   * const before = rows.version
   * rows.setSize(3, 56)
   * rows.version > before // true
   * ```
   */
  get version(): number {
    return this._version
  }

  /**
   * 所有行/列的总像素尺寸。
   *
   * @example
   * ```ts
   * const rows = new ChunkedAxis({ count: 10, defaultSize: 28 })
   * rows.getTotalSize() // 280
   * ```
   */
  getTotalSize(): number {
    return this.totalSize
  }

  /**
   * 行/列总数。
   *
   * @example
   * ```ts
   * const cols = new ChunkedAxis({ count: 20, defaultSize: 120 })
   * cols.getCount() // 20
   * ```
   */
  getCount(): number {
    return this.count
  }

  /**
   * 当前分块数量。
   *
   * @example
   * ```ts
   * const rows = new ChunkedAxis({ count: 2050, defaultSize: 28 })
   * rows.getChunkCount() // 3，因为 CHUNK_SIZE 是 1024
   * ```
   */
  getChunkCount(): number {
    return this.chunks.length
  }

  /** 重算 chunkCountPrefix / chunkPrefixSum / totalSize（O(n_chunks)），结构变更后调用。 */
  private recomputePrefixes(): void {
    const n = this.chunks.length
    this.chunkCountPrefix = new Float64Array(n + 1)
    this.chunkPrefixSum = new Float64Array(n + 1)
    for (let i = 0; i < n; i++) {
      const chunk = this.chunks[i]!
      this.chunkCountPrefix[i + 1] = this.chunkCountPrefix[i]! + chunk.length
      this.chunkPrefixSum[i + 1] = this.chunkPrefixSum[i]! + chunk.totalSize
    }
    this.totalSize = n === 0 ? 0 : this.chunkPrefixSum[n]!
  }

  /** 二分 chunkCountPrefix 定位全局 index 所在 chunk 与块内偏移（O(log n_chunks)）。 */
  private indexToChunk(index: number): { chunkIdx: number; offset: number } {
    const chunkIdx = upperBound(this.chunkCountPrefix, this.chunks.length + 1, index) - 1
    return { chunkIdx, offset: index - this.chunkCountPrefix[chunkIdx]! }
  }

  private makeChunk(length: number, size: number): Chunk {
    if (size === this.defaultSize) return { length, totalSize: length * size, sizes: null }
    const sizes = new Float32Array(length)
    sizes.fill(size)
    return { length, totalSize: length * size, sizes }
  }

  /** 在 chunk 的 offset 处插入 count 个 size 项（就地改 chunk）。 */
  private insertIntoChunk(chunk: Chunk, offset: number, count: number, size: number): void {
    if (chunk.sizes === null && size === this.defaultSize) {
      chunk.length += count
      chunk.totalSize += count * size
      return
    }
    const oldLen = chunk.length
    const next = new Float32Array(oldLen + count)
    if (chunk.sizes === null) {
      next.fill(this.defaultSize)
      for (let i = 0; i < count; i++) next[offset + i] = size
    } else {
      for (let i = 0; i < offset; i++) next[i] = chunk.sizes[i]!
      for (let i = 0; i < count; i++) next[offset + i] = size
      for (let i = offset; i < oldLen; i++) next[i + count] = chunk.sizes[i]!
    }
    chunk.sizes = next
    chunk.length = oldLen + count
    chunk.totalSize += count * size
  }

  /** 从 chunk 移除给定块内偏移集合（就地改 chunk）。 */
  private removeFromChunk(chunk: Chunk, offsets: readonly number[]): void {
    const remove = new Set(offsets)
    const keepLen = chunk.length - remove.size
    if (chunk.sizes === null) {
      chunk.length = keepLen
      chunk.totalSize = keepLen * this.defaultSize
      return
    }
    const sizes = new Float32Array(keepLen)
    let w = 0
    let total = 0
    let nonDefault = 0
    for (let i = 0; i < chunk.length; i++) {
      if (remove.has(i)) continue
      const v = chunk.sizes[i]!
      sizes[w++] = v
      total += v
      if (v !== this.defaultSize) nonDefault++
    }
    // 删除后若残留项全部等于 defaultSize，回退到 null-sizes 以复原 O(1) 内存快路径
    // （维持不变量：chunk.sizes 非空 iff 块内至少一项 !== defaultSize）。
    chunk.sizes = nonDefault === 0 ? null : sizes
    chunk.length = keepLen
    chunk.totalSize = total
  }

  /** 返回 chunk[from, length) 的新 chunk。 */
  private sliceChunk(chunk: Chunk, from: number): Chunk {
    const len = chunk.length - from
    if (chunk.sizes === null) return { length: len, totalSize: len * this.defaultSize, sizes: null }
    const sizes = chunk.sizes.slice(from, chunk.length)
    let total = 0
    for (let i = 0; i < sizes.length; i++) total += sizes[i]!
    return { length: len, totalSize: total, sizes }
  }

  /** 把 chunk 截断到 [0, to)（就地）。 */
  private truncateChunk(chunk: Chunk, to: number): void {
    if (chunk.sizes === null) {
      chunk.length = to
      chunk.totalSize = to * this.defaultSize
      return
    }
    const sizes = chunk.sizes.slice(0, to)
    let total = 0
    for (let i = 0; i < to; i++) total += sizes[i]!
    chunk.sizes = sizes
    chunk.length = to
    chunk.totalSize = total
  }

  private mergeChunks(a: Chunk, b: Chunk): Chunk {
    const length = a.length + b.length
    if (a.sizes === null && b.sizes === null) {
      return { length, totalSize: length * this.defaultSize, sizes: null }
    }
    const sizes = new Float32Array(length)
    let nonDefault = 0
    for (let i = 0; i < a.length; i++) {
      const v = a.sizes ? a.sizes[i]! : this.defaultSize
      sizes[i] = v
      if (v !== this.defaultSize) nonDefault++
    }
    for (let i = 0; i < b.length; i++) {
      const v = b.sizes ? b.sizes[i]! : this.defaultSize
      sizes[a.length + i] = v
      if (v !== this.defaultSize) nonDefault++
    }
    // 合并结果若全部等于 defaultSize，丢弃物化数组回退 null-sizes（复原 O(1) 内存不变量）；
    // 全默认时 a.totalSize + b.totalSize === length * defaultSize。
    if (nonDefault === 0) return { length, totalSize: length * this.defaultSize, sizes: null }
    return { length, totalSize: a.totalSize + b.totalSize, sizes }
  }

  /** 单遍把过大 chunk 切成 ≤ CHUNK_SIZE 的左块 + 余块（余块由后续迭代继续切）。 */
  private splitOversizedChunks(): void {
    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i]!
      if (chunk.length > SPLIT_THRESHOLD) {
        const right = this.sliceChunk(chunk, CHUNK_SIZE)
        this.truncateChunk(chunk, CHUNK_SIZE)
        this.chunks.splice(i + 1, 0, right)
      }
    }
  }

  /** 单遍贪心合并相邻小块。 */
  private mergeSmallChunks(): void {
    let i = 0
    while (i < this.chunks.length - 1) {
      const a = this.chunks[i]!
      const b = this.chunks[i + 1]!
      if (a.length + b.length <= MERGE_THRESHOLD) {
        this.chunks[i] = this.mergeChunks(a, b)
        this.chunks.splice(i + 1, 1)
      } else {
        i++
      }
    }
  }

  /**
   * 返回当前默认行高/列宽。
   *
   * @example
   * ```ts
   * const rows = new ChunkedAxis({ count: 10, defaultSize: 28 })
   * rows.getDefaultSize() // 28
   * ```
   */
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
   *
   * @example
   * ```ts
   * const rows = new ChunkedAxis({ count: 10, defaultSize: 28 })
   * rows.getSize(3) // 28
   * rows.setSize(3, 56)
   * rows.getSize(3) // 56
   * rows.getSize(99) // 0，越界安全返回
   * ```
   */
  getSize(index: number): number {
    if (index < 0 || index >= this.count) return 0
    const { chunkIdx, offset } = this.indexToChunk(index)
    const chunk = this.chunks[chunkIdx]!
    if (chunk.sizes === null) return this.defaultSize
    return chunk.sizes[offset]!
  }

  /**
   * 返回 `index` 项左/上边界的像素位置。越界 clamp 到 [0, count - 1]。
   * 默认 chunk 走 O(1) 快路径；已物化 chunk 块内最多遍历 CHUNK_SIZE 项。
   *
   * @example
   * ```ts
   * const rows = new ChunkedAxis({ count: 10, defaultSize: 28 })
   * rows.indexToPosition(0) // 0
   * rows.indexToPosition(3) // 84
   * ```
   */
  indexToPosition(index: number): number {
    if (this.count === 0) return 0
    const clamped = Math.max(0, Math.min(this.count - 1, index))
    const { chunkIdx, offset } = this.indexToChunk(clamped)
    const base = this.chunkPrefixSum[chunkIdx]!
    const chunk = this.chunks[chunkIdx]!
    if (chunk.sizes === null) {
      // 整 chunk 都是默认尺寸：跳过逐项累加。
      return base + offset * this.defaultSize
    }
    let sum = 0
    for (let i = 0; i < offset; i++) sum += chunk.sizes[i]!
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
   *
   * @example
   * ```ts
   * const rows = new ChunkedAxis({ count: 10, defaultSize: 28 })
   * rows.positionToIndex(0) // 0
   * rows.positionToIndex(27) // 0
   * rows.positionToIndex(28) // 1
   * rows.positionToIndex(90) // 3
   * ```
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
    const baseIndex = this.chunkCountPrefix[chunkIdx]!
    if (chunk.sizes === null) {
      const inner = Math.min(chunk.length - 1, Math.floor(yInChunk / this.defaultSize))
      return Math.min(this.count - 1, baseIndex + inner)
    }
    // 用 chunk.length（而非 chunk.sizes.length）遍历——Float32Array 统一按 CHUNK_SIZE 分配，
    // 末尾 partial chunk 只填充前 length 项，剩余为零填充必须跳过。
    let acc = 0
    for (let i = 0; i < chunk.length; i++) {
      acc += chunk.sizes[i]!
      if (acc > yInChunk) {
        return Math.min(this.count - 1, baseIndex + i)
      }
    }
    return Math.min(this.count - 1, baseIndex + chunk.length - 1)
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
   *
   * @example
   * ```ts
   * const rows = new ChunkedAxis({ count: 10, defaultSize: 28 })
   * rows.setSize(3, 56)
   * rows.getSize(3) // 56
   * rows.indexToPosition(4) // 140，第 4 行被第 3 行加高后向后推
   * ```
   */
  setSize(index: number, size: number): void {
    if (index < 0 || index >= this.count) return
    const { chunkIdx, offset } = this.indexToChunk(index)
    const chunk = this.chunks[chunkIdx]!

    if (chunk.sizes === null) {
      // 新值就等于默认值，没必要物化整 chunk。
      if (size === this.defaultSize) return
      // 按 chunk.length 分配，而非恒 CHUNK_SIZE——为变长 chunk 做好准备。
      const sizes = new Float32Array(chunk.length)
      sizes.fill(this.defaultSize)
      chunk.sizes = sizes
    }

    const old = chunk.sizes[offset]!
    const delta = size - old
    if (delta === 0) return
    chunk.sizes[offset] = size
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
   *
   * @example
   * ```ts
   * const rows = new ChunkedAxis({ count: 10, defaultSize: 28 })
   * rows.getVisibleRange(56, 140) // [2, 5]
   *
   * const empty = new ChunkedAxis({ count: 0, defaultSize: 28 })
   * empty.getVisibleRange(0, 100) // [0, -1]
   * ```
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
   *
   * @example
   * ```ts
   * const rows = new ChunkedAxis({ count: 10, defaultSize: 28 })
   * rows.setSize(3, 56) // 真正 override，后续保持 56
   * rows.setDefaultSize(32)
   * rows.getDefaultSize() // 32
   * rows.getSize(0) // 32，默认行跟随新默认值
   * rows.getSize(3) // 56，override 保持原值
   * ```
   */
  setDefaultSize(newDefault: number): void {
    if (newDefault === this.defaultSize) return
    const oldDefault = this.defaultSize
    this.defaultSize = newDefault
    for (const chunk of this.chunks) {
      if (chunk.sizes === null) {
        chunk.totalSize = chunk.length * newDefault
      } else {
        let sum = 0
        for (let k = 0; k < chunk.length; k++) {
          if (chunk.sizes[k] === oldDefault) chunk.sizes[k] = newDefault
          sum += chunk.sizes[k]!
        }
        chunk.totalSize = sum
      }
    }
    this.recomputePrefixes()
    this._version++
  }

  /**
   * 在 `beforeIndex` 位置前插入 `count` 行/列，每项尺寸初始化为 `size`。
   *
   * 实现路径：定位插入点所在 chunk → 块内 splice 插入 → 过大 chunk 分裂 →
   * `recomputePrefixes()`。`size` 参数与 `this.defaultSize` 可以不同——块内物化
   * 时按 size 写入。Task 10（DefaultGridEngine）调用时通常传入
   * `theme.dimensions.rowHeight`，与 `this.defaultSize` 一致。
   *
   * `beforeIndex` clamp 到 `[0, this.count]`；`count <= 0` no-op。
   * 复杂度：O(n_chunks + 受影响 chunk 的项数总和)——插入点所在 chunk 需块内
   * 重建（O(chunk.length)），叠加 splitOversizedChunks / recomputePrefixes 的
   * O(n_chunks)。
   */
  insertRange(beforeIndex: number, count: number, size: number): void {
    if (count <= 0) return
    const oldCount = this.count
    const at = Math.max(0, Math.min(beforeIndex, oldCount))
    this.count = oldCount + count
    if (this.chunks.length === 0) {
      this.chunks = [this.makeChunk(count, size)]
    } else if (at === oldCount) {
      const last = this.chunks[this.chunks.length - 1]!
      this.insertIntoChunk(last, last.length, count, size)
    } else {
      const { chunkIdx, offset } = this.indexToChunk(at)
      this.insertIntoChunk(this.chunks[chunkIdx]!, offset, count, size)
    }
    this.splitOversizedChunks()
    this.recomputePrefixes()
    this._version++
  }

  /**
   * 删除 `removedSortedIndices` 指定的行/列。**约定**：调用方保证升序、无重复、
   * 所有索引落在 `[0, this.count)` 内。越界索引被静默跳过，不影响最终 count；不抛错。
   * 空数组 no-op。
   *
   * 实现路径：用插入前结构的 `indexToChunk` 把待删项按 chunk 分组收集块内 offset →
   * 逐块 `removeFromChunk` → filter 空块 → `mergeSmallChunks` → `recomputePrefixes`。
   * Task 10（DefaultGridEngine）传入的 `underlyingRowIds` 由
   * `InMemoryDataSource.deleteRows` 校验过升序，本方法不重复校验。
   * 复杂度：O(n_chunks + 受影响 chunk 的项数总和)——分散删除可触及多个 chunk，每个
   * removeFromChunk 是 O(chunk.length)，叠加 mergeSmallChunks / recomputePrefixes 的
   * O(n_chunks)。
   */
  deleteRange(removedSortedIndices: readonly number[]): void {
    if (removedSortedIndices.length === 0) return
    const byChunk = new Map<number, number[]>()
    for (const idx of removedSortedIndices) {
      if (idx < 0 || idx >= this.count) continue
      const { chunkIdx, offset } = this.indexToChunk(idx)
      const list = byChunk.get(chunkIdx)
      if (list) list.push(offset)
      else byChunk.set(chunkIdx, [offset])
    }
    let removedTotal = 0
    for (const [chunkIdx, offsets] of byChunk) {
      this.removeFromChunk(this.chunks[chunkIdx]!, offsets)
      removedTotal += offsets.length
    }
    this.count -= removedTotal
    this.chunks = this.chunks.filter((chunk) => chunk.length > 0)
    this.mergeSmallChunks()
    this.recomputePrefixes()
    this._version++
  }

  /**
   * 构造期初始化 chunks 与 chunkPrefixSum，仅在构造函数里调用一次。
   *
   * @example
   * ```ts
   * // 内部调用：new ChunkedAxis(...) -> rebuild()
   * // 结果是 chunks / chunkPrefixSum / totalSize 按 count 和 defaultSize 初始化完成。
   * ```
   */
  private rebuild(): void {
    const nChunks = Math.ceil(this.count / CHUNK_SIZE)
    this.chunks = Array.from({ length: nChunks })
    for (let i = 0; i < nChunks; i++) {
      const rowsInChunk = i === nChunks - 1 ? this.count - i * CHUNK_SIZE : CHUNK_SIZE
      this.chunks[i] = createDefaultChunk(rowsInChunk, this.defaultSize)
    }
    this.recomputePrefixes()
    this._version++
  }
}

// Compile-time assertion: ChunkedAxis must satisfy MutableAxis.
const _typecheck: MutableAxis = null as unknown as ChunkedAxis
void _typecheck
