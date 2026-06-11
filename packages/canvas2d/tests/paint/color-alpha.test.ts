import { describe, expect, it } from 'bun:test'
import { isTranslucentColor } from '../../src/paint/color-alpha'

describe('isTranslucentColor — CSS 颜色半透明判定', () => {
  it('不透明颜色返回 false', () => {
    expect(isTranslucentColor('#fff2cc')).toBe(false)
    expect(isTranslucentColor('#abc')).toBe(false)
    expect(isTranslucentColor('#ff0000ff')).toBe(false)
    expect(isTranslucentColor('#f00f')).toBe(false)
    expect(isTranslucentColor('rgb(0, 0, 0)')).toBe(false)
    expect(isTranslucentColor('rgba(0, 0, 0, 1)')).toBe(false)
    expect(isTranslucentColor('hsl(10, 50%, 50%)')).toBe(false)
    // 未知格式保守视为不透明（保持既有「fill 盖线」行为）
    expect(isTranslucentColor('red')).toBe(false)
  })

  it('半透明颜色返回 true', () => {
    expect(isTranslucentColor('transparent')).toBe(true)
    expect(isTranslucentColor('#ff000080')).toBe(true)
    expect(isTranslucentColor('#f00c')).toBe(true)
    expect(isTranslucentColor('rgba(0, 0, 0, 0.5)')).toBe(true)
    expect(isTranslucentColor('rgba(0,0,0,.3)')).toBe(true)
    expect(isTranslucentColor('rgb(0 0 0 / 50%)')).toBe(true)
    expect(isTranslucentColor('hsla(10, 50%, 50%, 0.4)')).toBe(true)
    expect(isTranslucentColor('hsl(10 50% 50% / 0.4)')).toBe(true)
    expect(isTranslucentColor('RGBA(0, 0, 0, 0.5)')).toBe(true)
  })
})
