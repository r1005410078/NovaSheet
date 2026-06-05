import { describe, expect, it } from 'bun:test'

import { UndoRegistry } from '../../../src/engine/undo/UndoRegistry'
import { UndoReplay } from '../../../src/engine/undo/UndoReplay'
import type { UndoReplayFallback } from '../../../src/engine/undo/UndoReplay'
import type { UndoHandler } from '../../../src/engine/undo/UndoHandler'
import type { UndoCommand } from '../../../src/undo/UndoCommand'

type Call = { via: 'handler' | 'fallback'; op: 'undo' | 'redo'; kind: UndoCommand['kind'] }

function recordingHandler(
  domain: string,
  kinds: ReadonlyArray<UndoCommand['kind']>,
  calls: Call[],
): UndoHandler {
  const owned = new Set<UndoCommand['kind']>(kinds)
  return {
    domain,
    handles: (kind) => owned.has(kind),
    applyUndo: (cmd) => calls.push({ via: 'handler', op: 'undo', kind: cmd.kind }),
    applyRedo: (cmd) => calls.push({ via: 'handler', op: 'redo', kind: cmd.kind }),
  }
}

function recordingFallback(calls: Call[]): UndoReplayFallback {
  return {
    undo: (cmd) => calls.push({ via: 'fallback', op: 'undo', kind: cmd.kind }),
    redo: (cmd) => calls.push({ via: 'fallback', op: 'redo', kind: cmd.kind }),
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
  it('registry 命中时走 handler，不调 fallback', () => {
    const calls: Call[] = []
    const registry = new UndoRegistry()
    registry.register(recordingHandler('cell', ['editCell'], calls))
    const replay = new UndoReplay(registry, recordingFallback(calls))

    replay.undo(editCell)
    replay.redo(editCell)

    expect(calls).toEqual([
      { via: 'handler', op: 'undo', kind: 'editCell' },
      { via: 'handler', op: 'redo', kind: 'editCell' },
    ])
  })

  it('registry 未命中时回退 fallback', () => {
    const calls: Call[] = []
    const registry = new UndoRegistry()
    registry.register(recordingHandler('cell', ['editCell'], calls))
    const replay = new UndoReplay(registry, recordingFallback(calls))

    replay.undo(fill)
    replay.redo(fill)

    expect(calls).toEqual([
      { via: 'fallback', op: 'undo', kind: 'fill' },
      { via: 'fallback', op: 'redo', kind: 'fill' },
    ])
  })
})
