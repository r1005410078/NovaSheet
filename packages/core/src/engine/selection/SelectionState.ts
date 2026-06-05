import type {
  CellAddress,
  CellRange,
  GridSelection,
  SelectCellOptions,
} from './SelectionTypes'
import type {
  GridIndexBounds,
  SelectionNavigationIntent,
} from '../../interaction/SelectionNavigation'

/** Selection handler 需要的最小写入面。 */
export interface SelectionCommands {
  remapAfterRowsInserted(at: number, count: number): void
  remapAfterRowsDeleted(rowIds: readonly number[]): void
  remapAfterColsInserted(at: number, count: number): void
  remapAfterColsDeleted(colIndices: readonly number[]): void
  restoreByRowIndexMap(indexMap: ReadonlyMap<number, number>): void
  captureVisibleFieldIdsBefore(fieldIds: readonly string[]): void
  restoreByCapturedVisibleFieldIds(currentFieldIds: readonly string[]): void
}

/** 选区领域聚合根接口：封装 SelectionModel 与结构变化后的恢复规则。 */
export interface SelectionState extends SelectionCommands {
  getSelection(): GridSelection
  setSelection(selection: GridSelection): void
  selectCell(cell: CellAddress, options?: SelectCellOptions): void
  clear(): void
  setSelectedRange(range: CellRange): void
  navigate(intent: SelectionNavigationIntent, bounds: GridIndexBounds): CellAddress | null
  remapAfterViewRowsChanged(context: {
    oldViewRowToRaw(viewRow: number): number
    rawRowToView(rawRow: number): number
  }): void
}
