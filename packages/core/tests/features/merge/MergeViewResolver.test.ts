import { describe, expect, it } from 'bun:test'
import {
  mergeRegionToView,
  resolveViewMergeRegion,
  type MergeViewCoords,
} from '../../../src/features/merge/MergeViewResolver'
import type { MergeRegion } from '../../../src/features/merge/MergeStore'

/** 用 view→raw 映射数组构造 fake coords；数组下标=view，值=raw。 */
function makeCoords(viewToRawRow: number[], viewToRawCol: number[]): MergeViewCoords {
  const rawToViewRow = new Map(viewToRawRow.map((raw, view) => [raw, view]))
  const rawToViewCol = new Map(viewToRawCol.map((raw, view) => [raw, view]))
  return {
    viewRowToRaw: (v) => viewToRawRow[v] ?? -1,
    viewColToRaw: (v) => viewToRawCol[v] ?? -1,
    rawRowToView: (r) => rawToViewRow.get(r) ?? -1,
    rawColToView: (r) => rawToViewCol.get(r) ?? -1,
  }
}

function region(
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
): MergeRegion {
  return {
    id: 'm1',
    range: { startRow, endRow, startCol, endCol },
    anchor: { rowIndex: startRow, colIndex: startCol },
  }
}

const source = (regions: MergeRegion[]) => ({
  getRegionAt: (rowIndex: number, colIndex: number) =>
    regions.find(
      (r) =>
        rowIndex >= r.range.startRow &&
        rowIndex <= r.range.endRow &&
        colIndex >= r.range.startCol &&
        colIndex <= r.range.endCol,
    ) ?? null,
})

describe('resolveViewMergeRegion — view≠raw', () => {
  it('排序/筛选下点查询返回正确的 VIEW 坐标合并区', () => {
    // raw row 1 被筛除：view[0,1,2] → raw[0,2,3]
    const coords = makeCoords([0, 2, 3], [0, 1, 2])
    // RAW 合并区 rows 2..3 × cols 0..1
    const store = source([region(2, 3, 0, 1)])

    // 点击 view (1,0) → raw (2,0) 命中合并区
    const result = resolveViewMergeRegion(store, coords, 1, 0)
    expect(result?.range).toEqual({ startRow: 1, endRow: 2, startCol: 0, endCol: 1 })
    expect(result?.anchor).toEqual({ rowIndex: 1, colIndex: 0 })
  })

  it('view==raw 时恒等返回原区', () => {
    const coords = makeCoords([0, 1, 2, 3], [0, 1, 2, 3])
    const store = source([region(1, 2, 1, 2)])
    expect(resolveViewMergeRegion(store, coords, 1, 1)?.range).toEqual({
      startRow: 1,
      endRow: 2,
      startCol: 1,
      endCol: 2,
    })
  })

  it('合并区内有被筛除的行（行序非连续）→ null', () => {
    // raw row 1 被筛除，合并区 raw rows 0..2 跨越它
    const coords = makeCoords([0, 2, 3], [0, 1, 2])
    const store = source([region(0, 2, 0, 0)])
    expect(resolveViewMergeRegion(store, coords, 0, 0)).toBeNull()
  })

  it('合并区含隐藏列 → null', () => {
    // raw col 1 隐藏：view[0,1] → raw[0,2]
    const coords = makeCoords([0, 1], [0, 2])
    const store = source([region(0, 0, 0, 1)])
    expect(resolveViewMergeRegion(store, coords, 0, 0)).toBeNull()
  })

  it('点不在任何合并区 → null', () => {
    const coords = makeCoords([0, 1, 2], [0, 1, 2])
    const store = source([region(1, 2, 1, 2)])
    expect(resolveViewMergeRegion(store, coords, 0, 0)).toBeNull()
  })

  it('隐藏单元格自身（viewColToRaw=-1）→ null', () => {
    const coords = makeCoords([0, 1, 2], [0, 1, 2])
    const store = source([region(0, 0, 0, 0)])
    expect(resolveViewMergeRegion(store, coords, 0, 5)).toBeNull()
  })
})

describe('mergeRegionToView', () => {
  it('行序非连续返回 null', () => {
    const coords = makeCoords([0, 2, 3], [0, 1, 2])
    expect(mergeRegionToView(region(0, 2, 0, 0), coords)).toBeNull()
  })
})
