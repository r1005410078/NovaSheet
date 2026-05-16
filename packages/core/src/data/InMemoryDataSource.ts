import type { DataSource, DataSourceEvent, DataSourceListener } from './DataSource'
import type { CellValue, Row, Schema } from './Schema'

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

  /**
   * 整体替换数据。先发 rowCountChanged 让 Grid 重建 axis（行数变了），
   * 再发 reset 触发完整 invalidate。
   */
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
