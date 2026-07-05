import type { CellValue, Row, Schema } from './Schema'
import type { DataSource, DataSourceEvent, DataSourceListener, DataWindow } from './DataSource'
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

  // 参数名用 `win` 而非 `window`：lint:architecture 的 DOM_GLOBAL_RE 朴素正则匹配
  // 全局对象成员访问前缀，无法区分局部遮蔽与真实 DOM 全局（同 blockGeometry.ts 先例）。
  hintWindow(win: DataWindow): void {
    if (!this.upstream.hintWindow) return
    const visibleFields = this.getSchema().fields // already filtered by hidden id set
    const startField = visibleFields[win.startCol]
    const endField = visibleFields[win.endCol]
    if (!startField || !endField) return
    const upstreamFields = this.upstream.getSchema().fields
    const startCol = upstreamFields.findIndex((f) => f.id === startField.id)
    const endCol = upstreamFields.findIndex((f) => f.id === endField.id)
    if (startCol < 0 || endCol < 0) return
    this.upstream.hintWindow({
      startRow: win.startRow,
      endRow: win.endRow,
      startCol,
      endCol,
    })
  }

  subscribe(listener: DataSourceListener): () => void {
    return this.upstream.subscribe((event: DataSourceEvent) => listener(event))
  }
}
