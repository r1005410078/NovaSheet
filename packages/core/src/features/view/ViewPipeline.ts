import type { DataSource } from '../../kernel/data/DataSource'
import type { Field } from '../../kernel/data/Schema'
import type {
  ColumnHeaderMenuContext,
  ColumnHeaderMenuItem,
  HeaderDecoration,
  ViewLayer,
  ViewLayerChange,
} from './ViewLayer'

type ViewPipelineListener = (
  change: ViewLayerChange,
  oldResolveUnderlyingRow: (viewRow: number) => number,
) => void

export class ViewPipeline {
  private readonly layers: ViewLayer[] = []
  private readonly listeners = new Set<ViewPipelineListener>()
  private composed: DataSource
  private wrappers: DataSource[] = []
  private disposed = false

  constructor(private readonly source: DataSource) {
    this.composed = source
  }

  add(layer: ViewLayer): void {
    if (this.disposed) {
      throw new Error('ViewPipeline: cannot add layer after dispose')
    }
    if (this.layers.some((existingLayer) => existingLayer.id === layer.id)) {
      throw new Error(`ViewPipeline: duplicate layer id "${layer.id}"`)
    }
    layer.bindPipeline((change) => {
      if (!this.disposed && this.layers.includes(layer)) this.rebuild(change)
    })
    this.layers.push(layer)
    const oldWrappers = this.wrappers
    this.setComposedGeneration(this.compose())
    disposeViewSources(oldWrappers)
  }

  remove(layerId: string): void {
    if (this.disposed) return
    const layerIndex = this.layers.findIndex((layer) => layer.id === layerId)
    if (layerIndex === -1) return
    this.layers.splice(layerIndex, 1)
    this.rebuild({ layerId, reason: 'spec-changed' })
  }

  get(layerId: string): ViewLayer | undefined {
    return this.layers.find((layer) => layer.id === layerId)
  }

  rebuild(change: ViewLayerChange): void {
    if (this.disposed) return
    const oldComposed = this.composed
    const oldWrappers = this.wrappers
    const oldResolveUnderlyingRow = (viewRow: number) =>
      oldComposed.resolveUnderlyingRow?.(viewRow) ?? viewRow
    this.setComposedGeneration(this.compose())
    for (const listener of this.listeners) {
      listener(change, oldResolveUnderlyingRow)
    }
    disposeViewSources(oldWrappers)
  }

  getComposed(): DataSource {
    return this.composed
  }

  collectHeaderDecorations(field: Field): HeaderDecoration {
    return this.layers.reduce<HeaderDecoration>((decoration, layer) => {
      const nextDecoration = layer.headerDecoration?.(field)
      return nextDecoration == null ? decoration : { ...decoration, ...nextDecoration }
    }, {})
  }

  collectColumnHeaderMenuItems(ctx: ColumnHeaderMenuContext): readonly ColumnHeaderMenuItem[] {
    return this.layers.flatMap((layer) => layer.contextMenuItems?.(ctx) ?? [])
  }

  subscribe(listener: ViewPipelineListener): () => void {
    if (this.disposed) return () => {}
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.listeners.clear()
    disposeViewSources(this.wrappers)
    this.wrappers = []
    this.composed = this.source
  }

  private compose(): { composed: DataSource; wrappers: DataSource[] } {
    const wrappers: DataSource[] = []
    const seenWrappers = new Set<DataSource>()
    const composed = this.layers.reduce<DataSource>((upstream, layer) => {
      const wrapper = layer.wrap(upstream)
      if (wrapper !== upstream && wrapper !== this.source && !seenWrappers.has(wrapper)) {
        wrappers.push(wrapper)
        seenWrappers.add(wrapper)
      }
      return wrapper
    }, this.source)
    return { composed, wrappers }
  }

  private setComposedGeneration(generation: {
    composed: DataSource
    wrappers: DataSource[]
  }): void {
    this.composed = generation.composed
    this.wrappers = generation.wrappers
  }
}

function disposeViewSources(sources: readonly DataSource[]): void {
  for (let index = sources.length - 1; index >= 0; index -= 1) {
    const source = sources[index]
    const disposable = source as { dispose?: () => void }
    disposable.dispose?.()
  }
}
