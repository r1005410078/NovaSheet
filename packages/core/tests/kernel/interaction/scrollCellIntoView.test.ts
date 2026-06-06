import { describe, expect, it } from 'bun:test'
import { ChunkedAxis } from '../../../src/kernel/geometry/ChunkedAxis'
import { computeScrollReveal } from '../../../src/kernel/interaction/scrollCellIntoView'

describe('computeScrollReveal — Phase 3.3', () => {
  const rowsAxis = new ChunkedAxis({ count: 20, defaultSize: 28 })
  const colsAxis = new ChunkedAxis({ count: 5, defaultSize: 100 })

  it('单元格已在视口内时不滚动', () => {
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
  })

  it('行在视口下方时向下滚动', () => {
    const reveal = computeScrollReveal({
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
    expect(reveal?.logicalY).toBe(rowsAxis.indexToPosition(15) + rowsAxis.getSize(15) - (300 - 32))
  })

  it('列在视口右侧时向右滚动', () => {
    const reveal = computeScrollReveal({
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
    const visibleW = 250 - 44
    expect(reveal?.logicalX).toBe(cellRight - visibleW)
  })
})
