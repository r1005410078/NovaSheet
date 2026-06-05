import type { CellUndoContext, UndoHandler } from './UndoHandler'
import type { UndoCommand } from '../../undo/UndoCommand'

/** 本 handler 负责的 cell-write 域命令 kind 集合。 */
const CELL_KINDS = new Set<UndoCommand['kind']>(['editCell', 'clearRange', 'paste'])

/**
 * cell-write 域的 undo/redo handler：覆盖 `editCell` / `clearRange` / `paste`。
 *
 * 逆/重做语义自 `DefaultGridEngine.applyUndo/applyRedo` 的对应分支原样迁移，次序/值敏感：
 * - `clearRange` redo 写 `null`（非 `w.value`），但迭代与选区 fallback 仍用 `cmd.before`/`cmd.range`；
 * - `paste` undo 用 `cmd.before`，redo 用 `cmd.after`，二者均以 `cmd.target` 作选区 fallback。
 */
export class CellUndoHandler implements UndoHandler {
  readonly domain = 'cell'

  constructor(private readonly ctx: CellUndoContext) {}

  handles(kind: UndoCommand['kind']): boolean {
    return CELL_KINDS.has(kind)
  }

  applyUndo(command: UndoCommand): void {
    switch (command.kind) {
      case 'editCell':
        this.ctx.applyCellWrite(command.rowIndex, command.fieldId, command.before)
        this.ctx.restoreSelectionAfterEdit(command.rowIndex, command.fieldId)
        return
      case 'clearRange':
        for (const w of command.before) this.ctx.applyCellWrite(w.rowIndex, w.fieldId, w.value)
        this.ctx.restoreSelectionForWrites(command.before, command.range)
        return
      case 'paste':
        for (const w of command.before) this.ctx.applyCellWrite(w.rowIndex, w.fieldId, w.value)
        this.ctx.restoreSelectionForWrites(command.before, command.target)
        return
      default:
        return
    }
  }

  applyRedo(command: UndoCommand): void {
    switch (command.kind) {
      case 'editCell':
        this.ctx.applyCellWrite(command.rowIndex, command.fieldId, command.after)
        this.ctx.restoreSelectionAfterEdit(command.rowIndex, command.fieldId)
        return
      case 'clearRange':
        for (const w of command.before) this.ctx.applyCellWrite(w.rowIndex, w.fieldId, null)
        this.ctx.restoreSelectionForWrites(command.before, command.range)
        return
      case 'paste':
        for (const w of command.after) this.ctx.applyCellWrite(w.rowIndex, w.fieldId, w.value)
        this.ctx.restoreSelectionForWrites(command.after, command.target)
        return
      default:
        return
    }
  }
}
