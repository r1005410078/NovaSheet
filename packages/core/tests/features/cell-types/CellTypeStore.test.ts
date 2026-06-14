import { describe, expect, it } from 'bun:test'
import { CellTypeStore, normalizeFieldType } from '../../../src/features/cell-types'
import { asRawRange } from '../../../src/kernel/coords/coordinates'
import type { Field } from '../../../src/kernel/data/Schema'

const fields = {
  text: { id: 't', name: 'T', type: 'text', width: 80 },
  number: { id: 'n', name: 'N', type: 'number', width: 80 },
  date: { id: 'd', name: 'D', type: 'date', width: 80 },
  checkbox: { id: 'c', name: 'C', type: 'checkbox', width: 80 },
  url: { id: 'u', name: 'U', type: 'url', width: 80 },
  select: { id: 's', name: 'S', type: 'singleSelect', width: 80 },
  multiSelect: { id: 'm', name: 'M', type: 'multiSelect', width: 80 },
  custom: { id: 'x', name: 'X', type: 'rating', width: 80 },
} satisfies Record<string, Field>

describe('CellTypeStore', () => {
  it('normalizes field defaults into scalar resolved types', () => {
    expect(normalizeFieldType(fields.text.type)).toBe('text')
    expect(normalizeFieldType(fields.number.type)).toBe('number')
    expect(normalizeFieldType(fields.date.type)).toBe('date')
    expect(normalizeFieldType(fields.checkbox.type)).toBe('checkbox')
    expect(normalizeFieldType(fields.url.type)).toBe('text')
    expect(normalizeFieldType(fields.select.type)).toBe('text')
    expect(normalizeFieldType(fields.multiSelect.type)).toBe('text')
    expect(normalizeFieldType(fields.custom.type)).toBe('text')
  })

  it('sets, clears, resolves, snapshots, and restores raw overrides deterministically', () => {
    const store = new CellTypeStore()
    store.set(asRawRange({ startRow: 2, endRow: 2, startCol: 3, endCol: 3 }), 'checkbox')
    store.set(asRawRange({ startRow: 1, endRow: 2, startCol: 1, endCol: 1 }), 'date')

    expect(store.get(1, 1)).toBe('date')
    expect(store.resolve(1, 1, fields.number)).toBe('date')
    expect(store.resolve(0, 1, fields.number)).toBe('number')

    expect(store.snapshot()).toEqual([
      { rowIndex: 1, colIndex: 1, type: 'date' },
      { rowIndex: 2, colIndex: 1, type: 'date' },
      { rowIndex: 2, colIndex: 3, type: 'checkbox' },
    ])

    const snap = store.snapshot()
    store.clear(asRawRange({ startRow: 1, endRow: 1, startCol: 1, endCol: 1 }))
    expect(store.resolve(1, 1, fields.number)).toBe('number')
    expect(store.resolve(2, 1, fields.number)).toBe('date')
    store.restore(snap)
    expect(store.resolve(1, 1, fields.number)).toBe('date')
  })

  it('remaps rows and columns after insert/delete/move', () => {
    const store = new CellTypeStore()
    store.set(asRawRange({ startRow: 1, endRow: 1, startCol: 1, endCol: 1 }), 'date')
    store.set(asRawRange({ startRow: 3, endRow: 3, startCol: 2, endCol: 2 }), 'checkbox')

    store.remapAfterRowsInserted(1, 2)
    expect(store.get(3, 1)).toBe('date')
    expect(store.get(5, 2)).toBe('checkbox')

    store.remapAfterRowsDeleted([4])
    expect(store.get(3, 1)).toBe('date')
    expect(store.get(4, 2)).toBe('checkbox')

    store.remapAfterColsInserted(1, 1)
    expect(store.get(3, 2)).toBe('date')
    expect(store.get(4, 3)).toBe('checkbox')

    store.remapAfterColsDeleted([3])
    expect(store.get(4, 3)).toBeUndefined()
    expect(store.get(3, 2)).toBe('date')

    store.remapByRowIndexMap(new Map([[3, 0]]))
    expect(store.get(0, 2)).toBe('date')
    expect(store.get(3, 2)).toBeUndefined()

    store.remapByColIndexMap(new Map([[2, 0]]))
    expect(store.get(0, 0)).toBe('date')
    expect(store.get(0, 2)).toBeUndefined()
  })

  it('drops overrides on deleted rows and columns', () => {
    const store = new CellTypeStore()
    store.set(asRawRange({ startRow: 1, endRow: 1, startCol: 1, endCol: 1 }), 'date')
    store.set(asRawRange({ startRow: 2, endRow: 2, startCol: 1, endCol: 1 }), 'checkbox')
    store.set(asRawRange({ startRow: 4, endRow: 4, startCol: 3, endCol: 3 }), 'number')

    store.remapAfterRowsDeleted([2])
    expect(store.get(2, 1)).toBeUndefined()
    expect(store.get(1, 1)).toBe('date')
    expect(store.get(3, 3)).toBe('number')

    store.remapAfterColsDeleted([3])
    expect(store.get(3, 3)).toBeUndefined()
    expect(store.snapshot()).toEqual([{ rowIndex: 1, colIndex: 1, type: 'date' }])
  })

  it('keeps only explicitly mapped rows and columns when remapping by index maps', () => {
    const store = new CellTypeStore()
    store.set(asRawRange({ startRow: 1, endRow: 1, startCol: 1, endCol: 1 }), 'date')
    store.set(asRawRange({ startRow: 2, endRow: 2, startCol: 2, endCol: 2 }), 'checkbox')
    store.set(asRawRange({ startRow: 3, endRow: 3, startCol: 3, endCol: 3 }), 'number')

    store.remapByRowIndexMap(new Map([[1, 10], [3, 30]]))
    expect(store.get(10, 1)).toBe('date')
    expect(store.get(30, 3)).toBe('number')
    expect(store.get(2, 2)).toBeUndefined()
    expect(store.snapshot()).toEqual([
      { rowIndex: 10, colIndex: 1, type: 'date' },
      { rowIndex: 30, colIndex: 3, type: 'number' },
    ])

    store.remapByColIndexMap(new Map([[3, 0]]))
    expect(store.get(30, 0)).toBe('number')
    expect(store.get(10, 1)).toBeUndefined()
    expect(store.snapshot()).toEqual([{ rowIndex: 30, colIndex: 0, type: 'number' }])
  })
})
