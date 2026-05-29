import { describe, expect, it } from 'bun:test'
import { pasteTargetConflictsWithMerges } from '../../src/clipboard/ApplyPaste'

describe('pasteTargetConflictsWithMerges', () => {
  it('rejects target ranges that partially overlap merge regions', () => {
    const target = { startRow: 0, endRow: 0, startCol: 0, endCol: 0, tile: { rows: 1, cols: 1 } }
    const merges = [
      { id: 'merge-1', range: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 }, anchor: { rowIndex: 0, colIndex: 0 } },
    ]

    expect(pasteTargetConflictsWithMerges(target, merges)).toBe(true)
  })
})
