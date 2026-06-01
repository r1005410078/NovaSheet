import { describe, expect, it } from 'bun:test'
import { ChunkedAxis, FrozenRegions, Viewport, ViewportRebuilder } from '../../src'

describe('ViewportRebuilder', () => {
  it('rebuilds frozen regions and viewport while preserving viewport state', () => {
    const oldRows = new ChunkedAxis({ count: 4, defaultSize: 20 })
    const oldCols = new ChunkedAxis({ count: 4, defaultSize: 80 })
    const oldFrozen = new FrozenRegions(oldRows, oldCols, {
      topRows: 1,
      leftCols: 1,
      rightCols: 1,
    })
    const oldViewport = new Viewport(oldRows, oldCols, oldFrozen)
    oldViewport.setHeaderHeight(32)
    oldViewport.setRowHeaderWidth(44)
    oldViewport.setSize(320, 180)
    oldViewport.setScroll(80, 40)

    const rowsAxis = new ChunkedAxis({ count: 2, defaultSize: 30 })
    const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })

    const rebuilt = new ViewportRebuilder().rebuild({
      rowsAxis,
      colsAxis,
      previousViewport: oldViewport,
      frozenConfig: oldFrozen.getFrozenConfig(),
    })

    expect(rebuilt.frozen.getFrozenConfig()).toEqual({
      topRows: 1,
      leftCols: 1,
      rightCols: 1,
    })
    expect(rebuilt.viewport.snapshot()).toMatchObject({
      contentRect: { width: 320, height: 180 },
      headerHeight: 32,
      rowHeaderWidth: 44,
      scrollX: 80,
      scrollY: 40,
    })
    expect(rebuilt.viewport.snapshot().regions.at(0)?.rowRange[1]).toBeLessThan(rowsAxis.getCount())
  })
})
