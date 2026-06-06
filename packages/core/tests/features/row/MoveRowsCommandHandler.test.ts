import { describe, expect, it } from 'bun:test'
import type { RowsMoved } from '../../../src/kernel/protocol/RowEvent'
import { MoveRowsCommandHandler } from '../../../src/features/row/MoveRowsCommandHandler'
import type { MoveRowsOperation } from '../../../src/kernel/protocol/RowOperation'
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

describe('MoveRowsCommandHandler', () => {
  it('executes row structure and dispatches returned domain event', () => {
    const event: RowsMoved = {
      kind: 'rowsMoved',
      rowIds: [1, 2],
      beforeRowId: null,
      inverseRowIds: [2, 3],
      inverseBeforeRowId: 1,
      indexMap: new Map([[1, 2]]),
    }
    const operations: MoveRowsOperation[] = []
    const dispatched: RowsMoved[] = []
    const rows = makeRows({
      moveRows: (operation) => {
        operations.push(operation)
        return event
      },
    })
    const handler = new MoveRowsCommandHandler(rows, {
      dispatch: (domainEvent) => dispatched.push(domainEvent as RowsMoved),
    })

    const result = handler.execute({ kind: 'moveRows', rowIds: [1, 2], beforeRowId: null })

    expect(result).toBe(event)
    expect(operations).toEqual([{ kind: 'moveRows', rowIds: [1, 2], beforeRowId: null }])
    expect(dispatched).toEqual([event])
  })

  it('does not dispatch when row structure rejects the operation', () => {
    const dispatched: unknown[] = []
    const rows = makeRows({
      moveRows: () => null,
    })
    const handler = new MoveRowsCommandHandler(rows, {
      dispatch: (event) => dispatched.push(event),
    })

    expect(handler.execute({ kind: 'moveRows', rowIds: [1, 2], beforeRowId: 2 })).toBeNull()
    expect(dispatched).toEqual([])
  })
})
