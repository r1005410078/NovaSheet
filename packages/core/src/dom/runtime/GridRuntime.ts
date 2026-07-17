/**
 * GridRuntime——Web 侧表格编排器（spec §6 + CLAUDE.md「Per-Grid scheduler」不变量 #5）。
 *
 * 职责：
 *   - 把 `GridEngine`（状态）、`WebHost`（DOM 生命周期）、`RenderBackend`（绘制）、
 *     `ScrollMapper`（逻辑↔DOM 滚动映射）四件套连起来，对外暴露
 *     `setData / setTheme / scrollTo* / refresh / destroy`；结构/格式类 mutation
 *     passthrough（`insertRows`/`setFillColor` 等，Task 10）已收拢到 `GridControllerImpl`
 *     直调 `engine` + `afterEngineMutation()`，不再经 runtime 转发。
 *   - 拥有**单个** `FrameScheduler`，让 scroll/resize/render 在同一帧里合并（CLAUDE.md 不变量 #5）。
 *   - 隔离 DOM——本类不持有 canvas，也不读 window 全局；所有平台操作走 `WebHost` 回调。
 *
 * 数据流：
 *   scrollHost scroll → handleHostScroll → ScrollMapper → engine.setScroll → renderer.render(frame)
 *
 * 不在职责范围内的：
 *   - canvas/WebGL 上下文（由 `RenderBackend` 实现拥有）
 *   - DOM 节点的创建与销毁（由 `WebHost` 实现拥有）
 *   - 公开 API 面（由 core `Grid` facade 包一层暴露）
 */

import type { AutofitRowsResult } from '../../features/row/AutofitRowHeights'
import type { DataSource } from '../../kernel/data/DataSource'
import { CellEditController } from './controllers/CellEditController'
import { ClipboardController } from './controllers/ClipboardController'
import { ContextMenuController } from './controllers/ContextMenuController'
import { DragCoordinator } from './controllers/DragCoordinator'
import { ExcelWorkspaceBinding } from './controllers/ExcelWorkspaceBinding'
import { InputController } from './controllers/InputController'
import { PopoverController } from './controllers/PopoverController'
import { ViewportController } from './controllers/ViewportController'
import { RenderFlushPipeline } from './RenderFlushPipeline'
import type { ExcelWorkspacePolicy } from '../../features/excel-workspace'
import { FilterLayer } from '../../features/view/FilterLayer'
import type { FilterOp } from '../../features/view/FilterLayer'
import { SortLayer } from '../../features/view/SortLayer'
import { ViewPipeline } from '../../features/view/ViewPipeline'
import type { TextMeasurer } from '../../kernel/measure/TextMeasurer'
import type { Theme } from '../../kernel/theme/Theme'
import type { UndoCommand } from '../../kernel/undo/UndoCommand'
import type { GridEngine, SetViewDataOptions } from '../../engine/GridEngine'
import { autofitRowHeights } from '../../features/row/AutofitRowHeights'
import {
  cellInRange,
  unionRange,
} from '../../kernel/geometry/range'
import { computeResizeHandles } from '../../kernel/interaction/HandleLayout'
import type { ResizeHandleRect } from '../../kernel/interaction/HandleLayout'
import { FrameScheduler } from '../../kernel/util/raf'
import type {
  ContextMenuAction,
  ContextMenuContext,
  ContextMenuExtensionConfig,
  ContextMenuItem,
  ContextMenuRenderer,
} from '../../features/context-menu/ContextMenuModel'
import type { PasteSkippedCell } from '../../features/clipboard/types'
import type { TextWrapMode } from '../../kernel/protocol/FormatTypes'
import type { CellAddress, CellRange } from '../../kernel/coords/SelectionTypes'
import type { MergeRegion } from '../../kernel/coords/MergeRegion'
import type { FillDirection } from '../../features/fill/FillTarget'
import type { GridSelection } from '../../kernel/coords/SelectionTypes'
import type { DomCellEditor } from '../interaction/DomCellEditor'
import type { DomContextMenuLayer } from '../interaction/DomContextMenuLayer'
import type { DomFillHandleLayer } from '../interaction/DomFillHandleLayer'
import type { DomHandleLayer } from '../interaction/DomHandleLayer'
import type { HideToggleHandle } from '../interaction/handle/HideToggleHandle'
import type { HideColToggleHandle } from '../interaction/handle/HideColToggleHandle'
import type { FilterPopover } from '../overlay/FilterPopover'
import type { RowHeightPopover } from '../overlay/RowHeightPopover'
import type { ColumnWidthPopover } from '../overlay/ColumnWidthPopover'
import type { ColumnReorderOverlay } from '../overlay/ColumnReorderOverlay'
import type { RowReorderOverlay } from '../overlay/RowReorderOverlay'
import type { SelectionOverlay } from '../overlay/SelectionOverlay'
import type { DomClipboardAdapter } from '../clipboard/DomClipboardAdapter'
import { computeFillHandleRect, computeRangeOverlayRects } from '../overlay/RangeOverlayRects'
import type { WebHost, WebKeyboardEvent, WebPointerEvent } from '../host/Host'
import type { RenderBackend } from '../../ports/RenderBackend'
import type { NativeScrollSource } from '../scroll/NativeScroller'
import type { CellEditorRegistry } from '../interaction/CellEditorContract'
import type { CellTypeRegistry } from '../../features/cell-types'
import {
  resolveGridInteractions,
  type GridInteractions,
  type ResolvedGridInteractions,
} from './GridInteractions'
import {
  resolveSelectionBehavior,
  type ResolvedSelectionBehavior,
} from '../../kernel/interaction/SelectionBehavior'
import type { GridSelectionBehavior } from '../../kernel/interaction/SelectionBehavior'

/** GridRuntime.autofitRows 入参子集（不包含 measurer，runtime 自己持有）。 */
export interface AutofitRowsRuntimeOptions {
  /** 需要重算高度的行；未传则扫描全部行。 */
  rows?: readonly number[]
  /** 自动行高允许写回的最小高度。 */
  minHeight?: number
  /** 自动行高允许写回的最大高度。 */
  maxHeight?: number
}

