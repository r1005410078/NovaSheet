import { describe, expect, it } from 'bun:test'
import { FormatEventHandler } from '../../../src/engine/format/FormatEventHandler'
import type { FormatEventHandlerContext } from '../../../src/engine/format/FormatEventHandler'

function makeContext(calls: string[]): FormatEventHandlerContext {
  return {
    remapFormatRows: () => calls.push('format-rows'),
    remapMergeRows: () => calls.push('merge-rows'),
    remapFormatAfterRowsInserted: () => calls.push('format-rows-insert'),
    remapMergeAfterRowsInserted: () => calls.push('merge-rows-insert'),
    remapFormatAfterRowsDeleted: () => calls.push('format-rows-delete'),
    remapMergeAfterRowsDeleted: () => calls.push('merge-rows-delete'),
    remapFormatCols: (map) => calls.push(`format-cols:${[...map.entries()].join('|')}`),
    remapMergeCols: (map) => calls.push(`merge-cols:${[...map.entries()].join('|')}`),
    remapFormatAfterColsInserted: (at, count) => calls.push(`format-cols-insert:${at}:${count}`),
    remapMergeAfterColsInserted: (at, count) => calls.push(`merge-cols-insert:${at}:${count}`),
    remapFormatAfterColsDeleted: (idx) => calls.push(`format-cols-delete:${idx.join(',')}`),
    remapMergeAfterColsDeleted: (idx) => calls.push(`merge-cols-delete:${idx.join(',')}`),
  }
}

describe('FormatEventHandler column branches', () => {
  it('remaps format and merge stores when columns are inserted', () => {
    const calls: string[] = []
    new FormatEventHandler(makeContext(calls)).handle({
      kind: 'columnsInserted',
      at: 2,
      count: 3,
      newFields: [],
    })
    expect(calls).toEqual(['format-cols-insert:2:3', 'merge-cols-insert:2:3'])
  })

  it('remaps format and merge stores when columns are deleted', () => {
    const calls: string[] = []
    new FormatEventHandler(makeContext(calls)).handle({
      kind: 'columnsDeleted',
      removedIndices: [1, 4],
      snapshots: [],
      deletedWidths: [],
    })
    expect(calls).toEqual(['format-cols-delete:1,4', 'merge-cols-delete:1,4'])
  })

  it('remaps format and merge stores when columns move', () => {
    const calls: string[] = []
    const indexMap = new Map([
      [1, 2],
      [2, 1],
    ])
    new FormatEventHandler(makeContext(calls)).handle({
      kind: 'columnsMoved',
      fieldIds: ['b', 'c'],
      beforeFieldId: null,
      inverseBeforeFieldId: 'd',
      indexMap,
    })
    expect(calls).toEqual(['format-cols:1,2|2,1', 'merge-cols:1,2|2,1'])
  })

  it('ignores hide / unhide column events (raw coords unchanged)', () => {
    const calls: string[] = []
    const handler = new FormatEventHandler(makeContext(calls))
    handler.handle({ kind: 'columnsHidden', fieldIds: ['a'] })
    handler.handle({ kind: 'columnsUnhidden', fieldIds: ['a'] })
    expect(calls).toEqual([])
  })
})
