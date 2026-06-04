import type {
  CellRange,
  GridColumnStructure,
  GridFrameReader,
  GridSelectionAccess,
} from '@novasheet/core'
import type { WebHost, WebPointerEvent } from '../../host/WebHost'
import type { ColumnReorderOverlay, ColumnReorderPreview } from '../../overlay/ColumnReorderOverlay'
import type { AutoScrollAxis, Drag } from './Drag'

const COLUMN_REORDER_DRAG_THRESHOLD_PX = 6

type ColumnHeaderDragEngine = GridFrameReader &
  Pick<GridSelectionAccess, 'getSelection'> &
  Pick<GridColumnStructure, 'moveCols'>

/** ColumnHeaderDrag 所需的 runtime 交互服务（共享能力 + 列专用 helper）。 */
export interface ColumnHeaderDragDeps {
  readonly engine: ColumnHeaderDragEngine
  readonly host: WebHost
  readonly overlay?: ColumnReorderOverlay
  refresh(): void
  afterEngineMutation(): void
  closeContextMenu(): void
  /** 边缘自动滚动：起拖期间按 pointer 请求/停止（横向）。 */
  requestAutoScroll(pointer: WebPointerEvent): void
  stopAutoScroll(): void
  /** 其它拖拽（resize/选区/填充柄）进行中时不接管列表头手势。 */
  isBlocked(): boolean
  hitTestColumnHeader(event: WebPointerEvent): { colIndex: number; fieldId: string } | null
  isWholeColumnSelection(range: CellRange): boolean
  selectWholeColumn(colIndex: number): void
  selectWholeColumnRange(anchorCol: number, extentCol: number): void
  getColsTotalSize(): number
}

interface ReorderState {
  mode: 'reorder'
  startX: number
  startY: number
  selectedFieldIds: readonly string[]
  selectedRange: CellRange
  startBandX: number
  totalWidth: number
  active: boolean
  targetBeforeFieldId: string | null | undefined
}

interface SelectState {
  mode: 'select'
  anchorCol: number
}

/**
 * 列表头拖拽手势：pointerdown 命中列表头后分两子模式——
 * 已整列选中的列上 → **列 reorder**；否则/Shift → **列表头拖选**。
 * 横向边缘自动滚动。（从 WebGridRuntime 收口，R1 DragController。）
 */
export class ColumnHeaderDrag implements Drag {
  readonly autoScrollAxis: AutoScrollAxis = 'horizontal'
  private state: ReorderState | SelectState | null = null

  constructor(private readonly deps: ColumnHeaderDragDeps) {}

  get active(): boolean {
    if (!this.state) return false
    return this.state.mode === 'select' || this.state.active
  }

