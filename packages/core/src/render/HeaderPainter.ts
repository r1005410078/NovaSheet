import type { ChunkedAxis } from '../layout/ChunkedAxis'
import type { Schema } from '../data/Schema'
import type { Theme } from '../theme/Theme'

/** 表头绘制所需参数 */
export interface HeaderPaintParams {
  /** 数据 Schema（提供字段名称） */
  schema: Schema
  /** 列轴（提供列宽与位置查询） */
  colsAxis: ChunkedAxis
  /** 可见列索引区间（两端均闭） */
  colRange: [number, number]
  /** 整个 viewport 宽度，用于 header 背景占满 */
  width: number
}

/**
 * 列头绘制。M1 只画字段名；M2+ 加排序箭头、字段类型 icon、resize handle 命中区时
 * 都在这里扩展（icon path 已在 theme.icons.byFieldType 准备好）。
 */
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

    // header 背景：占满整个 viewport 宽——M3 后冻结列 header 也由这一笔覆盖。
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