/** GridRuntime 的依赖注入参数，由 backend 装配阶段提供。 */
export interface GridRuntimeOptions {
  /** Grid DOM container；custom editor overlay 使用同一局部坐标系挂载。 */
  container?: HTMLElement
  /** 核心表格状态与 mutation 引擎。 */
  engine: GridEngine
  /** Web 平台 host adapter，封装 DOM 生命周期、尺寸与滚动。 */
  host: WebHost
  /** 当前渲染器实现，负责消费 render frame。 */
  renderer: RenderBackend
  /** 自定义单元格编辑器注册表；key 为 `Field.type`。 */
  cellEditors?: CellEditorRegistry
  /** 自定义单元格类型语义注册表；key 为 `Field.type`。 */
  cellTypes?: CellTypeRegistry
  /** 每个 grid 独立的 RAF scheduler；未传时 runtime 自建。 */
  scheduler?: FrameScheduler
  /** 调整绘制表面位图（如 HighDPI）；Canvas2D 目前走此回调，`RenderBackend.resize` 仍为过渡 stub。 */
  onSurfaceResize?: (width: number, height: number, dpr: number) => void
  /**
   * 文本量度器（M3 autofit）。`autofitRows()` 调用时必须可用——backend 装配阶段注入。
   * 未注入时 `autofitRows` 直接返回 `{ changedRows: 0, skippedRows: 0 }` 而非抛错，
   * 方便测试场景与未来 backend 选择性禁用 autofit。
   */
  measurer?: TextMeasurer
  /** Phase 3.4 — DOM resize handles；每帧 render 后 sync 位置。 */
  handleLayer?: DomHandleLayer
  /** Phase 4.3 — DOM fill handle + drag preview layer. */
  fillLayer?: DomFillHandleLayer
  /** Phase 4.4 — optional view pipeline/layers for column header context menu dispatch. */
  viewPipeline?: ViewPipeline
  /** Phase 4.4 — sort 状态层。 */
  sortLayer?: SortLayer
  /** Phase 4.4 — filter 状态层。 */
  filterLayer?: FilterLayer
  /** Phase 4.5 — DOM hide-toggle 点击区 layer。 */
  hideToggleHandle?: HideToggleHandle
  /** Phase 4.6 — DOM hide-col-toggle 点击区 layer。 */
  hideColToggleHandle?: HideColToggleHandle
  /** Phase 4.7 — DOM column reorder preview overlay. */
  columnReorderOverlay?: ColumnReorderOverlay
  /** Phase 4.7 follow-up — DOM row reorder preview overlay. */
  rowReorderOverlay?: RowReorderOverlay
  /** DOM body selection overlay; synced from the same frame as renderer.render. */
  selectionOverlay?: SelectionOverlay
  /** Excel workspace auto-grow/shrink；默认关闭。 */
  excelWorkspace?: boolean | { readonly policy?: Partial<ExcelWorkspacePolicy> }
  /** Validation tooltip：悬停 invalid 单元格时显示错误原因。 */
  validationTooltip?: import('../overlay/ValidationTooltip').ValidationTooltip
  /** 上下文菜单配置式扩展（append / prepend / replace + transform）。 */
  contextMenus?: ContextMenuExtensionConfig
  /** DOM override renderer：替换内置 DomContextMenuLayer，由 consumer 完全接管菜单渲染。 */
  contextMenuRenderer?: ContextMenuRenderer
  /** 交互能力开关（菜单 / 改尺寸 / 换位）。 */
  interactions?: GridInteractions
  /** 冻结窗格与表头角块的选择语义（构造期配置）。 */
  selectionBehavior?: GridSelectionBehavior
}

/** Undo 成功后的 runtime 事件。 */
export interface UndoEvent {
  /** 被撤销的命令。 */
  readonly command: UndoCommand
}

/** Redo 成功后的 runtime 事件。 */
export interface RedoEvent {
  /** 被重做的命令。 */
  readonly command: UndoCommand
}

/** Fill handle 提交后的 runtime 事件。 */
export interface FillEvent {
  /** 填充源区域。 */
  readonly source: CellRange
  /** 实际写入的填充区域。 */
  readonly fill: CellRange
  /** 用户可见的最终选区。 */
  readonly result: CellRange
  /** 填充方向。 */
  readonly direction: FillDirection
}

/**
 * 把选区**并入** active cell 所在的合并区（VIEW 坐标），供选区边框与填充柄共用锚定。
 * 取并集而非直接替换：单格选中合并时并集=整个合并区（展开）；从合并源填充后 selectedRange
 * 已是更大的 result，并集仍是 result（不塌回源合并区，否则边框/填充柄会缩回去）。无命中返回原 range。
 */
function mergeVisualRange(
  mergeRegions: readonly MergeRegion[] | undefined,
  range: CellRange,
  activeCell: CellAddress | null | undefined,
): CellRange {
  if (!activeCell || !mergeRegions) return range
  const merge = mergeRegions.find((m) => cellInRange(activeCell, m.range))?.range
  return merge ? unionRange(range, merge) : range
}

/**
 * Web 端表格编排器（spec §6 `GridRuntime`）。
 *
 * 连接 `GridEngine` + `WebHost` + `RenderBackend` + `ScrollMapper`，不持有 canvas DOM。
 * 数据流：scrollHost 滚动 → `ScrollMapper` → `engine.setScroll` → `renderer.render(frame)`。
 *
 * 引擎变更（`setData` 等）后的通用收尾在 `afterEngineMutation()`：
 * 同步 viewport 尺寸、重算 spacer、remap 滚动、触发重绘。
 */
