import { describe, expect, it } from 'bun:test'
import { makeMockGridEngine } from './mock-grid-engine'

describe('makeMockGridEngine', () => {
  it('provides a complete GridEngine-shaped test double with overridable frame and selection', () => {
    const engine = makeMockGridEngine({
      selection: {
        activeCell: { rowIndex: 1, colIndex: 1 },
        anchorCell: { rowIndex: 1, colIndex: 1 },
        extentCell: { rowIndex: 1, colIndex: 1 },
        selectedRange: { startRow: 1, endRow: 1, startCol: 1, endCol: 1 },
      },
    })

    expect(engine.getSelection().activeCell).toEqual({ rowIndex: 1, colIndex: 1 })
    expect(engine.getFrame().selection?.selectedRange).toEqual({
      startRow: 1,
      endRow: 1,
      startCol: 1,
      endCol: 1,
    })
    expect(engine.getFillMergeSnap({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 })).toEqual({
      rowSpan: 1,
      colSpan: 1,
    })
  })
})
