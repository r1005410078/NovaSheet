import { cellInRange } from '../../../kernel/geometry/range'
import { computeFillTarget } from '../../../features/fill/FillTarget'
import { hitTestCell } from '../../../kernel/interaction/HitTest'
import type { AutofitRowsResult } from '../../../features/row/AutofitRowHeights'
import type { CellRange } from '../../../kernel/coords/SelectionTypes'
import type { FillDirection } from '../../../features/fill/FillTarget'
import type {
  GridCellEditing,
  GridDataAccess,
  GridFillMutation,
  GridFrameReader,
  GridSelectionAccess,
} from '../../../engine/GridEngine'
import type { DomFillHandleLayer } from '../DomFillHandleLayer'
import { computeRangeOverlayRects } from '../../overlay/RangeOverlayRects'
import type { WebHost, WebPointerEvent } from '../../host/Host'
import type { AutoScrollAxis, Drag } from './Drag'

export interface FillEvent {
  readonly source: CellRange
  readonly fill: CellRange
  readonly result: CellRange
  readonly direction: FillDirection
}

type FillHandleDragEngine = GridFrameReader &
  GridFillMutation &
  Pick<GridCellEditing, 'isCellEditing'> &
  Pick<GridSelectionAccess, 'getSelection'> &
  Pick<GridDataAccess, 'getData'>

/** FillHandleDrag 所需的 runtime 交互服务。 */
export interface FillHandleDragDeps {
  readonly engine: FillHandleDragEngine
  readonly host: WebHost
  readonly fillLayer?: DomFillHandleLayer
  afterEngineMutation(): void
  autofitRows(options: { rows?: readonly number[] }): AutofitRowsResult
  onFill(event: FillEvent): void
  closeContextMenu(): void
  commitCellEdit(moveSelection: boolean): void
  requestAutoScroll(pointer: WebPointerEvent): void
  stopAutoScroll(): void
  isBlocked(): boolean
}

interface FillState {
  pointerId: number
  source: CellRange
  target: ReturnType<typeof computeFillTarget> | null
  lastPointer: WebPointerEvent | null
}

/**
 * 填充柄拖拽状态机（R1 DragController）。
 *
 * DOM fill layer 提供 client 坐标，本类负责转成 host-local pointer，并在 move/auto-scroll
 * tick 中重算 preview；commit 只通过 engine/facade 回调写入。
 */
export class FillHandleDrag implements Drag {
  readonly autoScrollAxis: AutoScrollAxis = 'both'
  private state: FillState | null = null

  constructor(private readonly deps: FillHandleDragDeps) {}

  get active(): boolean {
    return this.state !== null
  }

  tryStart(_event: WebPointerEvent): boolean {
    return false
  }

  tryStartFromClient(pointerId: number, clientX: number, clientY: number): boolean {
    if (this.deps.isBlocked()) return false
    if (this.deps.engine.isCellEditing()) this.deps.commitCellEdit(false)
    const source = this.deps.engine.getSelection().selectedRange
    if (!source) return false
    this.deps.closeContextMenu()
    this.state = {
      pointerId,
      source,
      target: null,
      lastPointer: this.pointerFromClient(clientX, clientY),
    }
    return true
  }

  move(event: WebPointerEvent): boolean {
    if (!this.state) return false
    this.applyPointerMove(event)
    return true
  }

  moveFromClient(pointerId: number, clientX: number, clientY: number): boolean {
    if (!this.state || this.state.pointerId !== pointerId) return false
    return this.move(this.pointerFromClient(clientX, clientY))
  }

  commitPointer(pointerId: number): boolean {
    if (!this.state || this.state.pointerId !== pointerId) return false
    this.commit()
    return true
  }

  reevaluate(pointer: WebPointerEvent): void {
    this.move(pointer)
  }

  commit(): void {
    const state = this.state
    this.state = null
    this.deps.stopAutoScroll()
    this.deps.fillLayer?.hidePreview()
    if (!state?.target) return

    const result = this.deps.engine.commitFill(
      state.target.source,
      state.target.fill,
      state.target.direction,
    )
    if (!result) return
    const autofit = this.deps.autofitRows({ rows: uniqueRows(result.writes.map((w) => w.rowIndex)) })
    if (autofit.changedRows === 0) this.deps.afterEngineMutation()
    this.deps.onFill({
      source: state.target.source,
      fill: state.target.fill,
      result: state.target.result,
      direction: state.target.direction,
    })
  }

  cancel(): void {
    this.state = null
    this.deps.stopAutoScroll()
    this.deps.fillLayer?.hidePreview()
  }

  private applyPointerMove(pointer: WebPointerEvent): void {
    const state = this.state
    if (!state) return
    state.lastPointer = pointer
    this.deps.requestAutoScroll(pointer)
    const frame = this.deps.engine.getFrame()
    const hit = hitTestCell(frame, pointer)
    if (!hit) return
    const data = this.deps.engine.getData()
    const snap = this.deps.engine.getFillMergeSnap(state.source)
    const onMergeSource = snap.rowSpan > 1 || snap.colSpan > 1
    const targetMerge = onMergeSource
      ? frame.mergeRegions?.find((region) => cellInRange(hit, region.range))?.range
      : undefined
    state.target = computeFillTarget(
      state.source,
      hit,
      {
        rowCount: data.getRowCount(),
        colCount: data.getSchema().fields.length,
      },
      snap,
      targetMerge,
    )
    if (state.target) {
      this.deps.fillLayer?.showPreview(computeRangeOverlayRects(this.deps.engine.getFrame(), state.target.fill))
    } else {
      this.deps.fillLayer?.hidePreview()
    }
  }

  private pointerFromClient(clientX: number, clientY: number): WebPointerEvent {
    const rect = this.deps.host.getContainerBoundingRect()
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
      clientX,
      clientY,
      shiftKey: false,
    }
  }
}

/** 去重行号并保持首次出现顺序。 */
function uniqueRows(rows: readonly number[]): readonly number[] {
  return [...new Set(rows)]
}
