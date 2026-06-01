import { createSheetContext } from '@novasheet/core'
import type {
  BorderPreset,
  BorderStyle,
  TextWrapMode,
  CellRange,
  ContextMenuItem,
  ContextMenuAction,
  ContextMenuContext,
  DataSource,
  Field,
  FrozenConfig,
  GridEngineOptions,
  GridSelection,
  PasteSkippedCell,
  Theme,
  FilterLayer,
  SortLayer,
  ViewPipeline,
  SheetContext,
} from '@novasheet/core'
import { Canvas2DBackend } from './backends/Canvas2DBackend'
import { installDefaultExtensions } from './defaults/installDefaultExtensions'
import type {
  AutofitRowsOptions,
  AutofitRowsResult,
  FillEvent,
  GridPublicEventMap,
  GridController,
  RedoEvent,
  UndoEvent,
} from './grid/GridController'

/** 已支持的渲染后端；WebGL 待独立 renderer 包接入后扩展。 */
export type GridRendererBackend = 'canvas2d'
export type GridSheetContext = SheetContext<CanvasRenderingContext2D, HTMLElement>
export type SheetExtensionInstall = (ctx: GridSheetContext) => void

export interface GridOptions extends GridEngineOptions {
  /** Extension context; pass the same context to share capabilities across Grid instances. */
  context?: GridSheetContext
  /** Extension installers applied after default NovaSheet capabilities. */
  extensions?: readonly SheetExtensionInstall[]
  /** 渲染后端，默认 `'canvas2d'`。 */
  renderer?: GridRendererBackend
  /** Phase 4.0 — 右键菜单项被选中时触发；4.1 之后不传走默认引擎（grid.copy/cut/paste）。 */
  onContextMenuAction?: (action: ContextMenuAction, ctx: ContextMenuContext) => void
  /** Phase 4.1 — copy 完成（snapshot 已写剪贴板）。 */
  onCopy?: (range: CellRange) => void
  /** Phase 4.1 — cut 完成（已写剪贴板 + 原格已清）。 */
  onCut?: (range: CellRange) => void
  /** Phase 4.1 — paste 完成（target 范围已应用）。 */
  onPaste?: (target: CellRange) => void
  /** Phase 4.1 — 至少一格因类型不匹配 / read-only 被跳过时触发。 */
  onPasteSkipped?: (cells: readonly PasteSkippedCell[]) => void
  /** Phase 4.2 — undo 完成时触发,携带刚执行的 UndoCommand。 */
  onUndo?: (event: UndoEvent) => void
  /** Phase 4.2 — redo 完成时触发,携带刚执行的 UndoCommand。 */
  onRedo?: (event: RedoEvent) => void
  /** Phase 4.3 — fill handle 提交完成时触发。 */
  onFill?: (event: FillEvent) => void
  /** Phase 4.5 — 插入行完成时触发。 */
  onRowsInserted?: (event: { at: number; count: number; newIds: readonly number[] }) => void
  /** Phase 4.5 — 删除行完成时触发。 */
  onRowsDeleted?: (event: { removed: readonly number[] }) => void
  /** Phase 4.5 — 行隐藏状态变化时触发（hide / unhide 均触发）。 */
  onHideChange?: (event: { hidden: readonly number[] }) => void
  /** Phase 4.6 — 插入列完成时触发。 */
  onColumnsInserted?: (event: { at: number; count: number; newFields: readonly Field[] }) => void
  /** Phase 4.6 — 删除列完成时触发。 */
  onColumnsDeleted?: (event: { removed: readonly { index: number; fieldId: string }[] }) => void
  /** Phase 4.6 — 列隐藏状态变化时触发（hide / unhide 均触发）。 */
  onHideColsChange?: (event: { hidden: readonly string[] }) => void
  /** Phase 4.7 — 列拖拽/程序化重排完成时触发。 */
  onColumnsMoved?: (event: { fieldIds: readonly string[]; beforeFieldId: string | null }) => void
}

/** 启用 Excel 风格列标（A/B/…）与左侧行号。 */
export function withExcelHeaders<T extends GridOptions>(options: T): T {
  return { ...options, excelHeaders: true }
}

