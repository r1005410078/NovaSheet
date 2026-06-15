import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import { InMemoryDataSource } from '../../src/kernel/data/InMemoryDataSource'
import type { CellRange } from '../../src/kernel/coords/SelectionTypes'
import type { Row, Schema } from '../../src/kernel/data/Schema'

const schema: Schema = {
  fields: [
    { id: 'a', name: 'A', type: 'date', width: 80 },
    { id: 'b', name: 'B', type: 'text', width: 80 },
    { id: 'c', name: 'C', type: 'number', width: 80 },
  ],
}

function engine(rows: Row[] = [{ a: 1, b: null, c: null }, { a: 2, b: null, c: null }]) {
  return new DefaultGridEngine({ data: new InMemoryDataSource({ schema, rows }) })
}

function cell(rowIndex: number, colIndex: number): CellRange {
  return { startRow: rowIndex, endRow: rowIndex, startCol: colIndex, endCol: colIndex }
}

function range(startRow: number, endRow: number, startCol: number, endCol: number): CellRange {
  return { startRow, endRow, startCol, endCol }
}

describe('DefaultGridEngine.commitFill — resolved cell type propagation', () => {
  it('向右填充按行携带源 resolved type 并覆盖目标列默认类型', () => {
    const e = engine()

    e.commitFill(range(0, 1, 0, 0), range(0, 1, 1, 1), 'right')

    expect(e.getCellType(0, 1)).toBe('date')
    expect(e.getCellType(1, 1)).toBe('date')
  })

  it('目标格已有 override 时按源 resolved type 重写，undo/redo 恢复', () => {
    const e = engine()
    e.setCellType(cell(1, 1), 'text')

    e.commitFill(range(0, 1, 0, 0), range(0, 1, 1, 1), 'right')

    expect(e.getCellType(1, 1)).toBe('date')
    e.undo()
    expect(e.getCellType(1, 1)).toBe('text')
    e.redo()
    expect(e.getCellType(1, 1)).toBe('date')
  })

  it('源 resolved type 等于目标列默认类型时清除目标陈旧 override', () => {
    const e = engine()
    e.setCellType(cell(1, 1), 'date')

    e.commitFill(cell(0, 1), cell(1, 1), 'down')

    expect(e.getCellType(1, 1)).toBe('text')
    e.undo()
    expect(e.getCellType(1, 1)).toBe('date')
    e.redo()
    expect(e.getCellType(1, 1)).toBe('text')
  })
})
