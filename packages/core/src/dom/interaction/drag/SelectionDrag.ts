import { hitTestCell } from '../../../kernel/interaction/HitTest'
import { resolveSelectionIntent } from '../../../kernel/interaction/SelectionIntent'
import type { ResolvedSelectionBehavior } from '../../../kernel/interaction/SelectionBehavior'
import type { CellRange } from '../../../kernel/coords/SelectionTypes'
import type { GridFrameReader, GridSelectionAccess } from '../../../engine/GridEngine'
import type { WebPointerEvent } from '../../host/Host'
import type { AutoScrollAxis, Drag } from './Drag'

type SelectionDragEngine = GridFrameReader & Pick<GridSelectionAccess, 'selectCell' | 'getSelection'>

/** SelectionDrag 所需的 runtime 交互服务。 */
export interface SelectionDragDeps {
  readonly engine: SelectionDragEngine
  refresh(): void
  requestAutoScroll(pointer: WebPointerEvent): void
  stopAutoScroll(): void
  syncFillHandle(): void
  isBlocked(): boolean
  getSelectionBehavior(): ResolvedSelectionBehavior
  selectWholeRowRange(anchorRow: number, extentRow: number): void
  selectWholeColumnRange(anchorCol: number, extentCol: number): void
  selectAllCells(): void
  isWholeRowSelection(range: CellRange): boolean
  isWholeColumnSelection(range: CellRange): boolean
}

interface SelectionState {
  dragging: boolean
  intent: 'cell' | 'row' | 'column'
  anchorRow: number
  anchorCol: number
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
    const frame = this.deps.engine.getFrame()
    const intent = resolveSelectionIntent(frame, event, this.deps.getSelectionBehavior())
    if (intent === null || intent.kind === 'none') return false
    if (intent.kind === 'all') {
      this.deps.selectAllCells()
      this.deps.refresh()
      return true
    }

    if (intent.kind === 'cell') {
      if (event.shiftKey) this.deps.engine.selectCell(intent.cell, { extend: true })
      else this.deps.engine.selectCell(intent.cell)
      this.state = {
        dragging: false,
        intent: 'cell',
        anchorRow: intent.cell.rowIndex,
        anchorCol: intent.cell.colIndex,
      }
    } else if (intent.kind === 'row') {
      const selection = this.deps.engine.getSelection()
      const existingRange = selection.selectedRange
      const anchorRow =
        event.shiftKey && existingRange && this.deps.isWholeRowSelection(existingRange)
          ? selection.anchorCell?.rowIndex ?? intent.rowIndex
          : intent.rowIndex
      this.deps.selectWholeRowRange(anchorRow, intent.rowIndex)
      this.state = { dragging: false, intent: 'row', anchorRow, anchorCol: 0 }
    } else {
      const selection = this.deps.engine.getSelection()
      const existingRange = selection.selectedRange
      const anchorCol =
        event.shiftKey && existingRange && this.deps.isWholeColumnSelection(existingRange)
          ? selection.anchorCell?.colIndex ?? intent.colIndex
          : intent.colIndex
      this.deps.selectWholeColumnRange(anchorCol, intent.colIndex)
      this.state = { dragging: false, intent: 'column', anchorRow: 0, anchorCol }
    }
    this.deps.refresh()
    return true
  }

  move(event: WebPointerEvent): boolean {
    if (!this.state) return false
    this.state.dragging = true
    const hit = hitTestCell(this.deps.engine.getFrame(), event)
    if (hit) {
      if (this.state.intent === 'row') {
        this.deps.selectWholeRowRange(this.state.anchorRow, hit.rowIndex)
      } else if (this.state.intent === 'column') {
        this.deps.selectWholeColumnRange(this.state.anchorCol, hit.colIndex)
      } else {
        this.deps.engine.selectCell(hit, { extend: true })
      }
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
