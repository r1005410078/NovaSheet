import { describe, expect, it, mock, spyOn } from 'bun:test'
import type { CellAddress, DataSource, GridEngine, GridSelection, Theme } from '@novasheet/core'
import type { WebHost } from '../../src/host/WebHost'
import type { WebRenderer } from '../../src/render/WebRenderer'
import { WebGridRuntime } from '../../src/runtime/WebGridRuntime'

function makeEngine(): GridEngine {
  return {
    setData: mock(() => {}),
    setTheme: mock(() => {}),
    setFrozen: mock(() => {}),
    setViewportSize: mock(() => {}),
    setHeaderHeight: mock(() => {}),
    setScroll: mock(() => {}),
    setRowHeight: mock(() => {}),
    setColumnWidth: mock(() => {}),
    selectCell: mock(() => {}),
    clearSelection: mock(() => {}),
    getSelection: mock(
      () =>
        ({
          activeCell: null,
          anchorCell: null,
          extentCell: null,
          selectedRange: null,
        }) satisfies GridSelection,
    ),
    getFrame: mock(() => ({
      data: {} as DataSource,
      theme: { metrics: { headerHeight: 32 } } as Theme,
      rowsAxis: {
        getCount: () => 10,
        positionToIndex: (pos: number) => Math.floor(pos / 28),
      } as never,
      colsAxis: {
        positionToIndex: (pos: number) => Math.floor(pos / 100),
      } as never,
      viewport: {
        contentRect: { width: 400, height: 300 },
        regions: [
          {
            id: 'main',
            rowBand: 'middle',
            colBand: 'center',
            rowRange: [0, 9],
            colRange: [0, 2],
            rect: { x: 0, y: 32, width: 300, height: 268 },
            scrollOffsetX: 0,
            scrollOffsetY: 0,
            zIndex: 10,
          },
        ],
      } as never,
    })),
    getRowsTotalSize: () => 280,
    getColsTotalSize: () => 200,
    getColumnIndex: () => 0,
    getTheme: () => ({ metrics: { headerHeight: 32, rowHeight: 28 } }) as Theme,
    getRowsAxis: () =>
      ({
        getCount: () => 10,
        indexToPosition: (i: number) => i * 28,
        getSize: () => 28,
      }) as never,
    getColsAxis: () =>
      ({
        indexToPosition: () => 0,
      }) as never,
    getViewport: mock(() => ({}) as never),
    getData: mock(() => ({}) as never),
  }
}

function makeHost(): WebHost {
  return {
    attach: mock(() => {}),
    applyScrollbarTheme: mock(() => {}),
    setScrollSize: mock(() => {}),
    scrollTo: mock(() => {}),
    getDpr: () => 1,
    getContainerSize: () => ({ width: 400, height: 300 }),
    getScrollPosition: () => ({ scrollTop: 0, scrollLeft: 0 }),
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

describe('WebGridRuntime.replaceRenderer — 更换渲染器', () => {
  it('销毁旧 renderer 并安装 factory 产物', () => {
    const engine = makeEngine()
    const host = makeHost()
    const first = makeRenderer()
    const second = makeRenderer()
    const runtime = new WebGridRuntime({ engine, host, renderer: first })

    const installed = runtime.replaceRenderer(() => second)

    expect(first.destroy).toHaveBeenCalledTimes(1)
    expect(installed).toBe(second)
    expect(second.destroy).not.toHaveBeenCalled()
  })
})

describe('WebGridRuntime.setData — 换数据', () => {
  it('更新 engine、经 factory 换 renderer 并 refresh', () => {
    const engine = makeEngine()
    const host = makeHost()
    const first = makeRenderer()
    const second = makeRenderer()
    const runtime = new WebGridRuntime({ engine, host, renderer: first })
    const refreshSpy = spyOn(runtime, 'refresh')

    const data = {} as DataSource
    const installed = runtime.setData(data, () => second)

    expect(engine.setData).toHaveBeenCalledWith(data)
    expect(first.destroy).toHaveBeenCalledTimes(1)
    expect(installed).toBe(second)
    expect(engine.setViewportSize).toHaveBeenCalledWith(400, 300)
    expect(host.setScrollSize).toHaveBeenCalled()
    expect(refreshSpy).toHaveBeenCalled()
  })
})

describe('WebGridRuntime.scheduleHostResize — 合并 resize', () => {
  it('合并 resize 回调，RAF 内 paintSync', () => {
    const engine = makeEngine()
    const host = makeHost()
    const renderer = makeRenderer()
    const onSurfaceResize = mock(() => {})
    const runtime = new WebGridRuntime({ engine, host, renderer, onSurfaceResize })

    const rafs: Array<FrameRequestCallback> = []
    const originalRaf = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafs.push(cb)
      return rafs.length
    }) as typeof requestAnimationFrame

    runtime.handleHostResize(100, 100, 1)
    runtime.handleHostResize(200, 200, 1)
    expect(engine.setViewportSize).not.toHaveBeenCalled()
    expect(renderer.render).not.toHaveBeenCalled()

    rafs[rafs.length - 1]!(performance.now())
    expect(engine.setViewportSize).toHaveBeenCalledTimes(1)
    expect(engine.setViewportSize).toHaveBeenCalledWith(400, 300)
    expect(onSurfaceResize).toHaveBeenCalledTimes(1)
    expect(renderer.render).toHaveBeenCalledTimes(1)

    globalThis.requestAnimationFrame = originalRaf
  })
})

