import { describe, expect, it } from 'bun:test'
import { FormatBorderPainter } from '../../src/painters/FormatBorderPainter'
import { createRecordingContext } from '../helpers/recording-context'

describe('FormatBorderPainter', () => {
  it('strokes custom borders after default grid with semantic width mapping', () => {
    const { ctx, ops } = createRecordingContext()
    const painter = new FormatBorderPainter()

    painter.paint(ctx, {
      rowsAxis: { indexToPosition: (i: number) => i * 24, getSize: () => 24 },
      colsAxis: { indexToPosition: (i: number) => i * 80, getSize: () => 80 },
      rect: { x: 40, y: 24, width: 160, height: 48 },
      rowRange: [0, 1],
      colRange: [0, 1],
      scrollOffsetX: 0,
      scrollOffsetY: 0,
      cellFormats: [
        {
          rowIndex: 0,
          colIndex: 0,
          format: {
            borders: { top: { color: '#d93025', width: 'medium', lineStyle: 'solid' } },
          },
        },
      ],
    })

    expect(ops).toContainEqual({ op: 'set:strokeStyle', value: '#d93025' })
    expect(ops).toContainEqual({ op: 'set:lineWidth', value: 2 })
    expect(ops).toContainEqual({ op: 'moveTo', args: [40, 24.5] })
    expect(ops).toContainEqual({ op: 'lineTo', args: [120, 24.5] })
  })
})
