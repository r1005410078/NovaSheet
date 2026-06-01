/**
 * HeaderRowPainter — 在行号列头上方绘制 hide-boundary 三角指示器。
 *
 * 仅在 `frame.viewport.rowHeaderWidth >= 24` 时绘制，避免窄行号列下图标重叠。
 * 三角图形取自 `theme.icons.hideBoundaryUp / hideBoundaryDown`（SVG path 字符串），
 * 颜色与位移完全由 theme token 控制，符合 ADR §A.5。
 */

import type { RenderFrame, Theme } from '@novasheet/core'

/** 最小行号列宽阈值：低于此值跳过三角，避免图标超出列宽 */
const MIN_HEADER_WIDTH_FOR_TRIANGLE = 24

/** SVG icon 固定尺寸（与 denseGridTheme 中的 path 坐标系对应，8×6 px） */
const ICON_WIDTH = 8
const ICON_HEIGHT = 6

export class HeaderRowPainter {
  constructor(private theme: Theme) {}

  setTheme(theme: Theme): void {
    this.theme = theme
  }

  /**
   * 在给定 canvas context 上，依据 `frame.collapsedRowGaps` 为每个折叠间隙
   * 画上/下两个三角指示器。若行号列宽 < 24 则跳过。
   */
  paint(ctx: CanvasRenderingContext2D, frame: RenderFrame): void {
    const rowHeaderWidth = frame.viewport.rowHeaderWidth
    if (rowHeaderWidth < MIN_HEADER_WIDTH_FOR_TRIANGLE) return
    if (frame.collapsedRowGaps.length === 0) return

    const { theme } = this
    const { hideTriangleOffset, hideTrianglePadX } = theme.dimensions
    const upPath = new Path2D(theme.icons.hideBoundaryUp)
    const downPath = new Path2D(theme.icons.hideBoundaryDown)
    const x = rowHeaderWidth - hideTrianglePadX - ICON_WIDTH

    ctx.fillStyle = theme.colors.hideIndicator

    for (const gap of frame.collapsedRowGaps) {
      this.drawTriangle(ctx, upPath, x, gap.yPx - hideTriangleOffset - ICON_HEIGHT)
      this.drawTriangle(ctx, downPath, x, gap.yPx + hideTriangleOffset)
    }
  }

  private drawTriangle(
    ctx: CanvasRenderingContext2D,
    path: Path2D,
    x: number,
    y: number,
  ): void {
    ctx.save()
    ctx.translate(x, y)
    ctx.fill(path)
    ctx.restore()
  }
}
