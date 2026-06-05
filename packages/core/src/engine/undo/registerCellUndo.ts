import { CellUndoHandler } from './CellUndoHandler'
import type { CellUndoContext } from './UndoHandler'
import type { UndoRegistry } from './UndoRegistry'

/**
 * cell-write 域自注册入口：构造 `CellUndoHandler` 并登记进 registry。
 *
 * composition root 平铺调用本函数即接入该域；派发核心无须变更。
 */
export function registerCellUndo(registry: UndoRegistry, ctx: CellUndoContext): void {
  registry.register(new CellUndoHandler(ctx))
}
