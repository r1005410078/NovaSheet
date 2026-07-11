/**
 * DragCoordinator——5 类 Drag 手势（resize/列表头/行表头/填充柄/选区）的构造、pointerdown
 * 派发、活跃拖拽状态与拖拽期间边缘自动滚动 tick 的编排（GridRuntime 拆分 Task 8，见
 * `docs/superpowers/specs/2026-07-11-grid-runtime-decomposition-design.md` §3.2）。
 *
 * `drags` 数组（列表头/行表头/选区）供 pointerdown 顺序尝试起拖；resize/填充柄走各自专用
 * pointer handler（由 host 层独立的 handle-layer/fill-layer 触发，不进入通用 pointerdown
 * 派发循环）。`activeDrag` 记录当前活跃拖拽，驱动 move/commit/cancel 与边缘自动滚动 tick
 * 的落点重算——所有拖拽收尾都会清空它，故 destroy/afterEngineMutation 都要经它复位。
 */

import type { AutofitRowsResult } from '../../../features/row/AutofitRowHeights'
import type { GridEngine } from '../../../engine/GridEngine'
import type { CellRange } from '../../../kernel/coords/SelectionTypes'
import { clamp } from '../../../kernel/geometry/range'
import { MIN_RESIZE_SIZE } from '../../../kernel/interaction/HandleLayout'
import type { ResizeHandleRect } from '../../../kernel/interaction/HandleLayout'
import type { FrameScheduler } from '../../../kernel/util/raf'
import type { DomFillHandleLayer } from '../../interaction/DomFillHandleLayer'
import type { DomHandleLayer } from '../../interaction/DomHandleLayer'
import type { Drag } from '../../interaction/drag/Drag'
import { ColumnHeaderDrag } from '../../interaction/drag/ColumnHeaderDrag'
import { FillHandleDrag } from '../../interaction/drag/FillHandleDrag'
import { ResizeDrag } from '../../interaction/drag/ResizeDrag'
import { RowHeaderDrag } from '../../interaction/drag/RowHeaderDrag'
import { SelectionDrag } from '../../interaction/drag/SelectionDrag'
import type { WebHost, WebPointerEvent } from '../../host/Host'
import type { ColumnReorderOverlay } from '../../overlay/ColumnReorderOverlay'
import type { RowReorderOverlay } from '../../overlay/RowReorderOverlay'
import type { AutofitRowsRuntimeOptions, FillEvent } from '../GridRuntime'

const DRAG_AUTO_SCROLL_KEY = 'drag:auto-scroll'
const DRAG_AUTO_SCROLL_EDGE_PX = 32
const DRAG_AUTO_SCROLL_MAX_STEP_PX = 24

/** 可驱动边缘自动滚动的拖拽种类。 */
type AutoScrollDragKind = 'active-drag'

/** DragCoordinator 的窄依赖接口——只列它真正需要的 GridRuntime 能力。 */
export interface DragCoordinatorDeps {
  readonly engine: GridEngine
  readonly host: WebHost
  readonly scheduler: Pick<FrameScheduler, 'schedule' | 'cancel'>
  /**
   * `tickDragAutoScroll` 的 RAF 回调可能在 `destroy()` 已同帧执行（scheduler 同帧任务
   * 快照后才清空 pending）时仍触发；brief 深依赖清单未列出此项，但其它所有挂 scheduled
   * 回调的 controller（ViewportController/RenderFlushPipeline 等）都有同款保护，按
   * "缺 deps 则补一条闭包" 规则补上。
   */
  isDestroyed(): boolean
  refresh(): void
  afterEngineMutation(): void
  closeContextMenu(): void
  commitCellEdit(moveAfter: boolean): void
  autofitRows(options: AutofitRowsRuntimeOptions): AutofitRowsResult
  onFill(event: FillEvent): void
  syncFillHandle(): void
  /**
   * `handleResizeKeyboard` 提交 resize 后同步 handle layer 位置；原体读
   * `this.syncResizeHandles()`（仍是 GridRuntime 私有方法，未随本任务迁移），
   * brief 深依赖清单未列出，按"缺 deps 则补一条闭包"规则补上。
   */
  syncResizeHandles(): void
  /**
   * 边缘自动滚动 tick 落点后驱动一次真实滚动（`ViewportController.handleHostScroll`
   * 的转发）；brief 深依赖清单未列出，按"缺 deps 则补一条闭包"规则补上。
   */
  handleHostScroll(scrollTop: number, scrollLeft: number): void
  getScrollLimits(): { maxTop: number; maxLeft: number }
  getColsTotalSize(): number
  /**
   * 返回类型比 brief 摘要（`{ colIndex: number }`）宽：需带 `fieldId` 才能满足
   * `ColumnHeaderDragDeps.hitTestColumnHeader` 的返回类型（原体本就返回两者），
   * 否则 5 个 Drag 构造段里的透传闭包无法通过类型检查。
   */
  hitTestColumnHeader(event: WebPointerEvent): { colIndex: number; fieldId: string } | null
  hitTestRowHeader(event: WebPointerEvent): { rowIndex: number } | null
  isWholeColumnSelection(range: CellRange): boolean
  isWholeRowSelection(range: CellRange): boolean
  selectWholeColumn(colIndex: number): void
  selectWholeColumnRange(anchorCol: number, extentCol: number): void
  selectWholeRowRange(anchorRow: number, extentRow: number): void
  // DOM layers（可选注入，与 GridRuntimeOptions 同名项一致）
  readonly handleLayer?: DomHandleLayer
  readonly fillLayer?: DomFillHandleLayer
  readonly columnReorderOverlay?: ColumnReorderOverlay
  readonly rowReorderOverlay?: RowReorderOverlay
}

