/**
 * HeaderPainter——绘制顶部列头条（spec §5.6）。
 *
 * M1 内容：headerBackground 填充 + 每列绘制字段名（左对齐、垂直居中、`…` 截断）。
 * 不绘制字段类型 icon——Theme.icons 已备好，M2/M3 给 header 加 icon / 排序图标 /
 * 列拖拽 indicator 时再消费。
 *
 * Header 永远在最顶层，最后绘（spec §5.3 顺序），覆盖滚动区。冻结列的 header 段在
 * 主 header 之后再绘一次（M3 才会启用，因为 M1 没有冻结列）。
 */

import type { Axis, Schema, Theme } from '@novasheet/core'

/** 表头绘制所需参数 */
export interface HeaderPaintParams {
  /** 数据 Schema（提供字段名称） */
  schema: Schema
  /** 列轴（提供列宽与位置查询） */
  colsAxis: Axis
  /** 可见列索引区间（两端均闭） */
  colRange: [number, number]
  /** 整个 viewport 宽度，用于 header 背景占满 */
  width: number
  /**
   * 横向滚动偏移。header 跟列内容左右联动（cell 减去 scrollX，header 也要减），
   * 否则横向滚动后字段名会被画到 viewport 之外。M3 冻结列的 header 段
   * 由 Renderer 单独传 scrollOffsetX=0 再绘一次覆盖。
   */
  scrollOffsetX?: number
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
    const scrollOffsetX = params.scrollOffsetX ?? 0
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
      // 减去 scrollOffsetX：header 跟随主区横向滚动；M3 冻结列段会被 Renderer 用
      // scrollOffsetX=0 再绘一次覆盖到固定位置。
      const x = colsAxis.indexToPosition(c) - scrollOffsetX + padX
      const y = headerHeight / 2
      ctx.fillText(field.name, x, y)
    }
  }
}
