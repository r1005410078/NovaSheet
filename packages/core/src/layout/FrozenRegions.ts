/**
 * FrozenRegions——把视口切分为 4 个象限：topLeft / topRight / bottomLeft / main（spec §4）。
 *
 * 它用来解决的问题：
 *   - Renderer 需要知道当前 viewport 内哪些行/列要画，以及它们应该画在画布哪个矩形里。
 *   - 后续冻结行/冻结列时，同一个 viewport 会被拆成多个独立绘制区：冻结区不跟随滚动，
 *     主区域跟随滚动。
 *   - Renderer 不应该到处写“冻结行列如何切分”的判断逻辑，而是统一问 FrozenRegions。
 *
 * 换句话说，FrozenRegions 是“viewport → 可绘制象限”的切分器：
 *
 * ```
 * 输入：viewport 尺寸 + scrollX/scrollY + headerHeight + frozenRows/frozenCols
 * 输出：main / topLeft / topRight / bottomLeft 的 rowRange、colRange、rect
 * ```
 *
 * 象限示意（viewport 内部，header 在内容区上方由 HeaderPainter 单独绘制）：
 *
 * ```
 *                    columns
 *              frozen      scrollable
 *            ┌───────────┬──────────────┐
 * frozen     │ topLeft   │ topRight     │
 * rows       │ 冻结行列   │ 冻结行       │
 *            ├───────────┼──────────────┤
 * scrollable │ bottomLeft│ main         │
 * rows       │ 冻结列     │ 主滚动区     │
 *            └───────────┴──────────────┘
 * ```
 *
 * 用户故事示例：
 *
 * 用户正在看一张员工表：
 *   - 第 1~2 行是表头/汇总信息，希望上下滚动时一直留在顶部。
 *   - A 列是员工姓名，希望左右滚动看后面字段时一直留在左侧。
 *
 * 于是 Grid 配置为 `frozenRows = 2`、`frozenCols = 1`。
 * 当用户滚动表格时，viewport 会被规划成下面 4 个绘制区：
 *
 * ```
 *                 列方向
 *             冻结列        可滚动列
 *             A             B C D E ...
 *         ┌───────────┬────────────────┐
 * 冻结行  │ topLeft   │ topRight        │
 * 1,2     │ A列+1/2行 │ 1/2行+B/C/D... │
 *         ├───────────┼────────────────┤
 * 可滚动行│ bottomLeft│ main            │
 * 3,4...  │ A列+3/4.. │ 普通滚动区域    │
 *         └───────────┴────────────────┘
 * ```
 *
 * 用户向下滚动：
 *   - `topLeft` 和 `topRight` 留在顶部，因为它们属于冻结行。
 *   - `bottomLeft` 和 `main` 跟着行内容上下滚。
 *
 * 用户向右滚动：
 *   - `topLeft` 和 `bottomLeft` 留在左侧，因为它们属于冻结列。
 *   - `topRight` 和 `main` 跟着列内容左右滚。
 *
 * 四个象限的直观含义：
 *   - `topLeft`：冻结行和冻结列的交叉区域，横向/纵向都不滚。
 *   - `topRight`：冻结行区域，纵向不滚，横向跟随列滚动。
 *   - `bottomLeft`：冻结列区域，横向不滚，纵向跟随行滚动。
 *   - `main`：普通内容区，横向/纵向都跟随滚动。
 *
 * **M1 实现是降级版**：永远只返回 `main` 一个象限（覆盖整个内容区，无冻结行列）。
 * topLeft / topRight / bottomLeft 字段在类型上保留为 optional，M3 落地真正的冻结时填充。
 *
 * 视口矩形按半开区间处理：xEnd / yEnd 减 1 后再传给 ChunkedAxis.getVisibleRange
 * （后者接收 inclusive 端点），避免恰好落在下一行/列起点的位置被错误包进可见集合。
 *
 * Renderer 通过 Viewport.snapshot() 取 quadrants，按 main → bottomLeft → topRight → topLeft
 * 顺序绘制（spec §5.3），冻结区在最上面。
 */

import type { ChunkedAxis } from './ChunkedAxis'

/** 画布坐标系中的矩形区域，单位为 CSS 像素 */
export interface QuadrantRect {
  /** canvas 坐标系，单位 CSS 像素 */
  x: number
  /** 上边界（canvas 坐标） */
  y: number
  /** 宽度 */
  width: number
  /** 高度 */
  height: number
}

