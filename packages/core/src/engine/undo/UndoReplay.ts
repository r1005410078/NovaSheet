import type { CellValue } from '../../data/Schema'
import type { FormatLayer } from '../../format/CellFormat'
import type { MergeRegion } from '../../merge/MergeStore'
import type { GridSelection } from '../selection/SelectionTypes'
import type { UndoCommand } from '../../undo/UndoCommand'
import type { UndoRegistry } from './UndoRegistry'

/**
 * Undo replay 可调用的受控写入面；不得镜像整个 `DefaultGridEngine`。
 *
 * @deprecated 单一大 ctx 的旧脚手架；按域 ctx（如 `CellUndoContext`）逐步取代，M2+ 淘汰。
 */
export interface UndoReplayContext {
  applyCellWrite(rowIndex: number, fieldId: string, value: CellValue): void
  restoreSelection(selection: GridSelection): void
  restoreFormat(layers: readonly FormatLayer[]): void
  restoreMerge(regions: readonly MergeRegion[]): void
  rebuildRows(): void
  rebuildCols(): void
}

/**
 * 迁移期回退面：registry 未覆盖的 kind 委派回 engine 旧 switch。M4 删除旧 switch 后随之移除。
 */
export interface UndoReplayFallback {
  undo(command: UndoCommand): void
  redo(command: UndoCommand): void
}

/**
 * undo/redo 派发核心：据 `UndoRegistry` 把命令路由到唯一负责的域 handler，否则回退 `fallback`。
 *
 * 本类不持任何域 ctx、不认识任何具体 `kind`；命中 handler 时只经 handler 执行一次，不再触 fallback。
 */
export class UndoReplay {
  constructor(
    private readonly registry: UndoRegistry,
    private readonly fallback: UndoReplayFallback,
  ) {}

  undo(command: UndoCommand): void {
    const handler = this.registry.resolve(command.kind)
    if (handler) {
      handler.applyUndo(command)
      return
    }
    this.fallback.undo(command)
  }

  redo(command: UndoCommand): void {
    const handler = this.registry.resolve(command.kind)
    if (handler) {
      handler.applyRedo(command)
      return
    }
    this.fallback.redo(command)
  }
}