export class GridRuntime {
  /** 核心表格状态与 mutation 引擎。 */
  private engine: GridEngine
  /** Web 平台 host adapter，负责 DOM 生命周期、尺寸、滚动与事件入口。 */
  private host: WebHost
  /** 当前渲染器实现。 */
  private renderer: RenderBackend
  /** 每个 grid 独立的帧调度器，用于合并 resize/scroll/render。 */
  private scheduler: FrameScheduler
  /** viewport scroll/resize/spacer 域 controller（GridRuntime 拆分 Task 2）。 */
  private viewport: ViewportController
  /** render flush 域 pipeline（GridRuntime 拆分 Task 3）：`invalidate`/`paintSync`/`getRenderFrame`。 */
  private flush: RenderFlushPipeline
  /** 绘制表面 resize 回调，通常用于同步 canvas bitmap 与 DPR。 */
  private onSurfaceResize?: GridRuntimeOptions['onSurfaceResize']
  /** 文本量度器，用于 wrap 字段自动行高。 */
  private measurer?: TextMeasurer
  /** runtime 是否已经销毁；销毁后所有入口都应短路。 */
  private destroyed = false
  /** DOM resize handle layer。 */
  private handleLayer?: DomHandleLayer
  /** DOM fill handle 与填充预览 layer。 */
  private fillLayer?: DomFillHandleLayer
  /** 当前 view pipeline，注入到 render frame 并供列头菜单读取。 */
  private viewPipeline?: ViewPipeline
  /** 当前 sort 状态层。 */
  private sortLayer?: SortLayer
  /** 当前 filter 状态层。 */
  private filterLayer?: FilterLayer
  /** Phase 4.5 — DOM hide-toggle 点击区 layer。 */
  private hideToggleHandle?: HideToggleHandle
  /** Phase 4.6 — DOM hide-col-toggle 点击区 layer。 */
  private hideColToggleHandle?: HideColToggleHandle
  /** Phase 4.7 — DOM reorder preview layer. */
  private columnReorderOverlay?: ColumnReorderOverlay
  /** Phase 4.7 follow-up — DOM row reorder preview layer. */
  private rowReorderOverlay?: RowReorderOverlay
  /** DOM body selection overlay. */
  private selectionOverlay?: SelectionOverlay
  /** Validation tooltip overlay。 */
  private readonly validationTooltip?: import('../overlay/ValidationTooltip').ValidationTooltip
  /** Excel 模式 workspace auto-grow 绑定；未启用时为空。 */
  private excelWorkspace?: ExcelWorkspaceBinding
  /** Custom editor overlay 的 DOM 宿主。 */
  private editorContainer: HTMLElement
  /** 内建 DOM 编辑器 + 自定义编辑器注册表生命周期 controller（GridRuntime 拆分 Task 7）。 */
  private cellEdit: CellEditController
  /** filter/rowHeight/columnWidth popover 域 controller（GridRuntime 拆分 Task 5）。 */
  private popovers: PopoverController
  /** host/行头/列头右键菜单路由、action 分发、hover 菜单按钮 controller（GridRuntime 拆分 Task 6）。 */
  private contextMenu: ContextMenuController
  /** 剪贴板 copy/cut/paste + undo/redo 域 controller（GridRuntime 拆分 Task 4）。 */
  private clipboard: ClipboardController
  /** 5 类 Drag 手势编排 + 拖拽期间边缘自动滚动 tick controller（GridRuntime 拆分 Task 8）。 */
  private drag: DragCoordinator
  /** pointer/keyboard 事件路由 + 表头命中测试 + 整行/整列选择 controller（GridRuntime 拆分 Task 9）。 */
  private input: InputController
  /** fill handle 提交成功后的通知回调。 */
  private onFill?: (event: FillEvent) => void
  /** 选区变化通知回调。 */
  private onSelectionChange?: (selection: GridSelection) => void
  /** 归一化后的交互开关。 */
  private readonly interactions: ResolvedGridInteractions
  /** 归一化后的冻结窗格选择语义。 */
  private readonly selectionBehavior: ResolvedSelectionBehavior

