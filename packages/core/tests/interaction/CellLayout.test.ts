import { describe, expect, it } from 'bun:test'
import { ChunkedAxis } from '../../src/geometry/ChunkedAxis'
import { FrozenRegions } from '../../src/geometry/FrozenRegions'
import { Viewport } from '../../src/geometry/Viewport'
import { denseGridTheme } from '../../src/theme/denseGridTheme'
import { computeCellRect } from '../../src/interaction/CellLayout'
import type { RenderFrame } from '../../src/render/RenderFrame'

function makeFrame(): RenderFrame {
  const rowsAxis = new ChunkedAxis({ count: 10, defaultSize: 28 })
  const colsAxis = new ChunkedAxis({ count: 4, defaultSize: 100 })
  const frozen = new FrozenRegions(rowsAxis, colsAxis, { topRows: 0, leftCols: 1, rightCols: 0 })
  const viewport = new Viewport(rowsAxis, colsAxis, frozen)
  viewport.setSize(400, 300)
  viewport.setHeaderHeight(32)
  viewport.setScroll(0, 0)
  return {
    data: { getSchema: () => ({ fields: [] }) } as never,
    theme: denseGridTheme,
    rowsAxis,
    colsAxis,
    viewport: viewport.snapshot(),
    collapsedRowGaps: [],
    collapsedColGaps: [],
  }
}

describe('computeCellRect — Phase 3.5', () => {
  it('返回 body 单元格在 scrollHost 内的矩形', () => {
    const frame = makeFrame()
    const rect = computeCellRect(frame, { rowIndex: 2, colIndex: 1 })
    expect(rect).not.toBeNull()
    expect(rect!.width).toBe(100)
    expect(rect!.height).toBe(28)
    expect(rect!.y).toBeGreaterThanOrEqual(32)
  })
})
