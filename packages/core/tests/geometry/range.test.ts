import { describe, expect, it } from 'bun:test'
import { cellInRange, isCellInRange, rangesIntersect, unionRange } from '../../src/geometry/range'

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
})
