import { describe, expect, it } from 'bun:test'
import { HideRowsLayer, type CollapsedGap } from '../../src/view/HideRowsLayer'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'
import { SortLayer } from '../../src/view/SortLayer'
import { ViewPipeline } from '../../src/view/ViewPipeline'
import type { Row } from '../../src/data/Schema'

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

describe('HideRowsLayer.wrap — getRows', () => {
  it('getRows 跨 hidden gap 返回正确视图行数（不含 hidden）', () => {
    const ds = mk(10)
    const layer = new HideRowsLayer()
    layer.setHidden([3, 4, 5])
    const composed = layer.wrap(ds)
    const rows = composed.getRows(0, 4) as Row[] // view rows 0..4 = underlying [0,1,2,6,7]
    expect(rows).toHaveLength(5)
    expect(rows[0]!.a).toBe('r0')
    expect(rows[2]!.a).toBe('r2')
    expect(rows[3]!.a).toBe('r6')
    expect(rows[4]!.a).toBe('r7')
  })
})

describe('HideRowsLayer.wrap — subscribe', () => {
  it('subscribe 收到 upstream 事件转发，listener 隔离独立', () => {
    const ds = mk(5)
    const layer = new HideRowsLayer()
    const composed = layer.wrap(ds)
    const events: { type: string }[] = []
    const unsubscribe = composed.subscribe((e) => events.push({ type: e.type }))
    ds.insertRows!(0, 2)
    expect(events.some((e) => e.type === 'rowsInserted')).toBe(true)
    unsubscribe()
    ds.insertRows!(0, 1)
    expect(events.filter((e) => e.type === 'rowsInserted')).toHaveLength(1) // 未再收
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

describe('HideRowsLayer.wrap — resolveUnderlyingRow 越界', () => {
  it('viewRow 越界返回 -1', () => {
    const ds = mk(5)
    const layer = new HideRowsLayer()
    layer.setHidden([1, 2])
    const composed = layer.wrap(ds)
    expect(composed.resolveUnderlyingRow?.(999)).toBe(-1)
    expect(composed.resolveUnderlyingRow?.(-1)).toBe(-1)
  })
})

describe('HideRowsLayer 与 Sort/Filter 组合', () => {
  it('Sort desc + Hide underlying {0,1} → view 看不到这两行', () => {
    const ds = new InMemoryDataSource({
      schema: { fields: [{ id: 'n', name: 'N', type: 'number' as const, width: 100 }] },
      rows: [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }],
    })
    const pipeline = new ViewPipeline(ds)
    const sort = new SortLayer()
    sort.setSpec({ fieldId: 'n', direction: 'desc' })
    const hide = new HideRowsLayer()
    // setHidden 接收 raw underlying ids（spec §5.1）
    // underlying 0=n=1, 1=n=2；隐藏后 Sort desc 留下 n=4, n=3
    hide.setHidden([0, 1]) // underlying n=1, n=2
    pipeline.add(sort)
    pipeline.add(hide)

    const composed = pipeline.getComposed()
    expect(composed.getRowCount()).toBe(2)
    expect(composed.getCell(0, 'n')).toBe(4)
    expect(composed.getCell(1, 'n')).toBe(3)
  })

  it('Hide 状态在 Sort spec 切换后仍然按 raw underlying 生效', () => {
    const ds = new InMemoryDataSource({
      schema: { fields: [{ id: 'n', name: 'N', type: 'number' as const, width: 100 }] },
      rows: [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }],
    })
    const pipeline = new ViewPipeline(ds)
    const sort = new SortLayer()
    const hide = new HideRowsLayer()
    pipeline.add(sort)
    pipeline.add(hide)

    hide.setHidden([0]) // hide raw underlying n=1

    sort.setSpec({ fieldId: 'n', direction: 'asc' })
    let composed = pipeline.getComposed()
    expect(composed.getRowCount()).toBe(3)
    expect(composed.getCell(0, 'n')).toBe(2) // n=1 hidden, ascending: 2,3,4

    sort.setSpec({ fieldId: 'n', direction: 'desc' })
    composed = pipeline.getComposed()
    expect(composed.getRowCount()).toBe(3)
    expect(composed.getCell(0, 'n')).toBe(4) // n=1 still hidden, descending: 4,3,2
  })
})
