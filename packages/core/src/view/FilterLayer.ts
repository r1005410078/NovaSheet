import type { DataSource, DataSourceEvent, DataSourceListener } from '../data/DataSource'
import { isMutableDataSource } from '../data/MutableDataSource'
import type { MutableDataSource } from '../data/MutableDataSource'
import type { CellValue, Field, Row, Schema } from '../data/Schema'
import type {
  ColumnHeaderMenuContext,
  ColumnHeaderMenuItem,
  HeaderDecoration,
  ViewLayer,
  ViewLayerChange,
} from './ViewLayer'

export type FilterOp =
  | { kind: 'text-contains'; value: string; caseSensitive: boolean }
  | { kind: 'text-equals'; value: string; caseSensitive: boolean }
  | { kind: 'number-between'; min: number | null; max: number | null }
  | { kind: 'number-equals'; value: number }
  | { kind: 'date-between'; start: Date | null; end: Date | null }
  | { kind: 'select-in'; values: readonly string[] }
  | { kind: 'checkbox-equals'; value: boolean }
  | { kind: 'is-empty' }
  | { kind: 'is-not-empty' }

export interface FilterSpec {
  readonly fieldId: string
  readonly op: FilterOp
}

type FilterPredicate = (value: CellValue | undefined) => boolean

export class FilterLayer implements ViewLayer<FilterSpec | null> {
  readonly id = 'filter'

  private spec: FilterSpec | null = null
  private notify: ((change: ViewLayerChange) => void) | null = null
  private fieldsById = new Map<string, Field>()
  private schemaKnown = false

  bindPipeline(notify: (change: ViewLayerChange) => void): void {
    this.notify = notify
  }

  getSpec(): FilterSpec | null {
    return this.spec
  }

  isActive(fieldId: string): boolean {
    return this.spec?.fieldId === fieldId
  }

  setSpec(spec: FilterSpec | null): boolean {
    if (spec && !this.canFilterField(spec.fieldId, spec.op)) return false
    if (sameSpec(this.spec, spec)) return false
    this.spec = spec
    this.notify?.({ layerId: this.id, reason: 'spec-changed' })
    return true
  }

  clear(fieldId?: string): boolean {
    if (this.spec == null) return false
    if (fieldId != null && this.spec.fieldId !== fieldId) return false
    return this.setSpec(null)
  }

  wrap(upstream: DataSource): DataSource {
    this.captureSchema(upstream)
    this.clearInvalidSpec()
    return new FilteredDataSource(upstream, () => this.spec, (source) => {
      this.captureSchema(source)
      this.clearInvalidSpec()
      this.notify?.({ layerId: this.id, reason: 'upstream-reset' })
    })
  }

  headerDecoration(field: Field): HeaderDecoration | null {
    if (!this.isActive(field.id)) return null
    return { filterActive: true }
  }

  contextMenuItems(ctx: ColumnHeaderMenuContext): readonly ColumnHeaderMenuItem[] {
    const active = this.isActive(ctx.field.id)
    return [
      {
        id: 'filter-open',
        label: 'Filter...',
        disabled: !isFilterableField(ctx.field),
        checked: active,
      },
      {
        id: 'filter-clear',
        label: 'Clear filter',
        disabled: !active,
        checked: false,
      },
    ]
  }

  private captureSchema(source: DataSource): void {
    this.fieldsById = new Map(source.getSchema().fields.map((field) => [field.id, field]))
    this.schemaKnown = true
  }

  private clearInvalidSpec(): void {
    if (this.spec && !this.canFilterField(this.spec.fieldId, this.spec.op)) this.spec = null
  }

  private canFilterField(fieldId: string, op: FilterOp): boolean {
    const field = this.fieldsById.get(fieldId)
    return this.schemaKnown ? field != null && isCompatibleFilterOp(field, op) : true
  }
}

class FilteredDataSource implements DataSource {
  private order: number[] = []
  private inverse: number[] = []
  private listeners = new Set<DataSourceListener>()
  private readonly unsubscribeFromUpstream: () => void
  private disposed = false
  readonly updateCell?: MutableDataSource['updateCell']
  readonly updateCellByUnderlyingRow?: MutableDataSource['updateCellByUnderlyingRow']

