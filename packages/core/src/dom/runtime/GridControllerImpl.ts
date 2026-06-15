/**
 * GridControllerImpl——平台无关的 `GridController` 通用装配层。
 *
 * 把 `DefaultGridEngine` + `DomGridHost` + `GridRuntime` + 全部 DOM 交互层
 * 装配成一个 `GridController`，对外暴露公共 API。渲染表面（canvas / HighDPI /
 * renderer / measurer）由注入的 `RenderBackendFactory` 创建——本层不依赖任何
 * 具体渲染后端（canvas2d/webgl），从而反转 core→backend 的依赖方向。
 *
 * 不变量：
 *   - 单实例只有一个 host、一个 runtime、一个后端 handle
 *   - 绘制 surface 由后端 handle 拥有（renderer 不自己 mount canvas，方便切后端）
 *   - `setData` 时换 renderer（轴 / viewport 重建后旧 renderer 引用已失效）
 *
 * Host 回调在 `attach()` 之后才触发，故可在 `this.runtime` 赋值后安全闭包引用。
 */

import { DefaultGridEngine } from '../../engine/DefaultGridEngine'
import { FilterLayer } from '../../features/view/FilterLayer'
import { SortLayer } from '../../features/view/SortLayer'
import { ViewPipeline } from '../../features/view/ViewPipeline'
import { FrameScheduler } from '../../kernel/util/raf'
import type { BorderPreset, BorderStyle, TextWrapMode, ValueFormat } from '../../kernel/protocol/FormatTypes'
import type { CellRange, GridSelection } from '../../kernel/coords/SelectionTypes'
import type { CellTypeOverride } from '../../features/cell-types'
import type {
  ContextMenuItem,
  ContextMenuAction,
  ContextMenuContext,
} from '../../features/context-menu/ContextMenuModel'
import type { DataSource } from '../../kernel/data/DataSource'
import type { Field } from '../../kernel/data/Schema'
import type { FilterSpec } from '../../features/view/FilterLayer'
import type { FrozenConfig } from '../../kernel/geometry/FrozenRegions'
import type { GridEngineOptions } from '../../engine/GridEngine'
import type { ExcelWorkspacePolicy } from '../../features/excel-workspace'
import type { PasteSkippedCell } from '../../features/clipboard/types'
import type { SortSpec } from '../../features/view/SortLayer'
import type { Theme } from '../../kernel/theme/Theme'
import type { TextMeasurer } from '../../kernel/measure/TextMeasurer'
import type { ViewLayerChange } from '../../features/view/ViewLayer'
import { DomCellEditor } from '../interaction/DomCellEditor'
import { DomContextMenuLayer } from '../interaction/DomContextMenuLayer'
import { DomFillHandleLayer } from '../interaction/DomFillHandleLayer'
import { DomHandleLayer } from '../interaction/DomHandleLayer'
import { DomGridHost } from '../host/DomGridHost'
import { GridRuntime } from './GridRuntime'
import { DomClipboardAdapter } from '../clipboard/DomClipboardAdapter'
import { HideToggleHandle } from '../interaction/handle/HideToggleHandle'
import { HideColToggleHandle } from '../interaction/handle/HideColToggleHandle'
import { FilterPopover } from '../overlay/FilterPopover'
import { RowHeightPopover } from '../overlay/RowHeightPopover'
import { ColumnWidthPopover } from '../overlay/ColumnWidthPopover'
import { ColumnReorderOverlay } from '../overlay/ColumnReorderOverlay'
import { RowReorderOverlay } from '../overlay/RowReorderOverlay'
import { SelectionOverlay } from '../overlay/SelectionOverlay'
import { ValidationTooltip } from '../overlay/ValidationTooltip'
import type {
  AutofitRowsOptions,
  AutofitRowsResult,
  FilterChangeEvent,
  GridController,
  GridPublicEventMap,
  SortChangeEvent,
  ViewChangeEvent,
  FillEvent,
  RedoEvent,
  UndoEvent,
} from './GridController'
import type { RenderBackend, RenderBackendFactory, RenderBackendHandle } from '../../ports/RenderBackend'
import type { CellEditorRegistry } from '../interaction/CellEditorContract'

