/**
 * FormatFillPainter — 格式填充背景绘制阶段（spec Phase 5-A §fill）。
 *
 * 在 content layer 中，文本绘制前调用，将 cellFormats 中有 fillColor 的单元格用纯色填充背景。
 * 不读取 theme；fillColor 是用户数据，直接透传至 ctx，不违反「零硬编码视觉值」规则。
 *
 * 坐标空间：painter 接收的坐标已是 view 坐标（engine 在 getFrame() 中完成 raw→view 翻译）。
 */

import type { ResolvedCellFormat } from '@zhiguang/core'
import { isTranslucentColor } from '../paint/color-alpha'
import { buildFilledCellLookup } from '../paint/filled-lookup'
import { snapLineInside } from '../paint/line-snap'
import { MergeLookup, mergedRectSize } from '../paint/merge-lookup'

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
  /**
   * 合并查找表（Phase 5-A）。可选；缺省时按单格填充。
   * anchor 单元格的填充扩展为整块合并矩形；被覆盖的非 anchor 单元格忽略其填充。
   */
  merges?: MergeLookup
  /**
   * 默认网格线视觉值（renderer 从 theme 注入，painter 仍不直接读 theme）。
   * 提供时，半透明 fill 在填充前先把其覆盖的默认格线描在底下，
   * fill 的 alpha 让线隐约透出；不透明 fill 行为不变（grid layer 照常跳线）。
   */
  gridLine?: { color: string; width: number }
}

/**
 * 格式填充背景绘制器。
 *
 * 对每条有 fillColor 的 ResolvedCellFormat，在对应单元格位置绘制纯色矩形。
 * 整段绘制 clip 到 rect，防止越界。
 */
export class FormatFillPainter {
  paint(ctx: CanvasRenderingContext2D, args: FormatFillPaintArgs): void {
    const { rowsAxis, colsAxis, rect, scrollOffsetX, scrollOffsetY, cellFormats, merges } = args
    if (cellFormats.length === 0) return

    ctx.save()
    ctx.beginPath()
    ctx.rect(rect.x, rect.y, rect.width, rect.height)
    ctx.clip()

    this.paintUnderGridLines(ctx, args)

    const [rowFirst, rowLast] = args.rowRange
    const [colFirst, colLast] = args.colRange

    for (const { rowIndex, colIndex, format } of cellFormats) {
      const { fillColor } = format
      if (!fillColor) continue

      // 合并区域：非 anchor 被覆盖格忽略填充；anchor 扩展为整块合并矩形。
      const region = merges?.regionAt(rowIndex, colIndex)
      const isMergeAnchor = region !== undefined && merges!.isAnchor(region, rowIndex, colIndex)

      // 单格按可见范围过滤（防跨 region 重复填充）；但合并 anchor 的矩形可跨入可见区——
      // anchor 本身可能滚出 rowRange/colRange，不能据此丢弃，越界部分由 clip 兜底。
      if (!isMergeAnchor) {
        if (rowIndex < rowFirst || rowIndex > rowLast) continue
        if (colIndex < colFirst || colIndex > colLast) continue
      }
      if (region && !isMergeAnchor) continue

      const x = rect.x + colsAxis.indexToPosition(colIndex) - scrollOffsetX
      const y = rect.y + rowsAxis.indexToPosition(rowIndex) - scrollOffsetY
      const size = region
        ? mergedRectSize(region.range, rowsAxis, colsAxis)
        : { width: colsAxis.getSize(colIndex), height: rowsAxis.getSize(rowIndex) }

      ctx.fillStyle = fillColor
      ctx.fillRect(x, y, size.width, size.height)
    }

    ctx.restore()
  }

