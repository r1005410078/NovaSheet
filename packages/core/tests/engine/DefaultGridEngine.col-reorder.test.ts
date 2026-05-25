import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine, denseGridTheme, InMemoryDataSource } from '../../src'
import type { Schema } from '../../src'

function makeEngine() {
  const schema: Schema = {
    fields: [
      { id: 'a', name: 'A', type: 'text', width: 80 },
      { id: 'b', name: 'B', type: 'text', width: 120 },
      { id: 'c', name: 'C', type: 'text', width: 140 },
      { id: 'd', name: 'D', type: 'text', width: 160 },
    ],
  }
  return new DefaultGridEngine({
    data: new InMemoryDataSource({
      schema,
      rows: [{ a: 'A', b: 'B', c: 'C', d: 'D' }],
    }),
    theme: denseGridTheme,
    frozen: { leftCols: 1 },
  })
}

describe('DefaultGridEngine.moveCols', () => {
  it('moves multiple columns before a target and preserves widths/cells', () => {
    const engine = makeEngine()

    expect(engine.moveCols(['b', 'c'], 'a')).toBe(true)

    expect(engine.getData().getSchema().fields.map((field) => field.id)).toEqual([
      'b',
      'c',
      'a',
      'd',
    ])
    expect(engine.getData().getCell(0, 'c')).toBe('C')
    expect(engine.getColsAxis().getSize(0)).toBe(120)
    expect(engine.getColsAxis().getSize(1)).toBe(140)
    expect(engine.getFrozenConfig().leftCols).toBe(1)
  })

  it('keeps hidden field ids anchored after reorder', () => {
    const engine = makeEngine()
    engine.hideCols(['c'])

    engine.moveCols(['a'], null)
    engine.unhideCols(['c'])

    expect(engine.getData().getSchema().fields.map((field) => field.id)).toEqual([
      'b',
      'c',
      'd',
      'a',
    ])
  })

  it('remaps a moved column selection to the new visible position', () => {
    const engine = makeEngine()
    engine.setSelection({
      activeCell: { rowIndex: 0, colIndex: 1 },
      anchorCell: { rowIndex: 0, colIndex: 1 },
      extentCell: { rowIndex: 0, colIndex: 2 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 1, endCol: 2 },
    })

    engine.moveCols(['b', 'c'], null)

    expect(engine.getSelection().selectedRange).toEqual({
      startRow: 0,
      endRow: 0,
      startCol: 2,
      endCol: 3,
    })
  })

  it('returns false and does not push undo for equivalent self drops', () => {
    const engine = makeEngine()

    expect(engine.moveCols(['b', 'c'], 'b')).toBe(false)

    expect(engine.canUndo()).toBe(false)
  })

  it('rejects non-contiguous field groups', () => {
    const engine = makeEngine()

    expect(engine.moveCols(['a', 'c'], null)).toBe(false)

    expect(engine.getData().getSchema().fields.map((field) => field.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
  })
})