/**
 * 通用 Grid 装配（`Grid` facade 转发到此）。
 *
 * 职责划分：
 *   - 本类：装配 engine / host / runtime / DOM 层，并经注入的 backend 工厂拿到 renderer
 *   - 注入的 `RenderBackendFactory`：创建 canvas / HighDPI / renderer / measurer
 *   - `DomGridHost`：scrollHost、spacer、ResizeObserver、DPR 监听
 *   - `GridRuntime`：滚动映射、spacer 尺寸、RAF、`setData` 换 renderer
 *   - `DefaultGridEngine`（core）：数据、轴、viewport 逻辑状态
 */
export class GridControllerImpl implements GridController {
  /** Grid 挂载容器；所有 DOM 层都以它为根。 */
  private container: HTMLElement
  /** 平台无关状态引擎；runtime 的所有 mutation 都落到这里。 */
  private engine: DefaultGridEngine
  /** 注入后端返回的句柄：renderer 重建 / surface 尺寸 / measurer / 销毁。 */
  private handle: RenderBackendHandle
  /** 当前 renderer；`setData` 后会随 engine/frame 关系重建。 */
  private renderer: RenderBackend
  /** DOM 宿主层：scrollHost、spacer、尺寸与输入事件入口。 */
  private host: DomGridHost
  /** 行列 resize 的 DOM hit-zone 层。 */
  private handleLayer: DomHandleLayer
  /** 填充柄 DOM hit-zone 层。 */
  private fillHandleLayer: DomFillHandleLayer
  /** 隐藏行的展开入口。 */
  private hideToggleHandle: HideToggleHandle
  /** 隐藏列的展开入口。 */
  private hideColToggleHandle: HideColToggleHandle
  /** 单元格编辑器 DOM 层。 */
  private cellEditor: DomCellEditor
  /** 右键菜单层；constructor 后段 attach，故延迟赋值。 */
  private contextMenuLayer!: DomContextMenuLayer
  /** 筛选弹层；由 runtime 打开并回写筛选条件。 */
  private filterPopover!: FilterPopover
  /** 行高输入弹层；提交后批量写入 pending rows。 */
  private rowHeightPopover!: RowHeightPopover
  /** 列宽输入弹层；提交后批量写入 pending columns。 */
  private columnWidthPopover!: ColumnWidthPopover
  /** 列拖拽重排时的 DOM 预览层。 */
  private columnReorderOverlay: ColumnReorderOverlay
  /** 行拖拽重排时的 DOM 预览层。 */
  private rowReorderOverlay: RowReorderOverlay
  /** 选区高亮与拖拽辅助 DOM 层。 */
  private selectionOverlay: SelectionOverlay
  /** Web 剪贴板适配器；runtime 只依赖抽象能力。 */
  private clipboardAdapter = new DomClipboardAdapter()
  /** web 交互编排器；attach 前由本类完成全部依赖注入。 */
  private runtime!: GridRuntime
  /** 单 Grid 共享 scheduler，host / renderer / runtime 的 RAF 统一合并。 */
  private scheduler = new FrameScheduler()
  /** 用户传入的原始数据源；sort/filter pipeline 会基于它重建 view data。 */
  private rawSource: DataSource
  /** 当前筛选层状态。 */
  private filterLayer = new FilterLayer()
  /** 当前排序层状态。 */
  private sortLayer = new SortLayer()
  /** rawSource + sort/filter 组合后的视图数据管线。 */
  private pipeline: ViewPipeline
  /** pipeline 订阅释放函数，`setData` / `destroy` 时调用。 */
  private unsubscribePipeline: () => void = () => {}
  /** 批量重置 sort/filter 时避免向外发出中间态事件。 */
  private suppressPipelineEvents = false
  /** view data 变更监听器集合。 */
  private viewChangeListeners = new Set<(event: ViewChangeEvent) => void>()
  /** 排序变更监听器集合。 */
  private sortChangeListeners = new Set<(event: SortChangeEvent) => void>()
  /** 筛选变更监听器集合。 */
  private filterChangeListeners = new Set<(event: FilterChangeEvent) => void>()
  /** 共享 measurer：由后端工厂创建并交给本类；runtime.autofitRows 与绘制复用同一实例。 */
  private measurer: TextMeasurer

