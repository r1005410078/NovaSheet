import { describe, expect, it } from 'bun:test'
import { SelectionModel } from '../../src/interaction/SelectionModel'

describe('SelectionModel.remapAfterRowsInserted', () => {
  it('选区在 at 之后整体下移', () => {
    const sel = new SelectionModel()
    sel.setSelection({
      activeCell: { rowIndex: 5, colIndex: 0 },
      anchorCell: { rowIndex: 5, colIndex: 0 },
      extentCell: { rowIndex: 7, colIndex: 1 },
      selectedRange: { startRow: 5, endRow: 7, startCol: 0, endCol: 1 },
    })
    sel.remapAfterRowsInserted(3, 2)
    const s = sel.getSelection()
    expect(s.activeCell?.rowIndex).toBe(7)
    expect(s.selectedRange).toEqual({ startRow: 7, endRow: 9, startCol: 0, endCol: 1 })
  })
})

describe('SelectionModel.remapAfterRowsDeleted', () => {
  it('选区跨越被删行 → 折叠到首个存活行', () => {
    const sel = new SelectionModel()
    sel.setSelection({
      activeCell: { rowIndex: 3, colIndex: 0 },
      anchorCell: { rowIndex: 3, colIndex: 0 },
      extentCell: { rowIndex: 5, colIndex: 0 },
      selectedRange: { startRow: 3, endRow: 5, startCol: 0, endCol: 0 },
    })
    sel.remapAfterRowsDeleted([4])
    const s = sel.getSelection()
    expect(s.selectedRange).toEqual({ startRow: 3, endRow: 4, startCol: 0, endCol: 0 })
  })

  it('选区全部被删 → clear', () => {
    const sel = new SelectionModel()
    sel.setSelection({
      activeCell: { rowIndex: 2, colIndex: 0 },
      anchorCell: { rowIndex: 2, colIndex: 0 },
      extentCell: { rowIndex: 3, colIndex: 0 },
      selectedRange: { startRow: 2, endRow: 3, startCol: 0, endCol: 0 },
    })
    sel.remapAfterRowsDeleted([2, 3])
    expect(sel.getSelection().selectedRange).toBeNull()
  })
})