  /** 创建 runtime 并保存 backend 注入的 engine/host/renderer/layer 依赖。 */
  constructor(opts: GridRuntimeOptions) {
    this.engine = opts.engine
    this.host = opts.host
    this.renderer = opts.renderer
    this.editorContainer = opts.container ?? document.createElement('div')
    this.scheduler = opts.scheduler ?? new FrameScheduler()
    this.onSurfaceResize = opts.onSurfaceResize
    this.measurer = opts.measurer
    this.handleLayer = opts.handleLayer
    this.fillLayer = opts.fillLayer
    this.viewPipeline = opts.viewPipeline
    this.sortLayer = opts.sortLayer
    this.filterLayer = opts.filterLayer
    this.hideToggleHandle = opts.hideToggleHandle
    this.hideColToggleHandle = opts.hideColToggleHandle
    this.columnReorderOverlay = opts.columnReorderOverlay
    this.rowReorderOverlay = opts.rowReorderOverlay
    this.selectionOverlay = opts.selectionOverlay
    this.validationTooltip = opts.validationTooltip
    this.interactions = resolveGridInteractions(opts.interactions)
    this.selectionBehavior = resolveSelectionBehavior(opts.selectionBehavior)
    this.engine.setValidationRedrawCallback(() => this.invalidate())
    this.engine.setDataChangeRedrawCallback(() => this.invalidate())
    this.viewport = new ViewportController({
      engine: this.engine,
      host: this.host,
      scheduler: this.scheduler,
      isDestroyed: () => this.destroyed,
      invalidate: () => this.invalidate(),
      paintSync: () => this.paintSync(),
      getRenderer: () => this.renderer,
      onSurfaceResize: this.onSurfaceResize,
      beforeApplyScroll: (source) => this.excelWorkspace?.recordScroll(source),
      afterApplyScroll: () => {
        this.cellEdit.closeActiveCustomEditor()
        this.cellEdit.syncCellEditorPosition()
        this.contextMenu.close()
        this.validationTooltip?.hide()
        this.excelWorkspace?.runFrame()
      },
    })
    this.flush = new RenderFlushPipeline({
      scheduler: this.scheduler,
      isDestroyed: () => this.destroyed,
      getFrame: () => this.engine.getFrame(),
      getRenderer: () => this.renderer,
      getViewPipeline: () => this.viewPipeline,
      augmentFrame: (frame) => this.cellEdit.augmentFrame(frame),
      syncSelectionOverlay: (frame) => this.syncSelectionOverlay(frame),
      syncDomLayers: (frame) => {
        this.syncResizeHandles(frame)
        this.syncFillHandle(frame)
        this.syncHideToggleHandles(frame)
        this.syncHideColToggleHandles(frame)
        this.cellEdit.syncCellEditorPosition(frame)
      },
      getOnSelectionChange: () => this.onSelectionChange,
      getSelection: () => this.engine.getSelection(),
    })
    this.clipboard = new ClipboardController({
      engine: this.engine,
      isDestroyed: () => this.destroyed,
      afterEngineMutation: () => this.afterEngineMutation(),
    })
    this.popovers = new PopoverController({
      engine: this.engine,
      getFilterLayer: () => this.filterLayer,
      onContextMenuAction: (action, ctx) => this.contextMenu.invokeActionOverride(action, ctx),
      closeContextMenu: () => this.contextMenu.close(),
      hideFillPreview: () => this.fillLayer?.hidePreview(),
      hideColumnReorderOverlay: () => this.columnReorderOverlay?.hide(),
    })
    this.contextMenu = new ContextMenuController({
      engine: this.engine,
      host: this.host,
      isDestroyed: () => this.destroyed,
      invalidate: () => this.invalidate(),
      afterEngineMutation: () => this.afterEngineMutation(),
      getViewPipeline: () => this.viewPipeline,
      getSortLayer: () => this.sortLayer,
      getFilterLayer: () => this.filterLayer,
      getContextMenus: () => opts.contextMenus,
      isContextMenuEnabled: () => this.interactions.contextMenu,
      isDragActive: () => this.drag.isAnyDragActive(),
      isCellEditing: () => this.engine.isCellEditing(),
      commitCellEdit: (moveAfter) => this.cellEdit.commitCellEdit(moveAfter),
      hitTestColumnHeader: (event) => this.input.hitTestColumnHeader(event),
      clipboardCopy: () => this.handleClipboardCopy(),
      clipboardCut: () => this.handleClipboardCut(),
      clipboardPaste: () => this.handleClipboardPaste(),
      openFilterPopover: (ctx, anchor) => this.popovers.openFilterPopover(ctx, anchor),
      openRowHeightPopover: (rowIds, anchor) => this.popovers.openRowHeightPopover(rowIds, anchor),
      openColumnWidthPopover: (fieldIds, anchor) => this.popovers.openColumnWidthPopover(fieldIds, anchor),
      insertRows: (beforeUnderlyingRow, count) => {
        if (this.destroyed) return []
        const ids = this.engine.insertRows(beforeUnderlyingRow, count)
        this.afterEngineMutation()
        return ids
      },
      deleteRows: (underlyingRowIds) => {
        if (this.destroyed) return
        this.engine.deleteRows(underlyingRowIds)
        this.afterEngineMutation()
      },
      hideRows: (underlyingRowIds) => {
        if (this.destroyed) return
        this.engine.hideRows(underlyingRowIds)
        this.afterEngineMutation()
      },
      unhideRows: (underlyingRowIds) => {
        if (this.destroyed) return
        this.engine.unhideRows(underlyingRowIds)
        this.afterEngineMutation()
      },
      insertCols: (beforeFieldIndex, count) => {
        if (this.destroyed) return []
        const fields = this.engine.insertCols(beforeFieldIndex, count)
        this.afterEngineMutation()
        return fields
      },
      deleteCols: (fieldIds) => {
        if (this.destroyed) return
        this.engine.deleteCols(fieldIds)
        this.afterEngineMutation()
      },
      hideCols: (fieldIds) => {
        if (this.destroyed) return
        this.engine.hideCols(fieldIds)
        this.afterEngineMutation()
      },
      unhideCols: (fieldIds) => {
        if (this.destroyed) return
        this.engine.unhideCols(fieldIds)
        this.afterEngineMutation()
      },
    })
    if (opts.contextMenuRenderer) {
      this.contextMenu.setRenderer(opts.contextMenuRenderer)
    }
    this.cellEdit = new CellEditController({
      cellEditors: opts.cellEditors ?? {},
      cellTypes: opts.cellTypes ?? {},
      deps: {
        engine: this.engine,
        editorContainer: this.editorContainer,
        isDestroyed: () => this.destroyed,
        refresh: () => this.refresh(),
        paintSync: () => this.paintSync(),
        afterEngineMutation: () => this.afterEngineMutation(),
        ensureCellVisible: (cell) => this.viewport.ensureCellVisible(cell),
        getSelectionScrollTarget: () => this.viewport.getSelectionScrollTarget(),
        autofitRows: (options) => this.autofitRows(options),
        isResizeDragActive: () => this.drag.isResizeDragActive(),
      },
    })
    if (opts.excelWorkspace) {
      this.excelWorkspace = new ExcelWorkspaceBinding({
        policy: typeof opts.excelWorkspace === 'object' ? opts.excelWorkspace.policy : undefined,
        deps: { engine: this.engine, afterEngineMutation: () => this.afterEngineMutation() },
      })
    }
    this.drag = new DragCoordinator({
      engine: this.engine,
      host: this.host,
      scheduler: this.scheduler,
      isDestroyed: () => this.destroyed,
      refresh: () => this.refresh(),
      afterEngineMutation: () => this.afterEngineMutation(),
      closeContextMenu: () => this.contextMenu.close(),
      commitCellEdit: (moveAfter) => this.cellEdit.commitCellEdit(moveAfter),
      autofitRows: (options) => this.autofitRows(options),
      onFill: (event) => this.onFill?.(event),
      syncFillHandle: () => this.syncFillHandle(),
      syncResizeHandles: () => this.syncResizeHandles(),
      handleHostScroll: (scrollTop, scrollLeft) => this.viewport.handleHostScroll(scrollTop, scrollLeft),
      getScrollLimits: () => this.viewport.getScrollLimits(),
      getColsTotalSize: () => this.viewport.getColsTotalSizeForFrame(this.engine.getFrame()),
      hitTestGroupHeader: (event) => this.input.hitTestGroupHeader(event),
      hitTestGroupHeaderAtLevel: (event, level) =>
        this.input.hitTestGroupHeaderAtLevel(event, level),
      hitTestColumnHeader: (event) => this.input.hitTestColumnHeader(event),
      hitTestRowHeader: (event) => this.input.hitTestRowHeader(event),
      isWholeColumnSelection: (range) => this.input.isWholeColumnSelection(range),
      isWholeRowSelection: (range) => this.input.isWholeRowSelection(range),
      selectWholeColumn: (col) => this.input.selectWholeColumn(col),
      selectWholeColumnRange: (anchor, extent) => this.input.selectWholeColumnRange(anchor, extent),
      selectWholeRowRange: (anchor, extent) => this.input.selectWholeRowRange(anchor, extent),
      selectAllCells: () => this.input.selectAllCells(),
      getSelectionBehavior: () => this.selectionBehavior,
      handleLayer: this.handleLayer,
      fillLayer: this.fillLayer,
      columnReorderOverlay: this.columnReorderOverlay,
      rowReorderOverlay: this.rowReorderOverlay,
      allowResize: this.interactions.resize,
      allowReorder: this.interactions.reorder,
    })
    this.input = new InputController({
      engine: this.engine,
      host: this.host,
      isDestroyed: () => this.destroyed,
      refresh: () => this.refresh(),
      getRenderer: () => this.renderer,
      validationTooltip: this.validationTooltip,
      tryStartDrag: (event) => this.drag.tryStartDrag(event),
      moveActiveDrag: (event) => this.drag.moveActiveDrag(event),
      commitActiveDrag: () => this.drag.commitActiveDrag(),
      cancelActiveDrag: () => this.drag.cancelActiveDrag(),
      isAnyDragActive: () => this.drag.isAnyDragActive(),
      closeActiveCustomEditor: () => this.cellEdit.closeActiveCustomEditor(),
      commitCellEdit: (moveAfter) => this.cellEdit.commitCellEdit(moveAfter),
      openCellEditorForTrigger: (args) => this.cellEdit.openCellEditorForTrigger(args),
      hasCustomCellEditor: (cell) => this.cellEdit.hasCustomCellEditor(cell),
      invokeCellAction: (action) => this.cellEdit.invokeCellAction(action),
      clipboardCopy: () => this.handleClipboardCopy(),
      clipboardCut: () => this.handleClipboardCut(),
      clipboardPaste: () => this.handleClipboardPaste(),
      undo: () => this.undo(),
      redo: () => this.redo(),
      hitTestColumnHeaderMenuButton: (event) =>
        this.contextMenu.hitTestColumnHeaderMenuButton(event),
      openColumnHeaderContextMenu: (colIndex, event) =>
        this.contextMenu.openColumnHeaderContextMenu(colIndex, event),
      updateHoveredColumnHeaderMenu: (event) =>
        this.contextMenu.updateHoveredColumnHeaderMenu(event),
      isFilterPopoverOpen: () => this.popovers.isFilterPopoverOpen(),
      ensureCellVisible: (cell) => this.viewport.ensureCellVisible(cell),
      getSelectionScrollTarget: () => this.viewport.getSelectionScrollTarget(),
      getColsTotalSizeForFrame: (frame) => this.viewport.getColsTotalSizeForFrame(frame),
    })
  }

