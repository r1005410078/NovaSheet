import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine, InMemoryDataSource } from '../../src'

function makeEngine() {
  return new DefaultGridEngine({
    data: new InMemoryDataSource({
      schema: {
        fields: [
          { id: 'a', name: 'A', type: 'text', width: 100 },
          { id: 'b', name: 'B', type: 'text', width: 100 },
        ],
      },
      rows: [{ a: 'A1', b: 'B1' }, { a: 'A2', b: 'B2' }],
    }),
  })
}

describe('DefaultGridEngine merge APIs', () => {
  it('merges, selects the merged range, and supports undo/redo', () => {
    const engine = makeEngine()
    const range = { startRow: 0, endRow: 1, startCol: 0, endCol: 1 }

    expect(engine.mergeCells(range)).toBe(true)
    expect(engine.getMergeRegion(1, 1)?.anchor).toEqual({ rowIndex: 0, colIndex: 0 })
    expect(engine.getSelection().selectedRange).toEqual(range)

    expect(engine.undo()?.kind).toBe('merge')
    expect(engine.getMergeRegion(1, 1)).toBeNull()
    expect(engine.redo()?.kind).toBe('merge')
    expect(engine.getMergeRegion(1, 1)?.id).toBe('merge-1')
  })

  it('unmerges any region touched by the target range', () => {
    const engine = makeEngine()
    engine.mergeCells({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 })

    expect(engine.unmergeCells({ startRow: 1, endRow: 1, startCol: 1, endCol: 1 })).toBe(true)
    expect(engine.getMergeRegion(0, 0)).toBeNull()
  })
})
