import type { CellRange } from '../../../kernel/coords/SelectionTypes'
import type { GridSelectionAccess } from '../../../engine/GridEngine'
import type { ColumnGroupHeaderHit } from '../ColumnGroupHeaderHit'
import type { WebPointerEvent } from '../../host/Host'
import type { AutoScrollAxis, Drag } from './Drag'

type ColumnGroupHeaderDragEngine = Pick<GridSelectionAccess, 'getSelection'>

export interface ColumnGroupHeaderDragDeps {
  readonly engine: ColumnGroupHeaderDragEngine
  refresh(): void
  requestAutoScroll(pointer: WebPointerEvent): void
  stopAutoScroll(): void
  isBlocked(): boolean
  hitTestGroupHeader(event: WebPointerEvent): ColumnGroupHeaderHit | null
  hitTestGroupHeaderAtLevel(event: WebPointerEvent, level: number): ColumnGroupHeaderHit | null
  isWholeColumnSelection(range: CellRange): boolean
  selectWholeColumnRange(anchorCol: number, extentCol: number): void
}

interface GroupSelectState {
  readonly level: number
  readonly anchorStartCol: number
  readonly anchorEndCol: number
}

export class ColumnGroupHeaderDrag implements Drag {
  readonly autoScrollAxis: AutoScrollAxis = 'horizontal'
  private state: GroupSelectState | null = null

  constructor(private readonly deps: ColumnGroupHeaderDragDeps) {}

  get active(): boolean {
    return this.state !== null
  }

  tryStart(event: WebPointerEvent): boolean {
    if (this.deps.isBlocked()) return false
    const hit = this.deps.hitTestGroupHeader(event)
    if (!hit) return false
    const selection = this.deps.engine.getSelection()
    const range = selection.selectedRange
    const existingAnchor =
      event.shiftKey && range && this.deps.isWholeColumnSelection(range)
        ? selection.anchorCell?.colIndex
        : undefined
    this.state = existingAnchor === undefined
      ? { level: hit.level, anchorStartCol: hit.startViewCol, anchorEndCol: hit.endViewCol }
      : { level: hit.level, anchorStartCol: existingAnchor, anchorEndCol: existingAnchor }
    this.selectThrough(hit)
    this.deps.refresh()
    return true
  }

  move(event: WebPointerEvent): boolean {
    const state = this.state
    if (!state) return false
    this.deps.requestAutoScroll(event)
    const hit = this.deps.hitTestGroupHeaderAtLevel(event, state.level)
    if (hit) {
      this.selectThrough(hit)
      this.deps.refresh()
    }
    return true
  }

  reevaluate(pointer: WebPointerEvent): void {
    this.move(pointer)
  }

  commit(): void {
    this.finish()
  }

  cancel(): void {
    this.finish()
  }

  private selectThrough(hit: ColumnGroupHeaderHit): void {
    const state = this.state
    if (!state) return
    if (hit.endViewCol < state.anchorStartCol) {
      this.deps.selectWholeColumnRange(state.anchorEndCol, hit.startViewCol)
      return
    }
    this.deps.selectWholeColumnRange(state.anchorStartCol, hit.endViewCol)
  }

  private finish(): void {
    this.state = null
    this.deps.stopAutoScroll()
  }
}