  /** Phase 3.5 — backend 在 runtime 创建后注入编辑器。 */
  setCellEditor(editor: DomCellEditor): void {
    this.cellEdit.setCellEditor(editor)
  }

  /** Phase 4.0 — 注入右键菜单层。 */
  setContextMenuLayer(layer: DomContextMenuLayer): void {
    this.contextMenu.setLayer(layer)
    this.contextMenu.applyTheme(this.engine.getTheme())
  }

  /** 注入 filter popover 并同步当前主题。 */
  setFilterPopover(popover: FilterPopover): void {
    this.popovers.setFilterPopover(popover)
    this.popovers.applyTheme(this.engine.getTheme())
  }

  /** 注入 row-height popover（Phase 4.5）。 */
  setRowHeightPopover(popover: RowHeightPopover): void {
    this.popovers.setRowHeightPopover(popover)
  }

  /** 注入 column-width popover（Phase 4.6）。 */
  setColumnWidthPopover(popover: ColumnWidthPopover): void {
    this.popovers.setColumnWidthPopover(popover)
  }

  /** 注入 hide-col toggle handle（Phase 4.6）。 */
  setHideColToggleHandle(handle: HideColToggleHandle): void {
    this.hideColToggleHandle = handle
  }

  /** 返回当前 resize-row-height 操作暂存的行 id 列表，供 onSubmit 回调读取。 */
  getPendingRowHeightIds(): number[] {
    return this.popovers.getPendingRowHeightIds()
  }

  /** 返回当前 resize-column-width 操作暂存的 fieldId 列表，供 onSubmit 回调读取。 */
  getPendingColumnWidthFieldIds(): readonly string[] {
    return this.popovers.getPendingColumnWidthFieldIds()
  }

  /** 替换当前 view pipeline 与 sort/filter 状态层。 */
  setViewContext(opts: {
    viewPipeline: ViewPipeline
    sortLayer: SortLayer
    filterLayer: FilterLayer
  }): void {
    this.viewPipeline = opts.viewPipeline
    this.sortLayer = opts.sortLayer
    this.filterLayer = opts.filterLayer
  }

  /** 注册右键菜单 action 回调；设置后 consumer 可接管默认菜单行为。 */
  setOnContextMenuAction(cb: (action: ContextMenuAction | string, ctx: ContextMenuContext) => void): void {
    this.contextMenu.setOnAction(cb)
  }

  /** 关闭右键菜单并清理最近菜单上下文。 */
  closeContextMenu(): void {
    this.contextMenu.close()
  }

  /** Phase 4.1 — 注入 clipboard adapter；未注入时 copy/cut/paste 全 silent no-op。 */
  setClipboardAdapter(adapter: DomClipboardAdapter): void {
    this.clipboard.setAdapter(adapter)
  }

  /** 注册 copy 成功通知回调。 */
  setOnCopy(cb: (range: CellRange) => void): void {
    this.clipboard.setOnCopy(cb)
  }

  /** 注册 cut 成功通知回调。 */
  setOnCut(cb: (range: CellRange) => void): void {
    this.clipboard.setOnCut(cb)
  }

  /** 注册 paste 成功通知回调。 */
  setOnPaste(cb: (target: CellRange) => void): void {
    this.clipboard.setOnPaste(cb)
  }

  /** 注册 paste 跳过单元格通知回调。 */
  setOnPasteSkipped(cb: (cells: readonly PasteSkippedCell[]) => void): void {
    this.clipboard.setOnPasteSkipped(cb)
  }

  /** 注册 undo 成功通知回调。 */
  setOnUndo(cb: (event: UndoEvent) => void): void {
    this.clipboard.setOnUndo(cb)
  }

  /** 注册 redo 成功通知回调。 */
  setOnRedo(cb: (event: RedoEvent) => void): void {
    this.clipboard.setOnRedo(cb)
  }

  /** 注册 fill handle 提交通知回调。 */
  setOnFill(cb: (event: FillEvent) => void): void {
    this.onFill = cb
  }

  /** 注册选区变化通知回调。 */
  setOnSelectionChange(cb: (selection: GridSelection) => void): void {
    this.onSelectionChange = cb
  }

  /** 返回当前 undo 栈是否可撤销。 */
  canUndo(): boolean {
    return this.clipboard.canUndo()
  }

