import { describe, expect, it } from 'bun:test'
import { InsertColsCommandHandler } from '../../../src/features/column/InsertColsCommandHandler'
import { MoveColsCommandHandler } from '../../../src/features/column/MoveColsCommandHandler'
import type { ColumnDomainEvent } from '../../../src/kernel/protocol/ColumnEvent'
import type { ColumnCommands } from '../../../src/features/column/ColumnStructure'

function makeCols(overrides: Partial<ColumnCommands>): ColumnCommands {
  return {
    insertCols: () => null,
    deleteCols: () => null,
    hideCols: () => null,
    unhideCols: () => null,
    moveCols: () => null,
    ...overrides,
  }
}

describe('Column command handlers', () => {
  it('dispatches the event returned by the column structure', () => {
    const dispatched: ColumnDomainEvent[] = []
    const events = { dispatch: (e: ColumnDomainEvent) => dispatched.push(e) }
    const cols = makeCols({
      insertCols: () => ({ kind: 'columnsInserted', at: 1, count: 1, newFields: [] }),
    })
    const event = new InsertColsCommandHandler(cols, events).execute({
      kind: 'insertCols',
      beforeFieldIndex: 1,
      count: 1,
    })
    expect(event?.kind).toBe('columnsInserted')
    expect(dispatched.length).toBe(1)
  })

  it('does not dispatch when the structure returns null', () => {
    const dispatched: ColumnDomainEvent[] = []
    const events = { dispatch: (e: ColumnDomainEvent) => dispatched.push(e) }
    new MoveColsCommandHandler(makeCols({}), events).execute({
      kind: 'moveCols',
      fieldIds: ['a'],
      beforeFieldId: null,
    })
    expect(dispatched.length).toBe(0)
  })
})
