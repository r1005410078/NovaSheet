import type {
  DataSource,
  FilterLayer,
  FilterSpec,
  FrozenConfig,
  GridEngineOptions,
  SortLayer,
  SortSpec,
  Theme,
  ViewPipeline,
} from '@novasheet/core'
import type { FillEvent, RedoEvent, UndoEvent } from '../runtime/WebGridRuntime'
export type { FillEvent, RedoEvent, UndoEvent }

export interface ViewChangeEvent {
  readonly layerId: 'sort' | 'filter'
}

export interface SortChangeEvent {
  readonly spec: SortSpec | null
}

export interface FilterChangeEvent {
  readonly spec: FilterSpec | null
}

export interface GridPublicEventMap {
  readonly viewChange: ViewChangeEvent
  readonly sortChange: SortChangeEvent
  readonly filterChange: FilterChangeEvent
}

/** Grid.autofitRows 入参。`rows` 缺省 = 全表。 */
export interface AutofitRowsOptions {
  /** 仅 autofit 指定行；缺省 = 全部 */
  rows?: readonly number[]
  /** 行高下限（CSS px），缺省 = theme.metrics.rowHeight */
  minHeight?: number
  /** 行高上限（CSS px），缺省 1200 */
  maxHeight?: number
}

/** Grid.autofitRows 结果。 */
export interface AutofitRowsResult {
  changedRows: number
  skippedRows: number
}

/**
 * 渲染后端对内契约（Canvas2D / 未来 WebGL 等）。
 *
 * `Grid` 门面只依赖本接口，不把 Canvas2D 装配细节暴露给调用方。
 * 新增后端时实现此接口，并在 `Grid` 构造函数的 `switch (renderer)` 中注册。
 */
export interface GridController {
  setData(data: DataSource): void
  setTheme(theme: Theme): void
  setRowHeight(rowIndex: number, height: number): void
  setColumnWidth(fieldId: string, width: number): void
  setFrozen(config: Partial<FrozenConfig>): void
  setFrozen(rows: number, cols: number): void
  refresh(): void
  scrollToRow(rowIndex: number, align?: 'start' | 'center' | 'end'): void
  scrollToCell(rowIndex: number, fieldId: string): void
  /**
   * 按当前列宽和文本内容批量重算 `field.wrap === true` 字段的行高（M3 autofit）。
   * 手动触发；后续若改了列宽 / 数据 / 主题需要再次调用。
   */
  autofitRows(options?: AutofitRowsOptions): AutofitRowsResult
  setClipboardReady(ready: boolean): void
  openContextMenuAt(rowIndex: number, fieldId: string): void
  closeContextMenu(): void
  /** Phase 4.1 — 程序化触发 copy / cut / paste；走与 menu / 快捷键相同的引擎。 */
  copy(): Promise<boolean>
  cut(): Promise<boolean>
  paste(): Promise<boolean>
  destroy(): void
  /** @internal ResizeObserver 集成测试入口 */
  _onContainerResize(): void
  undo(): void
  redo(): void
  canUndo(): boolean
  canRedo(): boolean
  setOnUndo(cb: (event: UndoEvent) => void): void
  setOnRedo(cb: (event: RedoEvent) => void): void
  onFill(handler: (event: FillEvent) => void): () => void
  /** Phase 4.5 — 取消隐藏指定底层行 ID。 */
  unhideRows(underlyingRowIds: readonly number[]): void
  getSortLayer(): SortLayer
  getFilterLayer(): FilterLayer
  getViewPipeline(): ViewPipeline
  on<K extends keyof GridPublicEventMap>(
    eventName: K,
    handler: (event: GridPublicEventMap[K]) => void,
  ): () => void
}

export type { GridEngineOptions }
