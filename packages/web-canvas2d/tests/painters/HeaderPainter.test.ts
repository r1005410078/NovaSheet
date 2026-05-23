import { describe, expect, it } from 'bun:test'
import { ChunkedAxis, denseGridTheme, type Schema, type ViewPipeline } from '@novasheet/core'
import { HeaderPainter } from '../../src/painters/HeaderPainter'
import { createRecordingContext } from '../helpers/recording-context'

const SCHEMA: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 200 },
    { id: 'age', name: 'Age', type: 'number', width: 80 },
    { id: 'flag', name: 'Active', type: 'checkbox', width: 60 },
  ],
}

describe('HeaderPainter — 列头', () => {
  it('按 headerHeight 铺满列头背景', () => {
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis,
      colRange: [0, 2],
      width: 400,
    })
    const bgFill = ops.find(
      (o) =>
        o.op === 'fillRect' &&
        o.args[1] === 0 &&
        o.args[3] === denseGridTheme.metrics.headerHeight,
    )
    expect(bgFill).toBeDefined()
    expect(ops).toContainEqual({ op: 'set:fillStyle', value: denseGridTheme.colors.headerBackground })
  })

  it('绘制可见列名字段名', () => {
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis,
      colRange: [0, 2],
      width: 400,
    })
    const texts = ops.filter((o) => o.op === 'fillText').map((o) => (o.op === 'fillText' ? o.args[0] : ''))
    expect(texts).toContain('Name')
    expect(texts).toContain('Age')
    expect(texts).toContain('Active')
  })

  it('绘制排序筛选状态图标并为文字预留空间', () => {
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })
    const viewPipeline = {
      collectHeaderDecorations: (field: { id: string }) =>
        field.id === 'name' ? { sortIndicator: 'asc' as const, filterActive: true } : {},
    } as Pick<ViewPipeline, 'collectHeaderDecorations'>

    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis,
      colRange: [0, 2],
      width: 400,
      viewPipeline,
    })

    expect(ops.filter((o) => o.op === 'fillPath')).toHaveLength(2)
    const nameTxt = ops.find(
      (o): o is { op: 'fillText'; args: [string, number, number, number?] } =>
        o.op === 'fillText' && o.args[0] === 'Name',
    )
    expect(nameTxt).toBeDefined()
    expect(nameTxt!.args[3]).toBeLessThan(100 - denseGridTheme.metrics.cellPaddingX * 2)
  })

  it('列头文字使用 headerText 色', () => {
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis,
      colRange: [0, 2],
      width: 400,
    })
    expect(ops).toContainEqual({ op: 'set:fillStyle', value: denseGridTheme.colors.headerText })
  })

  it('scrollOffsetX 使列头随横向滚动', () => {
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis,
      colRange: [0, 2],
      width: 400,
      scrollOffsetX: 100, // scrolled right by one column-width
    })
    // 'Name' is field 0 (at content x=0). With scrollOffsetX=100 and padX=8:
    //   without subtraction → x = 0 + 8 = 8 (wrong: drawn at the LEFT edge after scroll)
    //   with subtraction    → x = 0 - 100 + 8 = -92 (correct: clipped off-canvas left)
    // 'Age' is field 1 (at content x=100). With scrollOffsetX=100:
    //   with subtraction → x = 100 - 100 + 8 = 8 (now at the LEFT edge — the new leftmost visible col)
    const nameTxt = ops.find(
      (o): o is { op: 'fillText'; args: [string, number, number, number?] } =>
        o.op === 'fillText' && o.args[0] === 'Name',
    )
    const ageTxt = ops.find(
      (o): o is { op: 'fillText'; args: [string, number, number, number?] } =>
        o.op === 'fillText' && o.args[0] === 'Age',
    )
    expect(nameTxt).toBeDefined()
    expect(nameTxt!.args[1]).toBe(-92)
    expect(ageTxt).toBeDefined()
    expect(ageTxt!.args[1]).toBe(8)
  })

  it('绘制列头单元格竖线与底边', () => {
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis,
      colRange: [0, 2],
      width: 400,
    })
    expect(ops.some((o) => o.op === 'stroke')).toBe(true)
    const strokeStyle = ops.find((o) => o.op === 'set:strokeStyle' && o.value === denseGridTheme.colors.gridLine)
    expect(strokeStyle).toBeDefined()
  })

  it('columnLetters 绘制 Excel 列标', () => {
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis,
      colRange: [0, 2],
      width: 400,
      columnLetters: true,
    })
    const texts = ops.filter((o) => o.op === 'fillText').map((o) => (o.op === 'fillText' ? o.args[0] : ''))
    expect(texts).toEqual(['A', 'B', 'C'])
  })

  it('省略 scrollOffsetX 时默认为 0', () => {
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis,
      colRange: [0, 2],
      width: 400,
      // scrollOffsetX omitted
    })
    const nameTxt = ops.find(
      (o): o is { op: 'fillText'; args: [string, number, number, number?] } =>
        o.op === 'fillText' && o.args[0] === 'Name',
    )
    expect(nameTxt!.args[1]).toBe(8) // x = 0 + padX
  })
})
