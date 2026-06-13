import { describe, expect, it } from 'bun:test'
import { applyBoldToRange, type RichTextGridAccess } from '../../src/rich-text/selectionBold'
import type { RichTextValue } from '../../src/rich-text/types'

function fakeGrid(values: Record<string, string>, attach: Record<string, RichTextValue> = {}): RichTextGridAccess & { written: Record<string, RichTextValue | undefined> } {
  const written: Record<string, RichTextValue | undefined> = {}
  return {
    written,
    getCellText: (r, c) => values[`${r},${c}`] ?? '',
    getRichText: (r, c) => attach[`${r},${c}`],
    setRichText: (r, c, runs) => { written[`${r},${c}`] = runs; return true },
  }
}

describe('applyBoldToRange', () => {
  it('writes full-span bold run per cell in range', () => {
    const g = fakeGrid({ '0,0': 'ab', '1,0': 'xyz' })
    applyBoldToRange(g, { startRow: 0, endRow: 1, startCol: 0, endCol: 0 })
    expect(g.written['0,0']).toEqual([{ start: 0, end: 2, attrs: { bold: true } }])
    expect(g.written['1,0']).toEqual([{ start: 0, end: 3, attrs: { bold: true } }])
  })

  it('toggles off when every cell already full-span bold', () => {
    const full: RichTextValue = [{ start: 0, end: 2, attrs: { bold: true } }]
    const g = fakeGrid({ '0,0': 'ab' }, { '0,0': full })
    applyBoldToRange(g, { startRow: 0, endRow: 0, startCol: 0, endCol: 0 })
    expect(g.written['0,0']).toEqual([]) // 清除
  })

  it('skips empty cells (no text → no run)', () => {
    const g = fakeGrid({ '0,0': '' })
    applyBoldToRange(g, { startRow: 0, endRow: 0, startCol: 0, endCol: 0 })
    expect(g.written['0,0']).toBeUndefined()
  })
})
