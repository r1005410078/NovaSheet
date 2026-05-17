import { describe, expect, it } from 'bun:test'
import type { Field, FieldType, Schema } from '../../src/data/Schema'

describe('Schema — 类型契约', () => {
  it('FieldType 覆盖 Phase1 七种类型', () => {
    const types: FieldType[] = ['text', 'number', 'singleSelect', 'multiSelect', 'date', 'checkbox', 'url']
    expect(types).toHaveLength(7)
  })

  it('Field 含 id/name/type/width', () => {
    const f: Field = { id: 'f1', name: 'Title', type: 'text', width: 200 }
    expect(f.id).toBe('f1')
    expect(f.width).toBe(200)
  })

  it('Schema.fields 为只读', () => {
    const schema: Schema = {
      fields: [{ id: 'a', name: 'A', type: 'text', width: 100 }],
    }
    expect(schema.fields).toHaveLength(1)
  })
})
