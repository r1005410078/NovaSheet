import { describe, expect, it } from 'bun:test'
import { FormatFillPainter } from '../../src/painters/FormatFillPainter'
import { createRecordingContext } from '../helpers/recording-context'

describe('FormatFillPainter', () => {
  it('emits fillRect at the correct view coordinates for cells with fillColor', () => {
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

  it('does not paint entries outside the given rowRange / colRange', () => {
    const { ctx, ops } = createRecordingContext()
    const painter = new FormatFillPainter()

    painter.paint(ctx, {
      rowsAxis: { indexToPosition: (i: number) => i * 24, getSize: () => 24 },
      colsAxis: { indexToPosition: (i: number) => i * 80, getSize: () => 80 },
      rect: { x: 0, y: 0, width: 400, height: 200 },
      rowRange: [0, 1],
      colRange: [0, 1],
      scrollOffsetX: 0,
      scrollOffsetY: 0,
      cellFormats: [
        // inside range — should be painted
        { rowIndex: 0, colIndex: 0, format: { fillColor: '#fff2cc' } },
        // outside range (row 5 > rowRange[1]=1) — must NOT be painted
        { rowIndex: 5, colIndex: 0, format: { fillColor: '#ff0000' } },
        // outside range (col 3 > colRange[1]=1) — must NOT be painted
        { rowIndex: 0, colIndex: 3, format: { fillColor: '#00ff00' } },
      ],
    })

    expect(ops).toContainEqual({ op: 'set:fillStyle', value: '#fff2cc' })
    // out-of-range fill colors must never appear
    expect(ops).not.toContainEqual({ op: 'set:fillStyle', value: '#ff0000' })
    expect(ops).not.toContainEqual({ op: 'set:fillStyle', value: '#00ff00' })
  })
})
