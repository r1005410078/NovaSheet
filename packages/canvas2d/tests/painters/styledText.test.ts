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

describe('paintStyledText — 多段单行', () => {
  it('按段切 font/fillStyle 顺序绘制，x 累加', () => {
    const { ctx, ops } = createRecordingContext()
    paintStyledText(
      ctx,
      [
        seg('AB', { font: 'bold 14px sans-serif', color: '#a00' }),
        seg('CD', { font: '14px sans-serif', color: '#0a0' }),
      ],
      layout(),
    )
    const fills = ops.filter((o) => o.op === 'fillText')
    expect(fills.length).toBe(2)
    if (fills[0]?.op === 'fillText' && fills[1]?.op === 'fillText') {
      expect(fills[0].args[0]).toBe('AB')
      expect(fills[0].args[1]).toBe(8)         // padX
      expect(fills[1].args[0]).toBe('CD')
      expect(fills[1].args[1]).toBe(8 + 14)    // padX + 'AB' 宽(2*7)
    }
    const fontOps = ops.filter((o) => o.op === 'set:font').map((o) => o.op === 'set:font' && o.value)
    expect(fontOps).toContain('bold 14px sans-serif')
    expect(fontOps).toContain('14px sans-serif')
  })

  it('right 对齐多段：整行宽右贴，段内相对顺序不变', () => {
    const { ctx, ops } = createRecordingContext()
    // 'AB'+'CD' 共 4 字符 = 28 宽；右内沿 92 → 起点 64
    paintStyledText(ctx, [seg('AB'), seg('CD')], layout({ align: 'right' }))
    const fills = ops.filter((o) => o.op === 'fillText')
    if (fills[0]?.op === 'fillText' && fills[1]?.op === 'fillText') {
      expect(fills[0].args[1]).toBe(64)
      expect(fills[1].args[1]).toBe(64 + 14)
    }
  })
})

describe('paintStyledText — 装饰线', () => {
  it('underline 段画 moveTo/lineTo，坐标=段 x 区间 + 基线下偏移', () => {
    const { ctx, ops } = createRecordingContext()
    paintStyledText(ctx, [seg('AB', { underline: true })], layout())
    const moveTo = ops.find((o) => o.op === 'moveTo')
    const lineTo = ops.find((o) => o.op === 'lineTo')
    expect(moveTo).toBeDefined()
    expect(lineTo).toBeDefined()
    if (moveTo?.op === 'moveTo' && lineTo?.op === 'lineTo') {
      const y = 14 + denseGridTheme.text.underlineOffset // centerY + offset
      expect(moveTo.args).toEqual([8, y])               // 起点 x=padX
      expect(lineTo.args).toEqual([8 + 14, y])          // 终点 x=padX+段宽(2字符*7)
    }
    expect(ops).toContainEqual({ op: 'set:lineWidth', value: denseGridTheme.text.underlineWidth })
    expect(ops).toContainEqual({ op: 'set:strokeStyle', value: '#111' })
  })

  it('strikethrough 段画线在 centerY - lineThroughOffset', () => {
    const { ctx, ops } = createRecordingContext()
    paintStyledText(ctx, [seg('AB', { strikethrough: true })], layout())
    const moveTo = ops.find((o) => o.op === 'moveTo')
    if (moveTo?.op === 'moveTo') {
      const y = 14 - denseGridTheme.text.lineThroughOffset
      expect(moveTo.args[1]).toBe(y)
    }
  })

  it('无装饰段不画线', () => {
    const { ctx, ops } = createRecordingContext()
    paintStyledText(ctx, [seg('AB')], layout())
    expect(ops.find((o) => o.op === 'moveTo')).toBeUndefined()
  })
})
