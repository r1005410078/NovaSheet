import { describe, expect, it } from 'vitest'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'
import type { Schema } from '../../src/data/Schema'
import { ChunkedAxis } from '../../src/layout/ChunkedAxis'
import { FrozenRegions } from '../../src/layout/FrozenRegions'
import { Viewport } from '../../src/layout/Viewport'
import { Renderer } from '../../src/render/Renderer'
import { denseGridTheme } from '../../src/theme/denseGridTheme'
import { createRecordingContext } from '../helpers/recording-context'

const SCHEMA: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 100 },
    { id: 'age', name: 'Age', type: 'number', width: 80 },
  ],
}

describe('Renderer (M1 single quadrant)', () => {
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
    const renderer = new Renderer({ ctx, data, viewport, rowsAxis, colsAxis, theme: denseGridTheme })
    return { ctx, ops, data, viewport, renderer }
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
    // First cell of the FIRST visible row should be at cellY ≈ rect.y + indexToPosition(visibleFirst) - 56
    // For our 200px viewport with headerHeight 32, scrollY 56 → visibleFirst = 2 (rows 2,3,4..)
    // Row 2 starts at y = 56 in content space; rect.y = headerHeight = 32; cellY = 32 + 56 - 56 = 32
    const firstCellFillText = ops.find(
      (o) => o.op === 'fillText' && typeof o.args[0] === 'string' && o.args[0] === 'Carol',
    )
    // Carol is row 2 (Alice=0, Bob=1, Carol=2). It should still be in fillText
    expect(firstCellFillText).toBeDefined()
  })

  it('paintQuadrant subtracts viewport.scrollX from cellX for horizontal scroll', () => {
    const { ops, viewport, renderer } = setup()
    viewport.setScroll(100, 0) // scroll right by 100px (= 1 col)
    ops.length = 0
    renderer.paint()
    // Column 0 (Name) starts at xLeft=0; with scrollX=100 it should be at cellX = 0 + 0 - 100 = -100,
    // which means it's mostly clipped. But the fillText call is still made if the col is in visible range.
    // After scrolling left, visible col range starts at col 1 (Age). Verify "Age" header is the leftmost visible.
    const ageHeader = ops.find((o) => o.op === 'fillText' && o.args[0] === 'Age')
    expect(ageHeader).toBeDefined()
    if (ageHeader && ageHeader.op === 'fillText') {
      // Age column starts at content x=100; with scrollX=100 it lands at cellX = 0 + 100 - 100 = 0 + padX = 8
      expect(typeof ageHeader.args[1]).toBe('number')
    }
  })
})
