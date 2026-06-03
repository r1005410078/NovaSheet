/**
 * WebGridRuntime——Web 侧表格编排器（spec §6 + CLAUDE.md「Per-Grid scheduler」不变量 #5）。
 *
 * 职责：
 *   - 把 `GridEngine`（状态）、`WebHost`（DOM 生命周期）、`WebRenderer`（绘制）、
 *     `ScrollMapper`（逻辑↔DOM 滚动映射）四件套连起来，对外暴露
 *     `setData / setTheme / setRowHeight / setColumnWidth / setFrozen / scrollTo* / refresh / destroy`。
 *   - 拥有**单个** `FrameScheduler`，让 scroll/resize/render 在同一帧里合并（CLAUDE.md 不变量 #5）。
 *   - 隔离 DOM——本类不持有 canvas，也不读 window 全局；所有平台操作走 `WebHost` 回调。
 *
 * 数据流：
 *   scrollHost scroll → handleHostScroll → ScrollMapper → engine.setScroll → renderer.render(frame)
 *
 * 不在职责范围内的：
 *   - canvas/WebGL 上下文（由 `WebRenderer` 实现拥有）
 *   - DOM 节点的创建与销毁（由 `WebHost` 实现拥有）
 *   - 公开 API 面（由 `@novasheet/sheet` 的 `Grid` facade 包一层暴露）
 */

import type {
  AutofitRowsResult,
  DataSource,
  FilterLayer,
  FilterOp,
  Field,
  FrozenConfig,
  GridEngine,
  SheetContext,
  SetViewDataOptions,
  SortLayer,
  TextMeasurer,
  Theme,
  UndoCommand,
  ViewPipeline,
} from '@novasheet/core'
import {
  autofitRowHeights,
  cellInRange,
  clamp,
  createSheetContext,
  computeCellRect,
  mergeVisualRange,
  computeResizeHandles,
  computeScrollReveal,
  FrameScheduler,
  getColumnHeaderContextMenuItems,
  getRowHeaderContextMenuItems,
  hitTestCell,
  MIN_RESIZE_SIZE,
  isTypableEditKey,
  type BorderPreset,
  type BorderStyle,
  type TextWrapMode,
  type CellAddress,
  type CellRange,
  type ColumnHeaderMenuContext,
  type ContextMenuAction,
  type ContextMenuContext,
  type ContextMenuItem,
  type GridSelection,
  type RowHeaderMenuContext,
  type PasteSkippedCell,
  type ResizeHandleRect,
} from '@novasheet/core'
import {
  getWebCellEditorContributions,
  type WebCellEditor,
  type WebCellEditorRuntimeDeps,
} from '../interaction/cell-editor/WebCellEditor'
import type { DomHandleLayer } from '../interaction/DomHandleLayer'
import type { HideToggleHandle } from '../handle/HideToggleHandle'
import type { HideColToggleHandle } from '../handle/HideColToggleHandle'
import type { RowHeightPopover } from '../overlay/RowHeightPopover'
import type { ColumnWidthPopover } from '../overlay/ColumnWidthPopover'
import type { ColumnReorderOverlay } from '../overlay/ColumnReorderOverlay'
import type { RowReorderOverlay } from '../overlay/RowReorderOverlay'
import type { SelectionOverlay } from '../overlay/SelectionOverlay'
import { computeRangeOverlayRects } from '../interaction/RangeOverlayRects'
import type { Drag } from '../interaction/drag/Drag'
import { SelectionDrag } from '../interaction/drag/SelectionDrag'
import {
  getWebDragContributions,
  type FillEvent,
  type WebDragRuntimeDeps,
  type WebFrameSync,
  type WebInteractionStatus,
} from '../interaction/drag/WebDragContribution'
import type { WebHost, WebKeyboardEvent, WebPointerEvent } from '../host/WebHost'
import type { WebRenderer } from '../render/WebRenderer'
import {
  getWebClipboardContributions,
  type WebClipboard,
  type WebClipboardRuntimeDeps,
} from '../clipboard/WebClipboard'
import {
  getWebContextMenuContributions,
  type WebContextMenu,
  type WebContextMenuRuntimeDeps,
} from '../menu/WebContextMenu'
import {
  getWebSortFilterContributions,
  type WebSortFilter,
  type WebSortFilterRuntimeDeps,
} from '../sort-filter/WebSortFilter'
import {
  getWebStructureContributions,
  type WebStructure,
  type WebStructureRuntimeDeps,
} from '../structure/WebStructure'
import {
  getWebMergeCellsContributions,
  type WebMergeCells,
  type WebMergeCellsRuntimeDeps,
} from '../merge-cells/WebMergeCells'
import { ScrollMapper } from '../scroll/ScrollMapper'

/** WebGridRuntime.autofitRows 入参子集（不包含 measurer，runtime 自己持有）。 */
export interface AutofitRowsRuntimeOptions {
  /** 需要重算高度的行；未传则扫描全部行。 */
  rows?: readonly number[]
  /** 自动行高允许写回的最小高度。 */
  minHeight?: number
  /** 自动行高允许写回的最大高度。 */
  maxHeight?: number
}

interface WebResizeDrag extends Drag {
  start(handle: ResizeHandleRect, pointerId: number, clientX: number, clientY: number): boolean
  movePointer(pointerId: number, clientX: number, clientY: number): boolean
  commitPointer(pointerId: number): boolean
}

