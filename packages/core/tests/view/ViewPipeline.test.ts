import { describe, expect, it } from 'bun:test'
import type { DataSource } from '../../src/data/DataSource'
import type {
  ColumnHeaderMenuContext,
  HeaderDecoration,
  ViewLayer,
  ViewLayerChange,
} from '../../src/view/ViewLayer'
import { ViewPipeline } from '../../src/view/ViewPipeline'

const source: DataSource = {
  getRowCount: () => 3,
  getSchema: () => ({ fields: [{ id: 'name', name: 'Name', type: 'text', width: 120 }] }),
  getRows: () => [],
  getCell: (row) => row,
  subscribe: () => () => {},
}

class FakeLayer implements ViewLayer<string | null> {
  readonly id: string
  private spec: string | null = null
  private notify: ((change: ViewLayerChange) => void) | null = null

  constructor(id: string, private decoration: HeaderDecoration) {
    this.id = id
  }

  bindPipeline(notify: (change: ViewLayerChange) => void): void {
    this.notify = notify
  }

  getSpec(): string | null {
    return this.spec
  }

  setSpec(spec: string | null): boolean {
    if (this.spec === spec) return false
    this.spec = spec
    this.notify?.({ layerId: this.id, reason: 'spec-changed' })
    return true
  }

  wrap(upstream: DataSource): DataSource {
    const offset = this.id === 'a' ? 10 : 100
    return {
      ...upstream,
      resolveUnderlyingRow: (row) => upstream.resolveUnderlyingRow?.(row + offset) ?? row + offset,
    }
  }

  headerDecoration(): HeaderDecoration {
    return this.decoration
  }

  contextMenuItems(ctx: ColumnHeaderMenuContext) {
    return [{ id: 'filter-open' as const, label: `${this.id}:${ctx.field.id}`, disabled: false }]
  }
}

describe('ViewPipeline', () => {
  it('wraps layers in add order and returns composed source', () => {
    const pipeline = new ViewPipeline(source)
    pipeline.add(new FakeLayer('a', { filterActive: true }))
    pipeline.add(new FakeLayer('b', { sortIndicator: 'asc' }))
    expect(pipeline.getComposed().resolveUnderlyingRow?.(0)).toBe(110)
  })

  it('notifies subscribers with layer id and old resolver snapshot', () => {
    const pipeline = new ViewPipeline(source)
    const layer = new FakeLayer('a', { filterActive: true })
    pipeline.add(layer)
    const events: Array<{ layerId: string; oldRow: number }> = []
    pipeline.subscribe((change, oldResolveUnderlyingRow) => {
      events.push({ layerId: change.layerId, oldRow: oldResolveUnderlyingRow(0) })
    })
    layer.setSpec('x')
    expect(events).toEqual([{ layerId: 'a', oldRow: 10 }])
  })

  it('collects header decorations and menu items in layer order', () => {
    const pipeline = new ViewPipeline(source)
    pipeline.add(new FakeLayer('a', { filterActive: true }))
    pipeline.add(new FakeLayer('b', { sortIndicator: 'desc' }))
    const field = source.getSchema().fields[0]!
    expect(pipeline.collectHeaderDecorations(field)).toEqual({
      filterActive: true,
      sortIndicator: 'desc',
    })
    expect(
      pipeline
        .collectColumnHeaderMenuItems({ targetKind: 'columnHeader', field, colIndex: 0 })
        .map((i) => i.label),
    ).toEqual(['a:name', 'b:name'])
  })
})
