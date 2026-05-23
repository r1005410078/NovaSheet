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

export type SortDirection = 'asc' | 'desc'

export interface SortSpec {
  readonly fieldId: string
  readonly direction: SortDirection
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export class SortLayer implements ViewLayer<SortSpec | null> {
  readonly id = 'sort'

  private spec: SortSpec | null = null
  private notify: ((change: ViewLayerChange) => void) | null = null
  private fieldsById = new Map<string, Field>()
  private schemaKnown = false

  bindPipeline(notify: (change: ViewLayerChange) => void): void {
    this.notify = notify
  }

  getSpec(): SortSpec | null {
    return this.spec
  }

  getDirection(fieldId: string): SortDirection | null {
    return this.spec?.fieldId === fieldId ? this.spec.direction : null
  }

  setSpec(spec: SortSpec | null): boolean {
    if (spec && !this.canSortField(spec.fieldId)) return false
    if (sameSpec(this.spec, spec)) return false
    this.spec = spec
    this.notify?.({ layerId: this.id, reason: 'spec-changed' })
    return true
  }

  cycle(fieldId: string): SortSpec | null {
    const next: SortSpec | null =
      this.spec?.fieldId !== fieldId
        ? { fieldId, direction: 'asc' }
        : this.spec.direction === 'asc'
          ? { fieldId, direction: 'desc' }
          : null
    this.setSpec(next)
    return this.spec
  }

  wrap(upstream: DataSource): DataSource {
    this.captureSchema(upstream)
    if (this.spec && !this.canSortField(this.spec.fieldId)) this.spec = null
    return new SortedDataSource(upstream, () => this.spec, (source) => {
      this.captureSchema(source)
      if (this.spec && !this.canSortField(this.spec.fieldId)) this.spec = null
      this.notify?.({ layerId: this.id, reason: 'upstream-reset' })
    })
  }

  headerDecoration(field: Field): HeaderDecoration | null {
    if (this.spec?.fieldId !== field.id) return null
    return { sortIndicator: this.spec.direction }
  }

  contextMenuItems(ctx: ColumnHeaderMenuContext): readonly ColumnHeaderMenuItem[] {
    const activeDirection = this.spec?.fieldId === ctx.field.id ? this.spec.direction : null
    const disabled = !isSortableField(ctx.field)
    return [
      {
        id: 'sort-asc',
        label: '升序排序',
        disabled,
        checked: activeDirection === 'asc',
      },
      {
        id: 'sort-desc',
        label: '降序排序',
        disabled,
        checked: activeDirection === 'desc',
      },
      {
        id: 'sort-none',
        label: '清除排序',
        disabled: activeDirection == null,
        checked: false,
      },
    ]
  }

  private captureSchema(source: DataSource): void {
    this.fieldsById = new Map(source.getSchema().fields.map((field) => [field.id, field]))
    this.schemaKnown = true
  }

  private canSortField(fieldId: string): boolean {
    const field = this.fieldsById.get(fieldId)
    return this.schemaKnown ? field != null && isSortableField(field) : true
  }
}

class SortedDataSource implements DataSource {
  private order: number[] = []
  private inverse: number[] = []
  private listeners = new Set<DataSourceListener>()
  private readonly unsubscribeFromUpstream: () => void
  private disposed = false
  readonly updateCell?: MutableDataSource['updateCell']
  readonly updateCellByUnderlyingRow?: MutableDataSource['updateCellByUnderlyingRow']

  constructor(
    private readonly upstream: DataSource,
    private readonly getSpec: () => SortSpec | null,
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
    return this.upstream.getRowCount()
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
        throw new Error('SortLayer requires synchronous upstream rows')
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

    this.rebuild()
    this.onUpstreamReset(this.upstream)
    this.emit(event)
  }

