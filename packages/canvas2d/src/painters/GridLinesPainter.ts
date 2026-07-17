/**
 * GridLinesPainter——绘制可见区的水平 / 垂直分隔线（spec §5.5）。
 *
 * 优化：所有同色线合并到一次 ctx.beginPath()+stroke()——600 个 cell 范围内大约
 * 几十条线一次描边，远比 per-line stroke 快。线坐标采用 `floor + 0.5` 对齐避免亚像素模糊。
 *
 * 边界正确性：rowHeight / colWidth 通过 axis.getSize(index) 取值，而非
 * indexToPosition(index+1) - indexToPosition(index)——后者在末行/末列因 clamp 返回 0
 * （CLAUDE.md 不变量 #7，M1 hardening 修复）。
 *
 * scrollOffsetX/Y 由 Renderer 从 viewport.snapshot().regions 取出后传入；
 * 冻结区域会使用自己的滚动基准。
 */

import type { Axis, QuadrantRect, Theme } from '@zhiguang/novasheet-core'
import { snapLineInside } from '../paint/line-snap'
import type { MergeLookup } from '../paint/merge-lookup'

/** 网格线绘制所需参数 */
export interface GridLinesPaintParams {
  /** 行轴（提供行高与位置查询） */
  rowsAxis: Axis
  /** 列轴（提供列宽与位置查询） */
  colsAxis: Axis
  /** 可见行索引区间（两端均闭，来自 Axis.getVisibleRange） */
  rowRange: [number, number]
  /** 可见列索引区间（两端均闭） */
  colRange: [number, number]
  /** 当前绘制区域矩形（canvas 坐标系） */
  rect: QuadrantRect
  /** Horizontal scroll offset to subtract from content X positions; frozen regions use their own baseline */
  scrollOffsetX: number
  /** Vertical scroll offset to subtract from content Y positions; frozen regions use their own baseline */
  scrollOffsetY: number
  /**
   * 合并查找表（Phase 5-A）。可选；提供时跳过合并区域内部的行/列边界线，
   * 仅保留合并区域外框边界，使合并单元格内部不再出现默认网格线。
   */
  merges?: MergeLookup
  /**
   * 有填充背景的单元格查找。可选；提供时跳过填充格自身的网格线段，
   * 使填充块内部不再透出默认网格线（与 Google Sheets 一致——填充色盖住网格线）。
   * 一条边线只要其任一侧单元格有填充即跳过。
   */
  filledCells?: FilledCellLookup
  /**
   * 溢出文字穿越查找。可选；`has(row, col)` 为 true 表示 row 行内 col 与 col+1 之间的
   * 列边界被该行溢出文字穿越，对应竖线段跳过（与 Excel 一致——溢出段的边界线整段隐藏）。
   */
  overflowCrossings?: FilledCellLookup
}

/** 填充格查找——`has(row, col)` 返回该单元格是否有填充背景。 */
export interface FilledCellLookup {
  has(row: number, col: number): boolean
}

/** 返回 [from, to] 在去除 skips 覆盖区间后的互补线段（skips 为空时即整段）。 */
function complementSegments(
  from: number,
  to: number,
  skips: ReadonlyArray<readonly [number, number]>,
): Array<[number, number]> {
  if (skips.length === 0) return [[from, to]]
  const norm = skips
    .map(([s, e]) => [Math.max(from, Math.min(s, to)), Math.max(from, Math.min(e, to))] as [number, number])
    .filter(([s, e]) => e > s)
    .sort((p, q) => p[0] - q[0])
  const out: Array<[number, number]> = []
  let cursor = from
  for (const [s, e] of norm) {
    if (s > cursor) out.push([cursor, s])
    cursor = Math.max(cursor, e)
  }
  if (cursor < to) out.push([cursor, to])
  return out
}

/**
 * 行/列分隔线绘制。把所有同色线合并到一次 ctx.stroke——而非每行/列各 stroke 一次——
 * 大幅降低 Canvas 状态机切换开销（实测 30 行 × 20 列下从 ~1.5ms 降到 ~0.3ms）。
 */
export class GridLinesPainter {
  constructor(private theme: Theme) {}

  /** 切换主题 */
  setTheme(theme: Theme): void {
    this.theme = theme
  }

