import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../../src/data/InMemoryDataSource'
import { DefaultRowStructure } from '../../../src/engine/row/DefaultRowStructure'
import { ChunkedAxis } from '../../../src/layout/ChunkedAxis'
import type { Row } from '../../../src/data/Schema'

describe('DefaultRowStructure', () => {
  it('inserts rows, expands raw row heights, then returns rowsInserted event', () => {
    const data = new InMemoryDataSource({
      schema: { fields: [{ id: 'name', name: 'Name', type: 'text', width: 80 }] },
      rows: [{ name: 'A' }, { name: 'B' }],
    })
    let rawRowsAxis = new ChunkedAxis({ count: 2, defaultSize: 24 })
    rawRowsAxis.setSize(1, 40)
    const rows = new DefaultRowStructure({
      getRowCount: () => data.getRowCount(),
      insertRows: (at, count) => data.insertRows(at, count),
      deleteRows: () => [],
      moveRows: (rowIds, beforeRowId) => {
        data.moveRows(rowIds, beforeRowId)
        return true
      },
      getRawRowsAxis: () => rawRowsAxis,
      setRawRowsAxis: (axis) => {
        rawRowsAxis = axis
      },
      getHiddenRows: () => [],
      setHiddenRows: () => undefined,
      resolveDefaultRowHeight: () => 24,
    })

    const event = rows.insertRows({ kind: 'insertRows', at: 1, count: 2 })

    expect(event).toEqual({ kind: 'rowsInserted', at: 1, count: 2, newRowIds: [1, 2] })
    expect(data.getRowCount()).toBe(4)
    expect(rawRowsAxis.getCount()).toBe(4)
    expect(rawRowsAxis.getSize(1)).toBe(24)
    expect(rawRowsAxis.getSize(3)).toBe(40)
  })

  it('reports the actual clamped insertion position', () => {
    const data = new InMemoryDataSource({
      schema: { fields: [{ id: 'name', name: 'Name', type: 'text', width: 80 }] },
      rows: [{ name: 'A' }, { name: 'B' }],
    })
    let rawRowsAxis = new ChunkedAxis({ count: 2, defaultSize: 24 })
    const rows = new DefaultRowStructure({
      getRowCount: () => data.getRowCount(),
      insertRows: (at, count) => data.insertRows(at, count),
      deleteRows: () => [],
      moveRows: (rowIds, beforeRowId) => {
        data.moveRows(rowIds, beforeRowId)
        return true
      },
      getRawRowsAxis: () => rawRowsAxis,
      setRawRowsAxis: (axis) => {
        rawRowsAxis = axis
      },
      getHiddenRows: () => [],
      setHiddenRows: () => undefined,
      resolveDefaultRowHeight: () => 24,
    })

    const event = rows.insertRows({ kind: 'insertRows', at: 999, count: 1 })

    expect(event?.at).toBe(2)
    expect(event?.newRowIds).toEqual([2])
    expect(rawRowsAxis.getCount()).toBe(3)
  })

  it('deletes rows, captures deleted heights, then returns rowsDeleted event', () => {
    const data = new InMemoryDataSource({
      schema: { fields: [{ id: 'name', name: 'Name', type: 'text', width: 80 }] },
      rows: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    })
    let rawRowsAxis = new ChunkedAxis({ count: 3, defaultSize: 24 })
    rawRowsAxis.setSize(1, 40)
    const rows = new DefaultRowStructure({
      getRowCount: () => data.getRowCount(),
      insertRows: (at, count) => data.insertRows(at, count),
      deleteRows: (rowIds) => data.deleteRows(rowIds),
      moveRows: (rowIds, beforeRowId) => {
        data.moveRows(rowIds, beforeRowId)
        return true
      },
      getRawRowsAxis: () => rawRowsAxis,
      setRawRowsAxis: (axis) => {
        rawRowsAxis = axis
      },
      getHiddenRows: () => [],
      setHiddenRows: () => undefined,
      resolveDefaultRowHeight: () => 24,
    })

    const event = rows.deleteRows({ kind: 'deleteRows', rowIds: [1] })

    expect(event?.kind).toBe('rowsDeleted')
    expect(event?.rowIds).toEqual([1])
    expect(event?.deletedHeights).toEqual([40])
    expect(event?.snapshots).toEqual([{ originalUnderlyingRow: 1, cells: { name: 'B' } }])
    expect((data.getRows(0, 1) as Row[]).map((row) => row.name)).toEqual(['A', 'C'])
    expect(rawRowsAxis.getCount()).toBe(2)
  })

  it('rejects invalid delete row ids before touching data or raw row heights', () => {
    const data = new InMemoryDataSource({
      schema: { fields: [{ id: 'name', name: 'Name', type: 'text', width: 80 }] },
      rows: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    })
    const rawRowsAxis = new ChunkedAxis({ count: 3, defaultSize: 24 })
    const rows = new DefaultRowStructure({
      getRowCount: () => data.getRowCount(),
      insertRows: (at, count) => data.insertRows(at, count),
      deleteRows: (rowIds) => data.deleteRows(rowIds),
      moveRows: (rowIds, beforeRowId) => {
        data.moveRows(rowIds, beforeRowId)
        return true
      },
      getRawRowsAxis: () => rawRowsAxis,
      setRawRowsAxis: () => undefined,
      getHiddenRows: () => [],
      setHiddenRows: () => undefined,
      resolveDefaultRowHeight: () => 24,
    })

    expect(rows.deleteRows({ kind: 'deleteRows', rowIds: [-1] })).toBeNull()
    expect(rows.deleteRows({ kind: 'deleteRows', rowIds: [3] })).toBeNull()
    expect(rows.deleteRows({ kind: 'deleteRows', rowIds: [1, 1] })).toBeNull()
    expect((data.getRows(0, 2) as Row[]).map((row) => row.name)).toEqual(['A', 'B', 'C'])
    expect(rawRowsAxis.getCount()).toBe(3)
  })

  it('returns null and keeps raw row heights when the data source deletes nothing', () => {
    const rawRowsAxis = new ChunkedAxis({ count: 3, defaultSize: 24 })
    const rows = new DefaultRowStructure({
      getRowCount: () => 3,
      insertRows: () => [],
      deleteRows: () => [],
      moveRows: () => false,
      getRawRowsAxis: () => rawRowsAxis,
      setRawRowsAxis: () => undefined,
      getHiddenRows: () => [],
      setHiddenRows: () => undefined,
      resolveDefaultRowHeight: () => 24,
    })

    expect(rows.deleteRows({ kind: 'deleteRows', rowIds: [1] })).toBeNull()
    expect(rawRowsAxis.getCount()).toBe(3)
  })

  it('hides and unhides only effective row ids', () => {
    let hiddenRows: readonly number[] = [1]
    const rows = new DefaultRowStructure({
      getRowCount: () => 4,
      insertRows: () => [],
      deleteRows: () => [],
      moveRows: () => true,
      getRawRowsAxis: () => new ChunkedAxis({ count: 4, defaultSize: 24 }),
      setRawRowsAxis: () => undefined,
      getHiddenRows: () => hiddenRows,
      setHiddenRows: (rowIds) => {
        hiddenRows = rowIds
      },
      resolveDefaultRowHeight: () => 24,
    })

    expect(rows.hideRows({ kind: 'hideRows', rowIds: [1, 2, 3] })).toEqual({
      kind: 'rowsHidden',
      rowIds: [2, 3],
    })
    expect(hiddenRows).toEqual([1, 2, 3])
    expect(rows.unhideRows({ kind: 'unhideRows', rowIds: [0, 2] })).toEqual({
      kind: 'rowsUnhidden',
      rowIds: [2],
    })
    expect(hiddenRows).toEqual([1, 3])
  })

  it('moves rows, remaps row heights and hidden rows, then returns rowsMoved event', () => {
    const data = new InMemoryDataSource({
      schema: { fields: [{ id: 'name', name: 'Name', type: 'text', width: 80 }] },
      rows: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }],
    })
    let rawRowsAxis = new ChunkedAxis({ count: 4, defaultSize: 24 })
    rawRowsAxis.setSize(1, 40)
    rawRowsAxis.setSize(2, 48)
    let hiddenRows: readonly number[] = [3]
    const rows = new DefaultRowStructure({
      getRowCount: () => data.getRowCount(),
      insertRows: (at, count) => data.insertRows(at, count),
      deleteRows: (rowIds) => data.deleteRows(rowIds),
      moveRows: (rowIds, beforeRowId) => {
        data.moveRows(rowIds, beforeRowId)
        return true
      },
      getRawRowsAxis: () => rawRowsAxis,
      setRawRowsAxis: (axis) => {
        rawRowsAxis = axis
      },
      getHiddenRows: () => hiddenRows,
      setHiddenRows: (rowIds) => {
        hiddenRows = rowIds
      },
      resolveDefaultRowHeight: () => 24,
    })

    const event = rows.moveRows({ kind: 'moveRows', rowIds: [1, 2], beforeRowId: null })

    expect(event).not.toBeNull()
    expect(event?.kind).toBe('rowsMoved')
    expect((data.getRows(0, 3) as Row[]).map((row) => row.name)).toEqual([
      'A',
      'D',
      'B',
      'C',
    ])
    expect(rawRowsAxis.getSize(1)).toBe(24)
    expect(rawRowsAxis.getSize(2)).toBe(40)
    expect(rawRowsAxis.getSize(3)).toBe(48)
    expect(hiddenRows).toEqual([1])
  })

  it('returns null for invalid row move operations', () => {
    const data = new InMemoryDataSource({
      schema: { fields: [{ id: 'name', name: 'Name', type: 'text', width: 80 }] },
      rows: [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
    })
    let moved = false
    const rows = new DefaultRowStructure({
      getRowCount: () => data.getRowCount(),
      insertRows: () => [],
      deleteRows: () => [],
      moveRows: () => {
        moved = true
        return true
      },
      getRawRowsAxis: () => new ChunkedAxis({ count: 3, defaultSize: 24 }),
      setRawRowsAxis: () => undefined,
      getHiddenRows: () => [],
      setHiddenRows: () => undefined,
      resolveDefaultRowHeight: () => 24,
    })

    expect(rows.moveRows({ kind: 'moveRows', rowIds: [1, 2], beforeRowId: 2 })).toBeNull()
    expect(moved).toBe(false)
  })

  it('returns null and leaves raw state untouched when the data source cannot move rows', () => {
    let rawRowsAxis = new ChunkedAxis({ count: 3, defaultSize: 24 })
    rawRowsAxis.setSize(0, 40)
    let hiddenRows: readonly number[] = [2]
    const rows = new DefaultRowStructure({
      getRowCount: () => 3,
      insertRows: () => [],
      deleteRows: () => [],
      moveRows: () => false,
      getRawRowsAxis: () => rawRowsAxis,
      setRawRowsAxis: (axis) => {
        rawRowsAxis = axis
      },
      getHiddenRows: () => hiddenRows,
      setHiddenRows: (rowIds) => {
        hiddenRows = rowIds
      },
      resolveDefaultRowHeight: () => 24,
    })

    expect(rows.moveRows({ kind: 'moveRows', rowIds: [0], beforeRowId: null })).toBeNull()
    expect(rawRowsAxis.getSize(0)).toBe(40)
    expect(hiddenRows).toEqual([2])
  })
})
