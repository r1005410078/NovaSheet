import { SelectionModel } from '../../interaction/SelectionModel'
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
import {
  remapSelectionAfterViewRowsChanged,
  remapSelectionByRowIndexMap,
  remapSelectionByVisibleFieldIds,
} from './SelectionRules'
import type { SelectionState } from './SelectionState'

/** 默认 selection 聚合根；内部持有 SelectionModel，向 engine 暴露领域能力。 */
export class DefaultSelectionState implements SelectionState {
  private readonly model = new SelectionModel()
  private visibleFieldIdsBefore: readonly string[] | null = null

  getSelection(): GridSelection {
    return this.model.getSelection()
  }

  setSelection(selection: GridSelection): void {
    this.model.setSelection(selection)
  }

  selectCell(cell: CellAddress, options?: SelectCellOptions): void {
    this.model.selectCell(cell, options)
  }

  clear(): void {
    this.model.clear()
  }

  setSelectedRange(range: CellRange): void {
    this.model.setSelectedRange(range)
  }

  navigate(intent: SelectionNavigationIntent, bounds: GridIndexBounds): CellAddress | null {
    return this.model.navigate(intent, bounds)
  }

  remapAfterRowsInserted(at: number, count: number): void {
    this.model.remapAfterRowsInserted(at, count)
  }

  remapAfterRowsDeleted(rowIds: readonly number[]): void {
    this.model.remapAfterRowsDeleted(rowIds)
  }

  remapAfterColsInserted(at: number, count: number): void {
    this.model.remapAfterColsInserted(at, count)
  }

  remapAfterColsDeleted(colIndices: readonly number[]): void {
    this.model.remapAfterColsDeleted(colIndices)
  }

  restoreByRowIndexMap(indexMap: ReadonlyMap<number, number>): void {
    this.model.setSelection(remapSelectionByRowIndexMap(this.model.getSelection(), indexMap))
  }

  captureVisibleFieldIdsBefore(fieldIds: readonly string[]): void {
    this.visibleFieldIdsBefore = [...fieldIds]
  }

  restoreByCapturedVisibleFieldIds(currentFieldIds: readonly string[]): void {
    if (!this.visibleFieldIdsBefore) return
    this.model.setSelection(
      remapSelectionByVisibleFieldIds(
        this.model.getSelection(),
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
    this.model.setSelection(remapSelectionAfterViewRowsChanged(this.model.getSelection(), context))
  }
}
