import { describe, expect, it } from 'bun:test'
import { RangeStyleStore } from '../../src/format/RangeStyleStore'

describe('RangeStyleStore', () => {
  it('resolves later fill layers over earlier layers without expanding the full range', () => {
    const store = new RangeStyleStore()
    store.apply({ startRow: 0, endRow: 999_999, startCol: 0, endCol: 499 }, { fillColor: '#fff2cc' })
    store.apply({ startRow: 3, endRow: 4, startCol: 2, endCol: 2 }, { fillColor: '#d9ead3' })

    expect(store.getLayerCount()).toBe(2)
    expect(store.resolveCell(2, 2)?.fillColor).toBe('#fff2cc')
    expect(store.resolveCell(3, 2)?.fillColor).toBe('#d9ead3')
    expect(store.resolveVisible({ startRow: 3, endRow: 4, startCol: 2, endCol: 3 })).toEqual([
      { rowIndex: 3, colIndex: 2, format: { fillColor: '#d9ead3' } },
      { rowIndex: 3, colIndex: 3, format: { fillColor: '#fff2cc' } },
      { rowIndex: 4, colIndex: 2, format: { fillColor: '#d9ead3' } },
      { rowIndex: 4, colIndex: 3, format: { fillColor: '#fff2cc' } },
    ])
  })

  it('clearFill removes only fillColor while keeping other fields available for later tasks', () => {
    const store = new RangeStyleStore()
    store.apply({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 }, { fillColor: '#fff2cc' })
    store.clearFill({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 })

    expect(store.resolveCell(0, 0)).toBeUndefined()
    expect(store.resolveCell(0, 1)?.fillColor).toBe('#fff2cc')
  })
})
