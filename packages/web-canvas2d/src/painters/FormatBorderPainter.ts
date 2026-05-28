/**
 * FormatBorderPainter — 自定义单元格边框绘制阶段（spec Phase 5-A §borders）。
 *
 * 在 grid layer 的默认网格线和冻结分隔线之后调用，确保用户边框覆盖默认格线。
 * Phase 5-A 仅支持 lineStyle === 'solid'；其他样式静默跳过。
 * 语义宽度映射：thin→1px, medium→2px, thick→3px。
 *
 * 坐标空间：接收的坐标已是 view 坐标，不做 raw↔view 翻译。
 */

import type { ResolvedCellFormat } from '@novasheet/core'
import { snapLineInside } from '../paint/line-snap'
import type { MergeLookup } from '../paint/merge-lookup'

/** FormatBorderPainter.paint() 所需参数（axes duck-typed，便于单测注入最简 stub） */
export interface FormatBorderPaintArgs {
  rowsAxis: { indexToPosition(i: number): number; getSize(i: number): number }
  colsAxis: { indexToPosition(i: number): number; getSize(i: number): number }
  rect: { x: number; y: number; width: number; height: number }
  rowRange: [number, number]
  colRange: [number, number]
  scrollOffsetX: number
  scrollOffsetY: number
  cellFormats: readonly ResolvedCellFormat[]
  /**
   * 合并查找表（Phase 5-A）。可选；提供时过滤合并区域内部边（相邻被覆盖格之间的边），
   * 避免合并区域内出现重复内线；外框边仍正常绘制。
   */
  merges?: MergeLookup
}

/** 语义线宽到像素的映射。 */
const WIDTH_MAP: Record<string, number> = { thin: 1, medium: 2, thick: 3 }

interface EdgeCmd {
  x1: number
  y1: number
  x2: number
  y2: number
}

/**
 * 自定义边框绘制器。
 *
 * 按 `color+width` 分组批量绘制，减少 ctx 状态切换次数。
 * 每条边坐标经 snapLineInside 对齐到 0.5px 亚像素，保证 1px 清晰锐利。
 */
export class FormatBorderPainter {
  paint(ctx: CanvasRenderingContext2D, args: FormatBorderPaintArgs): void {
    const { rowsAxis, colsAxis, rect, scrollOffsetX, scrollOffsetY, cellFormats, merges } = args
    if (cellFormats.length === 0) return

    const [rowFirst, rowLast] = args.rowRange
    const [colFirst, colLast] = args.colRange

    // 分组：key = `${color}|${widthPx}`
    const groups = new Map<string, { color: string; widthPx: number; edges: EdgeCmd[] }>()

    for (const { rowIndex, colIndex, format } of cellFormats) {
      const { borders } = format
      if (!borders) continue
      if (rowIndex < rowFirst || rowIndex > rowLast) continue
      if (colIndex < colFirst || colIndex > colLast) continue

      const cellX = rect.x + colsAxis.indexToPosition(colIndex) - scrollOffsetX
      const cellY = rect.y + rowsAxis.indexToPosition(rowIndex) - scrollOffsetY
      const cellW = colsAxis.getSize(colIndex)
      const cellH = rowsAxis.getSize(rowIndex)

      const rectLeft = rect.x
      const rectRight = rect.x + rect.width
      const rectTop = rect.y
      const rectBottom = rect.y + rect.height

      // 合并区域内部边过滤：被覆盖格只保留与区域外框重合的边，丢弃相邻覆盖格之间的内部边。
      const region = merges?.regionAt(rowIndex, colIndex)
      const range = region?.range
      const skipTop = range !== undefined && rowIndex > range.startRow
      const skipBottom = range !== undefined && rowIndex < range.endRow
      const skipLeft = range !== undefined && colIndex > range.startCol
      const skipRight = range !== undefined && colIndex < range.endCol

      const sides = [
        { edge: skipTop ? undefined : borders.top, isH: true, rawCoord: cellY, xA: cellX, xB: cellX + cellW },
        { edge: skipBottom ? undefined : borders.bottom, isH: true, rawCoord: cellY + cellH, xA: cellX, xB: cellX + cellW },
        { edge: skipLeft ? undefined : borders.left, isH: false, rawCoord: cellX, yA: cellY, yB: cellY + cellH },
        { edge: skipRight ? undefined : borders.right, isH: false, rawCoord: cellX + cellW, yA: cellY, yB: cellY + cellH },
      ] as const

      for (const side of sides) {
        const { edge } = side
        if (!edge || edge.lineStyle !== 'solid') continue
        const widthPx = WIDTH_MAP[edge.width] ?? 1
        const key = `${edge.color}|${widthPx}`

        let group = groups.get(key)
        if (!group) {
          group = { color: edge.color, widthPx, edges: [] }
          groups.set(key, group)
        }

        if (side.isH) {
          const snappedY = snapLineInside(side.rawCoord, rectTop, rectBottom)
          if (snappedY === undefined) continue
          const x1 = Math.max(side.xA, rectLeft)
          const x2 = Math.min(side.xB, rectRight)
          if (x2 <= x1) continue
          group.edges.push({ x1, y1: snappedY, x2, y2: snappedY })
        } else {
          const snappedX = snapLineInside(side.rawCoord, rectLeft, rectRight)
          if (snappedX === undefined) continue
          const y1 = Math.max(side.yA, rectTop)
          const y2 = Math.min(side.yB, rectBottom)
          if (y2 <= y1) continue
          group.edges.push({ x1: snappedX, y1, x2: snappedX, y2 })
        }
      }
    }

    if (groups.size === 0) return

    ctx.save()
    ctx.beginPath()
    ctx.rect(rect.x, rect.y, rect.width, rect.height)
    ctx.clip()

    for (const { color, widthPx, edges } of groups.values()) {
      ctx.strokeStyle = color
      ctx.lineWidth = widthPx
      ctx.beginPath()
      for (const { x1, y1, x2, y2 } of edges) {
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
      }
      ctx.stroke()
    }

    ctx.restore()
  }
}
