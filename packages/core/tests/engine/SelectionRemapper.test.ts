import { describe, expect, it } from 'bun:test'
import { SelectionRemapper, type GridSelection } from '../../src'

function single(rowIndex: number, colIndex: number): GridSelection {
  const cell = { rowIndex, colIndex }
  return {
    activeCell: cell,
    anchorCell: cell,
    extentCell: cell,
    selectedRange: { startRow: rowIndex, endRow: rowIndex, startCol: colIndex, endCol: colIndex },
  }
}

function range(startRow: number, endRow: number, startCol = 1, endCol = 2): GridSelection {
  return {
    activeCell: { rowIndex: startRow, colIndex: startCol },
    anchorCell: { rowIndex: startRow, colIndex: startCol },
    extentCell: { rowIndex: endRow, colIndex: endCol },
    selectedRange: { startRow, endRow, startCol, endCol },
  }
}

describe('SelectionRemapper', () => {
  const remapper = new SelectionRemapper()

  it('remaps a single selected cell through underlying row identity', () => {
    const remapped = remapper.remap(single(2, 1), {
      oldViewRowToRaw: (viewRow) => viewRow + 10,
      rawRowToView: (rawRow) => rawRow - 8,
    })

    expect(remapped).toEqual(single(4, 1))
  })

  it('preserves a range when remapped rows stay contiguous', () => {
    const remapped = remapper.remap(range(1, 2), {
      oldViewRowToRaw: (viewRow) => viewRow + 10,
      rawRowToView: (rawRow) => rawRow - 9,
    })

    expect(remapped).toEqual(range(2, 3))
  })

  it('degrades a scattered range to the active cell', () => {
    const remapped = remapper.remap(range(1, 2), {
      oldViewRowToRaw: (viewRow) => viewRow,
      rawRowToView: (rawRow) => (rawRow === 1 ? 5 : 8),
    })

    expect(remapped).toEqual(single(5, 1))
  })

  it('returns null when the active row is no longer visible', () => {
    const remapped = remapper.remap(single(1, 1), {
      oldViewRowToRaw: (viewRow) => viewRow,
      rawRowToView: () => -1,
    })

    expect(remapped).toBeNull()
  })
})
