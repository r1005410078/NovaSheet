import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import type { DataSource } from '../../src/data/DataSource'
import type { Schema } from '../../src/data/Schema'

const schema: Schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text', width: 80 },
    { id: 'b', name: 'B', type: 'number', width: 80 },
  ],
}

function engine() {
  return new DefaultGridEngine({
    data: new InMemoryDataSource({
      schema,
      rows: [
        { a: 'Item 1', b: 1 },
        { a: 'Item 2', b: 3 },
        { a: null, b: null },
        { a: null, b: null },
      ],
    }),
  })
}

describe('DefaultGridEngine.commitFill', () => {
  it('writes fill range and leaves source unchanged', () => {
    const e = engine()
    const result = e.commitFill(
      { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
      { startRow: 2, endRow: 3, startCol: 0, endCol: 1 },
      'down',
    )
    expect(result?.writes.length).toBe(4)
    expect(e.getData().getCell(0, 'a')).toBe('Item 1')
    expect(e.getData().getCell(2, 'a')).toBe('Item 3')
    expect(e.getData().getCell(3, 'b')).toBe(7)
    expect(e.getSelection().selectedRange).toEqual({ startRow: 0, endRow: 3, startCol: 0, endCol: 1 })
  })

  it('pushes one undo command and restores fill range only', () => {
    const e = engine()
    e.commitFill(
      { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
      { startRow: 2, endRow: 3, startCol: 0, endCol: 1 },
      'down',
    )
    const cmd = e.undo()
    expect(cmd?.kind).toBe('fill')
    expect(e.getData().getCell(2, 'a')).toBeNull()
    expect(e.getData().getCell(3, 'b')).toBeNull()
    expect(e.getData().getCell(0, 'a')).toBe('Item 1')
    expect(e.getSelection().selectedRange).toEqual({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 })
  })

  it('redo writes fill values again and restores result selection', () => {
    const e = engine()
    e.commitFill(
      { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
      { startRow: 2, endRow: 3, startCol: 0, endCol: 1 },
      'down',
    )
    e.undo()
    const cmd = e.redo()
    expect(cmd?.kind).toBe('fill')
    expect(e.getData().getCell(2, 'a')).toBe('Item 3')
    expect(e.getSelection().selectedRange).toEqual({ startRow: 0, endRow: 3, startCol: 0, endCol: 1 })
  })

  it('non-mutable data source does not write or push undo', () => {
    const readonly: DataSource = {
      getRowCount: () => 2,
      getSchema: () => schema,
      getRows: () => [],
      getCell: () => null,
      subscribe: () => () => {},
    }
    const e = new DefaultGridEngine({ data: readonly })
    expect(e.commitFill({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, { startRow: 1, endRow: 1, startCol: 0, endCol: 0 }, 'down')).toBeNull()
    expect(e.canUndo()).toBe(false)
  })
})
