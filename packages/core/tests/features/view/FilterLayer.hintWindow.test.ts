import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../../src/kernel/data/InMemoryDataSource'
import { FilterLayer } from '../../../src/features/view/FilterLayer'
import type { DataWindow } from '../../../src/kernel/data/DataSource'
import type { Row, Schema } from '../../../src/kernel/data/Schema'

const schema: Schema = {
  fields: [{ id: 'name', name: 'Name', type: 'text', width: 100 }],
}

describe('FilterLayer hintWindow forwarding', () => {
  it('translates a view window to the raw envelope of the surviving rows', () => {
    const data = new InMemoryDataSource({
      schema,
      rows: [{ name: 'alpha' }, { name: 'skip' }, { name: 'alpine' }, { name: 'skip' }] satisfies Row[],
    })
    const hints: DataWindow[] = []
    ;(data as unknown as { hintWindow: (w: DataWindow) => void }).hintWindow = (w) => hints.push(w)

    const layer = new FilterLayer()
    // setSpec must run before wrap(): FilteredDataSource snapshots `order` at construction
    // time (from getSpec()) and only rebuilds on upstream data events, not on later
    // setSpec calls made directly on the layer without going through ViewPipeline.rebuild().
    layer.setSpec({ fieldId: 'name', op: { kind: 'text-contains', value: 'alp', caseSensitive: false } })
    const wrapped = layer.wrap(data)
    // surviving raw rows: 0 ('alpha'), 2 ('alpine') → view rows [0, 1]

    wrapped.hintWindow?.({ startRow: 0, endRow: 1, startCol: 0, endCol: 0 })
    expect(hints).toEqual([{ startRow: 0, endRow: 2, startCol: 0, endCol: 0 }])
  })
})
