import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine, InMemoryDataSource, denseGridTheme, type Schema } from '../../src'

const SCHEMA: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 200 },
    { id: 'age', name: 'Age', type: 'number', width: 80 },
  ],
}

function makeData(rows = 10) {
  return new InMemoryDataSource({
    schema: SCHEMA,
    rows: Array.from({ length: rows }, (_, i) => ({ name: `n${i}`, age: i })),
  })
}

describe('DefaultGridEngine', () => {
  it('initializes with default theme + schema-driven column widths', () => {
    const engine = new DefaultGridEngine({ data: makeData(5) })
    expect(engine.getRowsAxis().getCount()).toBe(5)
    expect(engine.getColsAxis().getCount()).toBe(2)
    expect(engine.getTheme()).toBe(denseGridTheme)
  })

  it('setData rebuilds axes', () => {
    const engine = new DefaultGridEngine({ data: makeData(5) })
    engine.setData(makeData(100))
    expect(engine.getRowsAxis().getCount()).toBe(100)
  })

  it('setRowHeight updates the axis', () => {
    const engine = new DefaultGridEngine({ data: makeData(10) })
    const before = engine.getRowsAxis().getSize(3)
    engine.setRowHeight(3, before * 2)
    expect(engine.getRowsAxis().getSize(3)).toBe(before * 2)
  })

  it('setColumnWidth updates the axis by fieldId', () => {
    const engine = new DefaultGridEngine({ data: makeData(10) })
    engine.setColumnWidth('age', 250)
    expect(engine.getColsAxis().getSize(1)).toBe(250)
  })

  it('setColumnWidth on unknown fieldId is a no-op', () => {
    const engine = new DefaultGridEngine({ data: makeData(10) })
    expect(() => engine.setColumnWidth('nope', 250)).not.toThrow()
  })

  it('getFrame returns the engine snapshot', () => {
    const engine = new DefaultGridEngine({ data: makeData(10) })
    engine.setViewportSize(400, 300)
    const frame = engine.getFrame()
    expect(frame.data.getRowCount()).toBe(10)
    expect(frame.theme).toBe(denseGridTheme)
    expect(frame.rowsAxis.getCount()).toBe(10)
    expect(frame.viewport.contentRect.width).toBe(400)
  })
})
