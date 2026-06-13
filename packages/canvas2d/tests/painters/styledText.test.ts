import { describe, expect, it } from 'bun:test'
import { denseGridTheme } from '@novasheet/core'
import { paintStyledText, type StyledSegment, type StyledTextLayout } from '../../src/painters/styledText'
import { createRecordingContext } from '../helpers/recording-context'

function layout(overrides: Partial<StyledTextLayout> = {}): StyledTextLayout {
  return {
    rect: { x: 0, y: 0, width: 100, height: 28 },
    padX: 8,
    padY: 4,
    align: 'left',
    wrap: 'overflow',
    lineHeightMultiplier: denseGridTheme.text.lineHeightMultiplier,
    themeText: denseGridTheme.text,
    ...overrides,
  }
}

function seg(text: string, overrides: Partial<StyledSegment> = {}): StyledSegment {
  return { text, font: '14px sans-serif', fontSize: 14, color: '#111', ...overrides }
}

describe('paintStyledText — 单段单行', () => {
  it('设置 segment 的 font/color 并在 padX 处居中绘制', () => {
    const { ctx, ops } = createRecordingContext()
    paintStyledText(ctx, [seg('hello')], layout())
    expect(ops).toContainEqual({ op: 'set:font', value: '14px sans-serif' })
    expect(ops).toContainEqual({ op: 'set:fillStyle', value: '#111' })
    expect(ops).toContainEqual({ op: 'set:textBaseline', value: 'middle' })
    const fillText = ops.find((o) => o.op === 'fillText')
    expect(fillText).toBeDefined()
    if (fillText?.op === 'fillText') {
      expect(fillText.args[0]).toBe('hello')
      expect(fillText.args[1]).toBe(8)        // rect.x + padX
      expect(fillText.args[2]).toBe(14)       // rect.y + rect.height/2
    }
  })

  it('空 segment 数组不绘制', () => {
    const { ctx, ops } = createRecordingContext()
    paintStyledText(ctx, [], layout())
    expect(ops.find((o) => o.op === 'fillText')).toBeUndefined()
  })

  it('right 对齐时锚点在右内沿（measureText=len*7）', () => {
    const { ctx, ops } = createRecordingContext()
    // 'abc' 宽 21；rect.width 100，padX 8 → 右内沿 x = 100-8 = 92；起点 = 92-21 = 71
    paintStyledText(ctx, [seg('abc')], layout({ align: 'right' }))
    const fillText = ops.find((o) => o.op === 'fillText')
    if (fillText?.op === 'fillText') expect(fillText.args[1]).toBe(71)
  })
})