  constructor(
    container: HTMLElement,
    options: GridEngineOptions,
    gridOptions:
      | {
          onContextMenuAction?: (action: ContextMenuAction, ctx: ContextMenuContext) => void
          onCopy?: (range: CellRange) => void
          onCut?: (range: CellRange) => void
          onPaste?: (target: CellRange) => void
          onPasteSkipped?: (cells: readonly PasteSkippedCell[]) => void
          onUndo?: (event: UndoEvent) => void
          onRedo?: (event: RedoEvent) => void
          onFill?: (event: FillEvent) => void
          onSelectionChange?: (selection: GridSelection) => void
          cellEditors?: CellEditorRegistry
          excelWorkspace?: boolean | { readonly policy?: Partial<ExcelWorkspacePolicy> }
        }
      | undefined,
    backend: RenderBackendFactory,
  ) {
    this.container = container
    this.rawSource = options.data
    this.pipeline = this.createPipeline(this.rawSource)
    this.subscribePipeline()
    this.engine = new DefaultGridEngine({ ...options, data: this.pipeline.getComposed() })

    const handle = backend({
      container: this.container,
      engine: this.engine,
      scheduler: this.scheduler,
    })
    this.handle = handle
    this.renderer = handle.renderer
    this.measurer = handle.measurer

    this.handleLayer = new DomHandleLayer(this.container, {
      onResizePointerDown: (handle, pointerId, x, y) =>
        this.runtime.handleResizePointerDown(handle, pointerId, x, y),
      onResizePointerMove: (pointerId, x, y) =>
        this.runtime.handleResizePointerMove(pointerId, x, y),
      onResizePointerUp: (pointerId) => this.runtime.handleResizePointerUp(pointerId),
      onResizeKeyboard: (handle, delta) => this.runtime.handleResizeKeyboard(handle, delta),
    })
    this.handleLayer.attach()

    this.fillHandleLayer = new DomFillHandleLayer(this.container, {
      onFillPointerDown: (pointerId, x, y) => this.runtime.handleFillPointerDown(pointerId, x, y),
      onFillPointerMove: (pointerId, x, y) => this.runtime.handleFillPointerMove(pointerId, x, y),
      onFillPointerUp: (pointerId) => this.runtime.handleFillPointerUp(pointerId),
    })
    this.fillHandleLayer.attach()

    this.hideToggleHandle = new HideToggleHandle(this.container, {
      onUnhide: (ids) => this.runtime.unhideRows(ids),
    })
    this.hideColToggleHandle = new HideColToggleHandle(this.container, {
      onUnhide: (ids) => this.runtime.unhideCols(ids),
    })
    this.selectionOverlay = new SelectionOverlay(this.container)
    this.selectionOverlay.applyTheme(this.engine.getTheme())
    this.columnReorderOverlay = new ColumnReorderOverlay(this.container)
    this.rowReorderOverlay = new RowReorderOverlay(this.container)
    const validationTooltip = new ValidationTooltip(this.container)

    this.host = new DomGridHost({
      container: this.container,
      scheduler: this.scheduler,
      onScroll: (scrollTop, scrollLeft) => this.runtime.handleHostScroll(scrollTop, scrollLeft),
      onResize: (w, h, dpr) => this.runtime.handleHostResize(w, h, dpr),
      onDprChange: (dpr) => this.runtime.handleHostDprChange(dpr),
      onPointerDown: (event) => this.runtime.handleHostPointerDown(event),
      onPointerMove: (event) => this.runtime.handleHostPointerMove(event),
      onPointerUp: () => this.runtime.handleHostPointerUp(),
      onKeyDown: (event) => this.runtime.handleHostKeyDown(event),
      onDoubleClick: (event) => this.runtime.handleHostDoubleClick(event),
      onContextMenu: (event) => this.runtime.handleHostContextMenu(event),
    })

    this.runtime = new GridRuntime({
      container: this.container,
      engine: this.engine,
      host: this.host,
      renderer: this.renderer,
      cellTypes: options.cellTypes,
      cellEditors: gridOptions?.cellEditors,
      scheduler: this.scheduler,
      measurer: this.measurer,
      handleLayer: this.handleLayer,
      fillLayer: this.fillHandleLayer,
      hideToggleHandle: this.hideToggleHandle,
      hideColToggleHandle: this.hideColToggleHandle,
      columnReorderOverlay: this.columnReorderOverlay,
      rowReorderOverlay: this.rowReorderOverlay,
      selectionOverlay: this.selectionOverlay,
      validationTooltip,
      viewPipeline: this.pipeline,
      sortLayer: this.sortLayer,
      filterLayer: this.filterLayer,
      excelWorkspace: gridOptions?.excelWorkspace,
      onSurfaceResize: (w, h) => this.handle.resizeSurface(w, h),
    })

    this.cellEditor = new DomCellEditor(this.container, {
      onDraftChange: (draft) => this.runtime.handleCellEditDraft(draft),
      onCommitEnter: () => this.runtime.handleCellEditCommitEnter(),
      onCommitBlur: () => this.runtime.handleCellEditCommitBlur(),
      onCancel: () => this.runtime.handleCellEditCancel(),
    })
    this.cellEditor.attach()
    this.runtime.setCellEditor(this.cellEditor)

    this.contextMenuLayer = new DomContextMenuLayer(this.container, {
      onSelect: (id) => this.runtime.handleContextMenuSelected(id),
      onClose: () => this.host.focusScrollHost(),
    })
    this.contextMenuLayer.attach()
    this.runtime.setContextMenuLayer(this.contextMenuLayer)
    this.filterPopover = new FilterPopover(this.container, {
      onApply: (op) => this.runtime.handleFilterPopoverApply(op),
      onCancel: () => this.host.focusScrollHost(),
    })
    this.filterPopover.attach()
    this.runtime.setFilterPopover(this.filterPopover)
    this.rowHeightPopover = new RowHeightPopover({
      onSubmit: (px) => {
        const ids = this.runtime.getPendingRowHeightIds()
        if (ids.length > 0) this.runtime.setRowHeights(ids, px)
      },
    })
    this.runtime.setRowHeightPopover(this.rowHeightPopover)
    this.columnWidthPopover = new ColumnWidthPopover({
      onSubmit: (px) => {
        const ids = this.runtime.getPendingColumnWidthFieldIds()
        if (ids.length > 0) this.runtime.setColumnWidths(ids, px)
      },
    })
    this.runtime.setColumnWidthPopover(this.columnWidthPopover)
    this.runtime.setClipboardAdapter(this.clipboardAdapter)
    if (gridOptions?.onContextMenuAction) {
      this.runtime.setOnContextMenuAction(gridOptions.onContextMenuAction)
    }
    if (gridOptions?.onCopy) this.runtime.setOnCopy(gridOptions.onCopy)
    if (gridOptions?.onCut) this.runtime.setOnCut(gridOptions.onCut)
    if (gridOptions?.onPaste) this.runtime.setOnPaste(gridOptions.onPaste)
    if (gridOptions?.onPasteSkipped) this.runtime.setOnPasteSkipped(gridOptions.onPasteSkipped)
    if (gridOptions?.onUndo) this.runtime.setOnUndo(gridOptions.onUndo)
    if (gridOptions?.onRedo) this.runtime.setOnRedo(gridOptions.onRedo)
    if (gridOptions?.onFill) this.runtime.setOnFill(gridOptions.onFill)
    if (gridOptions?.onSelectionChange) this.runtime.setOnSelectionChange(gridOptions.onSelectionChange)

    this.runtime.attach()
  }

