import { describe, expect, it } from 'bun:test'

import {
  InMemoryDataSource,
  applySelectionNavigation,
  parseSelectionNavigationKey,
  type Row,
} from '../../../../src'

import { DefaultSelectionState } from '../../../../src/features/selection/DefaultSelectionState'
import {
  createMutableData,
  mountRecordingGrid,
  mutableSchema,
  singleCellSelection,
} from '../../_helpers/fixtures'

describe('Core acceptance selection', () => {
function createRemapData(): InMemoryDataSource {
  return new InMemoryDataSource({
    schema: mutableSchema,
    rows: Array.from({ length: 8 }, (_, index) => ({
      a: `r${index}`,
      b: index * 10,
      c: `c${index}`,
      d: `d${index}`,
    })) satisfies Row[],
  })
}

describe('Core BDD Batch 4 selection navigation coordinates scenarios', () => {
  it('core.L2.grid-selection-set-get roundtrips selection through Grid facade', () => {
    const { container, grid } = mountRecordingGrid({ data: createMutableData() })
    const selection = singleCellSelection(1, 2)

    grid.setSelection(selection)
    const roundtrip = grid.getSelection()

    expect(roundtrip.activeCell).toEqual(selection.activeCell)
    expect(roundtrip.selectedRange).toEqual(selection.selectedRange)

    grid.destroy()
    document.body.removeChild(container)
  })

  it('core.L2.grid-selection-remap-after-insert-delete keeps selection aligned after structure changes', () => {
    const { container, grid } = mountRecordingGrid({ data: createRemapData() })

    grid.setSelection({
      activeCell: { rowIndex: 5, colIndex: 0 },
      anchorCell: { rowIndex: 5, colIndex: 0 },
      extentCell: { rowIndex: 7, colIndex: 1 },
      selectedRange: { startRow: 5, endRow: 7, startCol: 0, endCol: 1 },
    })
    grid.insertRows(3, 2)
    expect(grid.getSelection().selectedRange).toEqual({
      startRow: 7,
      endRow: 9,
      startCol: 0,
      endCol: 1,
    })

    grid.setSelection({
      activeCell: { rowIndex: 3, colIndex: 0 },
      anchorCell: { rowIndex: 3, colIndex: 0 },
      extentCell: { rowIndex: 5, colIndex: 0 },
      selectedRange: { startRow: 3, endRow: 5, startCol: 0, endCol: 0 },
    })
    grid.deleteRows([4])
    expect(grid.getSelection().selectedRange).toEqual({
      startRow: 3,
      endRow: 4,
      startCol: 0,
      endCol: 0,
    })

    grid.destroy()
    document.body.removeChild(container)
  })

  it('core.L0.selection-navigation-arrows parses keys and steps active cell', () => {
    const model = new DefaultSelectionState()
    model.selectCell({ rowIndex: 0, colIndex: 0 })
    const bounds = { rowCount: 10, colCount: 5 }

    expect(parseSelectionNavigationKey('ArrowRight', false)).toEqual({
      kind: 'delta',
      dRow: 0,
      dCol: 1,
      extend: false,
    })
    expect(parseSelectionNavigationKey('Escape', false)).toBeNull()

    const intent = parseSelectionNavigationKey('ArrowRight', false)
    if (intent === null) throw new Error('expected ArrowRight intent')
    const next = applySelectionNavigation(model, intent, bounds)
    expect(next).toEqual({ rowIndex: 0, colIndex: 1 })
    expect(model.getSelection().activeCell).toEqual({ rowIndex: 0, colIndex: 1 })
  })
})
})
