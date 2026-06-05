import type { UndoCommand } from '../../undo/UndoCommand'
import type { UndoHandler } from './UndoHandler'

/**
 * 各域 undo handler 的注册表：undo 派发对「加域」封闭修改、开放扩展的边界。
 *
 * 注册表不认识任何具体 `kind`；它据各 handler 的 `handles` 把命令路由到唯一负责的 handler。
 * 「加一个域」= 注册该域 handler，不改 `resolve`/`UndoReplay` 派发核心。
 */
export class UndoRegistry {
  private readonly handlers: UndoHandler[] = []

  /** 注册一个域 handler。重复注册按登记顺序，`resolve` 命中首个负责该 kind 的 handler。 */
  register(handler: UndoHandler): void {
    this.handlers.push(handler)
  }

  /** 解析负责该 kind 的 handler；无人负责返回 `undefined`（交由 replay fallback）。 */
  resolve(kind: UndoCommand['kind']): UndoHandler | undefined {
    return this.handlers.find((handler) => handler.handles(kind))
  }

  /** 完整性查询：是否已有 handler 覆盖该 kind（不枚举 kind，故不耦合具体命令类型）。 */
  has(kind: UndoCommand['kind']): boolean {
    return this.handlers.some((handler) => handler.handles(kind))
  }
}