  setData(data: DataSource): void {
    this.suppressPipelineEvents = true
    this.sortLayer.setSpec(null)
    this.filterLayer.setSpec(null)
    this.suppressPipelineEvents = false

    this.rawSource = data
    this.unsubscribePipeline()
    this.pipeline.dispose()
    this.pipeline = this.createPipeline(this.rawSource)
    this.subscribePipeline()
    this.runtime.setViewContext({
      viewPipeline: this.pipeline,
      sortLayer: this.sortLayer,
      filterLayer: this.filterLayer,
    })
    this.renderer = this.runtime.setData(this.pipeline.getComposed(), () =>
      this.handle.createRenderer(this.engine),
    )
  }

  setTheme(theme: Theme): void {
    this.runtime.setTheme(theme, (renderer) => {
      renderer.setTheme?.(theme)
    })
    // 字体可能随主题变；清空 measurer 缓存避免过期宽度（后端 measurer 若实现 clearCache 才调用）。
    this.measurer.clearCache?.()
  }

  setRowHeight(rowIndex: number, height: number): void {
    this.runtime.setRowHeight(rowIndex, height)
  }

  setColumnWidth(fieldId: string, width: number): void {
    this.runtime.setColumnWidth(fieldId, width)
  }

  setFrozen(config: Partial<FrozenConfig>): void {
    this.runtime.setFrozen(config)
  }

