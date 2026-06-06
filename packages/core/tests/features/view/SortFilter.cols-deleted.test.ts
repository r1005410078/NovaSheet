import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../../src/kernel/data/InMemoryDataSource'
import { FilterLayer } from '../../../src/features/view/FilterLayer'
import { SortLayer } from '../../../src/features/view/SortLayer'
import { ViewPipeline } from '../../../src/features/view/ViewPipeline'

const schema = {
  fields: [
    { id: 'n', name: 'N', type: 'number' as const, width: 100 },
    { id: 't', name: 'T', type: 'text' as const, width: 100 },
  ],
}

describe('SortLayer / FilterLayer 在 colsDeleted 命中 spec.fieldId 时 invalidate', () => {
  it('SortLayer.spec.fieldId 命中 removed → spec 清空', () => {
    const ds = new InMemoryDataSource({ schema, rows: [{ n: 1, t: 'a' }, { n: 2, t: 'b' }] })
    const pipeline = new ViewPipeline(ds)
    const sort = new SortLayer()
    pipeline.add(sort)
    sort.setSpec({ fieldId: 'n', direction: 'asc' })
    expect(sort.getSpec()).not.toBeNull()

    ds.removeField!('n')

    expect(sort.getSpec()).toBeNull()
  })

  it('FilterLayer.spec.fieldId 命中 removed → spec 清空', () => {
    const ds = new InMemoryDataSource({ schema, rows: [{ n: 1, t: 'a' }] })
    const pipeline = new ViewPipeline(ds)
    const filter = new FilterLayer()
    pipeline.add(filter)
    filter.setSpec({ fieldId: 't', op: { kind: 'text-equals', value: 'a', caseSensitive: true } })
    expect(filter.getSpec()).not.toBeNull()

    ds.removeField!('t')

    expect(filter.getSpec()).toBeNull()
  })

  it('colsDeleted 不命中 spec → spec 保持', () => {
    const ds = new InMemoryDataSource({ schema, rows: [{ n: 1, t: 'a' }] })
    const pipeline = new ViewPipeline(ds)
    const sort = new SortLayer()
    pipeline.add(sort)
    sort.setSpec({ fieldId: 'n', direction: 'asc' })

    ds.removeField!('t')

    expect(sort.getSpec()).toEqual({ fieldId: 'n', direction: 'asc' })
  })

  it('colsDeleted 不触发 pipeline.rebuild', () => {
    const ds = new InMemoryDataSource({ schema, rows: [{ n: 1, t: 'a' }] })
    const pipeline = new ViewPipeline(ds)
    const sort = new SortLayer()
    const filter = new FilterLayer()
    pipeline.add(sort)
    pipeline.add(filter)

    let rebuildCount = 0
    pipeline.subscribe(() => {
      rebuildCount += 1
      if (rebuildCount > 50) throw new Error('pipeline.rebuild 死循环')
    })

    ds.removeField!('t')

    expect(rebuildCount).toBe(0)
  })
})
