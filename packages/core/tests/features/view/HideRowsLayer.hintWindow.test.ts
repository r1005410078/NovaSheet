import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../../src/kernel/data/InMemoryDataSource'
import { HideRowsLayer } from '../../../src/features/view/HideRowsLayer'
import type { DataWindow } from '../../../src/kernel/data/DataSource'
import type { Row, Schema } from '../../../src/kernel/data/Schema'

const schema: Schema = { fields: [{ id: 'n', name: 'N', type: 'number', width: 60 }] }

describe('HideRowsLayer hintWindow forwarding', () => {
  it('translates a view window to the raw envelope skipping hidden rows', () => {
    const data = new InMemoryDataSource({
      schema,
      rows: [{ n: 0 }, { n: 1 }, { n: 2 }, { n: 3 }] satisfies Row[],
    })
    const hints: DataWindow[] = []
    ;(data as unknown as { hintWindow: (w: DataWindow) => void }).hintWindow = (w) => hints.push(w)

    const layer = new HideRowsLayer()
    const wrapped = layer.wrap(data)
    layer.setHidden([1]) // raw row 1 hidden → view rows map to raw [0, 2, 3]

    wrapped.hintWindow?.({ startRow: 0, endRow: 1, startCol: 0, endCol: 0 }) // view rows 0..1 → raw {0, 2}
    expect(hints).toEqual([{ startRow: 0, endRow: 2, startCol: 0, endCol: 0 }])
  })
})
