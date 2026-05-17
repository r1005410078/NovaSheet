import { describe, expect, it } from 'vitest'
import { ChunkedAxis } from '../../src/layout/ChunkedAxis'
import type { Schema } from '../../src/data/Schema'
import { HeaderPainter } from '../../src/render/HeaderPainter'
import { denseGridTheme } from '../../src/theme/denseGridTheme'
import { createRecordingContext } from '../helpers/recording-context'

const SCHEMA: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 200 },
    { id: 'age', name: 'Age', type: 'number', width: 80 },
    { id: 'flag', name: 'Active', type: 'checkbox', width: 60 },
  ],
}

describe('HeaderPainter', () => {
  it('fills header background spanning full width with headerHeight', () => {
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

  it('renders each visible field name', () => {
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

  it('uses theme headerText color for field names', () => {
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

  it('shifts field name X by scrollOffsetX so header tracks horizontal scroll', () => {
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

  it('defaults scrollOffsetX to 0 when omitted (backward-compat for M3 frozen header strip)', () => {
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
