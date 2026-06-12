import { describe, expect, it } from 'bun:test'
import { EditController } from '../../../src/features/edit/EditController'
import type { EditControllerContext } from '../../../src/features/edit/EditController'
import { CellEditModel } from '../../../src/features/edit/CellEditModel'
import type { MutableDataSource } from '../../../src/kernel/data/MutableDataSource'
import type { CellAddress, CellRange } from '../../../src/kernel/coords/SelectionTypes'

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
    viewRowToRaw: overrides.viewRowToRaw ?? ((r) => r),
    pushUndo: overrides.pushUndo ?? ((c) => pushed.push(c)),
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
})
