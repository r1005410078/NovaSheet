import type { UndoRegistry } from '../../kernel/undo/UndoRegistry'
import { CellTypeUndoHandler } from './CellTypeUndoHandler'
import type { CellTypeUndoContext } from './CellTypeUndoHandler'

/** cellType 域 undo 自注册入口。 */
export function registerCellTypeUndo(registry: UndoRegistry, ctx: CellTypeUndoContext): void {
  registry.register(new CellTypeUndoHandler(ctx))
}