  constructor(
    private readonly upstream: DataSource,
    private readonly getSpec: () => FilterSpec | null,
    private readonly onUpstreamReset: (source: DataSource) => void,
  ) {
    const mutableUpstream = isMutableDataSource(this.upstream) ? this.upstream : null
    if (mutableUpstream) {
      this.updateCell = (rowIndex, fieldId, value) => {
        const upstreamRow = this.order[rowIndex]
        if (upstreamRow == null) return
        mutableUpstream.updateCell(upstreamRow, fieldId, value)
      }
      this.updateCellByUnderlyingRow = (underlyingRow, fieldId, value) => {
        if (mutableUpstream.updateCellByUnderlyingRow) {
          mutableUpstream.updateCellByUnderlyingRow(underlyingRow, fieldId, value)
          return
        }
        const upstreamRow = this.upstream.findViewRow?.(underlyingRow) ?? underlyingRow
        mutableUpstream.updateCell(upstreamRow, fieldId, value)
      }
    }
    this.rebuild()
    this.unsubscribeFromUpstream = this.upstream.subscribe((event) => this.handleUpstreamEvent(event))
  }

  getRowCount(): number {
    return this.order.length
  }

  getSchema(): Schema {
    return this.upstream.getSchema()
  }

  getRows(startIndex: number, endIndex: number): Row[] {
    const start = Math.max(0, startIndex)
    const end = Math.min(this.getRowCount() - 1, endIndex)
    if (end < start) return []
    const rows: Row[] = []
    for (let viewRow = start; viewRow <= end; viewRow += 1) {
      const upstreamRow = this.order[viewRow]
      if (upstreamRow == null) continue
      const upstreamRows = this.upstream.getRows(upstreamRow, upstreamRow)
      if (upstreamRows instanceof Promise) {
        throw new Error('FilterLayer requires synchronous upstream rows')
      }
      const row = upstreamRows[0]
      if (row) rows.push(row)
    }
    return rows
  }

  getCell(rowIndex: number, fieldId: string): CellValue | undefined {
    const upstreamRow = this.order[rowIndex]
    if (upstreamRow == null) return undefined
    return this.upstream.getCell(upstreamRow, fieldId)
  }

  resolveUnderlyingRow(viewRow: number): number {
    const upstreamRow = this.order[viewRow]
    if (upstreamRow == null) return -1
    return this.upstream.resolveUnderlyingRow?.(upstreamRow) ?? upstreamRow
  }

  findViewRow(underlyingRow: number): number {
    const upstreamRow = this.upstream.findViewRow?.(underlyingRow) ?? underlyingRow
    if (upstreamRow < 0) return -1
    return this.inverse[upstreamRow] ?? -1
  }

  subscribe(listener: DataSourceListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.unsubscribeFromUpstream()
  }

  private handleUpstreamEvent(event: DataSourceEvent): void {
    if (this.disposed) return
    if (event.type === 'rowsChanged') {
      this.emit(event)
      return
    }

    this.onUpstreamReset(this.upstream)
    this.rebuild()
    this.emit(filterStructuralEvent(event, this.getRowCount()))
  }

  private rebuild(): void {
    const rowCount = this.upstream.getRowCount()
    const spec = this.getSpec()
    const field = spec
      ? this.upstream.getSchema().fields.find((candidate) => candidate.id === spec.fieldId)
      : null
    const predicate = spec && field && isCompatibleFilterOp(field, spec.op) ? buildPredicate(field, spec.op) : null

    this.order = []
    for (let upstreamRow = 0; upstreamRow < rowCount; upstreamRow += 1) {
      if (predicate == null || predicate(this.upstream.getCell(upstreamRow, spec?.fieldId ?? ''))) {
        this.order.push(upstreamRow)
      }
    }

    this.inverse = []
    for (let viewRow = 0; viewRow < this.order.length; viewRow += 1) {
      const upstreamRow = this.order[viewRow]
      if (upstreamRow != null) this.inverse[upstreamRow] = viewRow
    }
  }

