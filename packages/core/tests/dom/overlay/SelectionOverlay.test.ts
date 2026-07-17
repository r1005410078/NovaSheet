import { describe, expect, it } from 'bun:test'
import { denseGridTheme } from '@zhiguang/novasheet-core'
import { SelectionOverlay } from '../../../src/dom/overlay/SelectionOverlay'
import type { OverlayRect } from '../../../src/dom/overlay/RangeOverlayRects'

describe('SelectionOverlay', () => {
  it('renders range rects and active cell rect with pointer-events disabled', () => {
    const root = document.createElement('div')
    const overlay = new SelectionOverlay(root)
    const rangeRects: OverlayRect[] = [
      { x: 10, y: 20, width: 100, height: 40 },
      { x: 10, y: 80, width: 100, height: 30 },
    ]

    overlay.sync({ rangeRects, activeRect: { x: 12, y: 22, width: 50, height: 20 } })

    const layer = root.querySelector<HTMLElement>('[data-novasheet-selection-layer]')!
    expect(layer.style.pointerEvents).toBe('none')
    expect(root.querySelectorAll('[data-novasheet-selection-range]').length).toBe(2)
    expect(root.querySelectorAll('[data-novasheet-selection-active]').length).toBe(1)
    expect(root.querySelector<HTMLElement>('[data-novasheet-selection-range]')!.style.left).toBe('10px')
    expect(root.querySelector<HTMLElement>('[data-novasheet-selection-active]')!.style.borderColor).toContain(
      'var(--novasheet-selection-border',
    )
  })

  it('clears all rects for null sync and destroy is idempotent', () => {
    const root = document.createElement('div')
    const overlay = new SelectionOverlay(root)

    overlay.sync({ rangeRects: [{ x: 0, y: 0, width: 10, height: 10 }], activeRect: null })
    overlay.sync(null)

    expect(root.querySelectorAll('[data-novasheet-selection-range]').length).toBe(0)
    overlay.destroy()
    overlay.destroy()
    expect(root.querySelector('[data-novasheet-selection-layer]')).toBeNull()
  })

  it('applies selection colors from theme tokens to the layer', () => {
    const root = document.createElement('div')
    const overlay = new SelectionOverlay(root)
    const customTheme = {
      ...denseGridTheme,
      colors: {
        ...denseGridTheme.colors,
        selectionBg: 'rgba(255, 0, 0, 0.25)',
        selectionBorder: '#ff0000',
      },
    }

    overlay.applyTheme(customTheme)

    const layer = root.querySelector<HTMLElement>('[data-novasheet-selection-layer]')!
    expect(layer.style.getPropertyValue('--novasheet-selection-bg')).toBe(
      customTheme.colors.selectionBg,
    )
    expect(layer.style.getPropertyValue('--novasheet-selection-border')).toBe(
      customTheme.colors.selectionBorder,
    )
  })
})
