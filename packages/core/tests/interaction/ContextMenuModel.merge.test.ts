import { describe, expect, it } from 'bun:test'
import {
  cellMergeMenuState,
  getCellMergeMenuItems,
} from '../../src/interaction/ContextMenuModel'

describe('cellMergeMenuState', () => {
  it('无选区时 merge/unmerge 均禁用', () => {
    expect(cellMergeMenuState(null, [])).toEqual({ canMerge: false, canUnmerge: false })
  })

  it('单格选区不可合并', () => {
    expect(
      cellMergeMenuState({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, []),
    ).toEqual({ canMerge: false, canUnmerge: false })
  })

  it('多格无重叠可合并', () => {
    expect(
      cellMergeMenuState({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 }, []),
    ).toEqual({ canMerge: true, canUnmerge: false })
  })

  it('选区触及已有合并时可取消合并、不可再合并', () => {
    const regions = [
      {
        id: 'm1',
        range: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
        anchor: { rowIndex: 0, colIndex: 0 },
      },
    ]
    expect(
      cellMergeMenuState({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 }, regions),
    ).toEqual({ canMerge: false, canUnmerge: true })
  })
})

describe('getCellMergeMenuItems', () => {
  it('maps enabled flags to disabled on items', () => {
    const items = getCellMergeMenuItems(true, false)
    expect(items.map((i) => i.id)).toEqual(['merge-cells', 'unmerge-cells'])
    expect(items[0]!.disabled).toBe(false)
    expect(items[1]!.disabled).toBe(true)
  })
})
