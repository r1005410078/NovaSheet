import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../../src/kernel/data/InMemoryDataSource'
import { VisibleColumnsDataSource } from '../../../src/kernel/data/VisibleColumnsDataSource'
import type { DataWindow } from '../../../src/kernel/data/DataSource'
import type { Row, Schema } from '../../../src/kernel/data/Schema'

const schema: Schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text', width: 60 },
    { id: 'b', name: 'B', type: 'text', width: 60 },
    { id: 'c', name: 'C', type: 'text', width: 60 },
  ],
}

describe('VisibleColumnsDataSource hintWindow forwarding', () => {
  it('translates a view column window to the raw column envelope skipping hidden columns', () => {
    const data = new InMemoryDataSource({ schema, rows: [{ a: '1', b: '2', c: '3' }] satisfies Row[] })
    const hints: DataWindow[] = []
    ;(data as unknown as { hintWindow: (w: DataWindow) => void }).hintWindow = (w) => hints.push(w)

    const wrapped = new VisibleColumnsDataSource(data, () => new Set(['b'])) // hide column b (raw index 1)
    // visible schema is [a, c]; view col 1 (c) maps to raw col 2
    wrapped.hintWindow?.({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 })
    expect(hints).toEqual([{ startRow: 0, endRow: 0, startCol: 0, endCol: 2 }])
  })

  it('forwards identity when no columns are hidden', () => {
    const data = new InMemoryDataSource({ schema, rows: [{ a: '1', b: '2', c: '3' }] satisfies Row[] })
    const hints: DataWindow[] = []
    ;(data as unknown as { hintWindow: (w: DataWindow) => void }).hintWindow = (w) => hints.push(w)

    const wrapped = new VisibleColumnsDataSource(data, () => new Set())
    wrapped.hintWindow?.({ startRow: 0, endRow: 0, startCol: 0, endCol: 2 })
    expect(hints).toEqual([{ startRow: 0, endRow: 0, startCol: 0, endCol: 2 }])
  })
})
