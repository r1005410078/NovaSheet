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

describe('Canvas2DRenderer (M1 single quadrant)', () => {
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

  it('paint clears background then draws header and visible cells', () => {
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

  it('invalidate schedules a paint via FrameScheduler', () => {
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

  it('paintQuadrant subtracts viewport.scrollY from cellY for vertical scroll', () => {
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

  it('render uses frame.viewport scroll, not only the constructor viewport ref', () => {
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

  it('paintQuadrant subtracts viewport.scrollX from cellX for horizontal scroll', () => {
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
})
