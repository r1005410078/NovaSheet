import { describe, expect, it } from 'bun:test'
import { ChunkedAxis, denseGridTheme } from '@novasheet/core'
import { RowHeaderPainter } from '../../src/painters/RowHeaderPainter'
import { createRecordingContext } from '../helpers/recording-context'

describe('RowHeaderPainter', () => {
  it('绘制 1-based 行号', () => {
    const { ctx, ops } = createRecordingContext(200, 200)
    const rowsAxis = new ChunkedAxis({ count: 5, defaultSize: 28 })
    new RowHeaderPainter(denseGridTheme).paint(ctx, {
      rowsAxis,
      rowRange: [0, 2],
      rect: { x: 0, y: 32, width: 44, height: 120 },
      scrollOffsetY: 0,
    })
    const texts = ops
      .filter((o) => o.op === 'fillText')
      .map((o) => (o.op === 'fillText' ? o.args[0] : ''))
    expect(texts).toContain('1')
    expect(texts).toContain('2')
    expect(texts).toContain('3')
  })

  it('绘制行号列水平网格线与右侧强分隔线', () => {
    const { ctx, ops } = createRecordingContext(200, 200)
    const rowsAxis = new ChunkedAxis({ count: 5, defaultSize: 28 })
    new RowHeaderPainter(denseGridTheme).paint(ctx, {
      rowsAxis,
      rowRange: [0, 2],
      rect: { x: 0, y: 32, width: 44, height: 120 },
      scrollOffsetY: 0,
    })
    expect(ops.filter((o) => o.op === 'stroke').length).toBeGreaterThanOrEqual(2)
  })

  it('整行选中时行头使用强选中背景与选中文字色', () => {
    const { ctx, ops } = createRecordingContext(200, 200)
    const rowsAxis = new ChunkedAxis({ count: 5, defaultSize: 28 })
    new RowHeaderPainter(denseGridTheme).paint(ctx, {
      rowsAxis,
      rowRange: [0, 2],
      rect: { x: 0, y: 32, width: 44, height: 120 },
      scrollOffsetY: 0,
      selectedRowRange: { startRow: 1, endRow: 1 },
    })

    expect(ops).toContainEqual({ op: 'set:fillStyle', value: denseGridTheme.colors.selectionBorder })
    expect(ops).toContainEqual({ op: 'fillRect', args: [0, 60, 44, 28] })
    expect(ops).toContainEqual({ op: 'set:fillStyle', value: denseGridTheme.colors.selectionText })
  })
})