/**
 * 单个象限：包含可见行列范围及对应的画布绘制矩形。
 *
 * `rowRange` / `colRange` 是“数据索引范围”，`rect` 是“画布上的位置”。
 *
 * 示例：行高 28px、列宽 120px，用户滚到 `scrollY = 560`、`scrollX = 240`：
 *
 * ```
 * 逻辑内容坐标：
 *
 * y=560 ── viewport top     -> row 20
 *        ┌──────────────────────────┐
 *        │ row 20                   │
 *        │ row 21                   │
 *        │ ...                      │
 * y=1127 ─ viewport bottom  -> row 40
 *        └──────────────────────────┘
 *
 * x=240 ── viewport left    -> col 2
 *        ┌── col 2 ─ col 3 ─ ... ─ col 8 ─┐
 * x=1039 ─ viewport right   -> col 8
 * ```
 *
 * 对应：
 *
 * ```ts
 * rowRange = [20, 40]
 * colRange = [2, 8]
 * rect = { x: 0, y: 32, width: 800, height: 568 }
 * ```
 */
export interface Quadrant {
  /**
   * 该象限内的行索引区间，两端均闭。
   *
   * @example
   * ```ts
   * // rowRange: [20, 40] 表示 Renderer 要画第 20~40 行，包括 20 和 40。
   * for (let row = rowRange[0]; row <= rowRange[1]; row++) {
   *   // paint row
   * }
   * ```
   */
  rowRange: [number, number]
  /**
   * 该象限内的列索引区间，两端均闭。
   *
   * @example
   * ```ts
   * // colRange: [2, 8] 表示 Renderer 要画第 2~8 列，包括 2 和 8。
   * for (let col = colRange[0]; col <= colRange[1]; col++) {
   *   // paint column
   * }
   * ```
   */
  colRange: [number, number]
  /** 该象限在画布上的绘制区域 */
  rect: QuadrantRect
}

/**
 * 4 个象限：
 * - main：滚动行 × 滚动列（M1 唯一的象限）
 * - topLeft：冻结行 × 冻结列（M3）
 * - topRight：冻结行 × 滚动列（M3）
 * - bottomLeft：滚动行 × 冻结列（M3）
 * 命名按 viewport 内的位置：top/bottom 描述行、left/right 描述列。
 */
export interface Quadrants {
  /** 主滚动区（非冻结内容区） */
  main: Quadrant
  /** 左上角冻结区（M3） */
  topLeft?: Quadrant
  /** 右上角冻结区（M3） */
  topRight?: Quadrant
  /** 左下角冻结区（M3） */
  bottomLeft?: Quadrant
}

/**
 * getQuadrants 所需的视口尺寸与滚动信息。
 *
 * `scrollX` / `scrollY` 是逻辑内容坐标，不是画布坐标：
 *
 * ```
 * content space:
 *
 * x=0     x=240 scrollX
 * │       │
 * │       ┌──────── viewport width 800 ────────┐
 * │       │                                     │
 * └───────┴─────────────────────────────────────┴──>
 *
 * y=0
 * │
 * │ y=560 scrollY
 * │ ┌──────── viewport content height ─────────┐
 * │ │                                          │
 * │ └──────────────────────────────────────────┘
 * v
 * ```
 *
 * `FrozenRegions` 会把这个逻辑 viewport 转换成 `rowRange` / `colRange`，
 * 再给 Renderer 用来遍历可见 cell。
 */
export interface ViewportRect {
  /** 视口宽度（CSS px） */
  width: number
  /** 视口高度（CSS px） */
  height: number
  /**
   * 水平滚动偏移（px），表示 viewport 左边缘在内容坐标系中的 x。
   *
   * @example
   * ```ts
   * // 列宽默认 120px 时，scrollX = 240 表示 viewport 从第 2 列附近开始。
   * const colRange = colsAxis.getVisibleRange(240, 240 + 800 - 1) // [2, 8]
   * ```
   */
  scrollX: number
  /**
   * 垂直滚动偏移（px），表示内容区顶部在内容坐标系中的 y。
   *
   * @example
   * ```ts
   * // 行高默认 28px 时，scrollY = 560 表示 viewport 从第 20 行附近开始。
   * const rowRange = rowsAxis.getVisibleRange(560, 560 + (600 - 32) - 1) // [20, 40]
   * ```
   */
  scrollY: number
  /** 表头高度（px） */
  headerHeight: number
}

