/**
 * GeneratedDataSource is an on-demand DataSource implementation for demos and stress tests.
 *
 * Difference from InMemoryDataSource: it does not preallocate row arrays. A
 * 1M-row demo goes from several seconds of V8 allocation to constructing one
 * class instance. The renderer calls `getCell` only for visible cells, so 1M
 * rows are no longer a data-layer bottleneck.
 *
 * Editing overrides: implements `MutableDataSource`; `updateCell` writes to a
 * sparse `Map`, and `getCell` reads overrides before falling back to the
 * generator. This keeps generated behavior while allowing large demos to show
 * double-click editing.
 *
 * Use for display / mock data that can be generated programmatically. Real
 * business data should use InMemoryDataSource for smaller datasets or a paged
 * DataSource for larger ones.
 *
 * This intentionally stays outside @zhiguang/novasheet-core because it is a demo helper,
 * not public API.
 */

import type {
  CellValue,
  DataSource,
  DataSourceEvent,
  DataSourceListener,
  Field,
  MutableDataSource,
  RemovedFieldSnapshot,
  Row,
  Schema,
} from '@zhiguang/novasheet-core'

export type CellGenerator = (rowIndex: number, fieldId: string) => CellValue

/** Snapshot returned by deleteRows; mirrors the core DeletedRowSnapshot shape inline. */
interface DeletedRowSnapshot {
  readonly originalUnderlyingRow: number
  readonly cells: Readonly<Record<string, CellValue>>
}

export class GeneratedDataSource implements DataSource, MutableDataSource {
  /** Overrides / delete snapshots are anchored by stable row key; key is `${rowKey}:${fieldId}`. */
  private overrides = new Map<string, CellValue>()
  private listeners = new Set<DataSourceListener>()
  /** Initial generated row count; generated row keys are in [0, initialRowCount). */
  private readonly initialRowCount: number
  /**
   * Stable row key for each row in view order. `null` means row structure has
   * not changed yet and key === index.
   * Lazily materialized to preserve the "no 1M-row preallocation" property.
   */
  private rowOrder: number[] | null = null
  /** Stable key counter for inserted blank rows; starts after generated keys. */
  private nextRowKey: number

  constructor(
    rowCount: number,
    private schema: Schema,
    private cellFn: CellGenerator,
  ) {
    this.initialRowCount = rowCount
    this.nextRowKey = rowCount
  }

  /** Current row count: rowOrder length after materialization, otherwise initial count. */
  private get count(): number {
    return this.rowOrder ? this.rowOrder.length : this.initialRowCount
  }

  /** View row index -> stable row key. */
  private keyAt(rowIndex: number): number {
    return this.rowOrder ? this.rowOrder[rowIndex]! : rowIndex
  }

  /** Materialize rowOrder as identity sequence before the first structural row mutation. */
  private materializeRowOrder(): void {
    if (!this.rowOrder) {
      this.rowOrder = Array.from({ length: this.initialRowCount }, (_, i) => i)
    }
  }

  getRowCount(): number {
    return this.count
  }

  getSchema(): Schema {
    return this.schema
  }

  /**
   * Called once per render frame for range prewarming. `endIndex` is inclusive,
   * matching ChunkedAxis.getVisibleRange and the repository invariant.
   * Returns synchronously with no IO or cache dependency.
   */
  getRows(startIndex: number, endIndex: number): Row[] {
    const start = Math.max(0, startIndex)
    const end = Math.min(this.count - 1, endIndex)
    if (end < start) return []
    const out: Row[] = new Array(end - start + 1)
    for (let r = start; r <= end; r++) {
      const row: Row = {}
      for (const f of this.schema.fields) row[f.id] = this.getCell(r, f.id) ?? null
      out[r - start] = row
    }
    return out
  }

  /** Paint hot path: must stay synchronous and allocation-light. */
  getCell(rowIndex: number, fieldId: string): CellValue | undefined {
    if (rowIndex < 0 || rowIndex >= this.count) return undefined
    const key = this.keyAt(rowIndex)
    const override = this.overrides.get(`${key}:${fieldId}`)
    if (override !== undefined) return override
    // Only generated rows fall back to cellFn; inserted blank rows have no generated content.
    return key < this.initialRowCount ? this.cellFn(key, fieldId) : undefined
  }

  updateCell(rowIndex: number, fieldId: string, value: CellValue): void {
    if (rowIndex < 0 || rowIndex >= this.count) return
    this.overrides.set(`${this.keyAt(rowIndex)}:${fieldId}`, value)
    this.emit({ type: 'rowsChanged', startIndex: rowIndex, endIndex: rowIndex })
  }

