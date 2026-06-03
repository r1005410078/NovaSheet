import type {
  ColumnHeaderMenuContext,
  ContextMenuAction,
  FilterOp,
  Theme,
} from '@novasheet/core'
import type { WebSortFilter, WebSortFilterRuntimeDeps } from '@novasheet/web'
import { FilterPopover } from './FilterPopover'

const SORT_FILTER_ACTIONS = new Set<ContextMenuAction>([
  'sort-asc',
  'sort-desc',
  'sort-none',
  'filter-open',
  'filter-clear',
])

export class SortFilterController implements WebSortFilter {
  private popover: FilterPopover | null = null
  private filterPopoverFieldId: string | null = null

  constructor(private readonly deps: WebSortFilterRuntimeDeps) {}

  attach(container: HTMLElement): void {
    this.popover = new FilterPopover(container, {
      onApply: (op) => this.handleFilterPopoverApply(op),
      onCancel: () => this.deps.focusScrollHost(),
    })
    this.popover.attach()
  }

  destroy(): void {
    this.popover?.destroy()
    this.popover = null
    this.filterPopoverFieldId = null
  }

  applyTheme(theme: Theme): void {
    this.popover?.applyTheme(theme)
  }

  isPopoverOpen(): boolean {
    return this.popover?.isOpen() ?? false
  }

  handleFilterPopoverApply(op: FilterOp | null): void {
    const fieldId = this.filterPopoverFieldId
    if (!fieldId) return
    if (op) this.deps.filterLayer?.setSpec({ fieldId, op })
    else this.deps.filterLayer?.clear(fieldId)
    this.filterPopoverFieldId = null
  }

  handleColumnMenuAction(id: ContextMenuAction, ctx: ColumnHeaderMenuContext): boolean {
    if (!SORT_FILTER_ACTIONS.has(id)) return false

    if (id === 'sort-asc') {
      this.deps.sortLayer?.setSpec({ fieldId: ctx.field.id, direction: 'asc' })
      return true
    }
    if (id === 'sort-desc') {
      this.deps.sortLayer?.setSpec({ fieldId: ctx.field.id, direction: 'desc' })
      return true
    }
    if (id === 'sort-none') {
      if (this.deps.sortLayer?.getSpec()?.fieldId === ctx.field.id) this.deps.sortLayer.setSpec(null)
      return true
    }
    if (id === 'filter-clear') {
      this.deps.filterLayer?.clear(ctx.field.id)
      return true
    }
    if (id === 'filter-open') {
      this.openFilterPopover(ctx)
      return true
    }
    return false
  }

  private openFilterPopover(ctx: ColumnHeaderMenuContext): void {
    if (!this.popover) {
      this.deps.onFilterPopoverFallback?.('filter-open', ctx)
      return
    }
    const point = this.deps.getLastMenuPoint() ?? { clientX: 0, clientY: 0 }
    const currentSpec = this.deps.filterLayer?.getSpec()
    this.filterPopoverFieldId = ctx.field.id
    this.deps.closeContextMenu()
    this.deps.hideColumnReorderOverlay()
    this.popover.open(point, {
      field: ctx.field,
      op: currentSpec?.fieldId === ctx.field.id ? currentSpec.op : null,
    })
  }
}
