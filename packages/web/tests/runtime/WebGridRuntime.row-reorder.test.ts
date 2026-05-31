import { describe, expect, it, mock } from 'bun:test'
import { DefaultGridEngine, InMemoryDataSource, denseGridTheme } from '@novasheet/core'
import type { GridEngine, ResizeHandleRect, Row, Schema } from '@novasheet/core'
import type { RowReorderOverlay } from '../../src/overlay/RowReorderOverlay'
import type { WebHost } from '../../src/host/WebHost'
import type { WebRenderer } from '../../src/render/WebRenderer'
import { WebGridRuntime } from '../../src/runtime/WebGridRuntime'

function makeEngine(): DefaultGridEngine {
  const schema: Schema = {
    fields: [{ id: 'name', name: 'Name', type: 'text', width: 100 }],
  }
  const engine = new DefaultGridEngine({
    data: new InMemoryDataSource({
      schema,
      rows: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }],
    }),
    theme: denseGridTheme,
    excelHeaders: true,
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

function makeOverlay(): RowReorderOverlay {
  return {
    show: mock(() => {}),
    hide: mock(() => {}),
    destroy: mock(() => {}),
  } as unknown as RowReorderOverlay
}

function selectRows(engine: GridEngine, startRow: number, endRow: number): void {
  const colCount = engine.getData().getSchema().fields.length
  engine.setSelection({
    activeCell: { rowIndex: startRow, colIndex: 0 },
    anchorCell: { rowIndex: startRow, colIndex: 0 },
    extentCell: { rowIndex: endRow, colIndex: colCount - 1 },
    selectedRange: { startRow, endRow, startCol: 0, endCol: colCount - 1 },
  })
}

function rowNames(engine: GridEngine): string[] {
  return (engine.getData().getRows(0, 3) as Row[]).map((row) => String(row.name))
}

describe('WebGridRuntime row reorder drag', () => {
  it('shows preview and grabbing cursor immediately on selected row header pointerdown', () => {
    const engine = makeEngine()
    selectRows(engine, 1, 2)
    const host = makeHost()
    const overlay = makeOverlay()
    const runtime = new WebGridRuntime({
      engine,
      host,
      renderer: makeRenderer(),
      rowReorderOverlay: overlay,
    })

    runtime.handleHostPointerDown({ x: 20, y: 70, shiftKey: false, button: 0 })

    expect(overlay.show).toHaveBeenCalledWith({
      lineY: 60,
      dragBandY: 60,
      bandHeight: 56,
      width: 500,
    })
    expect(host.setCursor).toHaveBeenCalledWith('grabbing')

    runtime.handleHostPointerUp()
    expect(overlay.hide).toHaveBeenCalled()
    expect(host.setCursor).toHaveBeenLastCalledWith(null)
  })

  it('moves selected multiple rows on pointerup and hides preview', () => {
    const engine = makeEngine()
    selectRows(engine, 1, 2)
    const overlay = makeOverlay()
    const runtime = new WebGridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      rowReorderOverlay: overlay,
    })

    runtime.handleHostPointerDown({ x: 20, y: 70, shiftKey: false, button: 0 })
    runtime.handleHostPointerMove({ x: 20, y: 150, shiftKey: false })
    runtime.handleHostPointerUp()

    expect(rowNames(engine)).toEqual(['A', 'D', 'B', 'C'])
    expect(overlay.hide).toHaveBeenCalled()
  })

  it('向上拖到表头区（y < headerHeight）应落到顶部，而非死区无操作', () => {
    // 回归：顶部 header 区曾被 computeReorderTarget 直接 return null（无落点），
    // 与底部「映射为追加到末尾」不对称——导致行向上拖（含上边缘自动滚动）永远不提交。
    const engine = makeEngine()
    selectRows(engine, 2, 3) // C,D；row2 起于 y≈88
    const runtime = new WebGridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      rowReorderOverlay: makeOverlay(),
    })

    runtime.handleHostPointerDown({ x: 20, y: 100, shiftKey: false, button: 0 })
    runtime.handleHostPointerMove({ x: 20, y: 20, shiftKey: false }) // 表头区 y<32
    runtime.handleHostPointerUp()

    expect(rowNames(engine)).toEqual(['C', 'D', 'A', 'B'])
  })

  it('dragging from an unselected row header selects contiguous whole rows without reorder', () => {
    const engine = makeEngine()
    const overlay = makeOverlay()
    const runtime = new WebGridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      rowReorderOverlay: overlay,
    })

    runtime.handleHostPointerDown({ x: 20, y: 42, shiftKey: false, button: 0 })
    runtime.handleHostPointerMove({ x: 20, y: 98, shiftKey: false })
    runtime.handleHostPointerUp()

    expect(engine.getSelection().selectedRange).toEqual({
      startRow: 0,
      endRow: 2,
      startCol: 0,
      endCol: 0,
    })
    expect(rowNames(engine)).toEqual(['A', 'B', 'C', 'D'])
    expect(overlay.show).not.toHaveBeenCalled()
  })

  it('resize drag blocks row reorder', () => {
    const engine = makeEngine()
    selectRows(engine, 1, 1)
    const overlay = makeOverlay()
    const runtime = new WebGridRuntime({
      engine,
      host: makeHost(),
      renderer: makeRenderer(),
      rowReorderOverlay: overlay,
      handleLayer: { showIndicator: mock(() => {}), hideIndicator: mock(() => {}), sync: mock(() => {}) } as never,
    })
    runtime.handleResizePointerDown(
      {
        kind: 'row',
        id: 'row-1',
        rowIndex: 1,
        x: 0,
        y: 60,
        width: 48,
        height: 8,
      } satisfies ResizeHandleRect,
      1,
      20,
      60,
    )

    runtime.handleHostPointerDown({ x: 20, y: 70, shiftKey: false, button: 0 })
    runtime.handleHostPointerMove({ x: 20, y: 150, shiftKey: false })

    expect(overlay.show).not.toHaveBeenCalled()
  })
})

