import { describe, expect, it } from 'vitest'
import { denseGridTheme } from '../../src/theme/denseGridTheme'

describe('denseGridTheme', () => {
  it('exposes dense grid metrics', () => {
    expect(denseGridTheme.metrics.rowHeight).toBe(28)
    expect(denseGridTheme.metrics.headerHeight).toBe(32)
    expect(denseGridTheme.metrics.fontSize).toBeGreaterThanOrEqual(12)
    expect(denseGridTheme.metrics.fontSize).toBeLessThanOrEqual(13)
    expect(denseGridTheme.metrics.borderWidth).toBe(1)
  })

  it('declares all 7 field-type icons', () => {
    const types = ['text', 'number', 'singleSelect', 'multiSelect', 'date', 'checkbox', 'url'] as const
    for (const t of types) {
      expect(denseGridTheme.icons.byFieldType[t]).toBeDefined()
    }
  })

  it('provides text alignment by field type', () => {
    expect(denseGridTheme.cell.textAlignByType.text).toBe('left')
    expect(denseGridTheme.cell.textAlignByType.number).toBe('right')
  })

  it('colors include grid line and background', () => {
    expect(denseGridTheme.colors.background).toMatch(/^#|^rgb/)
    expect(denseGridTheme.colors.gridLine).toMatch(/^#|^rgb/)
  })
})
