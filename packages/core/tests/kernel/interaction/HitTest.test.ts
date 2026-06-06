import { describe, expect, it } from 'bun:test'
import {
  ChunkedAxis,
  FrozenRegions,
  InMemoryDataSource,
  Viewport,
  denseGridTheme,
  hitTestCell,
  type RenderFrame,
  type Schema,
} from '../../../src'

const SCHEMA: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 100 },
    { id: 'age', name: 'Age', type: 'number', width: 100 },
    { id: 'role', name: 'Role', type: 'text', width: 100 },
  ],
}

function makeFrame(): RenderFrame {
  const data = new InMemoryDataSource({
    schema: SCHEMA,
    rows: [
      { name: 'Alice', age: 30, role: 'Engineer' },
      { name: 'Bob', age: 25, role: 'Designer' },
      { name: 'Carol', age: 40, role: 'PM' },
      { name: 'Dave', age: 35, role: 'QA' },
    ],
  })
  const rowsAxis = new ChunkedAxis({
    count: data.getRowCount(),
    defaultSize: denseGridTheme.metrics.rowHeight,
  })
  const colsAxis = new ChunkedAxis({ count: SCHEMA.fields.length, defaultSize: 100 })
  const frozen = new FrozenRegions(rowsAxis, colsAxis, { topRows: 1, leftCols: 1, rightCols: 1 })
  const viewport = new Viewport(rowsAxis, colsAxis, frozen)
  viewport.setHeaderHeight(denseGridTheme.metrics.headerHeight)
  viewport.setSize(300, 144)
  viewport.setScroll(100, 56)

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

describe('hitTestCell — canvas 坐标命中单元格', () => {
  it('忽略列头区域，只命中 body 单元格', () => {
    const frame = makeFrame()

    expect(hitTestCell(frame, { x: 120, y: 16 })).toBeNull()
    expect(hitTestCell(frame, { x: 220, y: 72 })).toEqual({
      rowIndex: 2,
      colIndex: 2,
    })
  })

  it('优先命中冻结区域，支持左冻结列与右冻结列', () => {
    const frame = makeFrame()

    expect(hitTestCell(frame, { x: 20, y: 72 })).toEqual({
      rowIndex: 2,
      colIndex: 0,
    })
    expect(hitTestCell(frame, { x: 220, y: 72 })).toEqual({
      rowIndex: 2,
      colIndex: 2,
    })
  })
})
