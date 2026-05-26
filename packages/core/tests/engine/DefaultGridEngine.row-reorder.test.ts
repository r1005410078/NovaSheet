import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine, InMemoryDataSource, denseGridTheme } from '../../src'
import type { Row } from '../../src'

function makeEngine() {
  return new DefaultGridEngine({
    data: new InMemoryDataSource({
      schema: { fields: [{ id: 'name', name: 'Name', type: 'text', width: 100 }] },
      rows: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }],
    }),
    theme: denseGridTheme,
  })
}

describe('DefaultGridEngine.moveRows', () => {
  it('moves a row block and preserves row heights with the moved rows', () => {
    const engine = makeEngine()
    engine.setRowHeight(1, 44)
    engine.setRowHeight(2, 52)

    expect(engine.moveRows([1, 2], 0)).toBe(true)

    expect((engine.getData().getRows(0, 3) as Row[]).map((row) => row.name)).toEqual([
      'B',
      'C',
      'A',
      'D',
    ])
    expect(engine.getRowsAxis().getSize(0)).toBe(44)
    expect(engine.getRowsAxis().getSize(1)).toBe(52)
  })

  it('remaps a moved whole-row selection to its new row positions', () => {
    const engine = makeEngine()
    engine.setSelection({
      activeCell: { rowIndex: 1, colIndex: 0 },
      anchorCell: { rowIndex: 1, colIndex: 0 },
      extentCell: { rowIndex: 2, colIndex: 0 },
      selectedRange: { startRow: 1, endRow: 2, startCol: 0, endCol: 0 },
    })

    engine.moveRows([1, 2], null)

    expect(engine.getSelection().selectedRange).toEqual({
      startRow: 2,
      endRow: 3,
      startCol: 0,
      endCol: 0,
    })
  })

  it('returns false and does not push undo for self drops', () => {
    const engine = makeEngine()

    expect(engine.moveRows([1, 2], 2)).toBe(false)

    expect(engine.canUndo()).toBe(false)
  })
})
