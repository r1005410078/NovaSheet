import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../../src/kernel/data/InMemoryDataSource'
import { DefaultRowStructure } from '../../../src/features/row/DefaultRowStructure'
import type { DataSource } from '../../../src/kernel/data/DataSource'
import type { Row } from '../../../src/kernel/data/Schema'

const DEFAULT_HEIGHT = 24

function makeData(names: string[]): InMemoryDataSource {
  return new InMemoryDataSource({
    schema: { fields: [{ id: 'name', name: 'Name', type: 'text', width: 80 }] },
    rows: names.map((name) => ({ name })),
  })
}

function makeRows(data: DataSource): DefaultRowStructure {
  return new DefaultRowStructure(data, () => DEFAULT_HEIGHT)
}

describe('DefaultRowStructure（自持状态）', () => {
  it('inserts rows, expands raw row heights, returns rowsInserted event', () => {
    const data = makeData(['A', 'B'])
    const rows = makeRows(data)
    rows.setRowHeight(1, 40)

    const event = rows.insertRows({ kind: 'insertRows', at: 1, count: 2 })

    expect(event).toEqual({ kind: 'rowsInserted', at: 1, count: 2, newRowIds: [1, 2] })
    expect(data.getRowCount()).toBe(4)
    expect(rows.getRowHeight(1)).toBe(DEFAULT_HEIGHT)
    expect(rows.getRowHeight(3)).toBe(40)
  })

  it('reports the actual clamped insertion position', () => {
    const rows = makeRows(makeData(['A', 'B']))
    const event = rows.insertRows({ kind: 'insertRows', at: 999, count: 1 })
    expect(event?.at).toBe(2)
    expect(event?.newRowIds).toEqual([2])
  })

  it('returns null for non-positive insert count', () => {
    const rows = makeRows(makeData(['A', 'B']))
    expect(rows.insertRows({ kind: 'insertRows', at: 0, count: 0 })).toBeNull()
  })

  it('deletes rows, captures deleted heights and snapshots', () => {
    const data = makeData(['A', 'B', 'C'])
    const rows = makeRows(data)
    rows.setRowHeight(1, 40)

    const event = rows.deleteRows({ kind: 'deleteRows', rowIds: [1] })

    expect(event?.kind).toBe('rowsDeleted')
    expect(event?.rowIds).toEqual([1])
    expect(event?.deletedHeights).toEqual([40])
    expect(event?.snapshots).toEqual([{ originalUnderlyingRow: 1, cells: { name: 'B' } }])
    expect((data.getRows(0, 1) as Row[]).map((r) => r.name)).toEqual(['A', 'C'])
  })

  it('rejects invalid delete row ids before mutating', () => {
    const data = makeData(['A', 'B', 'C'])
    const rows = makeRows(data)
    expect(rows.deleteRows({ kind: 'deleteRows', rowIds: [-1] })).toBeNull()
    expect(rows.deleteRows({ kind: 'deleteRows', rowIds: [3] })).toBeNull()
    expect(rows.deleteRows({ kind: 'deleteRows', rowIds: [1, 1] })).toBeNull()
    expect((data.getRows(0, 2) as Row[]).map((r) => r.name)).toEqual(['A', 'B', 'C'])
  })

  it('hides and unhides only effective row ids, reflected in hidden + view data', () => {
    const data = makeData(['A', 'B', 'C', 'D'])
    const rows = makeRows(data)
    rows.addHidden([1])

    expect(rows.hideRows({ kind: 'hideRows', rowIds: [1, 2, 3] })).toEqual({
      kind: 'rowsHidden',
      rowIds: [2, 3],
    })
    expect(rows.getHiddenRows()).toEqual([1, 2, 3])
    expect(rows.getRowViewData().getRowCount()).toBe(1)

    expect(rows.unhideRows({ kind: 'unhideRows', rowIds: [0, 2] })).toEqual({
      kind: 'rowsUnhidden',
      rowIds: [2],
    })
    expect(rows.getHiddenRows()).toEqual([1, 3])
    expect(rows.getRowViewData().getRowCount()).toBe(2)
  })

  it('moves rows, remaps row heights and hidden rows', () => {
    const data = makeData(['A', 'B', 'C', 'D'])
    const rows = makeRows(data)
    rows.setRowHeight(1, 40)
    rows.setRowHeight(2, 48)
    rows.addHidden([3])

    const event = rows.moveRows({ kind: 'moveRows', rowIds: [1, 2], beforeRowId: null })

    expect(event?.kind).toBe('rowsMoved')
    expect((data.getRows(0, 3) as Row[]).map((r) => r.name)).toEqual(['A', 'D', 'B', 'C'])
    expect(rows.getRowHeight(1)).toBe(DEFAULT_HEIGHT)
    expect(rows.getRowHeight(2)).toBe(40)
    expect(rows.getRowHeight(3)).toBe(48)
    expect(rows.getHiddenRows()).toEqual([1])
  })

  it('returns null for invalid row move operations', () => {
    const data = makeData(['A', 'B', 'C'])
    const rows = makeRows(data)
    expect(rows.moveRows({ kind: 'moveRows', rowIds: [1, 2], beforeRowId: 2 })).toBeNull()
    expect((data.getRows(0, 2) as Row[]).map((r) => r.name)).toEqual(['A', 'B', 'C'])
  })

  it('returns null and leaves state untouched when data source is not mutable', () => {
    const immutable: DataSource = {
      getRowCount: () => 3,
      getSchema: () => ({ fields: [{ id: 'name', name: 'Name', type: 'text', width: 80 }] }),
      getRows: () => [],
      getCell: () => undefined,
      subscribe: () => () => undefined,
    }
    const rows = new DefaultRowStructure(immutable, () => DEFAULT_HEIGHT)
    expect(rows.moveRows({ kind: 'moveRows', rowIds: [0], beforeRowId: null })).toBeNull()
    expect(rows.insertRows({ kind: 'insertRows', at: 0, count: 1 })).toBeNull()
    expect(rows.deleteRows({ kind: 'deleteRows', rowIds: [0] })).toBeNull()
  })

  it('getViewRowsAxis derives view axis from raw heights and hidden rows', () => {
    const data = makeData(['A', 'B', 'C'])
    const rows = makeRows(data)
    rows.setRowHeight(0, 30)
    rows.setRowHeight(2, 50)
    rows.addHidden([1])

    const axis = rows.getViewRowsAxis()
    expect(axis.getCount()).toBe(2)
    expect(axis.getSize(0)).toBe(30)
    expect(axis.getSize(1)).toBe(50)
  })

  it('getCollapsedGaps reports hidden runs', () => {
    const rows = makeRows(makeData(['A', 'B', 'C', 'D']))
    rows.addHidden([1, 2])
    const gaps = rows.getCollapsedGaps()
    expect(gaps).toEqual([{ atViewRow: 0, hiddenCount: 2, hiddenIds: [1, 2] }])
  })

  it('reinsertDeletedRows restores rows, cells and heights (delete undo)', () => {
    const data = makeData(['A', 'B', 'C'])
    const rows = makeRows(data)
    rows.setRowHeight(1, 40)
    const event = rows.deleteRows({ kind: 'deleteRows', rowIds: [1] })!

    rows.reinsertDeletedRows(event.snapshots, event.deletedHeights)

    expect((data.getRows(0, 2) as Row[]).map((r) => r.name)).toEqual(['A', 'B', 'C'])
    expect(rows.getRowHeight(1)).toBe(40)
  })

  it('insertBlankRows + deleteRowsByIds are inverse-safe (insert undo/redo)', () => {
    const data = makeData(['A', 'B'])
    const rows = makeRows(data)
    rows.insertBlankRows(1, 2)
    expect(data.getRowCount()).toBe(4)
    rows.deleteRowsByIds([1, 2])
    expect(data.getRowCount()).toBe(2)
    expect((data.getRows(0, 1) as Row[]).map((r) => r.name)).toEqual(['A', 'B'])
  })

  it('rebuild rebinds data source and resets raw row axis', () => {
    const rows = makeRows(makeData(['A', 'B']))
    rows.setRowHeight(0, 99)
    const next = makeData(['X', 'Y', 'Z'])
    rows.rebuild(next, () => DEFAULT_HEIGHT)
    expect(rows.getRowViewData().getRowCount()).toBe(3)
    expect(rows.getRowHeight(0)).toBe(DEFAULT_HEIGHT)
  })

  it('rebuild disposes the previous rowViewData wrapper before replacing it — repeated rebuild on the SAME rawData (e.g. an async rowCountChanged-driven rebuild) must not leak an ever-growing chain of undisposed HiddenDataSource wrappers still subscribed to that rawData', () => {
    const data = makeData(['A', 'B'])
    const rows = makeRows(data)

    const firstRowViewData = rows.getRowViewData() as DataSource & { dispose?: () => void }
    let firstDisposeCalls = 0
    firstRowViewData.dispose = () => {
      firstDisposeCalls++
    }

    // Same rawData reference on both calls — mirrors DefaultGridEngine.rebuildData(this.rawData)
    // being invoked repeatedly off a single long-lived async source, not a genuine data swap.
    rows.rebuild(data, () => DEFAULT_HEIGHT)
    expect(firstDisposeCalls).toBe(1)

    const secondRowViewData = rows.getRowViewData() as DataSource & { dispose?: () => void }
    expect(secondRowViewData).not.toBe(firstRowViewData)
    let secondDisposeCalls = 0
    secondRowViewData.dispose = () => {
      secondDisposeCalls++
    }

    rows.rebuild(data, () => DEFAULT_HEIGHT)
    expect(secondDisposeCalls).toBe(1)
    // The first wrapper was already disposed by the PREVIOUS rebuild — a second rebuild must not
    // touch it again (proves rebuild disposes exactly the immediately-preceding wrapper, not all
    // historical ones, and doesn't double-dispose).
    expect(firstDisposeCalls).toBe(1)
  })

  it('clearHidden empties the hidden set', () => {
    const rows = makeRows(makeData(['A', 'B', 'C']))
    rows.addHidden([1])
    rows.clearHidden()
    expect(rows.getHiddenRows()).toEqual([])
  })
})
