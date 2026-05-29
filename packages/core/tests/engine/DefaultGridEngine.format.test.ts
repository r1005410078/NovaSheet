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

  it('setBorders with non-solid lineStyle returns false and writes nothing', () => {
    const engine = makeEngine()
    const dashedBorder: BorderStyle = { color: '#000', width: 'thin', lineStyle: 'dashed' }
    const range = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }

    expect(engine.setBorders(range, 'outer', dashedBorder)).toBe(false)
    expect(engine.getCellFormat(0, 0)).toBeUndefined()
    expect(engine.undo()).toBeUndefined()
  })

  it('setBorders with preset=clear and non-null border returns false', () => {
    const engine = makeEngine()
    const border: BorderStyle = { color: '#000', width: 'thin', lineStyle: 'solid' }
    const range = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }

    expect(engine.setBorders(range, 'clear', border)).toBe(false)
    expect(engine.getCellFormat(0, 0)).toBeUndefined()
    expect(engine.undo()).toBeUndefined()
  })

  it('setFillColor with null on an unformatted range returns false and adds no undo entry', () => {
    const engine = makeEngine()
    const range = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }

    expect(engine.setFillColor(range, null)).toBe(false)
    expect(engine.getCellFormat(0, 0)).toBeUndefined()
    // No undo entry should have been added
    expect(engine.undo()).toBeUndefined()
  })

  it('setFillColor with null over a borders-only range returns false (kind-aware no-op)', () => {
    const engine = makeEngine()
    const border: BorderStyle = { color: '#d93025', width: 'thin', lineStyle: 'solid' }
    const range = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }
    expect(engine.setBorders(range, 'outer', border)).toBe(true)

    // Clearing fill where only borders exist contributes nothing and must not push an undo entry.
    expect(engine.setFillColor(range, null)).toBe(false)
    expect(engine.getCellFormat(0, 0)?.borders?.top?.color).toBe('#d93025')
    // The only undo entry is the borders one; a second undo finds nothing.
    expect(engine.undo()?.kind).toBe('format')
    expect(engine.undo()).toBeUndefined()
  })
})