/** WebGridRuntime 的依赖注入参数，由 backend 装配阶段提供。 */
export interface WebGridRuntimeOptions {
  /** 核心表格状态与 mutation 引擎。 */
  engine: GridEngine
  /** Extension context used to read web runtime feature contributions. */
  context?: SheetContext
  /** Web 平台 host adapter，封装 DOM 生命周期、尺寸与滚动。 */
  host: WebHost
  /** 当前渲染器实现，负责消费 render frame。 */
  renderer: WebRenderer
  /** 每个 grid 独立的 RAF scheduler；未传时 runtime 自建。 */
  scheduler?: FrameScheduler
  /** 调整绘制表面位图（如 HighDPI）；Canvas2D 目前走此回调，`WebRenderer.resize` 仍为过渡 stub。 */
  onSurfaceResize?: (width: number, height: number, dpr: number) => void
  /**
   * 文本量度器（M3 autofit）。`autofitRows()` 调用时必须可用——backend 装配阶段注入。
   * 未注入时 `autofitRows` 直接返回 `{ changedRows: 0, skippedRows: 0 }` 而非抛错，
   * 方便测试场景与未来 backend 选择性禁用 autofit。
   */
  measurer?: TextMeasurer
  /** Phase 3.4 — DOM resize handles；每帧 render 后 sync 位置。 */
  handleLayer?: DomHandleLayer
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
  /** Optional product-layer custom editor hook. */
  openCustomCellEditor?: (cell: CellAddress) => boolean
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

// FillEvent is imported from WebDragContribution; re-export for backwards compat via index.ts.
export type { FillEvent }

/** ResizeObserver 高频回调合并 key（与 `renderer:flush` 分离，同帧内先 resize 再 scroll:read） */
const HOST_RESIZE_KEY = 'host:resize'
const DRAG_AUTO_SCROLL_KEY = 'drag:auto-scroll'
const DRAG_AUTO_SCROLL_EDGE_PX = 32
const DRAG_AUTO_SCROLL_MAX_STEP_PX = 24

/** 可驱动边缘自动滚动的拖拽种类。 */
type AutoScrollDragKind = 'active-drag'

function isWebFrameSync(drag: Drag): drag is Drag & WebFrameSync {
  const c = drag as Partial<WebFrameSync>
  return (
    typeof c.attach === 'function' &&
    typeof c.syncFrame === 'function' &&
    typeof c.destroy === 'function'
  )
}

function isWebResizeDrag(drag: Drag): drag is WebResizeDrag {
  const candidate = drag as Partial<WebResizeDrag>
  return (
    typeof candidate.start === 'function' &&
    typeof candidate.movePointer === 'function' &&
    typeof candidate.commitPointer === 'function'
  )
}

/**
 * Web 端表格编排器（spec §6 `WebGridRuntime`）。
 *
 * 连接 `GridEngine` + `WebHost` + `WebRenderer` + `ScrollMapper`，不持有 canvas DOM。
 * 数据流：scrollHost 滚动 → `ScrollMapper` → `engine.setScroll` → `renderer.render(frame)`。
 *
 * 引擎变更（`setData` 等）后的通用收尾在 `afterEngineMutation()`：
 * 同步 viewport 尺寸、重算 spacer、remap 滚动、触发重绘。
 */
export class WebGridRuntime {
  /** 核心表格状态与 mutation 引擎。 */
  private engine: GridEngine
  /** Runtime extension context used for feature contributions. */
  private readonly context: SheetContext
  /** Web 平台 host adapter，负责 DOM 生命周期、尺寸、滚动与事件入口。 */
  private host: WebHost
  /** 当前渲染器实现。 */
  private renderer: WebRenderer
  /** 每个 grid 独立的帧调度器，用于合并 resize/scroll/render。 */
  private scheduler: FrameScheduler
  /** DOM scroll 与逻辑 scroll 坐标之间的映射器。 */
  private scrollMapper: ScrollMapper
  /** 绘制表面 resize 回调，通常用于同步 canvas bitmap 与 DPR。 */
  private onSurfaceResize?: WebGridRuntimeOptions['onSurfaceResize']
  /** 文本量度器，用于 wrap 字段自动行高。 */
  private measurer?: TextMeasurer
  /** runtime 是否已经销毁；销毁后所有入口都应短路。 */
  private destroyed = false
  /** 最近一次 selection drag 的 pointer，用于边缘自动滚动续帧。 */
  private lastDragPointer: WebPointerEvent | null = null
  /** DOM resize handle layer。 */
  private handleLayer?: DomHandleLayer
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
  /** Product-layer custom editor hook. */
  private openCustomCellEditor?: WebGridRuntimeOptions['openCustomCellEditor']
  /** 编辑器 controller（来自 web.cell-editor 贡献）；命令与定位委托给它。 */
  private cellEditController: (WebCellEditor & WebFrameSync) | null = null
  /** 右键菜单 controller（来自 web.context-menu 贡献）。 */
  private contextMenuController: WebContextMenu | null = null
  /** 排序/筛选 controller（来自 web.sort-filter 贡献）。 */
  private sortFilterController: WebSortFilter | null = null
  /** 行列结构 controller（来自 web.structure 贡献）。 */
  private structureController: WebStructure | null = null
  /** 合并单元格 controller（来自 web.merge-cells 贡献）。 */
  private mergeCellsController: WebMergeCells | null = null
  /** Phase 4.5 行高调整弹层。 */
  private rowHeightPopover?: RowHeightPopover
  /** Phase 4.6 列宽调整弹层。 */
  private columnWidthPopover?: ColumnWidthPopover
  /** resize-row-height 操作暂存的行 id 列表，供 onSubmit 回调读取。 */
  private pendingRowHeightIds: number[] = []
  /** resize-column-width 操作暂存的 fieldId 列表，供 onSubmit 回调读取。 */
  private pendingColumnWidthFieldIds: string[] = []
  /** 外部接管 context menu action 的回调。 */
  private onContextMenuAction?: (action: ContextMenuAction, ctx: ContextMenuContext) => void
  /** 最近一次打开菜单时的上下文，用于菜单项点击分发。 */
  private lastContextMenuContext: ContextMenuContext | null = null
  /** 最近一次打开菜单时的屏幕坐标，用于 filter popover 锚点。 */
  private lastContextMenuPoint: { clientX: number; clientY: number } | null = null
  /** 剪贴板 controller（来自 web.clipboard 贡献）；copy/cut/paste 委托给它。 */
  private clipboardController: WebClipboard | null = null
  /** copy 成功后的通知回调。 */
  private onCopy?: (range: CellRange) => void
  /** cut 成功后的通知回调。 */
  private onCut?: (range: CellRange) => void
  /** paste 成功后的通知回调。 */
  private onPaste?: (target: CellRange) => void
  /** paste 跳过只读/非法单元格后的通知回调。 */
  private onPasteSkipped?: (cells: readonly PasteSkippedCell[]) => void
  /** Phase 4.2 — undo 成功后的通知回调。 */
  private onUndo?: (event: UndoEvent) => void
  /** Phase 4.2 — redo 成功后的通知回调。 */
  private onRedo?: (event: RedoEvent) => void
  /** fill handle 提交成功后的通知回调。 */
  private onFill?: (event: FillEvent) => void
  /** 当前活跃的 Drag（R1 DragController）；pointerdown 起拖时设置。 */
  private activeDrag: Drag | null = null
  /** 行高/列宽 resize 拖拽。 */
  private resizeDrag: WebResizeDrag | null = null
  /** 普通单元格拖选。 */
  private selectionDrag!: SelectionDrag
  /** pointerdown 按序尝试起拖的 Drag 列表；加新拖拽 = 实现 Drag + 入此数组。 */
  private drags: readonly Drag[] = []
  /** Contributed drags that also implement WebFrameSync；每帧同步派发。 */
  private frameSyncs: WebFrameSync[] = []

