import { describe, expect, it } from 'bun:test'
import * as react from '../../src'

describe('@zhiguang/novasheet-react color picker exports', () => {
  it('exposes CustomColorPicker for reuse by cell-kit', () => {
    expect(typeof (react as Record<string, unknown>).CustomColorPicker).toBe('function')
  })

  it('exposes toolbar palette building blocks for reuse by cell-kit', () => {
    expect(typeof (react as Record<string, unknown>).ToolbarColorPalette).toBe('function')
    expect(typeof (react as Record<string, unknown>).ToolbarColorPaletteCustom).toBe('function')
  })
})
