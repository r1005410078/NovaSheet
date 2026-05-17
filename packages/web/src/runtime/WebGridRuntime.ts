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
  FrozenConfig,
  GridEngine,
  TextMeasurer,
  Theme,
} from '@novasheet/core'
import {
  autofitRowHeights,
  computeCellRect,
  computeResizeHandles,
  computeScrollReveal,
  FrameScheduler,
  getCellContextMenuItems,
  hitTestCell,
  MIN_RESIZE_SIZE,
  isTypableEditKey,
  type CellAddress,
  type ContextMenuAction,
  type ContextMenuContext,
  type ResizeHandleRect,
} from '@novasheet/core'
import type { DomCellEditor } from '../interaction/DomCellEditor'
import type { DomContextMenuLayer } from '../interaction/DomContextMenuLayer'
import type { DomHandleLayer } from '../interaction/DomHandleLayer'
import type { WebHost, WebKeyboardEvent, WebPointerEvent } from '../host/WebHost'
import type { WebRenderer } from '../render/WebRenderer'
import { ScrollMapper } from '../scroll/ScrollMapper'

/** WebGridRuntime.autofitRows 入参子集（不包含 measurer，runtime 自己持有）。 */
export interface AutofitRowsRuntimeOptions {
  rows?: readonly number[]
  minHeight?: number
  maxHeight?: number
}

export interface WebGridRuntimeOptions {
  engine: GridEngine
  host: WebHost
  renderer: WebRenderer
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
}