  /** 创建 runtime 并保存 backend 注入的 engine/host/renderer/layer 依赖。 */
  constructor(opts: WebGridRuntimeOptions) {
    this.engine = opts.engine
    this.context = opts.context ?? createSheetContext()
    this.host = opts.host
    this.renderer = opts.renderer
    this.scheduler = opts.scheduler ?? new FrameScheduler()
    this.onSurfaceResize = opts.onSurfaceResize
    this.measurer = opts.measurer
    this.handleLayer = opts.handleLayer
    this.viewPipeline = opts.viewPipeline
    this.sortLayer = opts.sortLayer
    this.filterLayer = opts.filterLayer
    this.hideToggleHandle = opts.hideToggleHandle
    this.hideColToggleHandle = opts.hideColToggleHandle
    this.columnReorderOverlay = opts.columnReorderOverlay
    this.rowReorderOverlay = opts.rowReorderOverlay
    this.selectionOverlay = opts.selectionOverlay
    this.openCustomCellEditor = opts.openCustomCellEditor
    this.scrollMapper = new ScrollMapper()
    this.selectionDrag = new SelectionDrag({
      engine: this.engine,
      refresh: () => this.refresh(),
      requestAutoScroll: (pointer) => this.requestDragAutoScroll(pointer),
      stopAutoScroll: () => this.stopDragAutoScroll(),
      // 选区拖拽结束后触发一帧 flush，让 frame-sync overlay（填充柄）按新选区重显。
      syncFillHandle: () => this.invalidate(),
      isBlocked: () => this.isDragBlocked(),
    })
    const contributedDrags = getWebDragContributions(this.context)
      .map((contribution) => contribution.create(this.createWebDragRuntimeDeps()))
      .filter((drag): drag is Drag => drag !== null)
    this.resizeDrag = contributedDrags.find(isWebResizeDrag) ?? null
    this.drags = [
      ...contributedDrags.filter((drag) => drag !== this.resizeDrag),
      this.selectionDrag,
    ]
    this.frameSyncs = this.drags.filter(isWebFrameSync)
    this.cellEditController =
      getWebCellEditorContributions(this.context)
        .map((c) => c.create(this.createWebCellEditorDeps()))
        .find((e): e is WebCellEditor & WebFrameSync => e !== null) ?? null
    if (this.cellEditController) this.frameSyncs = [...this.frameSyncs, this.cellEditController]
    for (const fs of this.frameSyncs) fs.attach(this.host.container)
    this.clipboardController =
      getWebClipboardContributions(this.context)
        .map((c) => c.create(this.createWebClipboardDeps()))
        .find((c): c is WebClipboard => c !== null) ?? null
    this.contextMenuController =
      getWebContextMenuContributions(this.context)
        .map((c) => c.create(this.createWebContextMenuDeps()))
        .find((c): c is WebContextMenu => c !== null) ?? null
    if (this.contextMenuController) {
      this.contextMenuController.attach(this.host.container)
    }
    this.sortFilterController =
      getWebSortFilterContributions(this.context)
        .map((c) => c.create(this.createWebSortFilterDeps()))
        .find((c): c is WebSortFilter => c !== null) ?? null
    if (this.sortFilterController) {
      this.sortFilterController.attach(this.host.container)
    }
    this.structureController =
      getWebStructureContributions(this.context)
        .map((c) => c.create(this.createWebStructureDeps()))
        .find((c): c is WebStructure => c !== null) ?? null
    this.mergeCellsController =
      getWebMergeCellsContributions(this.context)
        .map((c) => c.create(this.createWebMergeCellsDeps()))
        .find((c): c is WebMergeCells => c !== null) ?? null
  }

  private createWebMergeCellsDeps(): WebMergeCellsRuntimeDeps {
    return {
      getSelectedRange: () => this.engine.getSelection().selectedRange,
      getVisibleMergeRegions: () => this.engine.getFrame().mergeRegions ?? [],
      mergeCells: (range) => this.mergeCells(range),
      unmergeCells: (range) => this.unmergeCells(range),
    }
  }

  private createWebStructureDeps(): WebStructureRuntimeDeps {
    return {
      engine: this.engine,
      afterEngineMutation: () => this.afterEngineMutation(),
      getLastMenuPoint: () => this.lastContextMenuPoint,
      collectHiddenInViewColRange: (startCol, endCol) =>
        this.collectHiddenInViewColRange(startCol, endCol),
      viewColToFieldId: (viewCol) => this.viewColToFieldId(viewCol),
      rawSchemaIndexBeforeViewCol: (viewCol) => this.rawSchemaIndexBeforeViewCol(viewCol),
      rawSchemaIndexAfterViewCol: (viewCol) => this.rawSchemaIndexAfterViewCol(viewCol),
      insertRows: (before, count) => this.insertRows(before, count),
      deleteRows: (ids) => this.deleteRows(ids),
      hideRows: (ids) => this.hideRows(ids),
      unhideRows: (ids) => this.unhideRows(ids),
      getRowHeight: (rowId) => this.engine.getRowHeight(rowId),
      openRowHeightPopover: (sortedIds, triggerRect, currentHeight) => {
        if (!this.rowHeightPopover) return
        this.pendingRowHeightIds = [...sortedIds]
        this.rowHeightPopover.open(triggerRect, currentHeight)
      },
      hasRowHeightPopover: () => this.rowHeightPopover !== undefined,
      insertCols: (before, count) => this.insertCols(before, count),
      deleteCols: (ids) => this.deleteCols(ids),
      hideCols: (ids) => this.hideCols(ids),
      unhideCols: (ids) => this.unhideCols(ids),
      openColumnWidthPopover: (fieldIds, triggerRect, currentWidth) => {
        if (!this.columnWidthPopover) return
        this.pendingColumnWidthFieldIds = [...fieldIds]
        this.columnWidthPopover.open(triggerRect, currentWidth)
      },
      hasColumnWidthPopover: () => this.columnWidthPopover !== undefined,
    }
  }

  private createWebSortFilterDeps(): WebSortFilterRuntimeDeps {
    return {
      sortLayer: this.sortLayer,
      filterLayer: this.filterLayer,
      viewPipeline: this.viewPipeline,
      closeContextMenu: () => this.contextMenuController?.close(),
      hideColumnReorderOverlay: () => this.columnReorderOverlay?.hide(),
      getLastMenuPoint: () => this.lastContextMenuPoint,
      focusScrollHost: () => this.host.focusScrollHost(),
      onFilterPopoverFallback: (action, ctx) => this.onContextMenuAction?.(action, ctx),
    }
  }

