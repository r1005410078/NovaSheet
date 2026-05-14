import type { ChunkedAxis } from '../layout/ChunkedAxis'
import type { QuadrantRect } from '../layout/FrozenRegions'
import type { Theme } from '../theme/Theme'

export interface GridLinesPaintParams {
  rowsAxis: ChunkedAxis
  colsAxis: ChunkedAxis
  rowRange: [number, number]
  colRange: [number, number]
  rect: QuadrantRect
}

export class GridLinesPainter {
  constructor(private theme: Theme) {}

  setTheme(theme: Theme): void {
    this.theme = theme
  }

  paint(ctx: CanvasRenderingContext2D, params: GridLinesPaintParams): void {
    const { rowsAxis, colsAxis, rowRange, colRange, rect } = params
    if (rowRange[1] < rowRange[0] || colRange[1] < colRange[0]) return

    ctx.strokeStyle = this.theme.colors.gridLine
    ctx.lineWidth = this.theme.metrics.borderWidth

    ctx.beginPath()

    // Horizontal lines: after each visible row's bottom edge
    for (let r = rowRange[0]; r <= rowRange[1]; r++) {
      const yBase = rowsAxis.indexToPosition(r) + this.rowHeight(rowsAxis, r)
      const y = Math.floor(yBase - this.scrollOffsetY(rect)) + 0.5
      if (y < rect.y || y > rect.y + rect.height) continue
      ctx.moveTo(rect.x, y)
      ctx.lineTo(rect.x + rect.width, y)
    }

    // Vertical lines: after each visible column's right edge
    for (let c = colRange[0]; c <= colRange[1]; c++) {
      const xBase = colsAxis.indexToPosition(c) + this.colWidth(colsAxis, c)
      const x = Math.floor(xBase - this.scrollOffsetX(rect)) + 0.5
      if (x < rect.x || x > rect.x + rect.width) continue
      ctx.moveTo(x, rect.y)
      ctx.lineTo(x, rect.y + rect.height)
    }

    ctx.stroke()
  }

  private rowHeight(axis: ChunkedAxis, index: number): number {
    return axis.indexToPosition(index + 1) - axis.indexToPosition(index)
  }

  private colWidth(axis: ChunkedAxis, index: number): number {
    return axis.indexToPosition(index + 1) - axis.indexToPosition(index)
  }

  /** M1: no scroll, scroll offset = 0. Renderer will pass adjusted rect later. */
  private scrollOffsetX(_rect: QuadrantRect): number { return 0 }
  private scrollOffsetY(_rect: QuadrantRect): number { return 0 }
}
