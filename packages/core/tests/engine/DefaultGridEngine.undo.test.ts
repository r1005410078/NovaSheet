import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import { InMemoryDataSource } from '../../src/kernel/data/InMemoryDataSource'
import { FilterLayer } from '../../src/view/FilterLayer'
import { SortLayer } from '../../src/view/SortLayer'
import type { DataSource, DataSourceListener } from '../../src/kernel/data/DataSource'
import type { CellValue, Row, Schema } from '../../src/kernel/data/Schema'
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

class RecordingDataSource extends InMemoryDataSource {
  writesByUnderlying: Array<{ row: number; fieldId: string; value: CellValue }> = []

  override updateCellByUnderlyingRow(row: number, fieldId: string, value: CellValue): void {
    this.writesByUnderlying.push({ row, fieldId, value })
    super.updateCellByUnderlyingRow(row, fieldId, value)
  }
}

function makeFilteredSortedData() {
  const source = new RecordingDataSource({
    schema,
    rows: [
      { a: 'skip', b: 100 },
      { a: 'keep-low', b: 1 },
      { a: 'keep-high', b: 9 },
    ],
  })
  const filter = new FilterLayer()
  filter.setSpec({
    fieldId: 'a',
    op: { kind: 'text-contains', value: 'keep', caseSensitive: false },
  })
  const sort = new SortLayer()
  sort.setSpec({ fieldId: 'b', direction: 'desc' })
  const filtered = filter.wrap(source)
  const composed = sort.wrap(filtered)
  return { source, composed }
}

class OrderedViewDataSource implements DataSource {
  constructor(
    private readonly source: RecordingDataSource,
    private order: number[],
  ) {}

  setOrder(order: number[]): void {
    this.order = order
  }

  getRowCount(): number {
    return this.order.length
  }

  getSchema(): Schema {
    return this.source.getSchema()
  }

  getRows(startIndex: number, endIndex: number): Row[] {
    const rows: Row[] = []
    for (let viewRow = startIndex; viewRow <= endIndex; viewRow += 1) {
      const underlyingRow = this.order[viewRow]
      if (underlyingRow == null) continue
      const [row] = this.source.getRows(underlyingRow, underlyingRow)
      if (row) rows.push(row)
    }
    return rows
  }

  getCell(rowIndex: number, fieldId: string): CellValue | undefined {
    const underlyingRow = this.order[rowIndex]
    return underlyingRow == null ? undefined : this.source.getCell(underlyingRow, fieldId)
  }

  resolveUnderlyingRow(viewRow: number): number {
    return this.order[viewRow] ?? -1
  }

  findViewRow(underlyingRow: number): number {
    return this.order.indexOf(underlyingRow)
  }

  subscribe(_listener: DataSourceListener): () => void {
    return () => {}
  }

  updateCell(rowIndex: number, fieldId: string, value: CellValue): void {
    const underlyingRow = this.order[rowIndex]
    if (underlyingRow == null) return
    this.source.updateCellByUnderlyingRow(underlyingRow, fieldId, value)
  }

  updateCellByUnderlyingRow(row: number, fieldId: string, value: CellValue): void {
    this.source.updateCellByUnderlyingRow(row, fieldId, value)
  }
}

