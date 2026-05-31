import type { CellRange, GridEngine } from '@novasheet/core'
import type { WebHost, WebPointerEvent } from '../../host/WebHost'
import type { RowReorderOverlay, RowReorderPreview } from '../../overlay/RowReorderOverlay'
import type { AutoScrollAxis, Drag } from './Drag'

const ROW_REORDER_DRAG_THRESHOLD_PX = 6

/** RowHeaderDrag 所需的 runtime 交互服务（共享能力 + 行专用 helper）。 */
export interface RowHeaderDragDeps {
  readonly engine: GridEngine
  readonly host: WebHost
  readonly overlay?: RowReorderOverlay
  refresh(): void
  afterEngineMutation(): void
  closeContextMenu(): void
  /** 边缘自动滚动：起拖期间按 pointer 请求/停止（纵向）。 */
  requestAutoScroll(pointer: WebPointerEvent): void
  stopAutoScroll(): void
  /** 其它拖拽（resize/选区/填充柄）进行中时不接管行表头手势。 */
  isBlocked(): boolean
  hitTestRowHeader(event: WebPointerEvent): { rowIndex: number } | null
  isWholeRowSelection(range: CellRange): boolean
  selectWholeRowRange(anchorRow: number, extentRow: number): void
}

interface ReorderState {
  mode: 'reorder'
  startX: number
  startY: number
  rowIds: readonly number[]
  selectedRange: CellRange
  startBandY: number
  totalHeight: number
  active: boolean
  targetBeforeRowId: number | null | undefined
}

interface SelectState {
  mode: 'select'
  anchorRow: number
}

/**
 * 行表头拖拽手势：pointerdown 命中行表头后分两子模式——
 * 已整行选中且命中范围内（非 Shift）→ **行 reorder**；否则 → **行表头拖选**。
 * 纵向边缘自动滚动。（从 WebGridRuntime 收口，R1 DragController；ColumnHeaderDrag 的镜像。）
 */
export class RowHeaderDrag implements Drag {
  readonly autoScrollAxis: AutoScrollAxis = 'vertical'
  private state: ReorderState | SelectState | null = null

  constructor(private readonly deps: RowHeaderDragDeps) {}

  get active(): boolean {
    if (!this.state) return false
    return this.state.mode === 'select' || this.state.active
  }

  tryStart(event: WebPointerEvent): boolean {
    if (this.deps.isBlocked()) return false
    const hit = this.deps.hitTestRowHeader(event)
    if (!hit) return false

    const selection = this.deps.engine.getSelection()
    const range = selection.selectedRange
    if (
      !event.shiftKey &&
      range &&
      this.deps.isWholeRowSelection(range) &&
      hit.rowIndex >= range.startRow &&
      hit.rowIndex <= range.endRow
    ) {
      const rowIds = Array.from(
        { length: range.endRow - range.startRow + 1 },
        (_, index) => range.startRow + index,
      )
      const startBandY = this.getRowViewportY(range.startRow)
      const totalHeight = this.sumVisibleRowHeights(range.startRow, range.endRow)
      this.state = {
        mode: 'reorder',
        startX: event.x,
        startY: event.y,
        rowIds,
        selectedRange: range,
        startBandY,
        totalHeight,
        active: false,
        targetBeforeRowId: null,
      }
      this.deps.overlay?.show({
        lineY: startBandY,
        dragBandY: startBandY,
        bandHeight: totalHeight,
        width: this.deps.host.getContainerSize().width,
      })
      this.deps.host.setCursor('grabbing')
      this.deps.closeContextMenu()
      return true
    }

    const anchorRow =
      event.shiftKey && range && this.deps.isWholeRowSelection(range)
        ? (selection.anchorCell?.rowIndex ?? hit.rowIndex)
        : hit.rowIndex
    this.deps.selectWholeRowRange(anchorRow, hit.rowIndex)
    this.state = { mode: 'select', anchorRow }
    this.deps.refresh()
    return true
  }

  move(event: WebPointerEvent): boolean {
    if (!this.state) return false
    return this.state.mode === 'reorder' ? this.moveReorder(event, this.state) : this.moveSelect(event, this.state)
  }

  reevaluate(pointer: WebPointerEvent): void {
    this.move(pointer)
  }

