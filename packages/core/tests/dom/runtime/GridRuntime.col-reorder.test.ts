import { describe, expect, it, mock } from 'bun:test'
import { DefaultGridEngine, denseGridTheme, InMemoryDataSource } from '@novasheet/core'
import type { GridEngine, ResizeHandleRect, Schema } from '@novasheet/core'
import type { ColumnReorderOverlay } from '@novasheet/core'
import type { WebHost } from '@novasheet/core'
import type { RenderBackend } from '@novasheet/core'
import { GridRuntime } from '@novasheet/core'

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

function makeRenderer(): RenderBackend {
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

function selectCellRange(
  engine: GridEngine,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
): void {
  engine.setSelection({
    activeCell: { rowIndex: startRow, colIndex: startCol },
    anchorCell: { rowIndex: startRow, colIndex: startCol },
    extentCell: { rowIndex: endRow, colIndex: endCol },
    selectedRange: { startRow, endRow, startCol, endCol },
  })
}

describe('GridRuntime column reorder drag', () => {
  it('shows preview and grabbing cursor immediately on selected header pointerdown', () => {
    const engine = makeEngine()
    selectCols(engine, 1, 2)
    const host = makeHost()
    const overlay = makeOverlay()
    const runtime = new GridRuntime({
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
    const runtime = new GridRuntime({
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
    const runtime = new GridRuntime({
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

  it('keeps preview visible and no-ops when released inside the dragged column', () => {
    const engine = makeEngine()
    selectCols(engine, 1, 1)
    const overlay = makeOverlay()
    const runtime = new GridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      columnReorderOverlay: overlay,
    })

    runtime.handleHostPointerDown({ x: 120, y: 10, shiftKey: false, button: 0 })
    runtime.handleHostPointerMove({ x: 135, y: 10, shiftKey: false })

    expect(overlay.show).toHaveBeenLastCalledWith({
      lineX: 100,
      dragBandX: 115,
      bandWidth: 100,
      height: 240,
    })

    runtime.handleHostPointerUp()

    expect(engine.getData().getSchema().fields.map((field) => field.id)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
  })

  it('moves selected multiple columns on pointerup and hides preview', () => {
    const engine = makeEngine()
    selectCols(engine, 1, 2)
    const overlay = makeOverlay()
    const runtime = new GridRuntime({
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

  it('向左拖到行表头区（x < rowHeaderWidth）应落到最左，而非死区无操作', () => {
    // 回归：与行表头同源的死区 bug——左侧 rowHeaderWidth 区曾 return null（无落点），
    // 与右侧「追加到末尾」不对称，导致列向左拖（含左边缘自动滚动）永远不提交。
    const schema: Schema = {
      fields: [
        { id: 'a', name: 'A', type: 'text', width: 100 },
        { id: 'b', name: 'B', type: 'text', width: 100 },
        { id: 'c', name: 'C', type: 'text', width: 100 },
        { id: 'd', name: 'D', type: 'text', width: 100 },
      ],
    }
    const engine = new DefaultGridEngine({
      data: new InMemoryDataSource({ schema, rows: [{ a: 'A1', b: 'B1', c: 'C1', d: 'D1' }] }),
      theme: denseGridTheme,
      excelHeaders: true, // rowHeaderWidth > 0，存在左侧死区
    })
    engine.setViewportSize(500, 240)
    selectCols(engine, 2, 3) // c,d
    const runtime = new GridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      columnReorderOverlay: makeOverlay(),
    })

    runtime.handleHostPointerDown({ x: 300, y: 10, shiftKey: false, button: 0 }) // col2 (c)
    runtime.handleHostPointerMove({ x: 20, y: 10, shiftKey: false }) // 行表头区 x<rowHeaderWidth
    runtime.handleHostPointerUp()

    expect(engine.getData().getSchema().fields.map((field) => field.id)).toEqual(['c', 'd', 'a', 'b'])
  })

  it('clicking an unselected header selects it and does not reorder on the same pointerdown', () => {
    const engine = makeEngine()
    selectCols(engine, 1, 1)
    const overlay = makeOverlay()
    const runtime = new GridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      columnReorderOverlay: overlay,
    })

    runtime.handleHostPointerDown({ x: 220, y: 10, shiftKey: false, button: 0 })
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

  it('shift-clicking a column header extends contiguous whole-column selection', () => {
    const engine = makeEngine()
    selectCols(engine, 1, 1)
    const overlay = makeOverlay()
    const runtime = new GridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      columnReorderOverlay: overlay,
    })

    runtime.handleHostPointerDown({ x: 320, y: 10, shiftKey: true, button: 0 })
    runtime.handleHostPointerUp()

    expect(engine.getSelection().selectedRange).toEqual({
      startRow: 0,
      endRow: 1,
      startCol: 1,
      endCol: 3,
    })
    expect(overlay.show).not.toHaveBeenCalled()
  })

  it('dragging from an unselected column header selects contiguous whole columns', () => {
    const engine = makeEngine()
    const overlay = makeOverlay()
    const runtime = new GridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      columnReorderOverlay: overlay,
    })

    runtime.handleHostPointerDown({ x: 120, y: 10, shiftKey: false, button: 0 })
    runtime.handleHostPointerMove({ x: 320, y: 10, shiftKey: false })
    runtime.handleHostPointerUp()

    expect(engine.getSelection().selectedRange).toEqual({
      startRow: 0,
      endRow: 1,
      startCol: 1,
      endCol: 3,
    })
    expect(overlay.show).not.toHaveBeenCalled()
  })

  it('cell range selection in the same column does not seed column reorder', () => {
    const engine = makeEngine()
    selectCellRange(engine, 0, 0, 1, 1)
    const overlay = makeOverlay()
    const runtime = new GridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      columnReorderOverlay: overlay,
    })

    runtime.handleHostPointerDown({ x: 120, y: 10, shiftKey: false, button: 0 })
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
      startCol: 1,
      endCol: 1,
    })
    expect(overlay.show).not.toHaveBeenCalled()
  })

  it('body drag-select does not enter column reorder', () => {
    const engine = makeEngine()
    selectCols(engine, 1, 1)
    const overlay = makeOverlay()
    const runtime = new GridRuntime({
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
    const runtime = new GridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      columnReorderOverlay: overlay,
      handleLayer: { showIndicator: mock(() => {}), hideIndicator: mock(() => {}), sync: mock(() => {}) } as never,
    })
    runtime.handleResizePointerDown(
      {
        kind: 'column',
        id: 'b',
        fieldId: 'b',
        colIndex: 1,
        x: 100,
        y: 0,
        width: 8,
        height: 32,
      } satisfies ResizeHandleRect,
      1,
      100,
      10,
    )

    runtime.handleHostPointerDown({ x: 120, y: 10, shiftKey: false, button: 0 })
    runtime.handleHostPointerMove({ x: 390, y: 10, shiftKey: false })

    expect(overlay.show).not.toHaveBeenCalled()
  })
})

describe('GridRuntime column reorder drag auto-scroll', () => {
  function wideEngine(): DefaultGridEngine {
    const schema: Schema = {
      fields: Array.from({ length: 12 }, (_, i) => ({
        id: `c${i}`,
        name: `C${i}`,
        type: 'text' as const,
        width: 100,
      })),
    }
    const engine = new DefaultGridEngine({
      data: new InMemoryDataSource({
        schema,
        rows: [Object.fromEntries(schema.fields.map((f) => [f.id, f.id]))],
      }),
      theme: denseGridTheme,
    })
    engine.setViewportSize(300, 240) // 列总宽 1200 > 视口 300，留出横向滚动空间
    return engine
  }

  it('列拖到右边缘热区时横向滚动 scrollHost', () => {
    const engine = wideEngine()
    selectCols(engine, 1, 1)
    let scrollLeft = 0
    const host = {
      ...makeHost(),
      scrollTo: mock((_top: number, left: number) => {
        scrollLeft = left
      }),
      getScrollPosition: () => ({ scrollTop: 0, scrollLeft }),
      getContainerSize: () => ({ width: 300, height: 240 }),
    } satisfies WebHost
    const runtime = new GridRuntime({
      engine,
      host,
      renderer: makeRenderer(),
      columnReorderOverlay: makeOverlay(),
    })

    const rafs: Array<FrameRequestCallback> = []
    const originalRaf = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafs.push(cb)
      return rafs.length
    }) as typeof requestAnimationFrame

    runtime.handleHostPointerDown({ x: 120, y: 10, shiftKey: false, button: 0 })
    runtime.handleHostPointerMove({ x: 292, y: 10, shiftKey: false }) // 越阈值并进入右边缘热区
    rafs[rafs.length - 1]!(performance.now())

    expect(host.scrollTo).toHaveBeenCalled()
    expect(scrollLeft).toBeGreaterThan(0)

    globalThis.requestAnimationFrame = originalRaf
  })
})