  private createWebContextMenuDeps(): WebContextMenuRuntimeDeps {
    return {
      context: this.context,
      engine: this.engine,
      host: this.host,
      viewPipeline: this.viewPipeline,
      refresh: () => this.refresh(),
      afterEngineMutation: () => this.afterEngineMutation(),
      commitActiveEdit: (moveSelection) => this.commitCellEdit(moveSelection),
      isContextMenuBlocked: () =>
        this.resizeDrag?.active === true || this.activeDrag?.active === true,
      collectHiddenInViewColRange: (startCol, endCol) =>
        this.collectHiddenInViewColRange(startCol, endCol),
      recordMenuOpen: (ctx, point) => {
        this.lastContextMenuContext = ctx
        this.lastContextMenuPoint = point
      },
      getLastMenuContext: () => this.lastContextMenuContext,
      clearMenuContext: () => {
        this.lastContextMenuContext = null
        this.lastContextMenuPoint = null
      },
      hasContextMenuConsumer: () => this.onContextMenuAction !== undefined,
      notifyContextMenuAction: (action, ctx) => {
        if (!this.onContextMenuAction) return false
        this.onContextMenuAction(action, ctx)
        return true
      },
      handleCellMenuAction: (id, ctx) =>
        this.mergeCellsController?.handleCellMenuAction(id, ctx) ?? false,
      clipboardCopy: () => this.handleClipboardCopy(),
      clipboardCut: () => this.handleClipboardCut(),
      clipboardPaste: () => this.handleClipboardPaste(),
      handleRowHeaderMenuAction: (id, ctx) =>
        this.structureController?.handleRowHeaderMenuAction(id, ctx) ?? false,
      handleColumnMenuAction: (id, ctx) =>
        (this.sortFilterController?.handleColumnMenuAction(id, ctx) ||
          this.structureController?.handleColumnMenuAction(id, ctx)) ??
        false,
      focusScrollHost: () => this.host.focusScrollHost(),
    }
  }

  private createWebClipboardDeps(): WebClipboardRuntimeDeps {
    return {
      engine: this.engine,
      afterEngineMutation: () => this.afterEngineMutation(),
      onCopy: (range) => this.onCopy?.(range),
      onCut: (range) => this.onCut?.(range),
      onPaste: (target) => this.onPaste?.(target),
      onPasteSkipped: (cells) => this.onPasteSkipped?.(cells),
    }
  }

  private createWebCellEditorDeps(): WebCellEditorRuntimeDeps {
    return {
      engine: this.engine,
      host: this.host,
      autofitRows: (options) => this.autofitRows(options),
      afterEngineMutation: () => this.afterEngineMutation(),
      refresh: () => this.refresh(),
      revealActiveCell: () => {
        const target = this.getSelectionScrollTarget()
        if (target) this.ensureCellVisible(target)
      },
      requestSyncPaint: () => this.paintSync(),
      isBlocked: () => this.resizeDrag?.active === true || !!this.activeDrag,
      tryCustomEditor: (cell) => this.openCustomCellEditor?.(cell) ?? false,
    }
  }

  private createWebDragRuntimeDeps(): WebDragRuntimeDeps {
    return {
      engine: this.engine,
      host: this.host,
      handleLayer: this.handleLayer,
      columnReorderOverlay: this.columnReorderOverlay,
      rowReorderOverlay: this.rowReorderOverlay,
      refresh: () => this.refresh(),
      afterEngineMutation: () => this.afterEngineMutation(),
      closeContextMenu: () => this.closeContextMenu(),
      requestAutoScroll: (pointer) => this.requestDragAutoScroll(pointer),
      stopAutoScroll: () => this.stopDragAutoScroll(),
      isBlocked: () => this.isDragBlocked(),
      hitTestColumnHeader: (event) => this.hitTestColumnHeader(event),
      hitTestRowHeader: (event) => this.hitTestRowHeader(event),
      isWholeColumnSelection: (range) => this.isWholeColumnSelection(range),
      isWholeRowSelection: (range) => this.isWholeRowSelection(range),
      selectWholeColumn: (col) => this.selectWholeColumn(col),
      selectWholeColumnRange: (anchor, extent) => this.selectWholeColumnRange(anchor, extent),
      selectWholeRowRange: (anchor, extent) => this.selectWholeRowRange(anchor, extent),
      getColsTotalSize: () => this.getColsTotalSizeForFrame(this.engine.getFrame()),
      autofitRows: (options) => this.autofitRows(options),
      commitActiveEdit: (moveSelection) => this.commitCellEdit(moveSelection),
      onFill: (event) => this.onFill?.(event),
    }
  }

  private isDragBlocked(): boolean {
    return this.resizeDrag?.active === true || this.drags.some((d) => d.active) || !!this.activeDrag
  }

  /** 起拖期间记录 pointer 并按边缘热区驱动自动滚动（供 Drag 经 deps 调用）。 */
  private requestDragAutoScroll(pointer: WebPointerEvent): void {
    this.lastDragPointer = pointer
    this.updateDragAutoScroll(pointer)
  }


  /** 注入 row-height popover（Phase 4.5）。 */
  setRowHeightPopover(popover: RowHeightPopover): void {
    this.rowHeightPopover = popover
  }

  /** 注入 column-width popover（Phase 4.6）。 */
  setColumnWidthPopover(popover: ColumnWidthPopover): void {
    this.columnWidthPopover = popover
  }

  /** 注入 hide-col toggle handle（Phase 4.6）。 */
  setHideColToggleHandle(handle: HideColToggleHandle): void {
    this.hideColToggleHandle = handle
  }

  /** 返回当前 resize-row-height 操作暂存的行 id 列表，供 onSubmit 回调读取。 */
  getPendingRowHeightIds(): number[] {
    return this.pendingRowHeightIds
  }

