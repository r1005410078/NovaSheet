import { describe, expect, it, mock } from 'bun:test'
import {
  createSheetContext,
  DefaultGridEngine,
  InMemoryDataSource,
  denseGridTheme,
} from '@novasheet/core'
import type { Row, Schema } from '@novasheet/core'
import { WebGridRuntime, type WebHost, type WebRenderer } from '@novasheet/web'
import { installFillHandleFeature } from '../src'

function bigEngine(cols = 12, rows = 60): DefaultGridEngine {
  const schema: Schema = {
    fields: Array.from({ length: cols }, (_, i) => ({
      id: `c${i}`,
      name: `C${i}`,
      type: 'text' as const,
      width: 100,
    })),
  }
  const data = new InMemoryDataSource({
    schema,
    rows: Array.from(
      { length: rows },
      (_, r) => Object.fromEntries(schema.fields.map((f) => [f.id, `${f.id}-${r}`])) as Row,
    ),
  })
  const engine = new DefaultGridEngine({ data, theme: denseGridTheme, excelHeaders: true })
  engine.setViewportSize(300, 200) // 列总宽 1200、行总高远大于视口，留出双向滚动空间
  return engine
}

function trackingHost(): {
  host: WebHost
  pos: { top: number; left: number }
  container: HTMLElement
} {
  const pos = { top: 0, left: 0 }
  const container = document.createElement('div')
  const host = {
    attach: mock(() => {}),
    applyScrollbarTheme: mock(() => {}),
    setScrollSize: mock(() => {}),
    setCursor: mock(() => {}),
    scrollTo: mock((top: number, left: number) => {
      pos.top = top
      pos.left = left
    }),
    getScrollPosition: () => ({ scrollTop: pos.top, scrollLeft: pos.left }),
    getDpr: () => 1,
    getContainerSize: () => ({ width: 300, height: 200 }),
    getContainerBoundingRect: () => ({ left: 0, top: 0 }),
    focusScrollHost: mock(() => {}),
    destroy: mock(() => {}),
    container,
  } satisfies WebHost
  return { host, pos, container }
}

function makeRenderer(): WebRenderer {
  return {
    mount: mock(() => {}),
    resize: mock(() => {}),
    render: mock(() => {}),
    destroy: mock(() => {}),
  }
}

function withRaf(run: (flush: () => void) => void): void {
  const rafs: FrameRequestCallback[] = []
  const original = globalThis.requestAnimationFrame
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    rafs.push(cb)
    return rafs.length
  }) as typeof requestAnimationFrame
  try {
    run(() => rafs[rafs.length - 1]?.(performance.now()))
  } finally {
    globalThis.requestAnimationFrame = original
  }
}

function makeContext() {
  const ctx = createSheetContext()
  installFillHandleFeature(ctx)
  return ctx
}

function dispatchPointer(el: HTMLElement, type: string, init: PointerEventInit): void {
  el.dispatchEvent(new PointerEvent(type, { bubbles: true, ...init }))
}

describe('WebGridRuntime drag auto-scroll — 填充柄', () => {
  it('填充柄拖到右下角时双向滚动', () => {
    const engine = bigEngine()
    engine.setSelection({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 0, colIndex: 0 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
    })
    const { host, pos, container } = trackingHost()
    const runtime = new WebGridRuntime({
      engine,
      context: makeContext(),
      host,
      renderer: makeRenderer(),
    })
    const handle = container.querySelector('[data-novasheet-fill-handle]') as HTMLElement

    withRaf((flush) => {
      dispatchPointer(handle, 'pointerdown', { pointerId: 1, clientX: 100, clientY: 100 })
      dispatchPointer(handle, 'pointermove', { pointerId: 1, clientX: 292, clientY: 192 }) // 右下角双边缘热区
      flush()
    })

    expect(host.scrollTo).toHaveBeenCalled()
    expect(pos.left).toBeGreaterThan(0)
    expect(pos.top).toBeGreaterThan(0)
    runtime.destroy()
  })
})
