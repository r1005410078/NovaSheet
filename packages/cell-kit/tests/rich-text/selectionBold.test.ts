import { describe, expect, it } from 'bun:test'
import { applyBoldToRange, applySelectionBold, createGridAccess, type RichTextGrid, type RichTextGridAccess } from '../../src/rich-text/selectionBold'
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

describe('createGridAccess', () => {
  it('adapts grid to RichTextGridAccess', () => {
    const fakeGrid: RichTextGrid = {
      getCellText: (r, c) => `cell(${r},${c})`,
      getCellAttachment: () => undefined,
      setCellAttachment: () => true,
      getSelection: () => ({ selectedRange: null }),
    }
    const access = createGridAccess(fakeGrid)
    expect(access.getCellText(1, 2)).toBe('cell(1,2)')
  })

  it('getRichText reads richText namespace from getCellAttachment', () => {
    const stored: RichTextValue = [{ start: 0, end: 2, attrs: { bold: true } }]
    const fakeGrid: RichTextGrid = {
      getCellText: () => '',
      getCellAttachment: (ns, r, c) => ns === 'richText' && r === 0 && c === 0 ? stored : undefined,
      setCellAttachment: () => true,
      getSelection: () => ({ selectedRange: null }),
    }
    const access = createGridAccess(fakeGrid)
    expect(access.getRichText(0, 0)).toBe(stored)
    expect(access.getRichText(0, 1)).toBeUndefined()
  })
})

describe('applySelectionBold', () => {
  it('applies bold to each cell in selected range', () => {
    const attachments: Record<string, unknown> = {}
    const fakeGrid: RichTextGrid = {
      getCellText: (r, c) => `cell(${r},${c})`,
      getCellAttachment: (_ns, r, c) => attachments[`${r},${c}`],
      setCellAttachment: (_ns, r, c, data) => { attachments[`${r},${c}`] = data; return true },
      getSelection: () => ({ selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 1 } }),
    }
    applySelectionBold(fakeGrid)
    expect(attachments['0,0']).toBeDefined()
    expect(attachments['0,1']).toBeDefined()
  })

  it('applySelectionBold applies bold to all cells in multi-row multi-col range', () => {
    const attachments: Record<string, unknown> = {}
    const fakeGrid: RichTextGrid = {
      getCellText: () => 'abc',
      getCellAttachment: (_ns, r, c) => attachments[`${r},${c}`],
      setCellAttachment: (_ns, r, c, data) => { attachments[`${r},${c}`] = data; return true },
      getSelection: () => ({ selectedRange: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 } }),
    }
    applySelectionBold(fakeGrid)
    // 2 rows × 2 cols = 4 cells all written
    expect(attachments['0,0']).toBeDefined()
    expect(attachments['0,1']).toBeDefined()
    expect(attachments['1,0']).toBeDefined()
    expect(attachments['1,1']).toBeDefined()
  })

  it('is a no-op when selection is null', () => {
    let called = false
    const fakeGrid: RichTextGrid = {
      getCellText: () => 'x',
      getCellAttachment: () => undefined,
      setCellAttachment: () => { called = true; return true },
      getSelection: () => ({ selectedRange: null }),
    }
    applySelectionBold(fakeGrid)
    expect(called).toBe(false)
  })
})
