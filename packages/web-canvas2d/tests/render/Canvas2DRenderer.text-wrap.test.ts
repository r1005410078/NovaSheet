import { describe, expect, it } from 'bun:test'
import {
  ChunkedAxis,
  FrozenRegions,
  InMemoryDataSource,
  Viewport,
  denseGridTheme,
  type Schema,
  type TextMeasurer,
} from '@novasheet/core'
import { Canvas2DRenderer } from '../../src/render/Canvas2DRenderer'
import { createRecordingContext } from '../helpers/recording-context'

const SCHEMA: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 100 },
    { id: 'val', name: 'Val', type: 'text', width: 100 },
  ],
}

const measurer: TextMeasurer = { measureWidth: (t) => t.length * 7 }

function setup(rowHeight: number) {
  const { ctx, ops } = createRecordingContext()
  const data = new InMemoryDataSource({
    schema: SCHEMA,
    rows: [{ name: 'Hello World Foo Bar', val: null }], // val 空 → 只有 name 格绘文本
  })
  const rowsAxis = new ChunkedAxis({ count: 1, defaultSize: rowHeight })
  const colsAxis = new ChunkedAxis({ count: SCHEMA.fields.length, defaultSize: 100 })
  const frozen = new FrozenRegions(rowsAxis, colsAxis, 0, 0)
  const viewport = new Viewport(rowsAxis, colsAxis, frozen)
  viewport.setSize(400, 200)
  viewport.setHeaderHeight(denseGridTheme.metrics.headerHeight)
  viewport.setScroll(0, 0)
  const renderer = new Canvas2DRenderer({
    ctx,
    data,
    viewport,
    rowsAxis,
    colsAxis,
    theme: denseGridTheme,
    measurer,
  })
  return { ctx, ops, data, viewport, rowsAxis, colsAxis, renderer }
}

describe('Canvas2DRenderer — textWrap 透传', () => {
  it('cellFormats.textWrap=wrap 驱动折行（多行 fillText）', () => {
    const { renderer, ops, viewport, data, rowsAxis, colsAxis } = setup(60)
    renderer.render({
      data,
      theme: denseGridTheme,
      rowsAxis,
      colsAxis,
      viewport: viewport.snapshot(),
      collapsedRowGaps: [],
      collapsedColGaps: [],
      cellFormats: [{ rowIndex: 0, colIndex: 0, format: { textWrap: 'wrap' } }],
    })
    const texts = ops
      .filter((o) => o.op === 'fillText')
      .map((o) => (o.op === 'fillText' ? (o.args[0] as string) : ''))
    // 折成两行：'Hello World' 与 'Foo Bar'（排除表头文本干扰，按内容断言）
    expect(texts.some((t) => t.startsWith('Hello World'))).toBe(true)
    expect(texts.some((t) => t.includes('Foo Bar'))).toBe(true)
  })

  it('无 textWrap（overflow 默认）单行硬裁断、无省略号', () => {
    const { renderer, ops, viewport, data, rowsAxis, colsAxis } = setup(28)
    renderer.render({
      data,
      theme: denseGridTheme,
      rowsAxis,
      colsAxis,
      viewport: viewport.snapshot(),
      collapsedRowGaps: [],
      collapsedColGaps: [],
    })
    const texts = ops
      .filter((o) => o.op === 'fillText')
      .map((o) => (o.op === 'fillText' ? (o.args[0] as string) : ''))
    expect(texts.some((t) => t.startsWith('Hello World'))).toBe(true) // 单行硬裁断
    expect(texts.some((t) => t.includes('…'))).toBe(false) // 全程无省略号
  })
})

function overflowSetup(valValue: string | null) {
  const { ctx, ops } = createRecordingContext()
  const data = new InMemoryDataSource({
    schema: SCHEMA,
    rows: [{ name: 'A very long text that overflows', val: valValue }],
  })
  const rowsAxis = new ChunkedAxis({ count: 1, defaultSize: 28 })
  const colsAxis = new ChunkedAxis({ count: SCHEMA.fields.length, defaultSize: 100 })
  const frozen = new FrozenRegions(rowsAxis, colsAxis, 0, 0)
  const viewport = new Viewport(rowsAxis, colsAxis, frozen)
  viewport.setSize(400, 200)
  viewport.setHeaderHeight(denseGridTheme.metrics.headerHeight)
  viewport.setScroll(0, 0)
  const renderer = new Canvas2DRenderer({
    ctx,
    data,
    viewport,
    rowsAxis,
    colsAxis,
    theme: denseGridTheme,
    measurer,
  })
  renderer.render({
    data,
    theme: denseGridTheme,
    rowsAxis,
    colsAxis,
    viewport: viewport.snapshot(),
    collapsedRowGaps: [],
    collapsedColGaps: [],
  })
  return ops
    .filter((o) => o.op === 'fillText')
    .map((o) => (o.op === 'fillText' ? (o.args[0] as string) : ''))
}

describe('Canvas2DRenderer — overflow 溢出到右侧空格', () => {
  it('右邻格为空时溢出（显示更多字符）', () => {
    const texts = overflowSetup(null) // val 空
    const name = texts.find((t) => t.startsWith('A very'))!
    expect(name.length).toBeGreaterThan(13) // 溢入 2 格，远超单格 ~12 字符
  })

  it('右邻格有内容时裁断到本格', () => {
    const texts = overflowSetup('X') // val 占用
    const name = texts.find((t) => t.startsWith('A very'))!
    expect(name.length).toBeLessThanOrEqual(13) // 仅本格 84px → ~12 字符
  })
})
