import { describe, expect, it } from 'bun:test'
import { VisibleFormatResolver } from '../../src/engine/VisibleFormatResolver'
import { RangeStyleStore } from '../../src/format/RangeStyleStore'
import { MergeStore } from '../../src/merge/MergeStore'
import { CoordinateSpace } from '../../src/view/CoordinateSpace'
import type { DataSource } from '../../src/kernel/data/DataSource'
import type { Schema } from '../../src/kernel/data/Schema'
import { asRawRange } from '../../src/view/coordinates'

const schema: Schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text', width: 80 },
    { id: 'b', name: 'B', type: 'text', width: 80 },
  ],
}

// 恒等 view↔raw（无 hide/sort/filter）
function identityCoords(): CoordinateSpace {
  const data = {
    getRowCount: () => 10,
    getSchema: () => schema,
    getRows: () => [],
    getCell: () => null,
    subscribe: () => () => {},
  } as unknown as DataSource
  return new CoordinateSpace({
    getViewData: () => data,
    getRawSchema: () => schema,
    isColHidden: () => false,
  })
}

function setup() {
  const formatStore = new RangeStyleStore()
  const mergeStore = new MergeStore()
  const resolver = new VisibleFormatResolver(formatStore, mergeStore, identityCoords())
  return { formatStore, mergeStore, resolver }
}

describe('VisibleFormatResolver', () => {
  it('cellFormats 收集可见区命中的格式（view 坐标）', () => {
    const { formatStore, resolver } = setup()
    formatStore.apply(asRawRange({ startRow: 1, endRow: 1, startCol: 0, endCol: 0 }), { fillColor: '#fff2cc' })
    const out = resolver.cellFormats(0, 3, 0, 1, [])
    expect(out).toEqual([{ rowIndex: 1, colIndex: 0, format: { fillColor: '#fff2cc' } }])
  })

  it('store 空时短路返回空', () => {
    const { resolver } = setup()
    expect(resolver.cellFormats(0, 3, 0, 1, [])).toEqual([])
    expect(resolver.mergeRegions(0, 3, 0, 1)).toEqual([])
  })

  it('mergeRegions 返回与可见区相交的合并（view 坐标）', () => {
    const { mergeStore, resolver } = setup()
    mergeStore.merge(asRawRange({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 }))
    const out = resolver.mergeRegions(0, 3, 0, 1)
    expect(out.length).toBe(1)
    expect(out[0]!.range).toEqual({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 })
  })

  it('anchor 滚出扫描范围但区域相交时补发 anchor 格式', () => {
    const { formatStore, mergeStore, resolver } = setup()
    formatStore.apply(asRawRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }), { fillColor: '#d9ead3' })
    mergeStore.merge(asRawRange({ startRow: 0, endRow: 2, startCol: 0, endCol: 0 }))
    const merges = resolver.mergeRegions(1, 2, 0, 0) // 可见区 rows1-2，anchor 在 row0（扫描范围外）
    const out = resolver.cellFormats(1, 2, 0, 0, merges)
    // anchor(0,0) 的填充被补发
    expect(out.some((f) => f.rowIndex === 0 && f.colIndex === 0)).toBe(true)
  })
})
