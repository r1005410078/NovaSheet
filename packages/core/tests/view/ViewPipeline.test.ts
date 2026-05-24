import { describe, expect, it } from 'bun:test'
import type { DataSource, DataSourceListener } from '../../src/data/DataSource'
import type {
  ColumnHeaderMenuContext,
  HeaderDecoration,
  ViewLayer,
  ViewLayerChange,
} from '../../src/view/ViewLayer'
import { ViewPipeline } from '../../src/view/ViewPipeline'
import { SortLayer } from '../../src/view/SortLayer'
import { FilterLayer } from '../../src/view/FilterLayer'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'

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

  constructor(
    id: string,
    private decoration: HeaderDecoration,
  ) {
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

class SpecOffsetLayer implements ViewLayer<number> {
  readonly id = 'offset'
  private spec = 10
  private notify: ((change: ViewLayerChange) => void) | null = null

  bindPipeline(notify: (change: ViewLayerChange) => void): void {
    this.notify = notify
  }

  getSpec(): number {
    return this.spec
  }

  setSpec(spec: number): boolean {
    if (this.spec === spec) return false
    this.spec = spec
    this.notify?.({ layerId: this.id, reason: 'spec-changed' })
    return true
  }

  wrap(upstream: DataSource): DataSource {
    const offset = this.spec
    return {
      ...upstream,
      resolveUnderlyingRow: (row) => upstream.resolveUnderlyingRow?.(row + offset) ?? row + offset,
    }
  }
}

class DisposableLayer implements ViewLayer<number> {
  readonly id = 'disposable'
  disposed = 0
  private spec = 1
  private notify: ((change: ViewLayerChange) => void) | null = null

  bindPipeline(notify: (change: ViewLayerChange) => void): void {
    this.notify = notify
  }

  getSpec(): number {
    return this.spec
  }

  setSpec(spec: number): boolean {
    this.spec = spec
    this.notify?.({ layerId: this.id, reason: 'spec-changed' })
    return true
  }

  wrap(upstream: DataSource): DataSource {
    const offset = this.spec
    const wrapped: DataSource & { dispose(): void } = {
      ...upstream,
      resolveUnderlyingRow: (row) => upstream.resolveUnderlyingRow?.(row + offset) ?? row + offset,
      dispose: () => {
        this.disposed += 1
      },
    }
    return wrapped
  }
}

class LowerDisposableLayer implements ViewLayer<null> {
  readonly id = 'lower'
  disposed = 0

  bindPipeline(): void {}

  getSpec(): null {
    return null
  }

  setSpec(): boolean {
    return false
  }

  wrap(upstream: DataSource): DataSource {
    const wrapped: DataSource & { dispose(): void } = {
      ...upstream,
      resolveUnderlyingRow: (row) => upstream.resolveUnderlyingRow?.(row + 10) ?? row + 10,
      dispose: () => {
        this.disposed += 1
      },
    }
    return wrapped
  }
}

class TopPassthroughLayer implements ViewLayer<number> {
  readonly id = 'top'
  private spec = 0
  private notify: ((change: ViewLayerChange) => void) | null = null

  bindPipeline(notify: (change: ViewLayerChange) => void): void {
    this.notify = notify
  }

  getSpec(): number {
    return this.spec
  }

  setSpec(spec: number): boolean {
    this.spec = spec
    this.notify?.({ layerId: this.id, reason: 'spec-changed' })
    return true
  }

  wrap(upstream: DataSource): DataSource {
    const wrapped: DataSource & { dispose(): void } = {
      ...upstream,
      dispose: () => {},
    }
    return wrapped
  }
}

class IdentityLayer implements ViewLayer<number> {
  readonly id = 'identity'
  private spec = 0
  private notify: ((change: ViewLayerChange) => void) | null = null

  bindPipeline(notify: (change: ViewLayerChange) => void): void {
    this.notify = notify
  }

  getSpec(): number {
    return this.spec
  }

  setSpec(spec: number): boolean {
    this.spec = spec
    this.notify?.({ layerId: this.id, reason: 'spec-changed' })
    return true
  }

  wrap(upstream: DataSource): DataSource {
    return upstream
  }
}

class SourceEventLayer implements ViewLayer<number> {
  readonly id = 'source-event'
  disposed = 0
  private spec = 0
  private notify: ((change: ViewLayerChange) => void) | null = null

  bindPipeline(notify: (change: ViewLayerChange) => void): void {
    this.notify = notify
  }

  getSpec(): number {
    return this.spec
  }

  setSpec(spec: number): boolean {
    this.spec = spec
    this.notify?.({ layerId: this.id, reason: 'spec-changed' })
    return true
  }

  wrap(upstream: DataSource): DataSource {
    const unsubscribe = upstream.subscribe(() => {
      this.notify?.({ layerId: this.id, reason: 'upstream-reset' })
    })
    const wrapped: DataSource & { dispose(): void } = {
      ...upstream,
      dispose: () => {
        this.disposed += 1
        unsubscribe()
      },
    }
    return wrapped
  }
}

class MutableTestSource implements DataSource {
  private listeners = new Set<DataSourceListener>()

  getRowCount(): number {
    return 1
  }

  getSchema() {
    return { fields: [{ id: 'name', name: 'Name', type: 'text' as const, width: 120 }] }
  }

  getRows() {
    return [{ name: 'A' }]
  }

  getCell() {
    return 'A'
  }

  subscribe(listener: DataSourceListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  emitReset(): void {
    for (const listener of this.listeners) listener({ type: 'reset' })
  }
}

describe('ViewPipeline', () => {
  it('wraps layers in add order and returns composed source', () => {
    const pipeline = new ViewPipeline(source)
    pipeline.add(new FakeLayer('a', { filterActive: true }))
    pipeline.add(new FakeLayer('b', { sortIndicator: 'asc' }))
    expect(pipeline.getComposed().resolveUnderlyingRow?.(0)).toBe(110)
  })

  it('throws when adding duplicate layer ids', () => {
    const pipeline = new ViewPipeline(source)
    pipeline.add(new FakeLayer('sort', { sortIndicator: 'asc' }))
    expect(() => pipeline.add(new FakeLayer('sort', { sortIndicator: 'desc' }))).toThrow(
      'ViewPipeline: duplicate layer id "sort"',
    )
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

  it('reports old resolver snapshot from before rebuilding after a spec change', () => {
    const pipeline = new ViewPipeline(source)
    const layer = new SpecOffsetLayer()
    pipeline.add(layer)
    const events: Array<{ oldRow: number; newRow: number | undefined }> = []
    pipeline.subscribe((_change, oldResolveUnderlyingRow) => {
      events.push({
        oldRow: oldResolveUnderlyingRow(0),
        newRow: pipeline.getComposed().resolveUnderlyingRow?.(0),
      })
    })
    layer.setSpec(20)
    expect(events).toEqual([{ oldRow: 10, newRow: 20 }])
  })

  it('disposes the old composed source after rebuild notifications', () => {
    const pipeline = new ViewPipeline(source)
    const layer = new DisposableLayer()
    pipeline.add(layer)
    const events: Array<{ oldRow: number; disposedDuringCallback: number }> = []
    pipeline.subscribe((_change, oldResolveUnderlyingRow) => {
      events.push({
        oldRow: oldResolveUnderlyingRow(0),
        disposedDuringCallback: layer.disposed,
      })
    })

    layer.setSpec(2)

    expect(events).toEqual([{ oldRow: 1, disposedDuringCallback: 0 }])
    expect(layer.disposed).toBe(1)
    expect(pipeline.getComposed().resolveUnderlyingRow?.(0)).toBe(2)
  })

  it('disposes old nested wrapper sources after rebuild notifications', () => {
    const pipeline = new ViewPipeline(source)
    const lower = new LowerDisposableLayer()
    const top = new TopPassthroughLayer()
    pipeline.add(lower)
    pipeline.add(top)
    lower.disposed = 0
    const events: Array<{ oldRow: number; disposedDuringCallback: number }> = []
    pipeline.subscribe((_change, oldResolveUnderlyingRow) => {
      events.push({
        oldRow: oldResolveUnderlyingRow(0),
        disposedDuringCallback: lower.disposed,
      })
    })

    top.setSpec(1)

    expect(events).toEqual([{ oldRow: 10, disposedDuringCallback: 0 }])
    expect(lower.disposed).toBe(1)
    expect(pipeline.getComposed().resolveUnderlyingRow?.(0)).toBe(10)
  })

  it('does not dispose the raw source when a layer returns it unchanged', () => {
    let rawDisposeCount = 0
    const rawSource: DataSource & { dispose(): void } = {
      ...source,
      dispose: () => {
        rawDisposeCount += 1
      },
    }
    const pipeline = new ViewPipeline(rawSource)
    const layer = new IdentityLayer()
    pipeline.add(layer)

    layer.setSpec(1)

    expect(rawDisposeCount).toBe(0)
    expect(pipeline.getComposed()).toBe(rawSource)
  })

  it('does not notify unsubscribed listeners', () => {
    const pipeline = new ViewPipeline(source)
    const layer = new FakeLayer('a', { filterActive: true })
    pipeline.add(layer)
    const events: string[] = []
    const unsubscribe = pipeline.subscribe((change) => {
      events.push(change.layerId)
    })
    unsubscribe()
    layer.setSpec('x')
    expect(events).toEqual([])
  })

  it('dispose clears listeners and disposes current wrappers', () => {
    const rawSource = new MutableTestSource()
    const pipeline = new ViewPipeline(rawSource)
    const layer = new SourceEventLayer()
    const events: string[] = []
    pipeline.add(layer)
    pipeline.subscribe((change) => {
      events.push(change.layerId)
    })

    pipeline.dispose()
    rawSource.emitReset()
    layer.setSpec(1)

    expect(layer.disposed).toBe(1)
    expect(events).toEqual([])
  })

  it('ignores stale callbacks from removed layers', () => {
    const pipeline = new ViewPipeline(source)
    const layer = new FakeLayer('a', { filterActive: true })
    pipeline.add(layer)
    pipeline.remove('a')
    const composedAfterRemove = pipeline.getComposed()
    const events: string[] = []
    pipeline.subscribe((change) => {
      events.push(change.layerId)
    })
    layer.setSpec('x')
    expect(events).toEqual([])
    expect(pipeline.getComposed()).toBe(composedAfterRemove)
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

  // Phase 4.5 回归：rawData.insertRows 触发 rowsInserted 事件时，SortLayer/FilterLayer
  // 不能再走 onUpstreamReset → pipeline.rebuild 路径，否则 emit 的 for-of 会持续访问
  // 新加入的 wrapper listener，造成死循环。改回归测试用 rebuild 计数器 + 行为断言两条线。
  it('rawData.insertRows 在 Sort+Filter 激活下不会无限触发 pipeline rebuild', () => {
    const ds = new InMemoryDataSource({
      schema: {
        fields: [{ id: 'n', name: 'N', type: 'number' as const, width: 100 }],
      },
      rows: [{ n: 3 }, { n: 1 }, { n: 2 }],
    })
    const pipeline = new ViewPipeline(ds)
    const filter = new FilterLayer()
    const sort = new SortLayer()
    pipeline.add(filter)
    pipeline.add(sort)
    sort.setSpec({ fieldId: 'n', direction: 'asc' })

    let rebuildCount = 0
    pipeline.subscribe(() => {
      rebuildCount += 1
      if (rebuildCount > 50) throw new Error('pipeline.rebuild 进入死循环（回归保护触发）')
    })

    ds.insertRows!(0, 1)

    expect(ds.getRowCount()).toBe(4)
    expect(rebuildCount).toBeLessThanOrEqual(2)
    expect(pipeline.getComposed().getRowCount()).toBe(4)
  })
})
