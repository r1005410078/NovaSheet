import { describe, expect, it } from 'bun:test'
import type { DataSourceEvent } from '../src/data/DataSource'
import type {
  MutableDataSource,
  RemovedFieldSnapshot,
} from '../src/data/MutableDataSource'
import type { Field } from '../src/data/Schema'

describe('Phase 4.6 type probes', () => {
  it('DataSourceEvent 含 colsInserted / colsDeleted', () => {
    const f: Field = { id: 'x', name: 'X', type: 'text', width: 100 }
    const inserted: DataSourceEvent = { type: 'colsInserted', at: 0, field: f }
    const deleted: DataSourceEvent = {
      type: 'colsDeleted',
      removed: [{ index: 0, fieldId: 'x' }],
    }
    expect(inserted.type).toBe('colsInserted')
    expect(deleted.type).toBe('colsDeleted')
  })

  it('MutableDataSource 含 optional insertField / removeField + RemovedFieldSnapshot', () => {
    const snap: RemovedFieldSnapshot = {
      originalIndex: 1,
      field: { id: 'x', name: 'X', type: 'text', width: 100 },
      cells: ['a', null, 'c'],
    }
    const ds: MutableDataSource = {
      getRowCount: () => 0,
      getSchema: () => ({ fields: [] }),
      getRows: () => [],
      getCell: () => undefined,
      subscribe: () => () => {},
      updateCell: () => {},
      insertField: (_at, f) => f,
      removeField: (_id) => snap,
    }
    expect(ds.insertField?.(0, snap.field)).toEqual(snap.field)
  })
})
