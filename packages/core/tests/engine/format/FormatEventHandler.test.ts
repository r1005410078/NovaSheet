import { describe, expect, it } from 'bun:test'
import { FormatEventHandler } from '../../../src/engine/format/FormatEventHandler'

describe('FormatEventHandler', () => {
  it('remaps format and merge stores when rows move', () => {
    const calls: string[] = []
    const indexMap = new Map([
      [0, 1],
      [1, 0],
    ])
    const handler = new FormatEventHandler({
      remapFormatRows: (map) => {
        expect(map).toBe(indexMap)
        calls.push('format')
      },
      remapMergeRows: (map) => {
        expect(map).toBe(indexMap)
        calls.push('merge')
      },
      remapFormatAfterRowsInserted: () => calls.push('format-insert'),
      remapMergeAfterRowsInserted: () => calls.push('merge-insert'),
      remapFormatAfterRowsDeleted: () => calls.push('format-delete'),
      remapMergeAfterRowsDeleted: () => calls.push('merge-delete'),
    })

    handler.handle({
      kind: 'rowsMoved',
      rowIds: [0],
      beforeRowId: null,
      inverseRowIds: [1],
      inverseBeforeRowId: 0,
      indexMap,
    })

    expect(calls).toEqual(['format', 'merge'])
  })

  it('ignores unrelated domain events', () => {
    const calls: string[] = []
    const handler = new FormatEventHandler({
      remapFormatRows: () => calls.push('format'),
      remapMergeRows: () => calls.push('merge'),
      remapFormatAfterRowsInserted: () => calls.push('format-insert'),
      remapMergeAfterRowsInserted: () => calls.push('merge-insert'),
      remapFormatAfterRowsDeleted: () => calls.push('format-delete'),
      remapMergeAfterRowsDeleted: () => calls.push('merge-delete'),
    })

    handler.handle({
      kind: 'columnsMoved',
      fieldIds: ['a'],
      beforeFieldId: null,
      indexMap: new Map([[0, 0]]),
    })

    expect(calls).toEqual([])
  })

  it('remaps format and merge stores when rows are inserted or deleted', () => {
    const calls: string[] = []
    const handler = new FormatEventHandler({
      remapFormatRows: () => calls.push('format-move'),
      remapMergeRows: () => calls.push('merge-move'),
      remapFormatAfterRowsInserted: (at, count) => calls.push(`format-insert:${at}:${count}`),
      remapMergeAfterRowsInserted: (at, count) => calls.push(`merge-insert:${at}:${count}`),
      remapFormatAfterRowsDeleted: (rowIds) => calls.push(`format-delete:${rowIds.join(',')}`),
      remapMergeAfterRowsDeleted: (rowIds) => calls.push(`merge-delete:${rowIds.join(',')}`),
    })

    handler.handle({ kind: 'rowsInserted', at: 1, count: 2, newRowIds: [1, 2] })
    handler.handle({
      kind: 'rowsDeleted',
      rowIds: [3, 4],
      snapshots: [],
      deletedHeights: [],
    })

    expect(calls).toEqual([
      'format-insert:1:2',
      'merge-insert:1:2',
      'format-delete:3,4',
      'merge-delete:3,4',
    ])
  })
})