/** 从门面选项中剥离非引擎字段，只把引擎参数传给 `DefaultGridEngine`。 */
function engineOptionsFrom(options: GridOptions): GridEngineOptions {
  const {
    context: _ctx,
    extensions: _ext,
    renderer: _r,
    onContextMenuAction: _a,
    onCopy: _c,
    onCut: _x,
    onPaste: _v,
    onPasteSkipped: _s,
    onUndo: _u,
    onRedo: _y,
    onFill: _f,
    onRowsInserted: _ri,
    onRowsDeleted: _rd,
    onHideChange: _hc,
    onColumnsInserted: _ci,
    onColumnsDeleted: _cd,
    onHideColsChange: _hcc,
    onColumnsMoved: _cm,
    ...engineOptions
  } = options
  void _ctx
  void _ext
  void _r
  void _a
  void _c
  void _x
  void _v
  void _s
  void _u
  void _y
  void _f
  void _ri
  void _rd
  void _hc
  void _ci
  void _cd
  void _hcc
  void _cm
  return engineOptions
}

/**
 * 浏览器端对外 Grid 门面（spec §7）。
 *
 * 按 `options.renderer` 选择后端实现（默认 Canvas2D），调用方只需
 * `import { Grid } from '@novasheet/sheet'`，不必依赖 `@novasheet/canvas2d`。
 * 公共 API 方法全部转发给当前后端的 `GridController` 实现。
 */
export class Grid {
  private readonly delegate: GridController
  private readonly options: GridOptions

  constructor(container: HTMLElement, options: GridOptions) {
    this.options = options
    const backend = options.renderer ?? 'canvas2d'
    const engineOptions = engineOptionsFrom(options)
    const context = options.context ?? createSheetContext<CanvasRenderingContext2D, HTMLElement>()
    installDefaultExtensions(context)
    for (const install of options.extensions ?? []) install(context)

    switch (backend) {
      case 'canvas2d':
        this.delegate = new Canvas2DBackend(container, engineOptions, {
          onContextMenuAction: options.onContextMenuAction,
          onCopy: options.onCopy,
          onCut: options.onCut,
          onPaste: options.onPaste,
          onPasteSkipped: options.onPasteSkipped,
          onUndo: options.onUndo,
          onRedo: options.onRedo,
          onFill: options.onFill,
          context,
        })
        break
      default:
        throw new Error(`NovaSheet: renderer "${backend as string}" is not implemented`)
    }
  }

  setData(data: DataSource): void {
    this.delegate.setData(data)
  }

  setTheme(theme: Theme): void {
    this.delegate.setTheme(theme)
  }

  setRowHeight(rowIndex: number, height: number): void {
    this.delegate.setRowHeight(rowIndex, height)
  }

  setColumnWidth(fieldId: string, width: number): void {
    this.delegate.setColumnWidth(fieldId, width)
  }

  setFrozen(config: Partial<FrozenConfig>): void {
    this.delegate.setFrozen(config)
  }

  refresh(): void {
    this.delegate.refresh()
  }

  scrollToRow(rowIndex: number, align?: 'start' | 'center' | 'end'): void {
    this.delegate.scrollToRow(rowIndex, align)
  }

  scrollToCell(rowIndex: number, fieldId: string): void {
    this.delegate.scrollToCell(rowIndex, fieldId)
  }

  /**
   * 按当前列宽 + 文本内容批量重算 `field.wrap === true` 字段的行高（M3 autofit）。
   *
   * 手动 API——后续若改了列宽 / 数据 / 主题需要再次调用。性能：N 行 × K 个 wrap 列
   * × measurer 缓存命中的 wrapText 计算，典型 500 行 × 3 列 < 10ms。
   *
   * @example
   * ```ts
   * grid.autofitRows()                              // 全表
   * grid.autofitRows({ rows: [0, 1, 2, 3, 4] })     // 仅前 5 行
   * grid.autofitRows({ maxHeight: 200 })            // 限制单行最高 200px
   * ```
   */
  autofitRows(options?: AutofitRowsOptions): AutofitRowsResult {
    return this.delegate.autofitRows(options)
  }

  openContextMenuAt(rowIndex: number, fieldId: string): void {
    this.delegate.openContextMenuAt(rowIndex, fieldId)
  }