  /** 返回当前 resize-column-width 操作暂存的 fieldId 列表，供 onSubmit 回调读取。 */
  getPendingColumnWidthFieldIds(): readonly string[] {
    return this.pendingColumnWidthFieldIds
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
  setOnContextMenuAction(cb: (action: ContextMenuAction, ctx: ContextMenuContext) => void): void {
    this.onContextMenuAction = cb
  }

  /** 关闭右键菜单并清理最近菜单上下文。 */
  closeContextMenu(): void {
    this.contextMenuController?.close()
  }

  /** 注册 copy 成功通知回调。 */
  setOnCopy(cb: (range: CellRange) => void): void {
    this.onCopy = cb
  }

  /** 注册 cut 成功通知回调。 */
  setOnCut(cb: (range: CellRange) => void): void {
    this.onCut = cb
  }

  /** 注册 paste 成功通知回调。 */
  setOnPaste(cb: (target: CellRange) => void): void {
    this.onPaste = cb
  }

  /** 注册 paste 跳过单元格通知回调。 */
  setOnPasteSkipped(cb: (cells: readonly PasteSkippedCell[]) => void): void {
    this.onPasteSkipped = cb
  }

  /** 注册 undo 成功通知回调。 */
  setOnUndo(cb: (event: UndoEvent) => void): void {
    this.onUndo = cb
  }

  /** 注册 redo 成功通知回调。 */
  setOnRedo(cb: (event: RedoEvent) => void): void {
    this.onRedo = cb
  }

  /** 注册 fill handle 提交通知回调。 */
  setOnFill(cb: (event: FillEvent) => void): void {
    this.onFill = cb
  }

  /** 返回当前 undo 栈是否可撤销。 */
  canUndo(): boolean {
    return this.engine.canUndo()
  }

  /** 返回当前 redo 栈是否可重做。 */
  canRedo(): boolean {
    return this.engine.canRedo()
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
    const sel = this.engine.getSelection().selectedRange
    const startRow = sel?.startRow ?? ctx.targetRowIndex
    const endRow = sel?.endRow ?? ctx.targetRowIndex
    const n = endRow - startRow + 1
    const hidden = this.engine.getHiddenRows()
    // 检查选区 span 的底层行区间内是否存在隐藏行（包括被 hide 而不在视图中的行）
    let hasHidden = false
    if (hidden.length > 0) {
      const data = this.engine.getData()
      const underlyingStart = data.resolveUnderlyingRow?.(startRow) ?? startRow
      const underlyingEnd = data.resolveUnderlyingRow?.(endRow) ?? endRow
      const minU = Math.min(underlyingStart, underlyingEnd)
      const maxU = Math.max(underlyingStart, underlyingEnd)
      for (const hiddenId of hidden) {
        if (hiddenId >= minU && hiddenId <= maxU) {
          hasHidden = true
          break
        }
      }
    }
    return getRowHeaderContextMenuItems(n, hasHidden)
  }

  /** Phase 4.5 — 执行行头右键菜单动作（委托 structure feature）。 */
  invokeRowHeaderContextMenuAction(id: string, ctx: { targetRowIndex: number }): void {
    if (this.destroyed) return
    const menuCtx: RowHeaderMenuContext = {
      targetKind: 'rowHeader',
      targetRowIndex: ctx.targetRowIndex,
    }
    this.structureController?.handleRowHeaderMenuAction(id as ContextMenuAction, menuCtx)
  }

  /** Phase 4.6 — 生成列头右键菜单项列表（含结构项与条件 unhide 项）。 */
  getColumnHeaderContextMenuItems(ctx: { targetColIndex: number }): readonly ContextMenuItem[] {
    const frame = this.engine.getFrame()
    const fields = frame.data.getSchema().fields
    const field = fields[ctx.targetColIndex]
    if (!field || !this.viewPipeline) return []
    const sel = this.engine.getSelection().selectedRange
    const startCol = sel?.startCol ?? ctx.targetColIndex
    const endCol = sel?.endCol ?? ctx.targetColIndex
    return getColumnHeaderContextMenuItems(
      {
        targetKind: 'columnHeader',
        field,
        colIndex: ctx.targetColIndex,
        multiSelect: field.type === 'multiSelect',
        selectedColCount: endCol - startCol + 1,
        hasHiddenInSelection: this.collectHiddenInViewColRange(startCol, endCol).length > 0,
      },
      this.viewPipeline,
    )
  }

  /** Phase 4.6 — 执行列头右键菜单动作（sort/filter 与 structure 委托各 feature）。 */
  invokeColumnHeaderContextMenuAction(id: string, ctx: { targetColIndex: number }): void {
    if (this.destroyed) return
    const frame = this.engine.getFrame()
    const fields = frame.data.getSchema().fields
    const field = fields[ctx.targetColIndex]
    if (!field) return
    const sel = this.engine.getSelection().selectedRange
    const startCol = sel?.startCol ?? ctx.targetColIndex
    const endCol = sel?.endCol ?? ctx.targetColIndex
    const menuCtx: ColumnHeaderMenuContext = {
      targetKind: 'columnHeader',
      field,
      colIndex: ctx.targetColIndex,
      multiSelect: field.type === 'multiSelect',
      selectedColCount: endCol - startCol + 1,
      hasHiddenInSelection: this.collectHiddenInViewColRange(startCol, endCol).length > 0,
    }
    const action = id as ContextMenuAction
    if (this.sortFilterController?.handleColumnMenuAction(action, menuCtx)) return
    this.structureController?.handleColumnMenuAction(action, menuCtx)
  }

  private viewColToFieldId(viewCol: number): string | null {
    return this.engine.getData().getSchema().fields[viewCol]?.id ?? null
  }

  private rawSchemaIndexBeforeViewCol(viewCol: number): number {
    const hiddenBefore = this.engine
      .getFrame()
      .collapsedColGaps.filter((gap) => gap.atViewCol < viewCol)
      .reduce((sum, gap) => sum + gap.hiddenCount, 0)
    return viewCol + hiddenBefore
  }

  private rawSchemaIndexAfterViewCol(viewCol: number): number {
    const hiddenThrough = this.engine
      .getFrame()
      .collapsedColGaps.filter((gap) => gap.atViewCol <= viewCol)
      .reduce((sum, gap) => sum + gap.hiddenCount, 0)
    return viewCol + 1 + hiddenThrough
  }

  private collectHiddenInViewColRange(startCol: number, endCol: number): readonly string[] {
    const out: string[] = []
    for (const gap of this.engine.getFrame().collapsedColGaps) {
      if (gap.atViewCol >= startCol - 1 && gap.atViewCol < endCol) {
        out.push(...gap.hiddenFieldIds)
      }
    }
    return out
  }

  /** 执行一次 undo，并在成功后刷新视图与通知 consumer。 */
  undo(): void {
    if (this.destroyed) return
    const cmd = this.engine.undo()
    if (!cmd) return
    this.afterEngineMutation()
    this.onUndo?.({ command: cmd })
  }

  /** 执行一次 redo，并在成功后刷新视图与通知 consumer。 */
  redo(): void {
    if (this.destroyed) return
    const cmd = this.engine.redo()
    if (!cmd) return
    this.afterEngineMutation()
    this.onRedo?.({ command: cmd })
  }

  /** 处理 copy（委托剪贴板能力包；未安装则 no-op）。 */
  handleClipboardCopy(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false)
    return this.clipboardController?.copy() ?? Promise.resolve(false)
  }

  /** 处理 cut（委托剪贴板能力包）。 */
  handleClipboardCut(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false)
    return this.clipboardController?.cut() ?? Promise.resolve(false)
  }

  /** 处理 paste（委托剪贴板能力包）。 */
  handleClipboardPaste(): Promise<boolean> {
    if (this.destroyed) return Promise.resolve(false)
    return this.clipboardController?.paste() ?? Promise.resolve(false)
  }

  /** 处理 host contextmenu 事件（委托 context-menu feature；未安装则 no-op）。 */
  handleHostContextMenu(event: WebPointerEvent): void {
    if (this.destroyed) return
    this.contextMenuController?.handleHostContextMenu(event)
  }

  /** 处理右键菜单项选择（委托 context-menu feature）。 */
  handleContextMenuSelected(id: ContextMenuAction): void {
    this.contextMenuController?.handleAction(id)
  }

