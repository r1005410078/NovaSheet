import type { DataSource } from '../data/DataSource'
import type { Field } from '../data/Schema'
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

  constructor(private readonly source: DataSource) {
    this.composed = source
  }

  add(layer: ViewLayer): void {
    if (this.layers.some((existingLayer) => existingLayer.id === layer.id)) {
      throw new Error(`ViewPipeline: duplicate layer id "${layer.id}"`)
    }
    const oldComposed = this.composed
    layer.bindPipeline((change) => {
      if (this.layers.includes(layer)) this.rebuild(change)
    })
    this.layers.push(layer)
    this.composed = this.compose()
    if (oldComposed !== this.source) disposeViewSource(oldComposed)
  }

  remove(layerId: string): void {
    const layerIndex = this.layers.findIndex((layer) => layer.id === layerId)
    if (layerIndex === -1) return
    this.layers.splice(layerIndex, 1)
    this.rebuild({ layerId, reason: 'spec-changed' })
  }

  get(layerId: string): ViewLayer | undefined {
    return this.layers.find((layer) => layer.id === layerId)
  }

  rebuild(change: ViewLayerChange): void {
    const oldComposed = this.composed
    const oldResolveUnderlyingRow = (viewRow: number) =>
      oldComposed.resolveUnderlyingRow?.(viewRow) ?? viewRow
    this.composed = this.compose()
    for (const listener of this.listeners) {
      listener(change, oldResolveUnderlyingRow)
    }
    disposeViewSource(oldComposed)
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
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private compose(): DataSource {
    return this.layers.reduce<DataSource>((upstream, layer) => layer.wrap(upstream), this.source)
  }
}

function disposeViewSource(source: DataSource): void {
  const disposable = source as { dispose?: () => void }
  disposable.dispose?.()
}
