import { describe, expect, it } from 'bun:test'
import { ChunkedAxis, denseGridTheme } from '@novasheet/core'
import { GridLinesPainter } from '../../src/painters/GridLinesPainter'
import { createRecordingContext } from '../helpers/recording-context'

describe('GridLinesPainter — 网格线', () => {
  it('行列 moveTo/lineTo 后单次 stroke', () => {
    const { ctx, ops } = createRecordingContext()
    const rowsAxis = new ChunkedAxis({ count: 10, defaultSize: 28 })
    const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })
    const painter = new GridLinesPainter(denseGridTheme)
    painter.paint(ctx, {
      rowsAxis,
      colsAxis,
      rowRange: [0, 2],
      colRange: [0, 1],
      rect: { x: 0, y: 32, width: 200, height: 100 },
    })
    const strokeCount = ops.filter((o) => o.op === 'stroke').length
    expect(strokeCount).toBe(1)
    expect(ops.some((o) => o.op === 'set:strokeStyle' && o.value === denseGridTheme.colors.gridLine)).toBe(true)
    expect(ops.some((o) => o.op === 'moveTo')).toBe(true)
    expect(ops.some((o) => o.op === 'lineTo')).toBe(true)
  })

  it('空范围不绘制', () => {
    const { ctx, ops } = createRecordingContext()
    const rowsAxis = new ChunkedAxis({ count: 0, defaultSize: 28 })
    const colsAxis = new ChunkedAxis({ count: 0, defaultSize: 100 })
    new GridLinesPainter(denseGridTheme).paint(ctx, {
      rowsAxis,
      colsAxis,
      rowRange: [0, -1],
      colRange: [0, -1],
      rect: { x: 0, y: 0, width: 200, height: 100 },
    })
    expect(ops.filter((o) => o.op === 'stroke')).toHaveLength(0)
  })

  it('末行底边位置正确（非 0）', () => {
    const { ctx, ops } = createRecordingContext()
    const rowsAxis = new ChunkedAxis({ count: 3, defaultSize: 28 })
    const colsAxis = new ChunkedAxis({ count: 2, defaultSize: 100 })
    const painter = new GridLinesPainter(denseGridTheme)
    painter.paint(ctx, {
      rowsAxis,
      colsAxis,
      rowRange: [0, 2],
      colRange: [0, 1],
      rect: { x: 0, y: 0, width: 200, height: 100 },
    })
    // The last row's bottom line should be at y = 3*28 = 84 (with +0.5 alignment)
    const lineYs = ops
      .filter((o) => o.op === 'moveTo')
      .map((o) => o.op === 'moveTo' ? o.args[1] : 0)
      .filter((y) => y > 0 && y < 100)
    expect(lineYs).toContain(84.5) // last row bottom (after floor + 0.5 alignment)
  })

  it('提供 scrollOffset 时线条随滚动偏移', () => {
    const { ctx, ops } = createRecordingContext()
    const rowsAxis = new ChunkedAxis({ count: 3, defaultSize: 28 })
    const colsAxis = new ChunkedAxis({ count: 2, defaultSize: 100 })
    const painter = new GridLinesPainter(denseGridTheme)
    painter.paint(ctx, {
      rowsAxis,
      colsAxis,
      rowRange: [0, 2],
      colRange: [0, 1],
      rect: { x: 0, y: 0, width: 200, height: 100 },
      scrollOffsetX: 0,
      scrollOffsetY: 28, // scroll down by 1 row
    })
    // Without scroll, last-row bottom is at y = 84 (3 × 28). With scrollY=28, lines must shift
    // up by 28; row-2 bottom becomes 56.5 and row-0 bottom (originally 28.5) becomes 0.5.
    // The "unshifted" 84.5 must NOT appear — that's the precise gate that fails if subtraction is missing.
    const lineYs = ops
      .filter((o) => o.op === 'moveTo')
      .map((o) => (o.op === 'moveTo' ? o.args[1] : 0))
    expect(lineYs).toContain(56.5)
    expect(lineYs).not.toContain(84.5)
    // Row-0 bottom shifts from 28.5 to 0.5 (still within rect [0, 100] so it's emitted)
    expect(lineYs).toContain(0.5)
  })

  it('默认无 scrollOffset 时不偏移（向后兼容）', () => {
    const { ctx, ops } = createRecordingContext()
    const rowsAxis = new ChunkedAxis({ count: 3, defaultSize: 28 })
    const colsAxis = new ChunkedAxis({ count: 2, defaultSize: 100 })
    new GridLinesPainter(denseGridTheme).paint(ctx, {
      rowsAxis,
      colsAxis,
      rowRange: [0, 2],
      colRange: [0, 1],
      rect: { x: 0, y: 0, width: 200, height: 100 },
      // scrollOffsetX / scrollOffsetY omitted — defaults to 0
    })
    const lineYs = ops
      .filter((o) => o.op === 'moveTo')
      .map((o) => (o.op === 'moveTo' ? o.args[1] : 0))
      .filter((y) => y > 0 && y < 100)
    expect(lineYs).toContain(84.5)
  })

  it('绘制冻结区域右边界与底边界线', () => {
    const { ctx, ops } = createRecordingContext()
    const rowsAxis = new ChunkedAxis({ count: 1, defaultSize: 28 })
    const colsAxis = new ChunkedAxis({ count: 1, defaultSize: 100 })
    new GridLinesPainter(denseGridTheme).paint(ctx, {
      rowsAxis,
      colsAxis,
      rowRange: [0, 0],
      colRange: [0, 0],
      rect: { x: 0, y: 32, width: 100, height: 28 },
      scrollOffsetX: 0,
      scrollOffsetY: 0,
    })

    expect(ops).toContainEqual({ op: 'moveTo', args: [0, 59.5] })
    expect(ops).toContainEqual({ op: 'lineTo', args: [100, 59.5] })
    expect(ops).toContainEqual({ op: 'moveTo', args: [99.5, 32] })
    expect(ops).toContainEqual({ op: 'lineTo', args: [99.5, 60] })
  })
})
