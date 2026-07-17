import { describe, expect, it } from 'bun:test'

import {
  InMemoryDataSource,
  applySelectionNavigation,
  parseSelectionNavigationKey,
  type Row,
  type GridSelection,
} from '../../../../src'

import { DefaultSelectionState } from '../../../../src/features/selection/DefaultSelectionState'
import {
  createMutableData,
  mountRecordingGrid,
  mutableSchema,
  singleCellSelection,
} from '../../_helpers/fixtures'

function dispatchGridPointerDown(target: HTMLElement, point: { x: number; y: number }): void {
  target.dispatchEvent(
    new MouseEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      button: 0,
    }),
  )
}

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

  it('core.L2.grid-frozen-pane-selection selects row/column/cell by frozen pane config', () => {
    const changes: GridSelection[] = []
    const { container, grid } = mountRecordingGrid({
      data: createMutableData(),
      frozen: { leftCols: 1, topRows: 1 },
      selectionBehavior: {
        frozenPanes: { left: 'row', top: 'column', topLeft: 'cell' },
      },
      onSelectionChange: (selection) => changes.push(selection),
    })
    const scrollHost = container.querySelector<HTMLElement>('[data-novasheet-scroll-host]')
    if (scrollHost === null) throw new Error('expected Grid scroll host')

    dispatchGridPointerDown(scrollHost, { x: 50, y: 74 })
    expect(grid.getSelection().selectedRange).toEqual({
      startRow: 1,
      endRow: 1,
      startCol: 0,
      endCol: 3,
    })
    expect(grid.getSelection().activeCell).toEqual({ rowIndex: 1, colIndex: 0 })

    dispatchGridPointerDown(scrollHost, { x: 150, y: 46 })
    expect(grid.getSelection().selectedRange).toEqual({
      startRow: 0,
      endRow: 2,
      startCol: 1,
      endCol: 1,
    })
    expect(grid.getSelection().activeCell).toEqual({ rowIndex: 0, colIndex: 1 })

    dispatchGridPointerDown(scrollHost, { x: 50, y: 46 })
    expect(grid.getSelection().selectedRange).toEqual({
      startRow: 0,
      endRow: 0,
      startCol: 0,
      endCol: 0,
    })
    expect(changes.length).toBeGreaterThanOrEqual(3)

    grid.destroy()
    document.body.removeChild(container)
  })

  it('core.L2.grid-frozen-pane-selection keeps plain cell selection when behavior omitted', () => {
    const { container, grid } = mountRecordingGrid({
      data: createMutableData(),
      frozen: { leftCols: 1, topRows: 1 },
    })
    const scrollHost = container.querySelector<HTMLElement>('[data-novasheet-scroll-host]')
    if (scrollHost === null) throw new Error('expected Grid scroll host')

    dispatchGridPointerDown(scrollHost, { x: 50, y: 74 })
    expect(grid.getSelection().selectedRange).toEqual({
      startRow: 1,
      endRow: 1,
      startCol: 0,
      endCol: 0,
    })

    grid.destroy()
    document.body.removeChild(container)
  })

  it('core.L2.grid-header-corner-select-all selects everything only when opted in', () => {
    const optIn = mountRecordingGrid({
      data: createMutableData(),
      excelHeaders: true,
      selectionBehavior: { headerCorner: 'all' },
    })
    const optInScrollHost = optIn.container.querySelector<HTMLElement>('[data-novasheet-scroll-host]')
    if (optInScrollHost === null) throw new Error('expected Grid scroll host')
    dispatchGridPointerDown(optInScrollHost, { x: 8, y: 8 })
    expect(optIn.grid.getSelection().selectedRange).toEqual({
      startRow: 0,
      endRow: 2,
      startCol: 0,
      endCol: 3,
    })
    optIn.grid.destroy()
    document.body.removeChild(optIn.container)

    const control = mountRecordingGrid({ data: createMutableData(), excelHeaders: true })
    const controlScrollHost = control.container.querySelector<HTMLElement>('[data-novasheet-scroll-host]')
    if (controlScrollHost === null) throw new Error('expected Grid scroll host')
    dispatchGridPointerDown(controlScrollHost, { x: 8, y: 8 })
    expect(control.grid.getSelection().selectedRange).toBeNull()
    control.grid.destroy()
    document.body.removeChild(control.container)
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
