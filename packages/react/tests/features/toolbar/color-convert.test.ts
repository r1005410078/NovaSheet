import { describe, expect, it } from 'bun:test'
import {
  hsvaToCss,
  normalizeColor,
  parseColor,
} from '../../../src/features/toolbar/lib/color-convert'

describe('color-convert', () => {
  it('解析 6 位 hex 并往返保真', () => {
    for (const hex of ['#fff2cc', '#cc0000', '#4a86e8', '#000000', '#ffffff']) {
      const parsed = parseColor(hex)
      expect(parsed).toBeDefined()
      expect(parsed!.a).toBe(1)
      expect(hsvaToCss(parsed!)).toBe(hex)
    }
  })

  it('解析 8 位 hex（alpha）并往返保真', () => {
    const parsed = parseColor('#FF000080')
    expect(parsed).toBeDefined()
    expect(parsed!.a).toBeCloseTo(128 / 255, 5)
    expect(hsvaToCss(parsed!)).toBe('#ff000080')
  })

  it('解析 3/4 位短 hex', () => {
    expect(hsvaToCss(parseColor('#f00')!)).toBe('#ff0000')
    expect(hsvaToCss(parseColor('#f00c')!)).toBe('#ff0000cc')
  })

  it('解析 rgb()/rgba() 两种语法', () => {
    expect(hsvaToCss(parseColor('rgb(255, 0, 0)')!)).toBe('#ff0000')
    expect(hsvaToCss(parseColor('rgba(255, 0, 0, 0.5)')!)).toBe('#ff000080')
    expect(hsvaToCss(parseColor('rgb(255 0 0 / 50%)')!)).toBe('#ff000080')
  })

  it('alpha=1 序列化为 6 位 hex', () => {
    expect(hsvaToCss(parseColor('rgba(0, 255, 0, 1)')!)).toBe('#00ff00')
  })

  it('非法输入返回 undefined', () => {
    for (const bad of ['', 'red', '#ff', '#ggg', 'rgb(1,2)', 'rgba(a,b,c,d)', 'hsl(0,0%,0%)']) {
      expect(parseColor(bad)).toBeUndefined()
    }
  })

  it('normalizeColor 统一等价形式', () => {
    expect(normalizeColor('#FFF2CC')).toBe('#fff2cc')
    expect(normalizeColor('rgba(255, 242, 204, 1)')).toBe('#fff2cc')
    expect(normalizeColor('not-a-color')).toBeUndefined()
  })

  it('灰阶 hue 退化稳定（黑白灰可往返）', () => {
    for (const hex of ['#000000', '#808080', '#ffffff']) {
      expect(hsvaToCss(parseColor(hex)!)).toBe(hex)
    }
  })
})
