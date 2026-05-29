import { describe, expect, it } from 'bun:test'
import { FormatBorderPainter } from '../../src/painters/FormatBorderPainter'
import { createRecordingContext } from '../helpers/recording-context'

describe('FormatBorderPainter', () => {
  it('paints custom borders as filled edge rectangles with semantic width mapping', () => {
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

    expect(ops).toContainEqual({ op: 'set:fillStyle', value: '#d93025' })
    expect(ops).toContainEqual({ op: 'fillRect', args: [40, 24, 80, 2] })
    expect(ops).not.toContainEqual({ op: 'set:lineWidth', value: 2 })
  })

  it('keeps medium right and bottom borders inside the cell bounds', () => {
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
            borders: {
              right: { color: '#d93025', width: 'medium', lineStyle: 'solid' },
              bottom: { color: '#d93025', width: 'medium', lineStyle: 'solid' },
            },
          },
        },
      ],
    })

    expect(ops).toContainEqual({ op: 'fillRect', args: [118, 24, 2, 24] })
    expect(ops).toContainEqual({ op: 'fillRect', args: [40, 46, 80, 2] })
  })
})
