import { mock } from 'bun:test'
import type {
  CellAddress,
  CellValue,
  DataSource,
  GridEngine,
  GridSelection,
  Theme,
} from '@novasheet/core'
import type { WebHost } from '../../../src/host/WebHost'
import type { WebRenderer } from '../../../src/render/WebRenderer'

export function makeEngine(): GridEngine {
  return {
    setData: mock(() => {}),
    setViewData: mock(() => {}),
    setTheme: mock(() => {}),
    setFrozen: mock(() => {}),
    setViewportSize: mock(() => {}),
    setHeaderHeight: mock(() => {}),
    setScroll: mock(() => {}),
    setRowHeight: mock(() => {}),
    getRowHeight: mock(() => 28),
    setColumnWidth: mock(() => {}),
    selectCell: mock(() => {}),
    navigateSelection: mock(() => false),
    beginCellEdit: mock(() => false),
    updateCellEditDraft: mock(() => {}),
    cancelCellEdit: mock(() => {}),
    commitCellEdit: mock(() => false),
    setCellValue: mock((_cell: CellAddress, _value: CellValue) => false),
    isCellEditing: mock(() => false),
    clearRange: mock(() => {}),
    clearSelection: mock(() => {}),
    getSelection: mock(
      () =>
        ({
          activeCell: null,
          anchorCell: null,
          extentCell: null,
          selectedRange: null,
        }) satisfies GridSelection,
    ),
    getFrame: mock(() => ({
      data: {} as DataSource,
      theme: { metrics: { headerHeight: 32 } } as Theme,
      rowsAxis: {
        getCount: () => 10,
        positionToIndex: (pos: number) => Math.floor(pos / 28),
      } as never,
      colsAxis: {
        positionToIndex: (pos: number) => Math.floor(pos / 100),
      } as never,
      viewport: {
        contentRect: { width: 400, height: 300 },
        regions: [
          {
            id: 'main',
            rowBand: 'middle',
            colBand: 'center',
            rowRange: [0, 9],
            colRange: [0, 2],
            rect: { x: 0, y: 32, width: 300, height: 268 },
            scrollOffsetX: 0,
            scrollOffsetY: 0,
            zIndex: 10,
          },
        ],
      } as never,
      collapsedRowGaps: [],
      collapsedColGaps: [],
    })),
    getRowsTotalSize: () => 280,
    getColsTotalSize: () => 200,
    getColumnIndex: () => 0,
    getTheme: () => ({ metrics: { headerHeight: 32, rowHeight: 28 } }) as Theme,
    getRowsAxis: () =>
      ({
        getCount: () => 10,
        indexToPosition: (i: number) => i * 28,
        getSize: () => 28,
      }) as never,
    getColsAxis: () =>
      ({
        indexToPosition: () => 0,
      }) as never,
    getViewport: mock(() => ({}) as never),
    getData: mock(() => ({}) as never),
    undo: mock(() => undefined),
    redo: mock(() => undefined),
    canUndo: mock(() => false),
    canRedo: mock(() => false),
    commitRowResize: mock(() => {}),
    commitColumnResize: mock(() => {}),
    commitPaste: mock(() => {}),
    commitFill: mock(() => null),
    getFillMergeSnap: mock(() => ({ rowSpan: 1, colSpan: 1 })),
    unhideRows: mock(() => {}),
    getHiddenRows: mock(() => [] as readonly number[]),
    insertRows: mock(() => [] as readonly number[]),
    deleteRows: mock(() => {}),
    hideRows: mock(() => {}),
    setRowHeights: mock(() => {}),
    setSelection: mock(() => {}),
    insertCols: mock(() => [] as never),
    deleteCols: mock(() => [] as never),
    hideCols: mock(() => {}),
    unhideCols: mock(() => {}),
    setColumnWidths: mock(() => {}),
    getHiddenCols: mock(() => [] as readonly string[]),
    getFrozenConfig: mock(() => ({ topRows: 0, leftCols: 0, rightCols: 0 })),
    moveCols: mock(() => false),
    moveRows: mock(() => false),
    setFillColor: mock(() => false),
    setBorders: mock(() => false),
    setTextWrap: mock(() => false),
    getCellFormat: mock(() => undefined),
    mergeCells: mock(() => false),
    unmergeCells: mock(() => false),
    getMergeRegion: mock(() => null),
  }
}

export function makeHost(): WebHost {
  return {
    attach: mock(() => {}),
    applyScrollbarTheme: mock(() => {}),
    setScrollSize: mock(() => {}),
    setCursor: mock(() => {}),
    scrollTo: mock(() => {}),
    getDpr: () => 1,
    getContainerSize: () => ({ width: 400, height: 300 }),
    getContainerBoundingRect: () => ({ left: 0, top: 0 }),
    getScrollPosition: () => ({ scrollTop: 0, scrollLeft: 0 }),
    focusScrollHost: mock(() => {}),
    destroy: mock(() => {}),
    container: document.createElement('div'),
  }
}

export function makeRenderer(): WebRenderer {
  return {
    mount: mock(() => {}),
    resize: mock(() => {}),
    render: mock(() => {}),
    destroy: mock(() => {}),
  }
}
