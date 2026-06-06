import type { CellValue, Row, Schema } from './Schema'
import type { DataSource, DataSourceEvent, DataSourceListener } from './DataSource'
import { isMutableDataSource } from './MutableDataSource'
import type { MutableDataSource } from './MutableDataSource'

/**
 * 列隐藏视图包装：在上游 DataSource 之上按隐藏列集过滤 schema，
 * 行/单元格读写直通上游；可变能力按上游是否可变透传。
 */
export class VisibleColumnsDataSource implements DataSource {
  readonly updateCell?: MutableDataSource['updateCell']
  readonly updateCellByUnderlyingRow?: MutableDataSource['updateCellByUnderlyingRow']
  readonly insertRows?: MutableDataSource['insertRows']
  readonly deleteRows?: MutableDataSource['deleteRows']
  readonly moveRows?: MutableDataSource['moveRows']
  readonly insertField?: MutableDataSource['insertField']
  readonly removeField?: MutableDataSource['removeField']
  readonly moveFields?: MutableDataSource['moveFields']

  constructor(
    private readonly upstream: DataSource,
    private readonly getHiddenIds: () => ReadonlySet<string>,
  ) {
    const mutableUpstream = isMutableDataSource(this.upstream) ? this.upstream : null
    if (mutableUpstream) {
      this.updateCell = (rowIndex, fieldId, value) =>
        mutableUpstream.updateCell(rowIndex, fieldId, value)
      this.updateCellByUnderlyingRow =
        mutableUpstream.updateCellByUnderlyingRow?.bind(mutableUpstream)
      this.insertRows = mutableUpstream.insertRows?.bind(mutableUpstream)
      this.deleteRows = mutableUpstream.deleteRows?.bind(mutableUpstream)
      this.moveRows = mutableUpstream.moveRows?.bind(mutableUpstream)
      this.insertField = mutableUpstream.insertField?.bind(mutableUpstream)
      this.removeField = mutableUpstream.removeField?.bind(mutableUpstream)
      this.moveFields = mutableUpstream.moveFields?.bind(mutableUpstream)
    }
  }

  getRowCount(): number {
    return this.upstream.getRowCount()
  }

  getSchema(): Schema {
    const hidden = this.getHiddenIds()
    if (hidden.size === 0) return this.upstream.getSchema()
    return {
      fields: this.upstream.getSchema().fields.filter((field) => !hidden.has(field.id)),
    }
  }

  getRows(startIndex: number, endIndex: number): Row[] | Promise<Row[]> {
    return this.upstream.getRows(startIndex, endIndex)
  }

  getCell(rowIndex: number, fieldId: string): CellValue | undefined {
    return this.upstream.getCell(rowIndex, fieldId)
  }

  resolveUnderlyingRow(viewRow: number): number {
    return this.upstream.resolveUnderlyingRow?.(viewRow) ?? viewRow
  }

  findViewRow(underlyingRow: number): number {
    return this.upstream.findViewRow?.(underlyingRow) ?? underlyingRow
  }

  subscribe(listener: DataSourceListener): () => void {
    return this.upstream.subscribe((event: DataSourceEvent) => listener(event))
  }
}
