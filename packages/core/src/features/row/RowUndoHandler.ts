import type { GridSelection } from '../../kernel/coords/SelectionTypes'
import type { UndoCommand } from '../../kernel/undo/UndoCommand'
import type { UndoHandler } from '../../kernel/undo/UndoHandler'

/** 本 handler 负责的单域行结构 kind 集合（无 format/merge/frozen）。 */
const ROW_KINDS = new Set<UndoCommand['kind']>([
  'resizeRow',
  'resizeRowsMulti',
  'hideRows',
  'unhideRows',
])

/**
 * 行结构域 undo 所需的最小 engine 能力面。
 *
 * `rebuildRows()` 是**全重建**（axis + frozen + viewport），undo/redo 均经它——修掉旧 switch
 * 中行 redo 仅换 axis 引用、不重建 frozen/viewport 的 latent bug（见 M3 plan「⚠ STOP」）。
 */
export interface RowUndoContext {
  setRowHeight(rowIndex: number, height: number): void
  setRowHeightsMulti(rowIds: readonly number[], height: number): void
  addHiddenRows(underlyingRowIds: readonly number[]): void
  removeHiddenRows(underlyingRowIds: readonly number[]): void
  rebuildRows(): void
  restoreSelection(selection: GridSelection): void
  resolveDefaultRowHeight(): number
}

/**
 * 行结构域的 undo/redo handler：覆盖 `resizeRow` / `resizeRowsMulti` / `hideRows` / `unhideRows`。
 *
 * 语义自 `DefaultGridEngine.applyUndo/applyRedo` 行分支迁移；`resizeRow` **无选区恢复**，其余三 kind
 * undo 用 `selectionBefore`、redo 用 `selectionAfter`。所有路径均以单一 `rebuildRows()` 收尾。
 */
export class RowUndoHandler implements UndoHandler {
  readonly domain = 'row'

  constructor(private readonly ctx: RowUndoContext) {}

  handles(kind: UndoCommand['kind']): boolean {
    return ROW_KINDS.has(kind)
  }

  applyUndo(command: UndoCommand): void {
    switch (command.kind) {
      case 'resizeRow':
        this.ctx.setRowHeight(command.rowIndex, command.before)
        this.ctx.rebuildRows()
        return
      case 'resizeRowsMulti':
        for (let i = 0; i < command.rowIds.length; i += 1) {
          this.ctx.setRowHeight(
            command.rowIds[i]!,
            command.oldHeights[i] ?? this.ctx.resolveDefaultRowHeight(),
          )
        }
        this.ctx.rebuildRows()
        this.ctx.restoreSelection(command.selectionBefore)
        return
      case 'hideRows':
        this.ctx.removeHiddenRows(command.underlyingRowIds)
        this.ctx.rebuildRows()
        this.ctx.restoreSelection(command.selectionBefore)
        return
      case 'unhideRows':
        this.ctx.addHiddenRows(command.underlyingRowIds)
        this.ctx.rebuildRows()
        this.ctx.restoreSelection(command.selectionBefore)
        return
      default:
        return
    }
  }

  applyRedo(command: UndoCommand): void {
    switch (command.kind) {
      case 'resizeRow':
        this.ctx.setRowHeight(command.rowIndex, command.after)
        this.ctx.rebuildRows()
        return
      case 'resizeRowsMulti':
        this.ctx.setRowHeightsMulti(command.rowIds, command.newHeight)
        this.ctx.rebuildRows()
        this.ctx.restoreSelection(command.selectionAfter)
        return
      case 'hideRows':
        this.ctx.addHiddenRows(command.underlyingRowIds)
        this.ctx.rebuildRows()
        this.ctx.restoreSelection(command.selectionAfter)
        return
      case 'unhideRows':
        this.ctx.removeHiddenRows(command.underlyingRowIds)
        this.ctx.rebuildRows()
        this.ctx.restoreSelection(command.selectionAfter)
        return
      default:
        return
    }
  }
}
