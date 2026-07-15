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

  it('优先绘制调用方提供的 string 与有限 number 行头标签', () => {
    const { ctx, ops } = createRecordingContext(240, 200)
    const rowsAxis = new ChunkedAxis({ count: 3, defaultSize: 28 })
    const labels = ['设备-001', 2002, '设备-003'] as const

    new RowHeaderPainter(denseGridTheme).paint(ctx, {
      rowsAxis,
      rowRange: [0, 2],
      rect: { x: 0, y: 32, width: 80, height: 120 },
      scrollOffsetY: 0,
      resolveLabel: (rowIndex) => labels[rowIndex],
    })

    const texts = ops
      .filter((op) => op.op === 'fillText')
      .map((op) => (op.op === 'fillText' ? op.args[0] : ''))
    expect(texts).toEqual(['设备-001', '2002', '设备-003'])
  })

  it('缺失或不支持的标签值回退 1-based 行号，空字符串保持有效', () => {
    const { ctx, ops } = createRecordingContext(240, 320)
    const rowsAxis = new ChunkedAxis({ count: 8, defaultSize: 28 })
    const labels = [
      undefined,
      null,
      true,
      ['x'],
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      '',
    ] as const

    new RowHeaderPainter(denseGridTheme).paint(ctx, {
      rowsAxis,
      rowRange: [0, 7],
      rect: { x: 0, y: 32, width: 80, height: 240 },
      scrollOffsetY: 0,
      resolveLabel: (rowIndex) => labels[rowIndex],
    })

    const texts = ops
      .filter((op) => op.op === 'fillText')
      .map((op) => (op.op === 'fillText' ? op.args[0] : ''))
    expect(texts).toEqual(['1', '2', '3', '4', '5', '6', '7', ''])
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

  it('paintCorner 按传入的 headerHeight 绘制角块（列组场景下为表头总高，而非 theme.metrics.headerHeight）', () => {
    const { ctx, ops } = createRecordingContext(200, 200)
    const totalHeaderHeight = denseGridTheme.metrics.headerHeight + 2 * denseGridTheme.metrics.groupHeaderRowHeight
    new RowHeaderPainter(denseGridTheme).paintCorner(ctx, 44, totalHeaderHeight)
    expect(ops).toContainEqual({ op: 'fillRect', args: [0, 0, 44, totalHeaderHeight] })
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