  /** 应用 filter popover 返回的条件；null 表示清除当前列筛选。 */
  handleFilterPopoverApply(op: FilterOp | null): void {
    this.sortFilterController?.handleFilterPopoverApply(op)
  }

  /** 按单元格坐标程序化打开右键菜单，锚点位于单元格右下角。 */
  openContextMenuAt(rowIndex: number, fieldId: string): void {
    if (this.destroyed || !this.contextMenuController) return
    const colIndex = this.engine.getColumnIndex(fieldId)
    if (colIndex < 0) return
    const frame = this.engine.getFrame()
    const rect = computeCellRect(frame, { rowIndex, colIndex })
    if (!rect) return
    const hostRect = this.host.getContainerBoundingRect()
    // anchor at cell bottom-right corner; client coords add the host's viewport offset
    this.handleHostContextMenu({
      x: rect.x + rect.width,
      y: rect.y + rect.height,
      clientX: hostRect.left + rect.x + rect.width,
      clientY: hostRect.top + rect.y + rect.height,
      shiftKey: false,
    })
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
    this.resizeSpacer()
    this.syncScrollbarTheme()
    this.syncResizeHandleTheme()
    this.paintSync()
  }

  /** 更换渲染器实现（Canvas2D / 未来 WebGL）；销毁旧实例并取消 pending flush。 */
  replaceRenderer(factory: () => WebRenderer): WebRenderer {
    if (!this.destroyed) {
      this.scheduler.cancel('renderer:flush')
      this.renderer.destroy()
    }
    this.renderer = factory()
    return this.renderer
  }

  /** 替换底层 data source 与 renderer，并清空剪贴板 typed 缓存。 */
  setData(data: DataSource, factory: () => WebRenderer): WebRenderer {
    this.engine.setData(data)
    this.replaceRenderer(factory)
    this.clipboardController?.onDataReplaced()
    this.afterEngineMutation()
    return this.renderer
  }

  /** 替换 view data，并允许 caller 对现有 renderer 打补丁。 */
  updateViewData(
    data: DataSource,
    options?: SetViewDataOptions,
    patchRenderer?: (renderer: WebRenderer) => void,
  ): void {
    this.engine.setViewData(data, options)
    patchRenderer?.(this.renderer)
    this.clipboardController?.onDataReplaced()
    this.afterEngineMutation()
  }

  /** 应用主题到 engine、renderer 与所有 DOM overlay layer。 */
  setTheme(theme: Theme, patchRenderer?: (renderer: WebRenderer) => void): void {
    this.engine.setTheme(theme)
    patchRenderer?.(this.renderer)
    this.syncScrollbarTheme()
    this.syncResizeHandleTheme()
    this.syncContextMenuTheme()
    this.syncFilterPopoverTheme()
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
    this.resizeSpacer()
    this.remapScroll()
    this.refresh()
    this.contextMenuController?.close()
    this.activeDrag = null
  }

  /** 滚动到指定行，并按给定对齐方式放入 viewport。 */
  scrollToRow(rowIndex: number, align: 'start' | 'center' | 'end' = 'start'): void {
    const rowsAxis = this.engine.getRowsAxis()
    if (rowIndex < 0 || rowIndex >= rowsAxis.getCount()) return
    const top = rowsAxis.indexToPosition(rowIndex)
    const size = rowsAxis.getSize(rowIndex)
    const { height: clientH } = this.host.getContainerSize()
    const vpContentH = clientH - this.engine.getTheme().metrics.headerHeight
    let logicalY: number
    if (align === 'start') logicalY = top
    else if (align === 'end') logicalY = top + size - vpContentH
    else logicalY = top + size / 2 - vpContentH / 2

    const scrollTop = this.logicalToScrollY(logicalY)
    const { scrollLeft } = this.host.getScrollPosition()
    this.host.scrollTo(scrollTop, scrollLeft)
  }

  /** 滚动到指定单元格的左上角。 */
  scrollToCell(rowIndex: number, fieldId: string): void {
    const rowsAxis = this.engine.getRowsAxis()
    const colsAxis = this.engine.getColsAxis()
    const colIndex = this.engine.getColumnIndex(fieldId)
    if (rowIndex < 0 || rowIndex >= rowsAxis.getCount()) return
    if (colIndex < 0) return

    const top = rowsAxis.indexToPosition(rowIndex)
    const left = colsAxis.indexToPosition(colIndex)
    const scrollTop = this.logicalToScrollY(top)
    const scrollLeft = this.logicalToScrollX(left)
    this.host.scrollTo(scrollTop, scrollLeft)
  }

  /** 开始鼠标/触控 resize 拖拽并显示尺寸指示线。 */
  handleResizePointerDown(
    handle: ResizeHandleRect,
    pointerId: number,
    clientX: number,
    clientY: number,
  ): void {
    if (this.destroyed) return
    if (this.resizeDrag?.start(handle, pointerId, clientX, clientY)) {
      this.activeDrag = this.resizeDrag
    }
  }

  /** 更新 resize 拖拽预览尺寸。 */
  handleResizePointerMove(pointerId: number, clientX: number, clientY: number): void {
    if (this.destroyed) return
    this.resizeDrag?.movePointer(pointerId, clientX, clientY)
  }

  /** 结束 resize 拖拽并一次性提交行高/列宽变更。 */
  handleResizePointerUp(pointerId: number): void {
    if (!this.resizeDrag?.commitPointer(pointerId)) return
    this.activeDrag = null
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
    this.cancelCellEdit()
    this.activeDrag?.cancel()
    this.activeDrag = null
    this.columnReorderOverlay?.hide()
    this.rowReorderOverlay?.hide()
    this.scheduler.cancel('renderer:flush')
    this.scheduler.cancel(HOST_RESIZE_KEY)
    this.scheduler.cancel(DRAG_AUTO_SCROLL_KEY)
    for (const fs of this.frameSyncs) fs.destroy()
    this.frameSyncs = []
    this.contextMenuController?.destroy()
    this.contextMenuController = null
    this.sortFilterController?.destroy()
    this.sortFilterController = null
    this.renderer.destroy()
    this.host.destroy()
  }

  /** 处理 host 滚动事件，映射为逻辑滚动并触发重绘。 */
  handleHostScroll(scrollTop: number, scrollLeft: number): void {
    const { logicalX, logicalY } = this.mapScrollToLogical(scrollTop, scrollLeft)
    this.engine.setScroll(logicalX, logicalY)
    this.contextMenuController?.close()
    this.invalidate()
  }

  /** 处理 host 尺寸变化；实际 resize 工作合并到 RAF 中执行。 */
  handleHostResize(_cssWidth: number, _cssHeight: number, _dpr: number): void {
    void _cssWidth
    void _cssHeight
    void _dpr
    this.scheduleHostResize()
  }

  /** 处理 DPR 变化；实际 resize 工作合并到 RAF 中执行。 */
  handleHostDprChange(_dpr: number): void {
    void _dpr
    this.scheduleHostResize()
  }

