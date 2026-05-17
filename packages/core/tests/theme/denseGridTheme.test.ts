import { describe, expect, it } from 'bun:test'
import { denseGridTheme } from '../../src/theme/denseGridTheme'

describe('denseGridTheme — 默认主题', () => {
  it('暴露紧凑表格 metrics', () => {
    expect(denseGridTheme.metrics.rowHeight).toBe(28)
    expect(denseGridTheme.metrics.headerHeight).toBe(32)
    expect(denseGridTheme.metrics.fontSize).toBeGreaterThanOrEqual(12)
    expect(denseGridTheme.metrics.fontSize).toBeLessThanOrEqual(13)
    expect(denseGridTheme.metrics.borderWidth).toBe(1)
  })

  it('声明 7 种字段类型图标', () => {
    const types = ['text', 'number', 'singleSelect', 'multiSelect', 'date', 'checkbox', 'url'] as const
    for (const t of types) {
      expect(denseGridTheme.icons.byFieldType[t]).toBeDefined()
    }
  })

  it('按字段类型提供文本对齐', () => {
    expect(denseGridTheme.cell.textAlignByType.text).toBe('left')
    expect(denseGridTheme.cell.textAlignByType.number).toBe('right')
  })

  it('颜色含网格线与背景', () => {
    expect(denseGridTheme.colors.background).toMatch(/^#|^rgb/)
    expect(denseGridTheme.colors.gridLine).toMatch(/^#|^rgb/)
  })

  it('暴露冻结分隔线样式', () => {
    expect(denseGridTheme.frozenSeparator.color).toBe(denseGridTheme.colors.gridLineStrong)
    expect(denseGridTheme.frozenSeparator.width).toBe(1)
  })
})
