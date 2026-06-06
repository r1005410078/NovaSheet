import { describe, expect, it } from 'bun:test'
import { SelectionEventHandler } from '../../../src/features/selection/SelectionEventHandler'
import type { SelectionCommands } from '../../../src/features/selection/SelectionState'

function makeCommands(calls: string[]): SelectionCommands {
  return {
    remapAfterRowsInserted: (at, count) => calls.push(`rows-inserted:${at}:${count}`),
    remapAfterRowsDeleted: (rowIds) => calls.push(`rows-deleted:${rowIds.join(',')}`),
    remapAfterColsInserted: (at, count) => calls.push(`cols-inserted:${at}:${count}`),
    remapAfterColsDeleted: (colIndices) => calls.push(`cols-deleted:${colIndices.join(',')}`),
    restoreByRowIndexMap: (indexMap) => calls.push(`rows-moved:${indexMap.size}`),
    captureVisibleFieldIdsBefore: (fieldIds) => calls.push(`capture:${fieldIds.join(',')}`),
    restoreByCapturedVisibleFieldIds: (fieldIds) => calls.push(`cols-moved:${fieldIds.join(',')}`),
  }
}

describe('SelectionEventHandler', () => {
  it('remaps selection for row structural events', () => {
    const calls: string[] = []
    const handler = new SelectionEventHandler(makeCommands(calls), {
      getVisibleFieldIds: () => ['a', 'b'],
    })

    handler.handle({ kind: 'rowsInserted', at: 1, count: 2, newRowIds: [1, 2] })
    handler.handle({ kind: 'rowsDeleted', rowIds: [3], snapshots: [], deletedHeights: [] })
    handler.handle({
      kind: 'rowsMoved',
      rowIds: [1],
      beforeRowId: null,
      inverseRowIds: [2],
      inverseBeforeRowId: 1,
      indexMap: new Map([[1, 2]]),
    })

    expect(calls).toEqual(['rows-inserted:1:2', 'rows-deleted:3', 'rows-moved:1'])
  })

  it('remaps selection for column insert/delete and column move using current visible ids', () => {
    const calls: string[] = []
    const handler = new SelectionEventHandler(makeCommands(calls), {
      getVisibleFieldIds: () => ['a', 'd', 'b', 'c'],
    })

    handler.handle({ kind: 'columnsInserted', at: 1, count: 1, newFields: [] })
    handler.handle({ kind: 'columnsDeleted', removedIndices: [2], snapshots: [], deletedWidths: [] })
    handler.handle({
      kind: 'columnsMoved',
      fieldIds: ['b', 'c'],
      beforeFieldId: null,
      inverseBeforeFieldId: 'd',
      indexMap: new Map(),
    })

    expect(calls).toEqual(['cols-inserted:1:1', 'cols-deleted:2', 'cols-moved:a,d,b,c'])
  })

  it('ignores hide and unhide events because view selection remap is preserved for now', () => {
    const calls: string[] = []
    const handler = new SelectionEventHandler(makeCommands(calls), {
      getVisibleFieldIds: () => [],
    })

    handler.handle({ kind: 'rowsHidden', rowIds: [1] })
    handler.handle({ kind: 'rowsUnhidden', rowIds: [1] })
    handler.handle({ kind: 'columnsHidden', fieldIds: ['a'] })
    handler.handle({ kind: 'columnsUnhidden', fieldIds: ['a'] })

    expect(calls).toEqual([])
  })
})
