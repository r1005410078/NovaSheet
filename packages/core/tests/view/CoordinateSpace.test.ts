import { describe, expect, it } from 'bun:test'
import { CoordinateSpace, type CoordinateContext } from '../../src/view/CoordinateSpace'
import { asRawRange } from '../../src/view/coordinates'
import type { DataSource } from '../../src/data/DataSource'
import type { Schema } from '../../src/data/Schema'

const schema: Schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text', width: 80 },
    { id: 'b', name: 'B', type: 'text', width: 80 },
    { id: 'c', name: 'C', type: 'text', width: 80 },
  ],
}

/** view 行序映射；order[viewRow] = rawRow。 */
function makeData(order: number[]): DataSource {
  return {
    getRowCount: () => order.length,
    getSchema: () => schema,
    getRows: () => [],
    getCell: () => null,
    subscribe: () => () => {},
    resolveUnderlyingRow: (viewRow: number) => order[viewRow] ?? viewRow,
    findViewRow: (raw: number) => order.indexOf(raw),
  } as unknown as DataSource
}

function makeSpace(order: number[], hidden: Set<string> = new Set()): CoordinateSpace {
  const ctx: CoordinateContext = {
    getViewData: () => makeData(order),
    getRawSchema: () => schema,
    isColHidden: (id) => hidden.has(id),
  }
  return new CoordinateSpace(ctx)
}

describe('CoordinateSpace', () => {
  it('恒等映射（无 hide/sort/filter）', () => {
    const s = makeSpace([0, 1, 2])
    expect(s.viewRowToRaw(2)).toBe(2)
    expect(s.rawRowToView(2)).toBe(2)
    expect(s.viewColToRaw(1)).toBe(1)
    expect(s.rawColToView(1)).toBe(1)
    expect(s.viewRangeToRaw({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 })).toEqual(
      asRawRange({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 }),
    )
  })

  it('隐藏列：viewCol↔rawCol 跳过隐藏列', () => {
    const s = makeSpace([0, 1, 2], new Set(['b'])) // 隐藏 b → view: a(0)->raw0, c(1)->raw2
    expect(s.viewColToRaw(1)).toBe(2)
    expect(s.rawColToView(2)).toBe(1)
    expect(s.rawColToView(1)).toBe(-1) // b 隐藏
  })

  it('排序打乱：view 区映射非连续 → viewRangeToRaw 返回 null', () => {
    const s = makeSpace([2, 0, 1]) // view 行 0,1 → raw 2,0（不连续）
    expect(s.viewRangeToRaw({ startRow: 0, endRow: 1, startCol: 0, endCol: 0 })).toBeNull()
  })

  it('连续子段仍可映射', () => {
    const s = makeSpace([2, 0, 1]) // view 行 1,2 → raw 0,1（连续）
    expect(s.viewRangeToRaw({ startRow: 1, endRow: 2, startCol: 0, endCol: 0 })).toEqual(
      asRawRange({ startRow: 0, endRow: 1, startCol: 0, endCol: 0 }),
    )
  })

  it('fieldIdToRaw：fieldId → raw 列序；未知 id 返回 -1', () => {
    const s = makeSpace([0, 1, 2])
    expect(s.fieldIdToRaw('a')).toBe(0)
    expect(s.fieldIdToRaw('c')).toBe(2)
    expect(s.fieldIdToRaw('zzz')).toBe(-1)
  })
})
