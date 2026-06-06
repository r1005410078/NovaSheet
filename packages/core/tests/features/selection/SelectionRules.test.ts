import { describe, expect, it } from 'bun:test'
import {
  remapSelectionAfterViewRowsChanged,
  remapSelectionByRowIndexMap,
  remapSelectionByVisibleFieldIds,
} from '../../../src/features/selection/SelectionRules'
import type { GridSelection } from '../../../src/features/selection/SelectionTypes'

const emptySelection: GridSelection = {
  activeCell: null,
  anchorCell: null,
  extentCell: null,
  selectedRange: null,
}

describe('SelectionRules', () => {
  it('remaps a view-row range when underlying rows remain contiguous', () => {
    const selection: GridSelection = {
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 1, colIndex: 1 },
      selectedRange: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
    }

    const result = remapSelectionAfterViewRowsChanged(selection, {
      oldViewRowToRaw: (viewRow) => viewRow,
      rawRowToView: (rawRow) => 3 - rawRow,
    })

    expect(result).toEqual({
      activeCell: { rowIndex: 3, colIndex: 0 },
      anchorCell: { rowIndex: 2, colIndex: 0 },
      extentCell: { rowIndex: 3, colIndex: 1 },
      selectedRange: { startRow: 2, endRow: 3, startCol: 0, endCol: 1 },
    })
  })

  it('falls back to the active cell when a view-row range becomes non-contiguous', () => {
    const selection: GridSelection = {
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 1, colIndex: 1 },
      selectedRange: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
    }

    const result = remapSelectionAfterViewRowsChanged(selection, {
      oldViewRowToRaw: (viewRow) => viewRow,
      rawRowToView: (rawRow) => (rawRow === 0 ? 0 : 2),
    })

    expect(result).toEqual({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 0, colIndex: 0 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
    })
  })

  it('clears selection when remapping cannot restore the active cell', () => {
    const selection: GridSelection = {
      activeCell: { rowIndex: 2, colIndex: 1 },
      anchorCell: { rowIndex: 2, colIndex: 1 },
      extentCell: { rowIndex: 2, colIndex: 1 },
      selectedRange: { startRow: 2, endRow: 2, startCol: 1, endCol: 1 },
    }

    const result = remapSelectionAfterViewRowsChanged(selection, {
      oldViewRowToRaw: (viewRow) => viewRow,
      rawRowToView: () => -1,
    })

    expect(result).toEqual(emptySelection)
  })

  it('remaps row selections by an old-to-new row index map', () => {
    const selection: GridSelection = {
      activeCell: { rowIndex: 1, colIndex: 0 },
      anchorCell: { rowIndex: 1, colIndex: 0 },
      extentCell: { rowIndex: 2, colIndex: 0 },
      selectedRange: { startRow: 1, endRow: 2, startCol: 0, endCol: 0 },
    }

    const result = remapSelectionByRowIndexMap(
      selection,
      new Map([
        [0, 0],
        [1, 2],
        [2, 3],
      ]),
    )

    expect(result.selectedRange).toEqual({ startRow: 2, endRow: 3, startCol: 0, endCol: 0 })
  })

  it('remaps column selections by visible field ids before and after', () => {
    const selection: GridSelection = {
      activeCell: { rowIndex: 0, colIndex: 1 },
      anchorCell: { rowIndex: 0, colIndex: 1 },
      extentCell: { rowIndex: 0, colIndex: 2 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 1, endCol: 2 },
    }

    const result = remapSelectionByVisibleFieldIds(selection, ['a', 'b', 'c', 'd'], ['a', 'd', 'b', 'c'])

    expect(result.selectedRange).toEqual({ startRow: 0, endRow: 0, startCol: 2, endCol: 3 })
  })
})
