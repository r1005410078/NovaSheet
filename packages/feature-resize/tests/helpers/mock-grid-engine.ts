import { mock } from 'bun:test'
import { denseGridTheme } from '@novasheet/core'
import type { DataSource, GridEngine, Theme } from '@novasheet/core'

export function makeMockGridEngine(
  options: { colWidth?: number; rowHeight?: number } = {},
): GridEngine {
  const colWidth = options.colWidth ?? 100
  const rowHeight = options.rowHeight ?? 28
  const rowCount = 10
  const colCount = 2
  const data = {
    getRowCount: () => rowCount,
    getSchema: () => ({
      fields: Array.from({ length: colCount }, (_, index) => ({
        id: `field-${index}`,
        name: `Field ${index + 1}`,
        type: 'text' as const,
        width: colWidth,
      })),
    }),
    getRows: () => [],
    getCell: () => null,
    subscribe: () => () => {},
  } satisfies DataSource
  const theme: Theme = denseGridTheme
  return {
    setViewportSize: mock((_width: number, _height: number) => {}),
    setScroll: mock((_logicalX: number, _logicalY: number) => {}),
    getColumnIndex: mock((fieldId: string) => (fieldId === 'field-0' ? 0 : -1)),
    getColsAxis: mock(
      () =>
        ({
          getCount: () => colCount,
          getSize: () => colWidth,
          getTotalSize: () => colCount * colWidth,
          indexToPosition: (index: number) => index * colWidth,
        }) as never,
    ),
    getRowsAxis: mock(
      () =>
        ({
          getCount: () => rowCount,
          getSize: () => rowHeight,
          getTotalSize: () => rowCount * rowHeight,
          indexToPosition: (index: number) => index * rowHeight,
        }) as never,
    ),
    getRowsTotalSize: mock(() => rowCount * rowHeight),
    getColsTotalSize: mock(() => colCount * colWidth),
    getTheme: mock(() => theme),
    getData: mock(() => data),
    getFrame: mock(
      () =>
        ({
          data,
          theme,
          rowsAxis: {
            getCount: () => rowCount,
            getSize: () => rowHeight,
            getTotalSize: () => rowCount * rowHeight,
            indexToPosition: (index: number) => index * rowHeight,
          },
          colsAxis: {
            getCount: () => colCount,
            getSize: () => colWidth,
            getTotalSize: () => colCount * colWidth,
            indexToPosition: (index: number) => index * colWidth,
          },
          viewport: {
            contentRect: { width: 400, height: 300 },
            headerHeight: theme.metrics.headerHeight,
            rowHeaderWidth: 0,
            scrollX: 0,
            scrollY: 0,
            version: 0,
            regions: [],
          },
          collapsedRowGaps: [],
          collapsedColGaps: [],
        }) as never,
    ),
    getSelection: mock(() => ({
      activeCell: null,
      anchorCell: null,
      extentCell: null,
      selectedRange: null,
    })),
    isCellEditing: mock(() => false),
    commitColumnResize: mock(() => {}),
    commitRowResize: mock(() => {}),
  } as unknown as GridEngine
}
