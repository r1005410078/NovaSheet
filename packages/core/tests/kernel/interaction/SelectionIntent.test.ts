import { describe, expect, it } from 'bun:test'
import {
  ChunkedAxis,
  FrozenRegions,
  InMemoryDataSource,
  Viewport,
  denseGridTheme,
  type RenderFrame,
  type Schema,
} from '../../../src'
import { resolveSelectionBehavior } from '../../../src/kernel/interaction/SelectionBehavior'
import { resolveSelectionIntent } from '../../../src/kernel/interaction/SelectionIntent'

const SCHEMA: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 100 },
    { id: 'age', name: 'Age', type: 'number', width: 100 },
    { id: 'role', name: 'Role', type: 'text', width: 100 },
  ],
}

function makeFrame(options: { rowHeaderWidth?: number } = {}): RenderFrame {
  const data = new InMemoryDataSource({
    schema: SCHEMA,
    rows: [
      { name: 'Alice', age: 30, role: 'Engineer' },
      { name: 'Bob', age: 25, role: 'Designer' },
      { name: 'Carol', age: 40, role: 'PM' },
      { name: 'Dave', age: 35, role: 'QA' },
    ],
  })
  const rowsAxis = new ChunkedAxis({ count: data.getRowCount(), defaultSize: denseGridTheme.metrics.rowHeight })
  const colsAxis = new ChunkedAxis({ count: SCHEMA.fields.length, defaultSize: 100 })
  const frozen = new FrozenRegions(rowsAxis, colsAxis, { topRows: 1, leftCols: 1, rightCols: 1 })
  const viewport = new Viewport(rowsAxis, colsAxis, frozen)
  viewport.setHeaderHeight(denseGridTheme.metrics.headerHeight)
  if (options.rowHeaderWidth !== undefined) viewport.setRowHeaderWidth(options.rowHeaderWidth)
  viewport.setSize(300, 144)
  viewport.setScroll(0, 0)
  return {
    data,
    theme: denseGridTheme,
    rowsAxis,
    colsAxis,
    viewport: viewport.snapshot(),
    collapsedRowGaps: [],
    collapsedColGaps: [],
  }
}

describe('resolveSelectionIntent — region → 选择意图', () => {
  const behavior = resolveSelectionBehavior({
    frozenPanes: { left: 'row', right: 'row', top: 'column', topLeft: 'cell', topRight: 'column' },
  })

  it('middleLeft→row、topCenter→column、交叉区按独立配置、main→cell', () => {
    const frame = makeFrame()
    expect(resolveSelectionIntent(frame, { x: 50, y: 74 }, behavior)).toEqual({ kind: 'row', rowIndex: 1 })
    expect(resolveSelectionIntent(frame, { x: 150, y: 46 }, behavior)).toEqual({ kind: 'column', colIndex: 1 })
    expect(resolveSelectionIntent(frame, { x: 50, y: 46 }, behavior)).toEqual({
      kind: 'cell',
      cell: { rowIndex: 0, colIndex: 0 },
    })
    expect(resolveSelectionIntent(frame, { x: 150, y: 74 }, behavior)).toEqual({
      kind: 'cell',
      cell: { rowIndex: 1, colIndex: 1 },
    })
  })

  it('缺省 behavior 下所有数据 region 均为 cell', () => {
    const frame = makeFrame()
    expect(resolveSelectionIntent(frame, { x: 50, y: 74 }, resolveSelectionBehavior())).toEqual({
      kind: 'cell',
      cell: { rowIndex: 1, colIndex: 0 },
    })
  })

  it('表头带与空白区返回 null（不消费）', () => {
    expect(resolveSelectionIntent(makeFrame(), { x: 150, y: 16 }, behavior)).toBeNull()
  })

  it('corner：all 配置返回 all，none 配置返回 none，无 rowHeader 时不判 corner', () => {
    const withHeader = makeFrame({ rowHeaderWidth: 48 })
    expect(resolveSelectionIntent(withHeader, { x: 8, y: 8 }, resolveSelectionBehavior({ headerCorner: 'all' }))).toEqual({ kind: 'all' })
    expect(resolveSelectionIntent(withHeader, { x: 8, y: 8 }, resolveSelectionBehavior())).toEqual({ kind: 'none' })
    expect(resolveSelectionIntent(makeFrame(), { x: 8, y: 8 }, resolveSelectionBehavior({ headerCorner: 'all' }))).toBeNull()
  })
})