export class DragCoordinator {
  private readonly deps: DragCoordinatorDeps
  /** 最近一次拖拽 pointer，用于边缘自动滚动续帧。 */
  private lastDragPointer: WebPointerEvent | null = null
  /** 当前活跃的 Drag（R1 DragController）；pointerdown 起拖时设置。 */
  private activeDrag: Drag | null = null
  /** 行高/列宽 resize 拖拽。 */
  private readonly resizeDrag: ResizeDrag
  /** 列表头拖拽（reorder + 表头拖选）。 */
  private readonly columnHeaderDrag: ColumnHeaderDrag
  /** 行表头拖拽（reorder + 表头拖选）。 */
  private readonly rowHeaderDrag: RowHeaderDrag
  /** 填充柄拖拽。 */
  private readonly fillHandleDrag: FillHandleDrag
  /** 普通单元格拖选。 */
  private readonly selectionDrag: SelectionDrag
  /** pointerdown 按序尝试起拖的 Drag 列表；加新拖拽 = 实现 Drag + 入此数组。 */
  private readonly drags: readonly Drag[]

  constructor(deps: DragCoordinatorDeps) {
    this.deps = deps
    this.resizeDrag = new ResizeDrag({
      engine: this.deps.engine,
      handleLayer: this.deps.handleLayer,
      afterEngineMutation: () => this.deps.afterEngineMutation(),
    })
    this.columnHeaderDrag = new ColumnHeaderDrag({
      engine: this.deps.engine,
      host: this.deps.host,
      overlay: this.deps.columnReorderOverlay,
      refresh: () => this.deps.refresh(),
      afterEngineMutation: () => this.deps.afterEngineMutation(),
      closeContextMenu: () => this.deps.closeContextMenu(),
      requestAutoScroll: (pointer) => this.requestDragAutoScroll(pointer),
      stopAutoScroll: () => this.stopDragAutoScroll(),
      isBlocked: () => this.isDragBlocked(),
      hitTestColumnHeader: (event) => this.deps.hitTestColumnHeader(event),
      isWholeColumnSelection: (range) => this.deps.isWholeColumnSelection(range),
      selectWholeColumn: (col) => this.deps.selectWholeColumn(col),
      selectWholeColumnRange: (anchor, extent) => this.deps.selectWholeColumnRange(anchor, extent),
      getColsTotalSize: () => this.deps.getColsTotalSize(),
    })
    this.rowHeaderDrag = new RowHeaderDrag({
      engine: this.deps.engine,
      host: this.deps.host,
      overlay: this.deps.rowReorderOverlay,
      refresh: () => this.deps.refresh(),
      afterEngineMutation: () => this.deps.afterEngineMutation(),
      closeContextMenu: () => this.deps.closeContextMenu(),
      requestAutoScroll: (pointer) => this.requestDragAutoScroll(pointer),
      stopAutoScroll: () => this.stopDragAutoScroll(),
      isBlocked: () => this.isDragBlocked(),
      hitTestRowHeader: (event) => this.deps.hitTestRowHeader(event),
      isWholeRowSelection: (range) => this.deps.isWholeRowSelection(range),
      selectWholeRowRange: (anchor, extent) => this.deps.selectWholeRowRange(anchor, extent),
    })
    this.fillHandleDrag = new FillHandleDrag({
      engine: this.deps.engine,
      host: this.deps.host,
      fillLayer: this.deps.fillLayer,
      afterEngineMutation: () => this.deps.afterEngineMutation(),
      autofitRows: (options) => this.deps.autofitRows(options),
      onFill: (event) => this.deps.onFill(event),
      closeContextMenu: () => this.deps.closeContextMenu(),
      commitCellEdit: (moveSelection) => this.deps.commitCellEdit(moveSelection),
      requestAutoScroll: (pointer) => this.requestDragAutoScroll(pointer),
      stopAutoScroll: () => this.stopDragAutoScroll(),
      isBlocked: () => this.isDragBlocked(),
    })
    this.selectionDrag = new SelectionDrag({
      engine: this.deps.engine,
      refresh: () => this.deps.refresh(),
      requestAutoScroll: (pointer) => this.requestDragAutoScroll(pointer),
      stopAutoScroll: () => this.stopDragAutoScroll(),
      syncFillHandle: () => this.deps.syncFillHandle(),
      isBlocked: () => this.isDragBlocked(),
    })
    this.drags = [this.columnHeaderDrag, this.rowHeaderDrag, this.selectionDrag]
  }

