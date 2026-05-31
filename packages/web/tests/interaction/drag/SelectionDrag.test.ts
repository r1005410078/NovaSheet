import { describe, expect, it, mock } from 'bun:test'
import type { DataSource, GridEngine, GridSelection, Theme } from '@novasheet/core'
import { SelectionDrag } from '../../../src/interaction/drag/SelectionDrag'
import type { WebPointerEvent } from '../../../src/host/WebHost'

describe('SelectionDrag', () => {
  it('selects on pointerdown, extends on move, and only becomes active after move', () => {
    const engine = makeEngine()
    const refresh = mock(() => {})
    const requestAutoScroll = mock((_pointer: WebPointerEvent) => {})
    const stopAutoScroll = mock(() => {})
    const syncFillHandle = mock(() => {})
    const drag = new SelectionDrag({
      engine,
      refresh,
      requestAutoScroll,
      stopAutoScroll,
      syncFillHandle,
      isBlocked: () => false,
    })

    expect(drag.tryStart({ x: 50, y: 45, shiftKey: false, button: 0 })).toBe(true)
    expect(drag.active).toBe(false)
    expect(engine.selectCell).toHaveBeenCalledWith({ rowIndex: 0, colIndex: 0 })

    expect(drag.move({ x: 150, y: 105, shiftKey: false })).toBe(true)
    expect(drag.active).toBe(true)
    expect(engine.selectCell).toHaveBeenLastCalledWith({ rowIndex: 2, colIndex: 1 }, { extend: true })
    expect(requestAutoScroll).toHaveBeenCalled()

    drag.commit()
    expect(stopAutoScroll).toHaveBeenCalled()
    expect(syncFillHandle).toHaveBeenCalled()
  })
})

function makeEngine(
  selection: GridSelection = {
    activeCell: { rowIndex: 0, colIndex: 0 },
    anchorCell: { rowIndex: 0, colIndex: 0 },
    extentCell: { rowIndex: 0, colIndex: 0 },
    selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
  },
): GridEngine {
  const data = {
    getRowCount: () => 10,
    getSchema: () => ({
      fields: [
        { id: 'a', name: 'A', type: 'text', width: 100 },
        { id: 'b', name: 'B', type: 'number', width: 100 },
      ],
    }),
    getRows: () => [],
    getCell: () => null,
    subscribe: () => () => {},
  } as unknown as DataSource
  const frame = {
    data,
    theme: { metrics: { headerHeight: 30 } } as Theme,
    rowsAxis: {
      getCount: () => 10,
      indexToPosition: (i: number) => i * 30,
      positionToIndex: (pos: number) => Math.floor(pos / 30),
      getSize: () => 30,
    } as never,
    colsAxis: {
      getCount: () => 2,
      indexToPosition: (i: number) => i * 100,
      positionToIndex: (pos: number) => Math.floor(pos / 100),
      getSize: () => 100,
    } as never,
    viewport: {
      contentRect: { width: 400, height: 300 },
      regions: [
        {
          id: 'main',
          rowBand: 'middle',
          colBand: 'center',
          rowRange: [0, 9],
          colRange: [0, 1],
          rect: { x: 0, y: 30, width: 200, height: 270 },
          scrollOffsetX: 0,
          scrollOffsetY: 0,
          zIndex: 0,
        },
      ],
    },
    selection,
  } as {
    rowsAxis: never
    colsAxis: never
  }
  return {
    selectCell: mock(() => {}),
    getFrame: mock(() => frame),
  } as unknown as GridEngine
}
