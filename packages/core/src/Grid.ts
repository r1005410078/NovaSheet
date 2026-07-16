import type {
  BorderPreset,
  BorderStyle,
  TextWrapMode,
  ValueFormat,
  CellRange,
  ContextMenuItem,
  ContextMenuAction,
  ContextMenuContext,
  ContextMenuExtensionConfig,
  ContextMenuRenderer,
  ColumnGroupChild,
  DataSource,
  Field,
  FrozenConfig,
  GridSelection,
  PasteSkippedCell,
  Theme,
  CellEditorRegistry,
  CellTypeOverride,
} from './index'
import type { ValidationRule, ValidationState } from './kernel/protocol/ValidationTypes'
import type { GridEngineOptions } from './engine/GridEngine'
import type { CellAttachmentCodec } from './kernel/protocol/AttachmentTypes'
import type { ExcelWorkspacePolicy } from './features/excel-workspace'
import type { FilterLayer } from './features/view/FilterLayer'
import type { SortLayer } from './features/view/SortLayer'
import type { ViewPipeline } from './features/view/ViewPipeline'
import type { GridInteractions } from './dom/runtime/GridInteractions'
import { GridControllerImpl } from './dom/runtime/GridControllerImpl'
import type {
  AutofitRowsOptions,
  AutofitRowsResult,
  FillEvent,
  GridPublicEventMap,
  GridController,
  RedoEvent,
  UndoEvent,
} from './dom/runtime/GridController'
import type { RenderBackendFactory } from './ports/RenderBackend'

export interface GridOptions extends GridEngineOptions {
  /** 渲染后端工厂——由调用方注入（如 `@novasheet/canvas2d` 的 `canvas2dBackend`），反转 core→backend 依赖。 */
  backend: RenderBackendFactory
  /** Phase 4.0 — 右键菜单项被选中时触发；4.1 之后不传走默认引擎（grid.copy/cut/paste）。自定义 id 以 string 到达回调。 */
  onContextMenuAction?: (action: ContextMenuAction | string, ctx: ContextMenuContext) => void
  /** DOM override renderer：替换内置 DomContextMenuLayer，由 consumer 完全接管菜单渲染。 */
  contextMenuRenderer?: ContextMenuRenderer
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
  /** 选区变化时触发（含点击、键盘导航、程序化 setSelection）。 */
  onSelectionChange?: (selection: GridSelection) => void
  /** 自定义 DOM 单元格编辑器注册表；key 为 `Field.type`。 */
  cellEditors?: CellEditorRegistry
  /** 扩展附件 codec 注册表；namespace 唯一，core 不识别 T 语义。 */
  cellAttachments?: readonly CellAttachmentCodec<unknown>[]
  /** Excel workspace auto-grow/shrink；默认关闭。 */
  excelWorkspace?: boolean | { readonly policy?: Partial<ExcelWorkspacePolicy> }
  /** 上下文菜单配置式扩展（append / prepend / replace + transform）。 */
  readonly contextMenus?: ContextMenuExtensionConfig
  /**
   * 交互能力开关：右键菜单、行列改尺寸、行列换位。
   * 字段缺省为启用；监控只读表可传 `{ contextMenu: false, resize: false, reorder: false }`。
   */
  readonly interactions?: GridInteractions
}

/** 启用 Excel 风格列标（A/B/…）与左侧行号。 */
export function withExcelHeaders<T extends Omit<GridOptions, 'backend'>>(options: T): T {
  return { ...options, excelHeaders: true }
}

/**
 * 对外 Grid 门面（spec §7）。
 *
 * 渲染后端经 `options.backend` 注入（如 `@novasheet/canvas2d` 的 `canvas2dBackend`），
 * core 不依赖任何具体后端。公共 API 方法全部转发给注入后端装配出的 `GridController` 实现。
 */
export class Grid {
  private readonly delegate: GridController
  private readonly options: GridOptions

