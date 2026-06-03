import type { SheetContext } from '@novasheet/core'
import {
  cellMergeMenuState,
  getCellMergeMenuItems,
  type CellMenuContext,
} from '@novasheet/core'
import { registerWebMenuItem, type WebMenuItemProvider } from '@novasheet/web'

/** 单元格 merge/unmerge 菜单项 provider。 */
export function registerMergeCellsMenuProvider(ctx: SheetContext): void {
  const provider: WebMenuItemProvider = {
    id: 'merge-cells-default',
    order: 12,
    getItems(menuCtx, deps) {
      if (menuCtx.targetKind !== 'cell') return []
      const cellCtx = menuCtx as CellMenuContext
      const range = cellCtx.selectedRange
      const mergeRegions = deps.engine?.getFrame().mergeRegions
      const { canMerge, canUnmerge } = cellMergeMenuState(range, mergeRegions)
      return getCellMergeMenuItems(canMerge, canUnmerge)
    },
  }
  registerWebMenuItem(ctx, provider)
}
