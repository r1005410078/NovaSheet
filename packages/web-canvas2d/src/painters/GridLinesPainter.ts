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

import type { Axis, QuadrantRect, Theme } from '@novasheet/core'

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
  scrollOffsetX?: number
  /** Vertical scroll offset to subtract from content Y positions; frozen regions use their own baseline */
  scrollOffsetY?: number
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
    const scrollOffsetX = params.scrollOffsetX ?? 0
    const scrollOffsetY = params.scrollOffsetY ?? 0
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
      ctx.moveTo(rect.x, y)
      ctx.lineTo(rect.x + rect.width, y)
    }

    // 垂直线：每列右边（同样用 getSize 取末列的实际宽度）。
    for (let c = colRange[0]; c <= colRange[1]; c++) {
      const xBase = colsAxis.indexToPosition(c) + colsAxis.getSize(c)
      const xRaw = rect.x + xBase - scrollOffsetX
      const x = snapLineInside(xRaw, rect.x, rect.x + rect.width)
      if (x === undefined) continue
      ctx.moveTo(x, rect.y)
      ctx.lineTo(x, rect.y + rect.height)
    }

    ctx.stroke()
  }
}

function snapLineInside(raw: number, start: number, end: number): number | undefined {
  if (raw < start || raw > end) return undefined
  if (raw === end) return Math.ceil(raw) - 0.5
  return Math.floor(raw) + 0.5
}
