import { FormatUndoHandler } from './FormatUndoHandler'
import type { FormatUndoContext } from './FormatUndoHandler'
import type { UndoRegistry } from '../../kernel/undo/UndoRegistry'

/**
 * format 域自注册入口：构造 `FormatUndoHandler` 并登记进 registry。
 *
 * composition root 平铺调用本函数即接入该域；派发核心无须变更。
 */
export function registerFormatUndo(registry: UndoRegistry, ctx: FormatUndoContext): void {
  registry.register(new FormatUndoHandler(ctx))
}
