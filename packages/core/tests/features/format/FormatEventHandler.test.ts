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

describe('FormatEventHandler attachment remap', () => {
  it('rows inserted before attachment cell shifts it down', () => {
    const state = new DefaultFormatState()
    state.attachmentStore.set('ns', 3, 2, { value: 'x' })
    const handler = new FormatEventHandler(state)

    handler.handle({ kind: 'rowsInserted', at: 1, count: 2, newRowIds: [1, 2] })

    // row 3 + 2 inserted before = row 5
    expect(state.attachmentStore.get('ns', 5, 2)).toEqual({ value: 'x' })
    expect(state.attachmentStore.get('ns', 3, 2)).toBeUndefined()
  })

  it('rows deleted before attachment cell shifts it up', () => {
    const state = new DefaultFormatState()
    state.attachmentStore.set('ns', 5, 1, { value: 'y' })
    const handler = new FormatEventHandler(state)

    handler.handle({
      kind: 'rowsDeleted',
      rowIds: [2, 3],
      snapshots: [],
      deletedHeights: [],
    })

    // row 5 - 2 deleted rows below = row 3
    expect(state.attachmentStore.get('ns', 3, 1)).toEqual({ value: 'y' })
    expect(state.attachmentStore.get('ns', 5, 1)).toBeUndefined()
  })

  it('rows moved remaps attachment', () => {
    const state = new DefaultFormatState()
    state.attachmentStore.set('ns', 0, 0, { value: 'z' })
    const indexMap = new Map([[0, 1], [1, 0]])
    const handler = new FormatEventHandler(state)

    handler.handle({
      kind: 'rowsMoved',
      rowIds: [0],
      beforeRowId: null,
      inverseRowIds: [1],
      inverseBeforeRowId: 0,
      indexMap,
    })

    expect(state.attachmentStore.get('ns', 1, 0)).toEqual({ value: 'z' })
    expect(state.attachmentStore.get('ns', 0, 0)).toBeUndefined()
  })

  it('cols inserted before attachment cell shifts it right', () => {
    const state = new DefaultFormatState()
    state.attachmentStore.set('ns', 0, 3, { value: 'c' })
    const handler = new FormatEventHandler(state)

    handler.handle({ kind: 'columnsInserted', at: 1, count: 2, newFields: [] })

    expect(state.attachmentStore.get('ns', 0, 5)).toEqual({ value: 'c' })
    expect(state.attachmentStore.get('ns', 0, 3)).toBeUndefined()
  })

  it('cols deleted before attachment cell shifts it left', () => {
    const state = new DefaultFormatState()
    state.attachmentStore.set('ns', 0, 4, { value: 'd' })
    const handler = new FormatEventHandler(state)

    handler.handle({
      kind: 'columnsDeleted',
      removedIndices: [1, 2],
      snapshots: [],
      deletedWidths: [],
    })

    expect(state.attachmentStore.get('ns', 0, 2)).toEqual({ value: 'd' })
    expect(state.attachmentStore.get('ns', 0, 4)).toBeUndefined()
  })

  it('cols moved remaps attachment', () => {
    const state = new DefaultFormatState()
    state.attachmentStore.set('ns', 0, 0, { value: 'e' })
    const indexMap = new Map([[0, 1], [1, 0]])
    const handler = new FormatEventHandler(state)

    handler.handle({
      kind: 'columnsMoved',
      fieldIds: ['f0'],
      beforeFieldId: null,
      inverseBeforeFieldId: 'f0',
      indexMap,
    })

    expect(state.attachmentStore.get('ns', 0, 1)).toEqual({ value: 'e' })
    expect(state.attachmentStore.get('ns', 0, 0)).toBeUndefined()
  })
})
