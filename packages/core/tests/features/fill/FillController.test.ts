import { describe, expect, it } from 'bun:test'
import { FillController } from '../../../src/features/fill/FillController'
import type { FillControllerContext } from '../../../src/features/fill/FillController'
import type { MutableDataSource } from '../../../src/kernel/data/MutableDataSource'
import type { CellRange } from '../../../src/kernel/coords/SelectionTypes'
import type { FillStyleSnapshots } from '../../../src/features/fill/FillStylePropagator'

function makeData(overrides: Partial<MutableDataSource> = {}): MutableDataSource {
  return {
    getSchema: () => ({
      fields: [
        { id: 'a', name: 'A', type: 'text', width: 100 },
        { id: 'b', name: 'B', type: 'text', width: 100 },
      ],
    }),
    getRowCount: () => 4,
    getCell: (row, fieldId) => `${row}-${fieldId}`,
    getRows: () => [],
    updateCell: () => {},
    ...overrides,
  } as MutableDataSource
}

function makeCtx(overrides: Partial<FillControllerContext> = {}): {
  ctx: FillControllerContext
  pushed: unknown[]
  propagated: unknown[]
  selected: CellRange | null
} {
  const pushed: unknown[] = []
  const propagated: unknown[] = []
  let selected: CellRange | null = null
  const emptyStyles: FillStyleSnapshots = {}
  const ctx: FillControllerContext = {
    getMutableData: () => makeData(),
    viewRowToRaw: (r) => r,
    pushUndo: (c) => pushed.push(c),
    propagateFillStyles: (s, f, d) => {
      propagated.push({ s, f, d })
      return emptyStyles
    },
    selectRange: (r) => {
      selected = r
    },
    ...overrides,
  }
  return { ctx, pushed, propagated, get selected() { return selected } }
}

describe('FillController', () => {
  it('空 writes 返回 null', () => {
    const source: CellRange = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }
    const fill: CellRange = { startRow: 1, endRow: 1, startCol: 99, endCol: 99 }
    const { ctx, pushed } = makeCtx()
    const fc = new FillController(ctx)
    expect(fc.commit(source, fill, 'down')).toBeNull()
    expect(pushed).toHaveLength(0)
  })

  it('成功 push fill undo 并调 propagateFillStyles + selectRange', () => {
    const source: CellRange = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }
    const fill: CellRange = { startRow: 1, endRow: 1, startCol: 0, endCol: 0 }
    const bag = makeCtx()
    const fc = new FillController(bag.ctx)
    const result = fc.commit(source, fill, 'down')
    expect(result?.writes).toHaveLength(1)
    expect(bag.pushed[0]).toMatchObject({ kind: 'fill', source, fill })
    expect(bag.propagated).toHaveLength(1)
    expect(bag.selected).toEqual({ startRow: 0, endRow: 1, startCol: 0, endCol: 0 })
  })
})
