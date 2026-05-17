import { describe, expect, it } from 'bun:test'
import {
  getCellContextMenuItems,
  type ContextMenuContext,
} from '../../src/interaction/ContextMenuModel'

const baseCtx: ContextMenuContext = {
  cell: { rowIndex: 0, colIndex: 0 },
  selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
  hasSelection: true,
  clipboardReady: false,
}

describe('getCellContextMenuItems — Phase 4.0', () => {
  it('returns Cut / Copy / Paste in order', () => {
    expect(getCellContextMenuItems(baseCtx).map((i) => i.id)).toEqual(['cut', 'copy', 'paste'])
  })

  it('separator after Copy only', () => {
    const items = getCellContextMenuItems(baseCtx)
    expect(items[0]!.separatorAfter).toBeFalsy()
    expect(items[1]!.separatorAfter).toBe(true)
    expect(items[2]!.separatorAfter).toBeFalsy()
  })

  it('Cut / Copy enabled when hasSelection', () => {
    const items = getCellContextMenuItems(baseCtx)
    expect(items.find((i) => i.id === 'cut')!.disabled).toBe(false)
    expect(items.find((i) => i.id === 'copy')!.disabled).toBe(false)
  })

  it('Cut / Copy disabled when no selection', () => {
    const items = getCellContextMenuItems({ ...baseCtx, hasSelection: false })
    expect(items.find((i) => i.id === 'cut')!.disabled).toBe(true)
    expect(items.find((i) => i.id === 'copy')!.disabled).toBe(true)
  })

  it('Paste disabled when clipboardReady is false', () => {
    expect(getCellContextMenuItems(baseCtx).find((i) => i.id === 'paste')!.disabled).toBe(true)
  })

  it('Paste enabled when clipboardReady is true', () => {
    expect(
      getCellContextMenuItems({ ...baseCtx, clipboardReady: true }).find((i) => i.id === 'paste')!
        .disabled,
    ).toBe(false)
  })

  it('labels are stable English strings', () => {
    const items = getCellContextMenuItems(baseCtx)
    expect(items.find((i) => i.id === 'cut')!.label).toBe('Cut')
    expect(items.find((i) => i.id === 'copy')!.label).toBe('Copy')
    expect(items.find((i) => i.id === 'paste')!.label).toBe('Paste')
  })
})
