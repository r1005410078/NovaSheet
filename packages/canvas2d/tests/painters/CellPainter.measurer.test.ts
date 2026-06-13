import { describe, expect, it } from 'bun:test'
import type { Field, TextMeasurer } from '@novasheet/core'
import { denseGridTheme } from '@novasheet/core'
import type { Canvas2DCellRenderParams, Canvas2DCellRenderer } from '../../src/painters/CellPainter'
import { CellPainter } from '../../src/painters/CellPainter'
import { createRecordingContext } from '../helpers/recording-context'

describe('CellPainter — measurer 透传 custom renderer', () => {
  it('custom renderer params 暴露注入的 measurer', () => {
    const measurer: TextMeasurer = { measureWidth: (t) => t.length * 9 }
    let seen: TextMeasurer | undefined = undefined
    const renderer: Canvas2DCellRenderer = {
      paint(_ctx, params) { seen = params.measurer },
    }
    const painter = new CellPainter(denseGridTheme, { cellRenderers: { text: renderer }, measurer })
    const { ctx } = createRecordingContext()
    const field: Field = { name: 'name', type: 'text' }
    painter.paint(ctx, {
      value: 'hello',
      rect: { x: 0, y: 0, width: 100, height: 30 },
      field,
    })
    expect(seen).toBe(measurer)
  })
})
