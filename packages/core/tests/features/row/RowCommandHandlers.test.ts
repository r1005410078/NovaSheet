import { describe, expect, it } from 'bun:test'
import { DeleteRowsCommandHandler } from '../../../src/features/row/DeleteRowsCommandHandler'
import { HideRowsCommandHandler } from '../../../src/features/row/HideRowsCommandHandler'
import { InsertRowsCommandHandler } from '../../../src/features/row/InsertRowsCommandHandler'
import { UnhideRowsCommandHandler } from '../../../src/features/row/UnhideRowsCommandHandler'
import type { RowDomainEvent } from '../../../src/kernel/protocol/RowEvent'
import type { RowCommands } from '../../../src/features/row/RowStructure'

function makeRows(overrides: Partial<RowCommands>): RowCommands {
  return {
    insertRows: () => null,
    deleteRows: () => null,
    hideRows: () => null,
    unhideRows: () => null,
    moveRows: () => null,
    ...overrides,
  }
}

describe('Row command handlers', () => {
  it('dispatches insert/delete/hide/unhide events returned by row structure', () => {
    const dispatched: RowDomainEvent[] = []
    const events = {
      dispatch: (event: RowDomainEvent) => dispatched.push(event),
    }
    const rows = makeRows({
      insertRows: () => ({ kind: 'rowsInserted', at: 1, count: 2, newRowIds: [1, 2] }),
      deleteRows: () => ({
        kind: 'rowsDeleted',
        rowIds: [1],
        snapshots: [{ originalUnderlyingRow: 1, cells: { name: 'B' } }],
        deletedHeights: [40],
      }),
      hideRows: () => ({ kind: 'rowsHidden', rowIds: [2] }),
      unhideRows: () => ({ kind: 'rowsUnhidden', rowIds: [2] }),
    })

    expect(new InsertRowsCommandHandler(rows, events).execute({ kind: 'insertRows', at: 1, count: 2 }))
      .not.toBeNull()
    expect(new DeleteRowsCommandHandler(rows, events).execute({ kind: 'deleteRows', rowIds: [1] }))
      .not.toBeNull()
    expect(new HideRowsCommandHandler(rows, events).execute({ kind: 'hideRows', rowIds: [2] }))
      .not.toBeNull()
    expect(new UnhideRowsCommandHandler(rows, events).execute({ kind: 'unhideRows', rowIds: [2] }))
      .not.toBeNull()

    expect(dispatched.map((event) => event.kind)).toEqual([
      'rowsInserted',
      'rowsDeleted',
      'rowsHidden',
      'rowsUnhidden',
    ])
  })

  it('does not dispatch when row structure returns null', () => {
    const dispatched: RowDomainEvent[] = []
    const rows = makeRows({})
    const events = {
      dispatch: (event: RowDomainEvent) => dispatched.push(event),
    }

    expect(new InsertRowsCommandHandler(rows, events).execute({ kind: 'insertRows', at: 1, count: 0 }))
      .toBeNull()
    expect(new DeleteRowsCommandHandler(rows, events).execute({ kind: 'deleteRows', rowIds: [] }))
      .toBeNull()
    expect(new HideRowsCommandHandler(rows, events).execute({ kind: 'hideRows', rowIds: [] }))
      .toBeNull()
    expect(new UnhideRowsCommandHandler(rows, events).execute({ kind: 'unhideRows', rowIds: [] }))
      .toBeNull()

    expect(dispatched).toEqual([])
  })
})
