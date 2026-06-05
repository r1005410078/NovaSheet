import { describe, expect, it } from 'bun:test'
import { DefaultSelectionState } from '../../../src/engine/selection/DefaultSelectionState'
import { SelectionCommandHandler } from '../../../src/engine/selection/SelectionCommandHandler'
import type { SelectionMergeLookup } from '../../../src/engine/selection/SelectionNavigation'

const region = { startRow: 1, endRow: 3, startCol: 1, endCol: 2 }
const merge: SelectionMergeLookup = {
  resolveMergeRegion: (rowIndex, colIndex) =>
    rowIndex >= 1 && rowIndex <= 3 && colIndex >= 1 && colIndex <= 2 ? region : null,
}
const bounds = { rowCount: 10, colCount: 5 }

describe('SelectionCommandHandler — merge 吸附', () => {
  it('点击合并区内单格 → 选中整块', () => {
    const sel = new DefaultSelectionState()
    const handler = new SelectionCommandHandler(sel, merge)
    handler.selectCell({ rowIndex: 2, colIndex: 2 })
    expect(sel.getSelection().selectedRange).toEqual(region)
    expect(sel.getSelection().activeCell).toEqual({ rowIndex: 1, colIndex: 1 })
  })

  it('extend 选择不吸附（保持索引语义）', () => {
    const sel = new DefaultSelectionState()
    const handler = new SelectionCommandHandler(sel, merge)
    handler.selectCell({ rowIndex: 0, colIndex: 0 })
    handler.selectCell({ rowIndex: 2, colIndex: 2 }, { extend: true })
    expect(sel.getSelection().selectedRange).toEqual({
      startRow: 0,
      endRow: 2,
      startCol: 0,
      endCol: 2,
    })
  })

  it('navigate 经 handler 时合并区感知', () => {
    const sel = new DefaultSelectionState()
    const handler = new SelectionCommandHandler(sel, merge)
    handler.selectCell({ rowIndex: 1, colIndex: 0 })
    handler.navigate({ kind: 'delta', dRow: 0, dCol: 1, extend: false }, bounds)
    expect(sel.getSelection().selectedRange).toEqual(region)
  })

  it('无 merge lookup 时 selectCell 退化为普通单格', () => {
    const sel = new DefaultSelectionState()
    const handler = new SelectionCommandHandler(sel)
    handler.selectCell({ rowIndex: 2, colIndex: 2 })
    expect(sel.getSelection().selectedRange).toEqual({
      startRow: 2,
      endRow: 2,
      startCol: 2,
      endCol: 2,
    })
  })
})
