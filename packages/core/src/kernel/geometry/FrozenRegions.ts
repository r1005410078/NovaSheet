/**
 * FrozenRegions——把 viewport 切成可绘制区域（spec §4）。
 *
 * 它解决的问题：
 *   - Renderer 需要知道当前帧哪些行/列可见，以及它们应该画到 canvas 哪个矩形。
 *   - 冻结行/列不跟随某些方向滚动；普通内容区跟随双轴滚动。
 *   - Renderer 不应该散落“冻结区如何切分”的判断，而是统一读取 RenderRegion。
 *
 * 当前支持 2 × 3 区域：
 *
 * ```
 *                columns
 *          left     center      right
 *        ┌───────┬───────────┬────────┐
 * top    │topLeft│topCenter  │topRight│  冻结顶部行
 *        ├───────┼───────────┼────────┤
 * middle │middle │main       │middle  │  可滚动行
 *        │Left   │           │Right   │
 *        └───────┴───────────┴────────┘
 * ```
 *
 * Example:
 *
 * ```ts
 * const rowsAxis = new ChunkedAxis({ count: 1_000, defaultSize: 28 })
 * const colsAxis = new ChunkedAxis({ count: 20, defaultSize: 120 })
 *
 * const frozen = new FrozenRegions(rowsAxis, colsAxis, {
 *   topRows: 1,
 *   leftCols: 1,
 *   rightCols: 1,
 * })
 *
 * const regions = frozen.getRegions({
 *   width: 800,
 *   height: 600,
 *   scrollX: 240,
 *   scrollY: 560,
 *   headerHeight: 32,
 * })
 *
 * // Renderer 按 zIndex 从低到高绘制：
 * // main -> middleLeft/middleRight -> topCenter -> topLeft/topRight
 * ```
 *
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

/** 冻结配置。`topRows` 是顶部冻结行数；`leftCols/rightCols` 是左右两侧冻结列数。 */
export interface FrozenConfig {
  topRows: number
  leftCols: number
  rightCols: number
}

export type RowBand = 'top' | 'middle'
export type ColBand = 'left' | 'center' | 'right'
export type RenderRegionId =
  | 'main'
  | 'topLeft'
  | 'topCenter'
  | 'topRight'
  | 'middleLeft'
  | 'middleRight'

/**
 * 单个可绘制区域。
 *
 * `rowRange/colRange` 是数据索引范围；`rect` 是 canvas 位置；`scrollOffsetX/Y`
 * 是绘制该区域时要减掉的逻辑滚动基准。
 *
 * @example
 * ```ts
 * // 右冻结列：逻辑上仍是最后一列，但画在 viewport 右边。
 * const region = {
 *   id: 'middleRight',
 *   colRange: [19, 19],
 *   rect: { x: 680, y: 60, width: 120, height: 540 },
 *   scrollOffsetX: colsAxis.indexToPosition(19),
 * }
 * ```
 */
export interface RenderRegion {
  id: RenderRegionId
  rowBand: RowBand
  colBand: ColBand
  rowRange: [number, number]
  colRange: [number, number]
  rect: QuadrantRect
  scrollOffsetX: number
  scrollOffsetY: number
  /** 绘制层级：值越大越后画，覆盖低层级区域 */
  zIndex: number
}

/**
 * getRegions 所需的视口尺寸与滚动信息。
 *
 * `scrollX/scrollY` 是逻辑内容坐标，不是 canvas 坐标。
 */
export interface ViewportRect {
  /** 视口宽度（CSS px） */
  width: number
  /** 视口高度（CSS px） */
  height: number
  /** 水平滚动偏移（px），表示 viewport 左边缘在内容坐标系中的 x */
  scrollX: number
  /** 垂直滚动偏移（px），表示内容区顶部在内容坐标系中的 y */
  scrollY: number
  /** 表头高度（px） */
  headerHeight: number
  /** 行号列宽（px）；0 表示无行头 */
  rowHeaderWidth: number
}

