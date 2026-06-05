import { describe, expect, it } from 'bun:test'
import { ChunkedAxis } from '../../../src/geometry/ChunkedAxis'
import {
  buildRawRowsAxisFromHeights,
  captureRowHeights,
  getNewlyHiddenRows,
  getNewlyVisibleRows,
  normalizeDeleteRows,
  normalizeMoveRows,
  remapRowsByIndexMap,
  reorderByIndexMap,
} from '../../../src/engine/row/RowRules'

describe('RowRules', () => {
  it('normalizes a row move into forward and inverse plans', () => {
    const plan = normalizeMoveRows(4, [1, 2], null)

    expect(plan).not.toBeNull()
    expect(plan?.rowIds).toEqual([1, 2])
    expect(plan?.beforeRowId).toBeNull()
    expect(plan?.inverseRowIds).toEqual([2, 3])
    expect(plan?.inverseBeforeRowId).toBe(1)
    expect(Array.from(plan?.indexMap.entries() ?? [])).toEqual([
      [0, 0],
      [3, 1],
      [1, 2],
      [2, 3],
    ])
  })

  it('rejects self drops and non-contiguous row groups', () => {
    expect(normalizeMoveRows(4, [1, 2], 2)).toBeNull()
    expect(normalizeMoveRows(4, [0, 2], null)).toBeNull()
  })

  it('reorders values by the produced index map', () => {
    const plan = normalizeMoveRows(4, [1, 2], null)

    expect(reorderByIndexMap(['A', 'B', 'C', 'D'], plan!.indexMap)).toEqual([
      'A',
      'D',
      'B',
      'C',
    ])
  })

  it('captures and rebuilds raw row heights', () => {
    const axis = new ChunkedAxis({ count: 3, defaultSize: 24 })
    axis.setSize(1, 32)

    const heights = captureRowHeights(axis)
    const rebuilt = buildRawRowsAxisFromHeights(heights, 24)

    expect(heights).toEqual([24, 32, 24])
    expect(rebuilt.getCount()).toBe(3)
    expect(rebuilt.getSize(0)).toBe(24)
    expect(rebuilt.getSize(1)).toBe(32)
    expect(rebuilt.getSize(2)).toBe(24)
  })

  it('remaps hidden row ids by old-to-new row index map', () => {
    const plan = normalizeMoveRows(4, [1, 2], null)

    expect(remapRowsByIndexMap([1, 3], plan!.indexMap)).toEqual([2, 1])
  })

  it('normalizes delete row ids and rejects empty, out-of-range, or non-ascending sets', () => {
    expect(normalizeDeleteRows(3, [0, 2])).toEqual([0, 2])
    expect(normalizeDeleteRows(3, [])).toBeNull()
    expect(normalizeDeleteRows(3, [-1])).toBeNull()
    expect(normalizeDeleteRows(3, [3])).toBeNull()
    expect(normalizeDeleteRows(3, [1, 1])).toBeNull()
    expect(normalizeDeleteRows(3, [2, 1])).toBeNull()
  })

  it('filters hide and unhide requests to effective row ids', () => {
    const hidden = new Set([1, 3])

    expect(getNewlyHiddenRows([0, 1, 3], hidden)).toEqual([0])
    expect(getNewlyVisibleRows([0, 1, 3], hidden)).toEqual([1, 3])
  })
})
