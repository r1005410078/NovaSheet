import type { CellRange } from '../coords/SelectionTypes'
import { columnIndexToLetter } from '../geometry/columnLetter'
import type { DataSource, DataSourceEvent, DataSourceListener } from './DataSource'
import type { CellValue, Field, Row, Schema } from './Schema'

export interface SparseExcelDataSourceOptions {
  readonly rowCount?: number
  readonly colCount?: number
}

export interface SparseExcelWorkspaceSize {
  readonly rowCount: number
  readonly colCount: number
}

/**
 * Excel-like sparse DataSource：logical workspace starts large, but only real cells are stored.
 */
export class SparseExcelDataSource implements DataSource {
  private rowCount: number
  private schema: Schema
  private readonly cells = new Map<string, CellValue>()
  private readonly listeners = new Set<DataSourceListener>()

  constructor(options: SparseExcelDataSourceOptions = {}) {
    this.rowCount = options.rowCount ?? 1_000
    this.schema = { fields: makeFields(options.colCount ?? 26) }
  }

  getRowCount(): number {
    return this.rowCount
  }

  getSchema(): Schema {
    return this.schema
  }

  getRows(startIndex: number, endIndex: number): Row[] {
    const start = Math.max(0, startIndex)
    const end = Math.min(this.rowCount - 1, endIndex)
    if (end < start) return []
    return Array.from({ length: end - start + 1 }, (_, offset) => this.rowAt(start + offset))
  }

  getCell(rowIndex: number, fieldId: string): CellValue | undefined {
    const colIndex = this.fieldIdToCol(fieldId)
    if (colIndex < 0) return undefined
    return this.cells.get(cellKey(rowIndex, colIndex))
  }

  updateCell(rowIndex: number, fieldId: string, value: CellValue): void {
    if (rowIndex < 0 || rowIndex >= this.rowCount) return
    const colIndex = this.fieldIdToCol(fieldId)
    if (colIndex < 0) return
    const key = cellKey(rowIndex, colIndex)
    if (value === null || value === '') this.cells.delete(key)
    else this.cells.set(key, value)
    this.emit({ type: 'rowsChanged', startIndex: rowIndex, endIndex: rowIndex })
  }

  appendRows(count: number): void {
    if (count <= 0) return
    this.rowCount += count
    this.emit({ type: 'rowCountChanged', newCount: this.rowCount })
  }

  appendCols(count: number): void {
    if (count <= 0) return
    this.schema = { fields: makeFields(this.schema.fields.length + count) }
    this.emit({ type: 'schemaChanged' })
  }

  resizeWorkspace(size: SparseExcelWorkspaceSize): void {
    const bounds = this.getContentBounds()
    if (bounds && (size.rowCount <= bounds.endRow || size.colCount <= bounds.endCol)) {
      throw new Error('SparseExcelDataSource.resizeWorkspace: target would drop materialized content')
    }

    const rowChanged = size.rowCount !== this.rowCount
    const colChanged = size.colCount !== this.schema.fields.length
    this.rowCount = size.rowCount
    if (colChanged) this.schema = { fields: makeFields(size.colCount) }
    if (rowChanged) this.emit({ type: 'rowCountChanged', newCount: this.rowCount })
    if (colChanged) this.emit({ type: 'schemaChanged' })
  }

  getContentBounds(): CellRange | null {
    let startRow = Number.POSITIVE_INFINITY
    let endRow = -1
    let startCol = Number.POSITIVE_INFINITY
    let endCol = -1

    for (const key of this.cells.keys()) {
      const [row, col] = parseCellKey(key)
      startRow = Math.min(startRow, row)
      endRow = Math.max(endRow, row)
      startCol = Math.min(startCol, col)
      endCol = Math.max(endCol, col)
    }

    if (endRow < 0 || endCol < 0) return null
    return { startRow, endRow, startCol, endCol }
  }

  hasMaterializedRows(start: number, end: number): boolean {
    for (const key of this.cells.keys()) {
      const [row] = parseCellKey(key)
      if (row >= start && row <= end) return true
    }
    return false
  }

  hasMaterializedCols(start: number, end: number): boolean {
    for (const key of this.cells.keys()) {
      const [, col] = parseCellKey(key)
      if (col >= start && col <= end) return true
    }
    return false
  }

  subscribe(listener: DataSourceListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private rowAt(rowIndex: number): Row {
    const row: Record<string, CellValue> = {}
    for (const field of this.schema.fields) {
      const value = this.getCell(rowIndex, field.id)
      if (value !== undefined) row[field.id] = value
    }
    return row
  }

  private fieldIdToCol(fieldId: string): number {
    return this.schema.fields.findIndex((field) => field.id === fieldId)
  }

  private emit(event: DataSourceEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}

function makeFields(count: number): Field[] {
  return Array.from({ length: count }, (_, index) => {
    const name = columnIndexToLetter(index)
    return {
      id: name,
      name,
      type: 'text',
      width: 96,
    }
  })
}

function cellKey(row: number, col: number): string {
  return `${row}:${col}`
}

function parseCellKey(key: string): readonly [number, number] {
  const parts = key.split(':')
  return [Number(parts[0]), Number(parts[1])]
}
