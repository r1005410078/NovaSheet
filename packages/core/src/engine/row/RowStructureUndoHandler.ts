import type { DeletedRowSnapshot } from '../../data/MutableDataSource'
import type { FormatLayer } from '../../format/CellFormat'
import type { MergeRegion } from '../../merge/MergeStore'
import type { GridSelection } from '../selection/SelectionTypes'
import type { UndoCommand } from '../../undo/UndoCommand'
import type { UndoHandler } from '../undo/UndoHandler'

/** 本 handler 负责的复合行结构 kind 集合（结构 + format + merge + 选区）。 */
const ROW_STRUCTURE_KINDS = new Set<UndoCommand['kind']>(['insertRows', 'deleteRows', 'moveRows'])

/**
 * 复合行结构 undo 所需的最小 engine 能力面。
 *
 * `canInsertRows`/`canDeleteRows` 把旧 switch 里 `isMutableDataSource` 的整支早返回守卫下沉到能力面，
 * handler 不自行判类型。`replayMoveRows` 委派 engine 现有私有 helper（内部含 move + rebuild + 选区）。
 * `rebuildRows` 为**全重建**——顺带修 insert/delete redo 旧裸式只换 axis、不重建 frozen/viewport 的 bug。
 */
export interface RowStructureUndoContext {
  canInsertRows(): boolean
  canDeleteRows(): boolean
  deleteRowsByIds(ids: readonly number[]): void
  insertBlankRows(at: number, count: number): void
  reinsertRows(snapshots: readonly DeletedRowSnapshot[], heights: readonly number[]): void
  replayMoveRows(rowIds: readonly number[], beforeRowId: number | null, selection: GridSelection): void
  rebuildRows(): void
  restoreFormat(layers: readonly FormatLayer[]): void
  restoreMerge(regions: readonly MergeRegion[]): void
  restoreSelection(selection: GridSelection): void
}

/**
 * 复合行结构命令的 undo/redo handler：`insertRows` / `deleteRows` / `moveRows`。
 *
 * 语义自 `DefaultGridEngine.applyUndo/applyRedo` 行分支迁移，**次序敏感**：
 * insert/delete 走 结构 → rebuild → format → merge → selection；move 走 replay → format → merge
 * （replay 内部已 rebuild + 选区）。insert/delete 在不支持对应 mutation 时整支 no-op。
 */
export class RowStructureUndoHandler implements UndoHandler {
  readonly domain = 'rowStructure'

  constructor(private readonly ctx: RowStructureUndoContext) {}

  handles(kind: UndoCommand['kind']): boolean {
    return ROW_STRUCTURE_KINDS.has(kind)
  }

  applyUndo(command: UndoCommand): void {
    switch (command.kind) {
      case 'insertRows': {
        if (!this.ctx.canDeleteRows()) return
        const ids = Array.from({ length: command.count }, (_, i) => command.at + i)
        this.ctx.deleteRowsByIds(ids)
        this.ctx.rebuildRows()
        this.ctx.restoreFormat(command.formatBefore)
        this.ctx.restoreMerge(command.mergeBefore)
        this.ctx.restoreSelection(command.selectionBefore)
        return
      }
      case 'deleteRows':
        if (!this.ctx.canInsertRows()) return
        this.ctx.reinsertRows(command.snapshots, command.deletedHeights)
        this.ctx.rebuildRows()
        this.ctx.restoreFormat(command.formatBefore)
        this.ctx.restoreMerge(command.mergeBefore)
        this.ctx.restoreSelection(command.selectionBefore)
        return
      case 'moveRows':
        this.ctx.replayMoveRows(command.inverseRowIds, command.inverseBeforeRowId, command.selectionBefore)
        this.ctx.restoreFormat(command.formatBefore)
        this.ctx.restoreMerge(command.mergeBefore)
        return
      default:
        return
    }
  }

  applyRedo(command: UndoCommand): void {
    switch (command.kind) {
      case 'insertRows':
        if (!this.ctx.canInsertRows()) return
        this.ctx.insertBlankRows(command.at, command.count)
        this.ctx.rebuildRows()
        this.ctx.restoreFormat(command.formatAfter)
        this.ctx.restoreMerge(command.mergeAfter)
        this.ctx.restoreSelection(command.selectionAfter)
        return
      case 'deleteRows': {
        if (!this.ctx.canDeleteRows()) return
        const ids = [...command.snapshots]
          .sort((a, b) => a.originalUnderlyingRow - b.originalUnderlyingRow)
          .map((s) => s.originalUnderlyingRow)
        this.ctx.deleteRowsByIds(ids)
        this.ctx.rebuildRows()
        this.ctx.restoreFormat(command.formatAfter)
        this.ctx.restoreMerge(command.mergeAfter)
        this.ctx.restoreSelection(command.selectionAfter)
        return
      }
      case 'moveRows':
        this.ctx.replayMoveRows(command.rowIds, command.beforeRowId, command.selectionAfter)
        this.ctx.restoreFormat(command.formatAfter)
        this.ctx.restoreMerge(command.mergeAfter)
        return
      default:
        return
    }
  }
}
