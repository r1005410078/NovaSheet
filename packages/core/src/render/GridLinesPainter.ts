import type { ChunkedAxis } from '../layout/ChunkedAxis'
import type { QuadrantRect } from '../layout/FrozenRegions'
import type { Theme } from '../theme/Theme'

/** 网格线绘制所需参数 */
export interface GridLinesPaintParams {
  /** 行轴（提供行高与位置查询） */
  rowsAxis: ChunkedAxis
  /** 列轴（提供列宽与位置查询） */
  colsAxis: ChunkedAxis
  /** 可见行范围 [首行, 末行]（含） */
  rowRange: [number, number]
  /** 可见列范围 [首列, 末列]（含） */
  colRange: [number, number]
  /** 绘制区域矩形（画布坐标） */
  rect: QuadrantRect
}

/** 负责绘制单象限内的横向与纵向网格线 */
export class GridLinesPainter {
  constructor(private theme: Theme) {}

  /** 切换主题 */
  setTheme(theme: Theme): void {
    this.theme = theme
  }

  /** 绘制可见行列的底边与右边网格线（像素对齐 + 0.5 偏移，消除模糊） */
  paint(ctx: CanvasRenderingContext2D, params: GridLinesPaintParams): void {
    const { rowsAxis, colsAxis, rowRange, colRange, rect } = params
    if (rowRange[1] < rowRange[0] || colRange[1] < colRange[0]) return

    ctx.strokeStyle = this.theme.colors.gridLine
    ctx.lineWidth = this.theme.metrics.borderWidth

    ctx.beginPath()

    // 横向线：每个可见行的底边
    for (let r = rowRange[0]; r <= rowRange[1]; r++) {
      const yBase = rowsAxis.indexToPosition(r) + rowsAxis.getSize(r)
      const y = Math.floor(yBase - this.scrollOffsetY(rect)) + 0.5
      if (y < rect.y || y > rect.y + rect.height) continue
      ctx.moveTo(rect.x, y)
      ctx.lineTo(rect.x + rect.width, y)
    }

    // 纵向线：每个可见列的右边
    for (let c = colRange[0]; c <= colRange[1]; c++) {
      const xBase = colsAxis.indexToPosition(c) + colsAxis.getSize(c)
      const x = Math.floor(xBase - this.scrollOffsetX(rect)) + 0.5
      if (x < rect.x || x > rect.x + rect.width) continue
      ctx.moveTo(x, rect.y)
      ctx.lineTo(x, rect.y + rect.height)
    }

    ctx.stroke()
  }

  /** M1：无滚动，偏移固定为 0；M2 将由 Renderer 传入调整后的 rect 取代此方法 */
  private scrollOffsetX(_rect: QuadrantRect): number { return 0 }
  private scrollOffsetY(_rect: QuadrantRect): number { return 0 }
}