  /** pointerdown 按序尝试起拖（GridRuntime `handleHostPointerDown` 的 drags 循环）。 */
  tryStartDrag(event: WebPointerEvent): boolean {
    for (const drag of this.drags) {
      if (drag.tryStart(event)) {
        this.activeDrag = drag
        return true
      }
    }
    return false
  }

  /** pointermove 转发给当前活跃拖拽；无活跃拖拽或未消费返回 false。 */
  moveActiveDrag(event: WebPointerEvent): boolean {
    return this.activeDrag?.move(event) ?? false
  }

  /** pointerup 提交当前活跃拖拽；无活跃拖拽返回 false（no-op）。 */
  commitActiveDrag(): boolean {
    if (!this.activeDrag) return false
    this.activeDrag.commit()
    this.activeDrag = null
    return true
  }

  /** Escape 取消当前活跃拖拽（不提交）；无活跃拖拽返回 false（no-op）。 */
  cancelActiveDrag(): boolean {
    if (!this.activeDrag) return false
    this.activeDrag.cancel()
    this.activeDrag = null
    return true
  }

  /** `afterEngineMutation` 收尾：engine mutation 后活跃拖拽状态已失效，直接清空。 */
  clearActiveDrag(): void {
    this.activeDrag = null
  }

  isDragBlocked(): boolean {
    return this.resizeDrag.active || !!this.activeDrag
  }

  /** resize 拖拽是否活跃（sync/cursor 判定用）。 */
  isResizeDragActive(): boolean {
    return this.resizeDrag.active
  }

  /** 任意拖拽（resize 或 activeDrag）是否活跃。 */
  isAnyDragActive(): boolean {
    return this.resizeDrag.active || !!this.activeDrag?.active
  }

  /** 起拖期间记录 pointer 并按边缘热区驱动自动滚动（供 Drag 经 deps 调用）。 */
  private requestDragAutoScroll(pointer: WebPointerEvent): void {
    this.lastDragPointer = pointer
    this.updateDragAutoScroll(pointer)
  }

  /** 取消正在排队的拖拽自动滚动并清掉 pointer 记录。 */
  private stopDragAutoScroll(): void {
    this.deps.scheduler.cancel(DRAG_AUTO_SCROLL_KEY)
    this.lastDragPointer = null
  }

  /** 开始鼠标/触控 resize 拖拽并显示尺寸指示线。 */
  handleResizePointerDown(
    handle: ResizeHandleRect,
    pointerId: number,
    clientX: number,
    clientY: number,
  ): void {
    if (this.resizeDrag.start(handle, pointerId, clientX, clientY)) {
      this.activeDrag = this.resizeDrag
    }
  }

  /** 更新 resize 拖拽预览尺寸。 */
  handleResizePointerMove(pointerId: number, clientX: number, clientY: number): void {
    this.resizeDrag.movePointer(pointerId, clientX, clientY)
  }

  /** 结束 resize 拖拽并一次性提交行高/列宽变更。 */
  handleResizePointerUp(pointerId: number): void {
    if (!this.resizeDrag.commitPointer(pointerId)) return
    this.activeDrag = null
  }

  /** 开始 fill handle 拖拽。 */
  handleFillPointerDown(pointerId: number, clientX: number, clientY: number): void {
    if (this.fillHandleDrag.tryStartFromClient(pointerId, clientX, clientY)) {
      this.activeDrag = this.fillHandleDrag
    }
  }

