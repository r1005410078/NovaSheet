import { describe, expect, it } from 'bun:test'
import { FormatFillPainter } from '../../src/painters/FormatFillPainter'
import { createRecordingContext } from '../helpers/recording-context'

describe('FormatFillPainter', () => {
  it('paints fillColor rects before text/grid stages consume the same canvas', () => {
    const { ctx, ops } = createRecordingContext()
    const painter = new FormatFillPainter()

    painter.paint(ctx, {
      rowsAxis: { indexToPosition: (i: number) => i * 24, getSize: () => 24 },
      colsAxis: { indexToPosition: (i: number) => i * 80, getSize: () => 80 },
      rect: { x: 40, y: 24, width: 160, height: 48 },
      rowRange: [0, 1],
      colRange: [0, 1],
      scrollOffsetX: 0,
      scrollOffsetY: 0,
      cellFormats: [{ rowIndex: 1, colIndex: 0, format: { fillColor: '#fff2cc' } }],
    })

    expect(ops).toContainEqual({ op: 'set:fillStyle', value: '#fff2cc' })
    expect(ops).toContainEqual({ op: 'fillRect', args: [40, 48, 80, 24] })
  })
})
