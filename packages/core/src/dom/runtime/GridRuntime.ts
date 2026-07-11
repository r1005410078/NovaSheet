/**
 * GridRuntime——Web 侧表格编排器（spec §6 + CLAUDE.md「Per-Grid scheduler」不变量 #5）。
 *
 * 职责：
 *   - 把 `GridEngine`（状态）、`WebHost`（DOM 生命周期）、`RenderBackend`（绘制）、
 *     `ScrollMapper`（逻辑↔DOM 滚动映射）四件套连起来，对外暴露
 *     `setData / setTheme / setRowHeight / setColumnWidth / setFrozen / scrollTo* / refresh / destroy`。
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
import { ClipboardController } from './controllers/ClipboardController'
import { ContextMenuController } from './controllers/ContextMenuController'
import { ExcelWorkspaceBinding } from './controllers/ExcelWorkspaceBinding'
import { PopoverController } from './controllers/PopoverController'
import { ViewportController } from './controllers/ViewportController'
import { RenderFlushPipeline } from './RenderFlushPipeline'
import type { RuntimeRenderFrame, RuntimeCellEdit } from './runtime-frame'
import type { ExcelWorkspacePolicy } from '../../features/excel-workspace'
import type { CellValue, Field } from '../../kernel/data/Schema'
import { FilterLayer } from '../../features/view/FilterLayer'
import type { FilterOp } from '../../features/view/FilterLayer'
import { SortLayer } from '../../features/view/SortLayer'
import { ViewPipeline } from '../../features/view/ViewPipeline'
import type { TextMeasurer } from '../../kernel/measure/TextMeasurer'
import type { Theme } from '../../kernel/theme/Theme'
import type { UndoCommand } from '../../kernel/undo/UndoCommand'
import type { GridEngine, SetViewDataOptions } from '../../engine/GridEngine'
import type { FrozenConfig } from '../../kernel/geometry/FrozenRegions'
import { autofitRowHeights } from '../../features/row/AutofitRowHeights'
import {
  cellInRange,
  clamp,
  unionRange,
} from '../../kernel/geometry/range'
import { computeCellRect } from '../../kernel/interaction/CellLayout'
import {
  computeResizeHandles,
  MIN_RESIZE_SIZE,
} from '../../kernel/interaction/HandleLayout'
import type { ResizeHandleRect } from '../../kernel/interaction/HandleLayout'
import { FrameScheduler } from '../../kernel/util/raf'
import type {
  ContextMenuAction,
  ContextMenuContext,
  ContextMenuExtensionConfig,
  ContextMenuItem,
  ContextMenuRenderer,
} from '../../features/context-menu/ContextMenuModel'
import { hitTestCell } from '../../kernel/interaction/HitTest'
import { isTypableEditKey } from '../../features/edit/CellEdit'
import type { PasteSkippedCell } from '../../features/clipboard/types'
import type { BorderPreset, BorderStyle, TextWrapMode, ValueFormat } from '../../kernel/protocol/FormatTypes'
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
import type { Drag } from '../interaction/drag/Drag'
import type { DomClipboardAdapter } from '../clipboard/DomClipboardAdapter'
import { computeFillHandleRect, computeRangeOverlayRects } from '../overlay/RangeOverlayRects'
import { ColumnHeaderDrag } from '../interaction/drag/ColumnHeaderDrag'
import { FillHandleDrag } from '../interaction/drag/FillHandleDrag'
import { ResizeDrag } from '../interaction/drag/ResizeDrag'
import { RowHeaderDrag } from '../interaction/drag/RowHeaderDrag'
import { SelectionDrag } from '../interaction/drag/SelectionDrag'
import type { WebHost, WebKeyboardEvent, WebPointerEvent } from '../host/Host'
import type { RenderBackend } from '../../ports/RenderBackend'
import type { CellActionHit } from '../../ports/RenderBackend'
import type { NativeScrollSource } from '../scroll/NativeScroller'
import type {
  CellEditor,
  CellEditorRegistry,
  CellEditorTrigger,
} from '../interaction/CellEditorContract'
import type { CellTypeDefinition, CellTypeOverride, CellTypeRegistry } from '../../features/cell-types'

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

const DRAG_AUTO_SCROLL_KEY = 'drag:auto-scroll'
const DRAG_AUTO_SCROLL_EDGE_PX = 32
const DRAG_AUTO_SCROLL_MAX_STEP_PX = 24

/** 可驱动边缘自动滚动的拖拽种类。 */
type AutoScrollDragKind = 'active-drag'

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
  /** 最近一次 selection drag 的 pointer，用于边缘自动滚动续帧。 */
  private lastDragPointer: WebPointerEvent | null = null
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
  /** DOM 单元格编辑器。 */
  private cellEditor?: DomCellEditor
  /** Custom editor overlay 的 DOM 宿主。 */
  private editorContainer: HTMLElement
  /** 自定义单元格编辑器注册表；key 为 `Field.type`。 */
  private cellEditors: CellEditorRegistry = {}
  /** 自定义单元格类型语义注册表；key 为 `Field.type`。 */
  private cellTypes: CellTypeRegistry = {}
  /** 当前由 custom editor registry 打开的 overlay。 */
  private activeCustomEditor: CellEditor | null = null
  /** Custom editor 不一定能进入 engine edit model；runtime 用该帧标记让 canvas 跳过原 cell 文本。 */
  private activeCustomEditorCellEdit: RuntimeCellEdit | null = null
  /** 当前 custom editor 会话 token；reopen/close 后旧 ctx 回调必须失效。 */
  private activeCustomEditorToken: number | null = null
  private nextCustomEditorToken = 1
  /** filter/rowHeight/columnWidth popover 域 controller（GridRuntime 拆分 Task 5）。 */
  private popovers: PopoverController
  /** host/行头/列头右键菜单路由、action 分发、hover 菜单按钮 controller（GridRuntime 拆分 Task 6）。 */
  private contextMenu: ContextMenuController
  /** 剪贴板 copy/cut/paste + undo/redo 域 controller（GridRuntime 拆分 Task 4）。 */
  private clipboard: ClipboardController
  /** fill handle 提交成功后的通知回调。 */
  private onFill?: (event: FillEvent) => void
  /** 选区变化通知回调。 */
  private onSelectionChange?: (selection: GridSelection) => void
  /**
   * 多行 wrap 字段编辑中的原始行高快照——取消时恢复，提交时丢弃。
   * 非 multiline 编辑置 null。
   */
  private editingMultilineOriginalRowHeight: number | null = null
  /** 当前活跃的 Drag（R1 DragController）；pointerdown 起拖时设置。 */
  private activeDrag: Drag | null = null
  /** 行高/列宽 resize 拖拽。 */
  private resizeDrag!: ResizeDrag
  /** 列表头拖拽（reorder + 表头拖选）；构造函数注入 deps。 */
  private columnHeaderDrag!: ColumnHeaderDrag
  /** 行表头拖拽（reorder + 表头拖选）；构造函数注入 deps。 */
  private rowHeaderDrag!: RowHeaderDrag
  /** 填充柄拖拽。 */
  private fillHandleDrag!: FillHandleDrag
  /** 普通单元格拖选。 */
  private selectionDrag!: SelectionDrag
  /** pointerdown 按序尝试起拖的 Drag 列表；加新拖拽 = 实现 Drag + 入此数组。 */
  private drags: readonly Drag[] = []

  /** 创建 runtime 并保存 backend 注入的 engine/host/renderer/layer 依赖。 */
  constructor(opts: GridRuntimeOptions) {
    this.engine = opts.engine
    this.host = opts.host
    this.renderer = opts.renderer
    this.editorContainer = opts.container ?? document.createElement('div')
    this.cellEditors = opts.cellEditors ?? {}
    this.cellTypes = opts.cellTypes ?? {}
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
        this.closeActiveCustomEditor()
        this.syncCellEditorPosition()
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
      augmentFrame: (frame) =>
        this.activeCustomEditorCellEdit && !frame.cellEdit
          ? { ...frame, cellEdit: this.activeCustomEditorCellEdit }
          : frame,
      syncSelectionOverlay: (frame) => this.syncSelectionOverlay(frame),
      syncDomLayers: (frame) => {
        this.syncResizeHandles(frame)
        this.syncFillHandle(frame)
        this.syncHideToggleHandles(frame)
        this.syncHideColToggleHandles(frame)
        this.syncCellEditorPosition(frame)
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
      isDragActive: () => this.resizeDrag.active || !!this.activeDrag?.active,
      isCellEditing: () => this.engine.isCellEditing(),
      commitCellEdit: (moveAfter) => this.commitCellEdit(moveAfter),
      hitTestColumnHeader: (event) => this.hitTestColumnHeader(event),
      clipboardCopy: () => this.handleClipboardCopy(),
      clipboardCut: () => this.handleClipboardCut(),
      clipboardPaste: () => this.handleClipboardPaste(),
      openFilterPopover: (ctx, anchor) => this.popovers.openFilterPopover(ctx, anchor),
      openRowHeightPopover: (rowIds, anchor) => this.popovers.openRowHeightPopover(rowIds, anchor),
      openColumnWidthPopover: (fieldIds, anchor) => this.popovers.openColumnWidthPopover(fieldIds, anchor),
      insertRows: (beforeUnderlyingRow, count) => this.insertRows(beforeUnderlyingRow, count),
      deleteRows: (underlyingRowIds) => this.deleteRows(underlyingRowIds),
      hideRows: (underlyingRowIds) => this.hideRows(underlyingRowIds),
      unhideRows: (underlyingRowIds) => this.unhideRows(underlyingRowIds),
      insertCols: (beforeFieldIndex, count) => this.insertCols(beforeFieldIndex, count),
      deleteCols: (fieldIds) => this.deleteCols(fieldIds),
      hideCols: (fieldIds) => this.hideCols(fieldIds),
      unhideCols: (fieldIds) => this.unhideCols(fieldIds),
    })
    if (opts.contextMenuRenderer) {
      this.contextMenu.setRenderer(opts.contextMenuRenderer)
    }
    if (opts.excelWorkspace) {
      this.excelWorkspace = new ExcelWorkspaceBinding({
        policy: typeof opts.excelWorkspace === 'object' ? opts.excelWorkspace.policy : undefined,
        deps: { engine: this.engine, afterEngineMutation: () => this.afterEngineMutation() },
      })
    }
    this.resizeDrag = new ResizeDrag({
      engine: this.engine,
      handleLayer: this.handleLayer,
      afterEngineMutation: () => this.afterEngineMutation(),
    })
    this.columnHeaderDrag = new ColumnHeaderDrag({
      engine: this.engine,
      host: this.host,
      overlay: this.columnReorderOverlay,
      refresh: () => this.refresh(),
      afterEngineMutation: () => this.afterEngineMutation(),
      closeContextMenu: () => this.contextMenu.close(),
      requestAutoScroll: (pointer) => this.requestDragAutoScroll(pointer),
      stopAutoScroll: () => this.stopDragAutoScroll(),
      isBlocked: () => this.isDragBlocked(),
      hitTestColumnHeader: (event) => this.hitTestColumnHeader(event),
      isWholeColumnSelection: (range) => this.isWholeColumnSelection(range),
      selectWholeColumn: (col) => this.selectWholeColumn(col),
      selectWholeColumnRange: (anchor, extent) => this.selectWholeColumnRange(anchor, extent),
      getColsTotalSize: () => this.viewport.getColsTotalSizeForFrame(this.engine.getFrame()),
    })
    this.rowHeaderDrag = new RowHeaderDrag({
      engine: this.engine,
      host: this.host,
      overlay: this.rowReorderOverlay,
      refresh: () => this.refresh(),
      afterEngineMutation: () => this.afterEngineMutation(),
      closeContextMenu: () => this.contextMenu.close(),
      requestAutoScroll: (pointer) => this.requestDragAutoScroll(pointer),
      stopAutoScroll: () => this.stopDragAutoScroll(),
      isBlocked: () => this.isDragBlocked(),
      hitTestRowHeader: (event) => this.hitTestRowHeader(event),
      isWholeRowSelection: (range) => this.isWholeRowSelection(range),
      selectWholeRowRange: (anchor, extent) => this.selectWholeRowRange(anchor, extent),
    })
    this.fillHandleDrag = new FillHandleDrag({
      engine: this.engine,
      host: this.host,
      fillLayer: this.fillLayer,
      afterEngineMutation: () => this.afterEngineMutation(),
      autofitRows: (options) => this.autofitRows(options),
      onFill: (event) => this.onFill?.(event),
      closeContextMenu: () => this.contextMenu.close(),
      commitCellEdit: (moveSelection) => this.commitCellEdit(moveSelection),
      requestAutoScroll: (pointer) => this.requestDragAutoScroll(pointer),
      stopAutoScroll: () => this.stopDragAutoScroll(),
      isBlocked: () => this.isDragBlocked(),
    })
    this.selectionDrag = new SelectionDrag({
      engine: this.engine,
      refresh: () => this.refresh(),
      requestAutoScroll: (pointer) => this.requestDragAutoScroll(pointer),
      stopAutoScroll: () => this.stopDragAutoScroll(),
      syncFillHandle: () => this.syncFillHandle(),
      isBlocked: () => this.isDragBlocked(),
    })
    this.drags = [this.columnHeaderDrag, this.rowHeaderDrag, this.selectionDrag]
  }

  private isDragBlocked(): boolean {
    return this.resizeDrag.active || !!this.activeDrag
  }

  /** 起拖期间记录 pointer 并按边缘热区驱动自动滚动（供 Drag 经 deps 调用）。 */
  private requestDragAutoScroll(pointer: WebPointerEvent): void {
    this.lastDragPointer = pointer
    this.updateDragAutoScroll(pointer)
  }

  /** Phase 3.5 — backend 在 runtime 创建后注入编辑器。 */
  setCellEditor(editor: DomCellEditor): void {
    this.cellEditor = editor
    this.syncCellEditorTheme()
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

  /** Phase 4.5 — 取消隐藏指定底层行，刷新视图。 */
  unhideRows(underlyingRowIds: readonly number[]): void {
    if (this.destroyed) return
    this.engine.unhideRows(underlyingRowIds)
    this.afterEngineMutation()
  }

  /** Phase 4.5 — 返回当前隐藏行 id 升序数组。 */
  getHiddenRows(): readonly number[] {
    return this.engine.getHiddenRows()
  }

  /** Phase 4.5 — 在 beforeUnderlyingRow 位置前插入 count 行，刷新视图并返回新行 id。 */
  insertRows(beforeUnderlyingRow: number, count: number): readonly number[] {
    if (this.destroyed) return []
    const ids = this.engine.insertRows(beforeUnderlyingRow, count)
    this.afterEngineMutation()
    return ids
  }

  /** Phase 4.5 — 删除给定 underlying row id 集合（升序、去重），刷新视图。 */
  deleteRows(underlyingRowIds: readonly number[]): void {
    if (this.destroyed) return
    this.engine.deleteRows(underlyingRowIds)
    this.afterEngineMutation()
  }

  /** Phase 4.5 — 隐藏给定 underlying row id 集合，刷新视图。 */
  hideRows(underlyingRowIds: readonly number[]): void {
    if (this.destroyed) return
    this.engine.hideRows(underlyingRowIds)
    this.afterEngineMutation()
  }

  /** Phase 4.5 — 批量将多行高度设置为同一值 h，刷新视图。 */
  setRowHeights(rowIds: readonly number[], h: number): void {
    if (this.destroyed) return
    this.engine.setRowHeights(rowIds, h)
    this.afterEngineMutation()
  }

  /** Phase 4.5 — 程序化设置选区（不入 undo 栈），刷新视图。 */
  setSelection(selection: GridSelection): void {
    if (this.destroyed) return
    this.engine.setSelection(selection)
    this.afterEngineMutation()
  }

  /** Phase 5-A — 返回当前选区，供外部工具栏按任意选区操作。 */
  getSelection(): GridSelection {
    return this.engine.getSelection()
  }

  /** Phase 4.6 — 在 schema field index 前插入 count 个列字段，刷新视图并返回新字段。 */
  insertCols(beforeFieldIndex: number, count: number): readonly Field[] {
    if (this.destroyed) return []
    const fields = this.engine.insertCols(beforeFieldIndex, count)
    this.afterEngineMutation()
    return fields
  }

  /** Phase 4.6 — 按 fieldId 删除列字段，刷新视图。 */
  deleteCols(fieldIds: readonly string[]): void {
    if (this.destroyed) return
    this.engine.deleteCols(fieldIds)
    this.afterEngineMutation()
  }

  /** Phase 4.6 — 隐藏给定 fieldId 集合，刷新视图。 */
  hideCols(fieldIds: readonly string[]): void {
    if (this.destroyed) return
    this.engine.hideCols(fieldIds)
    this.afterEngineMutation()
  }

  /** Phase 4.6 — 取消隐藏给定 fieldId 集合，刷新视图。 */
  unhideCols(fieldIds: readonly string[]): void {
    if (this.destroyed) return
    this.engine.unhideCols(fieldIds)
    this.afterEngineMutation()
  }

  /** Phase 4.6 — 批量将多列宽度设置为同一值，刷新视图。 */
  setColumnWidths(fieldIds: readonly string[], widthPx: number): void {
    if (this.destroyed) return
    this.engine.setColumnWidths(fieldIds, widthPx)
    this.afterEngineMutation()
  }

  /** Phase 4.6 — 返回当前隐藏列 fieldId。 */
  getHiddenCols(): readonly string[] {
    return this.engine.getHiddenCols()
  }

  /** Phase 4.7 — 按 fieldId 移动连续列组。 */
  moveCols(fieldIds: readonly string[], beforeFieldId: string | null): boolean {
    if (this.destroyed) return false
    const changed = this.engine.moveCols(fieldIds, beforeFieldId)
    if (changed) this.afterEngineMutation()
    return changed
  }

  /** Phase 5-A — 为 view `range` 设置填充色；变化时刷新视图。 */
  setFillColor(range: CellRange, color: string | null): boolean {
    if (this.destroyed) return false
    const changed = this.engine.setFillColor(range, color)
    if (changed) this.afterEngineMutation()
    return changed
  }

  /** Phase 5-A — 为 view `range` 设置基础边框；变化时刷新视图。 */
  setBorders(range: CellRange, preset: BorderPreset, border: BorderStyle | null): boolean {
    if (this.destroyed) return false
    const changed = this.engine.setBorders(range, preset, border)
    if (changed) this.afterEngineMutation()
    return changed
  }

  /** 设置 view `range` 值格式（Phase 5-C）；变化时刷新视图。 */
  setValueFormat(range: CellRange, valueFormat: ValueFormat): boolean {
    if (this.destroyed) return false
    const changed = this.engine.setValueFormat(range, valueFormat)
    if (changed) this.afterEngineMutation()
    return changed
  }

  /** 为 view `range` 设置单元格类型覆盖；变化时刷新视图。 */
  setCellType(range: CellRange, type: CellTypeOverride): boolean {
    if (this.destroyed) return false
    const changed = this.engine.setCellType(range, type)
    if (changed) this.afterEngineMutation()
    return changed
  }

  /** 清除 view `range` 的单元格类型覆盖；变化时刷新视图。 */
  clearCellType(range: CellRange): boolean {
    if (this.destroyed) return false
    const changed = this.engine.clearCellType(range)
    if (changed) this.afterEngineMutation()
    return changed
  }

  /** 为 view range 设置验证规则。 */
  setValidation(range: CellRange, rule: import('../../kernel/protocol/ValidationTypes').ValidationRule): void {
    if (this.destroyed) return
    const rawRange = this.engine.viewRangeToRaw(range)
    if (rawRange) {
      this.engine.setValidationRule(rawRange, rule)
    }
  }

  /** 清除 view range 的区间验证规则。 */
  clearValidation(range: CellRange): void {
    if (this.destroyed) return
    const rawRange = this.engine.viewRangeToRaw(range)
    if (rawRange) {
      this.engine.clearValidationRule(rawRange)
    }
  }

  /** 给 raw cell 写扩展附件；变化时刷新视图并返回 true。 */
  setCellAttachment(namespace: string, rawRow: number, rawCol: number, data: unknown): boolean {
    if (this.destroyed) return false
    const changed = this.engine.setCellAttachment(namespace, rawRow, rawCol, data)
    if (changed) this.afterEngineMutation()
    return changed
  }

  /** 读 raw cell 的扩展附件；无则 undefined。 */
  getCellAttachment(namespace: string, rawRow: number, rawCol: number): unknown {
    if (this.destroyed) return undefined
    return this.engine.getCellAttachment(namespace, rawRow, rawCol)
  }

  /** 读 raw 坐标单元格文本（String(value)，空为 ''）。cell-kit selection-bold adapter 用。 */
  getCellText(rawRow: number, rawCol: number): string {
    if (this.destroyed) return ''
    const data = this.engine.getData()
    const field = data.getSchema().fields[rawCol]
    if (!field) return ''
    const value = data.getCell(rawRow, field.id)
    return value == null ? '' : String(value)
  }

  /** 为 view `range` 设置文本显示模式（overflow/wrap/clip）；变化时刷新视图。 */
  setTextWrap(range: CellRange, mode: TextWrapMode): boolean {
    if (this.destroyed) return false
    const changed = this.engine.setTextWrap(range, mode)
    if (changed) this.afterEngineMutation()
    return changed
  }

  /** Phase 5-A — 合并 view `range`；成功时刷新视图。 */
  mergeCells(range: CellRange): boolean {
    if (this.destroyed) return false
    const changed = this.engine.mergeCells(range)
    if (changed) this.afterEngineMutation()
    return changed
  }

  /** Phase 5-A — 取消 view `range` 触及的合并区域；移除任意区域则刷新视图。 */
  unmergeCells(range: CellRange): boolean {
    if (this.destroyed) return false
    const changed = this.engine.unmergeCells(range)
    if (changed) this.afterEngineMutation()
    return changed
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
    this.syncCellEditorTheme()
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
    this.syncCellEditorTheme()
    this.contextMenu.applyTheme(theme)
    this.popovers.applyTheme(theme)
    this.selectionOverlay?.applyTheme(theme)
    this.afterEngineMutation()
  }

  /** 设置单行高度并同步滚动空间与渲染。 */
  setRowHeight(rowIndex: number, height: number): void {
    this.engine.setRowHeight(rowIndex, height)
    this.afterEngineMutation()
  }

  /** 设置单列宽度并同步滚动空间与渲染。 */
  setColumnWidth(fieldId: string, width: number): void {
    this.engine.setColumnWidth(fieldId, width)
    this.afterEngineMutation()
  }

  setFrozen(config: Partial<FrozenConfig>): void
  /** 设置冻结行列配置并刷新视图。 */
  setFrozen(config: Partial<FrozenConfig>): void {
    this.engine.setFrozen(config)
    this.afterEngineMutation()
  }

  /** 请求一帧异步重绘。 */
  refresh(): void {
    this.invalidate()
  }

  /** 程序化打开单元格编辑器；custom editor 的 trigger 为 `api`。 */
  openCellEditor(rowIndex: number, fieldId: string): boolean {
    if (this.destroyed) return false
    const colIndex = this.engine.getColumnIndex(fieldId)
    if (colIndex < 0) return false
    return this.openCellEditorForTrigger({
      cell: { rowIndex, colIndex },
      trigger: 'api',
      selectAll: false,
    })
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
    this.closeActiveCustomEditor()
    this.fillLayer?.hidePreview()
    this.activeDrag = null
  }

  /** 滚动到指定行，并按给定对齐方式放入 viewport。 */
  scrollToRow(rowIndex: number, align?: 'start' | 'center' | 'end'): void {
    this.viewport.scrollToRow(rowIndex, align)
  }

  /** 滚动到指定单元格的左上角。 */
  scrollToCell(rowIndex: number, fieldId: string): void {
    this.viewport.scrollToCell(rowIndex, fieldId)
  }

  /** 开始鼠标/触控 resize 拖拽并显示尺寸指示线。 */
  handleResizePointerDown(
    handle: ResizeHandleRect,
    pointerId: number,
    clientX: number,
    clientY: number,
  ): void {
    if (this.destroyed) return
    if (this.resizeDrag.start(handle, pointerId, clientX, clientY)) {
      this.activeDrag = this.resizeDrag
    }
  }

  /** 更新 resize 拖拽预览尺寸。 */
  handleResizePointerMove(pointerId: number, clientX: number, clientY: number): void {
    if (this.destroyed) return
    this.resizeDrag.movePointer(pointerId, clientX, clientY)
  }

  /** 结束 resize 拖拽并一次性提交行高/列宽变更。 */
  handleResizePointerUp(pointerId: number): void {
    if (!this.resizeDrag.commitPointer(pointerId)) return
    this.activeDrag = null
  }

  /** 开始 fill handle 拖拽。 */
  handleFillPointerDown(pointerId: number, clientX: number, clientY: number): void {
    if (this.destroyed) return
    if (this.fillHandleDrag.tryStartFromClient(pointerId, clientX, clientY)) {
      this.activeDrag = this.fillHandleDrag
    }
  }

  /** 更新 fill handle 拖拽目标与预览 overlay。 */
  handleFillPointerMove(pointerId: number, clientX: number, clientY: number): void {
    if (this.destroyed) return
    this.fillHandleDrag.moveFromClient(pointerId, clientX, clientY)
  }

  /** 结束 fill handle 拖拽并提交填充结果。 */
  handleFillPointerUp(pointerId: number): void {
    if (!this.fillHandleDrag.commitPointer(pointerId)) return
    this.activeDrag = null
    this.columnReorderOverlay?.hide()
    this.rowReorderOverlay?.hide()
  }

  /** 同步编辑器 draft 到 engine 的 cell edit session。 */
  handleCellEditDraft(draft: string): void {
    if (this.destroyed) return
    this.engine.updateCellEditDraft(draft)
  }

  /** 处理 Enter 提交编辑，并在成功后移动到下一行。 */
  handleCellEditCommitEnter(): void {
    this.commitCellEdit(true)
  }

  /** 处理 blur 提交编辑，保持当前选区不移动。 */
  handleCellEditCommitBlur(): void {
    this.commitCellEdit(false)
  }

  /** 取消当前编辑并刷新编辑器/选区显示。 */
  handleCellEditCancel(): void {
    if (this.destroyed) return
    this.cancelCellEdit()
    this.refresh()
  }

  /** 处理键盘 resize，按 delta 调整行高或列宽。 */
  handleResizeKeyboard(handle: ResizeHandleRect, delta: number): void {
    if (this.destroyed) return
    const current = this.readResizeSize(handle)
    if (current === null) return
    const next = Math.max(MIN_RESIZE_SIZE, current + delta)
    if (next === current) return
    if (handle.kind === 'row' && handle.rowIndex !== undefined) {
      this.engine.commitRowResize(handle.rowIndex, current, next)
    } else if (handle.kind === 'column' && handle.fieldId) {
      const colIndex = this.engine.getColumnIndex(handle.fieldId)
      if (colIndex < 0) return
      this.engine.commitColumnResize(colIndex, current, next)
    }
    this.syncResizeHandles()
    this.refresh()
  }

  /** 销毁 runtime、renderer、host，并取消所有 pending scheduler task。 */
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.engine.dispose()
    this.closeActiveCustomEditor()
    this.cancelCellEdit()
    this.activeDrag?.cancel()
    this.activeDrag = null
    this.fillLayer?.hidePreview()
    this.columnReorderOverlay?.hide()
    this.rowReorderOverlay?.hide()
    for (const editor of Object.values(this.cellEditors)) editor.destroy?.()
    this.flush.destroy()
    this.viewport.destroy()
    this.scheduler.cancel(DRAG_AUTO_SCROLL_KEY)
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

  /** 处理 host pointerdown，开始单元格选择或扩展选择。 */
  handleHostPointerDown(event: WebPointerEvent): void {
    if (this.destroyed) return
    // 仅左键进入 drag-select；右键 / 中键留给 contextmenu / 其它路径
    if ((event.button ?? 0) !== 0) return
    this.closeActiveCustomEditor()
    if (this.engine.isCellEditing()) {
      this.commitCellEdit(false)
    }
    const action = this.renderer.getCellActionAt?.(event.x, event.y)
    if (action) {
      this.invokeCellAction(action)
      return
    }
    // 列头菜单按钮命中：左键单击时优先打开列头菜单，不进入 drag-select
    const menuButtonHit = this.contextMenu.hitTestColumnHeaderMenuButton(event)
    if (menuButtonHit) {
      this.contextMenu.openColumnHeaderContextMenu(menuButtonHit.colIndex, event)
      return
    }
    for (const drag of this.drags) {
      if (drag.tryStart(event)) {
        this.activeDrag = drag
        return
      }
    }
  }

  /** 处理 host pointermove，更新拖拽选区并启动边缘自动滚动。 */
  handleHostPointerMove(event: WebPointerEvent): void {
    if (this.activeDrag?.move(event)) return
    if (this.destroyed) return
    this.updateHeaderCursor(event)
    this.updateValidationTooltip(event)
    this.contextMenu.updateHoveredColumnHeaderMenu(event)
  }

  private updateValidationTooltip(event: WebPointerEvent): void {
    if (!this.validationTooltip) return
    const frame = this.engine.getFrame()
    const hit = hitTestCell(frame, event)
    if (!hit) { this.validationTooltip.hide(); return }
    const state = frame.getValidationState?.(hit.rowIndex, hit.colIndex)
    if (state !== 'invalid') { this.validationTooltip.hide(); return }
    const rawRow = this.engine.viewRowToRaw(hit.rowIndex)
    const rawCol = this.engine.viewColToRaw(hit.colIndex)
    const result = this.engine.getValidationState(rawRow, rawCol)
    if (!result || result.status !== 'invalid') { this.validationTooltip.hide(); return }
    const cellRect = this.computeValidationCellRect(hit.rowIndex, hit.colIndex, frame)
    if (!cellRect) { this.validationTooltip.hide(); return }
    const hostRect = this.host.getContainerBoundingRect()
    const { width: containerWidth } = this.host.getContainerSize()
    const containerRect = { left: hostRect.left, top: hostRect.top, width: containerWidth }
    this.validationTooltip.show(result.message, cellRect, containerRect)
  }

  private computeValidationCellRect(
    viewRow: number,
    viewCol: number,
    frame: ReturnType<GridEngine['getFrame']>,
  ): { left: number; right: number; top: number; width: number; height: number } | null {
    const { rowsAxis, colsAxis, viewport } = frame
    const region = viewport.regions.find(
      (r) =>
        viewRow >= r.rowRange[0] &&
        viewRow <= r.rowRange[1] &&
        viewCol >= r.colRange[0] &&
        viewCol <= r.colRange[1],
    )
    if (!region) return null
    const x = colsAxis.indexToPosition(viewCol) - region.scrollOffsetX + region.rect.x
    const y = rowsAxis.indexToPosition(viewRow) - region.scrollOffsetY + region.rect.y
    const cellWidth = colsAxis.getSize(viewCol)
    const cellHeight = rowsAxis.getSize(viewRow)
    const hostRect = this.host.getContainerBoundingRect()
    return {
      left: hostRect.left + x,
      right: hostRect.left + x + cellWidth,
      top: hostRect.top + y,
      width: cellWidth,
      height: cellHeight,
    }
  }

  /** 处理 host pointerup，结束选区拖拽并恢复 fill handle。 */
  handleHostPointerUp(): void {
    if (this.activeDrag) {
      this.activeDrag.commit()
      this.activeDrag = null
      return
    }
  }

  /** 处理双击单元格，进入编辑模式。 */
  handleHostDoubleClick(event: WebPointerEvent): void {
    if (this.destroyed || this.resizeDrag.active || this.activeDrag?.active) return
    const hit = hitTestCell(this.engine.getFrame(), event)
    if (!hit) return
    this.engine.selectCell(hit)
    this.openCellEditorForTrigger({ cell: hit, trigger: 'double-click', selectAll: false })
  }

  /** Phase 3.3 / 3.5 — 导航；选中后直接键入进入编辑（Sheets 式）。 */
  handleHostKeyDown(event: WebKeyboardEvent): boolean {
    if (this.destroyed) return false
    if (event.key === 'Escape' && this.activeDrag) {
      this.activeDrag.cancel()
      this.activeDrag = null
      return true
    }
    if (this.popovers.isFilterPopoverOpen()) return false
    if (this.engine.isCellEditing()) return false

    // Phase 4.1 — Ctrl+X / C / V（Mac 上 Cmd）剪贴板快捷键；Shift / Alt 组合不抢
    const mod = event.ctrlKey || event.metaKey
    if (mod && !event.shiftKey && !event.altKey) {
      const k = event.key.toLowerCase()
      if (k === 'c') {
        void this.handleClipboardCopy()
        return true
      }
      if (k === 'x') {
        void this.handleClipboardCut()
        return true
      }
      if (k === 'v') {
        void this.handleClipboardPaste()
        return true
      }
      if (k === 'z') {
        if (!this.engine.canUndo()) return false
        this.undo()
        return true
      }
      if (k === 'y' && event.ctrlKey && !event.metaKey) {
        if (!this.engine.canRedo()) return false
        this.redo()
        return true
      }
    }

    // Cmd/Ctrl+Shift+Z — redo
    if (mod && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'z') {
      if (!this.engine.canRedo()) return false
      this.redo()
      return true
    }

    const cell = this.engine.getSelection().activeCell

    if (event.key === 'F2' && cell) {
      if (this.openCellEditorForTrigger({ cell, trigger: 'f2', selectAll: false })) return true
    }

    if (event.key === 'Enter' && cell && this.hasCustomCellEditor(cell)) {
      if (this.openCellEditorForTrigger({ cell, trigger: 'enter', selectAll: false })) return true
    }

    if (
      cell &&
      isTypableEditKey(event.key, {
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
      })
    ) {
      if (
        this.openCellEditorForTrigger({
          cell,
          trigger: 'typing',
          initialInput: event.key,
          selectAll: false,
        })
      ) {
        return true
      }
    }

    if (!this.engine.navigateSelection(event.key, event.shiftKey)) return false

    const focus = this.viewport.getSelectionScrollTarget()
    if (focus) this.viewport.ensureCellVisible(focus)
    this.refresh()
    return true
  }

  /** 取消正在排队的拖拽自动滚动并清掉 pointer 记录。 */
  private stopDragAutoScroll(): void {
    this.scheduler.cancel(DRAG_AUTO_SCROLL_KEY)
    this.lastDragPointer = null
  }

  private updateHeaderCursor(event: WebPointerEvent): void {
    if (this.resizeDrag.active || this.activeDrag?.active) {
      this.host.setCursor(null)
      return
    }
    const hit = this.hitTestColumnHeader(event)
    const range = this.engine.getSelection().selectedRange
    const canDrag =
      hit &&
      range &&
      this.isWholeColumnSelection(range) &&
      hit.colIndex >= range.startCol &&
      hit.colIndex <= range.endCol
    if (canDrag) {
      this.host.setCursor('grab')
      return
    }

    const rowHit = this.hitTestRowHeader(event)
    const rowRange = this.engine.getSelection().selectedRange
    const canRowDrag =
      rowHit &&
      rowRange &&
      this.isWholeRowSelection(rowRange) &&
      rowHit.rowIndex >= rowRange.startRow &&
      rowHit.rowIndex <= rowRange.endRow
    this.host.setCursor(canRowDrag ? 'grab' : null)
  }

  private isWholeColumnSelection(range: CellRange): boolean {
    const rowCount = this.engine.getFrame().data.getRowCount()
    return rowCount > 0 && range.startRow === 0 && range.endRow === rowCount - 1
  }

  private isWholeRowSelection(range: CellRange): boolean {
    const colCount = this.engine.getFrame().data.getSchema().fields.length
    return colCount > 0 && range.startCol === 0 && range.endCol === colCount - 1
  }

  private hitTestColumnHeader(
    event: WebPointerEvent,
  ): { colIndex: number; fieldId: string } | null {
    const frame = this.engine.getFrame()
    const headerHeight = frame.viewport.headerHeight ?? frame.theme.metrics.headerHeight
    if (event.y < 0 || event.y >= headerHeight) return null
    const rowHeaderWidth = frame.viewport.rowHeaderWidth ?? 0
    if (event.x < rowHeaderWidth) return null
    const scrollX = frame.viewport.scrollX ?? 0
    const logicalX = event.x - rowHeaderWidth + scrollX
    const totalSize = this.viewport.getColsTotalSizeForFrame(frame)
    if (logicalX < 0 || logicalX >= totalSize) return null
    const colIndex = frame.colsAxis.positionToIndex(logicalX)
    if (typeof frame.data.getSchema !== 'function') return null
    const field = frame.data.getSchema().fields[colIndex]
    if (!field) return null
    return { colIndex, fieldId: field.id }
  }

  private hitTestRowHeader(event: WebPointerEvent): { rowIndex: number } | null {
    const frame = this.engine.getFrame()
    const rowHeaderWidth = frame.viewport.rowHeaderWidth ?? 0
    if (rowHeaderWidth <= 0 || event.x < 0 || event.x >= rowHeaderWidth) return null
    const headerHeight = frame.viewport.headerHeight ?? frame.theme.metrics.headerHeight
    if (event.y < headerHeight) return null
    const scrollY = frame.viewport.scrollY ?? 0
    const logicalY = event.y - headerHeight + scrollY
    if (logicalY < 0) return null
    const rowIndex = frame.rowsAxis.positionToIndex(logicalY)
    if (rowIndex < 0 || rowIndex >= frame.rowsAxis.getCount()) return null
    return { rowIndex }
  }

  private selectWholeColumn(colIndex: number): void {
    this.selectWholeColumnRange(colIndex, colIndex)
  }

  private selectWholeColumnRange(anchorCol: number, extentCol: number): void {
    const frame = this.engine.getFrame()
    const rowCount = frame.data.getRowCount()
    if (rowCount <= 0) return
    const startCol = Math.min(anchorCol, extentCol)
    const endCol = Math.max(anchorCol, extentCol)
    this.engine.setSelection({
      activeCell: { rowIndex: 0, colIndex: extentCol },
      anchorCell: { rowIndex: 0, colIndex: anchorCol },
      extentCell: { rowIndex: rowCount - 1, colIndex: extentCol },
      selectedRange: { startRow: 0, endRow: rowCount - 1, startCol, endCol },
    })
  }

  private selectWholeRowRange(anchorRow: number, extentRow: number): void {
    const frame = this.engine.getFrame()
    const colCount = frame.data.getSchema().fields.length
    if (colCount <= 0) return
    const startRow = Math.min(anchorRow, extentRow)
    const endRow = Math.max(anchorRow, extentRow)
    this.engine.setSelection({
      activeCell: { rowIndex: extentRow, colIndex: 0 },
      anchorCell: { rowIndex: anchorRow, colIndex: 0 },
      extentCell: { rowIndex: extentRow, colIndex: colCount - 1 },
      selectedRange: { startRow, endRow, startCol: 0, endCol: colCount - 1 },
    })
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
    if (!this.handleLayer || this.resizeDrag.active) return
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
    if (this.resizeDrag.active || this.activeDrag?.active || this.engine.isCellEditing()) {
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

  /** 当前驱动边缘自动滚动的拖拽种类；活跃拖拽 / 填充柄优先于普通选区。 */
  private activeAutoScrollDrag(): AutoScrollDragKind | null {
    if (this.activeDrag?.active) return 'active-drag'
    return null
  }

  /** 根据 pointer 位置启动或取消当前拖拽的边缘自动滚动。 */
  private updateDragAutoScroll(pointer: WebPointerEvent): void {
    const kind = this.activeAutoScrollDrag()
    if (!kind) {
      this.scheduler.cancel(DRAG_AUTO_SCROLL_KEY)
      return
    }
    const step = this.computeDragAutoScrollStep(pointer, kind)
    if (step.x === 0 && step.y === 0) {
      this.scheduler.cancel(DRAG_AUTO_SCROLL_KEY)
      return
    }
    this.scheduler.schedule(DRAG_AUTO_SCROLL_KEY, () => this.tickDragAutoScroll())
  }

  /** 执行一帧拖拽自动滚动，按拖拽种类重算落点，并继续调度下一帧。 */
  private tickDragAutoScroll(): void {
    if (this.destroyed || !this.lastDragPointer) return
    const kind = this.activeAutoScrollDrag()
    if (!kind) return
    const step = this.computeDragAutoScrollStep(this.lastDragPointer, kind)
    if (step.x === 0 && step.y === 0) return

    const { scrollTop, scrollLeft } = this.host.getScrollPosition()
    const limits = this.viewport.getScrollLimits()
    const nextTop = clamp(scrollTop + step.y, 0, limits.maxTop)
    const nextLeft = clamp(scrollLeft + step.x, 0, limits.maxLeft)
    if (nextTop === scrollTop && nextLeft === scrollLeft) return

    this.host.scrollTo(nextTop, nextLeft)
    this.handleHostScroll(nextTop, nextLeft)
    this.reevaluateDragAfterAutoScroll(kind, this.lastDragPointer)
  }

  /** 滚动一帧后按拖拽种类重算落点；各 update handler 会自行续调度自动滚动。 */
  private reevaluateDragAfterAutoScroll(kind: AutoScrollDragKind, pointer: WebPointerEvent): void {
    switch (kind) {
      case 'active-drag':
        this.activeDrag?.reevaluate(pointer)
        return
    }
  }

  /**
   * 计算 pointer 靠近 viewport 边缘时每帧应滚动的距离。
   * active-drag 按其 `autoScrollAxis`；选区与填充柄双向。
   */
  private computeDragAutoScrollStep(
    pointer: WebPointerEvent,
    kind: AutoScrollDragKind,
  ): { x: number; y: number } {
    const { width, height } = this.host.getContainerSize()
    let horizontal: boolean
    let vertical: boolean
    if (kind === 'active-drag') {
      const axis = this.activeDrag?.autoScrollAxis ?? null
      horizontal = axis === 'both' || axis === 'horizontal'
      vertical = axis === 'both' || axis === 'vertical'
    } else {
      horizontal = true
      vertical = true
    }
    return {
      x: horizontal ? edgeVelocity(pointer.x, width) : 0,
      y: vertical ? edgeVelocity(pointer.y, height) : 0,
    }
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

  /** 同步 cell editor 主题。 */
  private syncCellEditorTheme(): void {
    this.cellEditor?.applyTheme(this.engine.getTheme())
  }

  /** 所有进入编辑态的 DOM/API 入口先尝试 custom editor，再回退到内置 DOM editor。 */
  private openCellEditorForTrigger(args: {
    readonly cell: CellAddress
    readonly trigger: CellEditorTrigger
    readonly initialInput?: string
    readonly actionId?: string
    readonly selectAll?: boolean
  }): boolean {
    if (this.resizeDrag.active) return false
    if (this.openCustomCellEditor(args)) return true
    this.closeActiveCustomEditor()
    return this.openBuiltInDomEditor(args)
  }

  private resolveRuntimeField(
    frame: RuntimeRenderFrame,
    cell: CellAddress,
  ): {
    readonly cell: CellAddress
    readonly field: Field
    readonly resolvedField: Field
    readonly hasExplicitCellTypeOverride: boolean
  } | null {
    const data = frame.data as Partial<Pick<DataSource, 'getSchema'>>
    const editCell = this.resolveEditCell(frame, cell)
    const field = data.getSchema?.().fields[editCell.colIndex]
    if (!field) return null
    const resolvedType = frame.resolveCellType?.(editCell.rowIndex, editCell.colIndex, field) ?? field.type
    const hasExplicitCellTypeOverride = frame.hasCellTypeOverride?.(editCell.rowIndex, editCell.colIndex) === true
    const resolvedField = resolvedType === field.type ? field : { ...field, type: resolvedType }
    return { cell: editCell, field, resolvedField, hasExplicitCellTypeOverride }
  }

  private resolveCellEditorEntry(
    resolved: NonNullable<ReturnType<GridRuntime['resolveRuntimeField']>>,
  ): { readonly editor: CellEditor; readonly editorField: Field } | null {
    const resolvedEditor = this.cellEditors[resolved.resolvedField.type]
    if (resolvedEditor) {
      return { editor: resolvedEditor, editorField: resolved.resolvedField }
    }
    if (resolved.hasExplicitCellTypeOverride) return null
    const fieldEditor = this.cellEditors[resolved.field.type]
    if (fieldEditor) {
      return { editor: fieldEditor, editorField: resolved.field }
    }
    return null
  }

  private resolveCellTypeDefinitionEntry(
    resolved: NonNullable<ReturnType<GridRuntime['resolveRuntimeField']>>,
  ): { readonly definition: CellTypeDefinition; readonly definitionField: Field } | null {
    const resolvedDefinition = this.cellTypes[resolved.resolvedField.type]
    if (resolvedDefinition) {
      return { definition: resolvedDefinition, definitionField: resolved.resolvedField }
    }
    if (resolved.hasExplicitCellTypeOverride) return null
    const fieldDefinition = this.cellTypes[resolved.field.type]
    if (fieldDefinition) {
      return { definition: fieldDefinition, definitionField: resolved.field }
    }
    return null
  }

  private hasCustomCellEditor(cell: CellAddress): boolean {
    const frame = this.engine.getFrame()
    const resolved = this.resolveRuntimeField(frame, cell)
    return resolved !== null && this.resolveCellEditorEntry(resolved) !== null
  }

  private invokeCellAction(action: CellActionHit): void {
    const frame = this.engine.getFrame()
    const data = frame.data as Partial<Pick<DataSource, 'getCell' | 'getSchema'>>
    const resolved = this.resolveRuntimeField(frame, {
      rowIndex: action.rowIndex,
      colIndex: action.colIndex,
    })
    if (!resolved) return
    const { cell, field } = resolved

    let openEditorPrevented = false
    const value = data.getCell?.(cell.rowIndex, field.id)
    const actionEntry = this.resolveCellTypeDefinitionEntry(resolved)
    actionEntry?.definition.onAction?.({
      field: actionEntry.definitionField,
      locale: 'en-US',
      cell,
      value,
      trigger: 'cell-action',
      rowIndex: cell.rowIndex,
      colIndex: cell.colIndex,
      actionId: action.actionId,
      preventOpenEditor: () => {
        openEditorPrevented = true
      },
      commit: (nextValue) => {
        if (this.engine.commitCellValue(cell, field.id, nextValue)) {
          this.afterEngineMutation()
        }
      },
    })

    if (openEditorPrevented) return
    const opened = this.openCellEditorForTrigger({
      cell,
      trigger: 'cell-action',
      actionId: action.actionId,
      selectAll: false,
    })
    if (!opened) {
      this.engine.selectCell(cell)
      this.afterEngineMutation()
    }
  }

  private openCustomCellEditor(args: {
    readonly cell: CellAddress
    readonly trigger: CellEditorTrigger
    readonly initialInput?: string
    readonly actionId?: string
  }): boolean {
    const frame = this.engine.getFrame()
    const data = frame.data as Partial<Pick<DataSource, 'getCell' | 'getSchema'>>
    const resolved = this.resolveRuntimeField(frame, args.cell)
    if (!resolved) return false
    const { cell, field } = resolved

    const editorEntry = this.resolveCellEditorEntry(resolved)
    if (!editorEntry) return false
    const { editor, editorField } = editorEntry

    const rect = this.computeCellEditorRect(frame, cell)
    if (!rect) return false

    this.closeActiveCustomEditor()
    const value = data.getCell?.(cell.rowIndex, field.id)
    const token = this.nextCustomEditorToken
    this.nextCustomEditorToken += 1
    this.activeCustomEditor = editor
    this.activeCustomEditorCellEdit = {
      cell,
      fieldId: field.id,
      fieldType: editorField.type,
      draft: value == null ? '' : String(value),
    }
    this.activeCustomEditorToken = token
    this.paintSync()
    editor.open({
      cell,
      field: editorField,
      value,
      container: this.editorContainer,
      rect,
      trigger: args.trigger,
      initialInput: args.initialInput,
      actionId: args.actionId,
      commit: (value) => this.commitCustomEditorValue(cell, field, value, editor, token),
      setAttachment: (namespace, data) =>
        this.engine.setCellAttachment(
          namespace,
          this.engine.viewRowToRaw(cell.rowIndex),
          this.engine.viewColToRaw(cell.colIndex),
          data,
        ),
      getAttachment: (namespace) =>
        this.engine.getCellAttachment(namespace, this.engine.viewRowToRaw(cell.rowIndex), this.engine.viewColToRaw(cell.colIndex)),
      cancel: () => this.closeCustomEditor(editor, token),
    })
    return true
  }

  private commitCustomEditorValue(
    cell: CellAddress,
    field: Field,
    value: CellValue | null,
    editor: NonNullable<CellEditorRegistry[string]>,
    token: number,
  ): void {
    if (this.activeCustomEditor !== editor || this.activeCustomEditorToken !== token) return
    if (!this.engine.commitCellValue(cell, field.id, value)) return
    this.closeCustomEditor(editor, token)
    this.afterEngineMutation()
  }

  private closeCustomEditor(editor: CellEditor, token?: number): void {
    if (this.activeCustomEditor !== editor) return
    if (token !== undefined && this.activeCustomEditorToken !== token) return
    this.activeCustomEditor = null
    this.activeCustomEditorCellEdit = null
    this.activeCustomEditorToken = null
    editor.close?.()
    if (!this.destroyed) this.paintSync()
  }

  private closeActiveCustomEditor(): void {
    const editor = this.activeCustomEditor
    if (!editor) return
    this.activeCustomEditor = null
    this.activeCustomEditorCellEdit = null
    this.activeCustomEditorToken = null
    editor.close?.()
    if (!this.destroyed) this.paintSync()
  }

  /** 打开内置 DOM 单元格编辑器，并按需写入初始 draft。 */
  private openBuiltInDomEditor(args: {
    readonly cell: CellAddress
    readonly initialInput?: string
    readonly selectAll?: boolean
  }): boolean {
    if (!this.cellEditor) return false
    if (!this.engine.beginCellEdit(args.cell)) return false
    if (args.initialInput !== undefined) this.engine.updateCellEditDraft(args.initialInput)
    return this.showCellEditor({ selectAll: args.selectAll ?? false })
  }

  /** 根据当前 engine edit session 定位并展示 DOM cell editor。 */
  private showCellEditor(options: { selectAll?: boolean }): boolean {
    const frame = this.engine.getFrame()
    const session = frame.cellEdit
    const rect = session ? this.computeCellEditorRect(frame, session.cell) : null
    if (!session || !rect || !this.cellEditor) {
      this.engine.cancelCellEdit()
      return false
    }

    // 任意非 number 格都用多行编辑器：支持 Alt+Enter 硬换行（与 Google 表格一致），
    // 提交时按内容 autofit 行高。number 仍单行。
    const multiline = session.fieldType !== 'number'

    this.editingMultilineOriginalRowHeight = multiline
      ? this.engine.getRowsAxis().getSize(session.cell.rowIndex)
      : null

    this.paintSync()
    this.cellEditor.open(rect, session.draft, { ...options, multiline })
    return true
  }

  /** 提交当前编辑；可选在提交后移动到下一行。 */
  private commitCellEdit(moveAfter: boolean): void {
    if (!this.engine.isCellEditing()) return
    const session = this.engine.getFrame().cellEdit
    const wasMultiline = this.editingMultilineOriginalRowHeight !== null
    const editedRow = session?.cell.rowIndex
    if (!this.engine.commitCellEdit()) return

    this.editingMultilineOriginalRowHeight = null
    this.cellEditor?.close()
    // 失去焦点（Enter 或 blur 提交）才重算行高——交互成本从 N 键 × autofit 降到 1 次
    if (wasMultiline && editedRow !== undefined) {
      this.autofitRows({ rows: [editedRow] })
    }
    if (moveAfter) {
      this.engine.navigateSelection('ArrowDown', false)
      const focus = this.viewport.getSelectionScrollTarget()
      if (focus) this.viewport.ensureCellVisible(focus)
    }
    this.refresh()
  }

  /** 取消当前编辑，并在 multiline 编辑时恢复原始行高。 */
  private cancelCellEdit(): void {
    if (!this.engine.isCellEditing()) {
      this.cellEditor?.close()
      this.editingMultilineOriginalRowHeight = null
      return
    }
    const session = this.engine.getFrame().cellEdit
    const restoreHeight = this.editingMultilineOriginalRowHeight
    const restoreRow = session?.cell.rowIndex
    this.engine.cancelCellEdit()
    this.cellEditor?.close()
    if (restoreHeight !== null && restoreRow !== undefined) {
      const currentHeight = this.engine.getRowsAxis().getSize(restoreRow)
      if (currentHeight !== restoreHeight) {
        this.engine.setRowHeight(restoreRow, restoreHeight)
        this.afterEngineMutation()
      }
    }
    this.editingMultilineOriginalRowHeight = null
  }

  /** 根据当前单元格 rect 同步编辑器位置；不可见时取消编辑。flush 路径复用已构建的 frame，避免重复 getFrame。 */
  private syncCellEditorPosition(frame?: ReturnType<GridEngine['getFrame']>): void {
    if (!this.cellEditor?.isOpen()) return
    const f = frame ?? this.engine.getFrame()
    const session = f.cellEdit
    if (!session) {
      this.cellEditor.close()
      return
    }
    const rect = this.computeCellEditorRect(f, session.cell)
    if (!rect) {
      this.cancelCellEdit()
      return
    }
    this.cellEditor.syncRect(rect)
  }

  private computeCellEditorRect(frame: ReturnType<GridEngine['getFrame']>, cell: CellAddress) {
    const mergeRange = (frame.mergeRegions ?? []).find(
      (merge) =>
        cell.rowIndex >= merge.range.startRow &&
        cell.rowIndex <= merge.range.endRow &&
        cell.colIndex >= merge.range.startCol &&
        cell.colIndex <= merge.range.endCol,
    )?.range
    if (mergeRange) return computeRangeOverlayRects(frame, mergeRange).at(-1) ?? null
    return computeCellRect(frame, cell)
  }

  private resolveEditCell(
    frame: ReturnType<GridEngine['getFrame']>,
    cell: CellAddress,
  ): CellAddress {
    const merge = (frame.mergeRegions ?? []).find(
      (region) =>
        cell.rowIndex >= region.range.startRow &&
        cell.rowIndex <= region.range.endRow &&
        cell.colIndex >= region.range.startCol &&
        cell.colIndex <= region.range.endCol,
    )
    if (!merge) return cell
    return merge.anchor ?? { rowIndex: merge.range.startRow, colIndex: merge.range.startCol }
  }

  /** 读取 resize handle 对应的当前行高或列宽。 */
  private readResizeSize(handle: ResizeHandleRect): number | null {
    if (handle.kind === 'column' && handle.fieldId) {
      const colIndex = this.engine.getColumnIndex(handle.fieldId)
      if (colIndex < 0) return null
      return this.engine.getColsAxis().getSize(colIndex)
    }
    if (handle.kind === 'row' && handle.rowIndex !== undefined) {
      const { rowIndex } = handle
      if (rowIndex < 0 || rowIndex >= this.engine.getRowsAxis().getCount()) return null
      return this.engine.getRowsAxis().getSize(rowIndex)
    }
    return null
  }
}

/** 计算 pointer 在 viewport 边缘区域内对应的自动滚动速度。 */
function edgeVelocity(position: number, size: number): number {
  if (size <= 0) return 0
  if (position < DRAG_AUTO_SCROLL_EDGE_PX) {
    return -scaleEdgeDistance(DRAG_AUTO_SCROLL_EDGE_PX - position)
  }
  const farEdgeDistance = position - (size - DRAG_AUTO_SCROLL_EDGE_PX)
  if (farEdgeDistance > 0) return scaleEdgeDistance(farEdgeDistance)
  return 0
}

/** 将距离边缘的像素距离缩放为每帧滚动步长。 */
function scaleEdgeDistance(distance: number): number {
  const ratio = Math.min(1, Math.max(0, distance / DRAG_AUTO_SCROLL_EDGE_PX))
  return Math.max(1, Math.ceil(ratio * DRAG_AUTO_SCROLL_MAX_STEP_PX))
}
