import { describe, expect, it } from 'bun:test'
import type { DataSourceEvent } from '../../src/data/DataSource'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'

const schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text' as const },
    { id: 'b', name: 'B', type: 'text' as const },
    { id: 'c', name: 'C', type: 'text' as const },
    { id: 'd', name: 'D', type: 'text' as const },
  ],
}

describe('InMemoryDataSource.moveFields', () => {
  it('moves a contiguous field group before a target field and emits colsMoved', () => {
    const ds = new InMemoryDataSource({
      schema,
      rows: [{ a: 'A', b: 'B', c: 'C', d: 'D' }],
    })
    const events: DataSourceEvent[] = []
    ds.subscribe((event) => events.push(event))

    ds.moveFields!(['b', 'c'], 'a')

    expect(ds.getSchema().fields.map((field) => field.id)).toEqual(['b', 'c', 'a', 'd'])
    expect(ds.getCell(0, 'b')).toBe('B')
    expect(events).toEqual([{ type: 'colsMoved', fieldIds: ['b', 'c'], beforeFieldId: 'a' }])
  })

  it('moves fields to the end when beforeFieldId is null', () => {
    const ds = new InMemoryDataSource({ schema, rows: [] })

    ds.moveFields!(['a', 'b'], null)

    expect(ds.getSchema().fields.map((field) => field.id)).toEqual(['c', 'd', 'a', 'b'])
  })

  it('treats unknown fields and self targets as no-op', () => {
    const ds = new InMemoryDataSource({ schema, rows: [] })
    const events: DataSourceEvent[] = []
    ds.subscribe((event) => events.push(event))

    ds.moveFields!(['x'], 'a')
    ds.moveFields!(['b', 'c'], 'c')

    expect(ds.getSchema().fields.map((field) => field.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(events).toEqual([])
  })
})
