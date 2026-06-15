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

const customTypeSchema: Schema = {
  fields: [
    { id: 'title', name: 'Title', type: 'text', width: 80 },
    { id: 'score', name: 'Score', type: 'rating', width: 80 },
    { id: 'done', name: 'Done', type: 'progress', width: 80 },
  ],
}

function engine(rows: Row[] = [{ a: 1, b: null, c: null }, { a: 2, b: null, c: null }]) {
  return new DefaultGridEngine({ data: new InMemoryDataSource({ schema, rows }) })
}

function customTypeEngine(
  rows: Row[] = [{ title: 'Renderer and editor', score: 4, done: 0.2 }],
  options: { fillCellTypes?: boolean } = {},
) {
  return new DefaultGridEngine({
    data: new InMemoryDataSource({ schema: customTypeSchema, rows }),
    ...options,
  })
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

  it('custom field type 跨列填充时覆盖目标单元格类型并支持 undo/redo', () => {
    const e = customTypeEngine()

    e.commitFill(cell(0, 1), cell(0, 2), 'right')

    expect(e.getCellType(0, 2)).toBe('rating')
    e.undo()
    expect(e.getCellType(0, 2)).toBe('progress')
    e.redo()
    expect(e.getCellType(0, 2)).toBe('rating')
  })

  it('fillCellTypes=false 时只填充值，不把目标单元格类型覆盖成源类型', () => {
    const e = customTypeEngine(undefined, { fillCellTypes: false })

    e.commitFill(cell(0, 0), cell(0, 1), 'right')

    expect(e.getCellType(0, 1)).toBe('rating')
    expect(e.getData().getCell(0, 'score')).toBe('Renderer and editor')
  })
})
