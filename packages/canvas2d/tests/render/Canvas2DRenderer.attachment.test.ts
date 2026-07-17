import { describe, expect, it } from 'bun:test'
import { denseGridTheme } from '@zhiguang/novasheet-core'
import { CellPainter, type Canvas2DCellRenderer } from '../../src/painters/CellPainter'
import { createRecordingContext } from '../helpers/recording-context'

describe('CellPainter — getAttachment 透传', () => {
  it('custom renderer 的 params 暴露 getAttachment，可按 view 坐标读', () => {
    const { ctx } = createRecordingContext()
    let seen: unknown
    const renderer: Canvas2DCellRenderer = {
      paint(_ctx, params) {
        seen = params.getAttachment?.('demo', params.rowIndex!, params.colIndex!)
      },
    }
    const painter = new CellPainter(denseGridTheme, { cellRenderers: { text: renderer } })
    painter.paint(ctx, {
      value: 'x',
      rect: { x: 0, y: 0, width: 100, height: 28 },
      field: { id: 'f', name: 'F', type: 'text', width: 100 },
      rowIndex: 2,
      colIndex: 0,
      getAttachment: <T,>(ns: string, r: number, c: number) =>
        (ns === 'demo' && r === 2 && c === 0 ? ({ note: 'hit' } as T) : undefined),
    })
    expect(seen).toEqual({ note: 'hit' })
  })
})
