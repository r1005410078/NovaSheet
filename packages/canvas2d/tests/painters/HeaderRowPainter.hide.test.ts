import { describe, expect, it } from 'bun:test'
import { createRecordingContext } from '../helpers/recording-context'
import { HeaderRowPainter } from '../../src/painters/HeaderRowPainter'
import { denseGridTheme } from '@novasheet/core'

// rowHeaderWidth 放在 viewport 字段下，与 RenderFrame 实际形状一致。
// fill(Path2D) 在 RecordingContext 中记录为 op:'fillPath'（非 'fill'）。
function frameWithGaps(
  gaps: { atViewRow: number; hiddenCount: number; hiddenIds: number[]; yPx: number }[],
  rowHeaderWidth: number,
) {
  return {
    viewport: { rowHeaderWidth },
    collapsedRowGaps: gaps,
    theme: denseGridTheme,
  } as any
}

describe('HeaderRowPainter — 三角 hide indicator', () => {
  it('rowHeaderWidth ≥ 24 时为每个 gap 画两个三角 fillPath', () => {
    const { ctx, ops } = createRecordingContext()
    const painter = new HeaderRowPainter(denseGridTheme)
    painter.paint(
      ctx as any,
      frameWithGaps([{ atViewRow: 2, hiddenCount: 3, hiddenIds: [3, 4, 5], yPx: 60 }], 30),
    )
    // fill(Path2D) → RecordingContext 记为 'fillPath'
    const fillPathCount = ops.filter((c) => c.op === 'fillPath').length
    expect(fillPathCount).toBeGreaterThanOrEqual(2)
  })

  it('rowHeaderWidth < 24 时跳过三角', () => {
    const { ctx, ops } = createRecordingContext()
    const painter = new HeaderRowPainter(denseGridTheme)
    painter.paint(
      ctx as any,
      frameWithGaps([{ atViewRow: 2, hiddenCount: 3, hiddenIds: [3, 4, 5], yPx: 60 }], 20),
    )
    const { ctx: ctxNoGap, ops: opsNoGap } = createRecordingContext()
    painter.paint(ctxNoGap as any, frameWithGaps([], 20))
    expect(ops.filter((c) => c.op === 'fillPath').length).toBe(
      opsNoGap.filter((c) => c.op === 'fillPath').length,
    )
  })
})
