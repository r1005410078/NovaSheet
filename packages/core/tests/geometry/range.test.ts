import { describe, expect, it } from 'bun:test'
import {
  cellInRange,
  clamp,
  clampRange,
  isCellInRange,
  mergeVisualRange,
  normalizeRange,
  rangesIntersect,
  unionRange,
} from '../../src/geometry/range'

const r = { startRow: 1, endRow: 3, startCol: 1, endCol: 3 }

describe('geometry/range', () => {
  it('isCellInRange / cellInRange 含边界', () => {
    expect(isCellInRange(1, 1, r)).toBe(true)
    expect(isCellInRange(3, 3, r)).toBe(true)
    expect(isCellInRange(0, 1, r)).toBe(false)
    expect(isCellInRange(4, 2, r)).toBe(false)
    expect(cellInRange({ rowIndex: 2, colIndex: 2 }, r)).toBe(true)
    expect(cellInRange({ rowIndex: 2, colIndex: 4 }, r)).toBe(false)
  })

  it('rangesIntersect 相交/相邻/不交', () => {
    expect(rangesIntersect(r, { startRow: 3, endRow: 5, startCol: 3, endCol: 5 })).toBe(true) // 角接触
    expect(rangesIntersect(r, { startRow: 4, endRow: 5, startCol: 1, endCol: 3 })).toBe(false) // 下方不交
    expect(rangesIntersect(r, { startRow: 0, endRow: 1, startCol: 0, endCol: 1 })).toBe(true)
  })

  it('unionRange 取并集外接矩形', () => {
    expect(unionRange(r, { startRow: 0, endRow: 2, startCol: 5, endCol: 6 })).toEqual({
      startRow: 0,
      endRow: 3,
      startCol: 1,
      endCol: 6,
    })
  })

  it('clamp 将数值限制在闭区间内', () => {
    expect(clamp(-1, 0, 10)).toBe(0)
    expect(clamp(5, 0, 10)).toBe(5)
    expect(clamp(12, 0, 10)).toBe(10)
  })

  it('normalizeRange 归一化反向 range', () => {
    expect(normalizeRange({ startRow: 5, endRow: 2, startCol: 4, endCol: 1 })).toEqual({
      startRow: 2,
      endRow: 5,
      startCol: 1,
      endCol: 4,
    })
  })

  it('clampRange 将 range 端点夹到边界 range 内', () => {
    expect(
      clampRange(
        { startRow: -2, endRow: 5, startCol: 8, endCol: 3 },
        { startRow: 0, endRow: 3, startCol: 1, endCol: 6 },
      ),
    ).toEqual({
      startRow: 0,
      endRow: 3,
      startCol: 3,
      endCol: 6,
    })
  })

  describe('mergeVisualRange', () => {
    const single = { startRow: 1, endRow: 1, startCol: 1, endCol: 1 }

    it('无 activeCell 或无 mergeRegions 时原样返回', () => {
      expect(mergeVisualRange(undefined, single, { rowIndex: 1, colIndex: 1 })).toEqual(single)
      expect(mergeVisualRange([], single, null)).toEqual(single)
    })

    it('activeCell 落在合并区时返回与合并区的 union', () => {
      const regions = [{ range: { startRow: 1, endRow: 3, startCol: 1, endCol: 2 } }] as never
      expect(mergeVisualRange(regions, single, { rowIndex: 1, colIndex: 1 })).toEqual({
        startRow: 1,
        endRow: 3,
        startCol: 1,
        endCol: 2,
      })
    })

    it('activeCell 不在任何合并区时原样返回', () => {
      const regions = [{ range: { startRow: 5, endRow: 6, startCol: 5, endCol: 6 } }] as never
      expect(mergeVisualRange(regions, single, { rowIndex: 1, colIndex: 1 })).toEqual(single)
    })
  })
})
