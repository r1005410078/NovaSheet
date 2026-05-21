import { describe, expect, it } from 'bun:test'
import { computeFillTarget } from '../../src/fill/FillTarget'
import type { CellRange } from '../../src/interaction/SelectionModel'

const source: CellRange = { startRow: 2, endRow: 3, startCol: 1, endCol: 2 }
const dims = { rowCount: 10, colCount: 8 }

describe('computeFillTarget', () => {
  it('returns null when hover is inside source', () => {
    expect(computeFillTarget(source, { rowIndex: 2, colIndex: 1 }, dims)).toBeNull()
    expect(computeFillTarget(source, { rowIndex: 3, colIndex: 2 }, dims)).toBeNull()
  })

  it('computes downward fill range and result range', () => {
    expect(computeFillTarget(source, { rowIndex: 6, colIndex: 2 }, dims)).toEqual({
      source,
      direction: 'down',
      fill: { startRow: 4, endRow: 6, startCol: 1, endCol: 2 },
      result: { startRow: 2, endRow: 6, startCol: 1, endCol: 2 },
    })
  })

  it('computes upward fill range and result range', () => {
    expect(computeFillTarget(source, { rowIndex: 0, colIndex: 1 }, dims)).toEqual({
      source,
      direction: 'up',
      fill: { startRow: 0, endRow: 1, startCol: 1, endCol: 2 },
      result: { startRow: 0, endRow: 3, startCol: 1, endCol: 2 },
    })
  })

  it('computes rightward and leftward fill ranges', () => {
    expect(computeFillTarget(source, { rowIndex: 2, colIndex: 5 }, dims)?.fill).toEqual({
      startRow: 2,
      endRow: 3,
      startCol: 3,
      endCol: 5,
    })
    expect(computeFillTarget(source, { rowIndex: 3, colIndex: 0 }, dims)?.fill).toEqual({
      startRow: 2,
      endRow: 3,
      startCol: 0,
      endCol: 0,
    })
  })

  it('chooses the dominant axis when hover is diagonal', () => {
    expect(computeFillTarget(source, { rowIndex: 8, colIndex: 4 }, dims)?.direction).toBe('down')
    expect(computeFillTarget(source, { rowIndex: 4, colIndex: 7 }, dims)?.direction).toBe('right')
  })

  it('clamps hover to grid bounds', () => {
    expect(computeFillTarget(source, { rowIndex: 99, colIndex: 2 }, dims)?.fill).toEqual({
      startRow: 4,
      endRow: 9,
      startCol: 1,
      endCol: 2,
    })
    expect(computeFillTarget(source, { rowIndex: 2, colIndex: -5 }, dims)?.fill).toEqual({
      startRow: 2,
      endRow: 3,
      startCol: 0,
      endCol: 0,
    })
  })
})
