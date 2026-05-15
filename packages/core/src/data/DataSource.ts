import type { CellValue, Row, Schema } from './Schema'

/** 数据源可发出的事件类型 */
export type DataSourceEvent =
  | { type: 'reset' }
  | { type: 'rowsChanged'; startIndex: number; endIndex: number }
  | { type: 'schemaChanged' }
  | { type: 'rowCountChanged'; newCount: number }

/** 数据源事件监听器 */
export type DataSourceListener = (event: DataSourceEvent) => void

/** 数据源接口：Renderer 与 Grid 通过此接口读取所有数据 */
export interface DataSource {
  /** 返回总行数 */
  getRowCount(): number
  /** 返回 Schema（字段定义列表） */
  getSchema(): Schema
  /**
   * 范围预取通道：Renderer 每帧调用一次，传入可见行区间。
   * endIndex 含（inclusive）—— 与 ChunkedAxis.getVisibleRange [first, last] 语义一致。
   * 同步实现直接返回 Row[]；异步实现返回 Promise，IO 完成后应 emit `rowsChanged` 触发重绘。
   */
  getRows(startIndex: number, endIndex: number): Row[] | Promise<Row[]>
  /**
   * 热路径单元格读取，必须同步。
   * 异步数据源在对应行未加载时返回 undefined，渲染器绘制占位符直至 `rowsChanged` 到达。
   */
  getCell(rowIndex: number, fieldId: string): CellValue | undefined
  /** 订阅数据源事件，返回取消订阅函数 */
  subscribe(listener: DataSourceListener): () => void
}
