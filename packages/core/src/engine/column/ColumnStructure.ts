import type { ChunkedAxis } from '../../layout/ChunkedAxis'
import type { DataSource } from '../../data/DataSource'
import type { Field } from '../../data/Schema'
import type { RemovedFieldSnapshot } from '../../data/MutableDataSource'
import type { RenderFrameCollapsedColGap } from '../../render/RenderFrame'
import type {
  ColumnsDeleted,
  ColumnsHidden,
  ColumnsInserted,
  ColumnsMoved,
  ColumnsUnhidden,
} from './ColumnEvent'
import type {
  DeleteColsOperation,
  HideColsOperation,
  InsertColsOperation,
  MoveColsOperation,
  UnhideColsOperation,
} from './ColumnOperation'

/** 列领域命令面：命令处理器只需要的正向变迁方法子集。 */
export interface ColumnCommands {
  insertCols(operation: InsertColsOperation): ColumnsInserted | null
  deleteCols(operation: DeleteColsOperation): ColumnsDeleted | null
  hideCols(operation: HideColsOperation): ColumnsHidden | null
  unhideCols(operation: UnhideColsOperation): ColumnsUnhidden | null
  moveCols(operation: MoveColsOperation): ColumnsMoved | null
}

/**
 * 列结构领域接口（聚合根）：自持列宽轴与隐藏列集，执行正向结构变迁、列宽读写、
 * 派生视图列轴/列隐藏视图源，并提供 undo/redo 用的逆变迁。
 */
export interface ColumnStructure extends ColumnCommands {
  rebuild(rawData: DataSource, resolveDefaultColWidth: () => number): void
  clearHidden(): void
  /** setData 语义：重置新列自增计数器（newFieldCounter 是列域 concern）。 */
  resetNewFieldCounter(): void

  getColWidth(rawColIndex: number): number
  getDefaultColWidth(): number
  setColWidth(rawColIndex: number, width: number): void
  setColWidthById(fieldId: string, width: number): void
  setColWidthsMulti(fieldIds: readonly string[], width: number): void

  getViewColsAxis(): ChunkedAxis
  getColViewData(rowViewData: DataSource): DataSource
  getHiddenCols(): readonly string[]
  isColHidden(fieldId: string): boolean
  getRawColumnIndex(fieldId: string): number
  getCollapsedColGaps(): readonly Omit<RenderFrameCollapsedColGap, 'xPx'>[]

  /** insert 的 redo：在 at 处插入 fields（按给定宽度）。 */
  insertFieldsAt(at: number, fields: readonly Field[], widths: readonly number[]): void
  /** insert 的 undo / delete 的 redo：按 fieldId 删除字段并收缩列宽轴。 */
  removeFieldsByIds(fieldIds: readonly string[]): void
  /** delete 的 undo：按原位置回插字段、列宽并恢复 cell。 */
  reinsertDeletedCols(
    snapshots: readonly RemovedFieldSnapshot[],
    widths: readonly number[],
  ): void
  addHidden(fieldIds: readonly string[]): void
  removeHidden(fieldIds: readonly string[]): void
}
