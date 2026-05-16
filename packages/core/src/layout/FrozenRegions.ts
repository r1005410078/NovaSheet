/**
 * FrozenRegions——把视口切分为 4 个象限：topLeft / topRight / bottomLeft / main（spec §4）。
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

/** 单个象限：包含可见行列范围及对应的画布绘制矩形 */
export interface Quadrant {
  /** 该象限内的行索引区间，两端均闭 */
  rowRange: [number, number]
  /** 该象限内的列索引区间，两端均闭 */
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

/** getQuadrants 所需的视口尺寸与滚动信息 */
export interface ViewportRect {
  /** 视口宽度（CSS px） */
  width: number
  /** 视口高度（CSS px） */
  height: number
  /** 水平滚动偏移（px） */
  scrollX: number
  /** 垂直滚动偏移（px） */
  scrollY: number
  /** 表头高度（px） */
  headerHeight: number
}

/**
 * 把 viewport 切分成 1~4 个象限，每个象限对应一组可见 row/col 索引。
 * M1：frozenRows = frozenCols = 0，永远只输出 main 象限。
 * M3：根据 frozenRows / frozenCols > 0 增加 topLeft / topRight / bottomLeft。
 */
export class FrozenRegions {
  constructor(
    private rowsAxis: ChunkedAxis,
    private colsAxis: ChunkedAxis,
    /** 冻结行数 */
    public frozenRows: number,
    /** 冻结列数 */
    public frozenCols: number,
  ) {}

  /** 更新冻结行列数 */
  setFrozen(rows: number, cols: number): void {
    this.frozenRows = rows
    this.frozenCols = cols
  }

  /**
   * M1：只输出 main 象限。M3 在此添加另外 3 个象限。
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