/** ResizeObserver 高频回调合并 key（与 `renderer:flush` 分离，同帧内先 resize 再 scroll:read） */
const HOST_RESIZE_KEY = 'host:resize'
const DRAG_AUTO_SCROLL_KEY = 'drag:auto-scroll'
const DRAG_AUTO_SCROLL_EDGE_PX = 32
const DRAG_AUTO_SCROLL_MAX_STEP_PX = 24

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
  private engine: GridEngine
  private host: WebHost
  private renderer: WebRenderer
  private scheduler: FrameScheduler
  private scrollMapper: ScrollMapper
  private onSurfaceResize?: WebGridRuntimeOptions['onSurfaceResize']
  private measurer?: TextMeasurer
  private destroyed = false
  private draggingSelection = false
  private lastDragPointer: WebPointerEvent | null = null
  private handleLayer?: DomHandleLayer
  private cellEditor?: DomCellEditor
  private contextMenuLayer?: DomContextMenuLayer
  private onContextMenuAction?: (action: ContextMenuAction, ctx: ContextMenuContext) => void
  private clipboardReady = false
  private lastContextMenuContext: ContextMenuContext | null = null
  /**
   * 多行 wrap 字段编辑中的原始行高快照——取消时恢复，提交时丢弃。
   * 非 multiline 编辑置 null。
   */
  private editingMultilineOriginalRowHeight: number | null = null
  private resizeDrag: {
    handle: ResizeHandleRect
    pointerId: number
    startClientX: number
    startClientY: number
    startSize: number
    /** 列：左缘 x；行：顶缘 y — 拖拽中固定，尺寸从该边向外扩 */
    anchorStart: number
    /** 拖拽预览尺寸；pointerup 时一次性 commit（spec §6.5.2） */
    previewSize: number
  } | null = null

  constructor(opts: WebGridRuntimeOptions) {
    this.engine = opts.engine
    this.host = opts.host
    this.renderer = opts.renderer
    this.scheduler = opts.scheduler ?? new FrameScheduler()
    this.onSurfaceResize = opts.onSurfaceResize
    this.measurer = opts.measurer
    this.handleLayer = opts.handleLayer
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

  setOnContextMenuAction(cb: (action: ContextMenuAction, ctx: ContextMenuContext) => void): void {
    this.onContextMenuAction = cb
  }

  setClipboardReady(ready: boolean): void {
    this.clipboardReady = ready
  }

  closeContextMenu(): void {
    this.contextMenuLayer?.close()
  }

  handleHostContextMenu(event: WebPointerEvent): void {
    if (this.destroyed) return
    if (!this.contextMenuLayer) return
    if (this.resizeDrag || this.draggingSelection) return

    if (this.engine.isCellEditing()) {
      this.commitCellEdit(false)
    }

    const frame = this.engine.getFrame()
    const headerHeight = frame.theme.metrics.headerHeight
    if (event.y < headerHeight) return

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
    const ctx: ContextMenuContext = {
      cell: hit,
      selectedRange: newSelection.selectedRange,
      hasSelection: newSelection.activeCell !== null,
      clipboardReady: this.clipboardReady,
    }
    this.lastContextMenuContext = ctx
    const items = getCellContextMenuItems(ctx)
    this.contextMenuLayer.open({
      clientX: event.clientX ?? event.x,
      clientY: event.clientY ?? event.y,
      items,
    })
  }

  handleContextMenuSelected(id: ContextMenuAction): void {
    if (!this.lastContextMenuContext) return
    this.onContextMenuAction?.(id, this.lastContextMenuContext)
  }

  openContextMenuAt(rowIndex: number, fieldId: string): void {
    if (this.destroyed || !this.contextMenuLayer) return
    const colIndex = this.engine.getColumnIndex(fieldId)
    if (colIndex < 0) return
    const frame = this.engine.getFrame()
    const rect = computeCellRect(frame, { rowIndex, colIndex })
    if (!rect) return
    this.handleHostContextMenu({
      x: rect.x + rect.width,
      y: rect.y + rect.height,
      clientX: rect.x + rect.width,
      clientY: rect.y + rect.height,
      shiftKey: false,
    })
  }

  /** 注入或替换 TextMeasurer；backend 切换 measurer（如主题字体变更）时调用。 */
  setMeasurer(measurer: TextMeasurer): void {
    this.measurer = measurer
  }

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

  setData(data: DataSource, factory: () => WebRenderer): WebRenderer {
    this.engine.setData(data)
    this.replaceRenderer(factory)
    this.afterEngineMutation()
    return this.renderer
  }

  setTheme(theme: Theme, patchRenderer?: (renderer: WebRenderer) => void): void {
    this.engine.setTheme(theme)
    patchRenderer?.(this.renderer)
    this.syncScrollbarTheme()
    this.syncResizeHandleTheme()
    this.syncCellEditorTheme()
    this.afterEngineMutation()
  }

  setRowHeight(rowIndex: number, height: number): void {
    this.engine.setRowHeight(rowIndex, height)
    this.afterEngineMutation()
  }

  setColumnWidth(fieldId: string, width: number): void {
    this.engine.setColumnWidth(fieldId, width)
    this.afterEngineMutation()
  }

  setFrozen(config: Partial<FrozenConfig>): void
  setFrozen(rows: number, cols: number): void
  setFrozen(configOrRows: Partial<FrozenConfig> | number, cols = 0): void {
    if (typeof configOrRows === 'number') this.engine.setFrozen(configOrRows, cols)
    else this.engine.setFrozen(configOrRows)
    this.afterEngineMutation()
  }

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
    const result = autofitRowHeights({
      data: frame.data,
      theme: frame.theme,
      measurer: this.measurer,
      applyHeight: (row, h) => this.engine.setRowHeight(row, h),
      rows: options.rows,
      minHeight: options.minHeight,
      maxHeight: options.maxHeight,
    })
    if (result.changedRows > 0) this.afterEngineMutation()
    return result
  }

  afterEngineMutation(): void {
    const { width, height } = this.host.getContainerSize()
    this.engine.setViewportSize(width, height)
    this.resizeSpacer()
    this.remapScroll()
    this.refresh()
    this.contextMenuLayer?.close()
  }

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
      handle.kind === 'column'
        ? handle.x + handle.width / 2
        : handle.y + handle.height / 2
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

  handleResizePointerMove(pointerId: number, clientX: number, clientY: number): void {
    if (this.destroyed || !this.resizeDrag || this.resizeDrag.pointerId !== pointerId) return
    const nextSize = this.computeResizeSize(this.resizeDrag, clientX, clientY)
    this.resizeDrag.previewSize = nextSize
    this.showResizeIndicator(nextSize)
  }

  handleResizePointerUp(pointerId: number): void {
    if (!this.resizeDrag || this.resizeDrag.pointerId !== pointerId) return
    const { handle, startSize, previewSize } = this.resizeDrag
    this.resizeDrag = null
    this.handleLayer?.hideIndicator()
    if (previewSize !== startSize) {
      this.applyResizeSize(handle, previewSize)
      this.afterEngineMutation()
    }
  }

  handleCellEditDraft(draft: string): void {
    if (this.destroyed) return
    this.engine.updateCellEditDraft(draft)
  }

  handleCellEditCommitEnter(): void {
    this.commitCellEdit(true)
  }

  handleCellEditCommitBlur(): void {
    this.commitCellEdit(false)
  }

  handleCellEditCancel(): void {
    if (this.destroyed) return
    this.cancelCellEdit()
    this.refresh()
  }

  handleResizeKeyboard(handle: ResizeHandleRect, delta: number): void {
    if (this.destroyed) return
    const current = this.readResizeSize(handle)
    if (current === null) return
    const next = Math.max(MIN_RESIZE_SIZE, current + delta)
    this.applyResizeSize(handle, next)
    this.syncResizeHandles()
    this.refresh()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.cancelCellEdit()
    this.resizeDrag = null
    this.scheduler.cancel('renderer:flush')
    this.scheduler.cancel(HOST_RESIZE_KEY)
    this.scheduler.cancel(DRAG_AUTO_SCROLL_KEY)
    this.renderer.destroy()
    this.host.destroy()
  }

  handleHostScroll(scrollTop: number, scrollLeft: number): void {
    const { logicalX, logicalY } = this.mapScrollToLogical(scrollTop, scrollLeft)
    this.engine.setScroll(logicalX, logicalY)
    this.syncCellEditorPosition()
    this.contextMenuLayer?.close()
    this.invalidate()
  }

  handleHostResize(_cssWidth: number, _cssHeight: number, _dpr: number): void {
    void _cssWidth
    void _cssHeight
    void _dpr
    this.scheduleHostResize()
  }

  handleHostDprChange(_dpr: number): void {
    void _dpr
    this.scheduleHostResize()
  }

  handleHostPointerDown(event: WebPointerEvent): void {
    if (this.destroyed) return
    if (this.engine.isCellEditing()) {
      this.commitCellEdit(false)
    }
    const hit = hitTestCell(this.engine.getFrame(), event)
    if (!hit) return
    if (event.shiftKey) this.engine.selectCell(hit, { extend: true })
    else this.engine.selectCell(hit)
    this.draggingSelection = true
    this.lastDragPointer = event
    this.updateDragAutoScroll(event)
    this.refresh()
  }

  handleHostPointerMove(event: WebPointerEvent): void {
    if (this.destroyed || !this.draggingSelection) return
    this.lastDragPointer = event
    const hit = hitTestCell(this.engine.getFrame(), event)
    if (hit) {
      this.engine.selectCell(hit, { extend: true })
      this.refresh()
    }
    this.updateDragAutoScroll(event)
  }

  handleHostPointerUp(): void {
    this.draggingSelection = false
    this.lastDragPointer = null
    this.scheduler.cancel(DRAG_AUTO_SCROLL_KEY)
  }

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
    if (this.engine.isCellEditing()) return false

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

  private invalidate(): void {
    if (this.destroyed) return
    this.scheduler.schedule('renderer:flush', () => {
      if (this.destroyed) return
      const frame = this.engine.getFrame()
      this.renderer.render(frame)
      this.syncResizeHandles()
      this.syncCellEditorPosition()
    })
  }

  private paintSync(): void {
    const frame = this.engine.getFrame()
    this.renderer.render(frame)
    this.syncResizeHandles()
    this.syncCellEditorPosition()
  }

  private syncResizeHandles(): void {
    if (!this.handleLayer || this.resizeDrag) return
    const frame = this.engine.getFrame()
    this.handleLayer.sync(computeResizeHandles(frame))
  }

  private updateDragAutoScroll(pointer: WebPointerEvent): void {
    const step = this.computeDragAutoScrollStep(pointer)
    if (step.x === 0 && step.y === 0) {
      this.scheduler.cancel(DRAG_AUTO_SCROLL_KEY)
      return
    }
    this.scheduler.schedule(DRAG_AUTO_SCROLL_KEY, () => this.tickDragAutoScroll())
  }

  private tickDragAutoScroll(): void {
    if (this.destroyed || !this.draggingSelection || !this.lastDragPointer) return
    const step = this.computeDragAutoScrollStep(this.lastDragPointer)
    if (step.x === 0 && step.y === 0) return

    const { scrollTop, scrollLeft } = this.host.getScrollPosition()
    const limits = this.getScrollLimits()
    const nextTop = clamp(scrollTop + step.y, 0, limits.maxTop)
    const nextLeft = clamp(scrollLeft + step.x, 0, limits.maxLeft)
    if (nextTop === scrollTop && nextLeft === scrollLeft) return

    this.host.scrollTo(nextTop, nextLeft)
    this.handleHostScroll(nextTop, nextLeft)
    const hit = hitTestCell(this.engine.getFrame(), this.lastDragPointer)
    if (hit) this.engine.selectCell(hit, { extend: true })

    this.updateDragAutoScroll(this.lastDragPointer)
  }

  private computeDragAutoScrollStep(pointer: WebPointerEvent): { x: number; y: number } {
    const { width, height } = this.host.getContainerSize()
    return {
      x: edgeVelocity(pointer.x, width),
      y: edgeVelocity(pointer.y, height),
    }
  }

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

  private logicalToScrollY(logicalY: number): number {
    const headerH = this.engine.getTheme().metrics.headerHeight
    const contentH = this.engine.getRowsTotalSize()
    const spacerH = this.scrollMapper.computeSpacerSize(contentH + headerH)
    const { height: clientH } = this.host.getContainerSize()
    return this.scrollMapper.logicalToScroll(logicalY, spacerH, contentH + headerH, clientH)
  }

  private logicalToScrollX(logicalX: number): number {
    const contentW = this.engine.getColsTotalSize()
    const spacerW = this.scrollMapper.computeSpacerSize(contentW)
    const { width: clientW } = this.host.getContainerSize()
    return this.scrollMapper.logicalToScroll(logicalX, spacerW, contentW, clientW)
  }

  private remapScroll(): void {
    const { scrollTop, scrollLeft } = this.host.getScrollPosition()
    const { logicalX, logicalY } = this.mapScrollToLogical(scrollTop, scrollLeft)
    this.engine.setScroll(logicalX, logicalY)
  }

  private resizeSpacer(): void {
    const headerH = this.engine.getTheme().metrics.headerHeight
    const w = this.scrollMapper.computeSpacerSize(this.engine.getColsTotalSize())
    const h = this.scrollMapper.computeSpacerSize(this.engine.getRowsTotalSize() + headerH)
    this.host.setScrollSize(w, h)
  }

  private syncScrollbarTheme(): void {
    this.host.applyScrollbarTheme(this.engine.getTheme().scrollbar)
  }

  private syncResizeHandleTheme(): void {
    const theme = this.engine.getTheme()
    this.handleLayer?.applyTheme(theme.colors, theme.metrics)
  }

  private syncCellEditorTheme(): void {
    this.cellEditor?.applyTheme(this.engine.getTheme())
  }

  private syncContextMenuTheme(): void {
    this.contextMenuLayer?.applyTheme(this.engine.getTheme())
  }

  private openCellEditor(
    cell: CellAddress,
    options: { selectAll?: boolean } = {},
  ): boolean {
    if (!this.cellEditor || this.resizeDrag) return false
    if (!this.engine.beginCellEdit(cell)) return false
    return this.showCellEditor(options)
  }

  private beginCellEditWithDraft(cell: CellAddress, draft: string): boolean {
    if (!this.cellEditor || this.resizeDrag) return false
    if (!this.engine.beginCellEdit(cell)) return false
    this.engine.updateCellEditDraft(draft)
    return this.showCellEditor({ selectAll: false })
  }

  private showCellEditor(options: { selectAll?: boolean }): boolean {
    const session = this.engine.getFrame().cellEdit
    const rect = session ? computeCellRect(this.engine.getFrame(), session.cell) : null
    if (!session || !rect || !this.cellEditor) {
      this.engine.cancelCellEdit()
      return false
    }

    const field = this.engine.getData().getSchema?.().fields[session.cell.colIndex]
    const multiline = field?.wrap === true && field.type !== 'number'

    this.editingMultilineOriginalRowHeight = multiline
      ? this.engine.getRowsAxis().getSize(session.cell.rowIndex)
      : null

    this.cellEditor.open(rect, session.draft, { ...options, multiline })
    return true
  }

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

  private syncCellEditorPosition(): void {
    if (!this.cellEditor?.isOpen()) return
    const session = this.engine.getFrame().cellEdit
    if (!session) {
      this.cellEditor.close()
      return
    }
    const rect = computeCellRect(this.engine.getFrame(), session.cell)
    if (!rect) {
      this.cancelCellEdit()
      return
    }
    this.cellEditor.syncRect(rect)
  }

  private getSelectionScrollTarget(): CellAddress | null {
    const selection = this.engine.getSelection()
    return selection.extentCell ?? selection.activeCell
  }

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

  private computeResizeSize(
    drag: NonNullable<WebGridRuntime['resizeDrag']>,
    clientX: number,
    clientY: number,
  ): number {
    const delta =
      drag.handle.kind === 'column' ? clientX - drag.startClientX : clientY - drag.startClientY
    return Math.max(MIN_RESIZE_SIZE, drag.startSize + delta)
  }

  private applyResizeSize(handle: ResizeHandleRect, size: number): void {
    if (handle.kind === 'column' && handle.fieldId) {
      this.engine.setColumnWidth(handle.fieldId, size)
      this.resizeSpacer()
      this.invalidate()
      return
    }
    if (handle.kind === 'row' && handle.rowIndex !== undefined) {
      this.engine.setRowHeight(handle.rowIndex, size)
      this.resizeSpacer()
      this.invalidate()
    }
  }

  private showResizeIndicator(size: number): void {
    if (!this.handleLayer || !this.resizeDrag) return
    const { handle, anchorStart } = this.resizeDrag
    if (handle.kind === 'column') {
      this.handleLayer.showIndicator({ kind: 'column', x: anchorStart + size })
      return
    }
    this.handleLayer.showIndicator({ kind: 'row', y: anchorStart + size })
  }

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

function edgeVelocity(position: number, size: number): number {
  if (size <= 0) return 0
  if (position < DRAG_AUTO_SCROLL_EDGE_PX) {
    return -scaleEdgeDistance(DRAG_AUTO_SCROLL_EDGE_PX - position)
  }
  const farEdgeDistance = position - (size - DRAG_AUTO_SCROLL_EDGE_PX)
  if (farEdgeDistance > 0) return scaleEdgeDistance(farEdgeDistance)
  return 0
}

function scaleEdgeDistance(distance: number): number {
  const ratio = Math.min(1, Math.max(0, distance / DRAG_AUTO_SCROLL_EDGE_PX))
  return Math.max(1, Math.ceil(ratio * DRAG_AUTO_SCROLL_MAX_STEP_PX))
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
