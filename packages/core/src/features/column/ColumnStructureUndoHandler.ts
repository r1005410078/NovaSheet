import type { Field } from '../../kernel/data/Schema'
import type { RemovedFieldSnapshot } from '../../kernel/data/MutableDataSource'
import type { FrozenConfig } from '../../kernel/geometry/FrozenRegions'
import type { FormatLayer } from '../../kernel/protocol/FormatTypes'
import type { MergeRegion } from '../merge/MergeStore'
import type { GridSelection } from '../../kernel/coords/SelectionTypes'
import type { CellTypeSnapshot } from '../../kernel/protocol/CellTypeTypes'
import type { UndoCommand } from '../../kernel/undo/UndoCommand'
import type { UndoHandler } from '../../kernel/undo/UndoHandler'

/** 本 handler 负责的复合列结构 kind 集合（结构 + frozen + format + merge + 选区）。 */
const COLUMN_STRUCTURE_KINDS = new Set<UndoCommand['kind']>(['insertCols', 'deleteCols', 'moveCols'])

/**
 * 复合列结构 undo 所需的最小 engine 能力面。
 *
 * 列 insert/delete 旧 switch **无** `isMutableDataSource` 守卫（与行不同），故无能力查询。
 * `replayMoveCols` 委派 engine 现有私有 helper（内部含 move + rebuild + 选区）。
 */
export interface ColumnStructureUndoContext {
  reinsertCols(snapshots: readonly RemovedFieldSnapshot[], widths: readonly number[]): void
  removeFieldsByIds(fieldIds: readonly string[]): void
  insertFieldsAt(at: number, fields: readonly Field[], widths: readonly number[]): void
  replayMoveCols(fieldIds: readonly string[], beforeFieldId: string | null, selection: GridSelection): void
  restoreFrozen(config: FrozenConfig): void
  rebuildCols(): void
  restoreFormat(layers: readonly FormatLayer[]): void
  restoreMerge(regions: readonly MergeRegion[]): void
  restoreCellTypes?(snapshot: CellTypeSnapshot): void
  restoreSelection(selection: GridSelection): void
}

/**
 * 复合列结构命令的 undo/redo handler：`insertCols` / `deleteCols` / `moveCols`。
 *
 * 语义自 `DefaultGridEngine.applyUndo/applyRedo` 列分支迁移，**次序敏感**：
 * insert/delete 走 结构 → frozen → rebuild → selection → format → merge（注意与行的次序不同：
 * 列把 selection 放在 format/merge 之前）；move 走 replay → format → merge（replay 内部已 rebuild + 选区）。
 */
export class ColumnStructureUndoHandler implements UndoHandler {
  readonly domain = 'columnStructure'

  constructor(private readonly ctx: ColumnStructureUndoContext) {}

  handles(kind: UndoCommand['kind']): boolean {
    return COLUMN_STRUCTURE_KINDS.has(kind)
  }

  applyUndo(command: UndoCommand): void {
    switch (command.kind) {
      case 'insertCols':
        this.ctx.removeFieldsByIds(command.newFields.map((f) => f.id))
        this.ctx.restoreFrozen(command.frozenBefore)
        this.ctx.rebuildCols()
        this.ctx.restoreSelection(command.selectionBefore)
        this.ctx.restoreFormat(command.formatBefore)
        this.ctx.restoreMerge(command.mergeBefore)
        if (command.cellTypeBefore) this.ctx.restoreCellTypes?.(command.cellTypeBefore)
        return
      case 'deleteCols':
        this.ctx.reinsertCols(command.snapshots, command.deletedWidths)
        this.ctx.restoreFrozen(command.frozenBefore)
        this.ctx.rebuildCols()
        this.ctx.restoreSelection(command.selectionBefore)
        this.ctx.restoreFormat(command.formatBefore)
        this.ctx.restoreMerge(command.mergeBefore)
        if (command.cellTypeBefore) this.ctx.restoreCellTypes?.(command.cellTypeBefore)
        return
      case 'moveCols':
        this.ctx.replayMoveCols(command.fieldIds, command.inverseBeforeFieldId, command.selectionBefore)
        this.ctx.restoreFormat(command.formatBefore)
        this.ctx.restoreMerge(command.mergeBefore)
        if (command.cellTypeBefore) this.ctx.restoreCellTypes?.(command.cellTypeBefore)
        return
      default:
        return
    }
  }

  applyRedo(command: UndoCommand): void {
    switch (command.kind) {
      case 'insertCols':
        this.ctx.insertFieldsAt(
          command.at,
          command.newFields,
          command.newFields.map((f) => f.width),
        )
        this.ctx.restoreFrozen(command.frozenAfter)
        this.ctx.rebuildCols()
        this.ctx.restoreSelection(command.selectionAfter)
        this.ctx.restoreFormat(command.formatAfter)
        this.ctx.restoreMerge(command.mergeAfter)
        if (command.cellTypeAfter) this.ctx.restoreCellTypes?.(command.cellTypeAfter)
        return
      case 'deleteCols':
        this.ctx.removeFieldsByIds(command.snapshots.map((s) => s.field.id))
        this.ctx.restoreFrozen(command.frozenAfter)
        this.ctx.rebuildCols()
        this.ctx.restoreSelection(command.selectionAfter)
        this.ctx.restoreFormat(command.formatAfter)
        this.ctx.restoreMerge(command.mergeAfter)
        if (command.cellTypeAfter) this.ctx.restoreCellTypes?.(command.cellTypeAfter)
        return
      case 'moveCols':
        this.ctx.replayMoveCols(command.fieldIds, command.beforeFieldId, command.selectionAfter)
        this.ctx.restoreFormat(command.formatAfter)
        this.ctx.restoreMerge(command.mergeAfter)
        if (command.cellTypeAfter) this.ctx.restoreCellTypes?.(command.cellTypeAfter)
        return
      default:
        return
    }
  }
}
