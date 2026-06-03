import type {
  ColumnHeaderMenuContext,
  ContextMenuAction,
  FilterLayer,
  FilterOp,
  SheetContext,
  SortLayer,
  Theme,
  ViewPipeline,
} from '@novasheet/core'

/** Sort/filter UI controller installed via web.sort-filter. */
export interface WebSortFilter {
  attach(container: HTMLElement): void
  destroy(): void
  applyTheme(theme: Theme): void
  isPopoverOpen(): boolean
  handleFilterPopoverApply(op: FilterOp | null): void
  /** Returns true when the action was consumed (sort/filter ids). */
  handleColumnMenuAction(id: ContextMenuAction, ctx: ColumnHeaderMenuContext): boolean
}

/** Runtime services for the sort-filter feature controller. */
export interface WebSortFilterRuntimeDeps {
  readonly sortLayer?: SortLayer
  readonly filterLayer?: FilterLayer
  readonly viewPipeline?: ViewPipeline
  closeContextMenu(): void
  hideColumnReorderOverlay(): void
  getLastMenuPoint(): { clientX: number; clientY: number } | null
  focusScrollHost(): void
  onFilterPopoverFallback?(action: 'filter-open', ctx: ColumnHeaderMenuContext): void
}

export const WEB_SORT_FILTER_CONTRIBUTION = 'web.sort-filter'

export interface WebSortFilterContribution {
  readonly id: string
  readonly order: number
  create(deps: WebSortFilterRuntimeDeps): WebSortFilter | null
}

export function registerWebSortFilter(ctx: SheetContext, contribution: WebSortFilterContribution): void {
  ctx.extensions.contribute(WEB_SORT_FILTER_CONTRIBUTION, contribution)
}

export function getWebSortFilterContributions(ctx: SheetContext): readonly WebSortFilterContribution[] {
  return (ctx.registry.contributions.get(WEB_SORT_FILTER_CONTRIBUTION) ?? [])
    .filter(isWebSortFilterContribution)
    .sort((a, b) => a.order - b.order)
}

function isWebSortFilterContribution(value: unknown): value is WebSortFilterContribution {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Partial<WebSortFilterContribution>
  return typeof c.id === 'string' && typeof c.order === 'number' && typeof c.create === 'function'
}
