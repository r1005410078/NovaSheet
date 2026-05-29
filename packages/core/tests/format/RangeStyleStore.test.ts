import { describe, expect, it } from 'bun:test'
import { RangeStyleStore } from '../../src/format/RangeStyleStore'

describe('RangeStyleStore', () => {
  it('merges later border patches per edge instead of replacing prior edges', () => {
    const store = new RangeStyleStore()
    const range = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }
    const red = { color: '#d93025', width: 'thin', lineStyle: 'solid' } as const

    store.applyBorders(range, 'top', red)
    store.applyBorders(range, 'bottom', red)

    const borders = store.resolveCell(0, 0)?.borders
    expect(borders?.top).toEqual(red)
    expect(borders?.bottom).toEqual(red)
  })

  it('resolves later fill layers over earlier layers without expanding the full range', () => {
    const store = new RangeStyleStore()
    store.apply({ startRow: 0, endRow: 999_999, startCol: 0, endCol: 499 }, { fillColor: '#fff2cc' })
    store.apply({ startRow: 3, endRow: 4, startCol: 2, endCol: 2 }, { fillColor: '#d9ead3' })

    expect(store.getLayerCount()).toBe(2)
    expect(store.resolveCell(2, 2)?.fillColor).toBe('#fff2cc')
    expect(store.resolveCell(3, 2)?.fillColor).toBe('#d9ead3')
    expect(store.resolveVisible({ startRow: 3, endRow: 4, startCol: 2, endCol: 3 })).toEqual([
      { rowIndex: 3, colIndex: 2, format: { fillColor: '#d9ead3' } },
      { rowIndex: 3, colIndex: 3, format: { fillColor: '#fff2cc' } },
      { rowIndex: 4, colIndex: 2, format: { fillColor: '#d9ead3' } },
      { rowIndex: 4, colIndex: 3, format: { fillColor: '#fff2cc' } },
    ])
  })

  it('borders field is preserved through generic merge and not erased by a later fillColor layer', () => {
    const store = new RangeStyleStore()
    store.apply({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, {
      borders: { top: { color: '#000', width: 'thin', lineStyle: 'solid' } },
    })
    store.apply({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, { fillColor: '#fff2cc' })

    const result = store.resolveCell(0, 0)
    expect(result?.borders?.top?.color).toBe('#000')
    expect(result?.fillColor).toBe('#fff2cc')
  })

  it('clearFill removes only fillColor while keeping other fields available for later tasks', () => {
    const store = new RangeStyleStore()
    store.apply({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 }, { fillColor: '#fff2cc' })
    store.clearFill({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 })

    expect(store.resolveCell(0, 0)).toBeUndefined()
    expect(store.resolveCell(0, 1)?.fillColor).toBe('#fff2cc')
  })

  it('clearFill on a range with no prior formatting does NOT push a layer (no-op)', () => {
    const store = new RangeStyleStore()
    const range = { startRow: 5, endRow: 5, startCol: 5, endCol: 5 }
    store.clearFill(range)
    expect(store.getLayerCount()).toBe(0)
  })

  it('clearFill on a range that intersects a prior fill pushes a clear layer', () => {
    const store = new RangeStyleStore()
    store.apply({ startRow: 0, endRow: 2, startCol: 0, endCol: 2 }, { fillColor: '#ff0000' })
    expect(store.getLayerCount()).toBe(1)
    store.clearFill({ startRow: 1, endRow: 1, startCol: 1, endCol: 1 })
    expect(store.getLayerCount()).toBe(2)
    expect(store.resolveCell(1, 1)).toBeUndefined()
    expect(store.resolveCell(0, 0)?.fillColor).toBe('#ff0000')
  })

  it('clearBorders on a range with no prior formatting does NOT push a layer (no-op)', () => {
    const store = new RangeStyleStore()
    store.clearBorders({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 })
    expect(store.getLayerCount()).toBe(0)
  })

  it('clearFill over a borders-only range does NOT push a layer (kind-aware no-op)', () => {
    const store = new RangeStyleStore()
    store.apply({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, {
      borders: { top: { color: '#000', width: 'thin', lineStyle: 'solid' } },
    })
    expect(store.getLayerCount()).toBe(1)
    store.clearFill({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 })
    expect(store.getLayerCount()).toBe(1)
  })

  it('clearBorders over a fill-only range does NOT push a layer (kind-aware no-op)', () => {
    const store = new RangeStyleStore()
    store.apply({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, { fillColor: '#fff2cc' })
    expect(store.getLayerCount()).toBe(1)
    store.clearBorders({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 })
    expect(store.getLayerCount()).toBe(1)
  })

  it('clearFill over a prior clearFill marker still pushes (marker counts as fill kind)', () => {
    const store = new RangeStyleStore()
    store.apply({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, { fillColor: '#fff2cc' })
    store.clearFill({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 })
    expect(store.getLayerCount()).toBe(2)
    // A second clearFill that only intersects the prior clearFill marker still contributes a fill kind.
    store.clearFill({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 })
    expect(store.getLayerCount()).toBe(3)
  })
})
