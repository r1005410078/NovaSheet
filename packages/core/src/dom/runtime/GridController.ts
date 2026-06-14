import type { BorderPreset, BorderStyle, TextWrapMode, CellFormat, ValueFormat } from '../../kernel/protocol/FormatTypes'
import type { MergeRegion } from '../../kernel/coords/MergeRegion'
import type { CellRange, GridSelection } from '../../kernel/coords/SelectionTypes'
import type { ContextMenuItem } from '../../features/context-menu/ContextMenuModel'
import type { DataSource } from '../../kernel/data/DataSource'
import type { Field } from '../../kernel/data/Schema'
import type { FilterLayer, FilterSpec } from '../../features/view/FilterLayer'
import type { SortLayer, SortSpec } from '../../features/view/SortLayer'
import type { ViewPipeline } from '../../features/view/ViewPipeline'
import type { FrozenConfig } from '../../kernel/geometry/FrozenRegions'
import type { GridEngineOptions } from '../../engine/GridEngine'
import type { Theme } from '../../kernel/theme/Theme'
import type { FillEvent, RedoEvent, UndoEvent } from './GridRuntime'
export type { FillEvent, RedoEvent, UndoEvent }
export type { CellEditor, CellEditorOpenContext, CellEditorRegistry, CellEditorTrigger } from '../interaction/CellEditorContract'

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
  refresh(): void
  scrollToRow(rowIndex: number, align?: 'start' | 'center' | 'end'): void
  scrollToCell(rowIndex: number, fieldId: string): void
  openCellEditor(rowIndex: number, fieldId: string): boolean
  /**
   * 按当前列宽和文本内容批量重算 `field.wrap === true` 字段的行高（M3 autofit）。
   * 手动触发；后续若改了列宽 / 数据 / 主题需要再次调用。
   */
  autofitRows(options?: AutofitRowsOptions): AutofitRowsResult
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
  /** Phase 4.5 — 返回当前隐藏行的 underlying row id 升序数组。 */
  getHiddenRows(): readonly number[]
  /** Phase 4.5 — 在 beforeUnderlyingRow 位置前插入 count 空白行。 */
  insertRows(beforeUnderlyingRow: number, count: number): readonly number[]
  /** Phase 4.5 — 删除给定 underlying row id 集合（调用方保证升序、去重）。 */
  deleteRows(underlyingRowIds: readonly number[]): void
  /** Phase 4.5 — 隐藏给定 underlying row id 集合。 */
  hideRows(underlyingRowIds: readonly number[]): void
  /** Phase 4.5 — 批量将多行高度设置为同一值 h。 */
  setRowHeights(rowIds: readonly number[], h: number): void
  /** Phase 4.5 — 程序化设置选区。 */
  setSelection(selection: GridSelection): void
  /** Phase 5-A — 返回当前选区，供外部工具栏按任意选区操作。 */
  getSelection(): GridSelection
  /** Phase 4.5 — 返回行头右键菜单项列表（含条件项）。 */
  getRowHeaderContextMenuItems(ctx: { targetRowIndex: number }): readonly ContextMenuItem[]
  /** Phase 4.5 — 执行行头右键菜单动作。 */
  invokeRowHeaderContextMenuAction(id: string, ctx: { targetRowIndex: number }): void
  /** Phase 4.6 — 在 schema field index 前插入 count 个列字段。 */
  insertCols(beforeFieldIndex: number, count: number): readonly Field[]
  /** Phase 4.6 — 按 fieldId 删除列字段。 */
  deleteCols(fieldIds: readonly string[]): void
  /** Phase 4.6 — 隐藏给定 fieldId 集合。 */
  hideCols(fieldIds: readonly string[]): void
  /** Phase 4.6 — 取消隐藏给定 fieldId 集合。 */
  unhideCols(fieldIds: readonly string[]): void
  /** Phase 4.6 — 批量将多列宽度设置为同一值。 */
  setColumnWidths(fieldIds: readonly string[], widthPx: number): void
  /** Phase 4.6 — 返回当前隐藏列 fieldId。 */
  getHiddenCols(): readonly string[]
  /** Phase 4.7 — 按 fieldId 移动连续列组；`beforeFieldId=null` 表示移动到末尾。 */
  moveCols(fieldIds: readonly string[], beforeFieldId: string | null): boolean
  /** Phase 4.6 — 返回列头右键菜单项列表（含结构项）。 */
  getColumnHeaderContextMenuItems(ctx: { targetColIndex: number }): readonly ContextMenuItem[]
  /** Phase 4.6 — 执行列头右键菜单动作。 */
  invokeColumnHeaderContextMenuAction(id: string, ctx: { targetColIndex: number }): void
  /** Phase 5-A — 为 view `range` 设置填充色；`color=null` 清除；仅在变化时刷新并返回 true。 */
  setFillColor(range: CellRange, color: string | null): boolean
  /** Phase 5-A — 为 view `range` 设置基础边框；`preset='clear'` 需 `border=null`；变化时刷新并返回 true。 */
  setBorders(range: CellRange, preset: BorderPreset, border: BorderStyle | null): boolean
  /** 设置 view `range` 值格式（Phase 5-C）；变化时刷新并返回 true。 */
  setValueFormat(range: CellRange, valueFormat: ValueFormat): boolean
  /** 给 raw cell 写扩展附件；data=undefined 清除；变化时返回 true。 */
  setCellAttachment(namespace: string, rawRow: number, rawCol: number, data: unknown): boolean
  /** 读 raw cell 的扩展附件；无则 undefined。 */
  getCellAttachment(namespace: string, rawRow: number, rawCol: number): unknown
  /** 读 raw 坐标单元格文本（String(value)，空为 ''）。cell-kit selection-bold adapter 用。 */
  getCellText(rawRow: number, rawCol: number): string
  /** 为 view `range` 设置文本显示模式（overflow/wrap/clip）；变化时刷新并返回 true。 */
  setTextWrap(range: CellRange, mode: TextWrapMode): boolean
  /** Phase 5-A — 合并 view `range`；成功刷新并返回 true。 */
  mergeCells(range: CellRange): boolean
  /** Phase 5-A — 取消 view `range` 触及的合并区域；移除任意区域则刷新并返回 true。 */
  unmergeCells(range: CellRange): boolean
  /** 解析 view 坐标的单元格格式；无格式返回 undefined。 */
  getViewCellFormat(viewRow: number, viewCol: number): CellFormat | undefined
  /** 返回覆盖 view 坐标单元格的合并区域；无则返回 null。 */
  getViewMergeRegion(viewRow: number, viewCol: number): MergeRegion | null
  getSortLayer(): SortLayer
  getFilterLayer(): FilterLayer
  getViewPipeline(): ViewPipeline
  on<K extends keyof GridPublicEventMap>(
    eventName: K,
    handler: (event: GridPublicEventMap[K]) => void,
  ): () => void
}

export type { GridEngineOptions }
