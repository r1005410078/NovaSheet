import { describe, expect, it } from 'bun:test'
import {
  ChunkedAxis,
  FrozenRegions,
  InMemoryDataSource,
  Viewport,
  denseGridTheme,
  type Schema,
} from '@zhiguang/core'
import { Canvas2DRenderer } from '../../src/render/Canvas2DRenderer'
import { createRecordingContext } from '../helpers/recording-context'

const SCHEMA: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 100 },
    { id: 'val', name: 'Val', type: 'text', width: 100 },
  ],
}

function setup(rows: Array<Record<string, string>>) {
  const { ctx, ops } = createRecordingContext()
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
  const renderer = new Canvas2DRenderer({
    ctx,
    data,
    viewport,
    rowsAxis,
    colsAxis,
    theme: denseGridTheme,
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
}

// RecordingContext measureText = 7px/char；col 宽 100、padX 8 → 超过 ~13 字符即溢出。
// headerHeight 32、rowHeight 28：body 区 y∈[32,200]，row0 底 y=60；col0|col1 竖线 x=100.5。
describe('Canvas2DRenderer — overflow 文字穿越的网格竖线段', () => {
  it('文字溢出穿越 col0|col1 边界时，该竖线 row0 段被跳过', () => {
    const ops = setup([
      { name: 'x'.repeat(20), val: '' }, // 140px > 92px 可用宽，右邻空 → 溢出穿越 x=100 边界
      { name: 'a', val: 'b' },
    ])
    expect(ops).not.toContainEqual({ op: 'moveTo', args: [100.5, 32] })
    expect(ops).toContainEqual({ op: 'moveTo', args: [100.5, 60] })
  })

  it('文字未溢出时竖线整段保留（基线）', () => {
    const ops = setup([
      { name: 'short', val: '' },
      { name: 'a', val: 'b' },
    ])
    expect(ops).toContainEqual({ op: 'moveTo', args: [100.5, 32] })
  })

  it('右邻非空（无溢出扩展）时竖线整段保留', () => {
    const ops = setup([
      { name: 'x'.repeat(20), val: 'busy' },
      { name: 'a', val: 'b' },
    ])
    expect(ops).toContainEqual({ op: 'moveTo', args: [100.5, 32] })
  })
})
