/**
 * rich-text 端到端装配测试：验证注册三点（codec+renderer+editor）后组合行为。
 * 对应 BDD 场景 excel.L3c.rich-text-toolbar-bold-substring。
 */
import { describe, expect, it } from 'bun:test'
import { richTextExtension } from '../../src/rich-text'
import { denseGridTheme } from '@zhiguang/core'
import type { Canvas2DCellRenderParams } from '@zhiguang/canvas2d'
import { createRecordingContext } from '../../../canvas2d/tests/helpers/recording-context'
import type { RichTextValue } from '../../src/rich-text/types'

describe('rich-text assembly (e2e)', () => {
  it('extension exposes all three registration points (codec + renderer + editor)', () => {
    expect(richTextExtension.codec.namespace).toBe('richText')
    expect(typeof richTextExtension.renderer.paint).toBe('function')
    expect(typeof richTextExtension.editor.open).toBe('function')
  })

  it('renderer paints bold substring from stored runs (bold font + bc fillText)', () => {
    const runs: RichTextValue = [{ start: 1, end: 3, attrs: { bold: true } }]
    const { ctx, ops } = createRecordingContext()
    const renderParams: Canvas2DCellRenderParams = {
      value: 'abcd',
      rect: { x: 0, y: 0, width: 120, height: 24 },
      field: { id: 't', name: 'T', type: 'text', width: 120 },
      theme: denseGridTheme,
      rowIndex: 0,
      colIndex: 0,
      getAttachment: <T,>() => runs as T,
    }
    richTextExtension.renderer.paint(ctx, renderParams)
    const fonts = ops.filter((o) => o.op === 'set:font').map((o) => (o.op === 'set:font' ? o.value : ''))
    expect(fonts.some((f) => f.includes('bold'))).toBe(true)
    const fillTexts = ops.filter((o) => o.op === 'fillText').map((o) => (o.op === 'fillText' ? o.args[0] : ''))
    expect(fillTexts).toContain('bc')
  })

  it('codec round-trips runs attachment (serialize + deserialize)', () => {
    const runs: RichTextValue = [{ start: 0, end: 4, attrs: { bold: true } }]
    const serialized = richTextExtension.codec.serialize(runs)
    const deserialized = richTextExtension.codec.deserialize(serialized)
    expect(deserialized).toEqual(runs)
  })
})
