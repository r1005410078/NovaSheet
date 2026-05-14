import type { ChunkedAxis } from '../layout/ChunkedAxis'
import type { Schema } from '../data/Schema'
import type { Theme } from '../theme/Theme'

export interface HeaderPaintParams {
  schema: Schema
  colsAxis: ChunkedAxis
  colRange: [number, number]
  width: number
}

export class HeaderPainter {
  constructor(private theme: Theme) {}

  setTheme(theme: Theme): void {
    this.theme = theme
  }

  paint(ctx: CanvasRenderingContext2D, params: HeaderPaintParams): void {
    const { schema, colsAxis, colRange, width } = params
    const headerHeight = this.theme.metrics.headerHeight

    ctx.fillStyle = this.theme.colors.headerBackground
    ctx.fillRect(0, 0, width, headerHeight)

    if (colRange[1] < colRange[0]) return

    ctx.fillStyle = this.theme.colors.headerText
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'

    const padX = this.theme.metrics.cellPaddingX
    for (let c = colRange[0]; c <= colRange[1]; c++) {
      const field = schema.fields[c]
      if (!field) continue
      const x = colsAxis.indexToPosition(c) + padX
      const y = headerHeight / 2
      ctx.fillText(field.name, x, y)
    }
  }
}
