import { ColumnUndoHandler } from './ColumnUndoHandler'
import type { ColumnUndoContext } from './ColumnUndoHandler'
import type { UndoRegistry } from '../../kernel/undo/UndoRegistry'

/**
 * 列结构域自注册入口：构造 `ColumnUndoHandler` 并登记进 registry。
 *
 * composition root 平铺调用本函数即接入该域；派发核心无须变更。
 */
export function registerColumnUndo(registry: UndoRegistry, ctx: ColumnUndoContext): void {
  registry.register(new ColumnUndoHandler(ctx))
}