  /**
   * 半透明 fill 的「底层格线」pass。
   *
   * grid layer 对一切填充格统一跳线（不透明 fill 盖线语义），半透明 fill 因此丢失
   * 下层格线。这里在所有 fillRect 之前按 fill 覆盖块的四边补描默认格线，随后的
   * alpha 填充把线衰减为隐约可见——等价于「线在 fill 底下」的真实合成。
   * 毗邻不透明 fill 的边不画（那条线应被不透明 fill 盖死）；两个半透明格的共享边
   * 会被两侧各描一次，同色全不透明线重复描无视觉差异，不做去重。
   */
  private paintUnderGridLines(ctx: CanvasRenderingContext2D, args: FormatFillPaintArgs): void {
    const { gridLine, cellFormats, merges, rect, rowsAxis, colsAxis } = args
    const { scrollOffsetX, scrollOffsetY } = args
    if (!gridLine) return

    const opaque = buildFilledCellLookup(
      cellFormats.filter(
        (cf) => cf.format.fillColor !== undefined && !isTranslucentColor(cf.format.fillColor),
      ),
      merges,
    )
    const [rowFirst, rowLast] = args.rowRange
    const [colFirst, colLast] = args.colRange

    let begun = false
    const ensurePath = (): void => {
      if (begun) return
      ctx.strokeStyle = gridLine.color
      ctx.lineWidth = gridLine.width
      ctx.beginPath()
      begun = true
    }

    for (const { rowIndex, colIndex, format } of cellFormats) {
      const { fillColor } = format
      if (!fillColor || !isTranslucentColor(fillColor)) continue

      const region = merges?.regionAt(rowIndex, colIndex)
      const isMergeAnchor = region !== undefined && merges!.isAnchor(region, rowIndex, colIndex)
      // 与填充循环相同的可见性/合并过滤：anchor 的块可跨入可见区，越界由 clip 兜底。
      if (!isMergeAnchor) {
        if (rowIndex < rowFirst || rowIndex > rowLast) continue
        if (colIndex < colFirst || colIndex > colLast) continue
      }
      if (region && !isMergeAnchor) continue

      // fill 覆盖块的行列 span：合并区为整块（内部无格线），普通格为 1×1。
      const r0 = region ? region.range.startRow : rowIndex
      const r1 = region ? region.range.endRow : rowIndex
      const c0 = region ? region.range.startCol : colIndex
      const c1 = region ? region.range.endCol : colIndex

      const topY = snapLineInside(
        rect.y + rowsAxis.indexToPosition(r0) - scrollOffsetY,
        rect.y,
        rect.y + rect.height,
      )
      const bottomY = snapLineInside(
        rect.y + rowsAxis.indexToPosition(r1) + rowsAxis.getSize(r1) - scrollOffsetY,
        rect.y,
        rect.y + rect.height,
      )
      const leftX = snapLineInside(
        rect.x + colsAxis.indexToPosition(c0) - scrollOffsetX,
        rect.x,
        rect.x + rect.width,
      )
      const rightX = snapLineInside(
        rect.x + colsAxis.indexToPosition(c1) + colsAxis.getSize(c1) - scrollOffsetX,
        rect.x,
        rect.x + rect.width,
      )

      // 横边按列分段、竖边按行分段——逐段检查对侧邻格是否不透明 fill。
      for (let cc = c0; cc <= c1; cc++) {
        const sx = rect.x + colsAxis.indexToPosition(cc) - scrollOffsetX
        const ex = sx + colsAxis.getSize(cc)
        if (topY !== undefined && !opaque.has(r0 - 1, cc)) {
          ensurePath()
          ctx.moveTo(sx, topY)
          ctx.lineTo(ex, topY)
        }
        if (bottomY !== undefined && !opaque.has(r1 + 1, cc)) {
          ensurePath()
          ctx.moveTo(sx, bottomY)
          ctx.lineTo(ex, bottomY)
        }
      }
      for (let rr = r0; rr <= r1; rr++) {
        const sy = rect.y + rowsAxis.indexToPosition(rr) - scrollOffsetY
        const ey = sy + rowsAxis.getSize(rr)
        if (leftX !== undefined && !opaque.has(rr, c0 - 1)) {
          ensurePath()
          ctx.moveTo(leftX, sy)
          ctx.lineTo(leftX, ey)
        }
        if (rightX !== undefined && !opaque.has(rr, c1 + 1)) {
          ensurePath()
          ctx.moveTo(rightX, sy)
          ctx.lineTo(rightX, ey)
        }
      }
    }

    if (begun) ctx.stroke()
  }
}
