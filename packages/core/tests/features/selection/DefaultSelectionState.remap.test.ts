import { describe, expect, it } from 'bun:test'
import { DefaultSelectionState } from '../../../src/features/selection/DefaultSelectionState'
import type { GridSelection } from '../../../src/features/selection/SelectionTypes'

/** anchor/extent 必须与 selectedRange 的规整结果一致——聚合根不变量。 */
function expectConsistent(s: GridSelection): void {
  expect(s.anchorCell).not.toBeNull()
  expect(s.extentCell).not.toBeNull()
  expect(s.selectedRange).not.toBeNull()
  const a = s.anchorCell!
  const e = s.extentCell!
  expect(s.selectedRange).toEqual({
    startRow: Math.min(a.rowIndex, e.rowIndex),
    endRow: Math.max(a.rowIndex, e.rowIndex),
    startCol: Math.min(a.colIndex, e.colIndex),
    endCol: Math.max(a.colIndex, e.colIndex),
  })
}

describe('DefaultSelectionState.remapAfterRowsInserted', () => {
  it('选区在 at 之后整体下移', () => {
    const sel = new DefaultSelectionState()
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

describe('DefaultSelectionState.remapAfterRowsDeleted', () => {
  it('选区跨越被删行 → 折叠到首个存活行', () => {
    const sel = new DefaultSelectionState()
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
    const sel = new DefaultSelectionState()
    sel.setSelection({
      activeCell: { rowIndex: 2, colIndex: 0 },
      anchorCell: { rowIndex: 2, colIndex: 0 },
      extentCell: { rowIndex: 3, colIndex: 0 },
      selectedRange: { startRow: 2, endRow: 3, startCol: 0, endCol: 0 },
    })
    sel.remapAfterRowsDeleted([2, 3])
    expect(sel.getSelection().selectedRange).toBeNull()
  })

  it('向上选择删除底端 anchor 行 → 端点与 range 仍一致', () => {
    const sel = new DefaultSelectionState()
    // anchor 在底(row5)、extent 在顶(row2)的向上选区
    sel.setSelection({
      activeCell: { rowIndex: 5, colIndex: 0 },
      anchorCell: { rowIndex: 5, colIndex: 0 },
      extentCell: { rowIndex: 2, colIndex: 0 },
      selectedRange: { startRow: 2, endRow: 5, startCol: 0, endCol: 0 },
    })
    sel.remapAfterRowsDeleted([5])
    const s = sel.getSelection()
    expect(s.selectedRange).toEqual({ startRow: 2, endRow: 4, startCol: 0, endCol: 0 })
    expectConsistent(s)
  })
})

describe('DefaultSelectionState.remapAfterColsInserted', () => {
  it('选区在 at 之后整体右移', () => {
    const sel = new DefaultSelectionState()
    sel.setSelection({
      activeCell: { rowIndex: 0, colIndex: 5 },
      anchorCell: { rowIndex: 0, colIndex: 5 },
      extentCell: { rowIndex: 2, colIndex: 7 },
      selectedRange: { startRow: 0, endRow: 2, startCol: 5, endCol: 7 },
    })
    sel.remapAfterColsInserted(3, 2)
    const s = sel.getSelection()
    expect(s.activeCell?.colIndex).toBe(7)
    expect(s.selectedRange).toEqual({ startRow: 0, endRow: 2, startCol: 7, endCol: 9 })
  })
})

describe('DefaultSelectionState.remapAfterColsDeleted', () => {
  it('选区跨越被删列 → 折叠到存活列', () => {
    const sel = new DefaultSelectionState()
    sel.setSelection({
      activeCell: { rowIndex: 0, colIndex: 3 },
      anchorCell: { rowIndex: 0, colIndex: 3 },
      extentCell: { rowIndex: 0, colIndex: 5 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 3, endCol: 5 },
    })
    sel.remapAfterColsDeleted([4])
    const s = sel.getSelection()
    expect(s.selectedRange).toEqual({ startRow: 0, endRow: 0, startCol: 3, endCol: 4 })
  })

  it('选区全部被删 → clear', () => {
    const sel = new DefaultSelectionState()
    sel.setSelection({
      activeCell: { rowIndex: 0, colIndex: 2 },
      anchorCell: { rowIndex: 0, colIndex: 2 },
      extentCell: { rowIndex: 0, colIndex: 3 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 2, endCol: 3 },
    })
    sel.remapAfterColsDeleted([2, 3])
    expect(sel.getSelection().selectedRange).toBeNull()
  })

  it('向左选择删除右端 anchor 列 → 端点与 range 仍一致', () => {
    const sel = new DefaultSelectionState()
    // anchor 在右(col5)、extent 在左(col2)的向左选区
    sel.setSelection({
      activeCell: { rowIndex: 0, colIndex: 5 },
      anchorCell: { rowIndex: 0, colIndex: 5 },
      extentCell: { rowIndex: 0, colIndex: 2 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 2, endCol: 5 },
    })
    sel.remapAfterColsDeleted([5])
    const s = sel.getSelection()
    expect(s.selectedRange).toEqual({ startRow: 0, endRow: 0, startCol: 2, endCol: 4 })
    expectConsistent(s)
  })
})
