import { describe, expect, it } from 'bun:test'
import { denseGridTheme } from '../../../src/kernel/theme/denseGridTheme'

describe('denseGridTheme — Phase 4.0 menu tokens', () => {
  it('exposes menuItemHover (defaulting to hoverRowBg value)', () => {
    expect(denseGridTheme.colors.menuItemHover).toBe(denseGridTheme.colors.hoverRowBg)
  })

  it('exposes menuShadow string', () => {
    expect(typeof denseGridTheme.metrics.menuShadow).toBe('string')
    expect(denseGridTheme.metrics.menuShadow.length).toBeGreaterThan(0)
  })

  it('exposes menuPaddingX / menuPaddingY as numbers', () => {
    expect(typeof denseGridTheme.metrics.menuPaddingX).toBe('number')
    expect(typeof denseGridTheme.metrics.menuPaddingY).toBe('number')
  })
})