  private emit(event: DataSourceEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}

function filterStructuralEvent(event: DataSourceEvent, rowCount: number): DataSourceEvent {
  return event.type === 'rowCountChanged' ? { type: 'rowCountChanged', newCount: rowCount } : event
}

function sameSpec(left: FilterSpec | null, right: FilterSpec | null): boolean {
  if (left == null || right == null) return left === right
  return left.fieldId === right.fieldId && sameOp(left.op, right.op)
}

function sameOp(left: FilterOp, right: FilterOp): boolean {
  if (left.kind !== right.kind) return false
  switch (left.kind) {
    case 'text-contains':
    case 'text-equals':
      return (
        right.kind === left.kind &&
        left.value === right.value &&
        left.caseSensitive === right.caseSensitive
      )
    case 'number-between':
      return right.kind === left.kind && left.min === right.min && left.max === right.max
    case 'number-equals':
      return right.kind === left.kind && left.value === right.value
    case 'date-between':
      return (
        right.kind === left.kind &&
        dateTime(left.start) === dateTime(right.start) &&
        dateTime(left.end) === dateTime(right.end)
      )
    case 'select-in':
      return right.kind === left.kind && sameStringArray(left.values, right.values)
    case 'checkbox-equals':
      return right.kind === left.kind && left.value === right.value
    case 'is-empty':
    case 'is-not-empty':
      return true
  }
}

function sameStringArray(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function isFilterableField(_field: Field): boolean {
  return true
}

function isCompatibleFilterOp(field: Field, op: FilterOp): boolean {
  if (op.kind === 'is-empty' || op.kind === 'is-not-empty') return true
  if (field.type === 'text' || field.type === 'url') {
    return op.kind === 'text-contains' || op.kind === 'text-equals'
  }
  if (field.type === 'number') return op.kind === 'number-between' || op.kind === 'number-equals'
  if (field.type === 'date') return op.kind === 'date-between'
  if (field.type === 'singleSelect' || field.type === 'multiSelect') return op.kind === 'select-in'
  if (field.type === 'checkbox') return op.kind === 'checkbox-equals'
  return false
}

function buildPredicate(field: Field, op: FilterOp): FilterPredicate {
  switch (op.kind) {
    case 'text-contains':
      return buildTextPredicate(op.value, op.caseSensitive, (cell, expected) => cell.includes(expected))
    case 'text-equals':
      return buildTextPredicate(op.value, op.caseSensitive, (cell, expected) => cell === expected)
    case 'number-between':
      return (value) => {
        const number = numberValue(value)
        return number != null && (op.min == null || number >= op.min) && (op.max == null || number <= op.max)
      }
    case 'number-equals':
      return (value) => numberValue(value) === op.value
    case 'date-between':
      return (value) => {
        const time = dateValue(value)
        const start = dateTime(op.start)
        const end = dateTime(op.end)
        return time != null && (start == null || time >= start) && (end == null || time <= end)
      }
    case 'select-in':
      return field.type === 'multiSelect'
        ? (value) => multiSelectValue(value).some((item) => op.values.includes(item))
        : (value) => {
            const text = textValue(value)
            return text != null && op.values.includes(text)
          }
    case 'checkbox-equals':
      return (value) => value === op.value
    case 'is-empty':
      return (value) => isEmptyValue(value, field)
    case 'is-not-empty':
      return (value) => !isEmptyValue(value, field)
  }
}

function buildTextPredicate(
  expected: string,
  caseSensitive: boolean,
  match: (cell: string, expected: string) => boolean,
): FilterPredicate {
  const normalizedExpected = caseSensitive ? expected : expected.toLocaleLowerCase()
  return (value) => {
    const cell = textValue(value)
    if (cell == null) return false
    const normalizedCell = caseSensitive ? cell : cell.toLocaleLowerCase()
    return match(normalizedCell, normalizedExpected)
  }
}

function isEmptyValue(value: CellValue | undefined, field: Field): boolean {
  if (value == null) return true
  if (field.type === 'text' || field.type === 'url' || field.type === 'singleSelect') return value === ''
  if (field.type === 'multiSelect') return Array.isArray(value) && value.length === 0
  return false
}

function textValue(value: CellValue | undefined): string | null {
  if (value == null || value === '') return null
  return typeof value === 'string' ? value : String(value)
}

function multiSelectValue(value: CellValue | undefined): readonly string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function numberValue(value: CellValue | undefined): number | null {
  return typeof value === 'number' && !Number.isNaN(value) ? value : null
}

function dateValue(value: CellValue | undefined): number | null {
  if (value == null) return null
  const time = value instanceof Date ? value.getTime() : new Date(value as string | number).getTime()
  return Number.isNaN(time) ? null : time
}

function dateTime(value: Date | null): number | null {
  if (value == null) return null
  const time = value.getTime()
  return Number.isNaN(time) ? null : time
}
