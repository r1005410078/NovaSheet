import { describe, expect, it } from 'bun:test'
import type { DataSourceEvent } from '../../src/data/DataSource'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'
import type { Field } from '../../src/data/Schema'

const baseSchema = {
  fields: [
    { id: 'a', name: 'A', type: 'text' as const, width: 100 },
    { id: 'b', name: 'B', type: 'number' as const, width: 80, defaultValue: 0 },
  ],
}

describe('InMemoryDataSource.insertField', () => {
  it('插入到 index 1，schema 在该位置出现新字段；rows 多一个 fieldId 的空字段', () => {
    const ds = new InMemoryDataSource({
      schema: baseSchema,
      rows: [
        { a: 'r0', b: 1 },
        { a: 'r1', b: 2 },
      ],
    })
    const events: DataSourceEvent[] = []
    ds.subscribe((e) => events.push(e))

    const newField: Field = { id: 'c', name: 'C', type: 'text', width: 120 }
    const out = ds.insertField!(1, newField)

    expect(out).toEqual(newField)
    const schema = ds.getSchema()
    expect(schema.fields).toHaveLength(3)
    expect(schema.fields[1]!.id).toBe('c')
    expect(ds.getCell(0, 'c')).toBeUndefined()
    expect(events).toEqual([{ type: 'colsInserted', at: 1, field: newField }])
  })
})

describe('InMemoryDataSource.removeField', () => {
  it('删除 b，返回 snapshot 含 field 定义 + 该列所有 cell 值', () => {
    const ds = new InMemoryDataSource({
      schema: baseSchema,
      rows: [
        { a: 'r0', b: 10 },
        { a: 'r1', b: 20 },
        { a: 'r2', b: 30 },
      ],
    })
    const events: DataSourceEvent[] = []
    ds.subscribe((e) => events.push(e))

    const snap = ds.removeField!('b')

    expect(snap).not.toBeNull()
    expect(snap!.originalIndex).toBe(1)
    expect(snap!.field.id).toBe('b')
    expect(snap!.cells).toEqual([10, 20, 30])
    expect(ds.getSchema().fields).toHaveLength(1)
    expect(ds.getCell(0, 'a')).toBe('r0')
    expect(ds.getCell(0, 'b')).toBeUndefined()
    expect(events).toEqual([
      {
        type: 'colsDeleted',
        removed: [{ index: 1, fieldId: 'b' }],
      },
    ])
  })

  it('未知 fieldId 返回 null，不 emit 事件', () => {
    const ds = new InMemoryDataSource({ schema: baseSchema, rows: [{ a: 'x', b: 0 }] })
    const events: DataSourceEvent[] = []
    ds.subscribe((e) => events.push(e))

    expect(ds.removeField!('nonexistent')).toBeNull()
    expect(events).toEqual([])
  })
})
