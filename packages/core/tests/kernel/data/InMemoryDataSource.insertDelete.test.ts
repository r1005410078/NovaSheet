import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../../src/kernel/data/InMemoryDataSource'
import type { DataSourceEvent } from '../../../src/kernel/data/DataSource'

const schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text' as const, width: 100 },
    { id: 'b', name: 'B', type: 'number' as const, width: 100, defaultValue: 0 },
  ],
}

describe('InMemoryDataSource.insertRows', () => {
  it('插入 2 行到 index 1，返回 [1, 2]，新行字段按 defaultValue', () => {
    const ds = new InMemoryDataSource({
      schema,
      rows: [
        { a: 'r0', b: 10 },
        { a: 'r1', b: 20 },
      ],
    })
    const events: DataSourceEvent[] = []
    ds.subscribe((e) => events.push(e))

    const newIds = ds.insertRows!(1, 2)

    expect(newIds).toEqual([1, 2])
    expect(ds.getRowCount()).toBe(4)
    expect(ds.getCell(1, 'a')).toBeUndefined()
    expect(ds.getCell(1, 'b')).toBe(0)
    expect(ds.getCell(3, 'a')).toBe('r1')
    expect(events).toContainEqual({ type: 'rowsInserted', at: 1, count: 2 })
    expect(events).toContainEqual({ type: 'rowCountChanged', newCount: 4 })
  })

  it('插入到 rowCount（尾部）等价于 push', () => {
    const ds = new InMemoryDataSource({ schema, rows: [{ a: 'r0', b: 1 }] })
    ds.insertRows!(ds.getRowCount(), 1)
    expect(ds.getRowCount()).toBe(2)
  })
})

describe('InMemoryDataSource.deleteRows', () => {
  it('删除 [0, 2]，返回 snapshot 含全字段，剩余行紧缩', () => {
    const ds = new InMemoryDataSource({
      schema,
      rows: [
        { a: 'r0', b: 10 },
        { a: 'r1', b: 20 },
        { a: 'r2', b: 30 },
      ],
    })
    const events: DataSourceEvent[] = []
    ds.subscribe((e) => events.push(e))

    const snapshots = ds.deleteRows!([0, 2])

    expect(snapshots).toHaveLength(2)
    expect(snapshots[0]).toEqual({ originalUnderlyingRow: 0, cells: { a: 'r0', b: 10 } })
    expect(snapshots[1]).toEqual({ originalUnderlyingRow: 2, cells: { a: 'r2', b: 30 } })
    expect(ds.getRowCount()).toBe(1)
    expect(ds.getCell(0, 'a')).toBe('r1')
    expect(events).toContainEqual({ type: 'rowsDeleted', removed: [0, 2] })
    expect(events).toContainEqual({ type: 'rowCountChanged', newCount: 1 })
  })

  it('未升序入参 debug-mode throws；release 信任', () => {
    const ds = new InMemoryDataSource({
      schema,
      rows: [
        { a: 'r0', b: 0 },
        { a: 'r1', b: 0 },
      ],
    })
    expect(() => ds.deleteRows!([1, 0])).toThrow(/ascending/i)
  })
})
