import type { DataSource, DataSourceEvent, DataSourceListener } from './DataSource'
import type { CellValue, Row, Schema } from './Schema'

/** 内存数据源：同步实现，适用于测试和小规模数据场景 */
export class InMemoryDataSource implements DataSource {
  /** 当前 Schema */
  private schema: Schema
  /** 行数据数组 */
  private rows: Row[]
  /** 事件监听器集合 */
  private listeners = new Set<DataSourceListener>()

  constructor(opts: { schema: Schema; rows: Row[] }) {
    this.schema = opts.schema
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

  /** 返回 [startIndex, endIndex]（含）范围内的行数组（同步） */
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

  /** 整体替换行数据并 emit `rowCountChanged` + `reset` 事件 */
  setRows(rows: Row[]): void {
    this.rows = rows.slice()
    this.emit({ type: 'rowCountChanged', newCount: this.rows.length })
    this.emit({ type: 'reset' })
  }

  /** 向所有监听器广播事件 */
  private emit(event: DataSourceEvent): void {
    for (const l of this.listeners) l(event)
  }
}
