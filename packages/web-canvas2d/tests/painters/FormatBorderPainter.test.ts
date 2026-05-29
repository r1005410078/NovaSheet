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
    expect(ops).toContainEqual({ op: 'fillRect', args: [40, 23, 80, 2] })
    expect(ops).not.toContainEqual({ op: 'set:lineWidth', value: 2 })
  })

  it('centers medium right and bottom borders on the cell edge', () => {
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

    expect(ops).toContainEqual({ op: 'fillRect', args: [119, 24, 2, 24] })
    expect(ops).toContainEqual({ op: 'fillRect', args: [40, 47, 80, 2] })
  })

  it('draws thin internal vertical borders on the gridline pixel', () => {
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
              right: { color: '#d93025', width: 'thin', lineStyle: 'solid' },
            },
          },
        },
      ],
    })

    expect(ops).toContainEqual({ op: 'fillRect', args: [120, 24, 1, 24] })
  })

  it('keeps medium left border visible at the viewport left edge', () => {
    const { ctx, ops } = createRecordingContext()
    const painter = new FormatBorderPainter()

    painter.paint(ctx, {
      rowsAxis: { indexToPosition: (i: number) => i * 24, getSize: () => 24 },
      colsAxis: { indexToPosition: (i: number) => i * 80, getSize: () => 80 },
      rect: { x: 0, y: 24, width: 160, height: 48 },
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
              left: { color: '#d93025', width: 'medium', lineStyle: 'solid' },
            },
          },
        },
      ],
    })

    expect(ops).toContainEqual({ op: 'fillRect', args: [0, 24, 2, 24] })
  })
})
