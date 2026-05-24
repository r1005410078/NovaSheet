import type { CellValue, Field } from './Schema'
import type { DataSource } from './DataSource'

/** 被 `deleteRows` 返回，供 undo 还原 */
export interface DeletedRowSnapshot {
  readonly originalUnderlyingRow: number
  readonly cells: Readonly<Record<string, CellValue>>
}

/** 被 `removeField` 返回，供 undo 还原 */
export interface RemovedFieldSnapshot {
  readonly originalIndex: number
  readonly field: Field
  readonly cells: ReadonlyArray<CellValue | undefined>
}

/** 支持同步写单元格的数据源（`InMemoryDataSource` 等）。 */
export interface MutableDataSource extends DataSource {
  updateCell(rowIndex: number, fieldId: string, value: CellValue): void
  updateCellByUnderlyingRow?(underlyingRow: number, fieldId: string, value: CellValue): void

  /**
   * 在 underlying rowId 位置之前插入 count 行空白行。
   * 返回新插入行的 underlying rowId 列表（升序）。
   * 同步触发 `rowsInserted` + `rowCountChanged` 事件。
   */
  insertRows?(beforeUnderlyingRow: number, count: number): readonly number[]

  /**
   * 删除给定 underlying rowId 集合（升序、去重）。
   * 返回被删行快照（含 schema 外 extra 字段），供 undo 还原。
   * 同步触发 `rowsDeleted` + `rowCountChanged`。
   */
  deleteRows?(underlyingRowIds: readonly number[]): readonly DeletedRowSnapshot[]

  /** 在 schema.fields 的 beforeIndex 位置之前插入 1 个新字段，返回实际插入字段。 */
  insertField?(beforeIndex: number, field: Field): Field

  /** 按 fieldId 删除字段，返回字段定义与列值快照；未知 fieldId 返回 null。 */
  removeField?(fieldId: string): RemovedFieldSnapshot | null
}

export function isMutableDataSource(data: DataSource): data is MutableDataSource {
  return typeof (data as MutableDataSource).updateCell === 'function'
}
