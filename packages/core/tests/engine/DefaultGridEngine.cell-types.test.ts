import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine, InMemoryDataSource } from '../../src'
import { dateToSerial } from '../../src/kernel/protocol/serial'

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

  it('rejects type writes for invalid view rows and cols without pushing undo', () => {
    const engine = makeEngine()

    expect(engine.setCellType({ startRow: -1, endRow: -1, startCol: 0, endCol: 0 }, 'date')).toBe(false)
    expect(engine.clearCellType({ startRow: -1, endRow: -1, startCol: 0, endCol: 0 })).toBe(false)
    expect(engine.canUndo()).toBe(false)

    expect(engine.setCellType({ startRow: 99, endRow: 99, startCol: 0, endCol: 0 }, 'date')).toBe(false)
    expect(engine.clearCellType({ startRow: 99, endRow: 99, startCol: 0, endCol: 0 })).toBe(false)
    expect(engine.canUndo()).toBe(false)

    expect(engine.setCellType({ startRow: 0, endRow: 0, startCol: -1, endCol: -1 }, 'date')).toBe(false)
    expect(engine.clearCellType({ startRow: 0, endRow: 0, startCol: -1, endCol: -1 })).toBe(false)
    expect(engine.canUndo()).toBe(false)
  })

  it('frame resolveCellType and formatCell use resolved type for default date pattern', () => {
    const serial = dateToSerial(new Date(Date.UTC(2025, 0, 15)))
    const engine = new DefaultGridEngine({
      data: new InMemoryDataSource({
        schema: {
          fields: [{ id: 'a', name: 'A', type: 'text', width: 100 }],
        },
        rows: [{ a: serial }],
      }),
    })

    expect(engine.setCellType(cell, 'date')).toBe(true)

    const frame = engine.getFrame()
    const field = frame.data.getSchema().fields[0]!

    expect(frame.resolveCellType?.(0, 0, field)).toBe('date')
    expect(frame.formatCell?.(0, 0, field, serial)).toBe('2025-01-15')
  })

  it('uses resolved type instead of column field.type for built-in edit parse and format', () => {
    const serial = dateToSerial(new Date(Date.UTC(2025, 0, 15)))
    const data = new InMemoryDataSource({
      schema: {
        fields: [{ id: 'v', name: 'V', type: 'text', width: 100 }],
      },
      rows: [{ v: serial }],
    })
    const engine = new DefaultGridEngine({ data })

    expect(engine.setCellType(cell, 'date')).toBe(true)
    expect(engine.beginCellEdit({ rowIndex: 0, colIndex: 0 })).toBe(true)
    expect(engine.getFrame().cellEdit?.draft).toBe('2025-01-15')

    engine.updateCellEditDraft('2025-01-16')

    expect(engine.commitCellEdit()).toBe(true)
    expect(data.getCell(0, 'v')).toBe(dateToSerial(new Date(Date.UTC(2025, 0, 16))))
  })

  it('keeps overrides aligned after row and column insertions', () => {
    const engine = makeEngine()
    engine.setCellType({ startRow: 0, endRow: 0, startCol: 1, endCol: 1 }, 'date')

    engine.insertRows(0, 1)
    engine.insertCols(1, 1)

    expect(engine.getCellType(1, 2)).toBe('date')
    expect(engine.getCellType(0, 1)).toBe('text')
  })

  it('drops deleted override cells and restores them through structural undo/redo', () => {
    const engine = new DefaultGridEngine({
      data: new InMemoryDataSource({
        schema: {
          fields: [
            { id: 'a', name: 'A', type: 'text', width: 100 },
            { id: 'b', name: 'B', type: 'number', width: 100 },
          ],
        },
        rows: [{ a: 'x', b: 1 }, { a: 'y', b: 2 }],
      }),
    })
    engine.setCellType({ startRow: 0, endRow: 0, startCol: 1, endCol: 1 }, 'date')

    engine.deleteRows([0])
    expect(engine.getCellType(0, 1)).toBe('number')

    engine.undo()
    expect(engine.getCellType(0, 1)).toBe('date')

    engine.redo()
    expect(engine.getCellType(0, 1)).toBe('number')
  })

  it('keeps overrides aligned after row and column moves with undo/redo', () => {
    const engine = new DefaultGridEngine({
      data: new InMemoryDataSource({
        schema: {
          fields: [
            { id: 'a', name: 'A', type: 'text', width: 100 },
            { id: 'b', name: 'B', type: 'text', width: 100 },
            { id: 'c', name: 'C', type: 'text', width: 100 },
          ],
        },
        rows: [
          { a: 'A1', b: 'B1', c: 'C1' },
          { a: 'A2', b: 'B2', c: 'C2' },
          { a: 'A3', b: 'B3', c: 'C3' },
        ],
      }),
    })
    engine.setCellType({ startRow: 0, endRow: 0, startCol: 1, endCol: 1 }, 'date')

    expect(engine.moveRows([0, 1], null)).toBe(true)
    expect(engine.moveCols(['a'], null)).toBe(true)
    expect(engine.getCellType(1, 0)).toBe('date')

    engine.undo()
    expect(engine.getCellType(1, 1)).toBe('date')

    engine.undo()
    expect(engine.getCellType(0, 1)).toBe('date')

    engine.redo()
    engine.redo()
    expect(engine.getCellType(1, 0)).toBe('date')
  })
})