  /** 处理 host pointerdown，开始单元格选择或扩展选择。 */
  handleHostPointerDown(event: WebPointerEvent): void {
    if (this.destroyed) return
    // 仅左键进入 drag-select；右键 / 中键留给 contextmenu / 其它路径
    if ((event.button ?? 0) !== 0) return
    if (this.engine.isCellEditing()) {
      this.commitCellEdit(false)
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
    if (this.destroyed || this.resizeDrag?.active === true || this.activeDrag?.active) return
    const hit = hitTestCell(this.engine.getFrame(), event)
    if (!hit) return
    this.engine.selectCell(hit)
    this.openCellEditor(hit, { selectAll: false })
  }

  /** Phase 3.3 / 3.5 — 导航；选中后直接键入进入编辑（Sheets 式）。 */
  handleHostKeyDown(event: WebKeyboardEvent): boolean {
    if (this.destroyed) return false
    if (event.key === 'Escape' && this.activeDrag) {
      this.activeDrag.cancel()
      this.activeDrag = null
      return true
    }
    if (this.sortFilterController?.isPopoverOpen()) return false
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
      if (this.openCellEditor(cell, { selectAll: false })) return true
    }

    if (
      cell &&
      isTypableEditKey(event.key, {
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
      })
    ) {
      if (this.beginCellEditWithDraft(cell, event.key)) return true
    }

    if (!this.engine.navigateSelection(event.key, event.shiftKey)) return false

    const focus = this.getSelectionScrollTarget()
    if (focus) this.ensureCellVisible(focus)
    this.refresh()
    return true
  }

  /** 取消正在排队的拖拽自动滚动并清掉 pointer 记录。 */
  private stopDragAutoScroll(): void {
    this.scheduler.cancel(DRAG_AUTO_SCROLL_KEY)
    this.lastDragPointer = null
  }

