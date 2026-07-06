import { describe, expect, it, mock } from 'bun:test'
import { GridRuntime } from '@novasheet/core'
import type { RenderBackend, WebHost } from '@novasheet/core'
import { DomHandleLayer } from '../../../src/dom/interaction/DomHandleLayer'
import { makeMockGridEngine } from '../../helpers/mock-grid-engine'

function makeHost(): WebHost {
  return {
    attach: mock(() => {}),
    applyScrollbarTheme: mock(() => {}),
    setScrollSize: mock(() => {}),
    setCursor: mock(() => {}),
    scrollTo: mock(() => {}),
    getDpr: () => 1,
    getContainerSize: () => ({ width: 400, height: 300 }),
    getContainerBoundingRect: () => ({ left: 0, top: 0 }),
    getScrollPosition: () => ({ scrollTop: 0, scrollLeft: 0 }),
    focusScrollHost: mock(() => {}),
    destroy: mock(() => {}),
  } as unknown as WebHost
}

function makeRenderer(): RenderBackend {
  return {
    mount: mock(() => {}),
    resize: mock(() => {}),
    render: mock(() => {}),
    invalidate: mock(() => {}),
    destroy: mock(() => {}),
  } as unknown as RenderBackend
}

describe('GridRuntime flush — engine.getFrame 去重', () => {
  it('一次 flush 内 getFrame 恰好调用一次（handleLayer 在场）', () => {
    const engine = makeMockGridEngine()
    const container = document.createElement('div')
    document.body.appendChild(container)
    const handleLayer = new DomHandleLayer(container, {
      onResizePointerDown: mock(() => {}),
      onResizePointerMove: mock(() => {}),
      onResizePointerUp: mock(() => {}),
      onResizeKeyboard: mock(() => {}),
    })
    handleLayer.attach()
    const runtime = new GridRuntime({ engine, host: makeHost(), renderer: makeRenderer(), handleLayer })

    const rafs: FrameRequestCallback[] = []
    const originalRaf = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      rafs.push(cb)
      return rafs.length
    }) as typeof requestAnimationFrame

    const getFrameMock = engine.getFrame as unknown as { mock: { calls: unknown[] } }
    const before = getFrameMock.mock.calls.length
    runtime.handleHostResize(100, 100, 1)
    rafs[rafs.length - 1]!(performance.now())
    const callsInFlush = getFrameMock.mock.calls.length - before

    globalThis.requestAnimationFrame = originalRaf
    runtime.destroy()
    document.body.removeChild(container)

    expect(callsInFlush).toBe(1)
  })
})
