import { describe, expect, it } from 'bun:test'
import { columnIndexToLetter } from '../../src/layout/columnLetter'

describe('columnIndexToLetter', () => {
  it('maps 0-based indices to Excel letters', () => {
    expect(columnIndexToLetter(0)).toBe('A')
    expect(columnIndexToLetter(25)).toBe('Z')
    expect(columnIndexToLetter(26)).toBe('AA')
    expect(columnIndexToLetter(27)).toBe('AB')
  })
})
