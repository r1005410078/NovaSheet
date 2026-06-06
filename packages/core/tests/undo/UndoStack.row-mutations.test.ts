// Task 8 预写测试：定义 Task 10/11 将实现的 engine API 契约。
// Task 10 落地后移除了 @ts-expect-error 标注，4 项测试全部 GREEN。
import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import { InMemoryDataSource } from '../../src/kernel/data/InMemoryDataSource'
import { denseGridTheme } from '../../src/kernel/theme/denseGridTheme'

const schema = { fields: [{ id: 'a', name: 'A', type: 'text' as const, width: 100 }] }

function mkEngine(rowCount: number) {
  const ds = new InMemoryDataSource({
    schema,
    rows: Array.from({ length: rowCount }, (_, i) => ({ a: `r${i}` })),
  })
  return new DefaultGridEngine({ data: ds, theme: denseGridTheme })
}

describe('UndoStack — insertRows', () => {
  it('apply 后行数 +N，undo 后还原；redo 等价于第一次 apply', () => {
    const engine = mkEngine(3)
    engine.insertRows(1, 2)
    expect(engine.getDataSource().getRowCount()).toBe(5)
    engine.undo()
    expect(engine.getDataSource().getRowCount()).toBe(3)
    engine.redo()
    expect(engine.getDataSource().getRowCount()).toBe(5)
  })
})

describe('UndoStack — deleteRows', () => {
  it('undo 后行内容（含 schema 外字段）完全还原', () => {
    const engine = mkEngine(3)
    engine.deleteRows([1])
    engine.undo()
    expect(engine.getDataSource().getCell(1, 'a')).toBe('r1')
  })
})

describe('UndoStack — hideRows / unhideRows', () => {
  it('hideRows → undo → unhide 集合一致', () => {
    const engine = mkEngine(5)
    engine.hideRows([2, 3])
    engine.undo()
    expect(engine.getHiddenRows()).toEqual([])
    engine.redo()
    expect(engine.getHiddenRows().slice().sort((a, b) => a - b)).toEqual([2, 3])
  })
})

describe('UndoStack — resizeRowsMulti', () => {
  it('多行高度变更 + undo 各行还原原始高度', () => {
    const engine = mkEngine(3)
    engine.setRowHeights([0, 2], 60)
    engine.undo()
    const h0 = engine.getRowHeight(0)
    const defaultH = engine.getDefaultRowHeight()
    expect(h0).toBe(defaultH)
    expect(engine.getRowHeight(2)).toBe(defaultH)
  })
})
