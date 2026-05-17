import { describe, expect, it } from 'bun:test'
import {
  ChunkedAxis,
  FrozenRegions,
  InMemoryDataSource,
  Viewport,
  denseGridTheme,
  type Schema,
} from '@novasheet/core'
import { Canvas2DRenderer } from '../../src/render/Canvas2DRenderer'
import { createRecordingContext } from '../helpers/recording-context'

const SCHEMA: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 100 },
    { id: 'age', name: 'Age', type: 'number', width: 80 },
  ],
}

describe('Canvas2DRenderer — regions 绘制', () => {
  function setup() {
    const { ctx, ops } = createRecordingContext()
    const data = new InMemoryDataSource({
      schema: SCHEMA,
      rows: [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
        { name: 'Carol', age: 40 },
      ],
    })
    const rowsAxis = new ChunkedAxis({ count: data.getRowCount(), defaultSize: denseGridTheme.metrics.rowHeight })
    const colsAxis = new ChunkedAxis({ count: SCHEMA.fields.length, defaultSize: 100 })
    const frozen = new FrozenRegions(rowsAxis, colsAxis, 0, 0)
    const viewport = new Viewport(rowsAxis, colsAxis, frozen)
    viewport.setSize(400, 200)
    viewport.setHeaderHeight(denseGridTheme.metrics.headerHeight)
    viewport.setScroll(0, 0)
    const renderer = new Canvas2DRenderer({ ctx, data, viewport, rowsAxis, colsAxis, theme: denseGridTheme })
    return { ctx, ops, data, viewport, rowsAxis, colsAxis, renderer }
  }

  it('paint 清背景并绘制列头与可见单元格', () => {
    const { renderer, ops } = setup()
    renderer.paint()
    // background fill at the start
    const firstBgFill = ops.find((o) => o.op === 'fillRect')
    expect(firstBgFill).toBeDefined()
    // header texts present
    const texts = ops.filter((o) => o.op === 'fillText').map((o) => (o.op === 'fillText' ? o.args[0] : ''))
    expect(texts).toContain('Name')
    expect(texts).toContain('Age')
    expect(texts).toContain('Alice')
    expect(texts).toContain('Bob')
    expect(texts).toContain('Carol')
  })

  it('invalidate 经 FrameScheduler 调度 paint', () => {
    // Use mocked RAF
    const rafs: Array<() => void> = []
    const originalRaf = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = ((cb: () => void) => {
      rafs.push(cb)
      return rafs.length
    }) as typeof requestAnimationFrame

    const { renderer, ops } = setup()
    ops.length = 0
    renderer.invalidate()
    expect(rafs).toHaveLength(1)
    rafs[0]!()
    expect(ops.filter((o) => o.op === 'fillText').length).toBeGreaterThan(0)

    globalThis.requestAnimationFrame = originalRaf
  })

  it('纵向滚动时 cellY 减去 scrollY', () => {
    const { ops, viewport, renderer } = setup()
    viewport.setScroll(0, 56) // scroll down by 2 rows (28px each)
    ops.length = 0
    renderer.paint()
    // Carol is row 2. With M2 subtraction: cellY = rect.y(32) + yTop(56) - scrollY(56) = 32.
    // text rendering uses textBaseline=middle, fillText y = cellY + rowHeight/2 = 32 + 14 = 46.
    // Without subtraction: cellY = 88, fillText y = 102. So 46 is the discriminator.
    const carol = ops.find(
      (o): o is { op: 'fillText'; args: [string, number, number, number?] } =>
        o.op === 'fillText' && o.args[0] === 'Carol',
    )
    expect(carol).toBeDefined()
    expect(carol!.args[2]).toBe(46)
  })

  it('render 使用 frame.viewport 滚动而非构造期 viewport', () => {
    const { renderer, ops, viewport, data, rowsAxis, colsAxis } = setup()
    viewport.setScroll(0, 56)
    const scrolledFrame = {
      data,
      theme: denseGridTheme,
      rowsAxis,
      colsAxis,
      viewport: viewport.snapshot(),
    }
    viewport.setScroll(0, 0)
    ops.length = 0
    renderer.render(scrolledFrame)
    const carol = ops.find(
      (o): o is { op: 'fillText'; args: [string, number, number, number?] } =>
        o.op === 'fillText' && o.args[0] === 'Carol',
    )
    expect(carol).toBeDefined()
    expect(carol!.args[2]).toBe(46)
  })

  it('横向滚动时 cellX 减去 scrollX', () => {
    const { ops, viewport, renderer } = setup()
    viewport.setScroll(100, 0) // scroll right by 100px = 1 col
    ops.length = 0
    renderer.paint()
    // After scroll, visible col range = [1, 1] (Age only). Body cells render values "30","25","40"
    // via paintNumber (right-aligned). Test's ChunkedAxis uses defaultSize=100 (not the schema
    // widths of 100/80 — those would be applied by Grid.applyFieldWidths, which the bare Renderer
    // test setup skips). So colWidth = 100 here.
    // With M2 subtraction:    cellX = rect.x(0) + xLeft(100) - scrollX(100) = 0; fillText x = 0 + 100 - 8 = 92.
    // Without subtraction:    cellX = 100;                                       fillText x = 192.
    // 92 is the discriminator that fails without scroll subtraction.
    const thirty = ops.find(
      (o): o is { op: 'fillText'; args: [string, number, number, number?] } =>
        o.op === 'fillText' && o.args[0] === '30',
    )
    expect(thirty).toBeDefined()
    expect(thirty!.args[1]).toBe(92)
  })

  it('绘制冻结行列时使用每个区域自己的滚动基准', () => {
    const { ctx, ops } = createRecordingContext()
    const data = new InMemoryDataSource({
      schema: {
        fields: [
          { id: 'name', name: 'Name', type: 'text', width: 100 },
          { id: 'age', name: 'Age', type: 'number', width: 100 },
          { id: 'role', name: 'Role', type: 'text', width: 100 },
        ],
      },
      rows: [
        { name: 'Alice', age: 30, role: 'Engineer' },
        { name: 'Bob', age: 25, role: 'Designer' },
        { name: 'Carol', age: 40, role: 'PM' },
        { name: 'Dave', age: 35, role: 'QA' },
      ],
    })
    const rowsAxis = new ChunkedAxis({ count: data.getRowCount(), defaultSize: denseGridTheme.metrics.rowHeight })
    const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })
    const frozen = new FrozenRegions(rowsAxis, colsAxis, 1, 1)
    const viewport = new Viewport(rowsAxis, colsAxis, frozen)
    viewport.setSize(300, 144)
    viewport.setHeaderHeight(denseGridTheme.metrics.headerHeight)
    viewport.setScroll(100, 56)

    const renderer = new Canvas2DRenderer({ ctx, data, viewport, rowsAxis, colsAxis, theme: denseGridTheme })
    renderer.paint()

    const alice = ops.find(
      (o): o is { op: 'fillText'; args: [string, number, number, number?] } =>
        o.op === 'fillText' && o.args[0] === 'Alice',
    )
    expect(alice).toBeDefined()
    expect(alice!.args[1]).toBe(8)
    expect(alice!.args[2]).toBe(46)

    const carolFrozenCol = ops.find(
      (o): o is { op: 'fillText'; args: [string, number, number, number?] } =>
        o.op === 'fillText' && o.args[0] === 'Carol',
    )
    expect(carolFrozenCol).toBeDefined()
    expect(carolFrozenCol!.args[1]).toBe(8)
    expect(carolFrozenCol!.args[2]).toBe(74)

    const headerName = ops.find(
      (o): o is { op: 'fillText'; args: [string, number, number, number?] } =>
        o.op === 'fillText' && o.args[0] === 'Name',
    )
    const headerRole = ops.find(
      (o): o is { op: 'fillText'; args: [string, number, number, number?] } =>
        o.op === 'fillText' && o.args[0] === 'Role',
    )
    expect(headerName).toBeDefined()
    expect(headerName!.args[1]).toBe(8)
    expect(headerRole).toBeDefined()
    expect(headerRole!.args[1]).toBe(108)

    expect(ops).toContainEqual({ op: 'rect', args: [100, 60, 200, 84] })
    expect(ops).toContainEqual({ op: 'rect', args: [100, 0, 200, 32] })
    expect(ops).toContainEqual({ op: 'set:strokeStyle', value: denseGridTheme.frozenSeparator.color })
    expect(ops).toContainEqual({ op: 'set:lineWidth', value: denseGridTheme.frozenSeparator.width })
    expect(ops).toContainEqual({ op: 'moveTo', args: [99.5, 0] })
    expect(ops).toContainEqual({ op: 'lineTo', args: [99.5, 144] })
    expect(ops).toContainEqual({ op: 'moveTo', args: [0, 59.5] })
    expect(ops).toContainEqual({ op: 'lineTo', args: [300, 59.5] })
  })

  it('内容尚未滚过冻结边界时绘制稳定的淡冻结线', () => {
    const { ctx, ops } = createRecordingContext()
    const data = new InMemoryDataSource({
      schema: {
        fields: [
          { id: 'name', name: 'Name', type: 'text', width: 100 },
          { id: 'age', name: 'Age', type: 'number', width: 100 },
          { id: 'role', name: 'Role', type: 'text', width: 100 },
        ],
      },
      rows: [
        { name: 'Alice', age: 30, role: 'Engineer' },
        { name: 'Bob', age: 25, role: 'Designer' },
      ],
    })
    const rowsAxis = new ChunkedAxis({ count: data.getRowCount(), defaultSize: denseGridTheme.metrics.rowHeight })
    const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })
    const frozen = new FrozenRegions(rowsAxis, colsAxis, { topRows: 1, leftCols: 1, rightCols: 1 })
    const viewport = new Viewport(rowsAxis, colsAxis, frozen)
    viewport.setSize(300, 144)
    viewport.setHeaderHeight(denseGridTheme.metrics.headerHeight)
    viewport.setScroll(0, 0)

    const renderer = new Canvas2DRenderer({ ctx, data, viewport, rowsAxis, colsAxis, theme: denseGridTheme })
    renderer.paint()

    expect(ops).not.toContainEqual({ op: 'set:strokeStyle', value: denseGridTheme.frozenSeparator.color })
    const idleSeparatorStart = ops.findIndex(
      (op) => op.op === 'set:strokeStyle' && op.value === denseGridTheme.colors.gridLine,
    )
    const idleSeparatorOps = ops.slice(idleSeparatorStart)
    expect(idleSeparatorOps).toContainEqual({ op: 'moveTo', args: [99.5, 0] })
    expect(idleSeparatorOps).toContainEqual({ op: 'lineTo', args: [99.5, 144] })
    expect(idleSeparatorOps).toContainEqual({ op: 'moveTo', args: [199.5, 0] })
    expect(idleSeparatorOps).toContainEqual({ op: 'lineTo', args: [199.5, 144] })
    expect(idleSeparatorOps).toContainEqual({ op: 'moveTo', args: [0, 59.5] })
    expect(idleSeparatorOps).toContainEqual({ op: 'lineTo', args: [300, 59.5] })
  })

  it('只横向滚过冻结边界时垂直冻结线变强，水平冻结线保持淡色', () => {
    const { ctx, ops } = createRecordingContext()
    const data = new InMemoryDataSource({
      schema: {
        fields: [
          { id: 'name', name: 'Name', type: 'text', width: 100 },
          { id: 'age', name: 'Age', type: 'number', width: 100 },
          { id: 'role', name: 'Role', type: 'text', width: 100 },
        ],
      },
      rows: [
        { name: 'Alice', age: 30, role: 'Engineer' },
        { name: 'Bob', age: 25, role: 'Designer' },
      ],
    })
    const rowsAxis = new ChunkedAxis({ count: data.getRowCount(), defaultSize: denseGridTheme.metrics.rowHeight })
    const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })
    const frozen = new FrozenRegions(rowsAxis, colsAxis, { topRows: 1, leftCols: 1, rightCols: 1 })
    const viewport = new Viewport(rowsAxis, colsAxis, frozen)
    viewport.setSize(300, 144)
    viewport.setHeaderHeight(denseGridTheme.metrics.headerHeight)
    viewport.setScroll(50, 0)

    const renderer = new Canvas2DRenderer({ ctx, data, viewport, rowsAxis, colsAxis, theme: denseGridTheme })
    renderer.paint()

    const separatorStart = ops.findIndex(
      (op) => op.op === 'set:strokeStyle' && op.value === denseGridTheme.frozenSeparator.color,
    )
    const separatorOps = ops.slice(separatorStart)
    expect(separatorOps).toContainEqual({ op: 'moveTo', args: [99.5, 0] })
    expect(separatorOps).toContainEqual({ op: 'lineTo', args: [99.5, 144] })
    expect(separatorOps).toContainEqual({ op: 'moveTo', args: [199.5, 0] })
    expect(separatorOps).toContainEqual({ op: 'lineTo', args: [199.5, 144] })
    expect(separatorOps).not.toContainEqual({ op: 'moveTo', args: [0, 59.5] })
    expect(separatorOps).not.toContainEqual({ op: 'lineTo', args: [300, 59.5] })

    const idleSeparatorStart = ops.findIndex(
      (op) => op.op === 'set:strokeStyle' && op.value === denseGridTheme.colors.gridLine,
    )
    const idleSeparatorOps = ops.slice(idleSeparatorStart, separatorStart)
    expect(idleSeparatorOps).toContainEqual({ op: 'moveTo', args: [0, 59.5] })
    expect(idleSeparatorOps).toContainEqual({ op: 'lineTo', args: [300, 59.5] })
  })

  it('绘制右冻结列时把列固定到 viewport 右侧', () => {
    const { ctx, ops } = createRecordingContext()
    const data = new InMemoryDataSource({
      schema: {
        fields: [
          { id: 'name', name: 'Name', type: 'text', width: 100 },
          { id: 'age', name: 'Age', type: 'number', width: 100 },
          { id: 'role', name: 'Role', type: 'text', width: 100 },
        ],
      },
      rows: [
        { name: 'Alice', age: 30, role: 'Engineer' },
        { name: 'Bob', age: 25, role: 'Designer' },
        { name: 'Carol', age: 40, role: 'PM' },
      ],
    })
    const rowsAxis = new ChunkedAxis({ count: data.getRowCount(), defaultSize: denseGridTheme.metrics.rowHeight })
    const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })
    const frozen = new FrozenRegions(rowsAxis, colsAxis, { topRows: 0, leftCols: 0, rightCols: 1 })
    const viewport = new Viewport(rowsAxis, colsAxis, frozen)
    viewport.setSize(300, 144)
    viewport.setHeaderHeight(denseGridTheme.metrics.headerHeight)
    viewport.setScroll(100, 0)

    const renderer = new Canvas2DRenderer({ ctx, data, viewport, rowsAxis, colsAxis, theme: denseGridTheme })
    renderer.paint()

    const engineer = ops.find(
      (o): o is { op: 'fillText'; args: [string, number, number, number?] } =>
        o.op === 'fillText' && o.args[0] === 'Engineer',
    )
    const roleHeader = ops.find(
      (o): o is { op: 'fillText'; args: [string, number, number, number?] } =>
        o.op === 'fillText' && o.args[0] === 'Role',
    )

    expect(engineer).toBeDefined()
    expect(engineer!.args[1]).toBe(208)
    expect(roleHeader).toBeDefined()
    expect(roleHeader!.args[1]).toBe(208)
    expect(ops).toContainEqual({ op: 'rect', args: [200, 32, 100, 112] })
    expect(ops).toContainEqual({ op: 'rect', args: [200, 0, 100, 32] })
    expect(ops).toContainEqual({ op: 'set:strokeStyle', value: denseGridTheme.frozenSeparator.color })
    expect(ops).toContainEqual({ op: 'set:lineWidth', value: denseGridTheme.frozenSeparator.width })
    expect(ops).toContainEqual({ op: 'moveTo', args: [199.5, 0] })
    expect(ops).toContainEqual({ op: 'lineTo', args: [199.5, 144] })
  })

  it('无数据行时绘制空状态插画与列头', () => {
    const { ctx, ops } = createRecordingContext()
    const data = new InMemoryDataSource({ schema: SCHEMA, rows: [] })
    const rowsAxis = new ChunkedAxis({ count: 0, defaultSize: denseGridTheme.metrics.rowHeight })
    const colsAxis = new ChunkedAxis({ count: SCHEMA.fields.length, defaultSize: 100 })
    const frozen = new FrozenRegions(rowsAxis, colsAxis, 0, 0)
    const viewport = new Viewport(rowsAxis, colsAxis, frozen)
    viewport.setSize(400, 200)
    viewport.setHeaderHeight(denseGridTheme.metrics.headerHeight)
    const renderer = new Canvas2DRenderer({ ctx, data, viewport, rowsAxis, colsAxis, theme: denseGridTheme })
    renderer.paint()

    expect(ops.some((o) => o.op === 'fillPath')).toBe(true)
    const texts = ops
      .filter((o) => o.op === 'fillText')
      .map((o) => (o.op === 'fillText' ? o.args[0] : ''))
    expect(texts).toContain('Name')
    expect(texts).toContain(denseGridTheme.emptyState.title)
    expect(texts).not.toContain('Alice')
  })
})
