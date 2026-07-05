import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import { InMemoryDataSource } from '../../src/kernel/data/InMemoryDataSource'
import type { DataWindow } from '../../src/kernel/data/DataSource'
import type { Row, Schema } from '../../src/kernel/data/Schema'

const schema: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 100 },
    { id: 'score', name: 'Score', type: 'number', width: 80 },
  ],
}

describe('DefaultGridEngine hintWindow wiring', () => {
  it('getFrame() calls data.hintWindow with the main region row/col range', () => {
    const data = new InMemoryDataSource({
      schema,
      rows: Array.from({ length: 100 }, (_, i) => ({ name: `n${i}`, score: i })) satisfies Row[],
    })
    const hints: DataWindow[] = []
    ;(data as unknown as { hintWindow: (w: DataWindow) => void }).hintWindow = (w) => hints.push(w)

    const engine = new DefaultGridEngine({ data })
    // Viewport defaults to 0x0 (no setViewportSize call) → the 'main' region's row/col
    // range is empty, and getFrame()'s hintWindow guard is a no-op. A non-zero size is
    // required for the main region to carry an actual visible range to hint.
    engine.setViewportSize(400, 300)
    engine.getFrame()

    expect(hints).toHaveLength(1)
    expect(hints[0]).toEqual(
      expect.objectContaining({ startRow: expect.any(Number), endRow: expect.any(Number) }),
    )
  })

  it('does nothing (no throw) when the data source does not implement hintWindow', () => {
    const data = new InMemoryDataSource({
      schema,
      rows: [{ name: 'a', score: 1 }] satisfies Row[],
    })
    const engine = new DefaultGridEngine({ data })
    expect(() => engine.getFrame()).not.toThrow()
  })
})
