import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine, InMemoryDataSource, denseGridTheme } from '../../src'
import type { Row } from '../../src'

describe('UndoStack — moveRows', () => {
  it('undo / redo restores row order after row reorder', () => {
    const engine = new DefaultGridEngine({
      data: new InMemoryDataSource({
        schema: { fields: [{ id: 'name', name: 'Name', type: 'text', width: 100 }] },
        rows: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
      }),
      theme: denseGridTheme,
    })

    engine.moveRows([0], null)
    expect((engine.getData().getRows(0, 2) as Row[]).map((row) => row.name)).toEqual([
      'B',
      'C',
      'A',
    ])

    engine.undo()
    expect((engine.getData().getRows(0, 2) as Row[]).map((row) => row.name)).toEqual([
      'A',
      'B',
      'C',
    ])

    engine.redo()
    expect((engine.getData().getRows(0, 2) as Row[]).map((row) => row.name)).toEqual([
      'B',
      'C',
      'A',
    ])
  })
})
