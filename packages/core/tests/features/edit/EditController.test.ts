import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../../src'
import { EditController } from '../../../src/features/edit/EditController'
import type { EditControllerContext } from '../../../src/features/edit/EditController'
import { CellEditModel } from '../../../src/features/edit/CellEditModel'
import { CellAttachmentStore } from '../../../src/features/attachment/CellAttachmentStore'
import type { MutableDataSource } from '../../../src/kernel/data/MutableDataSource'
import type { CellAddress, CellRange } from '../../../src/kernel/coords/SelectionTypes'
import { dateToSerial } from '../../../src/kernel/protocol/serial'

function makeDataSource(overrides: Partial<MutableDataSource> = {}): MutableDataSource {
  return {
    getSchema: () => ({ fields: [{ id: 'a', name: 'A', type: 'text', width: 100 }] }),
    getRowCount: () => 2,
    getCell: () => 'old',
    getRows: () => [],
    updateCell: () => {},
    ...overrides,
  } as MutableDataSource
}

function makeCtx(overrides: Partial<EditControllerContext> = {}): {
  ctx: EditControllerContext
  pushed: unknown[]
} {
  const pushed: unknown[] = []
  const ctx: EditControllerContext = {
    getData: overrides.getData ?? (() => makeDataSource()),
    getCellTypes: overrides.getCellTypes ?? (() => ({})),
    getLocale: overrides.getLocale ?? (() => 'en-US'),
    resolveEditCell: overrides.resolveEditCell ?? ((c) => c),
    resolveCellType: overrides.resolveCellType ?? ((_cell, field) => field.type),
    viewRowToRaw: overrides.viewRowToRaw ?? ((r) => r),
    viewColToRaw: overrides.viewColToRaw ?? ((c) => c),
    pushUndo: overrides.pushUndo ?? ((c) => pushed.push(c)),
    getAttachmentStore: overrides.getAttachmentStore ?? (() => new CellAttachmentStore()),
  }
  return { ctx, pushed }
}

describe('EditController', () => {
  it('commit 成功入栈 editCell，rowIndex 为 raw', () => {
    const { ctx, pushed } = makeCtx({ viewRowToRaw: () => 99 })
    const ec = new EditController(new CellEditModel(), ctx)
    const cell: CellAddress = { rowIndex: 0, colIndex: 0 }
    expect(ec.beginCellEdit(cell)).toBe(true)
    ec.updateDraft('new')
    expect(ec.commit()).toBe(true)
    expect(pushed[0]).toMatchObject({ kind: 'editCell', rowIndex: 99, after: 'new' })
  })

  it('resolveEditCell 返回 merge anchor 作为编辑格', () => {
    const anchor: CellAddress = { rowIndex: 0, colIndex: 0 }
    const { ctx } = makeCtx({ resolveEditCell: () => anchor })
    const ec = new EditController(new CellEditModel(), ctx)
    expect(ec.beginCellEdit({ rowIndex: 5, colIndex: 0 })).toBe(true)
    expect(ec.getSession()?.cell).toEqual(anchor)
  })

  it('uses resolved type for begin draft formatting and commit parsing', () => {
    const data = new InMemoryDataSource({
      schema: { fields: [{ id: 'a', name: 'A', type: 'text', width: 100 }] },
      rows: [{ a: dateToSerial(new Date(Date.UTC(2025, 0, 15))) }],
    })
    const { ctx } = makeCtx({
      getData: () => data,
      resolveCellType: () => 'date',
    })
    const ec = new EditController(new CellEditModel(), ctx)

    expect(ec.beginCellEdit({ rowIndex: 0, colIndex: 0 })).toBe(true)
    expect(ec.getSession()).toMatchObject({
      fieldId: 'a',
      fieldType: 'date',
      draft: '2025-01-15',
    })

    ec.updateDraft('2025-01-16')

    expect(ec.commit()).toBe(true)
    expect(data.getCell(0, 'a')).toBe(dateToSerial(new Date(Date.UTC(2025, 0, 16))))
  })

  it('clearRange 入栈 view range，before 条目用 raw rowIndex', () => {
    const updates: { row: number; fieldId: string; value: unknown }[] = []
    const { ctx, pushed } = makeCtx({
      viewRowToRaw: (r) => r + 100,
      getData: () =>
        makeDataSource({
          getCell: () => 'x',
          updateCell: (row: number, fieldId: string, value: unknown) =>
            updates.push({ row, fieldId, value }),
        }),
    })
    const ec = new EditController(new CellEditModel(), ctx)
    const range: CellRange = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }
    ec.clearRange(range)
    expect(updates).toEqual([{ row: 0, fieldId: 'a', value: null }])
    expect(pushed[0]).toMatchObject({
      kind: 'clearRange',
      range,
      before: [{ rowIndex: 100, fieldId: 'a', value: 'x' }],
    })
  })

  it('clearRange 清除 attachment 并 bundle 进同一 undo（undo 恢复 attachment）', () => {
    const store = new CellAttachmentStore()
    // 预置 raw(0,0) 有 attachment
    store.set('demo', 0, 0, { v: 1 })

    const pushed: unknown[] = []
    const ctx: EditControllerContext = {
      getData: () =>
        makeDataSource({
          getCell: () => 'x',
          updateCell: () => {},
        }),
      getCellTypes: () => ({}),
      getLocale: () => 'en-US',
      resolveEditCell: (c) => c,
      resolveCellType: (_cell, field) => field.type,
      viewRowToRaw: (r) => r, // raw = view（简化）
      viewColToRaw: (c) => c, // raw = view（简化）
      pushUndo: (c) => pushed.push(c),
      getAttachmentStore: () => store,
    }
    const ec = new EditController(new CellEditModel(), ctx)
    const range: CellRange = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }
    ec.clearRange(range)

    // attachment 被清除
    expect(store.get('demo', 0, 0)).toBeUndefined()

    // 单一 pushUndo 调用，携带 attachmentBefore/After
    expect(pushed).toHaveLength(1)
    const cmd = pushed[0] as { kind: string; attachmentBefore: unknown[]; attachmentAfter: unknown[] }
    expect(cmd.kind).toBe('clearRange')
    expect(cmd.attachmentBefore).toEqual([{ row: 0, col: 0, namespace: 'demo', data: { v: 1 } }])
    expect(cmd.attachmentAfter).toEqual([])

    // 模拟 undo：restore attachmentBefore
    store.restore(cmd.attachmentBefore as Parameters<CellAttachmentStore['restore']>[0])
    expect(store.get('demo', 0, 0)).toEqual({ v: 1 })
  })
})
