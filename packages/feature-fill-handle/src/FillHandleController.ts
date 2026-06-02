import {
  cellInRange,
  computeFillTarget,
  hitTestCell,
  mergeVisualRange,
  type AutofitRowsResult,
  type CellRange,
  type GridEngine,
  type RenderFrame,
} from '@novasheet/core'
import {
  computeRangeOverlayRects,
  type Drag,
  type FillEvent,
  type WebFrameSync,
  type WebHost,
  type WebInteractionStatus,
  type WebPointerEvent,
} from '@novasheet/web'
import { DomFillHandleLayer } from './DomFillHandleLayer'
import { computeFillHandleRect } from './computeFillHandleRect'

/** FillHandleController 所需 runtime 服务（feature 自定义 deps，从通用 kernel services 组装）。 */
export interface FillHandleControllerDeps {
  readonly engine: GridEngine
  readonly host: WebHost
  afterEngineMutation(): void
  autofitRows(options: { rows?: readonly number[] }): AutofitRowsResult
  onFill(event: FillEvent): void
  closeContextMenu(): void
  commitActiveEdit(moveSelection: boolean): void
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
 * 填充柄控制器：Drag 状态机 + WebFrameSync overlay，独占持有 DomFillHandleLayer。
 *
 * layer pointerdown/move/up 直接回调本控制器（不经 runtime 中转）；commit 只通过 engine。
 * syncFrame 每帧根据选区/合并区重算手柄位置，编辑或任一拖拽进行时隐藏。
 */
export class FillHandleController implements Drag, WebFrameSync {
  readonly autoScrollAxis = 'both' as const
  private state: FillState | null = null
  private layer: DomFillHandleLayer | null = null

  constructor(private readonly deps: FillHandleControllerDeps) {}

  get active(): boolean {
    return this.state !== null
  }

  // --- WebFrameSync ---

  attach(container: HTMLElement): void {
    this.layer = new DomFillHandleLayer(container, {
      onFillPointerDown: (pointerId, x, y) => this.startFromClient(pointerId, x, y),
      onFillPointerMove: (pointerId, x, y) => this.moveFromClient(pointerId, x, y),
      onFillPointerUp: (pointerId) => this.commitPointer(pointerId),
    })
    this.layer.attach()
  }

  syncFrame(frame: RenderFrame, status: WebInteractionStatus): void {
    if (!this.layer) return
    if (status.interacting || status.editing) {
      this.layer.sync(null)
      return
    }
    const range = frame.selection?.selectedRange
    if (!range) {
      this.layer.sync(null)
      return
    }
    // 与选区边框一致：active cell 落在合并区内时锚定整个合并区。
    const visualRange = mergeVisualRange(frame.mergeRegions, range, frame.selection?.activeCell)
    this.layer.sync(computeFillHandleRect(frame, visualRange))
  }

  destroy(): void {
    this.state = null
    this.deps.stopAutoScroll()
    this.layer?.destroy()
    this.layer = null
  }

  // --- Drag ---

  tryStart(_event: WebPointerEvent): boolean {
    return false
  }

  move(event: WebPointerEvent): boolean {
    if (!this.state) return false
    this.applyPointerMove(event)
    return true
  }

  reevaluate(pointer: WebPointerEvent): void {
    this.move(pointer)
  }

  commit(): void {
    const state = this.state
    this.state = null
    this.deps.stopAutoScroll()
    this.layer?.hidePreview()
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
    this.layer?.hidePreview()
  }

  // --- 客户端坐标入口（layer pointer 回调）---

  private startFromClient(pointerId: number, clientX: number, clientY: number): void {
    if (this.deps.isBlocked()) return
    if (this.deps.engine.isCellEditing()) this.deps.commitActiveEdit(false)
    const source = this.deps.engine.getSelection().selectedRange
    if (!source) return
    this.deps.closeContextMenu()
    this.state = {
      pointerId,
      source,
      target: null,
      lastPointer: this.pointerFromClient(clientX, clientY),
    }
  }

  private moveFromClient(pointerId: number, clientX: number, clientY: number): void {
    if (!this.state || this.state.pointerId !== pointerId) return
    this.move(this.pointerFromClient(clientX, clientY))
  }

  private commitPointer(pointerId: number): void {
    if (!this.state || this.state.pointerId !== pointerId) return
    this.commit()
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
      this.layer?.showPreview(
        computeRangeOverlayRects(this.deps.engine.getFrame(), state.target.fill),
      )
    } else {
      this.layer?.hidePreview()
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
