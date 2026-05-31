import { describe, expect, it, mock } from 'bun:test'
import type { DataSource, GridEngine, GridSelection, Theme } from '@novasheet/core'
import { FillHandleDrag } from '../../../src/interaction/drag/FillHandleDrag'
import type { DomFillHandleLayer } from '../../../src/interaction/DomFillHandleLayer'
import type { OverlayRect } from '../../../src/interaction/RangeOverlayRects'
import type { WebHost, WebPointerEvent } from '../../../src/host/WebHost'

describe('FillHandleDrag', () => {
  it('uses host-local pointer coordinates to preview, commit, and emit fill', () => {
    const engine = makeEngine()
    const fillLayer = makeFillLayer()
    const afterEngineMutation = mock(() => {})
    const onFill = mock(() => {})
    const drag = new FillHandleDrag({
      engine,
      host: makeHost({ left: 100, top: 80 }),
      fillLayer,
      afterEngineMutation,
      autofitRows: mock(() => ({ changedRows: 0, skippedRows: 0 })),
      onFill,
      closeContextMenu: mock(() => {}),
      commitCellEdit: mock(() => {}),
      requestAutoScroll: mock((_pointer: WebPointerEvent) => {}),
      stopAutoScroll: mock(() => {}),
      isBlocked: () => false,
    })

    expect(drag.tryStartFromClient(1, 250, 170)).toBe(true)
    expect(drag.moveFromClient(1, 250, 230)).toBe(true)
    expect(drag.commitPointer(1)).toBe(true)

    expect(fillLayer.showPreview).toHaveBeenCalled()
    expect(engine.commitFill).toHaveBeenCalled()
    expect(afterEngineMutation).toHaveBeenCalled()
    expect(onFill).toHaveBeenCalledWith({
      source: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
      fill: { startRow: 2, endRow: 4, startCol: 0, endCol: 1 },
      result: { startRow: 0, endRow: 4, startCol: 0, endCol: 1 },
      direction: 'down',
    })
  })
})

function makeFillLayer() {
  return {
    sync: mock((_rect: OverlayRect | null) => {}),
    showPreview: mock((_rects: readonly OverlayRect[]) => {}),
    hidePreview: mock(() => {}),
  } as unknown as DomFillHandleLayer
}

function makeEngine(
  selection: GridSelection = {
    activeCell: { rowIndex: 0, colIndex: 0 },
    anchorCell: { rowIndex: 0, colIndex: 0 },
    extentCell: { rowIndex: 1, colIndex: 1 },
    selectedRange: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
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
    getSelection: mock(() => selection),
    getFrame: mock(() => frame),
    getData: mock(() => data),
    isCellEditing: mock(() => false),
    commitFill: mock((source, fill, direction) => ({
      source,
      fill,
      result: { startRow: 0, endRow: 4, startCol: 0, endCol: 1 },
      direction,
      writes: [],
    })),
    getFillMergeSnap: mock(() => ({ rowSpan: 1, colSpan: 1 })),
  } as unknown as GridEngine
}

function makeHost(offset: { left: number; top: number }): WebHost {
  return {
    getContainerBoundingRect: () => offset,
  } as unknown as WebHost
}
