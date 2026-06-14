import type { GridSelection } from '../../kernel/coords/SelectionTypes'
import type { UndoCommand } from '../../kernel/undo/UndoCommand'
import type { UndoHandler } from '../../kernel/undo/UndoHandler'
import type { CellTypeSnapshot } from './CellTypeStore'

export interface CellTypeUndoContext {
  restoreCellTypes(snapshot: CellTypeSnapshot): void
  restoreSelection(selection: GridSelection): void
}

export class CellTypeUndoHandler implements UndoHandler {
  readonly domain = 'cellType'

  constructor(private readonly ctx: CellTypeUndoContext) {}

  handles(kind: UndoCommand['kind']): boolean {
    return kind === 'cellType'
  }

  applyUndo(command: UndoCommand): void {
    if (command.kind !== 'cellType') return
    this.ctx.restoreCellTypes(command.before)
    this.ctx.restoreSelection(command.selectionBefore)
  }

  applyRedo(command: UndoCommand): void {
    if (command.kind !== 'cellType') return
    this.ctx.restoreCellTypes(command.after)
    this.ctx.restoreSelection(command.selectionAfter)
  }
}
