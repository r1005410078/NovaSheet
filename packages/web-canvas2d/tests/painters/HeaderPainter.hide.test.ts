import { describe, expect, it } from 'bun:test'
import { ChunkedAxis, denseGridTheme, type Schema, type Theme } from '@novasheet/core'
import { HeaderPainter, type HeaderPaintParams } from '../../src/painters/HeaderPainter'
import { createRecordingContext } from '../helpers/recording-context'

const SCHEMA: Schema = {
  fields: [
    { id: 'f0', name: 'F0', type: 'text', width: 100 },
    { id: 'f1', name: 'F1', type: 'text', width: 100 },
    { id: 'f2', name: 'F2', type: 'text', width: 100 },
    { id: 'f6', name: 'F6', type: 'text', width: 100 },
  ],
}

function themeWithHeaderHeight(headerHeight: number): Theme {
  return {
    ...denseGridTheme,
    metrics: { ...denseGridTheme.metrics, headerHeight },
  }
}

function paramsWithGaps(
  collapsedColGaps: HeaderPaintParams['collapsedColGaps'],
): HeaderPaintParams {
  return {
    schema: SCHEMA,
    colsAxis: new ChunkedAxis({ count: SCHEMA.fields.length, defaultSize: 100 }),
    colRange: [0, 3],
    width: 400,
    collapsedColGaps,
  }
}

describe('HeaderPainter — col-hide 三角', () => {
  it('headerHeight >= 24 时为每个 gap 画两个三角 fillPath', () => {
    const { ctx, ops } = createRecordingContext()
    const painter = new HeaderPainter(themeWithHeaderHeight(30))

    painter.paint(
      ctx,
      paramsWithGaps([
        { atViewCol: 2, hiddenCount: 3, hiddenFieldIds: ['f3', 'f4', 'f5'], xPx: 300 },
      ]),
    )

    const fillPathCount = ops.filter((op) => op.op === 'fillPath').length
    expect(fillPathCount).toBeGreaterThanOrEqual(2)
  })

  it('headerHeight < 24 时跳过', () => {
    const painter = new HeaderPainter(themeWithHeaderHeight(20))
    const { ctx, ops } = createRecordingContext()
    const { ctx: ctxNoGap, ops: opsNoGap } = createRecordingContext()

    painter.paint(
      ctx,
      paramsWithGaps([
        { atViewCol: 2, hiddenCount: 3, hiddenFieldIds: ['f3', 'f4', 'f5'], xPx: 300 },
      ]),
    )
    painter.paint(ctxNoGap, paramsWithGaps([]))

    expect(ops.filter((op) => op.op === 'fillPath').length).toBe(
      opsNoGap.filter((op) => op.op === 'fillPath').length,
    )
  })
})
