import { RowStructureUndoHandler } from './RowStructureUndoHandler'
import type { RowStructureUndoContext } from './RowStructureUndoHandler'
import type { UndoRegistry } from '../../kernel/undo/UndoRegistry'

/**
 * 复合行结构域自注册入口：构造 `RowStructureUndoHandler` 并登记进 registry。
 *
 * composition root 平铺调用本函数即接入该域；派发核心无须变更。
 */
export function registerRowStructureUndo(registry: UndoRegistry, ctx: RowStructureUndoContext): void {
  registry.register(new RowStructureUndoHandler(ctx))
}