  /** GeneratedDataSource has no view/raw indirection; the underlying row is the row index. */
  updateCellByUnderlyingRow(underlyingRow: number, fieldId: string, value: CellValue): void {
    this.updateCell(underlyingRow, fieldId, value)
  }

  insertRows(beforeUnderlyingRow: number, count: number): readonly number[] {
    if (count <= 0) return []
    this.materializeRowOrder()
    const order = this.rowOrder!
    const at = Math.max(0, Math.min(beforeUnderlyingRow, order.length))
    const newKeys = Array.from({ length: count }, () => this.nextRowKey++)
    order.splice(at, 0, ...newKeys)
    const newIds = Array.from({ length: count }, (_, i) => at + i)
    this.emit({ type: 'rowsInserted', at, count })
    this.emit({ type: 'rowCountChanged', newCount: order.length })
    return newIds
  }

  deleteRows(underlyingRowIds: readonly number[]): readonly DeletedRowSnapshot[] {
    this.materializeRowOrder()
    const order = this.rowOrder!
    const ids = [...underlyingRowIds].sort((a, b) => a - b)
    const snapshots: DeletedRowSnapshot[] = []
    for (const id of ids) {
      if (id < 0 || id >= order.length) continue
      const cells: Record<string, CellValue> = {}
      for (const f of this.schema.fields) {
        const v = this.getCell(id, f.id)
        if (v !== undefined) cells[f.id] = v
      }
      snapshots.push({ originalUnderlyingRow: id, cells })
    }
    for (let i = ids.length - 1; i >= 0; i -= 1) order.splice(ids[i]!, 1)
    this.emit({ type: 'rowsDeleted', removed: ids })
    this.emit({ type: 'rowCountChanged', newCount: order.length })
    return snapshots
  }

  moveRows(underlyingRowIds: readonly number[], beforeRowId: number | null): void {
    if (underlyingRowIds.length === 0) return
    this.materializeRowOrder()
    const order = this.rowOrder!
    const sorted = [...underlyingRowIds].sort((a, b) => a - b)
    const start = sorted[0]!
    const end = sorted[sorted.length - 1]!
    const insertAt =
      beforeRowId === null
        ? order.length - sorted.length
        : beforeRowId > end
          ? beforeRowId - sorted.length
          : beforeRowId
    const moving = order.slice(start, end + 1)
    const remaining = order.filter((_, index) => index < start || index > end)
    remaining.splice(insertAt, 0, ...moving)
    this.rowOrder = remaining
    this.emit({ type: 'rowsMoved', rowIds: sorted, beforeRowId })
  }

  insertField(beforeIndex: number, field: Field): Field {
    const fields = [...this.schema.fields]
    const at = Math.max(0, Math.min(beforeIndex, fields.length))
    fields.splice(at, 0, field)
    this.schema = { ...this.schema, fields }
    this.emit({ type: 'colsInserted', at, field })
    return field
  }

  removeField(fieldId: string): RemovedFieldSnapshot | null {
    const idx = this.schema.fields.findIndex((field) => field.id === fieldId)
    if (idx < 0) return null
    const field = this.schema.fields[idx]!
    // Sparse cells: only overrides are stored; generated values can be regenerated on undo.
    const cells: (CellValue | undefined)[] = new Array(this.count)
    for (const [overrideKey, value] of this.overrides) {
      const sep = overrideKey.indexOf(':')
      if (overrideKey.slice(sep + 1) !== fieldId) continue
      const rowKey = Number(overrideKey.slice(0, sep))
      const index = this.rowOrder ? this.rowOrder.indexOf(rowKey) : rowKey
      if (index >= 0) cells[index] = value
      this.overrides.delete(overrideKey)
    }
    const fields = [...this.schema.fields]
    fields.splice(idx, 1)
    this.schema = { ...this.schema, fields }
    this.emit({ type: 'colsDeleted', removed: [{ index: idx, fieldId }] })
    return { originalIndex: idx, field, cells }
  }

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
    this.schema = { ...this.schema, fields: nextFields }
    this.emit({ type: 'colsMoved', fieldIds: moving.map((field) => field.id), beforeFieldId })
  }

  subscribe(listener: DataSourceListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private emit(event: DataSourceEvent): void {
    for (const l of this.listeners) l(event)
  }
}
