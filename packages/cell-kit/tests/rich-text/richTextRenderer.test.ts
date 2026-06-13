import { describe, expect, it } from 'bun:test'
import { richTextRenderer } from '../../src/rich-text/richTextRenderer'
import { denseGridTheme, type TextMeasurer } from '@novasheet/core'
import type { Canvas2DCellRenderParams } from '@novasheet/canvas2d'
import type { RichTextValue } from '../../src/rich-text/types'
import { createRecordingContext } from '../../../canvas2d/tests/helpers/recording-context'

const m7: TextMeasurer = { measureWidth: (t) => t.length * 7 }

function params(over: Partial<Canvas2DCellRenderParams> = {}): Canvas2DCellRenderParams {
  return {
    value: 'abcdef',
    rect: { x: 0, y: 0, width: 200, height: 28 },
    field: { id: 'f', name: 'F', type: 'text', width: 200 },
    theme: denseGridTheme,
    rowIndex: 0,
    colIndex: 0,
    measurer: m7,
    ...over,
  }
}

describe('richTextRenderer', () => {
  it('no attachment → single default segment (plain text)', () => {
    const { ctx, ops } = createRecordingContext()
    richTextRenderer.paint(ctx, params({ getAttachment: () => undefined }))
    const fills = ops.filter((o) => o.op === 'fillText')
    expect(fills.length).toBe(1)
    if (fills[0]?.op === 'fillText') expect(fills[0].args[0]).toBe('abcdef')
  })

  it('with runs → multi-segment styled paint (bold substring switches font)', () => {
    const runs: RichTextValue = [{ start: 2, end: 4, attrs: { bold: true } }]
    const { ctx, ops } = createRecordingContext()
    richTextRenderer.paint(ctx, params({ getAttachment: <T,>() => runs as T }))
    const fills = ops.filter((o) => o.op === 'fillText')
    expect(fills.map((o) => (o.op === 'fillText' ? o.args[0] : ''))).toEqual(['ab', 'cd', 'ef'])
    const fonts = ops.filter((o) => o.op === 'set:font').map((o) => (o.op === 'set:font' ? o.value : ''))
    expect(fonts.some((f) => f.includes('bold'))).toBe(true)
  })

  it('runs ignored when display !== raw string (valueFormat 转换，spec §9)', () => {
    const runs: RichTextValue = [{ start: 0, end: 2, attrs: { bold: true } }]
    const { ctx, ops } = createRecordingContext()
    richTextRenderer.paint(ctx, params({
      value: 1234,
      getAttachment: <T,>() => runs as T,
      formatCell: () => '$1,234',   // 转换后显示串 ≠ String(value)
    }))
    const fills = ops.filter((o) => o.op === 'fillText')
    // 单段：忽略 runs，画格式化后的 '$1,234'
    expect(fills.length).toBe(1)
    if (fills[0]?.op === 'fillText') expect(fills[0].args[0]).toBe('$1,234')
  })
})
