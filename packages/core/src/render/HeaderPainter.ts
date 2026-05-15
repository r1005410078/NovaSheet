import type { ChunkedAxis } from '../layout/ChunkedAxis'
import type { Schema } from '../data/Schema'
import type { Theme } from '../theme/Theme'

/** 表头绘制所需参数 */
export interface HeaderPaintParams {
  /** 数据 Schema（提供字段名称） */
  schema: Schema
  /** 列轴（提供列宽与位置查询） */
  colsAxis: ChunkedAxis
  /** 可见列范围 [首列, 末列]（含） */
  colRange: [number, number]
  /** 画布总宽度（用于填充表头背景） */
  width: number
}

/** 负责绘制表头行：背景 + 各列字段名称文字 */
export class HeaderPainter {
  constructor(private theme: Theme) {}

  /** 切换主题 */
  setTheme(theme: Theme): void {
    this.theme = theme
  }

  /** 绘制表头：先填充背景色，再逐列绘制字段名称文字 */
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