  closeContextMenu(): void {
    this.delegate.closeContextMenu()
  }

  /** Phase 4.1 — 程序化触发；走与 menu / Ctrl+C 同一引擎。返回 true 表示动作成功（已写剪贴板 / 已应用写入）。 */
  copy(): Promise<boolean> {
    return this.delegate.copy()
  }

  cut(): Promise<boolean> {
    return this.delegate.cut()
  }

  paste(): Promise<boolean> {
    return this.delegate.paste()
  }

  undo(): void {
    this.delegate.undo()
  }

  redo(): void {
    this.delegate.redo()
  }

  canUndo(): boolean {
    return this.delegate.canUndo()
  }

  canRedo(): boolean {
    return this.delegate.canRedo()
  }

  onUndo(handler: (event: UndoEvent) => void): () => void {
    this.delegate.setOnUndo(handler)
    return () => this.delegate.setOnUndo(() => {})
  }

  onRedo(handler: (event: RedoEvent) => void): () => void {
    this.delegate.setOnRedo(handler)
    return () => this.delegate.setOnRedo(() => {})
  }

  onFill(handler: (event: FillEvent) => void): () => void {
    return this.delegate.onFill(handler)
  }

  /** Phase 4.5 — 在 beforeUnderlyingRow 位置前插入 count 空白行，返回新行 id。 */
  insertRows(beforeUnderlyingRow: number, count: number): readonly number[] {
    const newIds = this.delegate.insertRows(beforeUnderlyingRow, count)
    this.options.onRowsInserted?.({ at: beforeUnderlyingRow, count, newIds })
    return newIds
  }

  /** Phase 4.5 — 删除给定 underlying row id 集合（升序、去重）。 */
  deleteRows(underlyingRowIds: readonly number[]): void {
    this.delegate.deleteRows(underlyingRowIds)
    this.options.onRowsDeleted?.({ removed: underlyingRowIds })
  }

  /** Phase 4.5 — 隐藏给定 underlying row id 集合，触发视图刷新。 */
  hideRows(underlyingRowIds: readonly number[]): void {
    this.delegate.hideRows(underlyingRowIds)
    this.options.onHideChange?.({ hidden: this.delegate.getHiddenRows() })
  }

  /** Phase 4.5 — 取消隐藏指定底层行 ID，触发视图刷新。 */
  unhideRows(underlyingRowIds: readonly number[]): void {
    this.delegate.unhideRows(underlyingRowIds)
    this.options.onHideChange?.({ hidden: this.delegate.getHiddenRows() })
  }

  /** Phase 4.5 — 返回当前隐藏行的 underlying row id 升序数组。 */
  getHiddenRows(): readonly number[] {
    return this.delegate.getHiddenRows()
  }

  /** Phase 4.5 — 批量将多行高度设置为同一值 h。 */
  setRowHeights(rowIds: readonly number[], h: number): void {
    this.delegate.setRowHeights(rowIds, h)
  }

  /** Phase 4.5 — 程序化设置选区（不入 undo 栈）。 */
  setSelection(selection: GridSelection): void {
    this.delegate.setSelection(selection)
  }

  /** Phase 5-A — 返回当前选区，供外部工具栏按任意选区操作。 */
  getSelection(): GridSelection {
    return this.delegate.getSelection()
  }

  /** Phase 4.5 — 返回行头右键菜单项列表（含条件 unhide 项）。 */
  getRowHeaderContextMenuItems(ctx: { targetRowIndex: number }): readonly ContextMenuItem[] {
    return this.delegate.getRowHeaderContextMenuItems(ctx)
  }

  /** Phase 4.5 — 执行行头右键菜单动作。 */
  invokeRowHeaderContextMenuAction(id: string, ctx: { targetRowIndex: number }): void {
    this.delegate.invokeRowHeaderContextMenuAction(id, ctx)
  }

  /** Phase 4.6 — 在 schema field index 前插入 count 个列字段。 */
  insertCols(beforeFieldIndex: number, count: number): readonly Field[] {
    const newFields = this.delegate.insertCols(beforeFieldIndex, count)
    this.options.onColumnsInserted?.({ at: beforeFieldIndex, count, newFields })
    return newFields
  }