  tryStart(event: WebPointerEvent): boolean {
    if (this.deps.isBlocked()) return false
    const hit = this.deps.hitTestColumnHeader(event)
    if (!hit) return false

    const selection = this.deps.engine.getSelection()
    const range = selection.selectedRange
    if (event.shiftKey) {
      const anchorCol =
        range && this.deps.isWholeColumnSelection(range) ? selection.anchorCell?.colIndex : undefined
      this.deps.selectWholeColumnRange(anchorCol ?? hit.colIndex, hit.colIndex)
      this.state = { mode: 'select', anchorCol: anchorCol ?? hit.colIndex }
      this.deps.refresh()
      return true
    }

    if (
      !range ||
      !this.deps.isWholeColumnSelection(range) ||
      hit.colIndex < range.startCol ||
      hit.colIndex > range.endCol
    ) {
      this.deps.selectWholeColumn(hit.colIndex)
      this.state = { mode: 'select', anchorCol: hit.colIndex }
      this.deps.refresh()
      return true
    }

    const fields = this.deps.engine.getFrame().data.getSchema().fields
    const selectedFieldIds = fields.slice(range.startCol, range.endCol + 1).map((f) => f.id)
    if (selectedFieldIds.length === 0) return true
    const startBandX = this.getColViewportX(range.startCol)
    const totalWidth = this.sumVisibleColWidths(range.startCol, range.endCol)
    this.state = {
      mode: 'reorder',
      startX: event.x,
      startY: event.y,
      selectedFieldIds,
      selectedRange: range,
      startBandX,
      totalWidth,
      active: false,
      targetBeforeFieldId: null,
    }
    this.deps.overlay?.show({
      lineX: startBandX,
      dragBandX: startBandX,
      bandWidth: totalWidth,
      height: this.deps.host.getContainerSize().height,
    })
    this.deps.host.setCursor('grabbing')
    this.deps.closeContextMenu()
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
    if (!state.active || state.targetBeforeFieldId === undefined) return
    if (this.deps.engine.moveCols(state.selectedFieldIds, state.targetBeforeFieldId)) {
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
    this.deps.requestAutoScroll(event) // 拖到左/右边缘横向自动滚动
    const hit = this.deps.hitTestColumnHeader(event)
    if (!hit) return true
    this.deps.selectWholeColumnRange(state.anchorCol, hit.colIndex)
    this.deps.refresh()
    return true
  }

  private moveReorder(event: WebPointerEvent, state: ReorderState): boolean {
    if (!state.active) {
      const dx = event.x - state.startX
      const dy = event.y - state.startY
      if (Math.hypot(dx, dy) < COLUMN_REORDER_DRAG_THRESHOLD_PX) {
        this.deps.overlay?.show({
          lineX: state.startBandX,
          dragBandX: state.startBandX + dx,
          bandWidth: state.totalWidth,
          height: this.deps.host.getContainerSize().height,
        })
        this.deps.host.setCursor('grabbing')
        return true
      }
      state.active = true
    }

    this.deps.requestAutoScroll(event)

    const target = this.computeReorderTarget(event, state)
    if (!target) {
      state.targetBeforeFieldId = undefined
      this.deps.overlay?.show({
        lineX: state.startBandX,
        dragBandX: state.startBandX + (event.x - state.startX),
        bandWidth: state.totalWidth,
        height: this.deps.host.getContainerSize().height,
      })
      this.deps.host.setCursor('grabbing')
      return true
    }
    state.targetBeforeFieldId = target.beforeFieldId
    this.deps.overlay?.show(target.preview)
    this.deps.host.setCursor('grabbing')
    return true
  }

  private getColViewportX(colIndex: number): number {
    const frame = this.deps.engine.getFrame()
    const rowHeaderWidth = frame.viewport.rowHeaderWidth ?? 0
    const scrollX = frame.viewport.scrollX ?? 0
    return rowHeaderWidth + frame.colsAxis.indexToPosition(colIndex) - scrollX
  }

  private sumVisibleColWidths(startCol: number, endCol: number): number {
    const axis = this.deps.engine.getFrame().colsAxis
    let total = 0
    for (let col = startCol; col <= endCol; col += 1) total += axis.getSize(col)
    return total
  }

  private computeReorderTarget(
    event: WebPointerEvent,
    state: ReorderState,
  ): { beforeFieldId: string | null; preview: ColumnReorderPreview } | null {
    const frame = this.deps.engine.getFrame()
    const rowHeaderWidth = frame.viewport.rowHeaderWidth ?? 0
    // 指针落在行表头区/左边缘（event.x < rowHeaderWidth）时不早退：让 logicalX 经
    // `logicalX < 0 → beforeIndex 0`（未滚动）或 positionToIndex（已滚动）映射为「插入到最左」，
    // 与右侧 `logicalX >= totalSize → 追加到末尾` 对称——否则左拖/左边缘自动滚动永远无落点。
    const fields = frame.data.getSchema().fields
    if (fields.length === 0) return null
    const scrollX = frame.viewport.scrollX ?? 0
    const totalSize = this.deps.getColsTotalSize()
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

    if (beforeIndex >= state.selectedRange.startCol && beforeIndex <= state.selectedRange.endCol + 1) {
      return null
    }

    const beforeFieldId = beforeIndex >= fields.length ? null : fields[beforeIndex]?.id ?? null
    const lineLogicalX =
      beforeIndex >= fields.length ? totalSize : frame.colsAxis.indexToPosition(beforeIndex)
    const lineX = rowHeaderWidth + lineLogicalX - scrollX
    const { height } = this.deps.host.getContainerSize()
    return {
      beforeFieldId,
      preview: {
        lineX,
        dragBandX: state.startBandX + (event.x - state.startX),
        bandWidth: state.totalWidth,
        height,
      },
    }
  }
}
