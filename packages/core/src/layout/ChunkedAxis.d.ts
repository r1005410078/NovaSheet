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
/**
 * 单 chunk 容量。按 CHUNK_SIZE 把行/列切块：未被修改过的 chunk 维持 sizes = null（O(1) 内存），
 * 一旦有一项偏离 defaultSize 才懒分配 Float32Array(CHUNK_SIZE)。1M 行下 ≈ 977 chunks，
 * chunkPrefixSum 占用 977 × 8 字节 ≈ 8KB 基线。
 */
export declare const CHUNK_SIZE = 1024;
/** ChunkedAxis 构造选项 */
export interface ChunkedAxisOptions {
    /** 行/列总数 */
    count: number;
    /** 默认行高或列宽（px） */
    defaultSize: number;
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
    readonly version: number;
    getTotalSize(): number;
    getCount(): number;
    getDefaultSize(): number;
    getSize(index: number): number;
    indexToPosition(index: number): number;
    positionToIndex(position: number): number;
    getVisibleRange(startPos: number, endPos: number): [number, number];
}
/**
 * Mutable axis — for engine state holders. Painters should depend on `Axis`,
 * not `MutableAxis`, so they can't accidentally mutate during render.
 */
export interface MutableAxis extends Axis {
    setSize(index: number, size: number): void;
    setDefaultSize(size: number): void;
}
export declare class ChunkedAxis {
    /** 未显式设置时的默认行高/列宽 */
    private defaultSize;
    /** 行/列总数 */
    private count;
    /** 分块数组，每块最多 CHUNK_SIZE 个条目 */
    private chunks;
    /** chunkPrefixSum[i] = chunks[0..i) 的 totalSize 之和；长度 = chunks.length + 1 */
    private chunkPrefixSum;
    /** 所有行/列的总像素尺寸 */
    private totalSize;
    /** 每次 mutate 自增；Viewport.snapshot 把它作为 Renderer 的 invalidate 缓存键 */
    private _version;
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
    constructor(opts: ChunkedAxisOptions);
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
    get version(): number;
    /**
     * 所有行/列的总像素尺寸。
     *
     * @example
     * ```ts
     * const rows = new ChunkedAxis({ count: 10, defaultSize: 28 })
     * rows.getTotalSize() // 280
     * ```
     */
    getTotalSize(): number;
    /**
     * 行/列总数。
     *
     * @example
     * ```ts
     * const cols = new ChunkedAxis({ count: 20, defaultSize: 120 })
     * cols.getCount() // 20
     * ```
     */
    getCount(): number;
    /**
     * 当前分块数量。
     *
     * @example
     * ```ts
     * const rows = new ChunkedAxis({ count: 2050, defaultSize: 28 })
     * rows.getChunkCount() // 3，因为 CHUNK_SIZE 是 1024
     * ```
     */
    getChunkCount(): number;
    /**
     * 返回当前默认行高/列宽。
     *
     * @example
     * ```ts
     * const rows = new ChunkedAxis({ count: 10, defaultSize: 28 })
     * rows.getDefaultSize() // 28
     * ```
     */
    getDefaultSize(): number;
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
    getSize(index: number): number;
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
    indexToPosition(index: number): number;
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
    positionToIndex(position: number): number;
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
    setSize(index: number, size: number): void;
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
    getVisibleRange(startPos: number, endPos: number): [number, number];
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
    setDefaultSize(newDefault: number): void;
    /**
     * 构造期初始化 chunks 与 chunkPrefixSum，仅在构造函数里调用一次。
     *
     * @example
     * ```ts
     * // 内部调用：new ChunkedAxis(...) -> rebuild()
     * // 结果是 chunks / chunkPrefixSum / totalSize 按 count 和 defaultSize 初始化完成。
     * ```
     */
    private rebuild;
}
//# sourceMappingURL=ChunkedAxis.d.ts.map