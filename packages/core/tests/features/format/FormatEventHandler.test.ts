import { describe, expect, it, spyOn } from 'bun:test'
import { FormatEventHandler } from '../../../src/features/format/FormatEventHandler'
import { DefaultFormatState } from '../../../src/features/format/FormatState'

describe('FormatEventHandler', () => {
  it('remaps format and merge stores when rows move', () => {
    const state = new DefaultFormatState()
    const indexMap = new Map([
      [0, 1],
      [1, 0],
    ])
    const formatSpy = spyOn(state, 'remapFormatRows')
    const mergeSpy = spyOn(state, 'remapMergeRows')
    const handler = new FormatEventHandler(state)

    handler.handle({
      kind: 'rowsMoved',
      rowIds: [0],
      beforeRowId: null,
      inverseRowIds: [1],
      inverseBeforeRowId: 0,
      indexMap,
    })

    expect(formatSpy).toHaveBeenCalledWith(indexMap)
    expect(mergeSpy).toHaveBeenCalledWith(indexMap)
  })

  it('ignores unrelated domain events', () => {
    const state = new DefaultFormatState()
    const formatSpy = spyOn(state, 'remapFormatRows')
    const mergeSpy = spyOn(state, 'remapMergeRows')
    const handler = new FormatEventHandler(state)

    // 隐藏列不改 raw 坐标，format/merge 按 raw 键控，无需重映射。
    handler.handle({ kind: 'columnsHidden', fieldIds: ['a'] })

    expect(formatSpy).not.toHaveBeenCalled()
    expect(mergeSpy).not.toHaveBeenCalled()
  })

  it('remaps format and merge stores when rows are inserted or deleted', () => {
    const state = new DefaultFormatState()
    const formatInsertSpy = spyOn(state, 'remapFormatAfterRowsInserted')
    const mergeInsertSpy = spyOn(state, 'remapMergeAfterRowsInserted')
    const formatDeleteSpy = spyOn(state, 'remapFormatAfterRowsDeleted')
    const mergeDeleteSpy = spyOn(state, 'remapMergeAfterRowsDeleted')
    const handler = new FormatEventHandler(state)

    handler.handle({ kind: 'rowsInserted', at: 1, count: 2, newRowIds: [1, 2] })
    handler.handle({
      kind: 'rowsDeleted',
      rowIds: [3, 4],
      snapshots: [],
      deletedHeights: [],
    })

    expect(formatInsertSpy).toHaveBeenCalledWith(1, 2)
    expect(mergeInsertSpy).toHaveBeenCalledWith(1, 2)
    expect(formatDeleteSpy).toHaveBeenCalledWith([3, 4])
    expect(mergeDeleteSpy).toHaveBeenCalledWith([3, 4])
  })
})
