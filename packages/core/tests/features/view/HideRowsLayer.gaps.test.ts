import { describe, expect, it } from 'bun:test'
import { HideRowsLayer } from '../../../src/features/view/HideRowsLayer'
import type { DataSource, DataSourceListener } from '../../../src/kernel/data/DataSource'
import type { Row, Schema } from '../../../src/kernel/data/Schema'

const schema: Schema = { fields: [{ id: 'a', name: 'A', type: 'text', width: 100 }] }

/** 行数 + 可选 view→underlying 置换的最小 upstream。 */
function makeUpstream(rowCount: number, perm?: readonly number[]): DataSource {
  return {
    getRowCount: () => rowCount,
    getSchema: () => schema,
    getRows: () => [] as Row[],
    getCell: () => undefined,
    subscribe: (_l: DataSourceListener) => () => {},
    resolveUnderlyingRow: perm ? (viewRow: number) => perm[viewRow] ?? viewRow : undefined,
  }
}

describe('HideRowsLayer.getCollapsedGaps — view 空间', () => {
  it('hide-only：中段单行隐藏，gap 落在前一可见行', () => {
    const layer = new HideRowsLayer()
    layer.wrap(makeUpstream(5))
    layer.setHidden([2])
    const gaps = layer.getCollapsedGaps()
    expect(gaps).toEqual([{ atViewRow: 1, hiddenCount: 1, hiddenIds: [2] }])
  })

  it('hide-only：顶部隐藏段 atViewRow = -1', () => {
    const layer = new HideRowsLayer()
    layer.wrap(makeUpstream(5))
    layer.setHidden([0, 1])
    const gaps = layer.getCollapsedGaps()
    expect(gaps).toEqual([{ atViewRow: -1, hiddenCount: 2, hiddenIds: [0, 1] }])
  })

  it('hide-only：多段不连续', () => {
    const layer = new HideRowsLayer()
    layer.wrap(makeUpstream(8))
    layer.setHidden([2, 5, 6])
    const gaps = layer.getCollapsedGaps()
    expect(gaps).toEqual([
      { atViewRow: 1, hiddenCount: 1, hiddenIds: [2] },
      { atViewRow: 3, hiddenCount: 2, hiddenIds: [5, 6] },
    ])
  })

  it('hide+sort：隐藏 underlying 12（= 排序后 upstream 位置 2），gap 定位正确', () => {
    // 排序置换：view 位置 i → underlying id 10+i
    const layer = new HideRowsLayer()
    layer.wrap(makeUpstream(5, [10, 11, 12, 13, 14]))
    layer.setHidden([12]) // underlying id 12 → upstream 位置 2
    const gaps = layer.getCollapsedGaps()
    // visibleRows = upstream 位置 [0,1,3,4]；gap 在位置 1 与 3 之间 → atViewRow=1，hiddenIds=[12]
    expect(gaps).toEqual([{ atViewRow: 1, hiddenCount: 1, hiddenIds: [12] }])
  })

  it('全隐藏：单 gap atViewRow=-1 覆盖全部', () => {
    const layer = new HideRowsLayer()
    layer.wrap(makeUpstream(3))
    layer.setHidden([0, 1, 2])
    expect(layer.getCollapsedGaps()).toEqual([{ atViewRow: -1, hiddenCount: 3, hiddenIds: [0, 1, 2] }])
  })

  it('无隐藏：空数组', () => {
    const layer = new HideRowsLayer()
    layer.wrap(makeUpstream(3))
    expect(layer.getCollapsedGaps()).toEqual([])
  })
})