  private rebuild(): void {
    const rowCount = this.upstream.getRowCount()
    this.order = Array.from({ length: rowCount }, (_, index) => index)

    const spec = this.getSpec()
    const field = spec
      ? this.upstream.getSchema().fields.find((candidate) => candidate.id === spec.fieldId)
      : null
    if (spec && field && isSortableField(field)) {
      const direction = spec.direction === 'asc' ? 1 : -1
      this.order.sort((leftRow, rightRow) => {
        const leftValue = this.upstream.getCell(leftRow, spec.fieldId)
        const rightValue = this.upstream.getCell(rightRow, spec.fieldId)
        const leftNullish = isNullishForField(leftValue, field)
        const rightNullish = isNullishForField(rightValue, field)
        if (leftNullish && rightNullish) return leftRow - rightRow
        if (leftNullish) return 1
        if (rightNullish) return -1
        const result = compareByFieldType(leftValue, rightValue, field)
        return result === 0 ? leftRow - rightRow : result * direction
      })
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

function sameSpec(left: SortSpec | null, right: SortSpec | null): boolean {
  return left?.fieldId === right?.fieldId && left?.direction === right?.direction
}

function isSortableField(field: Field): boolean {
  return field.type !== 'multiSelect'
}

function compareByFieldType(
  left: CellValue | undefined,
  right: CellValue | undefined,
  field: Field,
): number {
  const type = field.type
  if (type === 'number') return compareNullable(numberValue(left), numberValue(right), compareNumbers)
  if (type === 'date') return compareNullable(dateValue(left), dateValue(right), compareNumbers)
  if (type === 'checkbox') return compareNullable(checkboxValue(left), checkboxValue(right), compareNumbers)
  if (type === 'singleSelect') return compareSingleSelect(left, right, field)
  return compareTextLike(left, right)
}

function isNullishForField(value: CellValue | undefined, field: Field): boolean {
  if (field.type === 'number') return numberValue(value) == null
  if (field.type === 'date') return dateValue(value) == null
  if (field.type === 'checkbox') return checkboxValue(value) == null
  if (field.type === 'singleSelect') {
    const choices = Array.isArray(field.options?.choices)
      ? field.options.choices.filter((choice): choice is string => typeof choice === 'string')
      : []
    if (choices.length === 0) return textValue(value) == null
    const normalized = textValue(value)
    return normalized == null || !choices.includes(normalized)
  }
  return textValue(value) == null
}

function compareTextLike(left: CellValue | undefined, right: CellValue | undefined): number {
  return compareNullable(textValue(left), textValue(right), (a, b) => collator.compare(a, b))
}

function compareSingleSelect(left: CellValue | undefined, right: CellValue | undefined, field: Field): number {
  const choices = Array.isArray(field.options?.choices)
    ? field.options.choices.filter((choice): choice is string => typeof choice === 'string')
    : []
  if (choices.length === 0) return compareTextLike(left, right)

  const leftText = textValue(left)
  const rightText = textValue(right)
  const leftIndex = leftText == null ? null : choices.indexOf(leftText)
  const rightIndex = rightText == null ? null : choices.indexOf(rightText)
  const normalizedLeft = leftIndex == null || leftIndex < 0 ? null : leftIndex
  const normalizedRight = rightIndex == null || rightIndex < 0 ? null : rightIndex
  return compareNullable(normalizedLeft, normalizedRight, compareNumbers)
}

function compareNullable<T>(
  left: T | null,
  right: T | null,
  compare: (left: T, right: T) => number,
): number {
  if (left == null && right == null) return 0
  if (left == null) return 1
  if (right == null) return -1
  return compare(left, right)
}

function compareNumbers(left: number, right: number): number {
  return left === right ? 0 : left < right ? -1 : 1
}

function textValue(value: CellValue | undefined): string | null {
  if (value == null || value === '') return null
  return typeof value === 'string' ? value : String(value)
}

function numberValue(value: CellValue | undefined): number | null {
  return typeof value === 'number' && !Number.isNaN(value) ? value : null
}

function dateValue(value: CellValue | undefined): number | null {
  if (value == null) return null
  const time = value instanceof Date ? value.getTime() : new Date(value as string | number).getTime()
  return Number.isNaN(time) ? null : time
}

function checkboxValue(value: CellValue | undefined): number | null {
  return typeof value === 'boolean' ? Number(value) : null
}
