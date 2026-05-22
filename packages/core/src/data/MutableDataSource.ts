import type { CellValue } from './Schema'
import type { DataSource } from './DataSource'

/** 支持同步写单元格的数据源（`InMemoryDataSource` 等）。 */
export interface MutableDataSource extends DataSource {
  updateCell(rowIndex: number, fieldId: string, value: CellValue): void
  updateCellByUnderlyingRow?(underlyingRow: number, fieldId: string, value: CellValue): void
}

export function isMutableDataSource(data: DataSource): data is MutableDataSource {
  return typeof (data as MutableDataSource).updateCell === 'function'
}
