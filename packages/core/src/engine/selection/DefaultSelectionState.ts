import type {
  CellAddress,
  CellRange,
  GridSelection,
  SelectCellOptions,
} from './SelectionTypes'
import type {
  GridIndexBounds,
  SelectionNavigationIntent,
} from './SelectionNavigation'
import { applySelectionNavigation } from './SelectionNavigation'
import {
  remapColIndexAfterDelete,
  remapColIndexAfterInsert,
  remapRowIndexAfterDelete,
  remapRowIndexAfterInsert,
} from '../../coords/remap'
import {
  remapSelectionAfterViewRowsChanged,
  remapSelectionByRowIndexMap,
  remapSelectionByVisibleFieldIds,
} from './SelectionRules'
import type { SelectionState } from './SelectionState'

const EMPTY_SELECTION: GridSelection = {
  activeCell: null,
  anchorCell: null,
  extentCell: null,
  selectedRange: null,
}

/** 默认 selection 聚合根；向 engine 暴露选择状态与结构 remap 能力。 */
export class DefaultSelectionState implements SelectionState {
  private selection: GridSelection = EMPTY_SELECTION
  private visibleFieldIdsBefore: readonly string[] | null = null

  getSelection(): GridSelection {
    return this.selection
  }

  setSelection(selection: GridSelection): void {
    const cells = [selection.activeCell, selection.anchorCell, selection.extentCell]
    const hasAnyCell = cells.some((cell) => cell !== null)
    const hasEveryCell = cells.every((cell) => cell !== null)
    if (!hasAnyCell) {
      if (selection.selectedRange !== null) {
        throw new Error('DefaultSelectionState.setSelection: empty selection cannot include a range')
      }
      this.selection = EMPTY_SELECTION
      return
    }
    if (!hasEveryCell || selection.selectedRange === null) {
      throw new Error('DefaultSelectionState.setSelection: non-empty selection requires all endpoints')
    }

    const anchor = selection.anchorCell!
    const extent = selection.extentCell!
    const normalizedRange = normalizeRange(anchor, extent)
    if (
      selection.selectedRange.startRow !== normalizedRange.startRow ||
      selection.selectedRange.endRow !== normalizedRange.endRow ||
      selection.selectedRange.startCol !== normalizedRange.startCol ||
      selection.selectedRange.endCol !== normalizedRange.endCol
    ) {
      throw new Error('DefaultSelectionState.setSelection: selectedRange must match anchor and extent')
    }

    this.selection = selection
  }

  selectCell(cell: CellAddress, options: SelectCellOptions = {}): void {
    const isExtending = options.extend && this.selection.anchorCell && this.selection.activeCell
    const active = isExtending ? this.selection.activeCell! : cell
    const anchor = isExtending ? this.selection.anchorCell! : cell
    const extent = cell
    this.selection = {
      activeCell: active,
      anchorCell: anchor,
      extentCell: extent,
      selectedRange: normalizeRange(anchor, extent),
    }
  }

  clear(): void {
    this.selection = EMPTY_SELECTION
  }

  setSelectedRange(range: CellRange): void {
    const anchor: CellAddress = { rowIndex: range.startRow, colIndex: range.startCol }
    const extent: CellAddress = { rowIndex: range.endRow, colIndex: range.endCol }
    this.selection = {
      activeCell: anchor,
      anchorCell: anchor,
      extentCell: extent,
      selectedRange: normalizeRange(anchor, extent),
    }
  }

  navigate(intent: SelectionNavigationIntent, bounds: GridIndexBounds): CellAddress | null {
    return applySelectionNavigation(this, intent, bounds)
  }

  remapAfterRowsInserted(at: number, count: number): void {
    if (this.selection.selectedRange == null) return
    const shift = (rowIndex: number) => remapRowIndexAfterInsert(rowIndex, at, count)
    const range = this.selection.selectedRange
    this.selection = {
      activeCell: this.selection.activeCell
        ? { ...this.selection.activeCell, rowIndex: shift(this.selection.activeCell.rowIndex) }
        : null,
      anchorCell: this.selection.anchorCell
        ? { ...this.selection.anchorCell, rowIndex: shift(this.selection.anchorCell.rowIndex) }
        : null,
      extentCell: this.selection.extentCell
        ? { ...this.selection.extentCell, rowIndex: shift(this.selection.extentCell.rowIndex) }
        : null,
      selectedRange: { ...range, startRow: shift(range.startRow), endRow: shift(range.endRow) },
    }
  }

