import type { CellAddress, CellRange, GridSelection } from '../interaction/SelectionModel'

export interface SelectionRemapContext {
  readonly oldViewRowToRaw: (viewRow: number) => number
  readonly rawRowToView: (rawRow: number) => number
}

/** Reprojects a view selection after the row view has been replaced. */
export class SelectionRemapper {
  remap(selection: GridSelection, context: SelectionRemapContext): GridSelection | null {
    if (
      !selection.activeCell ||
      !selection.anchorCell ||
      !selection.extentCell ||
      !selection.selectedRange
    ) {
      return null
    }

    const activeCell = this.remapCell(selection.activeCell, context)
    if (!activeCell) return null

    if (isSingleCellRange(selection.selectedRange)) {
      return selectionFromSingleCell(activeCell)
    }

    const anchorCell = this.remapCell(selection.anchorCell, context)
    const extentCell = this.remapCell(selection.extentCell, context)
    const remappedRows = this.remapSelectedRows(selection.selectedRange, context)

    if (
      anchorCell &&
      extentCell &&
      remappedRows &&
      areContiguousRows(remappedRows) &&
      selection.selectedRange.endRow - selection.selectedRange.startRow ===
        Math.max(...remappedRows) - Math.min(...remappedRows)
    ) {
      const range = {
        startRow: Math.min(...remappedRows),
        endRow: Math.max(...remappedRows),
        startCol: selection.selectedRange.startCol,
        endCol: selection.selectedRange.endCol,
      }
      return {
        activeCell,
        anchorCell: { rowIndex: range.startRow, colIndex: range.startCol },
        extentCell: { rowIndex: range.endRow, colIndex: range.endCol },
        selectedRange: range,
      }
    }

    return selectionFromSingleCell(activeCell)
  }

  private remapCell(
    cell: CellAddress,
    context: SelectionRemapContext,
  ): CellAddress | null {
    const rawRow = context.oldViewRowToRaw(cell.rowIndex)
    const viewRow = context.rawRowToView(rawRow)
    if (viewRow === -1) return null
    return { rowIndex: viewRow, colIndex: cell.colIndex }
  }

  private remapSelectedRows(
    range: CellRange,
    context: SelectionRemapContext,
  ): number[] | null {
    const rows: number[] = []
    for (let rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex += 1) {
      const rawRow = context.oldViewRowToRaw(rowIndex)
      const viewRow = context.rawRowToView(rawRow)
      if (viewRow === -1) return null
      rows.push(viewRow)
    }
    return rows
  }
}

function selectionFromSingleCell(cell: CellAddress): GridSelection {
  return {
    activeCell: cell,
    anchorCell: cell,
    extentCell: cell,
    selectedRange: {
      startRow: cell.rowIndex,
      endRow: cell.rowIndex,
      startCol: cell.colIndex,
      endCol: cell.colIndex,
    },
  }
}

function isSingleCellRange(range: CellRange): boolean {
  return range.startRow === range.endRow && range.startCol === range.endCol
}

function areContiguousRows(rows: readonly number[]): boolean {
  const uniqueRows = new Set(rows)
  if (uniqueRows.size !== rows.length) return false
  const minRow = Math.min(...rows)
  const maxRow = Math.max(...rows)
  return maxRow - minRow + 1 === rows.length
}