/**
 * 把 viewport 切分成 1~4 个象限，每个象限对应一组可见 row/col 索引。
 * M1：frozenRows = frozenCols = 0，永远只输出 main 象限。
 * M3：根据 frozenRows / frozenCols > 0 增加 topLeft / topRight / bottomLeft。
 *
 * 使用者把它当成“绘制区域规划器”：
 * - 给定当前滚动位置和 viewport 尺寸。
 * - 返回每个象限应该覆盖哪些行列。
 * - 返回每个象限应该画在 canvas 的哪个矩形区域。
 *
 * Renderer 后续只需要按返回的 quadrants 逐块绘制，不需要关心冻结区如何计算。
 *
 * @example
 * ```ts
 * const rowsAxis = new ChunkedAxis({ count: 1_000, defaultSize: 28 })
 * const colsAxis = new ChunkedAxis({ count: 20, defaultSize: 120 })
 * const frozen = new FrozenRegions(rowsAxis, colsAxis, 0, 0)
 *
 * const quadrants = frozen.getQuadrants({
 *   width: 800,
 *   height: 600,
 *   scrollX: 240,
 *   scrollY: 560,
 *   headerHeight: 32,
 * })
 *
 * // 当前实现只返回 main：
 * // {
 * //   main: {
 * //     rowRange: [20, 40],   // 由 scrollY + viewport height 算出可见行
 * //     colRange: [2, 8],     // 由 scrollX + viewport width 算出可见列
 * //     rect: { x: 0, y: 32, width: 800, height: 568 },
 * //   },
 * // }
 * ```
 */
export class FrozenRegions {
  /**
   * 创建一个 viewport 象限切分器。
   *
   * @example
   * ```ts
   * const rowsAxis = new ChunkedAxis({ count: 1_000, defaultSize: 28 })
   * const colsAxis = new ChunkedAxis({ count: 20, defaultSize: 120 })
   *
   * // 冻结前 2 行和前 1 列。当前 M1/M2 实现会保存配置，
   * // 但 getQuadrants() 仍只返回 main；M3 会真正产出 4 个象限。
   * const frozen = new FrozenRegions(rowsAxis, colsAxis, 2, 1)
   * ```
   */
  constructor(
    private rowsAxis: ChunkedAxis,
    private colsAxis: ChunkedAxis,
    /** 冻结行数 */
    public frozenRows: number,
    /** 冻结列数 */
    public frozenCols: number,
  ) {}

  /**
   * 更新冻结行列数。
   *
   * @example
   * ```ts
   * const frozen = new FrozenRegions(rowsAxis, colsAxis, 0, 0)
   *
   * // 用户点击“冻结前 2 行 + A 列”后，Grid 可以更新这里的配置。
   * frozen.setFrozen(2, 1)
   * frozen.frozenRows // 2
   * frozen.frozenCols // 1
   * ```
   */
  setFrozen(rows: number, cols: number): void {
    this.frozenRows = rows
    this.frozenCols = cols
  }

  /**
   * M1：只输出 main 象限。M3 在此添加另外 3 个象限。
   *
   * @example
   * ```ts
   * const frozen = new FrozenRegions(rowsAxis, colsAxis, 0, 0)
   * const quadrants = frozen.getQuadrants({
   *   width: 800,
   *   height: 600,
   *   scrollX: 240,
   *   scrollY: 560,
   *   headerHeight: 32,
   * })
   *
   * // Renderer 后续会拿 main.rowRange / main.colRange 遍历可见 cell。
   * quadrants.main.rect // { x: 0, y: 32, width: 800, height: 568 }
   * quadrants.main.rowRange // 例如 [20, 40]
   * quadrants.main.colRange // 例如 [2, 8]
   * ```
   */
  getQuadrants(vp: ViewportRect): Quadrants {
    // viewport rect 是「左闭右开」[start, end)，而 ChunkedAxis.getVisibleRange 两端都闭。
    // 末尾 -1 是为了不让恰好落在下一行/列起始像素的位置错误地把那一行/列也包含进来。
    const yStart = vp.scrollY
    const yEnd = vp.scrollY + (vp.height - vp.headerHeight) - 1
    const xStart = vp.scrollX
    const xEnd = vp.scrollX + vp.width - 1

    const rowRange = this.rowsAxis.getVisibleRange(yStart, yEnd)
    const colRange = this.colsAxis.getVisibleRange(xStart, xEnd)

    const main: Quadrant = {
      rowRange,
      colRange,
      rect: {
        x: 0,
        y: vp.headerHeight,
        width: vp.width,
        height: vp.height - vp.headerHeight,
      },
    }
    return { main }
  }
}
