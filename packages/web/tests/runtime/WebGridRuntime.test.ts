import { describe, expect, it, mock, spyOn } from 'bun:test'
import type { DataSource, GridEngine, Theme } from '@novasheet/core'
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
    getFrame: mock(() => ({
      data: {} as DataSource,
      theme: { metrics: { headerHeight: 32 } } as Theme,
      rowsAxis: { getCount: () => 0 } as never,
      colsAxis: {} as never,
      viewport: { contentRect: { width: 400, height: 300 } } as never,
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
    expect(patch).toHaveBeenCalledWith(renderer)
    expect(refreshSpy).toHaveBeenCalled()
  })
})
