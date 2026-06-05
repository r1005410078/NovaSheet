import { FillUndoHandler } from './FillUndoHandler'
import type { FillUndoContext } from './FillUndoHandler'
import type { UndoRegistry } from './UndoRegistry'

/**
 * fill 域自注册入口：构造 `FillUndoHandler` 并登记进 registry。
 *
 * composition root 平铺调用本函数即接入该域；派发核心无须变更。
 */
export function registerFillUndo(registry: UndoRegistry, ctx: FillUndoContext): void {
  registry.register(new FillUndoHandler(ctx))
}
