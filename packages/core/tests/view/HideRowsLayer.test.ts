import { describe, expect, it } from 'bun:test'
import { HideRowsLayer, type CollapsedGap } from '../../src/view/HideRowsLayer'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'

const schema = { fields: [{ id: 'a', name: 'A', type: 'text' as const, width: 100 }] }

function mk(rowCount: number): InMemoryDataSource {
  return new InMemoryDataSource({
    schema,
    rows: Array.from({ length: rowCount }, (_, i) => ({ a: `r${i}` })),
  })
}

describe('HideRowsLayer.wrap', () => {
  it('未隐藏任何行 → composed === upstream（identity）', () => {
    const ds = mk(5)
    const layer = new HideRowsLayer()
    const composed = layer.wrap(ds)
    expect(composed.getRowCount()).toBe(5)
    expect(composed.getCell(2, 'a')).toBe('r2')
  })

  it('隐藏 {1, 2} → composed 跳过这些 underlying', () => {
    const ds = mk(5)
    const layer = new HideRowsLayer()
    layer.setHidden([1, 2])
    const composed = layer.wrap(ds)
    expect(composed.getRowCount()).toBe(3)
    expect(composed.getCell(0, 'a')).toBe('r0')
    expect(composed.getCell(1, 'a')).toBe('r3')
    expect(composed.resolveUnderlyingRow?.(1)).toBe(3)
  })
})

describe('HideRowsLayer.getCollapsedGaps', () => {
  it('underlying [0..9]，hidden = {3,4,5} → gap at viewRow 2, count 3', () => {
    const ds = mk(10)
    const layer = new HideRowsLayer()
    layer.setHidden([3, 4, 5])
    layer.wrap(ds)
    const gaps = layer.getCollapsedGaps()
    expect(gaps).toEqual<CollapsedGap[]>([{ atViewRow: 2, hiddenCount: 3, hiddenIds: [3, 4, 5] }])
  })

  it('两个不相邻 hidden 区间各成一 gap', () => {
    const ds = mk(10)
    const layer = new HideRowsLayer()
    layer.setHidden([1, 4, 5])
    layer.wrap(ds)
    const gaps = layer.getCollapsedGaps()
    expect(gaps).toHaveLength(2)
    expect(gaps[0]!.hiddenIds).toEqual([1])
    expect(gaps[1]!.hiddenIds).toEqual([4, 5])
  })
})

describe('HideRowsLayer 响应 upstream 事件', () => {
  it('upstream rowsInserted → hidden underlying id 整体平移', () => {
    const ds = mk(5)
    const layer = new HideRowsLayer()
    layer.setHidden([2, 3])
    layer.wrap(ds)
    ds.insertRows(0, 2) // 在头部插 2 行 → hidden 平移到 [4,5]
    expect(layer.getHiddenUnderlyingRows()).toEqual(new Set([4, 5]))
  })

  it('upstream rowsDeleted → hidden 集合剔除 + 紧缩', () => {
    const ds = mk(10)
    const layer = new HideRowsLayer()
    layer.setHidden([2, 3, 7])
    layer.wrap(ds)
    ds.deleteRows([3]) // 3 被删；2 不动；7 → 6
    expect(layer.getHiddenUnderlyingRows()).toEqual(new Set([2, 6]))
  })
})

describe('HideRowsLayer.bindPipeline 通知', () => {
  it('setHidden 后通知 listener with spec-changed', () => {
    const layer = new HideRowsLayer()
    const events: { layerId: string; reason: string }[] = []
    layer.bindPipeline((change) => events.push({ layerId: change.layerId, reason: change.reason }))
    layer.setHidden([1, 2])
    expect(events).toContainEqual({ layerId: 'hide-rows', reason: 'spec-changed' })
  })
})
