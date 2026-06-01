import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '../../src/context/SheetContext'
import type { CellHandle } from '../../src/context/RuntimeScope'

function makeCellHandle(value: unknown): CellHandle {
  return {
    value: () => value,
    rect: () => ({ x: 0, y: 0, width: 100, height: 28 }),
    address: () => ({ rowIndex: 0, colIndex: 0 }),
    range: () => ({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }),
    commit: () => {},
    invalidate: () => {},
  }
}

describe('SheetContext', () => {
  it('registers a cell extension by type', () => {
    const ctx = createSheetContext()
    const draw = () => {}

    ctx.extensions.cell('rating', { draw })

    expect(ctx.registry.cells.get('rating')?.draw).toBe(draw)
  })

  it('throws when runtime accessors are used outside a scope', () => {
    const ctx = createSheetContext()

    expect(() => ctx.cell()).toThrow('NovaSheet: ctx.cell() is only available during a cell scope')
  })

  it('provides runtime handles inside a scope', () => {
    const ctx = createSheetContext()
    const value = ctx.run({ cell: makeCellHandle(3) }, () => ctx.cell().value())

    expect(value).toBe(3)
    expect(() => ctx.cell()).toThrow()
  })
})
