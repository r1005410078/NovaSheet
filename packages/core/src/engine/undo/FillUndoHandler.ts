import type { CellValue } from '../../kernel/data/Schema'
import type { CellRange } from '../selection/SelectionTypes'
import type { FormatLayer } from '../../format/CellFormat'
import type { MergeRegion } from '../../merge/MergeStore'
import type { CellWrite, UndoCommand } from '../../kernel/undo/UndoCommand'
import type { UndoHandler } from '../../kernel/undo/UndoHandler'

/**
 * fill 域 undo 所需的最小 engine 能力面。
 *
 * fill 跨域（cells +（可选）format/merge + 选区），但不属行/列结构，故 handler 置于 `undo/`。
 */
export interface FillUndoContext {
  applyCellWrite(rowIndex: number, fieldId: string, value: CellValue): void
  restoreSelectionForWrites(writes: readonly CellWrite[], fallbackRange: CellRange): void
  restoreFormat(layers: readonly FormatLayer[]): void
  restoreMerge(regions: readonly MergeRegion[]): void
}

/**
 * fill 复合命令的 undo/redo handler。
 *
 * 语义自 `DefaultGridEngine.applyUndo/applyRedo` 的 `fill` 分支原样迁移，**次序敏感**：
 * writes → （可选）format → （可选）merge → selection。`formatBefore/After`、`mergeBefore/After`
 * 仅在存在时 restore（Phase 5-A：raw 映射非连续散裂时缺省，不恢复 store）。
 */
export class FillUndoHandler implements UndoHandler {
  readonly domain = 'fill'

  constructor(private readonly ctx: FillUndoContext) {}

  handles(kind: UndoCommand['kind']): boolean {
    return kind === 'fill'
  }

  applyUndo(command: UndoCommand): void {
    if (command.kind !== 'fill') return
    for (const w of command.before) this.ctx.applyCellWrite(w.rowIndex, w.fieldId, w.value)
    if (command.formatBefore) this.ctx.restoreFormat(command.formatBefore)
    if (command.mergeBefore) this.ctx.restoreMerge(command.mergeBefore)
    this.ctx.restoreSelectionForWrites(command.before, command.source)
  }

  applyRedo(command: UndoCommand): void {
    if (command.kind !== 'fill') return
    for (const w of command.after) this.ctx.applyCellWrite(w.rowIndex, w.fieldId, w.value)
    if (command.formatAfter) this.ctx.restoreFormat(command.formatAfter)
    if (command.mergeAfter) this.ctx.restoreMerge(command.mergeAfter)
    this.ctx.restoreSelectionForWrites(command.after, command.result)
  }
}
