import type { UndoCommand } from './UndoCommand'

const CAPACITY = 100

/**
 * 双栈结构(undo + redo)+ 容量 + redo-on-push 清空。
 *
 * 本类不感知 engine,只是数据结构;反向执行逻辑由 engine 拥有(基于 cmd.kind 分发)。
 */
export class UndoStack {
  private undoStack: UndoCommand[] = []
  private redoStack: UndoCommand[] = []

  push(cmd: UndoCommand): void {
    this.undoStack.push(cmd)
    if (this.undoStack.length > CAPACITY) {
      this.undoStack.shift()
    }
    this.redoStack.length = 0
  }

  popUndo(): UndoCommand | undefined {
    const cmd = this.undoStack.pop()
    if (cmd) this.redoStack.push(cmd)
    return cmd
  }

  popRedo(): UndoCommand | undefined {
    const cmd = this.redoStack.pop()
    if (cmd) this.undoStack.push(cmd)
    return cmd
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  clear(): void {
    this.undoStack.length = 0
    this.redoStack.length = 0
  }
}
