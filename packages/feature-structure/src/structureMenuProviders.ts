import type { SheetContext } from '@novasheet/core'
import {
  getColumnHeaderStructuralMenuItems,
  getRowHeaderContextMenuItems,
  type ColumnHeaderMenuContext,
  type RowHeaderMenuContext,
} from '@novasheet/core'
import { registerWebMenuItem, type WebMenuItemProvider, type WebMenuItemRuntimeDeps } from '@novasheet/web'

function computeRowMenuArgs(
  engine: NonNullable<WebMenuItemRuntimeDeps['engine']>,
  rowCtx: RowHeaderMenuContext,
): { n: number; hasHidden: boolean } {
  const sel = engine.getSelection().selectedRange
  const startRow = sel?.startRow ?? rowCtx.targetRowIndex
  const endRow = sel?.endRow ?? rowCtx.targetRowIndex
  const hiddenSet = new Set(engine.getHiddenRows())
  let hasHidden = false
  if (sel) {
    for (let r = sel.startRow; r <= sel.endRow && !hasHidden; r++) {
      const underlying = engine.getData().resolveUnderlyingRow?.(r) ?? r
      if (hiddenSet.has(underlying)) hasHidden = true
    }
  }
  return { n: endRow - startRow + 1, hasHidden }
}

/** 列头/行头结构菜单项 provider。 */
export function registerStructureMenuProviders(ctx: SheetContext): void {
  const columnProvider: WebMenuItemProvider = {
    id: 'structure-column-default',
    order: 20,
    getItems(menuCtx) {
      if (menuCtx.targetKind !== 'columnHeader') return []
      const colCtx = menuCtx as ColumnHeaderMenuContext
      const n = colCtx.selectedColCount ?? 1
      const hasHidden = colCtx.hasHiddenInSelection ?? false
      return getColumnHeaderStructuralMenuItems(n, hasHidden)
    },
  }

  const rowProvider: WebMenuItemProvider = {
    id: 'structure-row-default',
    order: 30,
    getItems(menuCtx, deps) {
      if (menuCtx.targetKind !== 'rowHeader') return []
      if (!deps.engine) return []
      const args = computeRowMenuArgs(deps.engine, menuCtx as RowHeaderMenuContext)
      return getRowHeaderContextMenuItems(args.n, args.hasHidden)
    },
  }

  registerWebMenuItem(ctx, columnProvider)
  registerWebMenuItem(ctx, rowProvider)
}
