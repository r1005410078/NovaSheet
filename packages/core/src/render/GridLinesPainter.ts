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
 * scrollOffsetX/Y 由 Renderer 从 viewport.snapshot() 取出后传入；冻结象限传 0 即可。
 */

import type { ChunkedAxis } from '../layout/ChunkedAxis'
import type { QuadrantRect } from '../layout/FrozenRegions'
import type { Theme } from '../theme/Theme'

/** 网格线绘制所需参数 */
export interface GridLinesPaintParams {
  /** 行轴（提供行高与位置查询） */
  rowsAxis: ChunkedAxis
  /** 列轴（提供列宽与位置查询） */
  colsAxis: ChunkedAxis
  /** 可见行索引区间（两端均闭，来自 ChunkedAxis.getVisibleRange） */
  rowRange: [number, number]
  /** 可见列索引区间（两端均闭） */
  colRange: [number, number]
  /** 象限矩形（canvas 坐标系） */
  rect: QuadrantRect
  /** Horizontal scroll offset to subtract from content X positions; 0 for frozen quadrants */
  scrollOffsetX?: number
  /** Vertical scroll offset to subtract from content Y positions; 0 for frozen quadrants */
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
      // 亚像素对齐：floor + 0.5 把整数坐标偏移到像素中心，避免 1px 线变成 2px 模糊。
      const y = Math.floor(rect.y + yBase - scrollOffsetY) + 0.5
      if (y < rect.y || y > rect.y + rect.height) continue
      ctx.moveTo(rect.x, y)
      ctx.lineTo(rect.x + rect.width, y)
    }

    // 垂直线：每列右边（同样用 getSize 取末列的实际宽度）。
    for (let c = colRange[0]; c <= colRange[1]; c++) {
      const xBase = colsAxis.indexToPosition(c) + colsAxis.getSize(c)
      const x = Math.floor(rect.x + xBase - scrollOffsetX) + 0.5
      if (x < rect.x || x > rect.x + rect.width) continue
      ctx.moveTo(x, rect.y)
      ctx.lineTo(x, rect.y + rect.height)
    }

    ctx.stroke()
  }
}