  /** 返回当前 redo 栈是否可重做。 */
  canRedo(): boolean {
    return this.clipboard.canRedo()
  }

  /** Phase 4.5 — 生成行头右键菜单项列表（含条件 unhide 项）。 */
  getRowHeaderContextMenuItems(ctx: { targetRowIndex: number }): readonly ContextMenuItem[] {
    return this.contextMenu.getRowHeaderContextMenuItems(ctx)
  }

  /** Phase 4.5 — 执行行头右键菜单动作。 */
  invokeRowHeaderContextMenuAction(id: string, ctx: { targetRowIndex: number }): void {
    this.contextMenu.invokeRowHeaderContextMenuAction(id, ctx)
  }

  /** Phase 4.6 — 生成列头右键菜单项列表（含结构项与条件 unhide 项）。 */
  getColumnHeaderContextMenuItems(ctx: { targetColIndex: number }): readonly ContextMenuItem[] {
    return this.contextMenu.getColumnHeaderContextMenuItems(ctx)
  }

  /** Phase 4.6 — 执行列头右键菜单动作。 */
  invokeColumnHeaderContextMenuAction(id: string, ctx: { targetColIndex: number }): void {
    this.contextMenu.invokeColumnHeaderContextMenuAction(id, ctx)
  }

  /** 执行一次 undo，并在成功后刷新视图与通知 consumer。 */
  undo(): void {
    this.clipboard.undo()
  }

  /** 执行一次 redo，并在成功后刷新视图与通知 consumer。 */
  redo(): void {
    this.clipboard.redo()
  }

  /** 处理 copy：序列化当前选区、写入剪贴板并更新 typed paste 缓存。 */
  async handleClipboardCopy(): Promise<boolean> {
    return this.clipboard.handleClipboardCopy()
  }

  /** 处理 cut：复制当前选区后清空源区域。 */
  async handleClipboardCut(): Promise<boolean> {
    return this.clipboard.handleClipboardCut()
  }

  /** 处理 paste：读取剪贴板、推导目标区域并提交到 engine。 */
  async handleClipboardPaste(): Promise<boolean> {
    return this.clipboard.handleClipboardPaste()
  }

  /** 处理 host contextmenu 事件，并根据列头/单元格命中打开对应菜单。 */
  handleHostContextMenu(event: WebPointerEvent): void {
    this.contextMenu.handleHostContextMenu(event)
  }

  /** 处理右键菜单项选择，优先执行内置 sort/filter/clipboard 行为。 */
  handleContextMenuSelected(id: ContextMenuAction | string): void {
    this.contextMenu.handleContextMenuSelected(id)
  }

  /** 应用 filter popover 返回的条件；null 表示清除当前列筛选。 */
  handleFilterPopoverApply(op: FilterOp | null): void {
    this.popovers.handleFilterPopoverApply(op)
  }

  /** 按单元格坐标程序化打开右键菜单，锚点位于单元格右下角。 */
  openContextMenuAt(rowIndex: number, fieldId: string): void {
    this.contextMenu.openContextMenuAt(rowIndex, fieldId)
  }

  /** 注入或替换 TextMeasurer；backend 切换 measurer（如主题字体变更）时调用。 */
  setMeasurer(measurer: TextMeasurer): void {
    this.measurer = measurer
  }

  /** 连接 host，初始化 viewport/spacer/theme，并执行首帧同步绘制。 */
  attach(): void {
    this.host.attach()
    const { width, height } = this.host.getContainerSize()
    const dpr = this.host.getDpr()
    this.engine.setViewportSize(width, height)
    this.onSurfaceResize?.(width, height, dpr)
    this.viewport.resizeSpacer()
    this.syncScrollbarTheme()
    this.syncResizeHandleTheme()
    this.cellEdit.applyTheme(this.engine.getTheme())
    this.paintSync()
  }

  /** 更换渲染器实现（Canvas2D / 未来 WebGL）；销毁旧实例并取消 pending flush。 */
  replaceRenderer(factory: () => RenderBackend): RenderBackend {
    if (!this.destroyed) {
      this.flush.cancelPending()
      this.renderer.destroy()
    }
    this.renderer = factory()
    return this.renderer
  }

  /** 替换底层 data source 与 renderer，并清空剪贴板 typed 缓存。 */
  setData(data: DataSource, factory: () => RenderBackend): RenderBackend {
    this.engine.setData(data)
    this.replaceRenderer(factory)
    this.clipboard.clearCache()
    this.afterEngineMutation()
    return this.renderer
  }

  /** 替换 view data，并允许 caller 对现有 renderer 打补丁。 */
  updateViewData(
    data: DataSource,
    options?: SetViewDataOptions,
    patchRenderer?: (renderer: RenderBackend) => void,
  ): void {
    this.engine.setViewData(data, options)
    patchRenderer?.(this.renderer)
    this.clipboard.clearCache()
    this.afterEngineMutation()
  }

  /** 应用主题到 engine、renderer 与所有 DOM overlay layer。 */
  setTheme(theme: Theme, patchRenderer?: (renderer: RenderBackend) => void): void {
    this.engine.setTheme(theme)
    patchRenderer?.(this.renderer)
    this.syncScrollbarTheme()
    this.syncResizeHandleTheme()
    this.cellEdit.applyTheme(theme)
    this.contextMenu.applyTheme(theme)
    this.popovers.applyTheme(theme)
    this.selectionOverlay?.applyTheme(theme)
    this.afterEngineMutation()
  }

  /** 请求一帧异步重绘。 */
  refresh(): void {
    this.invalidate()
  }

  /** 程序化打开单元格编辑器；custom editor 的 trigger 为 `api`。 */
  openCellEditor(rowIndex: number, fieldId: string): boolean {
    if (this.destroyed) return false
    return this.cellEdit.openCellEditor(rowIndex, fieldId)
  }

