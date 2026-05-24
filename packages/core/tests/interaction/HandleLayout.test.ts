import { describe, expect, it } from 'bun:test'
import {
  ChunkedAxis,
  FrozenRegions,
  InMemoryDataSource,
  Viewport,
  computeResizeHandles,
  denseGridTheme,
  RESIZE_HANDLE_HIT_SIZE,
  type RenderFrame,
  type Schema,
} from '../../src'

const SCHEMA: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 100 },
    { id: 'age', name: 'Age', type: 'number', width: 100 },
    { id: 'role', name: 'Role', type: 'text', width: 100 },
  ],
}

function makeFrame(excel = false): RenderFrame {
  const data = new InMemoryDataSource({
    schema: SCHEMA,
    rows: Array.from({ length: 6 }, (_, i) => ({
      name: `Row ${i}`,
      age: i,
      role: 'Eng',
    })),
  })
  const rowsAxis = new ChunkedAxis({
    count: data.getRowCount(),
    defaultSize: denseGridTheme.metrics.rowHeight,
  })
  const colsAxis = new ChunkedAxis({ count: SCHEMA.fields.length, defaultSize: 100 })
  const frozen = new FrozenRegions(rowsAxis, colsAxis, { topRows: 1, leftCols: 1, rightCols: 1 })
  const viewport = new Viewport(rowsAxis, colsAxis, frozen)
  viewport.setHeaderHeight(denseGridTheme.metrics.headerHeight)
  viewport.setSize(400, 300)
  viewport.setScroll(100, 56)
  if (excel) viewport.setRowHeaderWidth(44)

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

describe('computeResizeHandles — Phase 3.4', () => {
  it('为可见列生成列头 resize handle', () => {
    const frame = makeFrame()
    const handles = computeResizeHandles(frame).filter((h) => h.kind === 'column')

    expect(handles.length).toBeGreaterThan(0)
    const nameHandle = handles.find((h) => h.fieldId === 'name')
    expect(nameHandle).toMatchObject({
      kind: 'column',
      height: denseGridTheme.metrics.headerHeight,
      width: RESIZE_HANDLE_HIT_SIZE,
      y: 0,
    })
    expect(nameHandle!.x).toBe(100 - RESIZE_HANDLE_HIT_SIZE / 2)
  })

  it('Excel 行号列生成行 resize handle', () => {
    const frame = makeFrame(true)
    const rowHandles = computeResizeHandles(frame).filter((h) => h.kind === 'row')

    expect(rowHandles.length).toBeGreaterThan(0)
    expect(rowHandles[0]).toMatchObject({
      kind: 'row',
      x: 0,
      width: 44,
      height: RESIZE_HANDLE_HIT_SIZE,
    })
  })

  it('冻结区与普通区各生成各自列 handle，不重复列索引', () => {
    const frame = makeFrame()
    const colHandles = computeResizeHandles(frame).filter((h) => h.kind === 'column')
    const colIndices = colHandles.map((h) => h.colIndex)
    expect(new Set(colIndices).size).toBe(colIndices.length)
  })
})
