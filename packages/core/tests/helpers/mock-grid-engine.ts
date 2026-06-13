// NOTE: 与 packages/canvas2d/tests/helpers/mock-grid-engine.ts 保持同步（测试 helper 不跨包共享）。
import { mock } from 'bun:test'
import { denseGridTheme } from '@novasheet/core'
import type {
  Axis,
  CellRange,
  DataSource,
  FillDirection,
  FrozenConfig,
  GridEngine,
  GridSelection,
  RenderFrame,
  Schema,
  Theme,
  Viewport,
} from '@novasheet/core'

export interface MockGridEngineOptions {
  readonly selection?: GridSelection
  readonly data?: DataSource
  readonly frame?: RenderFrame
  readonly rowCount?: number
  readonly colCount?: number
  readonly rowHeight?: number
  readonly colWidth?: number
  readonly theme?: Theme
  readonly overrides?: Partial<GridEngine>
}

const defaultSelection: GridSelection = {
  activeCell: null,
  anchorCell: null,
  extentCell: null,
  selectedRange: null,
}

/** 类型完整的 GridEngine 测试工厂；新增接口方法时本文件应编译失败。 */
export function makeMockGridEngine(options: MockGridEngineOptions = {}): GridEngine {
  const rowCount = options.rowCount ?? 10
  const colCount = options.colCount ?? 2
  const rowHeight = options.rowHeight ?? 30
  const colWidth = options.colWidth ?? 100
  const theme = options.theme ?? denseGridTheme
  const selection = options.selection ?? defaultSelection
  const data = options.data ?? makeMockDataSource(rowCount, colCount)
  const rowsAxis = makeAxis(rowCount, rowHeight)
  const colsAxis = makeAxis(colCount, colWidth)
  const frame =
    options.frame ??
    ({
      data,
      theme,
      rowsAxis,
      colsAxis,
      viewport: {
        contentRect: { width: 400, height: 300 },
        headerHeight: theme.metrics.headerHeight,
        rowHeaderWidth: 0,
        scrollX: 0,
        scrollY: 0,
        version: 0,
        regions: [
          {
            id: 'main',
            rowBand: 'middle',
            colBand: 'center',
            rowRange: [0, rowCount - 1],
            colRange: [0, colCount - 1],
            rect: { x: 0, y: theme.metrics.headerHeight, width: colCount * colWidth, height: 270 },
            scrollOffsetX: 0,
            scrollOffsetY: 0,
            zIndex: 0,
          },
        ],
      },
      collapsedRowGaps: [],
      collapsedColGaps: [],
      selection,
    } satisfies RenderFrame)
  const setFrozen = mock((_config: Partial<FrozenConfig>) => {}) as GridEngine['setFrozen']

  const engine = {
    setData: mock((_data: DataSource) => {}),
    setViewData: mock((_data: DataSource, _options?: Parameters<GridEngine['setViewData']>[1]) => {}),
    resizeExcelWorkspace: mock(() => false),
    setTheme: mock((_theme: Theme) => {}),
    setFrozen,
    setViewportSize: mock((_width: number, _height: number) => {}),
    setHeaderHeight: mock((_headerHeight: number) => {}),
    setScroll: mock((_logicalX: number, _logicalY: number) => {}),
    getRowHeight: mock((_rowIndex: number) => rowHeight),
    setRowHeight: mock((_rowIndex: number, _height: number) => {}),
    setColumnWidth: mock((_fieldId: string, _width: number) => {}),
    selectCell: mock((_cell, _selectOptions) => {}),
    navigateSelection: mock((_key: string, _shiftKey: boolean) => false),
    beginCellEdit: mock((_cell) => false),
    updateCellEditDraft: mock((_draft: string) => {}),
    cancelCellEdit: mock(() => {}),
    commitCellEdit: mock(() => true),
    commitCellValue: mock((_cell, _fieldId, _value) => true),
    isCellEditing: mock(() => false),
    clearRange: mock((_range: CellRange) => {}),
    clearSelection: mock(() => {}),
    getFrame: mock(() => frame),
    getSelection: mock(() => selection),
    getRowsTotalSize: mock(() => rowCount * rowHeight),
    getColsTotalSize: mock(() => colCount * colWidth),
    getColumnIndex: mock((fieldId: string) => data.getSchema().fields.findIndex((field) => field.id === fieldId)),
    getTheme: mock(() => theme),
    getRowsAxis: mock(() => rowsAxis),
    getColsAxis: mock(() => colsAxis),
    getViewport: mock(
      () =>
        ({
          ...frame.viewport,
          getRowHeaderWidth: () => frame.viewport.rowHeaderWidth,
        }) as unknown as Viewport,
    ),
    getData: mock(() => data),
    undo: mock(() => undefined),
    redo: mock(() => undefined),
    canUndo: mock(() => false),
    canRedo: mock(() => false),
    commitColumnResize: mock((_colIndex: number, _oldWidth: number, _newWidth: number) => {}),
    commitRowResize: mock((_rowIndex: number, _oldHeight: number, _newHeight: number) => {}),
    commitPaste: mock(() => {}),
    commitFill: mock((source: CellRange, fill: CellRange, direction: FillDirection) => ({
      source,
      fill,
      result: {
        startRow: Math.min(source.startRow, fill.startRow),
        endRow: Math.max(source.endRow, fill.endRow),
        startCol: Math.min(source.startCol, fill.startCol),
        endCol: Math.max(source.endCol, fill.endCol),
      },
      direction,
      writes: [],
    })),
    getFillMergeSnap: mock((_source: CellRange) => ({ rowSpan: 1, colSpan: 1 })),
    unhideRows: mock((_underlyingRowIds: readonly number[]) => {}),
    getHiddenRows: mock(() => [] as readonly number[]),
    insertRows: mock((_beforeUnderlyingRow: number, _count: number) => [] as readonly number[]),
    deleteRows: mock((_underlyingRowIds: readonly number[]) => {}),
    hideRows: mock((_underlyingRowIds: readonly number[]) => {}),
    setRowHeights: mock((_rowIds: readonly number[], _height: number) => {}),
    moveRows: mock((_rowIds: readonly number[], _beforeRowId: number | null) => false),
    setSelection: mock((_selection: GridSelection) => {}),
    insertCols: mock((_beforeFieldIndex: number, _count: number) => []),
    deleteCols: mock((_fieldIds: readonly string[]) => []),
    hideCols: mock((_fieldIds: readonly string[]) => {}),
    unhideCols: mock((_fieldIds: readonly string[]) => {}),
    setColumnWidths: mock((_fieldIds: readonly string[], _widthPx: number) => {}),
    getHiddenCols: mock(() => [] as readonly string[]),
    getFrozenConfig: mock(() => ({ topRows: 0, leftCols: 0, rightCols: 0 })),
    moveCols: mock((_fieldIds: readonly string[], _beforeFieldId: string | null) => false),
    setFillColor: mock((_range: CellRange, _color: string | null) => false),
    setBorders: mock((_range, _preset, _border) => false),
    setValueFormat: mock((_range, _valueFormat) => false),
    setTextWrap: mock((_range, _mode) => false),
    getCellFormat: mock((_rowIndex: number, _colIndex: number) => undefined),
    getViewCellFormat: mock((_viewRow: number, _viewCol: number) => undefined),
    mergeCells: mock((_range: CellRange) => false),
    unmergeCells: mock((_range: CellRange) => false),
    getMergeRegion: mock((_rowIndex: number, _colIndex: number) => null),
    getViewMergeRegion: mock((_viewRow: number, _viewCol: number) => null),
    setCellAttachment: mock((_namespace: string, _rawRow: number, _rawCol: number, _data: unknown) => false),
    getCellAttachment: mock((_namespace: string, _rawRow: number, _rawCol: number): unknown => undefined),
    viewRowToRaw: mock((viewRow: number) => viewRow),
    viewColToRaw: mock((viewCol: number) => viewCol),
  } satisfies GridEngine

  return Object.assign(engine, options.overrides)
}

function makeMockDataSource(rowCount: number, colCount: number): DataSource {
  const schema: Schema = {
    fields: Array.from({ length: colCount }, (_, index) => ({
      id: `field-${index}`,
      name: `Field ${index + 1}`,
      type: 'text',
      width: 100,
    })),
  }
  return {
    getRowCount: () => rowCount,
    getSchema: () => schema,
    getRows: () => [],
    getCell: () => null,
    subscribe: () => () => {},
  }
}

function makeAxis(count: number, size: number): Axis {
  return {
    version: 0,
    getTotalSize: () => count * size,
    getCount: () => count,
    getDefaultSize: () => size,
    getSize: (index: number) => (index >= 0 && index < count ? size : 0),
    indexToPosition: (index: number) => Math.max(0, Math.min(index, count)) * size,
    positionToIndex: (position: number) =>
      Math.max(0, Math.min(count - 1, Math.floor(position / size))),
    getVisibleRange: () => [0, Math.max(-1, count - 1)],
  }
}
