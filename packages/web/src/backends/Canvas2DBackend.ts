/**
 * Canvas2DBackend——`Grid` facade 在 `renderer: 'canvas2d'` 时使用的后端实现。
 *
 * 把 `DefaultGridEngine` + `DomGridHost` + `Canvas2DRenderer` + `WebGridRuntime`
 * 装配成一个 `GridController`，对外暴露公共 API。其他渲染器（WebGL/WebGPU）
 * 实现各自的 `Backend` 即可，`Grid` 选择器根据 options 切换。
 *
 * 不变量：
 *   - 单实例只有一个 canvas、一个 host、一个 runtime
 *   - canvas 由 backend 拥有（renderer 不再自己 mount canvas，方便后端切换）
 *   - `setData` 时换 renderer（轴 / viewport 重建后旧 renderer 引用已失效）
 */

import {
  DefaultGridEngine,
  FilterLayer,
  FrameScheduler,
  SortLayer,
  ViewPipeline,
  type CellRange,
  type ContextMenuItem,
  type ContextMenuAction,
  type ContextMenuContext,
  type DataSource,
  type FilterSpec,
  type FrozenConfig,
  type GridEngineOptions,
  type GridSelection,
  type PasteSkippedCell,
  type SortSpec,
  type Theme,
  type ViewLayerChange,
} from '@novasheet/core'
import { Canvas2DRenderer, Canvas2DTextMeasurer, HighDPI } from '@novasheet/web-canvas2d'
import { WebClipboardAdapter } from '../clipboard/WebClipboardAdapter'
import type {
  AutofitRowsOptions,
  AutofitRowsResult,
  FilterChangeEvent,
  GridController,
  GridPublicEventMap,
  SortChangeEvent,
  ViewChangeEvent,
} from '../grid/GridController'
import type { FillEvent, RedoEvent, UndoEvent } from '../runtime/WebGridRuntime'
import { DomGridHost } from '../host/DomGridHost'
import { DomCellEditor } from '../interaction/DomCellEditor'
import { DomContextMenuLayer } from '../interaction/DomContextMenuLayer'
import { DomFillHandleLayer } from '../interaction/DomFillHandleLayer'
import { DomHandleLayer } from '../interaction/DomHandleLayer'
import { HideToggleHandle } from '../handle/HideToggleHandle'
import { FilterPopover } from '../interaction/FilterPopover'
import { RowHeightPopover } from '../overlay/RowHeightPopover'
import { WebGridRuntime } from '../runtime/WebGridRuntime'

/**
 * Canvas2D 渲染后端装配（`Grid` 在 `renderer: 'canvas2d'` 时使用）。
 *
 * 职责划分：
 *   - 本类：创建 canvas / HighDPI / `Canvas2DRenderer`，并交给 `WebGridRuntime` 编排
 *   - `DomGridHost`：scrollHost、spacer、ResizeObserver、DPR 监听
 *   - `WebGridRuntime`：滚动映射、spacer 尺寸、RAF、`setData` 换 renderer
 *   - `DefaultGridEngine`（core）：数据、轴、viewport 逻辑状态
 *
 * Host 回调在 `attach()` 之后才触发，故可在 `this.runtime` 赋值后安全闭包引用。
 */
export class Canvas2DBackend implements GridController {
  private container: HTMLElement
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private engine: DefaultGridEngine
  private highDpi: HighDPI
  private renderer: Canvas2DRenderer
  private host: DomGridHost
  private handleLayer: DomHandleLayer
  private fillHandleLayer: DomFillHandleLayer
  private hideToggleHandle: HideToggleHandle
  private cellEditor: DomCellEditor
  private contextMenuLayer!: DomContextMenuLayer
  private filterPopover!: FilterPopover
  private rowHeightPopover!: RowHeightPopover
  private clipboardAdapter = new WebClipboardAdapter()
  private runtime!: WebGridRuntime
  private scheduler = new FrameScheduler()
  private rawSource: DataSource
  private filterLayer = new FilterLayer()
  private sortLayer = new SortLayer()
  private pipeline: ViewPipeline
  private unsubscribePipeline: () => void = () => {}
  private suppressPipelineEvents = false
  private viewChangeListeners = new Set<(event: ViewChangeEvent) => void>()
  private sortChangeListeners = new Set<(event: SortChangeEvent) => void>()
  private filterChangeListeners = new Set<(event: FilterChangeEvent) => void>()
  /** 共享 measurer：CellPainter 绘制 wrap 字段 + runtime.autofitRows 度量都使用同一个实例，
   *  让 LRU 缓存跨绘制 / 度量复用。 */
  private measurer = new Canvas2DTextMeasurer()

