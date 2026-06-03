import type { SheetContext } from '@novasheet/core'
import { registerWebSortFilter } from '@novasheet/web'
import { SortFilterController } from './SortFilterController'
import { registerSortFilterMenuProvider } from './sortFilterMenuProvider'

/** 安装排序/筛选能力（列头 menu 项 + sort/filter 动作 + FilterPopover）。 */
export function installSortFilterFeature(ctx: SheetContext): void {
  registerSortFilterMenuProvider(ctx)
  registerWebSortFilter(ctx, {
    id: 'sort-filter',
    order: 10,
    create: (deps) => new SortFilterController(deps),
  })
}
