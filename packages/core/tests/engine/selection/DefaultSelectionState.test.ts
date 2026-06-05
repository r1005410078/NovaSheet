import { describe, expect, it } from 'bun:test'
import { DefaultSelectionState } from '../../../src/engine/selection/DefaultSelectionState'
import type { GridSelection } from '../../../src/interaction/SelectionModel'

describe('DefaultSelectionState', () => {
  it('wraps basic selection model operations', () => {
    const selection = new DefaultSelectionState()

    selection.selectCell({ rowIndex: 1, colIndex: 2 })

    expect(selection.getSelection().selectedRange).toEqual({
      startRow: 1,
      endRow: 1,
      startCol: 2,
      endCol: 2,
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

  it('clears invalid incomplete selections through the same contract as SelectionModel', () => {
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
