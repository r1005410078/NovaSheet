import { describe, expect, it } from 'bun:test'
import { RangeStyleStore } from '../../../src/features/format/RangeStyleStore'
import { asRawRange } from '../../../src/kernel/coords/coordinates'

describe('RangeStyleStore structural remap', () => {
  it('shifts format ranges after rows and columns are inserted', () => {
    const store = new RangeStyleStore()
    store.apply(asRawRange({ startRow: 2, endRow: 3, startCol: 1, endCol: 1 }), { fillColor: '#fff2cc' })

    store.remapAfterRowsInserted(1, 2)
    store.remapAfterColsInserted(1, 1)

    expect(store.resolveCell(4, 2)?.fillColor).toBe('#fff2cc')
    expect(store.resolveCell(2, 1)).toBeUndefined()
  })

  it('drops deleted rows and columns from format ranges', () => {
    const store = new RangeStyleStore()
    store.apply(asRawRange({ startRow: 0, endRow: 2, startCol: 0, endCol: 2 }), { fillColor: '#fff2cc' })

    store.remapAfterRowsDeleted([1])
    store.remapAfterColsDeleted([0])

    expect(store.resolveCell(0, 0)?.fillColor).toBe('#fff2cc')
    expect(store.resolveCell(1, 1)?.fillColor).toBe('#fff2cc')
    expect(store.resolveCell(2, 1)).toBeUndefined()
  })

  it('moves format ranges with row and column reorder index maps', () => {
    const store = new RangeStyleStore()
    store.apply(asRawRange({ startRow: 0, endRow: 0, startCol: 1, endCol: 1 }), { fillColor: '#fff2cc' })

    store.remapByRowIndexMap(new Map([[0, 2], [1, 0], [2, 1]]))
    store.remapByColIndexMap(new Map([[0, 1], [1, 2], [2, 0]]))

    expect(store.resolveCell(2, 2)?.fillColor).toBe('#fff2cc')
    expect(store.resolveCell(0, 1)).toBeUndefined()
  })
})