  constructor(
    container: HTMLElement,
    options: GridEngineOptions,
    gridOptions?: {
      onContextMenuAction?: (action: ContextMenuAction, ctx: ContextMenuContext) => void
      onCopy?: (range: CellRange) => void
      onCut?: (range: CellRange) => void
      onPaste?: (target: CellRange) => void
      onPasteSkipped?: (cells: readonly PasteSkippedCell[]) => void
      onUndo?: (event: UndoEvent) => void
      onRedo?: (event: RedoEvent) => void
      onFill?: (event: FillEvent) => void
    },
  ) {
    this.container = container
    this.rawSource = options.data
    this.pipeline = this.createPipeline(this.rawSource)
    this.subscribePipeline()
    this.engine = new DefaultGridEngine({ ...options, data: this.pipeline.getComposed() })

    this.canvas = document.createElement('canvas')
    Object.assign(this.canvas.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      pointerEvents: 'none',
      zIndex: '0',
    })
    this.container.appendChild(this.canvas)

    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('NovaSheet: 2d canvas context unavailable')
    this.ctx = ctx

    this.highDpi = new HighDPI(this.canvas, this.ctx)
    this.renderer = this.createRenderer()

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

    this.runtime = new WebGridRuntime({
      engine: this.engine,
      host: this.host,
      renderer: this.renderer,
      scheduler: this.scheduler,
      measurer: this.measurer,
      handleLayer: this.handleLayer,
      fillLayer: this.fillHandleLayer,
      hideToggleHandle: this.hideToggleHandle,
      viewPipeline: this.pipeline,
      sortLayer: this.sortLayer,
      filterLayer: this.filterLayer,
      onSurfaceResize: (w, h) => this.highDpi.resize(w, h),
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
      this.createRenderer(),
    ) as Canvas2DRenderer
  }

  setTheme(theme: Theme): void {
    this.runtime.setTheme(theme, (renderer) => {
      ;(renderer as Canvas2DRenderer).setTheme(theme)
    })
    // 字体可能随主题变；清空 measurer 缓存避免过期宽度
    this.measurer.clearCache()
  }

  setRowHeight(rowIndex: number, height: number): void {
    this.runtime.setRowHeight(rowIndex, height)
  }

  setColumnWidth(fieldId: string, width: number): void {
    this.runtime.setColumnWidth(fieldId, width)
  }

  setFrozen(config: Partial<FrozenConfig>): void
  setFrozen(rows: number, cols: number): void
  setFrozen(configOrRows: Partial<FrozenConfig> | number, cols = 0): void {
    if (typeof configOrRows === 'number') this.runtime.setFrozen(configOrRows, cols)
    else this.runtime.setFrozen(configOrRows)
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

  autofitRows(options: AutofitRowsOptions = {}): AutofitRowsResult {
    return this.runtime.autofitRows(options)
  }

  setClipboardReady(ready: boolean): void {
    this.runtime.setClipboardReady(ready)
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
    this.runtime.destroy()
    this.hideToggleHandle.destroy()
    this.fillHandleLayer.destroy()
    this.handleLayer.destroy()
    this.cellEditor.destroy()
    if (this.canvas.parentNode === this.container) {
      this.container.removeChild(this.canvas)
    }
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

  /** 用当前 engine 状态构造新的 `Canvas2DRenderer`（`setData` 后轴/viewport 会重建）。 */
  private createRenderer(): Canvas2DRenderer {
    return new Canvas2DRenderer({
      ctx: this.ctx,
      data: this.engine.getData(),
      viewport: this.engine.getViewport(),
      rowsAxis: this.engine.getRowsAxis(),
      colsAxis: this.engine.getColsAxis(),
      theme: this.engine.getTheme(),
      scheduler: this.scheduler,
      measurer: this.measurer,
    })
  }

  private createPipeline(source: DataSource): ViewPipeline {
    const pipeline = new ViewPipeline(source)
    pipeline.add(this.filterLayer)
    pipeline.add(this.sortLayer)
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
      const canvasRenderer = renderer as Canvas2DRenderer
      canvasRenderer.setData(data)
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
