import { describe, expect, it } from 'bun:test'
import { RowMoveNormalizer } from '../../src'

function entries(map: ReadonlyMap<number, number>): readonly [number, number][] {
  return [...map.entries()].sort((a, b) => a[0] - b[0])
}

describe('RowMoveNormalizer', () => {
  const normalizer = new RowMoveNormalizer()

  it('normalizes row ids and builds an old-to-new index map', () => {
    const plan = normalizer.normalize(4, [2, 1], 0)

    expect(plan?.rowIds).toEqual([1, 2])
    expect(plan?.beforeRowId).toBe(0)
    expect(plan?.inverseRowIds).toEqual([0, 1])
    expect(plan?.inverseBeforeRowId).toBe(3)
    expect(entries(plan!.indexMap)).toEqual([
      [0, 2],
      [1, 0],
      [2, 1],
      [3, 3],
    ])
  })

  it('computes undo coordinates when moving a block to the end', () => {
    const plan = normalizer.normalize(4, [1, 2], null)

    expect(plan?.rowIds).toEqual([1, 2])
    expect(plan?.beforeRowId).toBeNull()
    expect(plan?.inverseRowIds).toEqual([2, 3])
    expect(plan?.inverseBeforeRowId).toBe(1)
  })

  it('rejects empty, non-contiguous, and out-of-range row groups', () => {
    expect(normalizer.normalize(4, [], null)).toBeNull()
    expect(normalizer.normalize(4, [0, 2], null)).toBeNull()
    expect(normalizer.normalize(4, [3, 4], null)).toBeNull()
  })

  it('rejects self drops and invalid targets', () => {
    expect(normalizer.normalize(4, [1, 2], 1)).toBeNull()
    expect(normalizer.normalize(4, [1, 2], 3)).toBeNull()
    expect(normalizer.normalize(4, [1, 2], 5)).toBeNull()
  })
})
