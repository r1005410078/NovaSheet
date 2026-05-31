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
 *   - 公开 API 面（由 `@novasheet/web` 的 `Grid` facade 包一层暴露）
 */

import type {
  AutofitRowsResult,
  DataSource,
  FilterLayer,
  FilterOp,
  Field,
  FrozenConfig,
  GridEngine,
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
  computeCellRect,
  computeFillTarget,
  computePasteTarget,
  unionRange,
  computeResizeHandles,
  computeScrollReveal,
  FrameScheduler,
  getCellContextMenuItems,
  getColumnHeaderContextMenuItems,
  getRowHeaderContextMenuItems,
  hitTestCell,
  isMutableDataSource,
  MIN_RESIZE_SIZE,
  isTypableEditKey,
  parseTsvToCells,
  serializeRowsToTsv,
  type ApplyPasteSource,
  type BorderPreset,
  type BorderStyle,
  type TextWrapMode,
  type CellAddress,
  type CellRange,
  type MergeRegion,
  type ContextMenuAction,
  type ContextMenuContext,
  type ContextMenuItem,
  type FillDirection,
  type GridSelection,
  type FillTarget,
  type PasteSkippedCell,
  type ResizeHandleRect,
  type Row,
} from '@novasheet/core'
import type { DomCellEditor } from '../interaction/DomCellEditor'
import type { DomContextMenuLayer } from '../interaction/DomContextMenuLayer'
import type { DomFillHandleLayer } from '../interaction/DomFillHandleLayer'
import type { DomHandleLayer } from '../interaction/DomHandleLayer'
import type { HideToggleHandle } from '../handle/HideToggleHandle'
import type { HideColToggleHandle } from '../handle/HideColToggleHandle'
import type { FilterPopover } from '../interaction/FilterPopover'
import type { RowHeightPopover } from '../overlay/RowHeightPopover'
import type { ColumnWidthPopover } from '../overlay/ColumnWidthPopover'
import type { ColumnReorderOverlay, ColumnReorderPreview } from '../overlay/ColumnReorderOverlay'
import type { RowReorderOverlay, RowReorderPreview } from '../overlay/RowReorderOverlay'
import type { SelectionOverlay } from '../overlay/SelectionOverlay'
import { computeFillHandleRect, computeRangeOverlayRects } from '../interaction/RangeOverlayRects'
import type { WebHost, WebKeyboardEvent, WebPointerEvent } from '../host/WebHost'
import type { WebRenderer } from '../render/WebRenderer'
import type { WebClipboardAdapter } from '../clipboard/WebClipboardAdapter'
import { ScrollMapper } from '../scroll/ScrollMapper'

/** Phase 4.1 — TSV FNV-1a 32-bit hash；用于验证 paste 时剪贴板内容是否仍是 grid 自己刚写出去的，决定 typed 缓存命中。 */
function fnv1aHash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

/** WebGridRuntime.autofitRows 入参子集（不包含 measurer，runtime 自己持有）。 */
export interface AutofitRowsRuntimeOptions {
  /** 需要重算高度的行；未传则扫描全部行。 */
  rows?: readonly number[]
  /** 自动行高允许写回的最小高度。 */
  minHeight?: number
  /** 自动行高允许写回的最大高度。 */
  maxHeight?: number
}

