import type { GridSelection } from '../selection/SelectionTypes'
import type { UndoCommand } from '../../kernel/undo/UndoCommand'
import type { UndoHandler } from '../../kernel/undo/UndoHandler'

/** 本 handler 负责的单域列结构 kind 集合（无 format/merge/frozen）。 */
const COLUMN_KINDS = new Set<UndoCommand['kind']>([
  'resizeColumn',
  'resizeColumnsMulti',
  'hideCols',
  'unhideCols',
])

/**
 * 列结构域 undo 所需的最小 engine 能力面。
 *
 * `rebuildCols()` 为全重建（axis + frozen + viewport）；列侧 undo/redo 两侧本就对称（旧 switch
 * 均 `rebuildViewColsAxis`），无行侧那种 redo 漏重建的 latent bug。
 */
export interface ColumnUndoContext {
  setColWidth(colIndex: number, width: number): void
  setColWidthById(fieldId: string, width: number): void
  addHiddenCols(fieldIds: readonly string[]): void
  removeHiddenCols(fieldIds: readonly string[]): void
  rebuildCols(): void
  restoreSelection(selection: GridSelection): void
  getDefaultColWidth(): number
}

/**
 * 列结构域的 undo/redo handler：覆盖 `resizeColumn` / `resizeColumnsMulti` / `hideCols` / `unhideCols`。
 *
 * 语义自 `DefaultGridEngine.applyUndo/applyRedo` 列分支迁移；`resizeColumn` **无选区恢复**，其余三 kind
 * undo 用 `selectionBefore`、redo 用 `selectionAfter`。`resizeColumnsMulti` redo 逐列写 `newWidth`。
 */
export class ColumnUndoHandler implements UndoHandler {
  readonly domain = 'column'

  constructor(private readonly ctx: ColumnUndoContext) {}

  handles(kind: UndoCommand['kind']): boolean {
    return COLUMN_KINDS.has(kind)
  }

  applyUndo(command: UndoCommand): void {
    switch (command.kind) {
      case 'resizeColumn':
        this.ctx.setColWidth(command.colIndex, command.before)
        this.ctx.rebuildCols()
        return
      case 'resizeColumnsMulti':
        for (let i = 0; i < command.fieldIds.length; i += 1) {
          this.ctx.setColWidthById(
            command.fieldIds[i]!,
            command.oldWidths[i] ?? this.ctx.getDefaultColWidth(),
          )
        }
        this.ctx.rebuildCols()
        this.ctx.restoreSelection(command.selectionBefore)
        return
      case 'hideCols':
        this.ctx.removeHiddenCols(command.fieldIds)
        this.ctx.rebuildCols()
        this.ctx.restoreSelection(command.selectionBefore)
        return
      case 'unhideCols':
        this.ctx.addHiddenCols(command.fieldIds)
        this.ctx.rebuildCols()
        this.ctx.restoreSelection(command.selectionBefore)
        return
      default:
        return
    }
  }

  applyRedo(command: UndoCommand): void {
    switch (command.kind) {
      case 'resizeColumn':
        this.ctx.setColWidth(command.colIndex, command.after)
        this.ctx.rebuildCols()
        return
      case 'resizeColumnsMulti':
        for (const id of command.fieldIds) this.ctx.setColWidthById(id, command.newWidth)
        this.ctx.rebuildCols()
        this.ctx.restoreSelection(command.selectionAfter)
        return
      case 'hideCols':
        this.ctx.addHiddenCols(command.fieldIds)
        this.ctx.rebuildCols()
        this.ctx.restoreSelection(command.selectionAfter)
        return
      case 'unhideCols':
        this.ctx.removeHiddenCols(command.fieldIds)
        this.ctx.rebuildCols()
        this.ctx.restoreSelection(command.selectionAfter)
        return
      default:
        return
    }
  }
}