  /** 绘制可见行列的底边与右边网格线（像素对齐 + 0.5 偏移，消除模糊） */
  paint(ctx: CanvasRenderingContext2D, params: GridLinesPaintParams): void {
    const { rowsAxis, colsAxis, rowRange, colRange, rect } = params
    const { scrollOffsetX, scrollOffsetY } = params
    const merges = params.merges
    const filledCells = params.filledCells
    const overflowCrossings = params.overflowCrossings
    if (rowRange[1] < rowRange[0] || colRange[1] < colRange[0]) return

    ctx.strokeStyle = this.theme.colors.gridLine
    ctx.lineWidth = this.theme.metrics.borderWidth

    ctx.beginPath()

    // 水平线：每行底边。
    // 用 `indexToPosition(r) + getSize(r)` 而非 `indexToPosition(r + 1)`——后者在 r === count-1
    // 时会 clamp 退化到 r 自身的位置，导致末行底线缺失（CLAUDE.md 不变量 #7）。
    for (let r = rowRange[0]; r <= rowRange[1]; r++) {
      const yBase = rowsAxis.indexToPosition(r) + rowsAxis.getSize(r)
      const yRaw = rect.y + yBase - scrollOffsetY
      const y = snapLineInside(yRaw, rect.y, rect.y + rect.height)
      if (y === undefined) continue
      const skips: Array<readonly [number, number]> = []
      if (merges) {
        for (const merge of merges.regions) {
          const { range } = merge
          if (r < range.startRow || r >= range.endRow) continue
          if (range.endCol < colRange[0] || range.startCol > colRange[1]) continue
          const startX = rect.x + colsAxis.indexToPosition(range.startCol) - scrollOffsetX
          const endX =
            rect.x +
            colsAxis.indexToPosition(range.endCol) +
            colsAxis.getSize(range.endCol) -
            scrollOffsetX
          skips.push([startX, endX])
        }
      }
      // 填充格：行 r 底边落在填充格上侧（r,c）或下侧（r+1,c）则跳过该列段。
      if (filledCells) {
        for (let c = colRange[0]; c <= colRange[1]; c++) {
          if (!filledCells.has(r, c) && !filledCells.has(r + 1, c)) continue
          const cx = rect.x + colsAxis.indexToPosition(c) - scrollOffsetX
          skips.push([cx, cx + colsAxis.getSize(c)])
        }
      }
      for (const [x1, x2] of complementSegments(rect.x, rect.x + rect.width, skips)) {
        ctx.moveTo(x1, y)
        ctx.lineTo(x2, y)
      }
    }

    // 垂直线：每列右边（同样用 getSize 取末列的实际宽度）。
    for (let c = colRange[0]; c <= colRange[1]; c++) {
      const xBase = colsAxis.indexToPosition(c) + colsAxis.getSize(c)
      const xRaw = rect.x + xBase - scrollOffsetX
      const x = snapLineInside(xRaw, rect.x, rect.x + rect.width)
      if (x === undefined) continue
      const skips: Array<readonly [number, number]> = []
      if (merges) {
        for (const merge of merges.regions) {
          const { range } = merge
          if (c < range.startCol || c >= range.endCol) continue
          if (range.endRow < rowRange[0] || range.startRow > rowRange[1]) continue
          const startY = rect.y + rowsAxis.indexToPosition(range.startRow) - scrollOffsetY
          const endY =
            rect.y +
            rowsAxis.indexToPosition(range.endRow) +
            rowsAxis.getSize(range.endRow) -
            scrollOffsetY
          skips.push([startY, endY])
        }
      }
      // 填充格：列 c 右边落在填充格左侧（r,c）或右侧（r,c+1）则跳过该行段。
      // 溢出穿越：row r 的文字横穿 c|c+1 边界时同样跳过该行段。
      if (filledCells || overflowCrossings) {
        for (let r = rowRange[0]; r <= rowRange[1]; r++) {
          const filled =
            filledCells !== undefined && (filledCells.has(r, c) || filledCells.has(r, c + 1))
          const crossed = overflowCrossings !== undefined && overflowCrossings.has(r, c)
          if (!filled && !crossed) continue
          const ry = rect.y + rowsAxis.indexToPosition(r) - scrollOffsetY
          skips.push([ry, ry + rowsAxis.getSize(r)])
        }
      }
      for (const [y1, y2] of complementSegments(rect.y, rect.y + rect.height, skips)) {
        ctx.moveTo(x, y1)
        ctx.lineTo(x, y2)
      }
    }

    ctx.stroke()
  }

  /** 视口最外一圈边框（内容未铺满时补齐右/底边，避免“缺一块”）。 */
  paintOuterFrame(
    ctx: CanvasRenderingContext2D,
    rect: { x: number; y: number; width: number; height: number },
  ): void {
    if (rect.width <= 0 || rect.height <= 0) return
    const border = this.theme.metrics.borderWidth
    ctx.strokeStyle = this.theme.colors.gridLineStrong
    ctx.lineWidth = border
    const inset = border / 2
    ctx.beginPath()
    ctx.rect(rect.x + inset, rect.y + inset, rect.width - border, rect.height - border)
    ctx.stroke()
  }
}