describe('WebGridRuntime row reorder drag auto-scroll', () => {
  function tallEngine(): DefaultGridEngine {
    const schema: Schema = { fields: [{ id: 'name', name: 'Name', type: 'text', width: 100 }] }
    const rows: Row[] = Array.from({ length: 60 }, (_, i) => ({ name: `R${i}` }))
    const engine = new DefaultGridEngine({
      data: new InMemoryDataSource({ schema, rows }),
      theme: denseGridTheme,
      excelHeaders: true,
    })
    engine.setViewportSize(300, 200) // 行总高远大于视口 200，留出纵向滚动空间
    return engine
  }

  it('行拖到下边缘热区时纵向滚动 scrollHost', () => {
    const engine = tallEngine()
    selectRows(engine, 1, 1)
    let scrollTop = 0
    const host = {
      ...makeHost(),
      scrollTo: mock((top: number, _left: number) => {
        scrollTop = top
      }),
      getScrollPosition: () => ({ scrollTop, scrollLeft: 0 }),
      getContainerSize: () => ({ width: 300, height: 200 }),
    } satisfies WebHost
    const runtime = new WebGridRuntime({
      engine,
      host,
      renderer: makeRenderer(),
      rowReorderOverlay: makeOverlay(),
    })

    const rafs: Array<FrameRequestCallback> = []
    const originalRaf = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafs.push(cb)
      return rafs.length
    }) as typeof requestAnimationFrame

    runtime.handleHostPointerDown({ x: 20, y: 60, shiftKey: false, button: 0 })
    runtime.handleHostPointerMove({ x: 20, y: 192, shiftKey: false }) // 越阈值并进入下边缘热区
    rafs[rafs.length - 1]!(performance.now())

    expect(host.scrollTo).toHaveBeenCalled()
    expect(scrollTop).toBeGreaterThan(0)

    globalThis.requestAnimationFrame = originalRaf
  })
})
