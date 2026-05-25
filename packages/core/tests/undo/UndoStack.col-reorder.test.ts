import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine, denseGridTheme, InMemoryDataSource } from '../../src'

describe('UndoStack — moveCols', () => {
  it('undo / redo restores schema order after column reorder', () => {
    const engine = new DefaultGridEngine({
      data: new InMemoryDataSource({
        schema: {
          fields: [
            { id: 'a', name: 'A', type: 'text', width: 100 },
            { id: 'b', name: 'B', type: 'text', width: 100 },
            { id: 'c', name: 'C', type: 'text', width: 100 },
          ],
        },
        rows: [],
      }),
      theme: denseGridTheme,
    })

    engine.moveCols(['a'], null)
    expect(engine.getData().getSchema().fields.map((field) => field.id)).toEqual(['b', 'c', 'a'])

    engine.undo()
    expect(engine.getData().getSchema().fields.map((field) => field.id)).toEqual(['a', 'b', 'c'])

    engine.redo()
    expect(engine.getData().getSchema().fields.map((field) => field.id)).toEqual(['b', 'c', 'a'])
  })
})
