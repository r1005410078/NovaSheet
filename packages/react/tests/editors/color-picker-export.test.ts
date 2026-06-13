import { describe, expect, it } from 'bun:test'
import * as react from '../../src'

describe('@novasheet/react exports CustomColorPicker', () => {
  it('exposes CustomColorPicker for reuse by cell-kit', () => {
    expect(typeof (react as Record<string, unknown>).CustomColorPicker).toBe('function')
  })
})