  /**
   * 按当前列宽 + 文本内容批量重算 `field.wrap === true` 字段的行高（M3 autofit）。
   *
   * - 必须先注入 `measurer`，否则返回 `{ changedRows: 0, skippedRows: 0 }`（不抛错）
   * - 复用 core 的 `autofitRowHeights`，把写回路径通过 `engine.setRowHeight` 接入轴
   * - 完成后走 `afterEngineMutation` 同步 spacer + remap 滚动 + 重绘
   * - 不订阅后续 mutation——用户改了列宽 / 数据 / 主题需要重新调用
   */
  autofitRows(options: AutofitRowsRuntimeOptions = {}): AutofitRowsResult {
    if (!this.measurer) return { changedRows: 0, skippedRows: 0 }
    const frame = this.engine.getFrame()
    const mergeRegions = frame.mergeRegions
    // 解析每格的软折状态：textWrap==='wrap' 或（未设且列 field.wrap）。cellFormats 为 VIEW 坐标。
    const textWrapLookup = new Map<string, TextWrapMode>()
    for (const cf of frame.cellFormats ?? []) {
      if (cf.format.textWrap !== undefined) {
        textWrapLookup.set(`${cf.rowIndex}:${cf.colIndex}`, cf.format.textWrap)
      }
    }
    const fields = frame.data.getSchema().fields
    const result = autofitRowHeights({
      data: frame.data,
      theme: frame.theme,
      measurer: this.measurer,
      applyHeight: (row, h) => this.engine.setRowHeight(row, h),
      rows: options.rows,
      minHeight: options.minHeight,
      maxHeight: options.maxHeight,
      // 合并格不参与撑高（与 Google 表格一致）；mergeRegions 为 VIEW 坐标，与 autofit 行号同空间。
      isCellMerged:
        mergeRegions && mergeRegions.length > 0
          ? (row, col) =>
              mergeRegions.some((region) =>
                cellInRange({ rowIndex: row, colIndex: col }, region.range),
              )
          : undefined,
      isWrapCell: (row, col) => {
        const mode = textWrapLookup.get(`${row}:${col}`)
        if (mode !== undefined) return mode === 'wrap'
        return fields[col]?.wrap === true
      },
    })
    if (result.changedRows > 0) this.afterEngineMutation()
    return result
  }

  /** engine mutation 后的统一收尾：同步 viewport、spacer、scroll 与 overlay 状态。 */
  afterEngineMutation(): void {
    const { width, height } = this.host.getContainerSize()
    this.engine.setViewportSize(width, height)
    this.viewport.resizeSpacer()
    this.viewport.remapScroll()
    this.refresh()
    this.contextMenu.close()
    this.cellEdit.closeActiveCustomEditor()
    this.fillLayer?.hidePreview()
    this.drag.clearActiveDrag()
  }

  /** 滚动到指定行，并按给定对齐方式放入 viewport。 */
  scrollToRow(rowIndex: number, align?: 'start' | 'center' | 'end'): void {
    this.viewport.scrollToRow(rowIndex, align)
  }

  /** 滚动到指定单元格的左上角。 */
  scrollToCell(rowIndex: number, fieldId: string): void {
    this.viewport.scrollToCell(rowIndex, fieldId)
  }

  /** 滚动到指定组的首个可见叶列，按 align 对齐横向视口。 */
  scrollToGroup(groupId: string, align?: 'start' | 'center' | 'end'): void {
    this.viewport.scrollToGroup(groupId, align)
  }

  /** 开始鼠标/触控 resize 拖拽并显示尺寸指示线。 */
  handleResizePointerDown(
    handle: ResizeHandleRect,
    pointerId: number,
    clientX: number,
    clientY: number,
  ): void {
    if (this.destroyed) return
    this.drag.handleResizePointerDown(handle, pointerId, clientX, clientY)
  }

  /** 更新 resize 拖拽预览尺寸。 */
  handleResizePointerMove(pointerId: number, clientX: number, clientY: number): void {
    if (this.destroyed) return
    this.drag.handleResizePointerMove(pointerId, clientX, clientY)
  }

  /** 结束 resize 拖拽并一次性提交行高/列宽变更。 */
  handleResizePointerUp(pointerId: number): void {
    this.drag.handleResizePointerUp(pointerId)
  }

  /** 开始 fill handle 拖拽。 */
  handleFillPointerDown(pointerId: number, clientX: number, clientY: number): void {
    if (this.destroyed) return
    this.drag.handleFillPointerDown(pointerId, clientX, clientY)
  }

  /** 更新 fill handle 拖拽目标与预览 overlay。 */
  handleFillPointerMove(pointerId: number, clientX: number, clientY: number): void {
    if (this.destroyed) return
    this.drag.handleFillPointerMove(pointerId, clientX, clientY)
  }

  /** 结束 fill handle 拖拽并提交填充结果。 */
  handleFillPointerUp(pointerId: number): void {
    this.drag.handleFillPointerUp(pointerId)
  }

  /** 同步编辑器 draft 到 engine 的 cell edit session。 */
  handleCellEditDraft(draft: string): void {
    this.cellEdit.handleCellEditDraft(draft)
  }

  /** 处理 Enter 提交编辑，并在成功后移动到下一行。 */
  handleCellEditCommitEnter(): void {
    this.cellEdit.handleCellEditCommitEnter()
  }

  /** 处理 blur 提交编辑，保持当前选区不移动。 */
  handleCellEditCommitBlur(): void {
    this.cellEdit.handleCellEditCommitBlur()
  }

  /** 取消当前编辑并刷新编辑器/选区显示。 */
  handleCellEditCancel(): void {
    this.cellEdit.handleCellEditCancel()
  }

  /** 处理键盘 resize，按 delta 调整行高或列宽。 */
  handleResizeKeyboard(handle: ResizeHandleRect, delta: number): void {
    if (this.destroyed) return
    this.drag.handleResizeKeyboard(handle, delta)
  }

  /**
   * runtime 是否已销毁。GridControllerImpl 的 mutation 方法（Task 10 迁出后不再经 runtime
   * 转发）用此在调用 `engine` 前复现原 `if (this.destroyed) return` 早退语义——
   * async 续体（防抖 resize、in-flight paste/undo promise、过期事件闭包）可能在
   * `destroy()` 之后才触发，这类调用不应再驱动 engine mutation 或触碰已销毁的 host/renderer。
   */
  isDestroyed(): boolean {
    return this.destroyed
  }