  /** 更新 fill handle 拖拽目标与预览 overlay。 */
  handleFillPointerMove(pointerId: number, clientX: number, clientY: number): void {
    this.fillHandleDrag.moveFromClient(pointerId, clientX, clientY)
  }

  /** 结束 fill handle 拖拽并提交填充结果。 */
  handleFillPointerUp(pointerId: number): void {
    if (!this.fillHandleDrag.commitPointer(pointerId)) return
    this.activeDrag = null
    this.deps.columnReorderOverlay?.hide()
    this.deps.rowReorderOverlay?.hide()
  }

  /** 处理键盘 resize，按 delta 调整行高或列宽。 */
  handleResizeKeyboard(handle: ResizeHandleRect, delta: number): void {
    const current = this.readResizeSize(handle)
    if (current === null) return
    const next = Math.max(MIN_RESIZE_SIZE, current + delta)
    if (next === current) return
    if (handle.kind === 'row' && handle.rowIndex !== undefined) {
      this.deps.engine.commitRowResize(handle.rowIndex, current, next)
    } else if (handle.kind === 'column' && handle.fieldId) {
      const colIndex = this.deps.engine.getColumnIndex(handle.fieldId)
      if (colIndex < 0) return
      this.deps.engine.commitColumnResize(colIndex, current, next)
    }
    this.deps.syncResizeHandles()
    this.deps.refresh()
  }

  /** 幂等销毁：取消当前活跃拖拽（不提交）并停掉排队中的边缘自动滚动。 */
  destroy(): void {
    this.activeDrag?.cancel()
    this.activeDrag = null
    this.deps.scheduler.cancel(DRAG_AUTO_SCROLL_KEY)
  }

  /** 根据 pointer 位置启动或取消当前拖拽的边缘自动滚动。 */
  private updateDragAutoScroll(pointer: WebPointerEvent): void {
    const kind = this.activeAutoScrollDrag()
    if (!kind) {
      this.deps.scheduler.cancel(DRAG_AUTO_SCROLL_KEY)
      return
    }
    const step = this.computeDragAutoScrollStep(pointer, kind)
    if (step.x === 0 && step.y === 0) {
      this.deps.scheduler.cancel(DRAG_AUTO_SCROLL_KEY)
      return
    }
    this.deps.scheduler.schedule(DRAG_AUTO_SCROLL_KEY, () => this.tickDragAutoScroll())
  }

  /** 执行一帧拖拽自动滚动，按拖拽种类重算落点，并继续调度下一帧。 */
  private tickDragAutoScroll(): void {
    if (this.deps.isDestroyed() || !this.lastDragPointer) return
    const kind = this.activeAutoScrollDrag()
    if (!kind) return
    const step = this.computeDragAutoScrollStep(this.lastDragPointer, kind)
    if (step.x === 0 && step.y === 0) return

    const { scrollTop, scrollLeft } = this.deps.host.getScrollPosition()
    const limits = this.deps.getScrollLimits()
    const nextTop = clamp(scrollTop + step.y, 0, limits.maxTop)
    const nextLeft = clamp(scrollLeft + step.x, 0, limits.maxLeft)
    if (nextTop === scrollTop && nextLeft === scrollLeft) return

    this.deps.host.scrollTo(nextTop, nextLeft)
    this.deps.handleHostScroll(nextTop, nextLeft)
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

  /** 当前驱动边缘自动滚动的拖拽种类；活跃拖拽/填充柄优先于普通选区。 */
  private activeAutoScrollDrag(): AutoScrollDragKind | null {
    if (this.activeDrag?.active) return 'active-drag'
    return null
  }

  /**
   * 计算 pointer 靠近 viewport 边缘时每帧应滚动的距离。
   * active-drag 按其 `autoScrollAxis`；选区与填充柄双向。
   */
  private computeDragAutoScrollStep(
    pointer: WebPointerEvent,
    kind: AutoScrollDragKind,
  ): { x: number; y: number } {
    const { width, height } = this.deps.host.getContainerSize()
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

  /** 读取 resize handle 对应的当前行高或列宽。 */
  private readResizeSize(handle: ResizeHandleRect): number | null {
    if (handle.kind === 'column' && handle.fieldId) {
      const colIndex = this.deps.engine.getColumnIndex(handle.fieldId)
      if (colIndex < 0) return null
      return this.deps.engine.getColsAxis().getSize(colIndex)
    }
    if (handle.kind === 'row' && handle.rowIndex !== undefined) {
      const { rowIndex } = handle
      if (rowIndex < 0 || rowIndex >= this.deps.engine.getRowsAxis().getCount()) return null
      return this.deps.engine.getRowsAxis().getSize(rowIndex)
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
