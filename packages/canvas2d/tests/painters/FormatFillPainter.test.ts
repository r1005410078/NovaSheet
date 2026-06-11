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

describe('FormatFillPainter — 半透明 fill 的底层格线（under-line pass）', () => {
  const GRID_LINE = { color: '#eaeef2', width: 1 }
  const baseArgs = {
    rowsAxis: { indexToPosition: (i: number) => i * 24, getSize: () => 24 },
    colsAxis: { indexToPosition: (i: number) => i * 80, getSize: () => 80 },
    rect: { x: 0, y: 0, width: 400, height: 200 },
    rowRange: [0, 1] as [number, number],
    colRange: [0, 1] as [number, number],
    scrollOffsetX: 0,
    scrollOffsetY: 0,
  }

  it('相邻半透明格的共享边线在填充前以 gridLine 色描出', () => {
    const { ctx, ops } = createRecordingContext()
    new FormatFillPainter().paint(ctx, {
      ...baseArgs,
      cellFormats: [
        { rowIndex: 0, colIndex: 0, format: { fillColor: 'rgba(255,0,0,0.3)' } },
        { rowIndex: 0, colIndex: 1, format: { fillColor: 'rgba(255,0,0,0.3)' } },
      ],
      gridLine: GRID_LINE,
    })

    // (0,0)|(0,1) 共享竖边 x=80 → snap 80.5，跨 row0 [0,24]
    expect(ops).toContainEqual({ op: 'set:strokeStyle', value: '#eaeef2' })
    expect(ops).toContainEqual({ op: 'moveTo', args: [80.5, 0] })
    expect(ops).toContainEqual({ op: 'lineTo', args: [80.5, 24] })
    // 线在所有 fillRect 之前（fill alpha 衰减线 → 隐约可见）
    const strokeIdx = ops.findIndex((o) => o.op === 'stroke')
    const fillIdx = ops.findIndex((o) => o.op === 'fillRect')
    expect(strokeIdx).toBeGreaterThanOrEqual(0)
    expect(fillIdx).toBeGreaterThan(strokeIdx)
  })

  it('不透明 fill 不画底层格线（既有盖线行为不变）', () => {
    const { ctx, ops } = createRecordingContext()
    new FormatFillPainter().paint(ctx, {
      ...baseArgs,
      cellFormats: [
        { rowIndex: 0, colIndex: 0, format: { fillColor: '#ff0000' } },
        { rowIndex: 0, colIndex: 1, format: { fillColor: '#00ff00' } },
      ],
      gridLine: GRID_LINE,
    })
    expect(ops.some((o) => o.op === 'stroke')).toBe(false)
  })

  it('未提供 gridLine 参数时不画底层格线', () => {
    const { ctx, ops } = createRecordingContext()
    new FormatFillPainter().paint(ctx, {
      ...baseArgs,
      cellFormats: [{ rowIndex: 0, colIndex: 0, format: { fillColor: 'rgba(255,0,0,0.3)' } }],
    })
    expect(ops.some((o) => o.op === 'stroke')).toBe(false)
  })

  it('半透明格与不透明填充格毗邻的边不画线', () => {
    const { ctx, ops } = createRecordingContext()
    new FormatFillPainter().paint(ctx, {
      ...baseArgs,
      cellFormats: [
        { rowIndex: 0, colIndex: 0, format: { fillColor: 'rgba(255,0,0,0.3)' } },
        { rowIndex: 0, colIndex: 1, format: { fillColor: '#00ff00' } },
      ],
      gridLine: GRID_LINE,
    })
    // 右邻 (0,1) 为不透明 fill → 共享竖边 x=80.5 不画
    expect(ops).not.toContainEqual({ op: 'moveTo', args: [80.5, 0] })
    // 其余三边仍画（如上边 y=0.5）
    expect(ops).toContainEqual({ op: 'moveTo', args: [0, 0.5] })
  })
})
