import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine, InMemoryDataSource } from '../../src'
import type { CellAttachmentCodec, Schema } from '../../src'

const schema: Schema = {
  fields: [{ id: 'a', name: 'A', type: 'text', width: 80 }],
}

const demoCodec: CellAttachmentCodec<{ v: number }> = {
  namespace: 'demo',
  serialize: (d) => JSON.stringify(d),
  deserialize: (t) => JSON.parse(t) as { v: number },
}

function makeEngine() {
  return new DefaultGridEngine({
    data: new InMemoryDataSource({
      schema,
      rows: [{ a: 'x' }, { a: null }],
    }),
    cellAttachments: [demoCodec],
  })
}

describe('engine attachment registry accessors', () => {
  it('exposes registered namespaces', () => {
    const engine = makeEngine()
    expect(engine.getAttachmentNamespaces()).toContain('demo')
  })

  it('returns codec by namespace', () => {
    const engine = makeEngine()
    const codec = engine.getAttachmentCodec('demo')
    expect(codec).toBeDefined()
    expect(codec?.serialize({ v: 42 })).toBe(JSON.stringify({ v: 42 }))
  })

  it('returns undefined for unknown namespace', () => {
    const engine = makeEngine()
    expect(engine.getAttachmentCodec('unknown')).toBeUndefined()
  })

  it('returns empty array when no codecs registered', () => {
    const engine = new DefaultGridEngine({
      data: new InMemoryDataSource({ schema, rows: [] }),
    })
    expect(engine.getAttachmentNamespaces()).toEqual([])
  })
})
