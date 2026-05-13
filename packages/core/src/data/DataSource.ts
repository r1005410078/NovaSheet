import type { CellValue, Row, Schema } from './Schema'

export type DataSourceEvent =
  | { type: 'reset' }
  | { type: 'rowsChanged'; startIndex: number; endIndex: number }
  | { type: 'schemaChanged' }
  | { type: 'rowCountChanged'; newCount: number }

export type DataSourceListener = (event: DataSourceEvent) => void

export interface DataSource {
  getRowCount(): number
  getSchema(): Schema
  /**
   * Range prefetch channel. Renderer calls once per frame with the visible row range.
   * endIndex is INCLUSIVE — matches ChunkedAxis.getVisibleRange [first, last] semantics.
   * Sync impls return rows immediately; async impls may return a Promise that resolves
   * after IO. Async resolution should emit a `rowsChanged` event to trigger re-paint.
   */
  getRows(startIndex: number, endIndex: number): Row[] | Promise<Row[]>
  /**
   * Hot-path cell read. Must be synchronous. Returns undefined if the row/field is not
   * loaded (async sources draw placeholder until `rowsChanged` arrives).
   */
  getCell(rowIndex: number, fieldId: string): CellValue | undefined
  subscribe(listener: DataSourceListener): () => void
}