export class FrozenRegions {
  private config: FrozenConfig

  constructor(
    private rowsAxis: ChunkedAxis,
    private colsAxis: ChunkedAxis,
    frozen: Partial<FrozenConfig> = {},
  ) {
    this.config = this.normalizeConfig(frozen)
  }

  getFrozenConfig(): FrozenConfig {
    return { ...this.config }
  }

  /**
   * 更新冻结配置。
   *
   * @example
   * ```ts
   * frozen.setFrozen({ topRows: 1, leftCols: 1, rightCols: 1 })
   * ```
   */
  setFrozen(frozen: Partial<FrozenConfig>): void {
    this.config = this.normalizeConfig(frozen)
  }

  /**
   * 根据冻结配置输出可绘制区域数组。
   *
   * @example
   * ```ts
   * const regions = frozen.getRegions(viewportRect)
   * for (const region of regions) {
   *   renderer.paintRegion(region)
   * }
   * ```
   */
  getRegions(vp: ViewportRect): RenderRegion[] {
    const contentHeight = Math.max(0, vp.height - vp.headerHeight)
    const topRows = Math.max(0, Math.min(Math.floor(this.config.topRows), this.rowsAxis.getCount()))
    const leftCols = Math.max(
      0,
      Math.min(Math.floor(this.config.leftCols), this.colsAxis.getCount()),
    )
    const rightCols = Math.max(
      0,
      Math.min(Math.floor(this.config.rightCols), Math.max(0, this.colsAxis.getCount() - leftCols)),
    )

    const topHeight = this.spanSize(this.rowsAxis, 0, topRows)
    const leftWidth = this.spanSize(this.colsAxis, 0, leftCols)
    const rightStart = this.colsAxis.getCount() - rightCols
    const rightWidth = this.spanSize(this.colsAxis, rightStart, rightCols)

    const middleY = vp.headerHeight + topHeight
    const middleHeight = Math.max(0, contentHeight - topHeight)
    const gutter = Math.max(0, vp.rowHeaderWidth)
    const centerX = gutter + leftWidth
    const centerWidth = Math.max(0, vp.width - gutter - leftWidth - rightWidth)
    const rightX = Math.max(gutter + leftWidth, vp.width - rightWidth)
    // scrollX 表示中间可滚动区域已经横向滚动了多少，而不是整张表的内容坐标。
    // 有左冻结列时，中心区域的内容基准需要从左冻结列之后开始，再叠加 scrollX。
    // 例如左冻结宽 100px、scrollX=50px，则中心区域应从内容坐标 150px 开始；
    // 不能写成 max(scrollX, leftWidth)，否则 0..100px 这段滚动会被吞掉，画面拖一段才动。
    const centerScrollX = leftWidth + Math.max(0, vp.scrollX)
    // 与横轴不对称：vp.scrollY 本身就是绝对内容坐标（下限钳到 topHeight），不是"中间
    // 区域已滚动量"再叠加 topHeight——故意不写成 `topHeight + max(0, vp.scrollY)`
    // （那是横轴的形状，会把纵向目标坐标再多算一个 topHeight）。
    // ViewportController.logicalToScrollY 正是据此不对目标 Y 做 -topHeight 修正；
    // 对称地减会导致 scrollToRow('start') 在有顶部冻结行时定位偏差 topHeight px。
    const middleScrollY = Math.max(vp.scrollY, topHeight)
    const rightScrollX = rightCols > 0 ? this.colsAxis.indexToPosition(rightStart) : 0
    const centerColRange = this.centerVisibleRange(centerScrollX, centerWidth, leftCols, rightStart)

    const regions: RenderRegion[] = []

    regions.push({
      id: 'main',
      rowBand: 'middle',
      colBand: 'center',
      rowRange: this.visibleRange(this.rowsAxis, middleScrollY, middleHeight),
      colRange: centerColRange,
      rect: { x: centerX, y: middleY, width: centerWidth, height: middleHeight },
      scrollOffsetX: centerScrollX,
      scrollOffsetY: middleScrollY,
      zIndex: 10,
    })

    if (leftCols > 0 && leftWidth > 0) {
      regions.push({
        id: 'middleLeft',
        rowBand: 'middle',
        colBand: 'left',
        rowRange: this.visibleRange(this.rowsAxis, middleScrollY, middleHeight),
        colRange: [0, leftCols - 1],
        rect: { x: gutter, y: middleY, width: leftWidth, height: middleHeight },
        scrollOffsetX: 0,
        scrollOffsetY: middleScrollY,
        zIndex: 20,
      })
    }

    if (rightCols > 0 && rightWidth > 0) {
      regions.push({
        id: 'middleRight',
        rowBand: 'middle',
        colBand: 'right',
        rowRange: this.visibleRange(this.rowsAxis, middleScrollY, middleHeight),
        colRange: [rightStart, this.colsAxis.getCount() - 1],
        rect: { x: rightX, y: middleY, width: rightWidth, height: middleHeight },
        scrollOffsetX: rightScrollX,
        scrollOffsetY: middleScrollY,
        zIndex: 20,
      })
    }

    if (topRows > 0 && topHeight > 0) {
      regions.push({
        id: 'topCenter',
        rowBand: 'top',
        colBand: 'center',
        rowRange: [0, topRows - 1],
        colRange: centerColRange,
        rect: { x: centerX, y: vp.headerHeight, width: centerWidth, height: topHeight },
        scrollOffsetX: centerScrollX,
        scrollOffsetY: 0,
        zIndex: 30,
      })
    }

    if (topRows > 0 && topHeight > 0 && leftCols > 0 && leftWidth > 0) {
      regions.push({
        id: 'topLeft',
        rowBand: 'top',
        colBand: 'left',
        rowRange: [0, topRows - 1],
        colRange: [0, leftCols - 1],
        rect: { x: gutter, y: vp.headerHeight, width: leftWidth, height: topHeight },
        scrollOffsetX: 0,
        scrollOffsetY: 0,
        zIndex: 40,
      })
    }

    if (topRows > 0 && topHeight > 0 && rightCols > 0 && rightWidth > 0) {
      regions.push({
        id: 'topRight',
        rowBand: 'top',
        colBand: 'right',
        rowRange: [0, topRows - 1],
        colRange: [rightStart, this.colsAxis.getCount() - 1],
        rect: { x: rightX, y: vp.headerHeight, width: rightWidth, height: topHeight },
        scrollOffsetX: rightScrollX,
        scrollOffsetY: 0,
        zIndex: 40,
      })
    }

    return regions
  }

  private normalizeConfig(frozen: Partial<FrozenConfig>): FrozenConfig {
    return {
      topRows: this.normalizeCount(frozen.topRows ?? 0),
      leftCols: this.normalizeCount(frozen.leftCols ?? 0),
      rightCols: this.normalizeCount(frozen.rightCols ?? 0),
    }
  }

  private normalizeCount(value: number): number {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.floor(value))
  }

  private visibleRange(axis: ChunkedAxis, start: number, size: number): [number, number] {
    if (size <= 0 || axis.getCount() === 0) return [0, -1]
    return axis.getVisibleRange(start, start + size - 1)
  }

  private centerVisibleRange(
    scrollX: number,
    width: number,
    leftCols: number,
    rightStart: number,
  ): [number, number] {
    const range = this.visibleRange(this.colsAxis, scrollX, width)
    const first = Math.max(range[0], leftCols)
    const last = Math.min(range[1], rightStart - 1)
    if (last < first) return [0, -1]
    return [first, last]
  }

  private spanSize(axis: ChunkedAxis, start: number, count: number): number {
    if (count <= 0) return 0
    let total = 0
    const end = Math.min(axis.getCount(), start + count)
    for (let i = start; i < end; i++) total += axis.getSize(i)
    return total
  }
}