  remapAfterRowsDeleted(rowIds: readonly number[]): void {
    if (this.selection.selectedRange == null) return
    const range = this.selection.selectedRange
    const survivors: number[] = []
    for (let rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex += 1) {
      const mapped = remapRowIndexAfterDelete(rowIndex, rowIds)
      if (mapped !== null) survivors.push(mapped)
    }
    if (survivors.length === 0) {
      this.selection = EMPTY_SELECTION
      return
    }
    const startRow = survivors[0]!
    const endRow = survivors[survivors.length - 1]!
    const remap = (cell: CellAddress | null) => {
      if (cell == null) return null
      const mapped = remapRowIndexAfterDelete(cell.rowIndex, rowIds)
      return { ...cell, rowIndex: mapped ?? startRow }
    }
    this.selection = {
      activeCell: remap(this.selection.activeCell),
      anchorCell: remap(this.selection.anchorCell),
      extentCell: remap(this.selection.extentCell),
      selectedRange: { ...range, startRow, endRow },
    }
  }

  remapAfterColsInserted(at: number, count: number): void {
    if (this.selection.selectedRange == null) return
    const shift = (colIndex: number) => remapColIndexAfterInsert(colIndex, at, count)
    const range = this.selection.selectedRange
    this.selection = {
      activeCell: this.selection.activeCell
        ? { ...this.selection.activeCell, colIndex: shift(this.selection.activeCell.colIndex) }
        : null,
      anchorCell: this.selection.anchorCell
        ? { ...this.selection.anchorCell, colIndex: shift(this.selection.anchorCell.colIndex) }
        : null,
      extentCell: this.selection.extentCell
        ? { ...this.selection.extentCell, colIndex: shift(this.selection.extentCell.colIndex) }
        : null,
      selectedRange: { ...range, startCol: shift(range.startCol), endCol: shift(range.endCol) },
    }
  }

  remapAfterColsDeleted(colIndices: readonly number[]): void {
    if (this.selection.selectedRange == null) return
    const range = this.selection.selectedRange
    const survivors: number[] = []
    for (let colIndex = range.startCol; colIndex <= range.endCol; colIndex += 1) {
      const mapped = remapColIndexAfterDelete(colIndex, colIndices)
      if (mapped !== null) survivors.push(mapped)
    }
    if (survivors.length === 0) {
      this.selection = EMPTY_SELECTION
      return
    }
    const startCol = survivors[0]!
    const endCol = survivors[survivors.length - 1]!
    const remap = (cell: CellAddress | null) => {
      if (cell == null) return null
      const mapped = remapColIndexAfterDelete(cell.colIndex, colIndices)
      return { ...cell, colIndex: mapped ?? startCol }
    }
    this.selection = {
      activeCell: remap(this.selection.activeCell),
      anchorCell: remap(this.selection.anchorCell),
      extentCell: remap(this.selection.extentCell),
      selectedRange: { ...range, startCol, endCol },
    }
  }

  restoreByRowIndexMap(indexMap: ReadonlyMap<number, number>): void {
    this.setSelection(remapSelectionByRowIndexMap(this.getSelection(), indexMap))
  }

  captureVisibleFieldIdsBefore(fieldIds: readonly string[]): void {
    this.visibleFieldIdsBefore = [...fieldIds]
  }

  restoreByCapturedVisibleFieldIds(currentFieldIds: readonly string[]): void {
    if (!this.visibleFieldIdsBefore) return
    this.setSelection(
      remapSelectionByVisibleFieldIds(
        this.getSelection(),
        this.visibleFieldIdsBefore,
        currentFieldIds,
      ),
    )
    this.visibleFieldIdsBefore = null
  }

  remapAfterViewRowsChanged(context: {
    oldViewRowToRaw(viewRow: number): number
    rawRowToView(rawRow: number): number
  }): void {
    this.setSelection(remapSelectionAfterViewRowsChanged(this.getSelection(), context))
  }
}

function normalizeRange(a: CellAddress, b: CellAddress): CellRange {
  return {
    startRow: Math.min(a.rowIndex, b.rowIndex),
    endRow: Math.max(a.rowIndex, b.rowIndex),
    startCol: Math.min(a.colIndex, b.colIndex),
    endCol: Math.max(a.colIndex, b.colIndex),
  }
}
