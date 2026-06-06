import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../src/kernel/data/InMemoryDataSource'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import { denseGridTheme } from '../../src/kernel/theme/denseGridTheme'

const schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text' as const, width: 100 },
    { id: 'b', name: 'B', type: 'number' as const, width: 80 },
    { id: 'c', name: 'C', type: 'text' as const, width: 120 },
  ],
}

function mkEngine() {
  const ds = new InMemoryDataSource({
    schema,
    rows: [
      { a: 'r0', b: 0, c: 'x' },
      { a: 'r1', b: 1, c: 'y' },
    ],
  })
  return new DefaultGridEngine({ data: ds, theme: denseGridTheme, frozen: { leftCols: 1 } })
}

describe('UndoStack — insertCols', () => {
  it('insertCols + undo + redo 完全还原 schema 字段数并复用新字段 id', () => {
    const engine = mkEngine()
    const fields = engine.insertCols(1, 2)
    const insertedIds = fields.map((f) => f.id)
    expect(engine.getDataSource().getSchema().fields).toHaveLength(5)

    engine.undo()
    expect(engine.getDataSource().getSchema().fields.map((f) => f.id)).toEqual(['a', 'b', 'c'])

    engine.redo()
    expect(engine.getDataSource().getSchema().fields.slice(1, 3).map((f) => f.id)).toEqual(
      insertedIds,
    )
  })
})

describe('UndoStack — deleteCols', () => {
  it('deleteCols + undo 还原字段定义 + 列 cell 值', () => {
    const engine = mkEngine()
    engine.deleteCols(['b'])
    expect(engine.getDataSource().getSchema().fields.map((f) => f.id)).toEqual(['a', 'c'])

    engine.undo()

    const fields = engine.getDataSource().getSchema().fields
    expect(fields.map((f) => f.id)).toEqual(['a', 'b', 'c'])
    expect(engine.getDataSource().getCell(0, 'b')).toBe(0)
  })
})

describe('UndoStack — hideCols / unhideCols', () => {
  it('hideCols + undo + redo', () => {
    const engine = mkEngine()
    engine.hideCols(['b'])
    expect(engine.getHiddenCols()).toEqual(['b'])

    engine.undo()
    expect(engine.getHiddenCols()).toEqual([])

    engine.redo()
    expect(engine.getHiddenCols()).toEqual(['b'])
  })
})

describe('UndoStack — resizeColumnsMulti', () => {
  it('多列宽度变更 + undo 各列还原', () => {
    const engine = mkEngine()
    engine.setColumnWidths(['a', 'c'], 200)

    engine.undo()

    const fields = engine.getDataSource().getSchema().fields
    expect(fields.find((f) => f.id === 'a')!.width).toBe(100)
    expect(fields.find((f) => f.id === 'c')!.width).toBe(120)
  })
})
