import { describe, expect, it, mock } from 'bun:test'
import { DefaultGridEngine, InMemoryDataSource, denseGridTheme } from '@novasheet/core'
import type { Row, Schema } from '@novasheet/core'
import type { WebHost } from '../../src/host/WebHost'
import type { WebRenderer } from '../../src/render/WebRenderer'
import { WebGridRuntime } from '../../src/runtime/WebGridRuntime'

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

function trackingHost(): { host: WebHost; pos: { top: number; left: number } } {
  const pos = { top: 0, left: 0 }
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
    container: document.createElement('div'),
  } satisfies WebHost
  return { host, pos }
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

describe('WebGridRuntime drag auto-scroll — 填充柄', () => {
  it('填充柄拖到右下角时双向滚动', () => {
    const engine = bigEngine()
    engine.setSelection({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 0, colIndex: 0 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
    })
    const { host, pos } = trackingHost()
    const runtime = new WebGridRuntime({ engine, host, renderer: makeRenderer() })

    withRaf((flush) => {
      runtime.handleFillPointerDown(1, 100, 100)
      runtime.handleFillPointerMove(1, 292, 192) // 右下角双边缘热区
      flush()
    })

    expect(host.scrollTo).toHaveBeenCalled()
    expect(pos.left).toBeGreaterThan(0)
    expect(pos.top).toBeGreaterThan(0)
  })
})
