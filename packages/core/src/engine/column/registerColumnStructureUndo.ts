import { ColumnStructureUndoHandler } from './ColumnStructureUndoHandler'
import type { ColumnStructureUndoContext } from './ColumnStructureUndoHandler'
import type { UndoRegistry } from '../undo/UndoRegistry'

/**
 * 复合列结构域自注册入口：构造 `ColumnStructureUndoHandler` 并登记进 registry。
 *
 * composition root 平铺调用本函数即接入该域；派发核心无须变更。
 */
export function registerColumnStructureUndo(
  registry: UndoRegistry,
  ctx: ColumnStructureUndoContext,
): void {
  registry.register(new ColumnStructureUndoHandler(ctx))
}
