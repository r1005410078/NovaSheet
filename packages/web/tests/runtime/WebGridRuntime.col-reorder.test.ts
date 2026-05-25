import { describe, expect, it, mock } from 'bun:test'
import { DefaultGridEngine, denseGridTheme, InMemoryDataSource } from '@novasheet/core'
import type { GridEngine, ResizeHandleRect, Schema } from '@novasheet/core'
import type { ColumnReorderOverlay } from '../../src/overlay/ColumnReorderOverlay'
import type { WebHost } from '../../src/host/WebHost'
import type { WebRenderer } from '../../src/render/WebRenderer'
import { WebGridRuntime } from '../../src/runtime/WebGridRuntime'

function makeEngine(): DefaultGridEngine {
  const schema: Schema = {
    fields: [
      { id: 'a', name: 'A', type: 'text', width: 100 },
      { id: 'b', name: 'B', type: 'text', width: 100 },
      { id: 'c', name: 'C', type: 'text', width: 100 },
      { id: 'd', name: 'D', type: 'text', width: 100 },
    ],
  }
  const engine = new DefaultGridEngine({
    data: new InMemoryDataSource({
      schema,
      rows: [
        { a: 'A1', b: 'B1', c: 'C1', d: 'D1' },
        { a: 'A2', b: 'B2', c: 'C2', d: 'D2' },
      ],
    }),
    theme: denseGridTheme,
  })
  engine.setViewportSize(500, 240)
  return engine
}

