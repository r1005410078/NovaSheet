import { describe, expect, it } from 'bun:test'
import { MergeStore } from '../../src/merge/MergeStore'
import { asRawRange } from '../../src/view/coordinates'

describe('MergeStore structural remap', () => {
  it('shifts merge regions after insertions', () => {
    const store = new MergeStore()
    store.merge(asRawRange({ startRow: 2, endRow: 3, startCol: 1, endCol: 2 }))

    store.remapAfterRowsInserted(1, 2)
    store.remapAfterColsInserted(1, 1)

    expect(store.getRegionAt(4, 2)?.range).toEqual({ startRow: 4, endRow: 5, startCol: 2, endCol: 3 })
  })

  it('removes merge regions touched by deleted rows or columns', () => {
    const store = new MergeStore()
    store.merge(asRawRange({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 }))

    store.remapAfterRowsDeleted([1])

    expect(store.getRegionAt(0, 0)).toBeNull()
  })

  it('moves merge regions with row and column reorder index maps', () => {
    const store = new MergeStore()
    store.merge(asRawRange({ startRow: 0, endRow: 1, startCol: 1, endCol: 2 }))

    store.remapByRowIndexMap(new Map([[0, 2], [1, 3], [2, 0], [3, 1]]))
    store.remapByColIndexMap(new Map([[0, 0], [1, 3], [2, 4], [3, 1], [4, 2]]))

    expect(store.getRegionAt(2, 3)?.range).toEqual({ startRow: 2, endRow: 3, startCol: 3, endCol: 4 })
  })
})
