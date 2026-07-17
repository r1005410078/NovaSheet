/**
 * FormatBorderPainter — 自定义单元格边框绘制阶段（spec Phase 5-A §borders）。
 *
 * 在 grid layer 的默认网格线和冻结分隔线之后调用，确保用户边框覆盖默认格线。
 * Phase 5-A 仅支持 lineStyle === 'solid'；其他样式静默跳过。
 * 语义宽度映射：thin→1px, medium→2px, thick→3px。
 *
 * 坐标空间：接收的坐标已是 view 坐标，不做 raw↔view 翻译。
 */

import type { ResolvedCellFormat } from '@zhiguang/novasheet-core'
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
const MAX_BORDER_OUTSET = 1

interface EdgeRect {
  color: string
  x: number
  y: number
  width: number
  height: number
}

/**
 * 自定义边框绘制器。
 *
 * 将每条边绘制为填充矩形，而不是使用 ctx.stroke()。
 * Canvas stroke 会沿中心线两侧扩展；在粗边框、右/底边和区域 clip 交界处容易被裁半。
 * edge-rect 模型让边框占用区域明确，后续 dashed/dotted/double 也可以在矩形边段上扩展。
 */
export class FormatBorderPainter {
  paint(ctx: CanvasRenderingContext2D, args: FormatBorderPaintArgs): void {
    const { rowsAxis, colsAxis, rect, scrollOffsetX, scrollOffsetY, cellFormats, merges } = args
    if (cellFormats.length === 0) return

    const [rowFirst, rowLast] = args.rowRange
    const [colFirst, colLast] = args.colRange

    const rects: EdgeRect[] = []
    const strokes: StrokeSeg[] = []

    for (const { rowIndex, colIndex, format } of cellFormats) {
      const { borders } = format
      if (!borders) continue
      if (rowIndex < rowFirst || rowIndex > rowLast) continue
      if (colIndex < colFirst || colIndex > colLast) continue

      const cellX = rect.x + colsAxis.indexToPosition(colIndex) - scrollOffsetX
      const cellY = rect.y + rowsAxis.indexToPosition(rowIndex) - scrollOffsetY
      const cellW = colsAxis.getSize(colIndex)
      const cellH = rowsAxis.getSize(rowIndex)

      const clipLeft = rect.x - MAX_BORDER_OUTSET
      const clipRight = rect.x + rect.width + MAX_BORDER_OUTSET
      const clipTop = rect.y - MAX_BORDER_OUTSET
      const clipBottom = rect.y + rect.height + MAX_BORDER_OUTSET

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
        if (!edge) continue
        const widthPx = WIDTH_MAP[edge.width] ?? 1
        const c = side.rawCoord

        // 沿边裁剪后的跨度（H 取 x、V 取 y）；为空则跳过。
        const lo = side.isH ? Math.max(side.xA, clipLeft) : Math.max(side.yA, clipTop)
        const hi = side.isH ? Math.min(side.xB, clipRight) : Math.min(side.yB, clipBottom)
        if (hi <= lo) continue

        if (edge.lineStyle === 'solid' || edge.lineStyle === 'double') {
          // double：两条 1px 细线（间隙 1px，忽略 width，对齐 Google）；solid：一条 widthPx。
          const offsets =
            edge.lineStyle === 'double' ? [c - 1, c + 1] : [edgeRectStart(c, widthPx, 0)]
          const thickness = edge.lineStyle === 'double' ? 1 : widthPx
          for (const start of offsets) {
            if (side.isH) {
              pushClippedRect(rects, edge.color, lo, start, hi - lo, thickness, clipLeft, clipTop, clipRight, clipBottom)
            } else {
              pushClippedRect(rects, edge.color, start, lo, thickness, hi - lo, clipLeft, clipTop, clipRight, clipBottom)
            }
          }
        } else {
          // dashed / dotted：沿边中线描线（受 width 影响），独立 stroke pass。
          const dotted = edge.lineStyle === 'dotted'
          strokes.push({
            color: edge.color,
            widthPx,
            cap: dotted ? 'round' : 'butt',
            dash: dotted ? [widthPx, widthPx] : [widthPx * 3, widthPx * 2],
            x1: side.isH ? lo : c,
            y1: side.isH ? c : lo,
            x2: side.isH ? hi : c,
            y2: side.isH ? c : hi,
          })
        }
      }
    }

    if (rects.length === 0 && strokes.length === 0) return

    ctx.save()
    ctx.beginPath()
    ctx.rect(
      rect.x - MAX_BORDER_OUTSET,
      rect.y - MAX_BORDER_OUTSET,
      rect.width + MAX_BORDER_OUTSET * 2,
      rect.height + MAX_BORDER_OUTSET * 2,
    )
    ctx.clip()

    let currentColor: string | undefined
    for (const edgeRect of rects) {
      if (edgeRect.color !== currentColor) {
        ctx.fillStyle = edgeRect.color
        currentColor = edgeRect.color
      }
      ctx.fillRect(edgeRect.x, edgeRect.y, edgeRect.width, edgeRect.height)
    }

    // dashed/dotted 描线 pass（同一 clip 内，叠在 rect 之上）。
    for (const seg of strokes) {
      ctx.strokeStyle = seg.color
      ctx.lineWidth = seg.widthPx
      ctx.lineCap = seg.cap
      ctx.setLineDash(seg.dash)
      ctx.beginPath()
      ctx.moveTo(seg.x1, seg.y1)
      ctx.lineTo(seg.x2, seg.y2)
      ctx.stroke()
    }
    if (strokes.length > 0) ctx.setLineDash([]) // 复位虚线相位，避免影响后续绘制

    ctx.restore()
  }
}

interface StrokeSeg {
  color: string
  widthPx: number
  cap: CanvasLineCap
  dash: number[]
  x1: number
  y1: number
  x2: number
  y2: number
}

function edgeRectStart(rawCoord: number, widthPx: number, visibleStart: number): number {
  return Math.max(rawCoord - Math.floor(widthPx / 2), visibleStart)
}

function pushClippedRect(
  rects: EdgeRect[],
  color: string,
  x: number,
  y: number,
  width: number,
  height: number,
  clipLeft: number,
  clipTop: number,
  clipRight: number,
  clipBottom: number,
): void {
  const x1 = Math.max(x, clipLeft)
  const y1 = Math.max(y, clipTop)
  const x2 = Math.min(x + width, clipRight)
  const y2 = Math.min(y + height, clipBottom)
  if (x2 <= x1 || y2 <= y1) return
  rects.push({ color, x: x1, y: y1, width: x2 - x1, height: y2 - y1 })
}
