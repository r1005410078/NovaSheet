import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../../src'

describe('InMemoryDataSource.moveRows', () => {
  it('moves a contiguous row block before a target and emits rowsMoved', () => {
    const ds = new InMemoryDataSource({
      schema: { fields: [{ id: 'name', name: 'Name', type: 'text', width: 100 }] },
      rows: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }],
    })
    const events: unknown[] = []
    ds.subscribe((event) => events.push(event))

    ds.moveRows!([1, 2], 0)

    expect(ds.getRows(0, 3).map((row) => row.name)).toEqual(['B', 'C', 'A', 'D'])
    expect(events).toContainEqual({ type: 'rowsMoved', rowIds: [1, 2], beforeRowId: 0 })
  })

  it('treats drop inside the moving row block as no-op', () => {
    const ds = new InMemoryDataSource({
      schema: { fields: [{ id: 'name', name: 'Name', type: 'text', width: 100 }] },
      rows: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    })

    ds.moveRows!([1, 2], 1)

    expect(ds.getRows(0, 2).map((row) => row.name)).toEqual(['A', 'B', 'C'])
  })
})
