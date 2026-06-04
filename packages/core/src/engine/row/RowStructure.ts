import type { ChunkedAxis } from '../../layout/ChunkedAxis'
import type { DeletedRowSnapshot } from '../../data/MutableDataSource'
import type { RowsDeleted, RowsHidden, RowsInserted, RowsMoved, RowsUnhidden } from './RowEvent'
import type {
  DeleteRowsOperation,
  HideRowsOperation,
  InsertRowsOperation,
  MoveRowsOperation,
  UnhideRowsOperation,
} from './RowOperation'

/** 行结构领域读取/写入 engine 内部状态的最小上下文。 */
export interface RowStructureContext {
  getRowCount(): number
  insertRows(at: number, count: number): readonly number[]
  deleteRows(rowIds: readonly number[]): readonly DeletedRowSnapshot[]
  moveRows(rowIds: readonly number[], beforeRowId: number | null): boolean
  getRawRowsAxis(): ChunkedAxis
  setRawRowsAxis(axis: ChunkedAxis): void
  getHiddenRows(): readonly number[]
  setHiddenRows(rowIds: readonly number[]): void
  resolveDefaultRowHeight(): number
}

/** 行结构领域接口；负责修改 row 自身状态，并产出 row domain event。 */
export interface RowStructure {
  insertRows(operation: InsertRowsOperation): RowsInserted | null
  deleteRows(operation: DeleteRowsOperation): RowsDeleted | null
  hideRows(operation: HideRowsOperation): RowsHidden | null
  unhideRows(operation: UnhideRowsOperation): RowsUnhidden | null
  moveRows(operation: MoveRowsOperation): RowsMoved | null
}
