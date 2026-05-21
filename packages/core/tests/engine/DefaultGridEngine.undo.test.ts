import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'
import type { Schema } from '../../src/data/Schema'
import type { ApplyPasteSource, PasteTargetRect } from '../../src/clipboard/ApplyPaste'

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

  it('undo editCell 把多 cell range 选区折叠到受影响 cell (Task 3)', () => {
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

describe('DefaultGridEngine — clearRange undo/redo', () => {
  it('clearRange 收集非空 cell 为 before 后 push 一条', () => {
    const engine = makeEngine()
    engine.clearRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 })
    expect(engine.getData().getCell(0, 'a')).toBeNull()
    expect(engine.getData().getCell(0, 'b')).toBeNull()
    expect(engine.canUndo()).toBe(true)
  })

  it('clearRange 全空范围不 push', () => {
    const engine = makeEngine()
    engine.clearRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 })
    expect(engine.canUndo()).toBe(true)
    // 再清一次:此时全是 null
    engine.clearRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 })
    // 栈深仍为 1(第二次未 push)
    engine.undo()
    expect(engine.canUndo()).toBe(false)
  })

  it('undo clearRange 恢复原值 + 选区设回 range', () => {
    const engine = makeEngine()
    engine.clearRange({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 })
    const cmd = engine.undo()
    expect(cmd?.kind).toBe('clearRange')
    expect(engine.getData().getCell(0, 'a')).toBe('x')
    expect(engine.getData().getCell(0, 'b')).toBe(1)
    expect(engine.getData().getCell(1, 'a')).toBe('y')
    expect(engine.getData().getCell(1, 'b')).toBe(2)
    const sel = engine.getSelection()
    expect(sel.activeCell).toEqual({ rowIndex: 0, colIndex: 0 })
    expect(sel.selectedRange).toEqual({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 })
  })

  it('redo clearRange 再次清除', () => {
    const engine = makeEngine()
    engine.clearRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 })
    engine.undo()
    engine.redo()
    expect(engine.getData().getCell(0, 'a')).toBeNull()
    expect(engine.getData().getCell(0, 'b')).toBeNull()
  })

  it('clearRange 跳过原本就 null 的 cell:undo 只恢复非空格', () => {
    const engine = makeEngine()
    // 手动把 (0,1) 设为 null,模拟混合状态
    const data = engine.getData() as unknown as { updateCell(rowIndex: number, fieldId: string, value: null): void }
    data.updateCell(0, 'b', null)
    expect(engine.getData().getCell(0, 'a')).toBe('x')
    expect(engine.getData().getCell(0, 'b')).toBeNull()

    // 清栈(updateCell 不经过 commitCellEdit,不会 push 到 undo 栈)
    expect(engine.canUndo()).toBe(false)

    engine.clearRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 })
    expect(engine.getData().getCell(0, 'a')).toBeNull()
    expect(engine.getData().getCell(0, 'b')).toBeNull()

    engine.undo()
    expect(engine.getData().getCell(0, 'a')).toBe('x')
    expect(engine.getData().getCell(0, 'b')).toBeNull() // 原本就是 null,不应被恢复成 1
  })
})

