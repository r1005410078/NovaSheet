import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../../src/kernel/data/InMemoryDataSource'
import { SortLayer } from '../../../src/features/view/SortLayer'
import type { DataWindow } from '../../../src/kernel/data/DataSource'
import type { Row, Schema } from '../../../src/kernel/data/Schema'

const schema: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 100 },
    { id: 'score', name: 'Score', type: 'number', width: 80 },
  ],
}

function makeUpstreamWithHint(rows: Row[]): { data: InMemoryDataSource; hints: DataWindow[] } {
  const data = new InMemoryDataSource({ schema, rows })
  const hints: DataWindow[] = []
  ;(data as unknown as { hintWindow: (w: DataWindow) => void }).hintWindow = (w) => hints.push(w)
  return { data, hints }
}

describe('SortLayer hintWindow forwarding', () => {
  it('forwards an identity window unchanged when no sort is active', () => {
    const { data, hints } = makeUpstreamWithHint([
      { name: 'b', score: 2 },
      { name: 'a', score: 1 },
      { name: 'c', score: 3 },
    ])
    const layer = new SortLayer()
    const wrapped = layer.wrap(data)

    wrapped.hintWindow?.({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 })
    expect(hints).toEqual([{ startRow: 0, endRow: 1, startCol: 0, endCol: 1 }])
  })

  it('translates a view window to a conservative raw envelope when sorted', () => {
    const { data, hints } = makeUpstreamWithHint([
      { name: 'c', score: 3 },
      { name: 'a', score: 1 },
      { name: 'b', score: 2 },
    ])
    const layer = new SortLayer()
    // setSpec must run before wrap(): SortedDataSource snapshots `order` at construction
    // time (from getSpec()) and only rebuilds on upstream data events, not on later
    // setSpec calls made directly on the layer without going through ViewPipeline.rebuild().
    layer.setSpec({ fieldId: 'score', direction: 'asc' }) // view order becomes raw rows [1, 2, 0]
    const wrapped = layer.wrap(data)

    wrapped.hintWindow?.({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 }) // view rows 0..1 → raw rows {1, 2}
    expect(hints).toEqual([{ startRow: 1, endRow: 2, startCol: 0, endCol: 1 }])
  })
})
