import { describe, expect, it } from 'bun:test'

import {
  ChunkedAxis,
  computeCellRect,
  computeScrollReveal,
  denseGridTheme,
  findViewRow,
  hitTestCell,
  isCellInRange,
  normalizeRange,
  rangesIntersect,
  resolveUnderlyingRow,
  unionRange,
  type DataSource,
} from '../../../src'
import {
  createHitTestFrame,
} from '../_helpers/fixtures'

describe('Core acceptance spatial utilities', () => {
  it('core.L0.coords-resolve-underlying-row maps view and raw rows', () => {
    const identitySource: DataSource = {
      getRowCount: () => 3,
      getSchema: () => ({ fields: [] }),
      getRows: () => [],
      getCell: () => undefined,
      subscribe: () => () => {},
    }
    expect(resolveUnderlyingRow(identitySource, 2)).toBe(2)
    expect(findViewRow(identitySource, 2)).toBe(2)

    const decoratedSource = {
      ...identitySource,
      resolveUnderlyingRow: (row: number) => row + 10,
      findViewRow: (row: number) => row - 10,
    }
    expect(resolveUnderlyingRow(decoratedSource, 2)).toBe(12)
    expect(findViewRow(decoratedSource, 12)).toBe(2)
  })

  it('core.L0.range-normalize-union-intersect normalizes unions and intersections', () => {
    const range = { startRow: 1, endRow: 3, startCol: 1, endCol: 3 }

    expect(normalizeRange({ startRow: 5, endRow: 2, startCol: 4, endCol: 1 })).toEqual({
      startRow: 2,
      endRow: 5,
      startCol: 1,
      endCol: 4,
    })
    expect(unionRange(range, { startRow: 0, endRow: 2, startCol: 5, endCol: 6 })).toEqual({
      startRow: 0,
      endRow: 3,
      startCol: 1,
      endCol: 6,
    })
    expect(rangesIntersect(range, { startRow: 3, endRow: 5, startCol: 3, endCol: 5 })).toBe(true)
    expect(isCellInRange(3, 3, range)).toBe(true)
    expect(isCellInRange(0, 1, range)).toBe(false)
  })

  it('core.L0.scroll-reveal-cell returns null when visible and offsets when off-screen', () => {
    const rowsAxis = new ChunkedAxis({ count: 20, defaultSize: 28 })
    const colsAxis = new ChunkedAxis({ count: 5, defaultSize: 100 })

    expect(
      computeScrollReveal({
        rowIndex: 2,
        colIndex: 1,
        rowsAxis,
        colsAxis,
        scrollX: 0,
        scrollY: 0,
        viewportWidth: 400,
        viewportHeight: 300,
        headerHeight: 32,
        rowHeaderWidth: 0,
      }),
    ).toBeNull()

    const revealRow = computeScrollReveal({
      rowIndex: 15,
      colIndex: 0,
      rowsAxis,
      colsAxis,
      scrollX: 0,
      scrollY: 0,
      viewportWidth: 400,
      viewportHeight: 300,
      headerHeight: 32,
      rowHeaderWidth: 0,
    })
    expect(revealRow?.logicalY).toBe(
      rowsAxis.indexToPosition(15) + rowsAxis.getSize(15) - (300 - 32),
    )

    const revealCol = computeScrollReveal({
      rowIndex: 0,
      colIndex: 4,
      rowsAxis,
      colsAxis,
      scrollX: 0,
      scrollY: 0,
      viewportWidth: 250,
      viewportHeight: 300,
      headerHeight: 32,
      rowHeaderWidth: 44,
    })
    const cellRight = colsAxis.indexToPosition(4) + colsAxis.getSize(4)
    expect(revealCol?.logicalX).toBe(cellRight - (250 - 44))
  })

  it('core.L0.cell-hit-test resolves body cells and computeCellRect geometry', () => {
    const frame = createHitTestFrame()

    expect(hitTestCell(frame, { x: 120, y: 16 })).toBeNull()
    expect(hitTestCell(frame, { x: 220, y: 72 })).toEqual({
      rowIndex: 2,
      colIndex: 2,
    })

    const rect = computeCellRect(frame, { rowIndex: 2, colIndex: 2 })
    expect(rect).not.toBeNull()
    expect(rect!.width).toBe(100)
    expect(rect!.height).toBe(denseGridTheme.metrics.rowHeight)
    expect(rect!.y).toBeGreaterThanOrEqual(denseGridTheme.metrics.headerHeight)
  })
})
