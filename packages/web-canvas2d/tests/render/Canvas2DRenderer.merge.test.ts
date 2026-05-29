import { describe, expect, it } from 'bun:test'
import {
  ChunkedAxis,
  FrozenRegions,
  InMemoryDataSource,
  Viewport,
  denseGridTheme,
  type MergeRegion,
  type Schema,
} from '@novasheet/core'
import { Canvas2DRenderer } from '../../src/render/Canvas2DRenderer'
import { createRecordingContext, type RecordedOp } from '../helpers/recording-context'

const SCHEMA: Schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text', width: 80 },
    { id: 'b', name: 'B', type: 'text', width: 80 },
  ],
}

// A1:B2 合并：rows 0-1, cols 0-1, anchor (0,0)。view 坐标（无 hide/sort/filter，raw === view）。
const A1B2: MergeRegion = {
  id: 'merge-1',
  range: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
  anchor: { rowIndex: 0, colIndex: 0 },
}

function setup() {
  const { ctx, ops } = createRecordingContext()
  const data = new InMemoryDataSource({
    schema: SCHEMA,
    rows: [
      { a: 'A1', b: 'B1' },
      { a: 'A2', b: 'B2' },
    ],
  })
  const rowsAxis = new ChunkedAxis({
    count: data.getRowCount(),
    defaultSize: denseGridTheme.metrics.rowHeight,
  })
  const colsAxis = new ChunkedAxis({ count: SCHEMA.fields.length, defaultSize: 80 })
  const frozen = new FrozenRegions(rowsAxis, colsAxis, 0, 0)
  const viewport = new Viewport(rowsAxis, colsAxis, frozen)
  viewport.setSize(400, 200)
  viewport.setHeaderHeight(denseGridTheme.metrics.headerHeight)
  viewport.setScroll(0, 0)
  const renderer = new Canvas2DRenderer({ ctx, data, viewport, rowsAxis, colsAxis, theme: denseGridTheme })
  return { ctx, ops, data, viewport, rowsAxis, colsAxis, renderer }
}

function textOps(ops: readonly RecordedOp[]): string[] {
  return ops
    .filter((o): o is Extract<RecordedOp, { op: 'fillText' }> => o.op === 'fillText')
    .map((o) => o.args[0])
}

interface Segment {
  x1: number
  y1: number
  x2: number
  y2: number
}

/** 收集在 strokeStyle === color 期间发出的 moveTo→lineTo 线段（用于区分自定义边框与默认格线）。 */
function collectSegmentsByStroke(ops: readonly RecordedOp[], color: string): Segment[] {
  const segs: Segment[] = []
  let current = ''
  let pending: [number, number] | null = null
  for (const o of ops) {
    if (o.op === 'set:strokeStyle') current = String(o.value)
    else if (o.op === 'moveTo') pending = [o.args[0], o.args[1]]
    else if (o.op === 'lineTo' && current === color && pending) {
      segs.push({ x1: pending[0], y1: pending[1], x2: o.args[0], y2: o.args[1] })
      pending = [o.args[0], o.args[1]]
    } else if (o.op === 'lineTo' && pending) {
      pending = [o.args[0], o.args[1]]
    }
  }
  return segs
}

function collectFillRectsByFill(
  ops: readonly RecordedOp[],
  color: string,
): Array<{ x: number; y: number; width: number; height: number }> {
  const rects: Array<{ x: number; y: number; width: number; height: number }> = []
  let current = ''
  for (const o of ops) {
    if (o.op === 'set:fillStyle') current = String(o.value)
    else if (o.op === 'fillRect' && current === color) {
      rects.push({ x: o.args[0], y: o.args[1], width: o.args[2], height: o.args[3] })
    }
  }
  return rects
}

