import type { CellValue } from '../../data/Schema'
import type { CellRange } from '../selection/SelectionTypes'
import type { CellWrite, UndoCommand } from '../../undo/UndoCommand'

/**
 * 单个领域的 undo/redo replay 单元：自持本域最小 ctx，按 `kind` 自治逆/重做。
 *
 * 派发核心（`UndoRegistry`/`UndoReplay`）不认识任何具体 `kind`；它据 `handles` 把命令
 * 路由到对应 handler，再调 `applyUndo`/`applyRedo`。各域 handler 与本域正向写入同住一域。
 */
export interface UndoHandler {
  /** 域标识（如 `'cell'`），用于注册表完整性查询与诊断。 */
  readonly domain: string
  /** 该 handler 是否负责此 `kind` 的逆/重做。 */
  handles(kind: UndoCommand['kind']): boolean
  /** 撤销：把命令携带的 before/inverse 信息回放回去。 */
  applyUndo(command: UndoCommand): void
  /** 重做：把命令携带的 after 信息再次施加。 */
  applyRedo(command: UndoCommand): void
}

/**
 * cell-write 域 undo 所需的最小 engine 能力面。
 *
 * 由 engine 实现并在注册时注入；每域一个最小 ctx，不复用单一大 ctx，避免其退化为 God Object。
 */
export interface CellUndoContext {
  /** 按 raw 行/字段写入单元格值（engine 内部处理 raw→view 映射与隐藏行）。 */
  applyCellWrite(rowIndex: number, fieldId: string, value: CellValue): void
  /** editCell 逆/重做后把选区还原到被编辑的单元格。 */
  restoreSelectionAfterEdit(rowIndex: number, fieldId: string): void
  /** 批量写入（clearRange/paste）后按可见写入行 + `fallbackRange` 的列恢复选区。 */
  restoreSelectionForWrites(writes: ReadonlyArray<CellWrite>, fallbackRange: CellRange): void
}
