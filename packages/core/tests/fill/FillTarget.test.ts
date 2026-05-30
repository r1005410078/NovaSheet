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

  describe('合并块吸附（snap）', () => {
    // 单格合并源：3 行高 / 2 列宽合并块
    const mergedSource: CellRange = { startRow: 0, endRow: 2, startCol: 0, endCol: 1 }
    const snap = { rowSpan: 3, colSpan: 2 }

    it('向下拖到非整块边界时向上取整补齐整块', () => {
      // hover row 4 → 原始 fill rows 3..4（不足 1 块）→ 吸附到 rows 3..5（整 1 块）
      const t = computeFillTarget(mergedSource, { rowIndex: 4, colIndex: 1 }, dims, snap)
      expect(t?.fill).toEqual({ startRow: 3, endRow: 5, startCol: 0, endCol: 1 })
      expect(t?.result).toEqual({ startRow: 0, endRow: 5, startCol: 0, endCol: 1 })
    })

    it('已落在整块边界时不变', () => {
      const t = computeFillTarget(mergedSource, { rowIndex: 5, colIndex: 1 }, dims, snap)
      expect(t?.fill).toEqual({ startRow: 3, endRow: 5, startCol: 0, endCol: 1 })
    })

    it('向右拖按 colSpan 吸附', () => {
      // hover col 4 → 原始 fill cols 2..4（1.5 块）→ 吸附到 cols 2..5（整 2 块）
      const t = computeFillTarget(mergedSource, { rowIndex: 0, colIndex: 4 }, dims, snap)
      expect(t?.fill).toEqual({ startRow: 0, endRow: 2, startCol: 2, endCol: 5 })
    })

    it('span 为 1 时等价于不吸附', () => {
      const t = computeFillTarget(mergedSource, { rowIndex: 4, colIndex: 1 }, dims, {
        rowSpan: 1,
        colSpan: 1,
      })
      expect(t?.fill).toEqual({ startRow: 3, endRow: 4, startCol: 0, endCol: 1 })
    })

    it('向上拖按 rowSpan 反向取整', () => {
      const src: CellRange = { startRow: 6, endRow: 8, startCol: 0, endCol: 1 }
      // hover row 4 → 原始 fill rows 4..5（不足 1 块）→ 吸附到 rows 3..5
      const t = computeFillTarget(src, { rowIndex: 4, colIndex: 0 }, dims, snap)
      expect(t?.fill).toEqual({ startRow: 3, endRow: 5, startCol: 0, endCol: 1 })
    })

    it('光标落在已有合并上时吸附到该合并边界（优先于 round-up）', () => {
      const src: CellRange = { startRow: 0, endRow: 1, startCol: 0, endCol: 0 }
      const targetMerge: CellRange = { startRow: 2, endRow: 4, startCol: 0, endCol: 0 }
      // 源块 2 行；hover 落在目标合并 rows2-4 内（row3）→ 吸附到 rows2-4（不 round-up 到 5）
      const t = computeFillTarget(
        src,
        { rowIndex: 3, colIndex: 0 },
        dims,
        { rowSpan: 2, colSpan: 1 },
        targetMerge,
      )
      expect(t?.fill).toEqual({ startRow: 2, endRow: 4, startCol: 0, endCol: 0 })
    })

    it('向右光标落在已有横向合并上时吸附到其右边界', () => {
      const src: CellRange = { startRow: 0, endRow: 0, startCol: 0, endCol: 1 }
      const targetMerge: CellRange = { startRow: 0, endRow: 0, startCol: 2, endCol: 4 }
      const t = computeFillTarget(
        src,
        { rowIndex: 0, colIndex: 3 },
        dims,
        { rowSpan: 1, colSpan: 2 },
        targetMerge,
      )
      expect(t?.fill).toEqual({ startRow: 0, endRow: 0, startCol: 2, endCol: 4 })
    })
  })
})
