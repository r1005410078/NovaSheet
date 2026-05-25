import type { DataSource, DataSourceEvent, DataSourceListener } from './DataSource'
import type { CellValue, Field, Row, Schema } from './Schema'
import type { DeletedRowSnapshot, RemovedFieldSnapshot } from './MutableDataSource'

/**
 * 全内存 DataSource——M1 的默认实现，所有方法同步。
 * 推荐容量上限：~30 万行 × 50 列（视行内字段数量而定，参考 spec §3）。
 * 超过此规模应使用 M4 提供的分页 DataSource。
 */
export class InMemoryDataSource implements DataSource {
  /** 当前 Schema */
  private schema: Schema
  /** 行数据数组 */
  private rows: Row[]
  /** 事件监听器集合 */
  private listeners = new Set<DataSourceListener>()

  constructor(opts: { schema: Schema; rows: Row[] }) {
    this.schema = opts.schema
    // 防御性拷贝：避免外部 push/splice 偷偷改我们的数据；
    // 同时保证 setRows 时旧引用与新引用解耦。
    this.rows = opts.rows.slice()
  }

  /** 返回当前行数 */
  getRowCount(): number {
    return this.rows.length
  }

  /** 返回当前 Schema */
  getSchema(): Schema {
    return this.schema
  }

  /** endIndex 包含——与 ChunkedAxis.getVisibleRange 保持一致。 */
  getRows(startIndex: number, endIndex: number): Row[] {
    const start = Math.max(0, startIndex)
    const end = Math.min(this.rows.length, endIndex + 1)
    if (end <= start) return []
    return this.rows.slice(start, end)
  }

  /** 同步读取单元格值（热路径） */
  getCell(rowIndex: number, fieldId: string): CellValue | undefined {
    const row = this.rows[rowIndex]
    if (!row) return undefined
    return row[fieldId]
  }

  /** 订阅数据源事件，返回取消订阅函数 */
  subscribe(listener: DataSourceListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** 更新单个单元格并 emit `rowsChanged` 事件 */
  updateCell(rowIndex: number, fieldId: string, value: CellValue): void {
    const row = this.rows[rowIndex]
    if (!row) return
    row[fieldId] = value
    this.emit({ type: 'rowsChanged', startIndex: rowIndex, endIndex: rowIndex })
  }

  updateCellByUnderlyingRow(underlyingRow: number, fieldId: string, value: CellValue): void {
    this.updateCell(underlyingRow, fieldId, value)
  }

  /**
   * 整体替换数据。先发 rowCountChanged 让 Grid 重建 axis（行数变了），
   * 再发 reset 触发完整 invalidate。
   */
  setRows(rows: Row[]): void {
    this.rows = rows.slice()
    this.emit({ type: 'rowCountChanged', newCount: this.rows.length })
    this.emit({ type: 'reset' })
  }

  /** 在 beforeUnderlyingRow 位置插入 count 行空白行，返回新行 rowId 列表 */
  insertRows(beforeUnderlyingRow: number, count: number): readonly number[] {
    if (count <= 0) return []
    const at = Math.max(0, Math.min(beforeUnderlyingRow, this.rows.length))
    const blank: Row[] = Array.from({ length: count }, () => this.makeDefaultRow())
    this.rows.splice(at, 0, ...blank)
    const newIds = Array.from({ length: count }, (_, i) => at + i)
    this.emit({ type: 'rowsInserted', at, count })
    this.emit({ type: 'rowCountChanged', newCount: this.rows.length })
    return newIds
  }

  /**
   * 删除给定 underlying rowId 集合（须升序、去重）。
   * 返回被删行快照，供 undo 还原。
   */
  deleteRows(underlyingRowIds: readonly number[]): readonly DeletedRowSnapshot[] {
    for (let i = 1; i < underlyingRowIds.length; i += 1) {
      if (underlyingRowIds[i]! <= underlyingRowIds[i - 1]!) {
        throw new Error('InMemoryDataSource.deleteRows: rowIds must be ascending and unique')
      }
    }
    const snapshots: DeletedRowSnapshot[] = []
    for (const id of underlyingRowIds) {
      const row = this.rows[id]
      if (row == null) continue
      snapshots.push({ originalUnderlyingRow: id, cells: { ...row } })
    }
    // 从大到小删，保持前面索引稳定
    for (let i = underlyingRowIds.length - 1; i >= 0; i -= 1) {
      this.rows.splice(underlyingRowIds[i]!, 1)
    }
    this.emit({ type: 'rowsDeleted', removed: underlyingRowIds })
    this.emit({ type: 'rowCountChanged', newCount: this.rows.length })
    return snapshots
  }

  /** 在 beforeIndex 位置插入字段；新字段 cell 值保持 undefined。 */
  insertField(beforeIndex: number, field: Field): Field {
    if (this.schema.fields.some((candidate) => candidate.id === field.id)) {
      throw new Error(`InMemoryDataSource.insertField: duplicate field id "${field.id}"`)
    }
    const fields = [...this.schema.fields]
    const at = Math.max(0, Math.min(beforeIndex, fields.length))
    fields.splice(at, 0, field)
    this.schema = { ...this.schema, fields }
    this.emit({ type: 'colsInserted', at, field })
    return field
  }

  /** 删除 fieldId 对应字段并返回列值快照；未知 fieldId 返回 null。 */
  removeField(fieldId: string): RemovedFieldSnapshot | null {
    const idx = this.schema.fields.findIndex((field) => field.id === fieldId)
    if (idx < 0) return null
    const field = this.schema.fields[idx]!
    const cells = this.rows.map((row) => row[fieldId])
    for (const row of this.rows) {
      delete row[fieldId]
    }
    const fields = [...this.schema.fields]
    fields.splice(idx, 1)
    this.schema = { ...this.schema, fields }
    this.emit({ type: 'colsDeleted', removed: [{ index: idx, fieldId }] })
    return { originalIndex: idx, field, cells }
  }

  /** 按当前 schema 顺序移动字段组；cell 值按 fieldId 锚定，无需改 row object。 */
  moveFields(fieldIds: readonly string[], beforeFieldId: string | null): void {
    const movingIds = new Set(fieldIds)
    const moving = this.schema.fields.filter((field) => movingIds.has(field.id))
    if (moving.length === 0) return
    if (beforeFieldId !== null && movingIds.has(beforeFieldId)) return

    const remaining = this.schema.fields.filter((field) => !movingIds.has(field.id))
    const at =
      beforeFieldId === null
        ? remaining.length
        : remaining.findIndex((field) => field.id === beforeFieldId)
    if (at < 0) return

    const nextFields = remaining.slice()
    nextFields.splice(at, 0, ...moving)
    if (sameFieldOrder(this.schema.fields, nextFields)) return

    const movedFieldIds = moving.map((field) => field.id)
    this.schema = { ...this.schema, fields: nextFields }
    this.emit({ type: 'colsMoved', fieldIds: movedFieldIds, beforeFieldId })
  }

  private makeDefaultRow(): Row {
    const out: Record<string, CellValue> = {}
    for (const field of this.schema.fields) {
      if (field.defaultValue !== undefined) out[field.id] = field.defaultValue
    }
    return out as Row
  }

  /** 向所有监听器广播事件 */
  private emit(event: DataSourceEvent): void {
    for (const l of this.listeners) l(event)
  }
}

function sameFieldOrder(a: readonly Field[], b: readonly Field[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]!.id !== b[i]!.id) return false
  }
  return true
}
