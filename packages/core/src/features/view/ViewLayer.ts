import type { DataSource } from '../../kernel/data/DataSource'
import type { Field } from '../../kernel/data/Schema'
import type { ContextMenuItem } from '../../interaction/ContextMenuModel'

export type ColumnHeaderMenuAction =
  | ContextMenuItem['id']
  | 'sort-asc'
  | 'sort-desc'
  | 'sort-none'
  | 'filter-open'
  | 'filter-clear'

export type ColumnHeaderMenuItem = Omit<ContextMenuItem, 'id'> & {
  readonly id: ColumnHeaderMenuAction
  readonly checked?: boolean
}

export interface ViewLayer<TSpec = unknown> {
  readonly id: string

  bindPipeline(notify: (change: ViewLayerChange) => void): void

  getSpec(): TSpec

  setSpec(spec: TSpec): boolean

  wrap(upstream: DataSource): DataSource

  headerDecoration?(field: Field): HeaderDecoration | null

  contextMenuItems?(ctx: ColumnHeaderMenuContext): readonly ColumnHeaderMenuItem[]
}

export type ViewLayerChangeReason = 'spec-changed' | 'upstream-reset'

export interface ViewLayerChange {
  readonly layerId: string
  readonly reason: ViewLayerChangeReason
}

export interface HeaderDecoration {
  readonly sortIndicator?: 'asc' | 'desc' | null
  readonly filterActive?: boolean
}

export interface ColumnHeaderMenuContext {
  readonly targetKind: 'columnHeader'
  readonly field: Field
  readonly colIndex: number
}