describe('WebGridRuntime.setTheme — 换主题', () => {
  it('更新 engine、可选 patch renderer 后 refresh', () => {
    const engine = makeEngine()
    const host = makeHost()
    const renderer = makeRenderer()
    const runtime = new WebGridRuntime({ engine, host, renderer })
    const refreshSpy = spyOn(runtime, 'refresh')
    const patch = mock(() => {})

    const theme = { metrics: { headerHeight: 40, rowHeight: 32 } } as Theme
    runtime.setTheme(theme, patch)

    expect(engine.setTheme).toHaveBeenCalledWith(theme)
    expect(host.applyScrollbarTheme).toHaveBeenCalled()
    expect(patch).toHaveBeenCalledWith(renderer)
    expect(refreshSpy).toHaveBeenCalled()
  })
})

describe('WebGridRuntime.handleHostPointerDown — 点击选择', () => {
  it('命中 body 单元格后更新 selection 并请求重绘', () => {
    const engine = makeEngine()
    const host = makeHost()
    const renderer = makeRenderer()
    const runtime = new WebGridRuntime({ engine, host, renderer })
    const refreshSpy = spyOn(runtime, 'refresh')

    runtime.handleHostPointerDown({ x: 120, y: 72, shiftKey: false })

    expect(engine.selectCell).toHaveBeenCalledWith({ rowIndex: 1, colIndex: 1 } satisfies CellAddress)
    expect(refreshSpy).toHaveBeenCalled()
  })

  it('按住 Shift 点击时扩展选区', () => {
    const engine = makeEngine()
    const host = makeHost()
    const renderer = makeRenderer()
    const runtime = new WebGridRuntime({ engine, host, renderer })

    runtime.handleHostPointerDown({ x: 120, y: 72, shiftKey: true })

    expect(engine.selectCell).toHaveBeenCalledWith(
      { rowIndex: 1, colIndex: 1 } satisfies CellAddress,
      { extend: true },
    )
  })
})

describe('WebGridRuntime drag selection — 拖拽框选', () => {
  it('pointerdown 后 pointermove 用 anchor 扩展选区，pointerup 后停止扩展', () => {
    const engine = makeEngine()
    const host = makeHost()
    const renderer = makeRenderer()
    const runtime = new WebGridRuntime({ engine, host, renderer })

    runtime.handleHostPointerDown({ x: 20, y: 44, shiftKey: false })
    runtime.handleHostPointerMove({ x: 220, y: 100, shiftKey: false })
    runtime.handleHostPointerUp()
    runtime.handleHostPointerMove({ x: 20, y: 44, shiftKey: false })

    expect(engine.selectCell).toHaveBeenNthCalledWith(1, { rowIndex: 0, colIndex: 0 })
    expect(engine.selectCell).toHaveBeenNthCalledWith(
      2,
      { rowIndex: 2, colIndex: 2 },
      { extend: true },
    )
    expect(engine.selectCell).toHaveBeenCalledTimes(2)
  })

  it('pointerdown 未命中 body 时不会进入拖拽选择', () => {
    const engine = makeEngine()
    const host = makeHost()
    const renderer = makeRenderer()
    const runtime = new WebGridRuntime({ engine, host, renderer })

    runtime.handleHostPointerDown({ x: 20, y: 12, shiftKey: false })
    runtime.handleHostPointerMove({ x: 220, y: 100, shiftKey: false })

    expect(engine.selectCell).not.toHaveBeenCalled()
  })
})

describe('WebGridRuntime drag auto-scroll — 拖选带动滚动', () => {
  it('拖到视口右下热区时滚动 scrollHost，并继续扩展选区', () => {
    const engine = {
      ...makeEngine(),
      getRowsTotalSize: () => 800,
      getColsTotalSize: () => 800,
    } satisfies GridEngine
    let scrollTop = 0
    let scrollLeft = 0
    const host = {
      ...makeHost(),
      scrollTo: mock((top: number, left: number) => {
        scrollTop = top
        scrollLeft = left
      }),
      getScrollPosition: () => ({ scrollTop, scrollLeft }),
      getContainerSize: () => ({ width: 300, height: 300 }),
    } satisfies WebHost
    const renderer = makeRenderer()
    const runtime = new WebGridRuntime({ engine, host, renderer })

    const rafs: Array<FrameRequestCallback> = []
    const originalRaf = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafs.push(cb)
      return rafs.length
    }) as typeof requestAnimationFrame

    runtime.handleHostPointerDown({ x: 20, y: 44, shiftKey: false })
    runtime.handleHostPointerMove({ x: 292, y: 292, shiftKey: false })

    rafs[rafs.length - 1]!(performance.now())

    expect(host.scrollTo).toHaveBeenCalled()
    expect(scrollTop).toBeGreaterThan(0)
    expect(scrollLeft).toBeGreaterThan(0)
    expect(engine.selectCell).toHaveBeenLastCalledWith({ rowIndex: 9, colIndex: 2 }, { extend: true })

    globalThis.requestAnimationFrame = originalRaf
  })

  it('pointerup 后停止已经入队的 auto-scroll', () => {
    const engine = makeEngine()
    const host = makeHost()
    const renderer = makeRenderer()
    const runtime = new WebGridRuntime({ engine, host, renderer })

    const rafs: Array<FrameRequestCallback> = []
    const originalRaf = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafs.push(cb)
      return rafs.length
    }) as typeof requestAnimationFrame

    runtime.handleHostPointerDown({ x: 20, y: 44, shiftKey: false })
    runtime.handleHostPointerMove({ x: 392, y: 292, shiftKey: false })
    runtime.handleHostPointerUp()

    rafs[rafs.length - 1]!(performance.now())

    expect(host.scrollTo).not.toHaveBeenCalled()

    globalThis.requestAnimationFrame = originalRaf
  })
})
