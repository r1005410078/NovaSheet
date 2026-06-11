import { afterEach, describe, expect, it, mock } from 'bun:test'
import React from 'react'
import { createRoot } from 'react-dom/client'

import { BorderPalette } from '../../../src/features/toolbar/components/BorderPalette'
import {
  ToolbarColorPalette,
  ToolbarColorPaletteCustom,
} from '../../../src/features/toolbar/components/ColorPalette'
import {
  clickElement,
  flushReactEffects,
  mountReactRoot,
  setInputValue,
  unmountReactRoot,
} from '../../helpers/dom'

async function mountEl(element: React.ReactElement) {
  const container = document.createElement('div')
  const root = createRoot(container)
  await mountReactRoot(root, element)
  return { container, unmount: () => unmountReactRoot(root) }
}

afterEach(() => {
  delete (globalThis as { EyeDropper?: unknown }).EyeDropper
})

describe('ToolbarColorPalette', () => {
  it('不再渲染「标准」行旁的 stray 吸管', async () => {
    const { container, unmount } = await mountEl(
      React.createElement(ToolbarColorPalette, { selectedColor: null, onSelect: () => {} }),
    )
    expect(container.querySelector('[title="吸管"]')).toBeNull()
    unmount()
  })

  it('selectedColor 经规范化比较命中 swatch（rgba 等价形式）', async () => {
    const { container, unmount } = await mountEl(
      React.createElement(ToolbarColorPalette, {
        selectedColor: 'rgba(255, 242, 204, 1)',
        onSelect: () => {},
      }),
    )
    const swatch = container.querySelector('[data-fill-color="#fff2cc"]')
    expect(swatch?.textContent).toBe('✓')
    unmount()
  })
})

describe('ToolbarColorPaletteCustom', () => {
  const baseProps = {
    onSelect: () => {},
    onOpenPicker: () => {},
    customColors: [] as readonly string[],
    selectedColor: null,
  }

  it('渲染已存自定义 swatch，点击回传颜色', async () => {
    const onSelect = mock((_c: string) => {})
    const { container, unmount } = await mountEl(
      React.createElement(ToolbarColorPaletteCustom, {
        ...baseProps,
        onSelect,
        customColors: ['#ff000080', '#fff2cc'],
      }),
    )
    const swatch = container.querySelector<HTMLElement>('[data-fill-color="#ff000080"]')
    expect(swatch).not.toBeNull()
    clickElement(swatch!)
    expect(onSelect).toHaveBeenCalledWith('#ff000080')
    unmount()
  })

  it('「+」触发 onOpenPicker', async () => {
    const onOpenPicker = mock(() => {})
    const { container, unmount } = await mountEl(
      React.createElement(ToolbarColorPaletteCustom, { ...baseProps, onOpenPicker }),
    )
    clickElement(container.querySelector<HTMLElement>('[data-custom-color-add]')!)
    expect(onOpenPicker).toHaveBeenCalledTimes(1)
    unmount()
  })

  it('无 EyeDropper API 时吸管不渲染', async () => {
    const { container, unmount } = await mountEl(
      React.createElement(ToolbarColorPaletteCustom, baseProps),
    )
    expect(container.querySelector('[data-custom-color-eyedropper]')).toBeNull()
    unmount()
  })

  it('有 EyeDropper API 时吸管取色直接 onSelect', async () => {
    ;(globalThis as { EyeDropper?: unknown }).EyeDropper = class {
      open(): Promise<{ sRGBHex: string }> {
        return Promise.resolve({ sRGBHex: '#123456' })
      }
    }
    const onSelect = mock((_c: string) => {})
    const { container, unmount } = await mountEl(
      React.createElement(ToolbarColorPaletteCustom, { ...baseProps, onSelect }),
    )
    clickElement(container.querySelector<HTMLElement>('[data-custom-color-eyedropper]')!)
    await flushReactEffects()
    expect(onSelect).toHaveBeenCalledWith('#123456')
    unmount()
  })
})

describe('BorderPalette — 自定义颜色', () => {
  it('color 子面板含自定义区，取色器确定后 reapply 并收起', async () => {
    localStorage.clear()
    const onApply = mock((_preset: unknown, _border: unknown) => {})
    const { container, unmount } = await mountEl(
      React.createElement(BorderPalette, {
        position: { top: 0, left: 0 },
        paletteRef: (() => {}) as React.Ref<HTMLDivElement>,
        lastBorderPreset: 'all' as const,
        onApply,
        onClose: () => {},
      }),
    )
    clickElement(container.querySelector<HTMLElement>('[title="边框颜色"]')!)
    await flushReactEffects()
    clickElement(container.querySelector<HTMLElement>('[data-custom-color-add]')!)
    await flushReactEffects()

    const hexInput = container.querySelector<HTMLInputElement>(
      '[data-novasheet-color-picker] input[aria-label="十六进制颜色"]',
    )
    expect(hexInput).not.toBeNull()
    setInputValue(hexInput!, '#33445580')
    await flushReactEffects()
    clickElement(
      container.querySelector<HTMLElement>('[data-novasheet-color-picker-confirm]')!,
    )
    await flushReactEffects()

    expect(onApply).toHaveBeenCalledWith(
      'all',
      expect.objectContaining({ color: '#33445580' }),
    )
    expect(container.querySelector('[data-novasheet-border-color-palette]')).toBeNull()
    unmount()
  })
})
