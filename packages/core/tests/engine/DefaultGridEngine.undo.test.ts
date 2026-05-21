import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'
import type { Schema } from '../../src/data/Schema'

const schema: Schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text', width: 80 },
    { id: 'b', name: 'B', type: 'number', width: 80 },
  ],
}

function makeEngine() {
  const data = new InMemoryDataSource({
    schema,
    rows: [
      { a: 'x', b: 1 },
      { a: 'y', b: 2 },
    ],
  })
  return new DefaultGridEngine({ data })
}

describe('DefaultGridEngine — undo/redo scaffolding', () => {
  it('初始 canUndo / canRedo 均 false', () => {
    const engine = makeEngine()
    expect(engine.canUndo()).toBe(false)
    expect(engine.canRedo()).toBe(false)
  })

  it('undo / redo 在空栈返回 undefined', () => {
    const engine = makeEngine()
    expect(engine.undo()).toBeUndefined()
    expect(engine.redo()).toBeUndefined()
  })

  it('setData 清空栈', () => {
    const engine = makeEngine()
    engine.commitRowResize(0, 24, 50)
    expect(engine.canUndo()).toBe(true)

    const data2 = new InMemoryDataSource({ schema, rows: [{ a: 'p', b: 9 }] })
    engine.setData(data2)
    expect(engine.canUndo()).toBe(false)
    expect(engine.canRedo()).toBe(false)
  })
})

describe('DefaultGridEngine — editCell undo/redo', () => {
  it('commitCellEdit 后 push editCell 命令', () => {
    const engine = makeEngine()
    engine.selectCell({ rowIndex: 0, colIndex: 0 })
    engine.beginCellEdit({ rowIndex: 0, colIndex: 0 })
    engine.updateCellEditDraft('z')
    engine.commitCellEdit()
    expect(engine.canUndo()).toBe(true)
  })

  it('undo 还原原值 + active 落到原 cell + canRedo=true', () => {
    const engine = makeEngine()
    engine.selectCell({ rowIndex: 0, colIndex: 0 })
    engine.beginCellEdit({ rowIndex: 0, colIndex: 0 })
    engine.updateCellEditDraft('z')
    engine.commitCellEdit()
    expect(engine.getData().getCell(0, 'a')).toBe('z')

    const cmd = engine.undo()
    expect(cmd?.kind).toBe('editCell')
    expect(engine.getData().getCell(0, 'a')).toBe('x')
    expect(engine.getSelection().activeCell).toEqual({ rowIndex: 0, colIndex: 0 })
    expect(engine.canRedo()).toBe(true)
  })

  it('redo 重新写入 after', () => {
    const engine = makeEngine()
    engine.selectCell({ rowIndex: 0, colIndex: 0 })
    engine.beginCellEdit({ rowIndex: 0, colIndex: 0 })
    engine.updateCellEditDraft('z')
    engine.commitCellEdit()
    engine.undo()
    engine.redo()
    expect(engine.getData().getCell(0, 'a')).toBe('z')
    expect(engine.canRedo()).toBe(false)
  })

  it('编辑同值仍 push 一步(与 Sheets/Excel 一致)', () => {
    const engine = makeEngine()
    engine.selectCell({ rowIndex: 0, colIndex: 0 })
    engine.beginCellEdit({ rowIndex: 0, colIndex: 0 })
    engine.updateCellEditDraft('x') // 与原值相同
    engine.commitCellEdit()
    expect(engine.canUndo()).toBe(true)
  })

  it('undo/redo 不再 push 新条目(防递归)', () => {
    const engine = makeEngine()
    engine.selectCell({ rowIndex: 0, colIndex: 0 })
    engine.beginCellEdit({ rowIndex: 0, colIndex: 0 })
    engine.updateCellEditDraft('z')
    engine.commitCellEdit()
    engine.undo()
    expect(engine.canRedo()).toBe(true)
    expect(engine.canUndo()).toBe(false)
    engine.redo()
    // 关键:redo 不应该把新命令 push 到 undoStack(否则栈深会变 2)
    expect(engine.canUndo()).toBe(true)
    expect(engine.canRedo()).toBe(false)
    // 再 undo 一次回到清空状态
    engine.undo()
    expect(engine.canUndo()).toBe(false)
    expect(engine.canRedo()).toBe(true)
  })

  it('undo editCell 把多 cell range 选区折叠到受影响 cell', () => {
    const engine = makeEngine()
    // 先建一个多 cell 选区
    engine.selectCell({ rowIndex: 0, colIndex: 0 })
    engine.navigateSelection('ArrowRight', true) // shift+right 扩展
    engine.navigateSelection('ArrowDown', true)
    // 注:此时选区跨越多 cell
    // 然后编辑 active cell
    engine.beginCellEdit({ rowIndex: 0, colIndex: 0 })
    engine.updateCellEditDraft('z')
    engine.commitCellEdit()
    engine.undo()
    const sel = engine.getSelection()
    expect(sel.activeCell).toEqual({ rowIndex: 0, colIndex: 0 })
    // 折叠后,selectedRange 应该是单 cell
    expect(sel.selectedRange).toEqual({
      startRow: 0, endRow: 0, startCol: 0, endCol: 0,
    })
  })
})
