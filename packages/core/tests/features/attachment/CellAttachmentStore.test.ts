import { describe, expect, it } from 'bun:test'
import { CellAttachmentStore } from '../../../src/features/attachment/CellAttachmentStore'

describe('CellAttachmentStore', () => {
  it('set/get round-trips per namespace and cell', () => {
    const s = new CellAttachmentStore()
    s.set('demo', 2, 0, { note: 'y' })
    expect(s.get('demo', 2, 0)).toEqual({ note: 'y' })
    expect(s.get('demo', 2, 1)).toBeUndefined()
    expect(s.get('other', 2, 0)).toBeUndefined()
  })

  it('set undefined clears the entry', () => {
    const s = new CellAttachmentStore()
    s.set('demo', 1, 1, 5)
    s.set('demo', 1, 1, undefined)
    expect(s.get('demo', 1, 1)).toBeUndefined()
  })

  it('snapshot/restore preserves all entries', () => {
    const s = new CellAttachmentStore()
    s.set('demo', 1, 0, 'a')
    s.set('demo', 3, 2, 'b')
    const snap = s.snapshot()
    s.set('demo', 1, 0, 'changed')
    s.restore(snap)
    expect(s.get('demo', 1, 0)).toBe('a')
    expect(s.get('demo', 3, 2)).toBe('b')
  })

  it('remapAfterRowsInserted shifts rows >= at down (mirrors RangeStyleStore)', () => {
    const s = new CellAttachmentStore()
    s.set('demo', 2, 0, 'y')
    s.remapAfterRowsInserted(0, 1)
    expect(s.get('demo', 3, 0)).toBe('y')
    expect(s.get('demo', 2, 0)).toBeUndefined()
  })

  it('remapAfterRowsDeleted drops deleted cell and shifts survivors up', () => {
    const s = new CellAttachmentStore()
    s.set('demo', 1, 0, 'gone')
    s.set('demo', 3, 0, 'keep')
    s.remapAfterRowsDeleted([1])
    expect(s.get('demo', 1, 0)).toBeUndefined() // 'gone' deleted
    expect(s.get('demo', 2, 0)).toBe('keep')    // 3 -> 2
  })
})
