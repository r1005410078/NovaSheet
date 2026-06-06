import { describe, expect, it } from 'bun:test'
import type { DataSourceEvent } from '../src/kernel/data/DataSource'
import type { MutableDataSource } from '../src/kernel/data/MutableDataSource'
import type { CellValue } from '../src/kernel/data/Schema'

describe('Phase 4.5 type probes', () => {
  it('DataSourceEvent 含 rowsInserted / rowsDeleted', () => {
    const inserted: DataSourceEvent = { type: 'rowsInserted', at: 0, count: 2 }
    const deleted: DataSourceEvent = { type: 'rowsDeleted', removed: [1, 2] }
    expect(inserted.type).toBe('rowsInserted')
    expect(deleted.type).toBe('rowsDeleted')
  })

  it('MutableDataSource 含 optional insertRows / deleteRows', () => {
    const ds: MutableDataSource = {
      getRowCount: () => 0,
      getSchema: () => ({ fields: [] }),
      getRows: () => [],
      getCell: () => undefined as unknown as CellValue,
      subscribe: () => () => {},
      updateCell: () => {},
      insertRows: (_at, count) => Array.from({ length: count }, (_, i) => _at + i),
      deleteRows: (_ids) => [],
    }
    expect(ds.insertRows?.(0, 1)).toEqual([0])
  })
})
