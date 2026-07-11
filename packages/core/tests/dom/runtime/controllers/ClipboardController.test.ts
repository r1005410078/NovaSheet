import { describe, expect, it, mock } from 'bun:test'
import { ClipboardController } from '../../../../src/dom/runtime/controllers/ClipboardController'
import type { GridEngine } from '../../../../src/engine/GridEngine'

describe('ClipboardController — undo/redo 事件顺序', () => {
  it('undo 成功:先 afterEngineMutation 再 onUndo(command)', () => {
    const cmd = { kind: 'test' }
    const calls: string[] = []
    const engine = { undo: mock(() => cmd) } as unknown as GridEngine
    const ctl = new ClipboardController({
      engine,
      isDestroyed: () => false,
      afterEngineMutation: () => calls.push('afterEngineMutation'),
    })
    ctl.setOnUndo((e) => calls.push(`onUndo:${(e.command as { kind: string }).kind}`))
    ctl.undo()
    expect(calls).toEqual(['afterEngineMutation', 'onUndo:test'])
  })

  it('undo 无命令时不触发任何收尾', () => {
    const engine = { undo: mock(() => null) } as unknown as GridEngine
    const after = mock(() => {})
    const ctl = new ClipboardController({ engine, isDestroyed: () => false, afterEngineMutation: after })
    ctl.undo()
    expect(after).not.toHaveBeenCalled()
  })
})
