import { describe, it } from 'bun:test'
import {
  ChunkedAxis,
  FrozenRegions,
  InMemoryDataSource,
  Viewport,
  denseGridTheme,
  type DataSource,
  type MergeRegion,
  type RenderFrame,
  type Schema,
} from '@zhiguang/core'
import { Canvas2DRenderer } from '../../src/render/Canvas2DRenderer'
import { expectGolden } from '../helpers/golden'
import { dumpOps } from '../helpers/op-dump'
import { createRecordingContext } from '../helpers/recording-context'

/**
 * 整帧 op-log 黄金快照：锁定 layer 顺序（background→content→grid→overlay）、
 * save/clip/restore 配对、线 snap 与跳线语义。canvas2d 无 mbd 场景 taxonomy，
 * 行为契约以本文件 + 黄金文件呈现；针尖不变量仍由各 painter 单测表达意图。
 *
 * 更新：GOLDEN_UPDATE=1 bun test packages/canvas2d/tests/render/Canvas2DRenderer.oplog-golden.test.ts
 */

interface SetupOptions {
  readonly schema: Schema
  readonly rows: ReadonlyArray<Record<string, unknown>>
  readonly frozen?: { topRows?: number; leftCols?: number }
  readonly scroll?: { x: number; y: number }
}

function renderFrame(
  opts: SetupOptions,
  frameExtras: Partial<RenderFrame> = {},
): string {
  const { ctx, ops } = createRecordingContext()
  const data = new InMemoryDataSource({
    schema: opts.schema,
    rows: opts.rows as Array<Record<string, never>>,
  }) as DataSource
  const rowsAxis = new ChunkedAxis({
    count: data.getRowCount(),
    defaultSize: denseGridTheme.metrics.rowHeight,
  })
  const colsAxis = new ChunkedAxis({ count: opts.schema.fields.length, defaultSize: 80 })
  const frozen = new FrozenRegions(rowsAxis, colsAxis, opts.frozen ?? {})
  const viewport = new Viewport(rowsAxis, colsAxis, frozen)
  viewport.setSize(320, 160)
  viewport.setHeaderHeight(denseGridTheme.metrics.headerHeight)
  viewport.setScroll(opts.scroll?.x ?? 0, opts.scroll?.y ?? 0)

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
    ...frameExtras,
  })
  return dumpOps(ops)
}

const TEXT_SCHEMA: Schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text', width: 80 },
    { id: 'b', name: 'B', type: 'text', width: 80 },
  ],
}

describe('Canvas2DRenderer — 整帧 op-log 黄金快照', () => {
  it('oplog-base：2×2 文本网格基础帧', () => {
    const dump = renderFrame({
      schema: TEXT_SCHEMA,
      rows: [
        { a: 'A1', b: 'B1' },
        { a: 'A2', b: 'B2' },
      ],
    })
    expectGolden(import.meta.dir, 'oplog-base', dump)
  })

  it('oplog-format-merge-border-value：填充×合并×自定义边框×值格式组合帧', () => {
    const schema: Schema = {
      fields: [
        { id: 'a', name: 'A', type: 'text', width: 80 },
        { id: 'b', name: 'B', type: 'text', width: 80 },
        { id: 'n', name: 'N', type: 'number', width: 80 },
      ],
    }
    // A1:B2 合并（anchor 填充扩展整块）；(0,2) 独立填充；(2,2) 红边框；(2,2) 数字走 formatCell。
    const merge: MergeRegion = {
      id: 'merge-1',
      range: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
      anchor: { rowIndex: 0, colIndex: 0 },
    }
    const red = { color: '#d93025', width: 'thin', lineStyle: 'solid' } as const
    const dump = renderFrame(
      {
        schema,
        rows: [
          { a: 'A1', b: 'B1', n: 1 },
          { a: 'A2', b: 'B2', n: 2 },
          { a: 'A3', b: 'B3', n: 0.135 },
        ],
      },
      {
        mergeRegions: [merge],
        cellFormats: [
          { rowIndex: 0, colIndex: 0, format: { fillColor: '#fff2cc' } },
          { rowIndex: 0, colIndex: 2, format: { fillColor: '#d9ead3' } },
          { rowIndex: 2, colIndex: 2, format: { borders: { right: red, bottom: red } } },
        ],
        formatCell: (rowIndex, colIndex, _field, value) =>
          rowIndex === 2 && colIndex === 2 && typeof value === 'number'
            ? `${(value * 100).toFixed(1)}%`
            : undefined,
      },
    )
    expectGolden(import.meta.dir, 'oplog-format-merge-border-value', dump)
  })

  it('oplog-frozen-quadrants：冻结行列 + 滚动偏移的四象限帧', () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ a: `A${i + 1}`, b: `B${i + 1}` }))
    const dump = renderFrame({
      schema: TEXT_SCHEMA,
      rows,
      frozen: { topRows: 1, leftCols: 1 },
      scroll: { x: 30, y: 30 },
    })
    expectGolden(import.meta.dir, 'oplog-frozen-quadrants', dump)
  })

  it('oplog-overflow-translucent：溢出文字跳线 + 半透明填充 under-line 帧', () => {
    // row0：长文本溢出穿越 col0|col1 边界（该竖线段跳过不画）；
    // row1：相邻两格半透明填充（共享边在填充前以 under-line 描出，alpha 衰减后隐约可见）。
    const dump = renderFrame(
      {
        schema: TEXT_SCHEMA,
        rows: [
          { a: 'x'.repeat(20), b: '' },
          { a: 'A2', b: 'B2' },
        ],
      },
      {
        cellFormats: [
          { rowIndex: 1, colIndex: 0, format: { fillColor: 'rgba(255,0,0,0.3)' } },
          { rowIndex: 1, colIndex: 1, format: { fillColor: 'rgba(255,0,0,0.3)' } },
        ],
      },
    )
    expectGolden(import.meta.dir, 'oplog-overflow-translucent', dump)
  })
})