  refresh(): void {
    this.runtime.refresh()
  }

  scrollToRow(rowIndex: number, align?: 'start' | 'center' | 'end'): void {
    this.runtime.scrollToRow(rowIndex, align)
  }

  scrollToCell(rowIndex: number, fieldId: string): void {
    this.runtime.scrollToCell(rowIndex, fieldId)
  }

  openCellEditor(rowIndex: number, fieldId: string): boolean {
    return this.runtime.openCellEditor(rowIndex, fieldId)
  }

  autofitRows(options: AutofitRowsOptions = {}): AutofitRowsResult {
    return this.runtime.autofitRows(options)
  }

  openContextMenuAt(rowIndex: number, fieldId: string): void {
    this.runtime.openContextMenuAt(rowIndex, fieldId)
  }

  closeContextMenu(): void {
    this.runtime.closeContextMenu()
  }

  copy(): Promise<boolean> {
    return this.runtime.handleClipboardCopy()
  }

  cut(): Promise<boolean> {
    return this.runtime.handleClipboardCut()
  }

  paste(): Promise<boolean> {
    return this.runtime.handleClipboardPaste()
  }

  destroy(): void {
    this.unsubscribePipeline()
    this.pipeline.dispose()
    this.contextMenuLayer.destroy()
    this.filterPopover.destroy()
    this.rowHeightPopover.destroy()
    this.columnWidthPopover.destroy()
    this.columnReorderOverlay.destroy()
    this.rowReorderOverlay.destroy()
    this.selectionOverlay.destroy()
    this.runtime.destroy()
    this.hideToggleHandle.destroy()
    this.hideColToggleHandle.destroy()
    this.fillHandleLayer.destroy()
    this.handleLayer.destroy()
    this.cellEditor.destroy()
    this.handle.destroy()
  }

  _onContainerResize(): void {
    this.runtime.onContainerResize()
  }

  undo(): void {
    this.runtime.undo()
  }

  redo(): void {
    this.runtime.redo()
  }

  canUndo(): boolean {
    return this.runtime.canUndo()
  }

  canRedo(): boolean {
    return this.runtime.canRedo()
  }

  setOnUndo(cb: (event: UndoEvent) => void): void {
    this.runtime.setOnUndo(cb)
  }

  setOnRedo(cb: (event: RedoEvent) => void): void {
    this.runtime.setOnRedo(cb)
  }

  onFill(handler: (event: FillEvent) => void): () => void {
    this.runtime.setOnFill(handler)
    return () => this.runtime.setOnFill(() => {})
  }

  unhideRows(underlyingRowIds: readonly number[]): void {
    this.runtime.unhideRows(underlyingRowIds)
  }

  getHiddenRows(): readonly number[] {
    return this.runtime.getHiddenRows()
  }