/** WebGridRuntime 的依赖注入参数，由 backend 装配阶段提供。 */
export interface WebGridRuntimeOptions {
  /** 核心表格状态与 mutation 引擎。 */
  engine: GridEngine
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

/** ResizeObserver 高频回调合并 key（与 `renderer:flush` 分离，同帧内先 resize 再 scroll:read） */
const HOST_RESIZE_KEY = 'host:resize'
const DRAG_AUTO_SCROLL_KEY = 'drag:auto-scroll'
const DRAG_AUTO_SCROLL_EDGE_PX = 32
const DRAG_AUTO_SCROLL_MAX_STEP_PX = 24
const COLUMN_REORDER_DRAG_THRESHOLD_PX = 6

/** 可驱动边缘自动滚动的拖拽种类。 */
type AutoScrollDragKind =
  | 'selection'
  | 'column-reorder'
  | 'row-reorder'
  | 'column-header'
  | 'row-header'
  | 'fill'

/** 去重行号并保持首次出现顺序。 */
function uniqueRows(rows: readonly number[]): readonly number[] {
  return [...new Set(rows)]
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
  /** 当前是否正在拖拽选择区域。 */
  private draggingSelection = false
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
  /** DOM 单元格编辑器。 */
  private cellEditor?: DomCellEditor
  /** DOM 右键菜单 layer。 */
  private contextMenuLayer?: DomContextMenuLayer
  /** DOM filter popover。 */
  private filterPopover?: FilterPopover
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
  /** 外部声明剪贴板可用状态，用于 legacy paste 菜单 enabled 判断。 */
  private clipboardReady = false
  /** 最近一次打开菜单时的上下文，用于菜单项点击分发。 */
  private lastContextMenuContext: ContextMenuContext | null = null
  /** 最近一次打开菜单时的屏幕坐标，用于 filter popover 锚点。 */
  private lastContextMenuPoint: { clientX: number; clientY: number } | null = null
  /** 当前打开 filter popover 绑定的 field id。 */
  private filterPopoverFieldId: string | null = null
  /** Phase 4.1 — 剪贴板读写 adapter。 */
  private clipboardAdapter?: WebClipboardAdapter
  /** 最近一次从 grid 写出的剪贴板缓存，用于 typed paste 保留值类型。 */
  private clipboardCache: { range: CellRange; rows: readonly Row[]; tsvHash: number } | null = null
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
  /**
   * 多行 wrap 字段编辑中的原始行高快照——取消时恢复，提交时丢弃。
   * 非 multiline 编辑置 null。
   */
  private editingMultilineOriginalRowHeight: number | null = null
  /** 当前 resize 拖拽状态；null 表示未拖拽。 */
  private resizeDrag: {
    /** 被拖拽的 resize handle。 */
    handle: ResizeHandleRect
    /** 捕获中的 pointer id。 */
    pointerId: number
    /** 拖拽起点 clientX。 */
    startClientX: number
    /** 拖拽起点 clientY。 */
    startClientY: number
    /** 拖拽开始时的行高/列宽。 */
    startSize: number
    /** 列：左缘 x；行：顶缘 y — 拖拽中固定，尺寸从该边向外扩 */
    anchorStart: number
    /** 拖拽预览尺寸；pointerup 时一次性 commit（spec §6.5.2） */
    previewSize: number
  } | null = null
  /** 当前 fill handle 拖拽状态；null 表示未拖拽。 */
  private fillDrag: {
    /** 捕获中的 pointer id。 */
    pointerId: number
    /** 填充源区域。 */
    source: CellRange
    /** 根据当前 hover 单元格计算出的目标；可能为空。 */
    target: FillTarget | null
    /** 最近一次 fill drag pointer。 */
    lastPointer: WebPointerEvent | null
  } | null = null
  /** 当前列重排拖拽状态；pointerdown 命中已选列头后先 seed，超过阈值才 active。 */
  private columnReorderDrag: {
    startX: number
    startY: number
    selectedFieldIds: readonly string[]
    selectedRange: CellRange
    startBandX: number
    totalWidth: number
    active: boolean
    targetBeforeFieldId: string | null | undefined
  } | null = null
  /** 当前行重排拖拽状态；pointerdown 命中已选行头后先 seed，超过阈值才 active。 */
  private rowReorderDrag: {
    startX: number
    startY: number
    rowIds: readonly number[]
    selectedRange: CellRange
    startBandY: number
    totalHeight: number
    active: boolean
    targetBeforeRowId: number | null | undefined
  } | null = null
  /** 当前列头拖选状态；仅用于形成连续整列选区，不触发 reorder。 */
  private columnHeaderSelectDrag: {
    anchorCol: number
  } | null = null
  /** 当前行头拖选状态；仅用于形成连续整行选区。 */
  private rowHeaderSelectDrag: {
    anchorRow: number
  } | null = null

  /** 创建 runtime 并保存 backend 注入的 engine/host/renderer/layer 依赖。 */
  constructor(opts: WebGridRuntimeOptions) {
    this.engine = opts.engine
    this.host = opts.host
    this.renderer = opts.renderer
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
    this.scrollMapper = new ScrollMapper()
  }

  /** Phase 3.5 — backend 在 runtime 创建后注入编辑器。 */
  setCellEditor(editor: DomCellEditor): void {
    this.cellEditor = editor
    this.syncCellEditorTheme()
  }

  /** Phase 4.0 — 注入右键菜单层。 */
  setContextMenuLayer(layer: DomContextMenuLayer): void {
    this.contextMenuLayer = layer
    this.syncContextMenuTheme()
  }

  /** 注入 filter popover 并同步当前主题。 */
  setFilterPopover(popover: FilterPopover): void {
    this.filterPopover = popover
    this.syncFilterPopoverTheme()
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

  /** 设置外部剪贴板可用提示，用于右键菜单 paste 项状态。 */
  setClipboardReady(ready: boolean): void {
    this.clipboardReady = ready
  }

  /** 关闭右键菜单并清理最近菜单上下文。 */
  closeContextMenu(): void {
    this.contextMenuLayer?.close()
    this.lastContextMenuContext = null
  }

  /** Phase 4.1 — 注入 clipboard adapter；未注入时 copy/cut/paste 全 silent no-op。 */
  setClipboardAdapter(adapter: WebClipboardAdapter): void {
    this.clipboardAdapter = adapter
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

  /** Phase 4.5 — 执行行头右键菜单动作。 */
  invokeRowHeaderContextMenuAction(id: string, ctx: { targetRowIndex: number }): void {
    const sel = this.engine.getSelection().selectedRange
    const startRow = sel?.startRow ?? ctx.targetRowIndex
    const endRow = sel?.endRow ?? ctx.targetRowIndex
    const underlying: number[] = []
    for (let r = startRow; r <= endRow; r++) {
      underlying.push(this.engine.getData().resolveUnderlyingRow?.(r) ?? r)
    }
    const sortedIds = [...new Set(underlying)].sort((a, b) => a - b)
    if (id === 'insert-above') {
      const at = this.engine.getData().resolveUnderlyingRow?.(startRow) ?? startRow
      this.insertRows(at, endRow - startRow + 1)
    } else if (id === 'insert-below') {
      const at = (this.engine.getData().resolveUnderlyingRow?.(endRow) ?? endRow) + 1
      this.insertRows(at, endRow - startRow + 1)
    } else if (id === 'delete-rows') {
      this.deleteRows(sortedIds)
    } else if (id === 'hide-rows') {
      this.hideRows(sortedIds)
    } else if (id === 'unhide-rows') {
      const hiddenSet = new Set(this.engine.getHiddenRows())
      const toUnhide = sortedIds.filter((id) => hiddenSet.has(id))
      this.unhideRows(toUnhide)
    } else if (id === 'resize-row-height') {
      if (!this.rowHeightPopover || sortedIds.length === 0) return
      this.pendingRowHeightIds = sortedIds
      const currentHeight = this.engine.getRowHeight(sortedIds[0]!)
      const pt = this.lastContextMenuPoint
      const triggerRect = pt
        ? { x: pt.clientX, y: pt.clientY, width: 0, height: 0 }
        : { x: 100, y: 100, width: 0, height: 0 }
      this.rowHeightPopover.open(triggerRect, currentHeight)
    }
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

  /** Phase 4.6 — 执行列头右键菜单动作。 */
  invokeColumnHeaderContextMenuAction(id: string, ctx: { targetColIndex: number }): void {
    const sel = this.engine.getSelection().selectedRange
    const startCol = sel?.startCol ?? ctx.targetColIndex
    const endCol = sel?.endCol ?? ctx.targetColIndex
    const fieldIds: string[] = []
    for (let viewCol = startCol; viewCol <= endCol; viewCol += 1) {
      const fieldId = this.viewColToFieldId(viewCol)
      if (fieldId) fieldIds.push(fieldId)
    }
    const count = endCol - startCol + 1
    if (id === 'insert-col-left') {
      this.insertCols(this.rawSchemaIndexBeforeViewCol(startCol), count)
    } else if (id === 'insert-col-right') {
      this.insertCols(this.rawSchemaIndexAfterViewCol(endCol), count)
    } else if (id === 'delete-cols') {
      this.deleteCols(fieldIds)
    } else if (id === 'hide-cols') {
      this.hideCols(fieldIds)
    } else if (id === 'unhide-cols') {
      this.unhideCols(this.collectHiddenInViewColRange(startCol, endCol))
    } else if (id === 'resize-column-width') {
      if (!this.columnWidthPopover || fieldIds.length === 0) return
      this.pendingColumnWidthFieldIds = fieldIds
      const fields = this.engine.getData().getSchema().fields
      const currentWidth = fields.find((field) => field.id === fieldIds[0])?.width ?? 100
      const point = this.lastContextMenuPoint
      const triggerRect = point
        ? { x: point.clientX, y: point.clientY, width: 0, height: 0 }
        : { x: 100, y: 100, width: 0, height: 0 }
      this.columnWidthPopover.open(triggerRect, currentWidth)
    }
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

  /** snapshot 当前 selectedRange 的值 + TSV；selection 空返回 null。 */
  private snapshotSelection(): { range: CellRange; rows: Row[]; tsv: string } | null {
    const sel = this.engine.getSelection()
    const range = sel.selectedRange
    if (!range) return null
    const data = this.engine.getData()
    const fields = data.getSchema().fields
    const fieldIds = fields.slice(range.startCol, range.endCol + 1).map((f) => f.id)
    const rows: Row[] = []
    for (let r = range.startRow; r <= range.endRow; r++) {
      const row: Row = {}
      for (const fid of fieldIds) row[fid] = data.getCell(r, fid) ?? null
      rows.push(row)
    }
    return { range, rows, tsv: serializeRowsToTsv(rows, fieldIds) }
  }

  /** 处理 copy：序列化当前选区、写入剪贴板并更新 typed paste 缓存。 */
  async handleClipboardCopy(): Promise<boolean> {
    if (this.destroyed) return false
    const snap = this.snapshotSelection()
    if (!snap) return false
    this.clipboardCache = { range: snap.range, rows: snap.rows, tsvHash: fnv1aHash(snap.tsv) }
    await this.clipboardAdapter?.writeText(snap.tsv)
    this.onCopy?.(snap.range)
    return true
  }

  /** 处理 cut：复制当前选区后清空源区域。 */
  async handleClipboardCut(): Promise<boolean> {
    if (this.destroyed) return false
    if (!isMutableDataSource(this.engine.getData())) return false
    const snap = this.snapshotSelection()
    if (!snap) return false
    this.clipboardCache = { range: snap.range, rows: snap.rows, tsvHash: fnv1aHash(snap.tsv) }
    await this.clipboardAdapter?.writeText(snap.tsv)
    this.engine.clearRange(snap.range)
    this.afterEngineMutation()
    this.onCut?.(snap.range)
    return true
  }

  /** 处理 paste：读取剪贴板、推导目标区域并提交到 engine。 */
  async handleClipboardPaste(): Promise<boolean> {
    if (this.destroyed) return false
    const data = this.engine.getData()
    if (!isMutableDataSource(data)) return false
    const sel = this.engine.getSelection()
    const active = sel.activeCell
    const range = sel.selectedRange
    if (!active || !range) return false

    const tsv = (await this.clipboardAdapter?.readText()) ?? ''
    if (tsv === '') return false

    const schema = data.getSchema()
    const fields = schema.fields
    const fieldIdsAtCols = fields.map((f) => f.id)
    const tsvHash = fnv1aHash(tsv)
    let source: ApplyPasteSource

    if (this.clipboardCache && this.clipboardCache.tsvHash === tsvHash) {
      const cachedRange = this.clipboardCache.range
      const cachedFieldIds = fields
        .slice(cachedRange.startCol, cachedRange.endCol + 1)
        .map((f) => f.id)
      const cells = this.clipboardCache.rows.map((row) =>
        cachedFieldIds.map((fid) => row[fid] ?? null),
      )
      source = { cells, sourceFieldIds: cachedFieldIds, typed: true }
    } else {
      const anchorFieldIds = fieldIdsAtCols.slice(active.colIndex)
      const cells = parseTsvToCells(tsv, anchorFieldIds, schema)
      source = { cells, sourceFieldIds: anchorFieldIds, typed: false }
    }

    const sourceRows = source.cells.length
    const sourceCols = source.cells[0]?.length ?? 0
    if (sourceRows === 0 || sourceCols === 0) return false

    const target = computePasteTarget(active, range, sourceRows, sourceCols, {
      rowCount: data.getRowCount(),
      colCount: fields.length,
    })

    this.engine.commitPaste(source, target, fieldIdsAtCols, (skipped) =>
      this.onPasteSkipped?.(skipped),
    )
    this.afterEngineMutation()
    const targetRange: CellRange = {
      startRow: target.startRow,
      endRow: target.endRow,
      startCol: target.startCol,
      endCol: target.endCol,
    }
    this.onPaste?.(targetRange)
    return true
  }

  /** 处理 host contextmenu 事件，并根据列头/单元格命中打开对应菜单。 */
  handleHostContextMenu(event: WebPointerEvent): void {
    if (this.destroyed) return
    if (!this.contextMenuLayer) return
    if (this.resizeDrag || this.draggingSelection) return

    if (this.engine.isCellEditing()) {
      this.commitCellEdit(false)
    }

    const frame = this.engine.getFrame()
    const headerHeight = frame.theme.metrics.headerHeight
    if (event.y < headerHeight) {
      if (!this.viewPipeline) return
      const fields = frame.data.getSchema().fields
      const rowHeaderWidth = frame.viewport.rowHeaderWidth ?? 0
      if (event.x < rowHeaderWidth) return
      const scrollX = frame.viewport.scrollX ?? 0
      const logicalX = event.x - rowHeaderWidth + scrollX
      if (logicalX < 0 || logicalX >= frame.colsAxis.getTotalSize()) return
      const colIndex = frame.colsAxis.positionToIndex(logicalX)
      if (colIndex < 0 || colIndex >= fields.length) return
      const field = fields[colIndex]
      if (!field) return
      const sel = this.engine.getSelection().selectedRange
      const startCol = sel?.startCol ?? colIndex
      const endCol = sel?.endCol ?? colIndex
      const ctx: ContextMenuContext = {
        targetKind: 'columnHeader',
        field,
        colIndex,
        multiSelect: field.type === 'multiSelect',
        selectedColCount: endCol - startCol + 1,
        hasHiddenInSelection: this.collectHiddenInViewColRange(startCol, endCol).length > 0,
      }
      this.lastContextMenuContext = ctx
      this.lastContextMenuPoint = {
        clientX: event.clientX ?? event.x,
        clientY: event.clientY ?? event.y,
      }
      const items = getColumnHeaderContextMenuItems(ctx, this.viewPipeline)
      this.contextMenuLayer.open({
        clientX: event.clientX ?? event.x,
        clientY: event.clientY ?? event.y,
        items,
      })
      return
    }

    // Phase 4.5 — 行头区域（x < rowHeaderWidth，y >= headerHeight）右键：选中整行并打开行头菜单
    const rowHeaderWidth = frame.viewport.rowHeaderWidth ?? 0
    if (rowHeaderWidth > 0 && event.x < rowHeaderWidth) {
      const scrollY = frame.viewport.scrollY ?? 0
      const logicalY = event.y - headerHeight + scrollY
      if (logicalY >= 0) {
        const rowIndex = frame.rowsAxis.positionToIndex(logicalY)
        const colCount = frame.data.getSchema().fields.length
        if (rowIndex >= 0 && rowIndex < frame.rowsAxis.getCount() && colCount > 0) {
          // 选中整行
          this.engine.setSelection({
            activeCell: { rowIndex, colIndex: 0 },
            anchorCell: { rowIndex, colIndex: 0 },
            extentCell: { rowIndex, colIndex: colCount - 1 },
            selectedRange: { startRow: rowIndex, endRow: rowIndex, startCol: 0, endCol: colCount - 1 },
          })
          this.afterEngineMutation()
          const ctx: ContextMenuContext = { targetKind: 'rowHeader', targetRowIndex: rowIndex }
          this.lastContextMenuContext = ctx
          this.lastContextMenuPoint = {
            clientX: event.clientX ?? event.x,
            clientY: event.clientY ?? event.y,
          }
          const hiddenSet = new Set(this.engine.getHiddenRows())
          const sel = this.engine.getSelection().selectedRange!
          let hasHidden = false
          for (let r = sel.startRow; r <= sel.endRow && !hasHidden; r++) {
            const underlying = this.engine.getData().resolveUnderlyingRow?.(r) ?? r
            if (hiddenSet.has(underlying)) hasHidden = true
          }
          const n = sel.endRow - sel.startRow + 1
          const items = getRowHeaderContextMenuItems(n, hasHidden)
          this.contextMenuLayer.open({
            clientX: event.clientX ?? event.x,
            clientY: event.clientY ?? event.y,
            items,
          })
        }
      }
      return
    }

    const hit = hitTestCell(frame, event)
    if (!hit) return
    if (hit.colIndex < 0 || hit.rowIndex < 0) return

    const selection = this.engine.getSelection()
    const range = selection.selectedRange
    const inRange =
      range !== null &&
      hit.rowIndex >= range.startRow &&
      hit.rowIndex <= range.endRow &&
      hit.colIndex >= range.startCol &&
      hit.colIndex <= range.endCol
    if (!inRange) {
      this.engine.selectCell(hit)
      this.afterEngineMutation()
    }

    const newSelection = this.engine.getSelection()
    // Phase 4.1：Paste 项 enabled 与否取决于 DataSource 是否可写——外部剪贴板有没有内容
    // runtime 同步不可知（异步 readText 才能确定）；consumer 显式 setClipboardReady(true)
    // 也走这条 OR 路径，保留 4.0 兼容
    const dataMutable = isMutableDataSource(this.engine.getData())
    const ctx: ContextMenuContext = {
      targetKind: 'cell',
      cell: hit,
      selectedRange: newSelection.selectedRange,
      hasSelection: newSelection.activeCell !== null,
      clipboardReady: dataMutable || this.clipboardReady,
    }
    this.lastContextMenuContext = ctx
    this.lastContextMenuPoint = {
      clientX: event.clientX ?? event.x,
      clientY: event.clientY ?? event.y,
    }
    const items = getCellContextMenuItems(ctx)
    this.contextMenuLayer.open({
      clientX: event.clientX ?? event.x,
      clientY: event.clientY ?? event.y,
      items,
    })
  }

  /** 处理右键菜单项选择，优先执行内置 sort/filter/clipboard 行为。 */
  handleContextMenuSelected(id: ContextMenuAction): void {
    const ctx = this.lastContextMenuContext
    if (ctx?.targetKind === 'rowHeader') {
      this.invokeRowHeaderContextMenuAction(id, { targetRowIndex: ctx.targetRowIndex })
      return
    }
    if (ctx?.targetKind === 'columnHeader') {
      if (id === 'sort-asc') {
        this.sortLayer?.setSpec({ fieldId: ctx.field.id, direction: 'asc' })
        return
      }
      if (id === 'sort-desc') {
        this.sortLayer?.setSpec({ fieldId: ctx.field.id, direction: 'desc' })
        return
      }
      if (id === 'sort-none') {
        if (this.sortLayer?.getSpec()?.fieldId === ctx.field.id) this.sortLayer.setSpec(null)
        return
      }
      if (id === 'filter-clear') {
        this.filterLayer?.clear(ctx.field.id)
        return
      }
      if (id === 'filter-open') {
        this.openFilterPopover(ctx)
        return
      }
      if (
        id === 'insert-col-left' ||
        id === 'insert-col-right' ||
        id === 'delete-cols' ||
        id === 'hide-cols' ||
        id === 'unhide-cols' ||
        id === 'resize-column-width'
      ) {
        this.invokeColumnHeaderContextMenuAction(id, { targetColIndex: ctx.colIndex })
        return
      }
    }

    // Phase 4.1：consumer 传了 callback 完全接管；没传走默认引擎
    if (this.onContextMenuAction) {
      if (ctx) this.onContextMenuAction(id, ctx)
      return
    }
    if (id === 'copy') {
      void this.handleClipboardCopy()
      return
    }
    if (id === 'cut') {
      void this.handleClipboardCut()
      return
    }
    if (id === 'paste') {
      void this.handleClipboardPaste()
    }
  }

  /** 应用 filter popover 返回的条件；null 表示清除当前列筛选。 */
  handleFilterPopoverApply(op: FilterOp | null): void {
    const fieldId = this.filterPopoverFieldId
    if (!fieldId) return
    if (op) this.filterLayer?.setSpec({ fieldId, op })
    else this.filterLayer?.clear(fieldId)
    this.filterPopoverFieldId = null
  }

  /** 打开列头 filter popover；未注入 popover 时回退到外部 action 回调。 */
  private openFilterPopover(
    ctx: Extract<ContextMenuContext, { targetKind: 'columnHeader' }>,
  ): void {
    if (!this.filterPopover) {
      this.onContextMenuAction?.('filter-open', ctx)
      return
    }
    const point = this.lastContextMenuPoint ?? { clientX: 0, clientY: 0 }
    const currentSpec = this.filterLayer?.getSpec()
    this.filterPopoverFieldId = ctx.field.id
    this.contextMenuLayer?.close()
    this.fillLayer?.hidePreview()
    this.columnReorderOverlay?.hide()
    this.filterPopover.open(point, {
      field: ctx.field,
      op: currentSpec?.fieldId === ctx.field.id ? currentSpec.op : null,
    })
  }

  /** 按单元格坐标程序化打开右键菜单，锚点位于单元格右下角。 */
  openContextMenuAt(rowIndex: number, fieldId: string): void {
    if (this.destroyed || !this.contextMenuLayer) return
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
    this.syncCellEditorTheme()
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
    this.clipboardCache = null
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
    this.clipboardCache = null
    this.afterEngineMutation()
  }

  /** 应用主题到 engine、renderer 与所有 DOM overlay layer。 */
  setTheme(theme: Theme, patchRenderer?: (renderer: WebRenderer) => void): void {
    this.engine.setTheme(theme)
    patchRenderer?.(this.renderer)
    this.syncScrollbarTheme()
    this.syncResizeHandleTheme()
    this.syncCellEditorTheme()
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

  /** 设置冻结行列配置并刷新视图。 */
  setFrozen(config: Partial<FrozenConfig>): void
  /** 以行列数量设置冻结区域并刷新视图。 */
  setFrozen(rows: number, cols: number): void
  /** 应用冻结区域重载参数并执行 mutation 收尾。 */
  setFrozen(configOrRows: Partial<FrozenConfig> | number, cols = 0): void {
    if (typeof configOrRows === 'number') this.engine.setFrozen(configOrRows, cols)
    else this.engine.setFrozen(configOrRows)
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
    this.contextMenuLayer?.close()
    this.fillLayer?.hidePreview()
    this.columnHeaderSelectDrag = null
    this.rowHeaderSelectDrag = null
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
    const startSize = this.readResizeSize(handle)
    if (startSize === null) return

    const edge =
      handle.kind === 'column' ? handle.x + handle.width / 2 : handle.y + handle.height / 2
    this.resizeDrag = {
      handle,
      pointerId,
      startClientX: clientX,
      startClientY: clientY,
      startSize,
      anchorStart: edge - startSize,
      previewSize: startSize,
    }
    this.draggingSelection = false
    this.showResizeIndicator(startSize)
  }

  /** 更新 resize 拖拽预览尺寸。 */
  handleResizePointerMove(pointerId: number, clientX: number, clientY: number): void {
    if (this.destroyed || !this.resizeDrag || this.resizeDrag.pointerId !== pointerId) return
    const nextSize = this.computeResizeSize(this.resizeDrag, clientX, clientY)
    this.resizeDrag.previewSize = nextSize
    this.showResizeIndicator(nextSize)
  }

  /** 结束 resize 拖拽并一次性提交行高/列宽变更。 */
  handleResizePointerUp(pointerId: number): void {
    if (!this.resizeDrag || this.resizeDrag.pointerId !== pointerId) return
    const { handle, startSize, previewSize } = this.resizeDrag
    this.resizeDrag = null
    this.handleLayer?.hideIndicator()
    if (previewSize === startSize) return
    if (handle.kind === 'row' && handle.rowIndex !== undefined) {
      this.engine.commitRowResize(handle.rowIndex, startSize, previewSize)
    } else if (handle.kind === 'column' && handle.fieldId) {
      const colIndex = this.engine.getColumnIndex(handle.fieldId)
      if (colIndex < 0) return
      this.engine.commitColumnResize(colIndex, startSize, previewSize)
    }
    this.afterEngineMutation()
  }

  /** 开始 fill handle 拖拽。 */
  handleFillPointerDown(pointerId: number, clientX: number, clientY: number): void {
    if (this.destroyed || this.resizeDrag || this.draggingSelection) return
    if (this.engine.isCellEditing()) this.commitCellEdit(false)
    const source = this.engine.getSelection().selectedRange
    if (!source) return
    this.closeContextMenu()
    this.draggingSelection = false
    const pointer = this.fillPointerFromClient(clientX, clientY)
    this.fillDrag = {
      pointerId,
      source,
      target: null,
      lastPointer: pointer,
    }
  }

  /** 更新 fill handle 拖拽目标与预览 overlay。 */
  handleFillPointerMove(pointerId: number, clientX: number, clientY: number): void {
    if (this.destroyed || !this.fillDrag || this.fillDrag.pointerId !== pointerId) return
    this.applyFillPointerMove(this.fillPointerFromClient(clientX, clientY))
  }

  /** 用已转换的 host pointer 重算填充目标；供指针移动与边缘自动滚动 tick 复用。 */
  private applyFillPointerMove(pointer: WebPointerEvent): void {
    if (!this.fillDrag) return
    this.fillDrag.lastPointer = pointer
    this.lastDragPointer = pointer
    this.updateDragAutoScroll(pointer) // 填充柄拖到边缘时双向自动滚动
    const frame = this.engine.getFrame()
    const hit = hitTestCell(frame, pointer)
    if (!hit) return
    const data = this.engine.getData()
    const snap = this.engine.getFillMergeSnap(this.fillDrag.source)
    // 源含合并时，若光标落在已有合并区上，把填充区吸附到该合并边界（避免截断目标合并）。
    const onMergeSource = snap.rowSpan > 1 || snap.colSpan > 1
    const targetMerge = onMergeSource
      ? frame.mergeRegions?.find((region) => cellInRange(hit, region.range))?.range
      : undefined
    this.fillDrag.target = computeFillTarget(
      this.fillDrag.source,
      hit,
      {
        rowCount: data.getRowCount(),
        colCount: data.getSchema().fields.length,
      },
      snap,
      targetMerge,
    )
    if (this.fillDrag.target) {
      this.fillLayer?.showPreview(
        computeRangeOverlayRects(this.engine.getFrame(), this.fillDrag.target.fill),
      )
    } else {
      this.fillLayer?.hidePreview()
    }
  }

  /** 结束 fill handle 拖拽并提交填充结果。 */
  handleFillPointerUp(pointerId: number): void {
    if (!this.fillDrag || this.fillDrag.pointerId !== pointerId) return
    const target = this.fillDrag.target
    this.fillDrag = null
    this.columnReorderDrag = null
    this.rowReorderDrag = null
    this.columnHeaderSelectDrag = null
    this.rowHeaderSelectDrag = null
    this.stopDragAutoScroll()
    this.fillLayer?.hidePreview()
    this.columnReorderOverlay?.hide()
    this.rowReorderOverlay?.hide()
    if (!target) return
    const result = this.engine.commitFill(target.source, target.fill, target.direction)
    if (!result) return
    // 填充可能写入 wrap 文本；只对实际 touched rows 重算行高，避免拖一次就全表 autofit。
    const autofit = this.autofitRows({ rows: uniqueRows(result.writes.map((w) => w.rowIndex)) })
    if (autofit.changedRows === 0) this.afterEngineMutation()
    this.onFill?.({
      source: target.source,
      fill: target.fill,
      result: target.result,
      direction: target.direction,
    })
  }

  /** 将 client 坐标转换成 host 内部 pointer 坐标。 */
  private fillPointerFromClient(clientX: number, clientY: number): WebPointerEvent {
    const rect = this.host.getContainerBoundingRect()
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
      clientX,
      clientY,
      shiftKey: false,
    }
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
    this.cancelCellEdit()
    this.resizeDrag = null
    this.fillDrag = null
    this.columnReorderDrag = null
    this.rowReorderDrag = null
    this.columnHeaderSelectDrag = null
    this.rowHeaderSelectDrag = null
    this.fillLayer?.hidePreview()
    this.columnReorderOverlay?.hide()
    this.rowReorderOverlay?.hide()
    this.scheduler.cancel('renderer:flush')
    this.scheduler.cancel(HOST_RESIZE_KEY)
    this.scheduler.cancel(DRAG_AUTO_SCROLL_KEY)
    this.renderer.destroy()
    this.host.destroy()
  }

  /** 处理 host 滚动事件，映射为逻辑滚动并触发重绘。 */
  handleHostScroll(scrollTop: number, scrollLeft: number): void {
    const { logicalX, logicalY } = this.mapScrollToLogical(scrollTop, scrollLeft)
    this.engine.setScroll(logicalX, logicalY)
    this.syncCellEditorPosition()
    this.contextMenuLayer?.close()
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
    if (this.tryHandleColumnHeaderPointerDown(event)) return
    if (this.engine.isCellEditing()) {
      this.commitCellEdit(false)
    }
    if (this.tryHandleRowHeaderPointerDown(event)) return
    const hit = hitTestCell(this.engine.getFrame(), event)
    if (!hit) return
    if (event.shiftKey) this.engine.selectCell(hit, { extend: true })
    else this.engine.selectCell(hit)
    this.lastDragPointer = event
    this.refresh()
  }

  /** 处理 host pointermove，更新拖拽选区并启动边缘自动滚动。 */
  handleHostPointerMove(event: WebPointerEvent): void {
    if (this.updateColumnReorderDrag(event)) return
    if (this.updateRowReorderDrag(event)) return
    if (this.updateColumnHeaderSelectDrag(event)) return
    if (this.updateRowHeaderSelectDrag(event)) return
    if (this.destroyed) return
    if (!this.lastDragPointer) {
      this.updateHeaderCursor(event)
      return
    }
    this.draggingSelection = true
    this.lastDragPointer = event
    const hit = hitTestCell(this.engine.getFrame(), event)
    if (hit) {
      this.engine.selectCell(hit, { extend: true })
      this.refresh()
    }
    this.updateDragAutoScroll(event)
  }

  /** 处理 host pointerup，结束选区拖拽并恢复 fill handle。 */
  handleHostPointerUp(): void {
    if (this.columnReorderDrag) {
      this.commitColumnReorderDrag()
      return
    }
    if (this.rowReorderDrag) {
      this.commitRowReorderDrag()
      return
    }
    if (this.columnHeaderSelectDrag) {
      this.columnHeaderSelectDrag = null
      this.stopDragAutoScroll()
      return
    }
    if (this.rowHeaderSelectDrag) {
      this.rowHeaderSelectDrag = null
      this.stopDragAutoScroll()
      return
    }
    this.draggingSelection = false
    this.stopDragAutoScroll()
    this.syncFillHandle()
  }

  /** 处理双击单元格，进入编辑模式。 */
  handleHostDoubleClick(event: WebPointerEvent): void {
    if (this.destroyed || this.resizeDrag || this.draggingSelection) return
    const hit = hitTestCell(this.engine.getFrame(), event)
    if (!hit) return
    this.engine.selectCell(hit)
    this.openCellEditor(hit, { selectAll: false })
  }

  /** Phase 3.3 / 3.5 — 导航；选中后直接键入进入编辑（Sheets 式）。 */
  handleHostKeyDown(event: WebKeyboardEvent): boolean {
    if (this.destroyed) return false
    if (event.key === 'Escape' && this.columnReorderDrag) {
      this.cancelColumnReorderDrag()
      return true
    }
    if (event.key === 'Escape' && this.rowReorderDrag) {
      this.cancelRowReorderDrag()
      return true
    }
    if (this.filterPopover?.isOpen()) return false
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

  private tryHandleColumnHeaderPointerDown(event: WebPointerEvent): boolean {
    if (this.resizeDrag || this.draggingSelection || this.fillDrag) return false
    const hit = this.hitTestColumnHeader(event)
    if (!hit) return false
    if (this.engine.isCellEditing()) this.commitCellEdit(false)

    const selection = this.engine.getSelection()
    const range = selection.selectedRange
    if (event.shiftKey) {
      const anchorCol =
        range && this.isWholeColumnSelection(range) ? selection.anchorCell?.colIndex : undefined
      this.selectWholeColumnRange(anchorCol ?? hit.colIndex, hit.colIndex)
      this.columnHeaderSelectDrag = { anchorCol: anchorCol ?? hit.colIndex }
      this.refresh()
      return true
    }

    if (
      !range ||
      !this.isWholeColumnSelection(range) ||
      hit.colIndex < range.startCol ||
      hit.colIndex > range.endCol
    ) {
      this.selectWholeColumn(hit.colIndex)
      this.columnHeaderSelectDrag = { anchorCol: hit.colIndex }
      this.refresh()
      return true
    }

    const fields = this.engine.getFrame().data.getSchema().fields
    const selectedFieldIds = fields
      .slice(range.startCol, range.endCol + 1)
      .map((field) => field.id)
    if (selectedFieldIds.length === 0) return true
    const startBandX = this.getColViewportX(range.startCol)
    const totalWidth = this.sumVisibleColWidths(range.startCol, range.endCol)
    this.columnReorderDrag = {
      startX: event.x,
      startY: event.y,
      selectedFieldIds,
      selectedRange: range,
      startBandX,
      totalWidth,
      active: false,
      targetBeforeFieldId: null,
    }
    this.columnReorderOverlay?.show({
      lineX: startBandX,
      dragBandX: startBandX,
      bandWidth: totalWidth,
      height: this.host.getContainerSize().height,
    })
    this.host.setCursor('grabbing')
    this.closeContextMenu()
    return true
  }

  private updateColumnHeaderSelectDrag(event: WebPointerEvent): boolean {
    const drag = this.columnHeaderSelectDrag
    if (!drag) return false
    this.lastDragPointer = event
    this.updateDragAutoScroll(event) // 拖到左/右边缘时横向自动滚动
    const hit = this.hitTestColumnHeader(event)
    if (!hit) return true
    this.selectWholeColumnRange(drag.anchorCol, hit.colIndex)
    this.refresh()
    return true
  }

  private tryHandleRowHeaderPointerDown(event: WebPointerEvent): boolean {
    if (this.resizeDrag || this.draggingSelection || this.fillDrag) return false
    const hit = this.hitTestRowHeader(event)
    if (!hit) return false

    const selection = this.engine.getSelection()
    const range = selection.selectedRange
    if (
      !event.shiftKey &&
      range &&
      this.isWholeRowSelection(range) &&
      hit.rowIndex >= range.startRow &&
      hit.rowIndex <= range.endRow
    ) {
      const rowIds = Array.from(
        { length: range.endRow - range.startRow + 1 },
        (_, index) => range.startRow + index,
      )
      const startBandY = this.getRowViewportY(range.startRow)
      const totalHeight = this.sumVisibleRowHeights(range.startRow, range.endRow)
      this.rowReorderDrag = {
        startX: event.x,
        startY: event.y,
        rowIds,
        selectedRange: range,
        startBandY,
        totalHeight,
        active: false,
        targetBeforeRowId: null,
      }
      this.rowReorderOverlay?.show({
        lineY: startBandY,
        dragBandY: startBandY,
        bandHeight: totalHeight,
        width: this.host.getContainerSize().width,
      })
      this.host.setCursor('grabbing')
      this.closeContextMenu()
      return true
    }

    const anchorRow =
      event.shiftKey && range && this.isWholeRowSelection(range)
        ? selection.anchorCell?.rowIndex ?? hit.rowIndex
        : hit.rowIndex

    this.selectWholeRowRange(anchorRow, hit.rowIndex)
    this.rowHeaderSelectDrag = { anchorRow }
    this.refresh()
    return true
  }

  private updateRowHeaderSelectDrag(event: WebPointerEvent): boolean {
    const drag = this.rowHeaderSelectDrag
    if (!drag) return false
    this.lastDragPointer = event
    this.updateDragAutoScroll(event) // 拖到上/下边缘时纵向自动滚动
    const hit = this.hitTestRowHeader(event)
    if (!hit) return true
    this.selectWholeRowRange(drag.anchorRow, hit.rowIndex)
    this.refresh()
    return true
  }

  private updateRowReorderDrag(event: WebPointerEvent): boolean {
    const drag = this.rowReorderDrag
    if (!drag) return false
    if (!drag.active) {
      const dx = event.x - drag.startX
      const dy = event.y - drag.startY
      if (Math.hypot(dx, dy) < COLUMN_REORDER_DRAG_THRESHOLD_PX) {
        this.rowReorderOverlay?.show({
          lineY: drag.startBandY,
          dragBandY: drag.startBandY + dy,
          bandHeight: drag.totalHeight,
          width: this.host.getContainerSize().width,
        })
        this.host.setCursor('grabbing')
        return true
      }
      drag.active = true
    }

    // active 拖拽：记录 pointer 并按边缘热区驱动纵向自动滚动。
    this.lastDragPointer = event
    this.updateDragAutoScroll(event)

    const target = this.computeRowReorderTarget(event, drag)
    if (!target) {
      drag.targetBeforeRowId = undefined
      this.rowReorderOverlay?.show({
        lineY: drag.startBandY,
        dragBandY: drag.startBandY + (event.y - drag.startY),
        bandHeight: drag.totalHeight,
        width: this.host.getContainerSize().width,
      })
      this.host.setCursor('grabbing')
      return true
    }
    drag.targetBeforeRowId = target.beforeRowId
    this.rowReorderOverlay?.show(target.preview)
    this.host.setCursor('grabbing')
    return true
  }

  private updateColumnReorderDrag(event: WebPointerEvent): boolean {
    const drag = this.columnReorderDrag
    if (!drag) return false
    if (!drag.active) {
      const dx = event.x - drag.startX
      const dy = event.y - drag.startY
      if (Math.hypot(dx, dy) < COLUMN_REORDER_DRAG_THRESHOLD_PX) {
        this.columnReorderOverlay?.show({
          lineX: drag.startBandX,
          dragBandX: drag.startBandX + dx,
          bandWidth: drag.totalWidth,
          height: this.host.getContainerSize().height,
        })
        this.host.setCursor('grabbing')
        return true
      }
      drag.active = true
    }

    // active 拖拽：记录 pointer 并按边缘热区驱动横向自动滚动。
    this.lastDragPointer = event
    this.updateDragAutoScroll(event)

    const target = this.computeColumnReorderTarget(event, drag)
    if (!target) {
      drag.targetBeforeFieldId = undefined
      this.columnReorderOverlay?.show({
        lineX: drag.startBandX,
        dragBandX: drag.startBandX + (event.x - drag.startX),
        bandWidth: drag.totalWidth,
        height: this.host.getContainerSize().height,
      })
      this.host.setCursor('grabbing')
      return true
    }
    drag.targetBeforeFieldId = target.beforeFieldId
    this.columnReorderOverlay?.show(target.preview)
    this.host.setCursor('grabbing')
    return true
  }

  private commitColumnReorderDrag(): void {
    const drag = this.columnReorderDrag
    this.columnReorderDrag = null
    this.stopDragAutoScroll()
    this.columnReorderOverlay?.hide()
    this.host.setCursor(null)
    if (!drag?.active) return
    if (drag.targetBeforeFieldId === undefined) return
    if (this.engine.moveCols(drag.selectedFieldIds, drag.targetBeforeFieldId)) {
      this.afterEngineMutation()
    }
  }

  private cancelColumnReorderDrag(): void {
    this.columnReorderDrag = null
    this.stopDragAutoScroll()
    this.columnReorderOverlay?.hide()
    this.host.setCursor(null)
  }

  private commitRowReorderDrag(): void {
    const drag = this.rowReorderDrag
    this.rowReorderDrag = null
    this.stopDragAutoScroll()
    this.rowReorderOverlay?.hide()
    this.host.setCursor(null)
    if (!drag?.active) return
    if (drag.targetBeforeRowId === undefined) return
    if (this.engine.moveRows(drag.rowIds, drag.targetBeforeRowId)) {
      this.afterEngineMutation()
    }
  }

  private cancelRowReorderDrag(): void {
    this.rowReorderDrag = null
    this.stopDragAutoScroll()
    this.rowReorderOverlay?.hide()
    this.host.setCursor(null)
  }

  /** 取消正在排队的拖拽自动滚动并清掉 pointer 记录。 */
  private stopDragAutoScroll(): void {
    this.scheduler.cancel(DRAG_AUTO_SCROLL_KEY)
    this.lastDragPointer = null
  }

  private updateHeaderCursor(event: WebPointerEvent): void {
    if (this.resizeDrag || this.draggingSelection || this.fillDrag) {
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

  private hitTestColumnHeader(event: WebPointerEvent): { colIndex: number; fieldId: string } | null {
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

  private sumVisibleColWidths(startCol: number, endCol: number): number {
    const axis = this.engine.getFrame().colsAxis
    let total = 0
    for (let col = startCol; col <= endCol; col += 1) total += axis.getSize(col)
    return total
  }

  private sumVisibleRowHeights(startRow: number, endRow: number): number {
    const axis = this.engine.getFrame().rowsAxis
    let total = 0
    for (let row = startRow; row <= endRow; row += 1) total += axis.getSize(row)
    return total
  }

  private computeColumnReorderTarget(
    event: WebPointerEvent,
    drag: NonNullable<WebGridRuntime['columnReorderDrag']>,
  ): { beforeFieldId: string | null; preview: ColumnReorderPreview } | null {
    const frame = this.engine.getFrame()
    const rowHeaderWidth = frame.viewport.rowHeaderWidth ?? 0
    if (event.x < rowHeaderWidth) return null
    const fields = frame.data.getSchema().fields
    if (fields.length === 0) return null
    const scrollX = frame.viewport.scrollX ?? 0
    const totalSize = this.getColsTotalSizeForFrame(frame)
    const logicalX = event.x - rowHeaderWidth + scrollX
    let beforeIndex: number
    if (logicalX >= totalSize) {
      beforeIndex = fields.length
    } else if (logicalX < 0) {
      beforeIndex = 0
    } else {
      const colIndex = frame.colsAxis.positionToIndex(logicalX)
      const colStart = frame.colsAxis.indexToPosition(colIndex)
      const colMid = colStart + frame.colsAxis.getSize(colIndex) / 2
      beforeIndex = logicalX < colMid ? colIndex : colIndex + 1
    }

    if (beforeIndex >= drag.selectedRange.startCol && beforeIndex <= drag.selectedRange.endCol + 1) {
      return null
    }

    const beforeFieldId = beforeIndex >= fields.length ? null : fields[beforeIndex]?.id ?? null
    const lineLogicalX =
      beforeIndex >= fields.length ? totalSize : frame.colsAxis.indexToPosition(beforeIndex)
    const lineX = rowHeaderWidth + lineLogicalX - scrollX
    const { height } = this.host.getContainerSize()
    return {
      beforeFieldId,
      preview: {
        lineX,
        dragBandX: drag.startBandX + (event.x - drag.startX),
        bandWidth: drag.totalWidth,
        height,
      },
    }
  }

  private computeRowReorderTarget(
    event: WebPointerEvent,
    drag: NonNullable<WebGridRuntime['rowReorderDrag']>,
  ): { beforeRowId: number | null; preview: RowReorderPreview } | null {
    const frame = this.engine.getFrame()
    const headerHeight = frame.viewport.headerHeight ?? frame.theme.metrics.headerHeight
    if (event.y < headerHeight) return null
    const rowCount = frame.rowsAxis.getCount()
    if (rowCount === 0) return null
    const scrollY = frame.viewport.scrollY ?? 0
    const totalSize = frame.rowsAxis.getTotalSize()
    const logicalY = event.y - headerHeight + scrollY
    let beforeIndex: number
    if (logicalY >= totalSize) {
      beforeIndex = rowCount
    } else if (logicalY < 0) {
      beforeIndex = 0
    } else {
      const rowIndex = frame.rowsAxis.positionToIndex(logicalY)
      const rowStart = frame.rowsAxis.indexToPosition(rowIndex)
      const rowMid = rowStart + frame.rowsAxis.getSize(rowIndex) / 2
      beforeIndex = logicalY < rowMid ? rowIndex : rowIndex + 1
    }

    if (beforeIndex >= drag.selectedRange.startRow && beforeIndex <= drag.selectedRange.endRow + 1) {
      return null
    }

    const beforeRowId = beforeIndex >= rowCount ? null : beforeIndex
    const lineLogicalY =
      beforeIndex >= rowCount ? totalSize : frame.rowsAxis.indexToPosition(beforeIndex)
    const lineY = headerHeight + lineLogicalY - scrollY
    const { width } = this.host.getContainerSize()
    return {
      beforeRowId,
      preview: {
        lineY,
        dragBandY: drag.startBandY + (event.y - drag.startY),
        bandHeight: drag.totalHeight,
        width,
      },
    }
  }

  private getColViewportX(colIndex: number): number {
    const frame = this.engine.getFrame()
    const rowHeaderWidth = frame.viewport.rowHeaderWidth ?? 0
    const scrollX = frame.viewport.scrollX ?? 0
    return rowHeaderWidth + frame.colsAxis.indexToPosition(colIndex) - scrollX
  }

  private getRowViewportY(rowIndex: number): number {
    const frame = this.engine.getFrame()
    const headerHeight = frame.viewport.headerHeight ?? frame.theme.metrics.headerHeight
    const scrollY = frame.viewport.scrollY ?? 0
    return headerHeight + frame.rowsAxis.indexToPosition(rowIndex) - scrollY
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
      this.syncFillHandle()
      this.syncHideToggleHandles()
      this.syncHideColToggleHandles()
      this.syncCellEditorPosition()
    })
  }

  /** 立即同步绘制一帧；用于 attach/resize 等不能等待异步 flush 的路径。 */
  private paintSync(): void {
    const frame = this.getRenderFrame()
    this.renderer.render(frame)
    this.syncSelectionOverlay(frame)
    this.syncResizeHandles()
    this.syncFillHandle()
    this.syncHideToggleHandles()
    this.syncHideColToggleHandles()
    this.syncCellEditorPosition()
  }

  /** 获取当前 render frame，并在 view pipeline 存在时注入视图映射。 */
  private getRenderFrame(): ReturnType<GridEngine['getFrame']> {
    const frame = this.engine.getFrame()
    if (!this.viewPipeline) return frame
    return { ...frame, viewPipeline: this.viewPipeline }
  }

  /** 根据当前 frame 同步 resize handle layer。 */
  private syncResizeHandles(): void {
    if (!this.handleLayer || this.resizeDrag) return
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

  /** 根据当前选区同步 fill handle；编辑/拖拽时隐藏。 */
  private syncFillHandle(): void {
    if (!this.fillLayer) return
    if (this.resizeDrag || this.draggingSelection || this.fillDrag || this.engine.isCellEditing()) {
      this.fillLayer.sync(null)
      return
    }
    const frame = this.engine.getFrame()
    const range = frame.selection?.selectedRange
    if (!range) {
      this.fillLayer.sync(null)
      return
    }
    // 与选区边框一致：active cell 落在合并区内时锚定整个合并区，填充柄才在合并区右下角。
    const visualRange = mergeVisualRange(frame.mergeRegions, range, frame.selection?.activeCell)
    this.fillLayer.sync(computeFillHandleRect(frame, visualRange))
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
      ? computeRangeOverlayRects(
          frame,
          visualRange ?? {
            startRow: active.rowIndex,
            endRow: active.rowIndex,
            startCol: active.colIndex,
            endCol: active.colIndex,
          },
        ).at(-1) ?? null
      : null
    this.selectionOverlay.sync({
      rangeRects: computeRangeOverlayRects(frame, visualRange),
      activeRect,
    })
  }

  /** 当前驱动边缘自动滚动的拖拽种类；填充柄 / reorder / 表头拖选优先于普通选区。 */
  private activeAutoScrollDrag(): AutoScrollDragKind | null {
    if (this.fillDrag) return 'fill'
    if (this.columnReorderDrag?.active) return 'column-reorder'
    if (this.rowReorderDrag?.active) return 'row-reorder'
    if (this.columnHeaderSelectDrag) return 'column-header'
    if (this.rowHeaderSelectDrag) return 'row-header'
    if (this.draggingSelection) return 'selection'
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
      case 'selection': {
        const hit = hitTestCell(this.engine.getFrame(), pointer)
        if (hit) this.engine.selectCell(hit, { extend: true })
        this.updateDragAutoScroll(pointer)
        return
      }
      case 'column-reorder':
        this.updateColumnReorderDrag(pointer)
        return
      case 'row-reorder':
        this.updateRowReorderDrag(pointer)
        return
      case 'column-header':
        this.updateColumnHeaderSelectDrag(pointer)
        return
      case 'row-header':
        this.updateRowHeaderSelectDrag(pointer)
        return
      case 'fill':
        if (this.fillDrag?.lastPointer) this.applyFillPointerMove(this.fillDrag.lastPointer)
        return
    }
  }

  /**
   * 计算 pointer 靠近 viewport 边缘时每帧应滚动的距离。
   * 横向类（列 reorder / 列表头拖选）只横向、纵向类（行 reorder / 行表头拖选）只纵向、
   * 选区与填充柄双向。
   */
  private computeDragAutoScrollStep(
    pointer: WebPointerEvent,
    kind: AutoScrollDragKind,
  ): { x: number; y: number } {
    const { width, height } = this.host.getContainerSize()
    const horizontal = kind !== 'row-reorder' && kind !== 'row-header'
    const vertical = kind !== 'column-reorder' && kind !== 'column-header'
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
    this.handleLayer?.applyTheme(theme.colors, theme.metrics)
  }

  /** 同步 cell editor 主题。 */
  private syncCellEditorTheme(): void {
    this.cellEditor?.applyTheme(this.engine.getTheme())
  }

  /** 同步 context menu layer 主题。 */
  private syncContextMenuTheme(): void {
    this.contextMenuLayer?.applyTheme(this.engine.getTheme())
  }

  /** 同步 filter popover 主题。 */
  private syncFilterPopoverTheme(): void {
    this.filterPopover?.applyTheme(this.engine.getTheme())
  }

  /** 打开指定单元格编辑器，并按需全选原内容。 */
  private openCellEditor(cell: CellAddress, options: { selectAll?: boolean } = {}): boolean {
    if (!this.cellEditor || this.resizeDrag) return false
    if (!this.engine.beginCellEdit(cell)) return false
    return this.showCellEditor(options)
  }

  /** 用首个键入字符作为 draft 打开编辑器。 */
  private beginCellEditWithDraft(cell: CellAddress, draft: string): boolean {
    if (!this.cellEditor || this.resizeDrag) return false
    if (!this.engine.beginCellEdit(cell)) return false
    this.engine.updateCellEditDraft(draft)
    return this.showCellEditor({ selectAll: false })
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

    const field = this.engine.getData().getSchema?.().fields[session.cell.colIndex]
    // 任意非 number 格都用多行编辑器：支持 Alt+Enter 硬换行（与 Google 表格一致），
    // 提交时按内容 autofit 行高。number 仍单行。
    const multiline = field ? field.type !== 'number' : true

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
      const focus = this.getSelectionScrollTarget()
      if (focus) this.ensureCellVisible(focus)
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

  /** 根据当前单元格 rect 同步编辑器位置；不可见时取消编辑。 */
  private syncCellEditorPosition(): void {
    if (!this.cellEditor?.isOpen()) return
    const frame = this.engine.getFrame()
    const session = frame.cellEdit
    if (!session) {
      this.cellEditor.close()
      return
    }
    const rect = this.computeCellEditorRect(frame, session.cell)
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

  /** 根据拖拽状态和当前 client 坐标计算预览尺寸。 */
  private computeResizeSize(
    drag: NonNullable<WebGridRuntime['resizeDrag']>,
    clientX: number,
    clientY: number,
  ): number {
    const delta =
      drag.handle.kind === 'column' ? clientX - drag.startClientX : clientY - drag.startClientY
    return Math.max(MIN_RESIZE_SIZE, drag.startSize + delta)
  }

  /** 在 resize handle layer 上显示当前预览尺寸对应的指示线。 */
  private showResizeIndicator(size: number): void {
    if (!this.handleLayer || !this.resizeDrag) return
    const { handle, anchorStart } = this.resizeDrag
    if (handle.kind === 'column') {
      this.handleLayer.showIndicator({ kind: 'column', x: anchorStart + size })
      return
    }
    this.handleLayer.showIndicator({ kind: 'row', y: anchorStart + size })
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

/** 将数值限制在闭区间 `[min, max]` 内。 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