  /** Phase 4.6 — 按 fieldId 删除列字段。 */
  deleteCols(fieldIds: readonly string[]): void {
    this.delegate.deleteCols(fieldIds)
    this.options.onColumnsDeleted?.({
      removed: fieldIds.map((fieldId, index) => ({ index, fieldId })),
    })
  }

  /** Phase 4.6 — 隐藏给定 fieldId 集合。 */
  hideCols(fieldIds: readonly string[]): void {
    this.delegate.hideCols(fieldIds)
    this.options.onHideColsChange?.({ hidden: this.delegate.getHiddenCols() })
  }

  /** Phase 4.6 — 取消隐藏给定 fieldId 集合。 */
  unhideCols(fieldIds: readonly string[]): void {
    this.delegate.unhideCols(fieldIds)
    this.options.onHideColsChange?.({ hidden: this.delegate.getHiddenCols() })
  }

  /** Phase 4.6 — 返回当前隐藏列 fieldId。 */
  getHiddenCols(): readonly string[] {
    return this.delegate.getHiddenCols()
  }

  /** Phase 4.6 — 批量将多列宽度设置为同一值。 */
  setColumnWidths(fieldIds: readonly string[], widthPx: number): void {
    this.delegate.setColumnWidths(fieldIds, widthPx)
  }

  /** Phase 4.7 — 按 fieldId 移动连续列组；`beforeFieldId=null` 表示移动到末尾。 */
  moveCols(fieldIds: readonly string[], beforeFieldId: string | null): boolean {
    const changed = this.delegate.moveCols(fieldIds, beforeFieldId)
    if (changed) this.options.onColumnsMoved?.({ fieldIds, beforeFieldId })
    return changed
  }

  /** Phase 4.6 — 返回列头右键菜单项列表（含结构项）。 */
  getColumnHeaderContextMenuItems(ctx: { targetColIndex: number }): readonly ContextMenuItem[] {
    return this.delegate.getColumnHeaderContextMenuItems(ctx)
  }

  /** Phase 4.6 — 执行列头右键菜单动作。 */
  invokeColumnHeaderContextMenuAction(id: string, ctx: { targetColIndex: number }): void {
    this.delegate.invokeColumnHeaderContextMenuAction(id, ctx)
  }

  /** Phase 5-A — 为 view `range` 设置填充色；`color=null` 清除；变化时返回 true 并重绘。 */
  setFillColor(range: CellRange, color: string | null): boolean {
    return this.delegate.setFillColor(range, color)
  }

  /** Phase 5-A — 为 view `range` 设置基础边框；`preset='clear'` 需 `border=null`；变化时返回 true 并重绘。 */
  setBorders(range: CellRange, preset: BorderPreset, border: BorderStyle | null): boolean {
    return this.delegate.setBorders(range, preset, border)
  }

  /** 为 view `range` 设置文本显示模式（overflow/wrap/clip）；变化时返回 true 并重绘。 */
  setTextWrap(range: CellRange, mode: TextWrapMode): boolean {
    return this.delegate.setTextWrap(range, mode)
  }

  /** Phase 5-A — 合并 view `range`；成功返回 true 并重绘。 */
  mergeCells(range: CellRange): boolean {
    return this.delegate.mergeCells(range)
  }

  /** Phase 5-A — 取消 view `range` 触及的合并区域；移除任意区域返回 true 并重绘。 */
  unmergeCells(range: CellRange): boolean {
    return this.delegate.unmergeCells(range)
  }

  getSortLayer(): SortLayer {
    return this.delegate.getSortLayer()
  }

  getFilterLayer(): FilterLayer {
    return this.delegate.getFilterLayer()
  }

  getViewPipeline(): ViewPipeline {
    return this.delegate.getViewPipeline()
  }

  on<K extends keyof GridPublicEventMap>(
    eventName: K,
    handler: (event: GridPublicEventMap[K]) => void,
  ): () => void {
    return this.delegate.on(eventName, handler)
  }

  destroy(): void {
    this.delegate.destroy()
  }

  /** @internal ResizeObserver 路径 — `Grid.test.ts` 使用 */
  _onContainerResize(): void {
    this.delegate._onContainerResize()
  }
}
