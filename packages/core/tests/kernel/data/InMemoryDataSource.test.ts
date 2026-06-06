import { describe, expect, it, mock } from 'bun:test'
import type { Schema } from '../../../src/kernel/data/Schema'
import { InMemoryDataSource } from '../../../src/kernel/data/InMemoryDataSource'

const SCHEMA: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 200 },
    { id: 'age', name: 'Age', type: 'number', width: 80 },
  ],
}

describe('InMemoryDataSource — 内存数据源', () => {
  it('返回行数与 schema', () => {
    const ds = new InMemoryDataSource({
      schema: SCHEMA,
      rows: [
        { name: 'A', age: 1 },
        { name: 'B', age: 2 },
      ],
    })
    expect(ds.getRowCount()).toBe(2)
    expect(ds.getSchema()).toBe(SCHEMA)
  })

  it('getRows 返回闭区间切片（endIndex 含端）', () => {
    // endIndex is INCLUSIVE — matches ChunkedAxis.getVisibleRange [first, last] semantics
    const rows = Array.from({ length: 10 }, (_, i) => ({ name: `n${i}`, age: i }))
    const ds = new InMemoryDataSource({ schema: SCHEMA, rows })
    expect(ds.getRows(2, 5)).toEqual([
      { name: 'n2', age: 2 },
      { name: 'n3', age: 3 },
      { name: 'n4', age: 4 },
      { name: 'n5', age: 5 },
    ])
  })

  it('getRows 钳制到合法范围', () => {
    const rows = [{ name: 'a', age: 1 }]
    const ds = new InMemoryDataSource({ schema: SCHEMA, rows })
    expect(ds.getRows(-5, 10)).toEqual([{ name: 'a', age: 1 }])
  })

  it('getCell 返回值或 undefined', () => {
    const ds = new InMemoryDataSource({
      schema: SCHEMA,
      rows: [{ name: 'A', age: 1 }],
    })
    expect(ds.getCell(0, 'name')).toBe('A')
    expect(ds.getCell(0, 'unknown')).toBeUndefined()
    expect(ds.getCell(99, 'name')).toBeUndefined()
  })

  it('updateCell 发出 rowsChanged', () => {
    const ds = new InMemoryDataSource({
      schema: SCHEMA,
      rows: [{ name: 'A', age: 1 }],
    })
    const listener = mock(() => {})
    ds.subscribe(listener)
    ds.updateCell(0, 'age', 42)
    expect(ds.getCell(0, 'age')).toBe(42)
    expect(listener).toHaveBeenCalledWith({
      type: 'rowsChanged',
      startIndex: 0,
      endIndex: 0,
    })
  })

  it('updates cells by underlying row with identity semantics', () => {
    const ds = new InMemoryDataSource({
      schema: SCHEMA,
      rows: [{ name: 'A' }, { name: 'B' }],
    })

    ds.updateCellByUnderlyingRow(1, 'name', 'B2')

    expect(ds.getCell(1, 'name')).toBe('B2')
  })

  it('setRows 发出 reset 与 rowCountChanged', () => {
    const ds = new InMemoryDataSource({ schema: SCHEMA, rows: [{ name: 'A', age: 1 }] })
    const listener = mock(() => {})
    ds.subscribe(listener)
    ds.setRows([
      { name: 'X', age: 9 },
      { name: 'Y', age: 8 },
    ])
    expect(ds.getRowCount()).toBe(2)
    expect(listener).toHaveBeenCalledWith({ type: 'rowCountChanged', newCount: 2 })
    expect(listener).toHaveBeenCalledWith({ type: 'reset' })
  })

  it('subscribe 返回取消订阅函数', () => {
    const ds = new InMemoryDataSource({ schema: SCHEMA, rows: [] })
    const listener = mock(() => {})
    const unsub = ds.subscribe(listener)
    unsub()
    ds.setRows([{ name: 'A', age: 1 }])
    expect(listener).not.toHaveBeenCalled()
  })
})
