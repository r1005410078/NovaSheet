import { describe, expect, it } from 'bun:test'

import { UndoRegistry } from '../../../src/kernel/undo/UndoRegistry'
import type { UndoHandler } from '../../../src/kernel/undo/UndoHandler'
import type { UndoCommand } from '../../../src/kernel/undo/UndoCommand'

function fakeHandler(domain: string, kinds: ReadonlyArray<UndoCommand['kind']>): UndoHandler {
  const owned = new Set<UndoCommand['kind']>(kinds)
  return {
    domain,
    handles: (kind) => owned.has(kind),
    applyUndo: () => {},
    applyRedo: () => {},
  }
}

describe('UndoRegistry', () => {
  it('register 后 resolve 命中负责该 kind 的 handler', () => {
    const registry = new UndoRegistry()
    const cell = fakeHandler('cell', ['editCell', 'clearRange', 'paste'])
    const format = fakeHandler('format', ['format', 'merge'])
    registry.register(cell)
    registry.register(format)

    expect(registry.resolve('editCell')).toBe(cell)
    expect(registry.resolve('paste')).toBe(cell)
    expect(registry.resolve('merge')).toBe(format)
  })

  it('未注册的 kind resolve 返回 undefined', () => {
    const registry = new UndoRegistry()
    registry.register(fakeHandler('cell', ['editCell']))

    expect(registry.resolve('fill')).toBeUndefined()
    expect(registry.resolve('format')).toBeUndefined()
  })

  it('完整性查询 has 反映 kind 是否被某 handler 覆盖', () => {
    const registry = new UndoRegistry()
    registry.register(fakeHandler('cell', ['editCell', 'clearRange', 'paste']))

    expect(registry.has('editCell')).toBe(true)
    expect(registry.has('clearRange')).toBe(true)
    expect(registry.has('fill')).toBe(false)
  })
})
