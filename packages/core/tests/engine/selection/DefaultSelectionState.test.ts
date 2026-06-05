import { describe, expect, it } from 'bun:test'
import { DefaultSelectionState } from '../../../src/engine/selection/DefaultSelectionState'
import type { GridSelection } from '../../../src/engine/selection/SelectionTypes'

describe('DefaultSelectionState', () => {
  it('点击单元格时同时设置 activeCell、anchorCell 与 selectedRange', () => {
    const selection = new DefaultSelectionState()

    selection.selectCell({ rowIndex: 2, colIndex: 3 })

    expect(selection.getSelection()).toEqual({
      activeCell: { rowIndex: 2, colIndex: 3 },
      anchorCell: { rowIndex: 2, colIndex: 3 },
      extentCell: { rowIndex: 2, colIndex: 3 },
      selectedRange: {
        startRow: 2,
        endRow: 2,
        startCol: 3,
        endCol: 3,
      },
    })
  })

  it('扩展选择时保留 activeCell/anchorCell，只移动 extentCell 并归一化 range', () => {
    const selection = new DefaultSelectionState()
    selection.selectCell({ rowIndex: 5, colIndex: 4 })

    selection.selectCell({ rowIndex: 2, colIndex: 1 }, { extend: true })

    expect(selection.getSelection()).toEqual({
      activeCell: { rowIndex: 5, colIndex: 4 },
      anchorCell: { rowIndex: 5, colIndex: 4 },
      extentCell: { rowIndex: 2, colIndex: 1 },
      selectedRange: {
        startRow: 2,
        endRow: 5,
        startCol: 1,
        endCol: 4,
      },
    })
  })

  it('restores moved row selections by row index map', () => {
    const selection = new DefaultSelectionState()
    selection.setSelection({
      activeCell: { rowIndex: 1, colIndex: 0 },
      anchorCell: { rowIndex: 1, colIndex: 0 },
      extentCell: { rowIndex: 2, colIndex: 0 },
      selectedRange: { startRow: 1, endRow: 2, startCol: 0, endCol: 0 },
    })

    selection.restoreByRowIndexMap(
      new Map([
        [1, 2],
        [2, 3],
      ]),
    )

    expect(selection.getSelection().selectedRange).toEqual({
      startRow: 2,
      endRow: 3,
      startCol: 0,
      endCol: 0,
    })
  })

  it('captures visible field ids before column move and restores by current ids', () => {
    const selection = new DefaultSelectionState()
    selection.setSelection({
      activeCell: { rowIndex: 0, colIndex: 1 },
      anchorCell: { rowIndex: 0, colIndex: 1 },
      extentCell: { rowIndex: 0, colIndex: 2 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 1, endCol: 2 },
    })

    selection.captureVisibleFieldIdsBefore(['a', 'b', 'c', 'd'])
    selection.restoreByCapturedVisibleFieldIds(['a', 'd', 'b', 'c'])

    expect(selection.getSelection().selectedRange).toEqual({
      startRow: 0,
      endRow: 0,
      startCol: 2,
      endCol: 3,
    })
  })

  it('setSelection rejects inconsistent empty and non-empty state', () => {
    const selection = new DefaultSelectionState()

    expect(() =>
      selection.setSelection({
        activeCell: null,
        anchorCell: null,
        extentCell: null,
        selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
      }),
    ).toThrow('DefaultSelectionState.setSelection')
  })

  it('clears invalid incomplete selections through the DefaultSelectionState contract', () => {
    const selection = new DefaultSelectionState()
    const empty: GridSelection = {
      activeCell: null,
      anchorCell: null,
      extentCell: null,
      selectedRange: null,
    }

    selection.setSelection(empty)

    expect(selection.getSelection()).toEqual(empty)
  })
})
