import type { UndoCommand } from './UndoCommand'
import type { UndoHandler } from './UndoHandler'
import type { UndoRegistry } from './UndoRegistry'

/**
 * undo/redo 派发核心：据 `UndoRegistry` 把命令路由到唯一负责的域 handler。
 *
 * 本类不持任何域 ctx、不认识任何具体 `kind`。registry 已覆盖全 21 kind（完整性测试守），
 * 故无迁移期 fallback；未注册 kind 直接抛错（运行期不容许无声 no-op）。
 */
export class UndoReplay {
  constructor(private readonly registry: UndoRegistry) {}

  undo(command: UndoCommand): void {
    this.resolve(command.kind).applyUndo(command)
  }

  redo(command: UndoCommand): void {
    this.resolve(command.kind).applyRedo(command)
  }

  private resolve(kind: UndoCommand['kind']): UndoHandler {
    const handler = this.registry.resolve(kind)
    if (!handler) throw new Error(`UndoReplay: 无 handler 处理 kind "${kind}"`)
    return handler
  }
}
