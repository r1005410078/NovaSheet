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
// 注：此处用 relative src import（非 @novasheet/cell-kit 包名）。
// 包名 import 解析到 dist，需 cell-kit 先 build；测试跑前 build 顺序无保证。
// 且 @novasheet/cell-kit 未列入 @novasheet/react devDependencies（不属于 react 运行时依赖）。
// TODO(F7-pkg-import): CI build 顺序固定、cell-kit 加入 react devDeps 后可改为包名 import。
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

  it('excel.L3c.rich-text-toolbar-bold-substring — cell-kit exposes external toolbar integration points', () => {
    expect(typeof richTextExtension.editor.open).toBe('function')
    const extension = richTextExtension as Record<string, unknown>
    expect(typeof extension['toolbarExtension']).toBe('function')
    expect(typeof extension['ToolbarProvider']).toBe('function')
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
