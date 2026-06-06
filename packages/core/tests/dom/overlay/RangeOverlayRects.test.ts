import { describe, expect, it } from 'bun:test'
import {
  computeFillHandleRect,
  computeRangeOverlayRects,
} from '../../../src/dom/overlay/RangeOverlayRects'
import type { RenderFrame } from '@novasheet/core'

describe('RangeOverlayRects', () => {
  it('computes visible rect for range intersection with region', () => {
    const frame = makeFrame()
    expect(
      computeRangeOverlayRects(frame, { startRow: 1, endRow: 2, startCol: 1, endCol: 2 }),
    ).toEqual([{ x: 100, y: 60, width: 200, height: 60 }])
  })

  it('returns empty when range is outside visible region', () => {
    expect(
      computeRangeOverlayRects(makeFrame(), { startRow: 20, endRow: 21, startCol: 0, endCol: 1 }),
    ).toEqual([])
  })

  it('clips partially scrolled rects to the visible region rect', () => {
    const frame = makeFrame({
      regions: [
        {
          id: 'main',
          rowBand: 'middle',
          colBand: 'center',
          rowRange: [0, 1],
          colRange: [0, 1],
          rect: { x: 40, y: 32, width: 160, height: 56 },
          scrollOffsetX: 15,
          scrollOffsetY: 10,
          zIndex: 0,
        },
      ],
    })

    expect(
      computeRangeOverlayRects(frame, { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }),
    ).toEqual([{ x: 40, y: 32, width: 85, height: 20 }])
  })

  it('anchors fill handle at bottom-right of the visible source range', () => {
    expect(
      computeFillHandleRect(makeFrame(), { startRow: 1, endRow: 2, startCol: 1, endCol: 2 }),
    ).toEqual({
      x: 296,
      y: 116,
      width: 8,
      height: 8,
    })
  })
})

function makeFrame(overrides: Partial<RenderFrame['viewport']> = {}): RenderFrame {
  return {
    data: { getSchema: () => ({ fields: [] }) } as never,
    theme: { metrics: { headerHeight: 30 } } as never,
    rowsAxis: {
      indexToPosition: (i: number) => i * 30,
      getSize: () => 30,
    } as never,
    colsAxis: {
      indexToPosition: (i: number) => i * 100,
      getSize: () => 100,
    } as never,
    viewport: {
      contentRect: { width: 400, height: 300 },
      scrollX: 0,
      scrollY: 0,
      headerHeight: 30,
      rowHeaderWidth: 0,
      regions: [
        {
          id: 'main',
          rowBand: 'middle',
          colBand: 'center',
          rowRange: [0, 9],
          colRange: [0, 3],
          rect: { x: 0, y: 30, width: 400, height: 270 },
          scrollOffsetX: 0,
          scrollOffsetY: 0,
          zIndex: 0,
        },
      ],
      ...overrides,
    },
    selection: undefined,
  } as unknown as RenderFrame
}
