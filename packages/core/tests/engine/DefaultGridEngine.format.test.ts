import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine, InMemoryDataSource } from '../../src'
import type { BorderStyle } from '../../src'

function makeEngine() {
  const data = new InMemoryDataSource({
    schema: {
      fields: [
        { id: 'a', name: 'A', type: 'text', width: 100 },
        { id: 'b', name: 'B', type: 'text', width: 100 },
      ],
    },
    rows: [{ a: 'A1', b: 'B1' }, { a: 'A2', b: 'B2' }],
  })
  return new DefaultGridEngine({ data })
}

describe('DefaultGridEngine format APIs', () => {
  it('sets fill color, exposes it on RenderFrame, and undo/redo restores snapshots', () => {
    const engine = makeEngine()
    const range = { startRow: 0, endRow: 1, startCol: 0, endCol: 0 }

    expect(engine.setFillColor(range, '#fff2cc')).toBe(true)
    expect(engine.getCellFormat(0, 0)?.fillColor).toBe('#fff2cc')
    expect(engine.getFrame().cellFormats?.find((f) => f.rowIndex === 0 && f.colIndex === 0)?.format.fillColor).toBe(
      '#fff2cc',
    )

    expect(engine.undo()?.kind).toBe('format')
    expect(engine.getCellFormat(0, 0)).toBeUndefined()
    expect(engine.redo()?.kind).toBe('format')
    expect(engine.getCellFormat(0, 0)?.fillColor).toBe('#fff2cc')
  })

  it('sets solid outer borders and clears them', () => {
    const engine = makeEngine()
    const border: BorderStyle = { color: '#d93025', width: 'medium', lineStyle: 'solid' }
    const range = { startRow: 0, endRow: 1, startCol: 0, endCol: 1 }

    expect(engine.setBorders(range, 'outer', border)).toBe(true)
    expect(engine.getCellFormat(0, 0)?.borders?.top?.color).toBe('#d93025')
    expect(engine.getCellFormat(0, 0)?.borders?.left?.width).toBe('medium')

    expect(engine.setBorders(range, 'clear', null)).toBe(true)
    expect(engine.getCellFormat(0, 0)?.borders).toBeUndefined()
  })
})
