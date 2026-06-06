import { describe, expect, it } from 'bun:test'
import { MergeStore } from '../../../src/features/merge/MergeStore'
import { asRawRange } from '../../../src/kernel/coords/coordinates'

describe('MergeStore', () => {
  it('creates merge regions and maps any covered cell to the anchor region', () => {
    const store = new MergeStore()
    const region = store.merge(asRawRange({ startRow: 1, endRow: 2, startCol: 3, endCol: 4 }))

    expect(region).toEqual({
      id: 'merge-1',
      range: { startRow: 1, endRow: 2, startCol: 3, endCol: 4 },
      anchor: { rowIndex: 1, colIndex: 3 },
    })
    expect(store.getRegionAt(2, 4)?.id).toBe('merge-1')
    expect(store.getRegionAt(0, 0)).toBeNull()
  })

  it('rejects single-cell and overlapping merges', () => {
    const store = new MergeStore()
    expect(store.merge(asRawRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }))).toBeNull()
    expect(store.merge(asRawRange({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 }))?.id).toBe('merge-1')
    expect(store.merge(asRawRange({ startRow: 1, endRow: 2, startCol: 1, endCol: 2 }))).toBeNull()
  })
})
