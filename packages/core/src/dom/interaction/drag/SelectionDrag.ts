import { hitTestCell } from '../../../kernel/interaction/HitTest'
import type { GridFrameReader, GridSelectionAccess } from '../../../engine/GridEngine'
import type { WebPointerEvent } from '../../host/Host'
import type { AutoScrollAxis, Drag } from './Drag'

type SelectionDragEngine = GridFrameReader & Pick<GridSelectionAccess, 'selectCell'>

/** SelectionDrag 所需的 runtime 交互服务。 */
export interface SelectionDragDeps {
  readonly engine: SelectionDragEngine
  refresh(): void
  requestAutoScroll(pointer: WebPointerEvent): void
  stopAutoScroll(): void
  syncFillHandle(): void
  isBlocked(): boolean
}

interface SelectionState {
  dragging: boolean
}

/** 普通单元格拖选状态机（R1 DragController）。 */
export class SelectionDrag implements Drag {
  readonly autoScrollAxis: AutoScrollAxis = 'both'
  private state: SelectionState | null = null

  constructor(private readonly deps: SelectionDragDeps) {}

  get active(): boolean {
    return this.state?.dragging === true
  }

  tryStart(event: WebPointerEvent): boolean {
    if (this.deps.isBlocked()) return false
    const hit = hitTestCell(this.deps.engine.getFrame(), event)
    if (!hit) return false
    if (event.shiftKey) this.deps.engine.selectCell(hit, { extend: true })
    else this.deps.engine.selectCell(hit)
    this.state = { dragging: false }
    this.deps.refresh()
    return true
  }

  move(event: WebPointerEvent): boolean {
    if (!this.state) return false
    this.state.dragging = true
    const hit = hitTestCell(this.deps.engine.getFrame(), event)
    if (hit) {
      this.deps.engine.selectCell(hit, { extend: true })
      this.deps.refresh()
    }
    this.deps.requestAutoScroll(event)
    return true
  }

  reevaluate(pointer: WebPointerEvent): void {
    this.move(pointer)
  }

  commit(): void {
    if (!this.state) return
    this.state = null
    this.deps.stopAutoScroll()
    this.deps.syncFillHandle()
  }

  cancel(): void {
    this.state = null
    this.deps.stopAutoScroll()
    this.deps.syncFillHandle()
  }
}
