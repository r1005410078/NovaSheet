import { describe, expect, it } from 'bun:test'
import { DefaultFormatState } from '../../../src/features/format/FormatState'
import { asRawRange } from '../../../src/kernel/coords/coordinates'

describe('DefaultFormatState', () => {
  it('starts with empty stores', () => {
    const state = new DefaultFormatState()
    expect(state.resolveCellFormat(0, 0)).toBeUndefined()
    expect(state.getMergeRegionAt(0, 0)).toBeNull()
  })

  it('restoreFormat round-trips through formatStore', () => {
    const state = new DefaultFormatState()
    state.formatStore.apply(asRawRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }), {
      fillColor: '#abc',
    })
    const snap = state.formatStore.snapshot()
    state.restoreFormat([])
    expect(state.resolveCellFormat(0, 0)).toBeUndefined()
    state.restoreFormat(snap)
    expect(state.resolveCellFormat(0, 0)?.fillColor).toBe('#abc')
  })

  it('remapFormatAfterRowsDeleted sorts rowIds before delegating', () => {
    const state = new DefaultFormatState()
    state.formatStore.apply(asRawRange({ startRow: 1, endRow: 1, startCol: 0, endCol: 0 }), {
      fillColor: '#x',
    })
    state.remapFormatAfterRowsDeleted([2, 0])
    expect(state.resolveCellFormat(0, 0)?.fillColor).toBe('#x')
    expect(state.resolveCellFormat(1, 0)).toBeUndefined()
  })
})
