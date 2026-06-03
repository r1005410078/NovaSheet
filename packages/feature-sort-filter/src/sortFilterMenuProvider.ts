import type { SheetContext } from '@novasheet/core'
import type { ColumnHeaderMenuContext, ContextMenuContext } from '@novasheet/core'
import { registerWebMenuItem, type WebMenuItemProvider, type WebMenuItemRuntimeDeps } from '@novasheet/web'

/** 列头 sort/filter 菜单项（来自 ViewPipeline 各 layer 的 contextMenuItems）。 */
export function registerSortFilterMenuProvider(ctx: SheetContext): void {
  const provider: WebMenuItemProvider = {
    id: 'sort-filter-default',
    order: 15,
    getItems(menuCtx: ContextMenuContext, deps: WebMenuItemRuntimeDeps) {
      if (menuCtx.targetKind !== 'columnHeader') return []
      const pipeline = deps.viewPipeline
      if (!pipeline) return []
      return pipeline.collectColumnHeaderMenuItems(menuCtx as ColumnHeaderMenuContext)
    },
  }
  registerWebMenuItem(ctx, provider)
}
