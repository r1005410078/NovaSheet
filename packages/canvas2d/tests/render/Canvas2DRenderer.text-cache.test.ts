import { describe, expect, it, spyOn } from 'bun:test'
import {
  ChunkedAxis,
  FrozenRegions,
  InMemoryDataSource,
  Viewport,
  denseGridTheme,
  type Schema,
  type Theme,
} from '@novasheet/core'
import { Canvas2DRenderer } from '../../src/render/Canvas2DRenderer'
import { createRecordingContext } from '../helpers/recording-context'

const SCHEMA: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 100 },
    { id: 'val', name: 'Val', type: 'text', width: 100 },
  ],
}

function setup() {
  const { ctx } = createRecordingContext()
  // 长文本 + 右邻空 → 每行触发 overflowExtra 的 measureText
  const rows = Array.from({ length: 4 }, (_, i) => ({ name: `${'x'.repeat(20)}${i}`, val: '' }))
  const data = new InMemoryDataSource({ schema: SCHEMA, rows })
  const rowsAxis = new ChunkedAxis({
    count: data.getRowCount(),
    defaultSize: denseGridTheme.metrics.rowHeight,
  })
  const colsAxis = new ChunkedAxis({ count: SCHEMA.fields.length, defaultSize: 100 })
  const frozen = new FrozenRegions(rowsAxis, colsAxis, {})
  const viewport = new Viewport(rowsAxis, colsAxis, frozen)
  viewport.setSize(400, 200)
  viewport.setHeaderHeight(denseGridTheme.metrics.headerHeight)
  viewport.setScroll(0, 0)
  const renderer = new Canvas2DRenderer({ ctx, data, viewport, rowsAxis, colsAxis, theme: denseGridTheme })
  const frame = (theme: Theme) => ({
    data,
    theme,
    rowsAxis,
    colsAxis,
    viewport: viewport.snapshot(),
    collapsedRowGaps: [],
    collapsedColGaps: [],
  })
  return { ctx, renderer, frame }
}

describe('Canvas2DRenderer — 文本宽度缓存', () => {
  it('相同 frame 第二次 render 不再调用 measureText', () => {
    const { ctx, renderer, frame } = setup()
    const spy = spyOn(ctx, 'measureText')

    renderer.render(frame(denseGridTheme))
    expect(spy.mock.calls.length).toBeGreaterThan(0) // 首帧必然量度

    spy.mockClear()
    renderer.render(frame(denseGridTheme))
    expect(spy.mock.calls.length).toBe(0) // overflowExtra 与 CellPainter 截断均命中缓存
  })

  it('theme 变更清空缓存后重新量度', () => {
    const { ctx, renderer, frame } = setup()
    renderer.render(frame(denseGridTheme))

    const theme2: Theme = {
      ...denseGridTheme,
      metrics: { ...denseGridTheme.metrics, fontSize: denseGridTheme.metrics.fontSize + 2 },
    }
    renderer.setTheme(theme2)
    expect(
      (renderer as unknown as { textWidthCache: Map<string, number> }).textWidthCache.size,
    ).toBe(0)

    const spy = spyOn(ctx, 'measureText')
    spy.mockClear()
    renderer.render(frame(theme2))
    expect(spy.mock.calls.length).toBeGreaterThan(0)
  })
})
