import type { CellValue, Field, Row, Schema } from './Schema'

/**
 * DataSource 发出的变更事件。Renderer 收到后会 invalidate，触发下一帧重绘。
 * - reset：整体数据变更（setRows 等），通常伴随 rowCountChanged
 * - rowsChanged：部分行内容变更（updateCell、异步分页加载完毕等）
 * - schemaChanged：字段定义变化（M3 加列重排、字段增删时使用）
 * - rowCountChanged：行数变化
 * - rowsInserted / rowsDeleted：行结构变更（Phase 4.5+）；订阅方按需重建本地缓存
 * - rowsMoved：行顺序变更（Phase 4.7 follow-up+）
 * - colsInserted / colsDeleted：列结构变更（Phase 4.6+）；订阅方按需重建本地缓存
 * - colsMoved：列顺序变更（Phase 4.7+）；字段定义与单元格值仍按 fieldId 锚定
 */
export type DataSourceEvent =
  | { type: 'reset' }
  | { type: 'rowsChanged'; startIndex: number; endIndex: number }
  | { type: 'rowsInserted'; at: number; count: number }
  | { type: 'rowsDeleted'; removed: readonly number[] }
  | { type: 'rowsMoved'; rowIds: readonly number[]; beforeRowId: number | null }
  | { type: 'colsInserted'; at: number; field: Field }
  | { type: 'colsDeleted'; removed: readonly { index: number; fieldId: string }[] }
  | { type: 'colsMoved'; fieldIds: readonly string[]; beforeFieldId: string | null }
  | { type: 'schemaChanged' }
  | { type: 'rowCountChanged'; newCount: number }

/** 数据源事件监听器 */
export type DataSourceListener = (event: DataSourceEvent) => void

/**
 * 矩形数据窗口，四端 INCLUSIVE——与 CellRange / DataSource.getRows 语义一致。
 * 独立于 kernel/coords 的 CellRange 命名：selection 与 data 是不同域。
 */
export interface DataWindow {
  readonly startRow: number
  readonly endRow: number
  readonly startCol: number
  readonly endCol: number
}

/**
 * 渲染引擎与数据后端之间的通用抽象。同/异步双兼容——
 * M1 内置同步实现 InMemoryDataSource；M4+ 接入服务端分页源时，新实现仍是这个接口，
 * 调用方（Renderer / Grid）零改动（CLAUDE.md ADR）。
 */
export interface DataSource {
  /** 返回总行数 */
  getRowCount(): number
  /** 返回 Schema（字段定义列表） */
  getSchema(): Schema
  /**
   * 区间预热通道。Renderer 每帧调一次，告知接下来要访问的行范围。
   * **endIndex 是 INCLUSIVE**——与 ChunkedAxis.getVisibleRange [first, last] 语义一致。
   * 同步源直接返回；异步源可返回 Promise，IO 完成后 emit `rowsChanged` 触发重绘。
   */
  getRows(startIndex: number, endIndex: number): Row[] | Promise<Row[]>
  /**
   * Paint 热点：CellPainter 对每个可见 cell 都调用，**必须同步 + 高吞吐**。
   * 异步源缓存未命中时返回 undefined——Renderer 绘空（M2+ 改绘占位骨架）。
   */
  getCell(rowIndex: number, fieldId: string): CellValue | undefined
  /** 将视图行号解析为底层数据行号；未装饰数据源默认使用 identity。 */
  resolveUnderlyingRow?(viewRow: number): number
  /** 将底层数据行号反查为视图行号；未装饰数据源默认使用 identity。 */
  findViewRow?(underlyingRow: number): number
  /** 订阅变更事件。返回取消订阅的函数。 */
  subscribe(listener: DataSourceListener): () => void
  /**
   * 可视窗口提示。engine 每帧调用；窗口未变时实现须 O(1) 短路。
   * 同步数据源无需实现——异步/窗口化数据源（如 WindowedDataSource）据此驱动预取。
   */
  hintWindow?(window: DataWindow): void
}
