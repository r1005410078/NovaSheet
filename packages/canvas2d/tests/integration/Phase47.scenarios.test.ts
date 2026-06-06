import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource, denseGridTheme, type GridEngine } from '@novasheet/core'
import { Grid } from '@novasheet/core'
import { canvas2dBackend } from '../../src/backend/canvas2dBackend'

const SCHEMA = {
  fields: [
    { id: 'a', name: 'A', type: 'text' as const, width: 100 },
    { id: 'b', name: 'B', type: 'text' as const, width: 110 },
    { id: 'c', name: 'C', type: 'text' as const, width: 120 },
    { id: 'd', name: 'D', type: 'text' as const, width: 130 },
  ],
}

function mkGrid() {
  const data = new InMemoryDataSource({
    schema: { fields: SCHEMA.fields.map((field) => ({ ...field })) },
    rows: [{ a: 'A', b: 'B', c: 'C', d: 'D' }],
  })
  const container = document.createElement('div')
  Object.assign(container.style, { width: '500px', height: '300px' })
  document.body.appendChild(container)
  return { grid: new Grid(container, { backend: canvas2dBackend, data, theme: denseGridTheme }), data, container }
}

function engineOf(grid: Grid): GridEngine {
  return (grid as unknown as { delegate: { engine: GridEngine } }).delegate.engine
}

describe('Phase 4.7 E2E', () => {
  it('moving B:C to the end preserves cells, hidden ids, and undo/redo', () => {
    const { grid, data, container } = mkGrid()
    grid.hideCols(['d'])

    expect(grid.moveCols(['b', 'c'], null)).toBe(true)

    expect(data.getSchema().fields.map((field) => field.id)).toEqual(['a', 'd', 'b', 'c'])
    expect(data.getCell(0, 'c')).toBe('C')
    expect(grid.getHiddenCols()).toEqual(['d'])
    expect(engineOf(grid).getColsAxis().getSize(1)).toBe(110)

    grid.undo()
    expect(data.getSchema().fields.map((field) => field.id)).toEqual(['a', 'b', 'c', 'd'])

    grid.redo()
    expect(data.getSchema().fields.map((field) => field.id)).toEqual(['a', 'd', 'b', 'c'])

    grid.destroy()
    container.remove()
  })
})