  /** 销毁 runtime、renderer、host，并取消所有 pending scheduler task。 */
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.engine.dispose()
    this.cellEdit.destroy()
    this.drag.destroy()
    this.fillLayer?.hidePreview()
    this.columnReorderOverlay?.hide()
    this.rowReorderOverlay?.hide()
    this.flush.destroy()
    this.viewport.destroy()
    this.renderer.destroy()
    this.host.destroy()
    this.validationTooltip?.destroy()
    this.contextMenu.destroy()
  }

  /** 处理 host 滚动事件，映射为逻辑滚动并触发重绘。 */
  handleHostScroll(scrollTop: number, scrollLeft: number, source?: NativeScrollSource): void {
    this.viewport.handleHostScroll(scrollTop, scrollLeft, source)
  }

  /** 处理 host 尺寸变化；实际 resize 工作合并到 RAF 中执行。 */
  handleHostResize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.viewport.handleHostResize(cssWidth, cssHeight, dpr)
  }

  /** 处理 DPR 变化；实际 resize 工作合并到 RAF 中执行。 */
  handleHostDprChange(dpr: number): void {
    this.viewport.handleHostDprChange(dpr)
  }

  /** 处理 host pointerdown，开始单元格选择或扩展选择；委托给 `InputController`（Task 9）。 */
  handleHostPointerDown(event: WebPointerEvent): void {
    this.input.handleHostPointerDown(event)
  }

  /** 处理 host pointermove，更新拖拽选区并启动边缘自动滚动；委托给 `InputController`（Task 9）。 */
  handleHostPointerMove(event: WebPointerEvent): void {
    this.input.handleHostPointerMove(event)
  }

  /** 处理 host pointerup，结束选区拖拽并恢复 fill handle；委托给 `InputController`（Task 9）。 */
  handleHostPointerUp(): void {
    this.input.handleHostPointerUp()
  }

  /** 处理双击单元格，进入编辑模式；委托给 `InputController`（Task 9）。 */
  handleHostDoubleClick(event: WebPointerEvent): void {
    this.input.handleHostDoubleClick(event)
  }

  /** Phase 3.3 / 3.5 — 导航；选中后直接键入进入编辑（Sheets 式）；委托给 `InputController`（Task 9）。 */
  handleHostKeyDown(event: WebKeyboardEvent): boolean {
    return this.input.handleHostKeyDown(event)
  }

  /** @internal 供集成测试模拟 ResizeObserver 回调 */
  onContainerResize(): void {
    this.viewport.onContainerResize()
  }

  /** 调度下一帧 render flush，并同步 overlay 与编辑器位置；委托给 `RenderFlushPipeline`（Task 3）。 */
  private invalidate(): void {
    this.flush.invalidate()
  }

  /** 立即同步绘制一帧；用于 attach/resize 等不能等待异步 flush 的路径；委托给 `RenderFlushPipeline`（Task 3）。 */
  private paintSync(): void {
    this.flush.paintSync()
  }

  /** 根据当前 frame 同步 resize handle layer；flush 路径复用已构建的 frame，避免重复 getFrame。 */
  private syncResizeHandles(frame?: ReturnType<GridEngine['getFrame']>): void {
    if (!this.handleLayer || this.drag.isResizeDragActive()) return
    if (!this.interactions.resize) {
      this.handleLayer.sync([])
      return
    }
    const f = frame ?? this.engine.getFrame()
    this.handleLayer.sync(computeResizeHandles(f))
  }

  /** 根据当前 frame 同步 hide-toggle handle layer；flush 路径复用已构建的 frame，避免重复 getFrame。 */
  private syncHideToggleHandles(frame?: ReturnType<GridEngine['getFrame']>): void {
    if (!this.hideToggleHandle) return
    const f = frame ?? this.engine.getFrame()
    this.hideToggleHandle.update(f.collapsedRowGaps, {
      rowHeaderWidth: f.viewport.rowHeaderWidth,
    })
  }

  /** 根据当前 frame 同步 hide-col-toggle handle layer；flush 路径复用已构建的 frame，避免重复 getFrame。 */
  private syncHideColToggleHandles(frame?: ReturnType<GridEngine['getFrame']>): void {
    if (!this.hideColToggleHandle) return
    const f = frame ?? this.engine.getFrame()
    this.hideColToggleHandle.update(f.collapsedColGaps, {
      headerHeight: f.viewport.headerHeight,
    })
  }

  /** 根据当前选区同步 fill handle；编辑/拖拽时隐藏。flush 路径复用已构建的 frame，避免重复 getFrame。 */
  private syncFillHandle(frame?: ReturnType<GridEngine['getFrame']>): void {
    if (!this.fillLayer) return
    if (this.drag.isAnyDragActive() || this.engine.isCellEditing()) {
      this.fillLayer.sync(null)
      return
    }
    const f = frame ?? this.engine.getFrame()
    const range = f.selection?.selectedRange
    if (!range) {
      this.fillLayer.sync(null)
      return
    }
    // 与选区边框一致：active cell 落在合并区内时锚定整个合并区，填充柄才在合并区右下角。
    const visualRange = mergeVisualRange(f.mergeRegions, range, f.selection?.activeCell)
    this.fillLayer.sync(computeFillHandleRect(f, visualRange))
  }

  /** 根据 renderer 同一份 frame 同步 DOM body selection overlay。 */
  private syncSelectionOverlay(frame = this.flush.getRenderFrame()): void {
    if (!this.selectionOverlay) return
    if (this.engine.isCellEditing()) {
      this.selectionOverlay.sync(null)
      return
    }
    const selection = frame.selection
    const range = selection?.selectedRange
    if (!range) {
      this.selectionOverlay.sync(null)
      return
    }
    const active = selection.activeCell
    const visualRange = mergeVisualRange(frame.mergeRegions, range, active)
    const activeRect = active
      ? (computeRangeOverlayRects(
          frame,
          visualRange ?? {
            startRow: active.rowIndex,
            endRow: active.rowIndex,
            startCol: active.colIndex,
            endCol: active.colIndex,
          },
        ).at(-1) ?? null)
      : null
    this.selectionOverlay.sync({
      rangeRects: computeRangeOverlayRects(frame, visualRange),
      activeRect,
    })
  }

  /** 同步 scrollbar 主题到 host。 */
  private syncScrollbarTheme(): void {
    this.host.applyScrollbarTheme(this.engine.getTheme().scrollbar)
  }

  /** 同步 resize handle layer 主题。 */
  private syncResizeHandleTheme(): void {
    const theme = this.engine.getTheme()
    const frame = this.engine.getFrame()
    this.handleLayer?.applyTheme(theme.colors, {
      headerHeight: theme.metrics.headerHeight,
      rowHeaderWidth: frame.viewport.rowHeaderWidth ?? theme.metrics.rowHeaderWidth,
    })
  }

}