  private updateHeaderCursor(event: WebPointerEvent): void {
    if (this.resizeDrag?.active === true || this.activeDrag?.active) {
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
    const totalSize = this.getColsTotalSizeForFrame(frame)
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

  private getColsTotalSizeForFrame(frame: ReturnType<GridEngine['getFrame']>): number {
    const axis = frame.colsAxis
    if (typeof axis.getTotalSize === 'function') return axis.getTotalSize()
    const engineTotal = this.engine.getColsTotalSize()
    if (engineTotal > 0) return engineTotal
    const count = axis.getCount()
    if (count <= 0) return 0
    return axis.indexToPosition(count - 1) + axis.getSize(count - 1)
  }

  /**
   * 合并 ResizeObserver / DPR 变更：在同一 RAF 内完成 viewport、位图缩放与同步绘制。
   * 避免 HighDPI.resize 清空 canvas 后等到 `renderer:flush` 才画（中间空白帧会闪烁）。
   */
  private scheduleHostResize(): void {
    if (this.destroyed) return
    this.scheduler.schedule(HOST_RESIZE_KEY, () => {
      if (this.destroyed) return
      const { width, height } = this.host.getContainerSize()
      const dpr = this.host.getDpr()
      this.engine.setViewportSize(width, height)
      this.onSurfaceResize?.(width, height, dpr)
      this.renderer.resize(width, height, dpr)
      this.remapScroll()
      this.paintSync()
    })
  }

  /** @internal 供集成测试模拟 ResizeObserver 回调 */
  onContainerResize(): void {
    const { width, height } = this.host.getContainerSize()
    this.handleHostResize(width, height, this.host.getDpr())
  }

  /** 调度下一帧 render flush，并同步 overlay 与编辑器位置。 */
  private invalidate(): void {
    if (this.destroyed) return
    this.scheduler.schedule('renderer:flush', () => {
      if (this.destroyed) return
      const frame = this.getRenderFrame()
      this.renderer.render(frame)
      this.syncSelectionOverlay(frame)
      this.syncResizeHandles()
      this.syncHideToggleHandles()
      this.syncHideColToggleHandles()
      this.syncFrameSyncs(frame)
    })
  }

  /** 立即同步绘制一帧；用于 attach/resize 等不能等待异步 flush 的路径。 */
  private paintSync(): void {
    const frame = this.getRenderFrame()
    this.renderer.render(frame)
    this.syncSelectionOverlay(frame)
    this.syncResizeHandles()
    this.syncHideToggleHandles()
    this.syncHideColToggleHandles()
    this.syncFrameSyncs(frame)
  }

  /** 公开同步绘制一帧（测试/即时刷新用）。 */
  paintNow(): void {
    this.paintSync()
  }

  /** 驱动所有 frame-sync overlay（如填充柄）每帧同步；未安装时 no-op。 */
  private syncFrameSyncs(frame: ReturnType<GridEngine['getFrame']>): void {
    if (this.frameSyncs.length === 0) return
    const status: WebInteractionStatus = {
      interacting: this.resizeDrag?.active === true || this.drags.some((d) => d.active),
      editing: this.engine.isCellEditing(),
    }
    for (const fs of this.frameSyncs) fs.syncFrame(frame, status)
  }

  /** 获取当前 render frame，并在 view pipeline 存在时注入视图映射。 */
  private getRenderFrame(): ReturnType<GridEngine['getFrame']> {
    const frame = this.engine.getFrame()
    if (!this.viewPipeline) return frame
    return { ...frame, viewPipeline: this.viewPipeline }
  }

  /** 根据当前 frame 同步 resize handle layer。 */
  private syncResizeHandles(): void {
    if (!this.handleLayer || this.resizeDrag?.active === true) return
    const frame = this.engine.getFrame()
    this.handleLayer.sync(computeResizeHandles(frame))
  }

  /** 根据当前 frame 同步 hide-toggle handle layer。 */
  private syncHideToggleHandles(): void {
    if (!this.hideToggleHandle) return
    const frame = this.engine.getFrame()
    this.hideToggleHandle.update(frame.collapsedRowGaps, {
      rowHeaderWidth: frame.viewport.rowHeaderWidth,
    })
  }

  /** 根据当前 frame 同步 hide-col-toggle handle layer。 */
  private syncHideColToggleHandles(): void {
    if (!this.hideColToggleHandle) return
    const frame = this.engine.getFrame()
    this.hideColToggleHandle.update(frame.collapsedColGaps, {
      headerHeight: frame.viewport.headerHeight,
    })
  }

  /** 根据 renderer 同一份 frame 同步 DOM body selection overlay。 */
  private syncSelectionOverlay(frame = this.getRenderFrame()): void {
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

  /**
   * 当前驱动边缘自动滚动的拖拽实例。
   * 选区/resize 经 host pointer 路由设入 `activeDrag`；填充柄由自有 DOM 层捕获 pointer，
   * 不进 `activeDrag`，故回退到 contributed drags 里 active 的那个。
   */
  private autoScrollTarget(): Drag | null {
    if (this.activeDrag?.active) return this.activeDrag
    return this.drags.find((d) => d.active) ?? null
  }

  /** 当前驱动边缘自动滚动的拖拽种类；活跃拖拽 / 填充柄优先于普通选区。 */
  private activeAutoScrollDrag(): AutoScrollDragKind | null {
    return this.autoScrollTarget() ? 'active-drag' : null
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
    const limits = this.getScrollLimits()
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
        this.autoScrollTarget()?.reevaluate(pointer)
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
      const axis = this.autoScrollTarget()?.autoScrollAxis ?? null
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

  /** 计算当前 DOM scrollTop/scrollLeft 的最大边界。 */
  private getScrollLimits(): { maxTop: number; maxLeft: number } {
    const headerH = this.engine.getTheme().metrics.headerHeight
    const { width, height } = this.host.getContainerSize()
    return {
      maxTop: Math.max(
        0,
        this.scrollMapper.computeSpacerSize(this.engine.getRowsTotalSize() + headerH) - height,
      ),
      maxLeft: Math.max(
        0,
        this.scrollMapper.computeSpacerSize(this.engine.getColsTotalSize()) - width,
      ),
    }
  }

  /** 将 DOM scrollTop/scrollLeft 映射为 engine 使用的逻辑 scroll 坐标。 */
  private mapScrollToLogical(
    scrollTop: number,
    scrollLeft: number,
  ): { logicalX: number; logicalY: number } {
    const headerH = this.engine.getTheme().metrics.headerHeight
    const contentH = this.engine.getRowsTotalSize()
    const contentW = this.engine.getColsTotalSize()
    const spacerH = this.scrollMapper.computeSpacerSize(contentH + headerH)
    const spacerW = this.scrollMapper.computeSpacerSize(contentW)
    const { width: clientW, height: clientH } = this.host.getContainerSize()
    return {
      logicalX: this.scrollMapper.scrollToLogical(scrollLeft, spacerW, contentW, clientW),
      logicalY: this.scrollMapper.scrollToLogical(scrollTop, spacerH, contentH + headerH, clientH),
    }
  }

  /** 将逻辑 Y 滚动坐标映射回 DOM scrollTop。 */
  private logicalToScrollY(logicalY: number): number {
    const headerH = this.engine.getTheme().metrics.headerHeight
    const contentH = this.engine.getRowsTotalSize()
    const spacerH = this.scrollMapper.computeSpacerSize(contentH + headerH)
    const { height: clientH } = this.host.getContainerSize()
    return this.scrollMapper.logicalToScroll(logicalY, spacerH, contentH + headerH, clientH)
  }

  /** 将逻辑 X 滚动坐标映射回 DOM scrollLeft。 */
  private logicalToScrollX(logicalX: number): number {
    const contentW = this.engine.getColsTotalSize()
    const spacerW = this.scrollMapper.computeSpacerSize(contentW)
    const { width: clientW } = this.host.getContainerSize()
    return this.scrollMapper.logicalToScroll(logicalX, spacerW, contentW, clientW)
  }

  /** 读取当前 DOM 滚动位置并同步到 engine 的逻辑 viewport。 */
  private remapScroll(): void {
    const { scrollTop, scrollLeft } = this.host.getScrollPosition()
    const { logicalX, logicalY } = this.mapScrollToLogical(scrollTop, scrollLeft)
    this.engine.setScroll(logicalX, logicalY)
  }

  /** 按内容尺寸与 header 尺寸更新 host scroll spacer。 */
  private resizeSpacer(): void {
    const headerH = this.engine.getTheme().metrics.headerHeight
    const w = this.scrollMapper.computeSpacerSize(this.engine.getColsTotalSize())
    const h = this.scrollMapper.computeSpacerSize(this.engine.getRowsTotalSize() + headerH)
    this.host.setScrollSize(w, h)
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

  tryOpenCustomCellEditor(
    cell: CellAddress,
    invoke: (rect: { x: number; y: number; width: number; height: number }) => boolean,
  ): boolean {
    if (this.destroyed || this.resizeDrag?.active === true) return false
    const rect = computeCellRect(this.engine.getFrame(), cell)
    if (!rect) return false
    return invoke(rect)
  }

  /** 同步 context menu layer 主题。 */
  private syncContextMenuTheme(): void {
    this.contextMenuController?.applyTheme(this.engine.getTheme())
  }

  /** 同步 filter popover 主题。 */
  private syncFilterPopoverTheme(): void {
    this.sortFilterController?.applyTheme(this.engine.getTheme())
  }

  /** 打开指定单元格编辑器（委托编辑能力包；未安装则 no-op）。 */
  private openCellEditor(cell: CellAddress, options: { selectAll?: boolean } = {}): boolean {
    return this.cellEditController?.open(cell, options) ?? false
  }

  /** 用首个键入字符作为 draft 打开编辑器（委托编辑能力包）。 */
  private beginCellEditWithDraft(cell: CellAddress, draft: string): boolean {
    return this.cellEditController?.beginWithDraft(cell, draft) ?? false
  }

  /** 提交当前编辑（委托编辑能力包）。 */
  private commitCellEdit(moveAfter: boolean): void {
    this.cellEditController?.commitActive(moveAfter)
  }

  /** 取消当前编辑（委托编辑能力包）。 */
  private cancelCellEdit(): void {
    this.cellEditController?.cancelActive()
  }

  /** 返回导航后需要滚动到可见区域的选区目标。 */
  private getSelectionScrollTarget(): CellAddress | null {
    const selection = this.engine.getSelection()
    return selection.extentCell ?? selection.activeCell
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

  /** 确保指定单元格完整可见，必要时滚动 host。 */
  private ensureCellVisible(cell: CellAddress): void {
    const frame = this.engine.getFrame()
    const { width, height } = this.host.getContainerSize()
    const { scrollTop, scrollLeft } = this.host.getScrollPosition()
    const { logicalX, logicalY } = this.mapScrollToLogical(scrollTop, scrollLeft)

    const reveal = computeScrollReveal({
      rowIndex: cell.rowIndex,
      colIndex: cell.colIndex,
      rowsAxis: frame.rowsAxis,
      colsAxis: frame.colsAxis,
      scrollX: logicalX,
      scrollY: logicalY,
      viewportWidth: width,
      viewportHeight: height,
      headerHeight: frame.theme.metrics.headerHeight,
      rowHeaderWidth: frame.viewport.rowHeaderWidth,
    })
    if (!reveal) return

    const nextTop = this.logicalToScrollY(reveal.logicalY)
    const nextLeft = this.logicalToScrollX(reveal.logicalX)
    this.host.scrollTo(nextTop, nextLeft)
    this.handleHostScroll(nextTop, nextLeft)
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
