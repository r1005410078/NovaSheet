import { describe, expect, it } from 'bun:test'
import type { RenderFrame } from '@novasheet/core'
import { computeFillHandleRect } from '../src'

describe('computeFillHandleRect', () => {
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

  it('returns null when range is outside the visible region', () => {
    expect(
      computeFillHandleRect(makeFrame(), { startRow: 20, endRow: 21, startCol: 0, endCol: 1 }),
    ).toBeNull()
  })
})

function makeFrame(): RenderFrame {
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
    },
    selection: undefined,
  } as unknown as RenderFrame
}
