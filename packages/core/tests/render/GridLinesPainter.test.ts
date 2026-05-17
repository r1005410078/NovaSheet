import { describe, expect, it } from 'bun:test'
import { ChunkedAxis } from '../../src/layout/ChunkedAxis'
import { GridLinesPainter } from '../../src/render/GridLinesPainter'
import { denseGridTheme } from '../../src/theme/denseGridTheme'
import { createRecordingContext } from '../helpers/recording-context'

describe('GridLinesPainter', () => {
  it('emits moveTo/lineTo per row + col then a single stroke', () => {
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

  it('skips drawing when range is empty', () => {
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

  it('draws the last row bottom boundary at the correct position (not 0)', () => {
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

  it('shifts line positions by scrollOffset when provided', () => {
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

  it('keeps backward-compatible default (no scroll offset = no shift)', () => {
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
})
