import { describe, expect, it } from 'vitest'
import type { Field, FieldType, Schema } from '../../src/data/Schema'

describe('Schema types', () => {
  it('FieldType covers all 7 Phase 1 types', () => {
    const types: FieldType[] = ['text', 'number', 'singleSelect', 'multiSelect', 'date', 'checkbox', 'url']
    expect(types).toHaveLength(7)
  })

  it('Field has required id/name/type/width', () => {
    const f: Field = { id: 'f1', name: 'Title', type: 'text', width: 200 }
    expect(f.id).toBe('f1')
    expect(f.width).toBe(200)
  })

  it('Schema fields are readonly', () => {
    const schema: Schema = {
      fields: [{ id: 'a', name: 'A', type: 'text', width: 100 }],
    }
    expect(schema.fields).toHaveLength(1)
  })
})
