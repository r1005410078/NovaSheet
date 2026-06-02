import { describe, expect, it, mock } from 'bun:test'
import { createSheetContext, type ResizeHandleRect } from '@novasheet/core'
import { WebGridRuntime } from '@novasheet/web'
import type { DomHandleLayer, WebHost, WebRenderer } from '@novasheet/web'
import { installResizeFeature } from '../src'
import { makeMockGridEngine } from './helpers/mock-grid-engine'

const columnHandle: ResizeHandleRect = {
  kind: 'column',
  id: 'name',
  fieldId: 'field-0',
  colIndex: 0,
  x: 92,
  y: 0,
  width: 8,
  height: 32,
}

function makeContext() {
  const ctx = createSheetContext()
  installResizeFeature(ctx)
  return ctx
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
    getContainerSize: () => ({ width: 400, height: 300 }),
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

function makeHandleLayer(): Pick<DomHandleLayer, 'showIndicator' | 'hideIndicator' | 'sync'> {
  return {
    showIndicator: mock(() => {}),
    hideIndicator: mock(() => {}),
    sync: mock(() => {}),
  }
}

describe('WebGridRuntime resize drag feature', () => {
  it('previews column resize and commits on pointerup', () => {
    const engine = makeMockGridEngine({ colWidth: 100 })
    const handleLayer = makeHandleLayer()
    const runtime = new WebGridRuntime({
      engine,
      context: makeContext(),
      host: makeHost(),
      renderer: makeRenderer(),
      handleLayer: handleLayer as DomHandleLayer,
    })

    runtime.handleResizePointerDown(columnHandle, 1, 100, 0)
    expect(engine.commitColumnResize).not.toHaveBeenCalled()
    expect(handleLayer.showIndicator).toHaveBeenCalled()

    runtime.handleResizePointerMove(1, 130, 0)
    expect(engine.commitColumnResize).not.toHaveBeenCalled()
    expect(handleLayer.showIndicator).toHaveBeenCalledTimes(2)

    runtime.handleResizePointerUp(1)
    expect(engine.commitColumnResize).toHaveBeenCalledTimes(1)
    expect(engine.commitColumnResize).toHaveBeenCalledWith(0, 100, 130)
    expect(handleLayer.hideIndicator).toHaveBeenCalled()
  })

  it('does not commit unchanged resize on pointerup', () => {
    const engine = makeMockGridEngine({ colWidth: 100 })
    const runtime = new WebGridRuntime({
      engine,
      context: makeContext(),
      host: makeHost(),
      renderer: makeRenderer(),
      handleLayer: makeHandleLayer() as DomHandleLayer,
    })

    runtime.handleResizePointerDown(columnHandle, 1, 100, 0)
    runtime.handleResizePointerUp(1)

    expect(engine.commitColumnResize).not.toHaveBeenCalled()
  })
})
