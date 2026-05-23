import { describe, expect, it, mock } from 'bun:test'
import {
  denseGridTheme,
  type DataSource,
  type GridEngine,
  type GridSelection,
  type Theme,
} from '@novasheet/core'
import { WebGridRuntime } from '../../src/runtime/WebGridRuntime'
import type { WebHost } from '../../src/host/WebHost'
import type { WebRenderer } from '../../src/render/WebRenderer'
import type { DomFillHandleLayer } from '../../src/interaction/DomFillHandleLayer'
import type { OverlayRect } from '../../src/interaction/RangeOverlayRects'

describe('WebGridRuntime fill handle', () => {
  it('syncs fill handle after render when selection exists', () => {
    const fillLayer = makeFillLayer()
    const engine = makeEngine()
    const runtime = new WebGridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      fillLayer,
    })
    ;(runtime as unknown as { syncFillHandle(): void }).syncFillHandle()
    expect(fillLayer.sync).toHaveBeenCalled()
  })

  it('resyncs fill handle when pointer selection ends', () => {
    const fillLayer = makeFillLayer()
    const engine = makeEngine()
    const runtime = new WebGridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      fillLayer,
    })

    runtime.handleHostPointerDown({ x: 50, y: 45, shiftKey: false })
    runtime.handleHostPointerUp()

    expect(fillLayer.sync).toHaveBeenLastCalledWith({
      x: 196,
      y: 86,
      width: 8,
      height: 8,
    })
  })

  it('syncs fill handle in the same render as pointer selection', () => {
    const fillLayer = makeFillLayer()
    const engine = makeEngine()
    const runtime = new WebGridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      fillLayer,
    })
    const rafs: Array<FrameRequestCallback> = []
    const originalRaf = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafs.push(cb)
      return rafs.length
    }) as typeof requestAnimationFrame

    runtime.handleHostPointerDown({ x: 50, y: 45, shiftKey: false })
    rafs[rafs.length - 1]!(performance.now())

    expect(fillLayer.sync).toHaveBeenLastCalledWith({
      x: 196,
      y: 86,
      width: 8,
      height: 8,
    })

    globalThis.requestAnimationFrame = originalRaf
  })

  it('drag commits fill target and emits onFill', () => {
    const engine = makeEngine()
    const fillLayer = makeFillLayer()
    const runtime = new WebGridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      fillLayer,
    })
    const onFill = mock(() => {})
    runtime.setOnFill(onFill)

    runtime.handleFillPointerDown(1, 150, 90)
    runtime.handleFillPointerMove(1, 150, 150)
    runtime.handleFillPointerUp(1)

    expect(engine.commitFill).toHaveBeenCalled()
    expect(onFill).toHaveBeenCalled()
  })

  it('uses local pointer coordinates for fill drag hit testing', () => {
    const engine = makeEngine()
    const runtime = new WebGridRuntime({
      engine,
      host: makeHost({ left: 100, top: 80 }),
      renderer: makeRenderer(),
      fillLayer: makeFillLayer(),
    })

    runtime.handleFillPointerDown(1, 250, 170)
    runtime.handleFillPointerMove(1, 250, 230)
    runtime.handleFillPointerUp(1)

    expect(engine.commitFill).toHaveBeenCalled()
  })

  it('does not enter fill drag without a selected range', () => {
    const engine = makeEngine({
      selectedRange: null,
      activeCell: null,
      anchorCell: null,
      extentCell: null,
    })
    const runtime = new WebGridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      fillLayer: makeFillLayer(),
    })
    runtime.handleFillPointerDown(1, 0, 0)
    runtime.handleFillPointerMove(1, 0, 150)
    runtime.handleFillPointerUp(1)
    expect(engine.commitFill).not.toHaveBeenCalled()
  })

  it('autofits rows touched by filled wrap text', () => {
    const engine = makeEngine()
    const frame = engine.getFrame() as { data: DataSource; theme: Theme }
    frame.theme = denseGridTheme
    frame.data = {
      getRowCount: () => 10,
      getSchema: () => ({
        fields: [
          { id: 'a', name: 'A', type: 'text', width: 44, wrap: true },
          { id: 'b', name: 'B', type: 'number', width: 100 },
        ],
      }),
      getRows: () => [],
      getCell: (rowIndex: number, fieldId: string) =>
        rowIndex === 2 && fieldId === 'a' ? 'filled text needs several wrapped lines' : null,
      subscribe: () => () => {},
    } as unknown as DataSource
    engine.commitFill = mock((source, fill) => ({
      source,
      fill,
      result: { startRow: 0, endRow: 2, startCol: 0, endCol: 0 },
      writes: [{ rowIndex: 2, fieldId: 'a', value: 'filled text needs several wrapped lines' }],
    }))
    const runtime = new WebGridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      fillLayer: makeFillLayer(),
      measurer: { measureWidth: (text) => text.length * 7 },
    })

    runtime.handleFillPointerDown(1, 50, 45)
    runtime.handleFillPointerMove(1, 50, 90)
    runtime.handleFillPointerUp(1)

    expect(engine.setRowHeight).toHaveBeenCalledWith(2, expect.any(Number))
    expect((engine.setRowHeight as ReturnType<typeof mock>).mock.calls[0]?.[1]).toBeGreaterThan(
      denseGridTheme.metrics.rowHeight,
    )
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
    setData: mock(() => {}),
    setViewData: mock(() => {}),
    setTheme: mock(() => {}),
    setFrozen: mock(() => {}),
    setViewportSize: mock(() => {}),
    setHeaderHeight: mock(() => {}),
    setScroll: mock(() => {}),
    setRowHeight: mock(() => {}),
    setColumnWidth: mock(() => {}),
    selectCell: mock(() => {}),
    navigateSelection: mock(() => false),
    beginCellEdit: mock(() => false),
    updateCellEditDraft: mock(() => {}),
    cancelCellEdit: mock(() => {}),
    commitCellEdit: mock(() => true),
    isCellEditing: mock(() => false),
    clearRange: mock(() => {}),
    clearSelection: mock(() => {}),
    getSelection: mock(() => selection),
    getFrame: mock(() => frame),
    getRowsTotalSize: () => 300,
    getColsTotalSize: () => 200,
    getColumnIndex: () => 0,
    getTheme: () => ({ metrics: { headerHeight: 30 } }) as Theme,
    getRowsAxis: () => frame.rowsAxis,
    getColsAxis: () => frame.colsAxis,
    getViewport: mock(() => ({}) as never),
    getData: mock(() => data),
    undo: mock(() => undefined),
    redo: mock(() => undefined),
    canUndo: mock(() => false),
    canRedo: mock(() => false),
    commitRowResize: mock(() => {}),
    commitColumnResize: mock(() => {}),
    commitPaste: mock(() => {}),
    commitFill: mock((source, fill, direction) => ({
      source,
      fill,
      result: { startRow: 0, endRow: 4, startCol: 0, endCol: 1 },
      direction,
      writes: [],
    })),
  } as unknown as GridEngine
}

function makeHost(offset: { left: number; top: number } = { left: 0, top: 0 }): WebHost {
  return {
    attach: mock(() => {}),
    applyScrollbarTheme: mock(() => {}),
    setScrollSize: mock(() => {}),
    scrollTo: mock(() => {}),
    getDpr: () => 1,
    getContainerSize: () => ({ width: 400, height: 300 }),
    getContainerBoundingRect: () => offset,
    getScrollPosition: () => ({ scrollTop: 0, scrollLeft: 0 }),
    focusScrollHost: mock(() => {}),
    destroy: mock(() => {}),
  }
}

function makeRenderer(): WebRenderer {
  return {
    mount: mock(() => {}),
    resize: mock(() => {}),
    render: mock(() => {}),
    destroy: mock(() => {}),
  }
}
