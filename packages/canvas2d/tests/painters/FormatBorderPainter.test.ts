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

  function paintTopBorder(lineStyle: 'dashed' | 'dotted' | 'double', width: 'thin' | 'medium') {
    const { ctx, ops } = createRecordingContext()
    new FormatBorderPainter().paint(ctx, {
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
          format: { borders: { top: { color: '#d93025', width, lineStyle } } },
        },
      ],
    })
    return ops
  }

  it('Phase 5-B：dashed 边用 stroke + setLineDash([3w,2w]) butt cap', () => {
    const ops = paintTopBorder('dashed', 'thin')
    expect(ops).toContainEqual({ op: 'setLineDash', args: [[3, 2]] })
    expect(ops).toContainEqual({ op: 'set:strokeStyle', value: '#d93025' })
    expect(ops).toContainEqual({ op: 'set:lineWidth', value: 1 })
    expect(ops).toContainEqual({ op: 'set:lineCap', value: 'butt' })
    expect(ops.some((o) => o.op === 'stroke')).toBe(true)
    expect(ops.some((o) => o.op === 'fillRect')).toBe(false) // 虚线不用 fillRect
  })

  it('Phase 5-B：dotted 边用 setLineDash([w,w]) round cap，随 width 缩放', () => {
    const ops = paintTopBorder('dotted', 'medium') // width=2
    expect(ops).toContainEqual({ op: 'setLineDash', args: [[2, 2]] })
    expect(ops).toContainEqual({ op: 'set:lineWidth', value: 2 })
    expect(ops).toContainEqual({ op: 'set:lineCap', value: 'round' })
    expect(ops.some((o) => o.op === 'stroke')).toBe(true)
  })

  it('Phase 5-B：double 边画两条 1px fillRect、忽略 width、不用 stroke', () => {
    const ops = paintTopBorder('double', 'medium')
    const fillRects = ops.filter((o) => o.op === 'fillRect')
    expect(fillRects.length).toBe(2) // 两条细线
    for (const r of fillRects) if (r.op === 'fillRect') expect(r.args[3]).toBe(1) // 各 1px
    expect(ops.some((o) => o.op === 'setLineDash')).toBe(false)
    expect(ops.some((o) => o.op === 'stroke')).toBe(false)
  })
})
