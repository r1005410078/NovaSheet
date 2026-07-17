import { describe, expect, it } from 'bun:test'
import {
  ChunkedAxis,
  FrozenRegions,
  InMemoryDataSource,
  Viewport,
  denseGridTheme,
  type Schema,
} from '@zhiguang/novasheet-core'
import { Canvas2DRenderer } from '../../src/render/Canvas2DRenderer'
import { createRecordingContext } from '../helpers/recording-context'

const SCHEMA: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 100 },
    { id: 'val', name: 'Val', type: 'text', width: 100 },
  ],
}

function setup() {
  const { ctx, ops } = createRecordingContext()
  const data = new InMemoryDataSource({
    schema: SCHEMA,
    rows: [{ name: 'Hello', val: 'World' }],
  })
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
  const renderer = new Canvas2DRenderer({
    ctx,
    data,
    viewport,
    rowsAxis,
    colsAxis,
    theme: denseGridTheme,
  })
  return { ctx, ops, data, viewport, rowsAxis, colsAxis, renderer }
}

describe('Canvas2DRenderer — format fill 阶段', () => {
  it('带 fillColor 的 cellFormats 在文本绘制前发出 fillRect', () => {
    const { renderer, ops, viewport, data, rowsAxis, colsAxis } = setup()

    renderer.render({
      data,
      theme: denseGridTheme,
      rowsAxis,
      colsAxis,
      viewport: viewport.snapshot(),
      collapsedRowGaps: [],
      collapsedColGaps: [],
      cellFormats: [{ rowIndex: 0, colIndex: 0, format: { fillColor: '#fff2cc' } }],
    })

    // fillStyle '#fff2cc' 必须出现
    expect(ops).toContainEqual({ op: 'set:fillStyle', value: '#fff2cc' })

    // fillRect 对应 row0 col0 必须出现
    const hasFillRect = ops.some((o) => o.op === 'fillRect' && o.args[0] !== undefined)
    expect(hasFillRect).toBe(true)

    // 填充（set:fillStyle '#fff2cc'）必须在文字 'Hello' 的 fillText 之前
    const fillStyleIdx = ops.findIndex(
      (o) => o.op === 'set:fillStyle' && (o as { op: 'set:fillStyle'; value: unknown }).value === '#fff2cc',
    )
    const fillTextIdx = ops.findIndex(
      (o) => o.op === 'fillText' && (o as { op: 'fillText'; args: [string, number, number] }).args[0] === 'Hello',
    )
    expect(fillStyleIdx).toBeGreaterThanOrEqual(0)
    expect(fillTextIdx).toBeGreaterThan(fillStyleIdx)
  })

  it('半透明 fillColor 在填充前以 theme.gridLine 色描出底层格线', () => {
    const { renderer, ops, viewport, data, rowsAxis, colsAxis } = setup()

    renderer.render({
      data,
      theme: denseGridTheme,
      rowsAxis,
      colsAxis,
      viewport: viewport.snapshot(),
      collapsedRowGaps: [],
      collapsedColGaps: [],
      cellFormats: [{ rowIndex: 0, colIndex: 0, format: { fillColor: 'rgba(255,242,204,0.4)' } }],
    })

    const fillIdx = ops.findIndex(
      (o) => o.op === 'set:fillStyle' && o.value === 'rgba(255,242,204,0.4)',
    )
    const strokeStyleIdx = ops.findIndex(
      (o) => o.op === 'set:strokeStyle' && o.value === denseGridTheme.colors.gridLine,
    )
    expect(fillIdx).toBeGreaterThanOrEqual(0)
    expect(strokeStyleIdx).toBeGreaterThanOrEqual(0)
    expect(strokeStyleIdx).toBeLessThan(fillIdx)
  })

  it('不透明 fillColor 填充前不描格线（既有行为不变）', () => {
    const { renderer, ops, viewport, data, rowsAxis, colsAxis } = setup()

    renderer.render({
      data,
      theme: denseGridTheme,
      rowsAxis,
      colsAxis,
      viewport: viewport.snapshot(),
      collapsedRowGaps: [],
      collapsedColGaps: [],
      cellFormats: [{ rowIndex: 0, colIndex: 0, format: { fillColor: '#fff2cc' } }],
    })

    const fillIdx = ops.findIndex((o) => o.op === 'set:fillStyle' && o.value === '#fff2cc')
    const strokeBefore = ops.slice(0, fillIdx).some((o) => o.op === 'stroke')
    expect(fillIdx).toBeGreaterThanOrEqual(0)
    expect(strokeBefore).toBe(false)
  })

  it('无 cellFormats 时不影响正常渲染', () => {
    const { renderer, ops, viewport, data, rowsAxis, colsAxis } = setup()

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
      .map((o) => (o as { op: 'fillText'; args: [string, number, number] }).args[0])
    expect(texts).toContain('Hello')
  })
})
