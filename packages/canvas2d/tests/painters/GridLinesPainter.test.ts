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
      scrollOffsetX: 0,
      scrollOffsetY: 0,
    })
    const strokeCount = ops.filter((o) => o.op === 'stroke').length
    expect(strokeCount).toBe(1)
    expect(
      ops.some((o) => o.op === 'set:strokeStyle' && o.value === denseGridTheme.colors.gridLine),
    ).toBe(true)
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
      scrollOffsetX: 0,
      scrollOffsetY: 0,
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
      scrollOffsetX: 0,
      scrollOffsetY: 0,
    })
    // The last row's bottom line should be at y = 3*28 = 84 (with +0.5 alignment)
    const lineYs = ops
      .filter((o) => o.op === 'moveTo')
      .map((o) => (o.op === 'moveTo' ? o.args[1] : 0))
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

  it('scrollOffset 为 0 时不偏移', () => {
    const { ctx, ops } = createRecordingContext()
    const rowsAxis = new ChunkedAxis({ count: 3, defaultSize: 28 })
    const colsAxis = new ChunkedAxis({ count: 2, defaultSize: 100 })
    new GridLinesPainter(denseGridTheme).paint(ctx, {
      rowsAxis,
      colsAxis,
      rowRange: [0, 2],
      colRange: [0, 1],
      rect: { x: 0, y: 0, width: 200, height: 100 },
      scrollOffsetX: 0,
      scrollOffsetY: 0,
    })
    const lineYs = ops
      .filter((o) => o.op === 'moveTo')
      .map((o) => (o.op === 'moveTo' ? o.args[1] : 0))
      .filter((y) => y > 0 && y < 100)
    expect(lineYs).toContain(84.5)
  })

  it('paintOuterFrame 绘制视口外框', () => {
    const { ctx, ops } = createRecordingContext(400, 300)
    new GridLinesPainter(denseGridTheme).paintOuterFrame(ctx, {
      x: 0,
      y: 0,
      width: 400,
      height: 300,
    })
    expect(ops.some((o) => o.op === 'stroke')).toBe(true)
    expect(ops).toContainEqual({
      op: 'set:strokeStyle',
      value: denseGridTheme.colors.gridLineStrong,
    })
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

  it('溢出文字穿越的列边界竖线段被跳过（与 Excel 一致）', () => {
    const rowsAxis = new ChunkedAxis({ count: 2, defaultSize: 28 })
    const colsAxis = new ChunkedAxis({ count: 2, defaultSize: 100 })
    const params = {
      rowsAxis,
      colsAxis,
      rowRange: [0, 1] as [number, number],
      colRange: [0, 1] as [number, number],
      rect: { x: 0, y: 0, width: 200, height: 200 },
      scrollOffsetX: 0,
      scrollOffsetY: 0,
    }

    // 基线：col0 右边竖线 x=100.5 整段从 y=0 起。
    const base = createRecordingContext()
    new GridLinesPainter(denseGridTheme).paint(base.ctx, params)
    expect(base.ops).toContainEqual({ op: 'moveTo', args: [100.5, 0] })

    // row0 的 col0|col1 边界被溢出文字穿越：该竖线 row0 段跳过，从 row1 顶 y=28 起。
    const crossed = createRecordingContext()
    new GridLinesPainter(denseGridTheme).paint(crossed.ctx, {
      ...params,
      overflowCrossings: { has: (r, c) => r === 0 && c === 0 },
    })
    expect(crossed.ops).not.toContainEqual({ op: 'moveTo', args: [100.5, 0] })
    expect(crossed.ops).toContainEqual({ op: 'moveTo', args: [100.5, 28] })
    // 水平线不受影响：row0 底边整段仍在。
    expect(crossed.ops).toContainEqual({ op: 'moveTo', args: [0, 28.5] })
  })

  it('填充格跳过自身边线（fill 盖住网格线，与 Sheets 一致）', () => {
    const rowsAxis = new ChunkedAxis({ count: 2, defaultSize: 28 })
    const colsAxis = new ChunkedAxis({ count: 2, defaultSize: 100 })
    const params = {
      rowsAxis,
      colsAxis,
      rowRange: [0, 1] as [number, number],
      colRange: [0, 1] as [number, number],
      rect: { x: 0, y: 0, width: 200, height: 200 },
      scrollOffsetX: 0,
      scrollOffsetY: 0,
    }

    // 基线：无填充，row0 底边整段从 x=0 起。
    const base = createRecordingContext()
    new GridLinesPainter(denseGridTheme).paint(base.ctx, params)
    expect(base.ops).toContainEqual({ op: 'moveTo', args: [0, 28.5] })

    // 填充 (0,0)：row0 底边在 col0 段被跳过，整段改从 col1 起点 x=100。
    const filled = createRecordingContext()
    new GridLinesPainter(denseGridTheme).paint(filled.ctx, {
      ...params,
      filledCells: { has: (r, c) => r === 0 && c === 0 },
    })
    expect(filled.ops).not.toContainEqual({ op: 'moveTo', args: [0, 28.5] })
    expect(filled.ops).toContainEqual({ op: 'moveTo', args: [100, 28.5] })
    // 左边线（col0 右边 x=100.5）在 row0 段被跳过，改从 row1 起点 y=28 起。
    expect(filled.ops).not.toContainEqual({ op: 'moveTo', args: [100.5, 0] })
    expect(filled.ops).toContainEqual({ op: 'moveTo', args: [100.5, 28] })
  })
})
