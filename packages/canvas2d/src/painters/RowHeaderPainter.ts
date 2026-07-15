/**
 * RowHeaderPainter——Excel 门面左侧 1-based 行号列。
 */

import type { Axis, CellValue, Theme } from '@novasheet/core'
import { snapLineInside } from '../paint/line-snap'

export interface RowHeaderPaintParams {
  rowsAxis: Axis
  rowRange: [number, number]
  rect: { x: number; y: number; width: number; height: number }
  scrollOffsetY: number
  selectedRowRange?: { startRow: number; endRow: number }
  readonly resolveLabel?: (rowIndex: number) => CellValue | undefined
}

export class RowHeaderPainter {
  constructor(private theme: Theme) {}

  setTheme(theme: Theme): void {
    this.theme = theme
  }

  /**
   * 左上角（列标/行号交汇）。`headerHeight` 须传表头**总高**（`viewport.headerHeight`，
   * 含列组表头行）——否则有列组时角块会比表头矮一截，与其余表头段错位。
   */
  paintCorner(ctx: CanvasRenderingContext2D, width: number, headerHeight: number): void {
    if (width <= 0) return
    ctx.fillStyle = this.theme.colors.headerBackground
    ctx.fillRect(0, 0, width, headerHeight)
    const strong = this.theme.colors.gridLineStrong
    const border = this.theme.metrics.borderWidth
    ctx.strokeStyle = strong
    ctx.lineWidth = border
    ctx.beginPath()
    const right = snapLineInside(width, 0, width)
    const bottom = snapLineInside(headerHeight, 0, headerHeight)
    if (right !== undefined) {
      ctx.moveTo(right, 0)
      ctx.lineTo(right, headerHeight)
    }
    if (bottom !== undefined) {
      ctx.moveTo(0, bottom)
      ctx.lineTo(width, bottom)
    }
    ctx.stroke()
  }

  paint(ctx: CanvasRenderingContext2D, params: RowHeaderPaintParams): void {
    const { rowsAxis, rowRange, rect, scrollOffsetY } = params
    if (rect.width <= 0 || rect.height <= 0 || rowRange[1] < rowRange[0]) return

    ctx.save()
    ctx.beginPath()
    ctx.rect(rect.x, rect.y, rect.width, rect.height)
    ctx.clip()

    ctx.fillStyle = this.theme.colors.headerBackground
    ctx.fillRect(rect.x, rect.y, rect.width, rect.height)

    const align = this.theme.cell.rowHeaderTextAlign
    const padX = this.theme.metrics.cellPaddingX
    ctx.textAlign = align
    ctx.textBaseline = 'middle'
    ctx.font = `${this.theme.metrics.fontSize}px ${this.theme.metrics.fontFamily}`

    for (let r = rowRange[0]; r <= rowRange[1]; r++) {
      const yTop = rowsAxis.indexToPosition(r)
      const rowHeight = rowsAxis.getSize(r)
      const rowY = rect.y + yTop - scrollOffsetY
      const y = rect.y + yTop - scrollOffsetY + rowHeight / 2
      if (y + rowHeight / 2 < rect.y || y - rowHeight / 2 > rect.y + rect.height) continue
      if (this.isSelectedRow(r, params.selectedRowRange)) {
        ctx.fillStyle = this.theme.colors.selectionBorder
        ctx.fillRect(rect.x, rowY, rect.width, rowHeight)
        ctx.fillStyle = this.theme.colors.selectionText
      } else {
        ctx.fillStyle = this.theme.colors.headerText
      }
      const textX =
        align === 'left' || align === 'start'
          ? rect.x + padX
          : align === 'right' || align === 'end'
            ? rect.x + rect.width - padX
            : rect.x + rect.width / 2
      ctx.fillText(this.resolveText(r, params.resolveLabel), textX, y)
    }

    this.paintRowHeaderGridLines(ctx, { rowsAxis, rowRange, rect, scrollOffsetY })

    ctx.restore()
  }

  private isSelectedRow(
    rowIndex: number,
    range: RowHeaderPaintParams['selectedRowRange'],
  ): boolean {
    return range !== undefined && rowIndex >= range.startRow && rowIndex <= range.endRow
  }

  private resolveText(
    rowIndex: number,
    resolveLabel: RowHeaderPaintParams['resolveLabel'],
  ): string {
    const value = resolveLabel?.(rowIndex)
    if (typeof value === 'string') return value
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
    return String(rowIndex + 1)
  }

  private paintRowHeaderGridLines(
    ctx: CanvasRenderingContext2D,
    params: {
      rowsAxis: Axis
      rowRange: [number, number]
      rect: { x: number; y: number; width: number; height: number }
      scrollOffsetY: number
    },
  ): void {
    const { rowsAxis, rowRange, rect, scrollOffsetY } = params
    const grid = this.theme.colors.gridLine
    const strong = this.theme.colors.gridLineStrong
    const border = this.theme.metrics.borderWidth

    ctx.beginPath()
    ctx.strokeStyle = grid
    ctx.lineWidth = border

    for (let r = rowRange[0]; r <= rowRange[1]; r++) {
      const yBase = rowsAxis.indexToPosition(r) + rowsAxis.getSize(r)
      const yRaw = rect.y + yBase - scrollOffsetY
      const y = snapLineInside(yRaw, rect.y, rect.y + rect.height)
      if (y === undefined) continue
      ctx.moveTo(rect.x, y)
      ctx.lineTo(rect.x + rect.width, y)
    }

    ctx.stroke()

    const right = snapLineInside(rect.x + rect.width, rect.x, rect.x + rect.width)
    if (right === undefined) return
    ctx.strokeStyle = strong
    ctx.lineWidth = border
    ctx.beginPath()
    ctx.moveTo(right, rect.y)
    ctx.lineTo(right, rect.y + rect.height)
    ctx.stroke()
  }
}
