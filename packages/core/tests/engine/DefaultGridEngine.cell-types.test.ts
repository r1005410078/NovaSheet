import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine, InMemoryDataSource } from '../../src'

function makeEngine(): DefaultGridEngine {
  return new DefaultGridEngine({
    data: new InMemoryDataSource({
      schema: {
        fields: [
          { id: 'a', name: 'A', type: 'text', width: 100 },
          { id: 'b', name: 'B', type: 'number', width: 100 },
        ],
      },
      rows: [{ a: 'x', b: 1 }],
    }),
  })
}

const cell = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 } as const

describe('DefaultGridEngine cell type API', () => {
  it('sets, clears, gets, undoes, and redoes resolved cell type', () => {
    const engine = makeEngine()

    expect(engine.getCellType(0, 0)).toBe('text')
    expect(engine.setCellType(cell, 'date')).toBe(true)
    expect(engine.getCellType(0, 0)).toBe('date')
    expect(engine.clearCellType(cell)).toBe(true)
    expect(engine.getCellType(0, 0)).toBe('text')

    expect(engine.undo()?.kind).toBe('cellType')
    expect(engine.getCellType(0, 0)).toBe('date')
    expect(engine.redo()?.kind).toBe('cellType')
    expect(engine.getCellType(0, 0)).toBe('text')
  })

  it('falls back to normalized column defaults and text for invalid view coordinates', () => {
    const engine = makeEngine()

    expect(engine.getCellType(0, 1)).toBe('number')
    expect(engine.getCellType(0, 99)).toBe('text')
    expect(engine.getCellType(0, -1)).toBe('text')
  })
})