  insertRows(beforeUnderlyingRow: number, count: number): readonly number[] {
    return this.runtime.insertRows(beforeUnderlyingRow, count)
  }

  deleteRows(underlyingRowIds: readonly number[]): void {
    this.runtime.deleteRows(underlyingRowIds)
  }

  hideRows(underlyingRowIds: readonly number[]): void {
    this.runtime.hideRows(underlyingRowIds)
  }

  setRowHeights(rowIds: readonly number[], h: number): void {
    this.runtime.setRowHeights(rowIds, h)
  }

  setSelection(selection: GridSelection): void {
    this.runtime.setSelection(selection)
  }

  getRowHeaderContextMenuItems(ctx: { targetRowIndex: number }): readonly ContextMenuItem[] {
    return this.runtime.getRowHeaderContextMenuItems(ctx)
  }

  invokeRowHeaderContextMenuAction(id: string, ctx: { targetRowIndex: number }): void {
    this.runtime.invokeRowHeaderContextMenuAction(id, ctx)
  }

  insertCols(beforeFieldIndex: number, count: number): readonly Field[] {
    return this.runtime.insertCols(beforeFieldIndex, count)
  }

  deleteCols(fieldIds: readonly string[]): void {
    this.runtime.deleteCols(fieldIds)
  }

  hideCols(fieldIds: readonly string[]): void {
    this.runtime.hideCols(fieldIds)
  }

  unhideCols(fieldIds: readonly string[]): void {
    this.runtime.unhideCols(fieldIds)
  }

  setColumnWidths(fieldIds: readonly string[], widthPx: number): void {
    this.runtime.setColumnWidths(fieldIds, widthPx)
  }

  getSelection(): GridSelection {
    return this.runtime.getSelection()
  }

  getHiddenCols(): readonly string[] {
    return this.runtime.getHiddenCols()
  }

  moveCols(fieldIds: readonly string[], beforeFieldId: string | null): boolean {
    return this.runtime.moveCols(fieldIds, beforeFieldId)
  }

  getColumnHeaderContextMenuItems(ctx: { targetColIndex: number }): readonly ContextMenuItem[] {
    return this.runtime.getColumnHeaderContextMenuItems(ctx)
  }

  invokeColumnHeaderContextMenuAction(id: string, ctx: { targetColIndex: number }): void {
    this.runtime.invokeColumnHeaderContextMenuAction(id, ctx)
  }

  setFillColor(range: CellRange, color: string | null): boolean {
    return this.runtime.setFillColor(range, color)
  }

  setBorders(range: CellRange, preset: BorderPreset, border: BorderStyle | null): boolean {
    return this.runtime.setBorders(range, preset, border)
  }

  setValueFormat(range: CellRange, valueFormat: ValueFormat): boolean {
    return this.runtime.setValueFormat(range, valueFormat)
  }

  setCellType(range: CellRange, type: CellTypeOverride): boolean {
    return this.runtime.setCellType(range, type)
  }

  clearCellType(range: CellRange): boolean {
    return this.runtime.clearCellType(range)
  }

  getCellType(viewRow: number, viewCol: number): CellTypeOverride {
    return this.engine.getCellType(viewRow, viewCol)
  }

  setValidation(range: CellRange, rule: import('../../kernel/protocol/ValidationTypes').ValidationRule): void {
    this.runtime.setValidation(range, rule)
  }

  clearValidation(range: CellRange): void {
    this.runtime.clearValidation(range)
  }

  validateAll(): void {
    this.engine.validateAll()
  }

  getValidationState(rowIndex: number, colIndex: number): import('../../kernel/protocol/ValidationTypes').ValidationState | null {
    const rawRow = this.engine.viewRowToRaw(rowIndex)
    const rawCol = this.engine.viewColToRaw(colIndex)
    return this.engine.getValidationState(rawRow, rawCol)
  }

  viewRangeToRaw(range: CellRange) {
    return this.engine.viewRangeToRaw(range)
  }

  viewRowToRaw(viewRow: number): number {
    return this.engine.viewRowToRaw(viewRow)
  }