describe('Canvas2DRenderer — 合并单元格绘制', () => {
  it('合并区域只在 anchor 绘制一次文本，跳过被覆盖的非 anchor 单元格', () => {
    const { renderer, ops, viewport, data, rowsAxis, colsAxis } = setup()

    renderer.render({
      data,
      theme: denseGridTheme,
      rowsAxis,
      colsAxis,
      viewport: viewport.snapshot(),
      collapsedRowGaps: [],
      collapsedColGaps: [],
      mergeRegions: [A1B2],
    })

    const texts = textOps(ops)
    expect(texts.filter((t) => t === 'A1')).toHaveLength(1)
    expect(texts).not.toContain('B1')
    expect(texts).not.toContain('A2')
    expect(texts).not.toContain('B2')
  })

  it('FormatFillPainter 对 anchor 填充整个合并矩形（跨 region 求和尺寸）', () => {
    const { renderer, ops, viewport, data, rowsAxis, colsAxis } = setup()

    renderer.render({
      data,
      theme: denseGridTheme,
      rowsAxis,
      colsAxis,
      viewport: viewport.snapshot(),
      collapsedRowGaps: [],
      collapsedColGaps: [],
      cellFormats: [{ rowIndex: 0, colIndex: 0, format: { fillColor: '#fff2cc' } }],
      mergeRegions: [A1B2],
    })

    expect(ops).toContainEqual({ op: 'set:fillStyle', value: '#fff2cc' })
    // 合并矩形宽 = 80 + 80 = 160，高 = rowHeight × 2；anchor 位于 (rowHeaderWidth, headerHeight)。
    const mergedWidth = colsAxis.getSize(0) + colsAxis.getSize(1)
    const mergedHeight = rowsAxis.getSize(0) + rowsAxis.getSize(1)
    const fillRects = ops.filter(
      (o): o is Extract<RecordedOp, { op: 'fillRect' }> => o.op === 'fillRect',
    )
    const mergedFill = fillRects.find((o) => o.args[2] === mergedWidth && o.args[3] === mergedHeight)
    expect(mergedFill).toBeDefined()
    // 单格填充矩形（80 × rowHeight）不应出现，证明 anchor 用的是合并矩形而非单格。
    const singleCellFill = fillRects.find(
      (o) => o.args[2] === colsAxis.getSize(0) && o.args[3] === rowsAxis.getSize(0),
    )
    expect(singleCellFill).toBeUndefined()
  })

  it('合并区域内不绘制被覆盖单元格间的内部边框（避免重复内线）', () => {
    const { renderer, ops, viewport, data, rowsAxis, colsAxis } = setup()

    const red = { color: '#d93025', width: 'thin', lineStyle: 'solid' } as const
    // 模拟对 A1:B2 套用 all 预设：每个被覆盖格四边都有边框。
    const allBorders = { top: red, right: red, bottom: red, left: red }

    renderer.render({
      data,
      theme: denseGridTheme,
      rowsAxis,
      colsAxis,
      viewport: viewport.snapshot(),
      collapsedRowGaps: [],
      collapsedColGaps: [],
      cellFormats: [
        { rowIndex: 0, colIndex: 0, format: { borders: allBorders } },
        { rowIndex: 0, colIndex: 1, format: { borders: allBorders } },
        { rowIndex: 1, colIndex: 0, format: { borders: allBorders } },
        { rowIndex: 1, colIndex: 1, format: { borders: allBorders } },
      ],
      mergeRegions: [A1B2],
    })

    // 只看自定义红色边框矩形，排除默认灰色格线与水平边。
    const verticalRects = collectFillRectsByFill(ops, '#d93025').filter((r) => r.height > r.width)
    // denseGridTheme.rowHeaderWidth === 0，故 main region origin.x === 0。
    const internalVerticalX = colsAxis.indexToPosition(1) // 80：A1|B1 内部竖边
    const hasInternalVertical = verticalRects.some((r) => Math.abs(r.x - internalVerticalX) < 0.6)
    expect(hasInternalVertical).toBe(false)
    // 合并区域外框右边（thin 边框占在 col1 右沿内侧，x = 159）仍应绘制，证明只过滤了内部竖边。
    const outerRightX = colsAxis.indexToPosition(1) + colsAxis.getSize(1) // 160
    const hasOuterRight = verticalRects.some((r) => Math.abs(r.x + r.width - outerRightX) < 0.6)
    expect(hasOuterRight).toBe(true)
  })

  it('合并区域内不绘制默认网格线', () => {
    const { renderer, ops, viewport, data, rowsAxis, colsAxis } = setup()

    renderer.render({
      data,
      theme: denseGridTheme,
      rowsAxis,
      colsAxis,
      viewport: viewport.snapshot(),
      collapsedRowGaps: [],
      collapsedColGaps: [],
      mergeRegions: [A1B2],
    })

    const defaultGridSegs = collectSegmentsByStroke(ops, denseGridTheme.colors.gridLine)
    const verticalSegs = defaultGridSegs.filter((s) => Math.abs(s.x1 - s.x2) < 0.01)
    const horizontalSegs = defaultGridSegs.filter((s) => Math.abs(s.y1 - s.y2) < 0.01)
    const mergeTop = denseGridTheme.metrics.headerHeight
    const mergeBottom = mergeTop + rowsAxis.getSize(0) + rowsAxis.getSize(1)
    const mergeLeft = colsAxis.indexToPosition(0)
    const mergeRight = mergeLeft + colsAxis.getSize(0) + colsAxis.getSize(1)
    const overlaps = (a1: number, a2: number, b1: number, b2: number) =>
      Math.max(a1, b1) < Math.min(a2, b2)

    const internalVerticalX = colsAxis.indexToPosition(1)
    const hasInternalVertical = verticalSegs.some(
      (s) => Math.abs(s.x1 - internalVerticalX) < 0.6 && overlaps(s.y1, s.y2, mergeTop, mergeBottom),
    )
    expect(hasInternalVertical).toBe(false)

    const internalHorizontalY = rowsAxis.indexToPosition(1) + denseGridTheme.metrics.headerHeight
    const hasInternalHorizontal = horizontalSegs.some(
      (s) => Math.abs(s.y1 - internalHorizontalY) < 0.6 && overlaps(s.x1, s.x2, mergeLeft, mergeRight),
    )
    expect(hasInternalHorizontal).toBe(false)

    const outerRightX = colsAxis.indexToPosition(1) + colsAxis.getSize(1)
    const hasOuterRight = verticalSegs.some((s) => Math.abs(s.x1 - outerRightX) < 0.6)
    expect(hasOuterRight).toBe(true)
  })

  it('anchor 滚出可见范围但区域仍相交时，仍绘制一次 anchor 内容', () => {
    const { renderer, ops, viewport, data, rowsAxis, colsAxis } = setup()

    // 模拟可见范围从 row1 起（row0 即 anchor 滚出顶部），但区域 A1:B2 仍与可见区相交。
    const snapshot = viewport.snapshot()
    const main = snapshot.regions.find((r) => r.id === 'main')!
    const shifted = {
      ...snapshot,
      regions: snapshot.regions.map((r) =>
        r.id === 'main' ? { ...main, rowRange: [1, 1] as [number, number] } : r,
      ),
    }

    renderer.render({
      data,
      theme: denseGridTheme,
      rowsAxis,
      colsAxis,
      viewport: shifted,
      collapsedRowGaps: [],
      collapsedColGaps: [],
      mergeRegions: [A1B2],
    })

    const texts = textOps(ops)
    // anchor (row0) 的内容 'A1' 仍绘制一次；被覆盖格 A2/B2 不绘制。
    expect(texts.filter((t) => t === 'A1')).toHaveLength(1)
    expect(texts).not.toContain('A2')
    expect(texts).not.toContain('B2')
  })

  it('anchor 滚出可见范围但区域相交时，仍绘制合并填充与外框边框', () => {
    const { renderer, ops, viewport, data, rowsAxis, colsAxis } = setup()

    // 可见范围从 row1 起（anchor row0 滚出顶部），区域 A1:B2 仍与可见区相交。
    const snapshot = viewport.snapshot()
    const main = snapshot.regions.find((r) => r.id === 'main')!
    const shifted = {
      ...snapshot,
      regions: snapshot.regions.map((r) =>
        r.id === 'main' ? { ...main, rowRange: [1, 1] as [number, number] } : r,
      ),
    }

    const red = { color: '#d93025', width: 'thin', lineStyle: 'solid' } as const

    renderer.render({
      data,
      theme: denseGridTheme,
      rowsAxis,
      colsAxis,
      viewport: shifted,
      collapsedRowGaps: [],
      collapsedColGaps: [],
      // 填充按 anchor 整块绘制：anchor (row0,col0) 滚出可见行范围时仍由 engine 以 view 坐标补发其填充。
      // 边框按逐格绘制（model A）：可见覆盖格 B2 (row1,col1) 携带可见外框右/下边。
      cellFormats: [
        { rowIndex: 0, colIndex: 0, format: { fillColor: '#fff2cc' } },
        { rowIndex: 1, colIndex: 1, format: { borders: { right: red, bottom: red } } },
      ],
      mergeRegions: [A1B2],
    })

    // 合并矩形填充仍发出（宽 160、高两行）。
    expect(ops).toContainEqual({ op: 'set:fillStyle', value: '#fff2cc' })
    const mergedWidth = colsAxis.getSize(0) + colsAxis.getSize(1)
    const mergedHeight = rowsAxis.getSize(0) + rowsAxis.getSize(1)
    const fillRects = ops.filter(
      (o): o is Extract<RecordedOp, { op: 'fillRect' }> => o.op === 'fillRect',
    )
    const mergedFill = fillRects.find((o) => o.args[2] === mergedWidth && o.args[3] === mergedHeight)
    expect(mergedFill).toBeDefined()

    // 外框右边（thin 边框占在 col1 右沿内侧）的竖直自定义边框仍被绘制。
    const verticalRects = collectFillRectsByFill(ops, '#d93025').filter((r) => r.height > r.width)
    const outerRightX = colsAxis.indexToPosition(1) + colsAxis.getSize(1) // 160
    const hasOuterRight = verticalRects.some((r) => Math.abs(r.x + r.width - outerRightX) < 0.6)
    expect(hasOuterRight).toBe(true)
  })

  it('无 mergeRegions 时与原行为一致（A1/B1/A2/B2 各绘制一次）', () => {
    const { renderer, ops, viewport, data, rowsAxis, colsAxis } = setup()

    renderer.render({
      data,
      theme: denseGridTheme,
      rowsAxis,
      colsAxis,
      viewport: viewport.snapshot(),
      collapsedRowGaps: [],
      collapsedColGaps: [],
    })

    const texts = textOps(ops)
    expect(texts).toContain('A1')
    expect(texts).toContain('B1')
    expect(texts).toContain('A2')
    expect(texts).toContain('B2')
  })
})
