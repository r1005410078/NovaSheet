import { describe, expect, it } from 'bun:test'

import { UndoRegistry } from '../../../src/kernel/undo/UndoRegistry'
import { UndoReplay } from '../../../src/kernel/undo/UndoReplay'
import type { UndoHandler } from '../../../src/kernel/undo/UndoHandler'
import type { UndoCommand } from '../../../src/kernel/undo/UndoCommand'

type Call = { op: 'undo' | 'redo'; kind: UndoCommand['kind'] }

function recordingHandler(
  domain: string,
  kinds: ReadonlyArray<UndoCommand['kind']>,
  calls: Call[],
): UndoHandler {
  const owned = new Set<UndoCommand['kind']>(kinds)
  return {
    domain,
    handles: (kind) => owned.has(kind),
    applyUndo: (cmd) => calls.push({ op: 'undo', kind: cmd.kind }),
    applyRedo: (cmd) => calls.push({ op: 'redo', kind: cmd.kind }),
  }
}

const editCell: UndoCommand = { kind: 'editCell', rowIndex: 0, fieldId: 'a', before: null, after: 'x' }
const fill: UndoCommand = {
  kind: 'fill',
  source: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
  fill: { startRow: 0, endRow: 1, startCol: 0, endCol: 0 },
  result: { startRow: 0, endRow: 1, startCol: 0, endCol: 0 },
  before: [],
  after: [],
}

describe('UndoReplay', () => {
  it('registry 命中时路由到对应 handler', () => {
    const calls: Call[] = []
    const registry = new UndoRegistry()
    registry.register(recordingHandler('cell', ['editCell'], calls))
    const replay = new UndoReplay(registry)

    replay.undo(editCell)
    replay.redo(editCell)

    expect(calls).toEqual([
      { op: 'undo', kind: 'editCell' },
      { op: 'redo', kind: 'editCell' },
    ])
  })

  it('未注册 kind 抛错（不容许无声 no-op）', () => {
    const registry = new UndoRegistry()
    registry.register(recordingHandler('cell', ['editCell'], []))
    const replay = new UndoReplay(registry)

    expect(() => replay.undo(fill)).toThrow('无 handler 处理 kind "fill"')
    expect(() => replay.redo(fill)).toThrow('无 handler 处理 kind "fill"')
  })
})
