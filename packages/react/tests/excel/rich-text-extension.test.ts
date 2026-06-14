/**
 * BDD coverage shims for rich-text Excel L3c scenarios.
 * - excel.L3c.rich-text-default-not-bundled
 * - excel.L3c.rich-text-toolbar-bold-substring
 *
 * The substantive assertions live in:
 *   packages/cell-kit/tests/rich-text/assembly.e2e.test.ts
 *
 * These stubs satisfy lint:scenario-coverage by naming the scenario ids,
 * while exercising the observable contract within the react package boundary.
 */
import { describe, expect, it } from 'bun:test'
import * as reactPkg from '../../src/index'
import { richTextExtension } from '../../../cell-kit/src/rich-text/index'
import { denseGridTheme } from '@novasheet/core'
import type { Canvas2DCellRenderParams } from '@novasheet/canvas2d'
import { createRecordingContext } from '../../../canvas2d/tests/helpers/recording-context'
import type { RichTextValue } from '../../../cell-kit/src/rich-text/types'

describe('rich-text Excel L3c', () => {
  it('excel.L3c.rich-text-default-not-bundled — @novasheet/react does not export richTextExtension', () => {
    const exports = reactPkg as Record<string, unknown>
    expect(exports['richTextExtension']).toBeUndefined()
  })

  it('excel.L3c.rich-text-toolbar-bold-substring — renderer paints bold substring from stored runs', () => {
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
    const fonts = ops
      .filter((o) => o.op === 'set:font')
      .map((o) => (o.op === 'set:font' ? o.value : ''))
    expect(fonts.some((f) => f.includes('bold'))).toBe(true)
    const fillTexts = ops
      .filter((o) => o.op === 'fillText')
      .map((o) => (o.op === 'fillText' ? o.args[0] : ''))
    expect(fillTexts).toContain('bc')
  })
})
