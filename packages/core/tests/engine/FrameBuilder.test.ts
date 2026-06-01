import { describe, expect, it } from 'bun:test'
import { ChunkedAxis, FrameBuilder, InMemoryDataSource, denseGridTheme, type GridSelection } from '../../src'
import type { MergeRegion } from '../../src/merge/MergeStore'
import type { ResolvedCellFormat } from '../../src/format/CellFormat'

const data = new InMemoryDataSource({
  schema: {
    fields: [
      { id: 'a', name: 'A', type: 'text', width: 100 },
      { id: 'b', name: 'B', type: 'text', width: 100 },
      { id: 'c', name: 'C', type: 'text', width: 100 },
    ],
  },
  rows: Array.from({ length: 8 }, (_, row) => ({ a: `a${row}`, b: `b${row}`, c: `c${row}` })),
})

describe('FrameBuilder', () => {
  it('builds a render frame and projects visible collapsed gaps', () => {
    const rowsAxis = new ChunkedAxis({ count: 8, defaultSize: 20 })
    const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })
    const selection: GridSelection = {
      activeCell: { rowIndex: 2, colIndex: 1 },
      anchorCell: { rowIndex: 2, colIndex: 1 },
      extentCell: { rowIndex: 2, colIndex: 1 },
      selectedRange: { startRow: 2, endRow: 2, startCol: 1, endCol: 1 },
    }
    const mergeRegions: MergeRegion[] = [
      {
        id: 'm1',
        range: { startRow: 2, endRow: 2, startCol: 1, endCol: 2 },
        anchor: { rowIndex: 2, colIndex: 1 },
      },
    ]
    const cellFormats: ResolvedCellFormat[] = [
      { rowIndex: 2, colIndex: 1, format: { fillColor: '#fff' } },
    ]
    const resolverCalls: Array<readonly [number, number, number, number]> = []

    const frame = new FrameBuilder().build({
      data,
      theme: denseGridTheme,
      rowsAxis,
      colsAxis,
      viewport: {
        regions: [],
        contentRect: { width: 250, height: 60 },
        headerHeight: 32,
        rowHeaderWidth: 0,
        scrollX: 50,
        scrollY: 20,
        version: 1,
      },
      selection,
      cellEdit: undefined,
      collapsedRowGaps: [
        { atViewRow: 0, hiddenCount: 1, hiddenIds: [0] },
        { atViewRow: 3, hiddenCount: 2, hiddenIds: [4, 5] },
        { atViewRow: 7, hiddenCount: 1, hiddenIds: [7] },
      ],
      collapsedColGaps: [
        { atViewCol: 0, hiddenCount: 1, hiddenFieldIds: ['a'] },
        { atViewCol: 2, hiddenCount: 1, hiddenFieldIds: ['c'] },
      ],
      formatResolver: {
        mergeRegions: (firstRow, lastRow, firstCol, lastCol) => {
          resolverCalls.push([firstRow, lastRow, firstCol, lastCol])
          return mergeRegions
        },
        cellFormats: (firstRow, lastRow, firstCol, lastCol, regions) => {
          resolverCalls.push([firstRow, lastRow, firstCol, lastCol])
          expect(regions).toBe(mergeRegions)
          return cellFormats
        },
      },
    })

    expect(frame.data).toBe(data)
    expect(frame.theme).toBe(denseGridTheme)
    expect(frame.selection).toBe(selection)
    expect(frame.rowsAxis).toBe(rowsAxis)
    expect(frame.colsAxis).toBe(colsAxis)
    expect(frame.collapsedRowGaps).toEqual([
      { atViewRow: 3, hiddenCount: 2, hiddenIds: [4, 5], yPx: 60 },
    ])
    expect(frame.collapsedColGaps).toEqual([
      { atViewCol: 0, hiddenCount: 1, hiddenFieldIds: ['a'], xPx: 50 },
      { atViewCol: 2, hiddenCount: 1, hiddenFieldIds: ['c'], xPx: 150 },
    ])
    expect(frame.mergeRegions).toBe(mergeRegions)
    expect(frame.cellFormats).toBe(cellFormats)
    expect(resolverCalls).toEqual([
      [1, 4, 0, 2],
      [1, 4, 0, 2],
    ])
  })
})
