import type { ChunkedAxis } from '../../layout/ChunkedAxis'
import type { DataSource } from '../../data/DataSource'
import type { DeletedRowSnapshot } from '../../data/MutableDataSource'
import type { CollapsedGap } from '../../view/HideRowsLayer'
import type { RowsDeleted, RowsHidden, RowsInserted, RowsMoved, RowsUnhidden } from './RowEvent'
import type {
  DeleteRowsOperation,
  HideRowsOperation,
  InsertRowsOperation,
  MoveRowsOperation,
  UnhideRowsOperation,
} from './RowOperation'

/** 行领域命令面：命令处理器只需要的正向变迁方法子集。 */
export interface RowCommands {
  insertRows(operation: InsertRowsOperation): RowsInserted | null
  deleteRows(operation: DeleteRowsOperation): RowsDeleted | null
  hideRows(operation: HideRowsOperation): RowsHidden | null
  unhideRows(operation: UnhideRowsOperation): RowsUnhidden | null
  moveRows(operation: MoveRowsOperation): RowsMoved | null
}

/**
 * 行结构领域接口（聚合根）：自持行高轴与隐藏层，执行正向结构变迁、行高读写、
 * 派生视图行轴/视图数据源，并提供 undo/redo 用的逆变迁。
 */
export interface RowStructure extends RowCommands {
  /** 重绑 raw 数据源与默认行高解析，重建行高轴并重置视图包装（隐藏集保留，由 clearHidden 单独清空）。 */
  rebuild(rawData: DataSource, resolveDefaultRowHeight: () => number): void
  /** 清空隐藏集（setData 语义）。 */
  clearHidden(): void

  getRowHeight(underlyingRow: number): number
  setRowHeight(underlyingRow: number, height: number): void
  setRowHeightsMulti(underlyingRows: readonly number[], height: number): void
  setDefaultRowHeight(height: number): void

  /** 从行高轴按可见行顺序派生的视图行轴。 */
  getViewRowsAxis(): ChunkedAxis
  /** 行隐藏后的视图数据源（engine 在其上再叠列隐藏）。 */
  getRowViewData(): DataSource
  /** 升序去重的隐藏 underlying 行 id。 */
  getHiddenRows(): readonly number[]
  getCollapsedGaps(): readonly CollapsedGap[]

  /** insert 的 redo：插入 count 行空白行并扩展行高轴。 */
  insertBlankRows(at: number, count: number): void
  /** insert 的 undo / delete 的 redo：按 underlying id 删除并收缩行高轴。 */
  deleteRowsByIds(underlyingRowIds: readonly number[]): void
  /** delete 的 undo：按原位置回插并恢复 cell 与行高。 */
  reinsertDeletedRows(
    snapshots: readonly DeletedRowSnapshot[],
    heights: readonly number[],
  ): void
  addHidden(underlyingRowIds: readonly number[]): void
  removeHidden(underlyingRowIds: readonly number[]): void
}
