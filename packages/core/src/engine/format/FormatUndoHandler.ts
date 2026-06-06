import type { FormatLayer } from '../../format/CellFormat'
import type { MergeRegion } from '../../merge/MergeStore'
import type { GridSelection } from '../selection/SelectionTypes'
import type { UndoCommand } from '../../kernel/undo/UndoCommand'
import type { UndoHandler } from '../../kernel/undo/UndoHandler'

/** 本 handler 负责的 format 域命令 kind 集合。 */
const FORMAT_KINDS = new Set<UndoCommand['kind']>(['format', 'merge', 'unmerge'])

/**
 * format 域 undo 所需的最小 engine 能力面。
 *
 * 由 engine 实现并在注册时注入；与正向写入门面 `FormatController` 同域。
 */
export interface FormatUndoContext {
  /** 还原 format store 快照（engine 内为 `RangeStyleStore.restore`）。 */
  restoreFormat(layers: readonly FormatLayer[]): void
  /** 还原 merge store 快照（engine 内为 `MergeStore.restore`）。 */
  restoreMerge(regions: readonly MergeRegion[]): void
  /** 还原选区（engine 内为 `selectionController.setSelection`）。 */
  restoreSelection(selection: GridSelection): void
}

/**
 * format 域的 undo/redo handler：覆盖 `format` / `merge` / `unmerge`，均为单 store + 选区。
 *
 * 逆/重做语义自 `DefaultGridEngine.applyUndo/applyRedo` 的对应分支原样迁移：
 * `format` 动 format store，`merge`/`unmerge` 动 merge store；undo 用 before/selectionBefore，
 * redo 用 after/selectionAfter。
 */
export class FormatUndoHandler implements UndoHandler {
  readonly domain = 'format'

  constructor(private readonly ctx: FormatUndoContext) {}

  handles(kind: UndoCommand['kind']): boolean {
    return FORMAT_KINDS.has(kind)
  }

  applyUndo(command: UndoCommand): void {
    switch (command.kind) {
      case 'format':
        this.ctx.restoreFormat(command.before)
        this.ctx.restoreSelection(command.selectionBefore)
        return
      case 'merge':
      case 'unmerge':
        this.ctx.restoreMerge(command.before)
        this.ctx.restoreSelection(command.selectionBefore)
        return
      default:
        return
    }
  }

  applyRedo(command: UndoCommand): void {
    switch (command.kind) {
      case 'format':
        this.ctx.restoreFormat(command.after)
        this.ctx.restoreSelection(command.selectionAfter)
        return
      case 'merge':
      case 'unmerge':
        this.ctx.restoreMerge(command.after)
        this.ctx.restoreSelection(command.selectionAfter)
        return
      default:
        return
    }
  }
}
