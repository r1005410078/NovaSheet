import type { SheetContext } from '@novasheet/core'
import {
  getCellContextMenuItems,
  getColumnHeaderStructuralMenuItems,
  getRowHeaderContextMenuItems,
  type CellMenuContext,
  type ColumnHeaderMenuContext,
  type RowHeaderMenuContext,
} from '@novasheet/core'
import {
  registerWebMenuItem,
  type WebMenuItemProvider,
  type WebMenuItemRuntimeDeps,
} from '@novasheet/web'

export interface ClipboardMenuDeps {
  hasContextMenuConsumer(): boolean
  clipboardCopy(): Promise<boolean>
  clipboardCut(): Promise<boolean>
  clipboardPaste(): Promise<boolean>
}

export type ContextMenuMenuItemDeps = WebMenuItemRuntimeDeps &
  ClipboardMenuDeps & {
    getRowMenuArgs?(ctx: RowHeaderMenuContext): { n: number; hasHidden: boolean }
  }

/** 安装单元格 / 列头 / 行头默认菜单项 provider。 */
export function registerDefaultMenuProviders(ctx: SheetContext): void {
  const cellProvider: WebMenuItemProvider = {
    id: 'cell-default',
    order: 10,
    getItems(menuCtx, _deps) {
      if (menuCtx.targetKind !== 'cell') return []
      return getCellContextMenuItems(menuCtx as CellMenuContext)
    },
    handleAction(id, menuCtx, deps) {
      if (menuCtx.targetKind !== 'cell') return false
      const d = deps as ContextMenuMenuItemDeps & ClipboardMenuDeps
      if (d.hasContextMenuConsumer()) return false
      if (id === 'copy') {
        void d.clipboardCopy()
        return true
      }
      if (id === 'cut') {
        void d.clipboardCut()
        return true
      }
      if (id === 'paste') {
        void d.clipboardPaste()
        return true
      }
      return false
    },
  }

  const columnProvider: WebMenuItemProvider = {
    id: 'column-default',
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
    id: 'row-default',
    order: 30,
    getItems(menuCtx, deps) {
      if (menuCtx.targetKind !== 'rowHeader') return []
      const d = deps as ContextMenuMenuItemDeps
      const args = d.getRowMenuArgs?.(menuCtx as RowHeaderMenuContext)
      if (!args) return []
      return getRowHeaderContextMenuItems(args.n, args.hasHidden)
    },
  }

  registerWebMenuItem(ctx, cellProvider)
  registerWebMenuItem(ctx, columnProvider)
  registerWebMenuItem(ctx, rowProvider)
}
