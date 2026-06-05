import { describe, expect, it } from 'bun:test'
import {
  buildColIndexMap,
  captureRawColWidths,
  getNewlyHiddenCols,
  getNewlyVisibleCols,
  isContiguousFieldGroup,
  normalizeDeleteCols,
  normalizeMoveCols,
} from '../../../src/engine/column/ColumnRules'
import { ChunkedAxis } from '../../../src/geometry/ChunkedAxis'
import type { Field } from '../../../src/data/Schema'

function fields(ids: string[]): Field[] {
  return ids.map((id) => ({ id, name: id, type: 'text', width: 80 }))
}

describe('ColumnRules', () => {
  it('normalizeMoveCols returns plan for a contiguous group', () => {
    const plan = normalizeMoveCols(fields(['a', 'b', 'c', 'd']), ['b', 'c'], null)
    expect(plan).not.toBeNull()
    expect(plan?.fieldIds).toEqual(['b', 'c'])
    expect(plan?.beforeFieldId).toBeNull()
    expect(plan?.inverseBeforeFieldId).toBe('d')
  })

  it('normalizeMoveCols rejects non-contiguous / no-op / into-self', () => {
    expect(normalizeMoveCols(fields(['a', 'b', 'c']), ['a', 'c'], null)).toBeNull()
    expect(normalizeMoveCols(fields(['a', 'b', 'c']), ['a'], 'b')).toBeNull() // no-op
    expect(normalizeMoveCols(fields(['a', 'b', 'c']), ['a', 'b'], 'a')).toBeNull()
  })

  it('isContiguousFieldGroup', () => {
    expect(isContiguousFieldGroup(fields(['a', 'b', 'c']), ['a', 'b'])).toBe(true)
    expect(isContiguousFieldGroup(fields(['a', 'b', 'c']), ['a', 'c'])).toBe(false)
  })

  it('buildColIndexMap pairs old→new raw indices by fieldId', () => {
    const before = ['a', 'b', 'c']
    const after = fields(['b', 'c', 'a'])
    const map = buildColIndexMap(before, after)
    expect(map.get(0)).toBe(2) // a: 0→2
    expect(map.get(1)).toBe(0) // b: 1→0
    expect(map.get(2)).toBe(1) // c: 2→1
  })

  it('captureRawColWidths snapshots width per fieldId', () => {
    const axis = new ChunkedAxis({ count: 3, defaultSize: 80 })
    axis.setSize(1, 120)
    const widths = captureRawColWidths(fields(['a', 'b', 'c']), axis)
    expect(widths.get('a')).toBe(80)
    expect(widths.get('b')).toBe(120)
  })

  it('normalizeDeleteCols sorts hits by raw index and drops unknown ids', () => {
    const result = normalizeDeleteCols(fields(['a', 'b', 'c']), ['c', 'a', 'zzz'])
    expect(result).toEqual([
      { id: 'a', idx: 0 },
      { id: 'c', idx: 2 },
    ])
    expect(normalizeDeleteCols(fields(['a']), ['zzz'])).toEqual([])
  })

  it('getNewlyHiddenCols / getNewlyVisibleCols filter against current hidden set', () => {
    const known = fields(['a', 'b', 'c'])
    expect(getNewlyHiddenCols(known, ['a', 'b'], new Set(['a']))).toEqual(['b'])
    expect(getNewlyHiddenCols(known, ['zzz'], new Set())).toEqual([]) // unknown dropped
    expect(getNewlyVisibleCols(['a', 'b'], new Set(['a']))).toEqual(['a'])
  })
})