  commit(): void {
    const state = this.state
    this.state = null
    this.deps.stopAutoScroll()
    if (!state) return
    if (state.mode === 'select') return
    this.deps.overlay?.hide()
    this.deps.host.setCursor(null)
    if (!state.active || state.targetBeforeRowId === undefined) return
    if (this.deps.engine.moveRows(state.rowIds, state.targetBeforeRowId)) {
      this.deps.afterEngineMutation()
    }
  }

  cancel(): void {
    const state = this.state
    this.state = null
    this.deps.stopAutoScroll()
    if (state?.mode === 'reorder') {
      this.deps.overlay?.hide()
      this.deps.host.setCursor(null)
    }
  }

  private moveSelect(event: WebPointerEvent, state: SelectState): boolean {
    this.deps.requestAutoScroll(event) // 拖到上/下边缘纵向自动滚动
    const hit = this.deps.hitTestRowHeader(event)
    if (!hit) return true
    this.deps.selectWholeRowRange(state.anchorRow, hit.rowIndex)
    this.deps.refresh()
    return true
  }

  private moveReorder(event: WebPointerEvent, state: ReorderState): boolean {
    if (!state.active) {
      const dx = event.x - state.startX
      const dy = event.y - state.startY
      if (Math.hypot(dx, dy) < ROW_REORDER_DRAG_THRESHOLD_PX) {
        this.deps.overlay?.show({
          lineY: state.startBandY,
          dragBandY: state.startBandY + dy,
          bandHeight: state.totalHeight,
          width: this.deps.host.getContainerSize().width,
        })
        this.deps.host.setCursor('grabbing')
        return true
      }
      state.active = true
    }

    this.deps.requestAutoScroll(event)

    const target = this.computeReorderTarget(event, state)
    if (!target) {
      state.targetBeforeRowId = undefined
      this.deps.overlay?.show({
        lineY: state.startBandY,
        dragBandY: state.startBandY + (event.y - state.startY),
        bandHeight: state.totalHeight,
        width: this.deps.host.getContainerSize().width,
      })
      this.deps.host.setCursor('grabbing')
      return true
    }
    state.targetBeforeRowId = target.beforeRowId
    this.deps.overlay?.show(target.preview)
    this.deps.host.setCursor('grabbing')
    return true
  }

  private getRowViewportY(rowIndex: number): number {
    const frame = this.deps.engine.getFrame()
    const headerHeight = frame.viewport.headerHeight ?? frame.theme.metrics.headerHeight
    const scrollY = frame.viewport.scrollY ?? 0
    return headerHeight + frame.rowsAxis.indexToPosition(rowIndex) - scrollY
  }

  private sumVisibleRowHeights(startRow: number, endRow: number): number {
    const axis = this.deps.engine.getFrame().rowsAxis
    let total = 0
    for (let row = startRow; row <= endRow; row += 1) total += axis.getSize(row)
    return total
  }

  private computeReorderTarget(
    event: WebPointerEvent,
    state: ReorderState,
  ): { beforeRowId: number | null; preview: RowReorderPreview } | null {
    const frame = this.deps.engine.getFrame()
    const headerHeight = frame.viewport.headerHeight ?? frame.theme.metrics.headerHeight
    // 指针落在表头区/上边缘（event.y < headerHeight）时不早退：让 logicalY 经
    // `logicalY < 0 → beforeIndex 0`（未滚动）或 positionToIndex（已滚动）映射为「插入到顶部」，
    // 与底部 `logicalY >= totalSize → 追加到末尾` 对称——否则上拖/上边缘自动滚动永远无落点。
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

    if (beforeIndex >= state.selectedRange.startRow && beforeIndex <= state.selectedRange.endRow + 1) {
      return null
    }

    const beforeRowId = beforeIndex >= rowCount ? null : beforeIndex
    const lineLogicalY =
      beforeIndex >= rowCount ? totalSize : frame.rowsAxis.indexToPosition(beforeIndex)
    const lineY = headerHeight + lineLogicalY - scrollY
    const { width } = this.deps.host.getContainerSize()
    return {
      beforeRowId,
      preview: {
        lineY,
        dragBandY: state.startBandY + (event.y - state.startY),
        bandHeight: state.totalHeight,
        width,
      },
    }
  }
}
