import { RowUndoHandler } from './RowUndoHandler'
import type { RowUndoContext } from './RowUndoHandler'
import type { UndoRegistry } from '../undo/UndoRegistry'

/**
 * 行结构域自注册入口：构造 `RowUndoHandler` 并登记进 registry。
 *
 * composition root 平铺调用本函数即接入该域；派发核心无须变更。
 */
export function registerRowUndo(registry: UndoRegistry, ctx: RowUndoContext): void {
  registry.register(new RowUndoHandler(ctx))
}
