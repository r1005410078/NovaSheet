/**
 * FormatFillPainter — 格式填充背景绘制阶段（spec Phase 5-A §fill）。
 *
 * 在 content layer 中，文本绘制前调用，将 cellFormats 中有 fillColor 的单元格用纯色填充背景。
 * 不读取 theme；fillColor 是用户数据，直接透传至 ctx，不违反「零硬编码视觉值」规则。
 *
 * 坐标空间：painter 接收的坐标已是 view 坐标（engine 在 getFrame() 中完成 raw→view 翻译）。
 */

import type { ResolvedCellFormat } from '@novasheet/core'

/** FormatFillPainter.paint() 所需参数（axes duck-typed，便于单测注入最简 stub） */
export interface FormatFillPaintArgs {
  /** 行轴：提供 indexToPosition 和 getSize */
  rowsAxis: { indexToPosition(i: number): number; getSize(i: number): number }
  /** 列轴：提供 indexToPosition 和 getSize */
  colsAxis: { indexToPosition(i: number): number; getSize(i: number): number }
  /** 绘制区域矩形（相对 canvas 原点） */
  rect: { x: number; y: number; width: number; height: number }
  /** 可见行范围 [first, last]（inclusive） */
  rowRange: [number, number]
  /** 可见列范围 [first, last]（inclusive） */
  colRange: [number, number]
  /** 水平滚动偏移（px） */
  scrollOffsetX: number
  /** 垂直滚动偏移（px） */
  scrollOffsetY: number
  /** 已解析的单元格格式列表（view 坐标） */
  cellFormats: readonly ResolvedCellFormat[]
}

/**
 * 格式填充背景绘制器。
 *
 * 对每条有 fillColor 的 ResolvedCellFormat，在对应单元格位置绘制纯色矩形。
 * 整段绘制 clip 到 rect，防止越界。
 */
export class FormatFillPainter {
  paint(ctx: CanvasRenderingContext2D, args: FormatFillPaintArgs): void {
    const { rowsAxis, colsAxis, rect, scrollOffsetX, scrollOffsetY, cellFormats } = args
    if (cellFormats.length === 0) return

    ctx.save()
    ctx.beginPath()
    ctx.rect(rect.x, rect.y, rect.width, rect.height)
    ctx.clip()

    const [rowFirst, rowLast] = args.rowRange
    const [colFirst, colLast] = args.colRange

    for (const { rowIndex, colIndex, format } of cellFormats) {
      const { fillColor } = format
      if (!fillColor) continue
      if (rowIndex < rowFirst || rowIndex > rowLast) continue
      if (colIndex < colFirst || colIndex > colLast) continue

      const x = rect.x + colsAxis.indexToPosition(colIndex) - scrollOffsetX
      const y = rect.y + rowsAxis.indexToPosition(rowIndex) - scrollOffsetY
      const width = colsAxis.getSize(colIndex)
      const height = rowsAxis.getSize(rowIndex)

      ctx.fillStyle = fillColor
      ctx.fillRect(x, y, width, height)
    }

    ctx.restore()
  }
}