  constructor(container: HTMLElement, options: GridOptions) {
    this.options = options
    const engineOptions: GridEngineOptions = {
      data: options.data, // 数据源：由 engine 持有并驱动 frame。
      theme: options.theme, // 主题 token：engine 负责下发给 renderer。
      frozen: options.frozen, // 冻结配置：engine 计算冻结区域与 viewport。
      defaultRowHeight: options.defaultRowHeight, // 默认行高：初始化 row axis。
      excelHeaders: options.excelHeaders, // 表头模式：A/B/... 列标 + 1-based 行号。
      rowHeaderField: options.rowHeaderField, // Excel 行头标签字段选择器；renderer 从 frame.data 读取。
      rowHeaderCornerLabel: options.rowHeaderCornerLabel, // 行头与列头交叉角格文案。
      formatters: options.formatters, // Phase 5-C — 自定义 formatter 注册表。
      locale: options.locale, // Phase 5-C — formatter locale。
      cellTypes: options.cellTypes, // 单元格类型语义注册表：驱动 backend-neutral 编辑语义。
      fillCellTypes: options.fillCellTypes, // Fill handle 是否携带源格 resolved cell type。
      cellAttachments: options.cellAttachments, // 扩展附件 codec 注册表。
      validators: options.validators, // 自定义 validator 注册表。
      validationBatchSize: options.validationBatchSize, // 批量校验每 tick 处理格数上限。
      validationMaxConcurrent: options.validationMaxConcurrent, // 异步 validator 最大并发数。
    }

    this.delegate = new GridControllerImpl(
      container,
      engineOptions,
      {
        onContextMenuAction: options.onContextMenuAction,
        onCopy: options.onCopy,
        onCut: options.onCut,
        onPaste: options.onPaste,
        onPasteSkipped: options.onPasteSkipped,
        onUndo: options.onUndo,
        onRedo: options.onRedo,
        onFill: options.onFill,
        onSelectionChange: options.onSelectionChange,
        cellEditors: options.cellEditors,
        excelWorkspace: options.excelWorkspace,
        contextMenus: options.contextMenus,
        contextMenuRenderer: options.contextMenuRenderer,
        interactions: options.interactions,
      },
      options.backend,
    )
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

  /** 滚动到指定组的首个可见叶列，按 align 对齐横向视口（无条件对齐，与 scrollToRow/scrollToCell 同族）；组不存在或全隐藏则 no-op。 */
  scrollToGroup(groupId: string, align?: 'start' | 'center' | 'end'): void {
    this.delegate.scrollToGroup(groupId, align)
  }

  /** 程序化打开单元格编辑器；custom editor 的 trigger 为 `api`。 */
  openCellEditor(rowIndex: number, fieldId: string): boolean {
    return this.delegate.openCellEditor(rowIndex, fieldId)
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

  /** 返回当前列组树（文档序，深拷贝，独立于内部 store）。无组返回空数组。 */
  getColumnGroups(): readonly ColumnGroupChild[] {
    return this.delegate.getColumnGroups()
  }

  /** 组可见叶列整列选中；组不存在或组内叶列全隐藏时返回 false，不改动选区。 */
  selectGroup(groupId: string): boolean {
    return this.delegate.selectGroup(groupId)
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

  /** 设置 view `range` 值格式（Phase 5-C）；变化时返回 true 并重绘。 */
  setValueFormat(range: CellRange, valueFormat: ValueFormat): boolean {
    return this.delegate.setValueFormat(range, valueFormat)
  }

  /** 为 view `range` 设置文本显示模式（overflow/wrap/clip）；变化时返回 true 并重绘。 */
  setTextWrap(range: CellRange, mode: TextWrapMode): boolean {
    return this.delegate.setTextWrap(range, mode)
  }

  /** 给 raw cell 写扩展私有附件（namespace 由 cellAttachments 注册）；data=undefined 清除；变化时返回 true。 */
  setCellAttachment(namespace: string, rawRow: number, rawCol: number, data: unknown): boolean {
    return this.delegate.setCellAttachment(namespace, rawRow, rawCol, data)
  }

  /** 为 view `range` 设置单元格类型覆盖；变化时返回 true 并重绘。 */
  setCellType(range: CellRange, type: CellTypeOverride): boolean {
    return this.delegate.setCellType(range, type)
  }

  /** 清除 view `range` 的单元格类型覆盖；变化时返回 true 并重绘。 */
  clearCellType(range: CellRange): boolean {
    return this.delegate.clearCellType(range)
  }

  /** 读取 view 坐标的 resolved cell type；越界保守返回 `text`。 */
  getCellType(viewRow: number, viewCol: number): CellTypeOverride {
    return this.delegate.getCellType(viewRow, viewCol)
  }

  /** 为 view range 设置验证规则；range rule 优先于列默认规则（Field.options.validation）。 */
  setValidation(range: CellRange, rule: ValidationRule): void {
    this.delegate.setValidation(range, rule)
  }

  /** 清除 view range 的区间验证规则（不影响 Field.options.validation 列默认）。 */
  clearValidation(range: CellRange): void {
    this.delegate.clearValidation(range)
  }

  /**
   * 手动触发全量重校验。立即返回；校验异步执行，结果写入 store 后自动重绘。
   */
  validateAll(): void {
    this.delegate.validateAll()
  }

  /** 查询单格当前校验状态（view 坐标）；null = ok。 */
  getValidationState(rowIndex: number, colIndex: number): ValidationState | null {
    const rawRow = this.delegate.viewRowToRaw(rowIndex)
    const rawCol = this.delegate.viewColToRaw(colIndex)
    return this.delegate.getValidationState(rawRow, rawCol)
  }

  /** 读 raw cell 的扩展附件；无则 undefined。 */
  getCellAttachment(namespace: string, rawRow: number, rawCol: number): unknown {
    return this.delegate.getCellAttachment(namespace, rawRow, rawCol)
  }

  /** 读 raw 坐标单元格文本（String(value)，空为 ''）。cell-kit selection-bold adapter 用。 */
  getCellText(rawRow: number, rawCol: number): string {
    return this.delegate.getCellText(rawRow, rawCol)
  }

  /** Phase 5-A — 合并 view `range`；成功返回 true 并重绘。 */
  mergeCells(range: CellRange): boolean {
    return this.delegate.mergeCells(range)
  }

  /** Phase 5-A — 取消 view `range` 触及的合并区域；移除任意区域返回 true 并重绘。 */
  unmergeCells(range: CellRange): boolean {
    return this.delegate.unmergeCells(range)
  }

  /** 解析 view 坐标的单元格格式；无格式返回 undefined。 */
  getViewCellFormat(viewRow: number, viewCol: number) {
    return this.delegate.getViewCellFormat(viewRow, viewCol)
  }

  /** 返回覆盖 view 坐标单元格的合并区域；无则返回 null。 */
  getViewMergeRegion(viewRow: number, viewCol: number) {
    return this.delegate.getViewMergeRegion(viewRow, viewCol)
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