function makeOrderedViewData(order = [2, 1]) {
  const source = new RecordingDataSource({
    schema,
    rows: [
      { a: 'skip', b: 100 },
      { a: 'keep-low', b: 1 },
      { a: 'keep-high', b: 9 },
    ],
  })
  const view = new OrderedViewDataSource(source, order)
  return { source, view }
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

  it('setViewData does not clear undo stack', () => {
    const engine = makeEngine()
    engine.commitRowResize(0, 24, 50)
    expect(engine.canUndo()).toBe(true)

    const data2 = new InMemoryDataSource({ schema, rows: [{ a: 'p', b: 9 }] })
    engine.setViewData(data2)
    expect(engine.canUndo()).toBe(true)
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
      startRow: 0,
      endRow: 0,
      startCol: 0,
      endCol: 0,
    })
  })

  it('stores editCell undo row as underlying row through filtered sorted view', () => {
    const { source, composed } = makeFilteredSortedData()
    const engine = new DefaultGridEngine({ data: composed })
    expect(composed.resolveUnderlyingRow?.(0)).toBe(2)

    engine.beginCellEdit({ rowIndex: 0, colIndex: 0 })
    engine.updateCellEditDraft('keep-edited')
    engine.commitCellEdit()
    expect(source.getCell(2, 'a')).toBe('keep-edited')

    const cmd = engine.undo()
    expect(cmd).toMatchObject({
      kind: 'editCell',
      rowIndex: 2,
      fieldId: 'a',
      before: 'keep-high',
      after: 'keep-edited',
    })
    expect(source.getCell(2, 'a')).toBe('keep-high')
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
    const data = engine.getData() as unknown as {
      updateCell(rowIndex: number, fieldId: string, value: null): void
    }
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

  it('stores clearRange before writes by underlying row through filtered sorted view', () => {
    const { composed } = makeFilteredSortedData()
    const engine = new DefaultGridEngine({ data: composed })
    expect(composed.resolveUnderlyingRow?.(0)).toBe(2)

    engine.clearRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 })
    const cmd = engine.undo()
    expect(cmd?.kind).toBe('clearRange')
    if (cmd?.kind !== 'clearRange') return
    expect(cmd.before).toEqual([
      { rowIndex: 2, fieldId: 'a', value: 'keep-high' },
      { rowIndex: 2, fieldId: 'b', value: 9 },
    ])
  })

  it('undo clearRange maps range selection to visible written rows after view order changes', () => {
    const { view } = makeOrderedViewData()
    const engine = new DefaultGridEngine({ data: view })

    engine.clearRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 })
    view.setOrder([1, 2])
    engine.undo()

    expect(engine.getSelection().activeCell).toEqual({ rowIndex: 1, colIndex: 0 })
    expect(engine.getSelection().selectedRange).toEqual({
      startRow: 1,
      endRow: 1,
      startCol: 0,
      endCol: 1,
    })
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
  function targetRect(
    startRow: number,
    endRow: number,
    startCol: number,
    endCol: number,
  ): PasteTargetRect {
    return { startRow, endRow, startCol, endCol, tile: { rows: 1, cols: 1 } }
  }

  it('commitPaste 写入 + push paste 命令', () => {
    const engine = makeEngine()
    engine.commitPaste(pasteSource([['p', 99]], ['a', 'b']), targetRect(0, 0, 0, 1), ['a', 'b'])
    expect(engine.getData().getCell(0, 'a')).toBe('p')
    expect(engine.getData().getCell(0, 'b')).toBe(99)
    expect(engine.canUndo()).toBe(true)
  })

  it('undo commitPaste 恢复 before;redo 恢复 after', () => {
    const engine = makeEngine()
    engine.commitPaste(pasteSource([['p', 99]], ['a', 'b']), targetRect(0, 0, 0, 1), ['a', 'b'])
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
      (skipped) => {
        skippedCount = skipped.length
      },
    )
    expect(skippedCount).toBe(1)
    expect(engine.getData().getCell(0, 'a')).toBe('p')
    expect(engine.getData().getCell(0, 'b')).toBe(1) // 未变
    engine.undo()
    expect(engine.getData().getCell(0, 'a')).toBe('x')
    expect(engine.getData().getCell(0, 'b')).toBe(1)
  })

  it('全部跳过 → 不 push', () => {
    const engine = makeEngine()
    // 单格 source 落在 b 列(number),'not-a-number' 会被跳过
    engine.commitPaste(pasteSource([['not-a-number']], ['b']), targetRect(0, 0, 1, 1), ['a', 'b'])
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

  it('stores paste before/after writes by underlying row through filtered sorted view', () => {
    const { composed } = makeFilteredSortedData()
    const engine = new DefaultGridEngine({ data: composed })
    expect(composed.resolveUnderlyingRow?.(0)).toBe(2)

    engine.commitPaste(pasteSource([['pasted', 99]], ['a', 'b']), targetRect(0, 0, 0, 1), [
      'a',
      'b',
    ])
    const cmd = engine.undo()
    expect(cmd?.kind).toBe('paste')
    if (cmd?.kind !== 'paste') return
    expect(cmd.before).toEqual([
      { rowIndex: 2, fieldId: 'a', value: 'keep-high' },
      { rowIndex: 2, fieldId: 'b', value: 9 },
    ])
    expect(cmd.after).toEqual([
      { rowIndex: 2, fieldId: 'a', value: 'pasted' },
      { rowIndex: 2, fieldId: 'b', value: 99 },
    ])
  })

  it('undo uses updateCellByUnderlyingRow when underlying row is not visible', () => {
    const { source, composed } = makeFilteredSortedData()
    const hiddenOnReplay = composed as typeof composed & {
      findViewRow(underlyingRow: number): number
    }
    hiddenOnReplay.findViewRow = () => -1
    const engine = new DefaultGridEngine({ data: hiddenOnReplay })

    engine.commitPaste(pasteSource([['pasted']], ['a']), targetRect(0, 0, 0, 0), ['a', 'b'])
    engine.undo()
    expect(source.writesByUnderlying.at(-1)).toEqual({
      row: 2,
      fieldId: 'a',
      value: 'keep-high',
    })
  })

  it('undo paste leaves selection unchanged when written rows are hidden after view changes', () => {
    const { view } = makeOrderedViewData()
    const engine = new DefaultGridEngine({ data: view })
    engine.selectCell({ rowIndex: 1, colIndex: 1 })

    engine.commitPaste(pasteSource([['pasted']], ['a']), targetRect(0, 0, 0, 0), ['a', 'b'])
    view.setOrder([])
    engine.undo()

    expect(engine.getSelection().activeCell).toEqual({ rowIndex: 1, colIndex: 1 })
    expect(engine.getSelection().selectedRange).toEqual({
      startRow: 1,
      endRow: 1,
      startCol: 1,
      endCol: 1,
    })
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