describe('DefaultGridEngine — commitPaste undo/redo', () => {
  function pasteSource(cells: (string | number | null)[][], fieldIds: string[]): ApplyPasteSource {
    return {
      cells,
      sourceFieldIds: fieldIds,
      typed: false,
    }
  }
  function targetRect(startRow: number, endRow: number, startCol: number, endCol: number): PasteTargetRect {
    return { startRow, endRow, startCol, endCol, tile: { rows: 1, cols: 1 } }
  }

  it('commitPaste 写入 + push paste 命令', () => {
    const engine = makeEngine()
    engine.commitPaste(
      pasteSource([['p', 99]], ['a', 'b']),
      targetRect(0, 0, 0, 1),
      ['a', 'b'],
    )
    expect(engine.getData().getCell(0, 'a')).toBe('p')
    expect(engine.getData().getCell(0, 'b')).toBe(99)
    expect(engine.canUndo()).toBe(true)
  })

  it('undo commitPaste 恢复 before;redo 恢复 after', () => {
    const engine = makeEngine()
    engine.commitPaste(
      pasteSource([['p', 99]], ['a', 'b']),
      targetRect(0, 0, 0, 1),
      ['a', 'b'],
    )
    engine.undo()
    expect(engine.getData().getCell(0, 'a')).toBe('x')
    expect(engine.getData().getCell(0, 'b')).toBe(1)
    engine.redo()
    expect(engine.getData().getCell(0, 'a')).toBe('p')
    expect(engine.getData().getCell(0, 'b')).toBe(99)
  })

  it('类型不匹配跳过的格子不记录 + onSkipped 仍触发', () => {
    const engine = makeEngine()
    let skippedCount = 0
    engine.commitPaste(
      pasteSource([['p', 'not-a-number']], ['a', 'b']),
      targetRect(0, 0, 0, 1),
      ['a', 'b'],
      (skipped) => { skippedCount = skipped.length },
    )
    expect(skippedCount).toBe(1)
    expect(engine.getData().getCell(0, 'a')).toBe('p')
    expect(engine.getData().getCell(0, 'b')).toBe(1)  // 未变
    engine.undo()
    expect(engine.getData().getCell(0, 'a')).toBe('x')
    expect(engine.getData().getCell(0, 'b')).toBe(1)
  })

  it('全部跳过 → 不 push', () => {
    const engine = makeEngine()
    // 单格 source 落在 b 列(number),'not-a-number' 会被跳过
    engine.commitPaste(
      pasteSource([['not-a-number']], ['b']),
      targetRect(0, 0, 1, 1),
      ['a', 'b'],
    )
    expect(engine.canUndo()).toBe(false)
  })

  it('typed:true 路径同样进 undo 栈(写入前 onWrite + 跳过 coerce)', () => {
    const engine = makeEngine()
    // typed:true 表示 cells 已是 CellValue,跳过 coerceForType;b 列直接接收 number
    const typedSource: ApplyPasteSource = {
      cells: [['typed-text', 42]],
      sourceFieldIds: ['a', 'b'],
      typed: true,
    }
    engine.commitPaste(typedSource, targetRect(0, 0, 0, 1), ['a', 'b'])
    expect(engine.getData().getCell(0, 'a')).toBe('typed-text')
    expect(engine.getData().getCell(0, 'b')).toBe(42)
    expect(engine.canUndo()).toBe(true)

    engine.undo()
    expect(engine.getData().getCell(0, 'a')).toBe('x')
    expect(engine.getData().getCell(0, 'b')).toBe(1)

    engine.redo()
    expect(engine.getData().getCell(0, 'a')).toBe('typed-text')
    expect(engine.getData().getCell(0, 'b')).toBe(42)
  })
})

describe('DefaultGridEngine — resize undo/redo', () => {
  it('commitRowResize 相等不 push', () => {
    const engine = makeEngine()
    engine.commitRowResize(0, 24, 24)
    expect(engine.canUndo()).toBe(false)
  })

  it('undo resizeRow 恢复旧高', () => {
    const engine = makeEngine()
    const before = engine.getRowsAxis().getSize(0)
    engine.commitRowResize(0, before, 80)
    expect(engine.getRowsAxis().getSize(0)).toBe(80)
    engine.undo()
    expect(engine.getRowsAxis().getSize(0)).toBe(before)
  })

  it('redo resizeRow 还原新高', () => {
    const engine = makeEngine()
    const before = engine.getRowsAxis().getSize(0)
    engine.commitRowResize(0, before, 80)
    engine.undo()
    engine.redo()
    expect(engine.getRowsAxis().getSize(0)).toBe(80)
  })

  it('commitColumnResize 对称', () => {
    const engine = makeEngine()
    const before = engine.getColsAxis().getSize(0)
    engine.commitColumnResize(0, before, 200)
    expect(engine.getColsAxis().getSize(0)).toBe(200)
    engine.undo()
    expect(engine.getColsAxis().getSize(0)).toBe(before)
    engine.redo()
    expect(engine.getColsAxis().getSize(0)).toBe(200)
  })
})

describe('DefaultGridEngine — capacity + non-mutable resize', () => {
  it('栈深 100:101 次 commit 后最早一条被挤掉', () => {
    const engine = makeEngine()
    for (let i = 0; i < 101; i++) {
      engine.commitRowResize(0, 20 + i, 21 + i)
    }
    let popped = 0
    while (engine.canUndo()) {
      engine.undo()
      popped++
    }
    expect(popped).toBe(100)
  })

  it('非 MutableDataSource: resize 仍可 commit', () => {
    const readonly = new InMemoryDataSource({
      schema,
      rows: [{ a: 'r', b: 7 }],
    })
    // 移除 updateCell 让 isMutableDataSource() 返回 false
    ;(readonly as unknown as { updateCell?: unknown }).updateCell = undefined
    const engine = new DefaultGridEngine({ data: readonly })
    engine.commitRowResize(0, 24, 60)
    expect(engine.canUndo()).toBe(true)
  })
})
