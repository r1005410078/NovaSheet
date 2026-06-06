import { describe, expect, it, spyOn } from 'bun:test'
import { FormatEventHandler } from '../../../src/features/format/FormatEventHandler'
import { DefaultFormatState } from '../../../src/features/format/FormatState'

describe('FormatEventHandler column branches', () => {
  it('remaps format and merge stores when columns are inserted', () => {
    const state = new DefaultFormatState()
    const formatSpy = spyOn(state, 'remapFormatAfterColsInserted')
    const mergeSpy = spyOn(state, 'remapMergeAfterColsInserted')
    new FormatEventHandler(state).handle({
      kind: 'columnsInserted',
      at: 2,
      count: 3,
      newFields: [],
    })
    expect(formatSpy).toHaveBeenCalledWith(2, 3)
    expect(mergeSpy).toHaveBeenCalledWith(2, 3)
  })

  it('remaps format and merge stores when columns are deleted', () => {
    const state = new DefaultFormatState()
    const formatSpy = spyOn(state, 'remapFormatAfterColsDeleted')
    const mergeSpy = spyOn(state, 'remapMergeAfterColsDeleted')
    new FormatEventHandler(state).handle({
      kind: 'columnsDeleted',
      removedIndices: [1, 4],
      snapshots: [],
      deletedWidths: [],
    })
    expect(formatSpy).toHaveBeenCalledWith([1, 4])
    expect(mergeSpy).toHaveBeenCalledWith([1, 4])
  })

  it('remaps format and merge stores when columns move', () => {
    const state = new DefaultFormatState()
    const indexMap = new Map([
      [1, 2],
      [2, 1],
    ])
    const formatSpy = spyOn(state, 'remapFormatCols')
    const mergeSpy = spyOn(state, 'remapMergeCols')
    new FormatEventHandler(state).handle({
      kind: 'columnsMoved',
      fieldIds: ['b', 'c'],
      beforeFieldId: null,
      inverseBeforeFieldId: 'd',
      indexMap,
    })
    expect(formatSpy).toHaveBeenCalledWith(indexMap)
    expect(mergeSpy).toHaveBeenCalledWith(indexMap)
  })

  it('ignores hide / unhide column events (raw coords unchanged)', () => {
    const state = new DefaultFormatState()
    const formatSpy = spyOn(state, 'remapFormatCols')
    const mergeSpy = spyOn(state, 'remapMergeCols')
    const handler = new FormatEventHandler(state)
    handler.handle({ kind: 'columnsHidden', fieldIds: ['a'] })
    handler.handle({ kind: 'columnsUnhidden', fieldIds: ['a'] })
    expect(formatSpy).not.toHaveBeenCalled()
    expect(mergeSpy).not.toHaveBeenCalled()
  })
})