function makeHost(): WebHost {
  return {
    attach: mock(() => {}),
    applyScrollbarTheme: mock(() => {}),
    setScrollSize: mock(() => {}),
    setCursor: mock(() => {}),
    scrollTo: mock(() => {}),
    getScrollPosition: () => ({ scrollTop: 0, scrollLeft: 0 }),
    getDpr: () => 1,
    getContainerSize: () => ({ width: 500, height: 240 }),
    getContainerBoundingRect: () => ({ left: 0, top: 0 }),
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

function makeOverlay(): ColumnReorderOverlay {
  return {
    show: mock(() => {}),
    hide: mock(() => {}),
    destroy: mock(() => {}),
  } as unknown as ColumnReorderOverlay
}

function selectCols(engine: GridEngine, startCol: number, endCol: number): void {
  const rowCount = engine.getData().getRowCount()
  engine.setSelection({
    activeCell: { rowIndex: 0, colIndex: startCol },
    anchorCell: { rowIndex: 0, colIndex: startCol },
    extentCell: { rowIndex: rowCount - 1, colIndex: endCol },
    selectedRange: { startRow: 0, endRow: rowCount - 1, startCol, endCol },
  })
}

describe('WebGridRuntime column reorder drag', () => {
  it('shows preview and grabbing cursor immediately on selected header pointerdown', () => {
    const engine = makeEngine()
    selectCols(engine, 1, 2)
    const host = makeHost()
    const overlay = makeOverlay()
    const runtime = new WebGridRuntime({
      engine,
      host,
      renderer: makeRenderer(),
      columnReorderOverlay: overlay,
    })

    runtime.handleHostPointerDown({ x: 120, y: 10, shiftKey: false, button: 0 })

    expect(overlay.show).toHaveBeenCalledWith({
      lineX: 100,
      dragBandX: 100,
      bandWidth: 200,
      height: 240,
    })
    expect(host.setCursor).toHaveBeenCalledWith('grabbing')

    runtime.handleHostPointerUp()
    expect(overlay.hide).toHaveBeenCalled()
    expect(host.setCursor).toHaveBeenLastCalledWith(null)
  })

  it('uses grab cursor only when hovering a selected column header', () => {
    const engine = makeEngine()
    selectCols(engine, 1, 1)
    const host = makeHost()
    const runtime = new WebGridRuntime({
      engine,
      host,
      renderer: makeRenderer(),
      columnReorderOverlay: makeOverlay(),
    })

    runtime.handleHostPointerMove({ x: 120, y: 10, shiftKey: false })
    expect(host.setCursor).toHaveBeenLastCalledWith('grab')

    runtime.handleHostPointerMove({ x: 220, y: 10, shiftKey: false })
    expect(host.setCursor).toHaveBeenLastCalledWith(null)
  })

  it('starts column reorder only after pointer moves beyond threshold from a selected header', () => {
    const engine = makeEngine()
    selectCols(engine, 1, 1)
    const overlay = makeOverlay()
    const runtime = new WebGridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      columnReorderOverlay: overlay,
    })

    runtime.handleHostPointerDown({ x: 120, y: 10, shiftKey: false, button: 0 })
    runtime.handleHostPointerMove({ x: 123, y: 10, shiftKey: false })
    expect(overlay.show).toHaveBeenLastCalledWith({
      lineX: 100,
      dragBandX: 103,
      bandWidth: 100,
      height: 240,
    })

    runtime.handleHostPointerMove({ x: 260, y: 10, shiftKey: false })

    expect(overlay.show).toHaveBeenCalledWith({
      lineX: 300,
      dragBandX: 240,
      bandWidth: 100,
      height: 240,
    })
  })

  it('moves selected multiple columns on pointerup and hides preview', () => {
    const engine = makeEngine()
    selectCols(engine, 1, 2)
    const overlay = makeOverlay()
    const runtime = new WebGridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      columnReorderOverlay: overlay,
    })

    runtime.handleHostPointerDown({ x: 120, y: 10, shiftKey: false, button: 0 })
    runtime.handleHostPointerMove({ x: 390, y: 10, shiftKey: false })
    runtime.handleHostPointerUp()

    expect(engine.getData().getSchema().fields.map((field) => field.id)).toEqual([
      'a',
      'd',
      'b',
      'c',
    ])
    expect(overlay.hide).toHaveBeenCalled()
  })

  it('clicking an unselected header selects it and does not reorder on the same pointerdown', () => {
    const engine = makeEngine()
    selectCols(engine, 1, 1)
    const overlay = makeOverlay()
    const runtime = new WebGridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      columnReorderOverlay: overlay,
    })

    runtime.handleHostPointerDown({ x: 220, y: 10, shiftKey: false, button: 0 })
    runtime.handleHostPointerMove({ x: 390, y: 10, shiftKey: false })
    runtime.handleHostPointerUp()

    expect(engine.getData().getSchema().fields.map((field) => field.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
    expect(engine.getSelection().selectedRange).toEqual({
      startRow: 0,
      endRow: 1,
      startCol: 2,
      endCol: 2,
    })
    expect(overlay.show).not.toHaveBeenCalled()
  })

  it('body drag-select does not enter column reorder', () => {
    const engine = makeEngine()
    selectCols(engine, 1, 1)
    const overlay = makeOverlay()
    const runtime = new WebGridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      columnReorderOverlay: overlay,
    })

    runtime.handleHostPointerDown({ x: 120, y: 60, shiftKey: false, button: 0 })
    runtime.handleHostPointerMove({ x: 390, y: 60, shiftKey: false })

    expect(overlay.show).not.toHaveBeenCalled()
  })

  it('resize drag blocks column reorder', () => {
    const engine = makeEngine()
    selectCols(engine, 1, 1)
    const overlay = makeOverlay()
    const runtime = new WebGridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      columnReorderOverlay: overlay,
    })
    ;(runtime as unknown as { resizeDrag: object }).resizeDrag = {
      handle: {
        kind: 'column',
        id: 'b',
        fieldId: 'b',
        colIndex: 1,
        x: 100,
        y: 0,
        width: 8,
        height: 32,
      } satisfies ResizeHandleRect,
      pointerId: 1,
      startClientX: 100,
      startClientY: 10,
      startSize: 100,
      anchorStart: 100,
      previewSize: 100,
    }

    runtime.handleHostPointerDown({ x: 120, y: 10, shiftKey: false, button: 0 })
    runtime.handleHostPointerMove({ x: 390, y: 10, shiftKey: false })

    expect(overlay.show).not.toHaveBeenCalled()
  })
})
