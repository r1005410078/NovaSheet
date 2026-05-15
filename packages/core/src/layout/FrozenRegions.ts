import type { ChunkedAxis } from './ChunkedAxis'

/** 画布坐标系中的矩形区域，单位为 CSS 像素 */
export interface QuadrantRect {
  /** 左边界（canvas 坐标） */
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
  /** 可见行范围 [首行, 末行]（含） */
  rowRange: [number, number]
  /** 可见列范围 [首列, 末列]（含） */
  colRange: [number, number]
  /** 该象限在画布上的绘制区域 */
  rect: QuadrantRect
}

/** 一帧内所有象限的集合（M1 仅含 main；M3 补充冻结区象限） */
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

/** 管理冻结行/列区域划分，为每帧计算各象限的行列范围与绘制矩形 */
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
   * M1：仅填充 main 象限。
   * M3 在 frozenRows > 0 或 frozenCols > 0 时补充 topLeft / topRight / bottomLeft。
   */
  getQuadrants(vp: ViewportRect): Quadrants {
    // 视口区间为半开区间 [start, end)；末端减 1，避免恰好落在下一行/列起始像素时多计一格
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