  viewColToRaw(viewCol: number): number {
    return this.engine.viewColToRaw(viewCol)
  }

  setCellAttachment(namespace: string, rawRow: number, rawCol: number, data: unknown): boolean {
    return this.runtime.setCellAttachment(namespace, rawRow, rawCol, data)
  }

  getCellAttachment(namespace: string, rawRow: number, rawCol: number): unknown {
    return this.runtime.getCellAttachment(namespace, rawRow, rawCol)
  }

  getCellText(rawRow: number, rawCol: number): string {
    return this.runtime.getCellText(rawRow, rawCol)
  }

  setTextWrap(range: CellRange, mode: TextWrapMode): boolean {
    return this.runtime.setTextWrap(range, mode)
  }

  mergeCells(range: CellRange): boolean {
    return this.runtime.mergeCells(range)
  }

  unmergeCells(range: CellRange): boolean {
    return this.runtime.unmergeCells(range)
  }

  getViewCellFormat(viewRow: number, viewCol: number) {
    return this.engine.getViewCellFormat(viewRow, viewCol)
  }

  getViewMergeRegion(viewRow: number, viewCol: number) {
    return this.engine.getViewMergeRegion(viewRow, viewCol)
  }

  getSortLayer(): SortLayer {
    return this.sortLayer
  }

  getFilterLayer(): FilterLayer {
    return this.filterLayer
  }

  getViewPipeline(): ViewPipeline {
    return this.pipeline
  }

  on<K extends keyof GridPublicEventMap>(
    eventName: K,
    handler: (event: GridPublicEventMap[K]) => void,
  ): () => void {
    const listeners = this.listenersFor(eventName)
    listeners.add(handler as never)
    return () => {
      listeners.delete(handler as never)
    }
  }

  private createPipeline(source: DataSource): ViewPipeline {
    const pipeline = new ViewPipeline(source)
    // Pipeline 组合顺序对齐 spec §5.3：Sort → Filter → Hide（Hide 由 engine 接管）。
    // pipeline.add 按顺序 wrap，先 add 的 layer 位于 composition 最内层（先生效）。
    pipeline.add(this.sortLayer)
    pipeline.add(this.filterLayer)
    return pipeline
  }

  private subscribePipeline(): void {
    this.unsubscribePipeline = this.pipeline.subscribe((change, oldResolveUnderlyingRow) =>
      this.handlePipelineChange(change, oldResolveUnderlyingRow),
    )
  }

  private handlePipelineChange(
    change: ViewLayerChange,
    oldResolveUnderlyingRow: (viewRow: number) => number,
  ): void {
    if (this.suppressPipelineEvents) return
    if (change.layerId !== 'sort' && change.layerId !== 'filter') return

    const data = this.pipeline.getComposed()
    this.runtime.updateViewData(data, { oldResolveUnderlyingRow }, (renderer) => {
      renderer.setData?.(data)
    })

    this.emitViewChange({ layerId: change.layerId })
    if (change.layerId === 'sort') {
      this.emitSortChange({ spec: this.sortLayer.getSpec() })
    } else {
      this.emitFilterChange({ spec: this.filterLayer.getSpec() })
    }
  }

  private listenersFor<K extends keyof GridPublicEventMap>(
    eventName: K,
  ): Set<(event: GridPublicEventMap[K]) => void> {
    if (eventName === 'viewChange') {
      return this.viewChangeListeners as Set<(event: GridPublicEventMap[K]) => void>
    }
    if (eventName === 'sortChange') {
      return this.sortChangeListeners as Set<(event: GridPublicEventMap[K]) => void>
    }
    return this.filterChangeListeners as Set<(event: GridPublicEventMap[K]) => void>
  }

  private emitViewChange(event: ViewChangeEvent): void {
    for (const listener of this.viewChangeListeners) listener(event)
  }

  private emitSortChange(event: { spec: SortSpec | null }): void {
    for (const listener of this.sortChangeListeners) listener(event)
  }

  private emitFilterChange(event: { spec: FilterSpec | null }): void {
    for (const listener of this.filterChangeListeners) listener(event)
  }
}
