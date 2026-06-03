import type { SheetContext } from '@novasheet/core'
import { getCellContextMenuItems, type CellMenuContext } from '@novasheet/core'
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

export type ContextMenuMenuItemDeps = WebMenuItemRuntimeDeps & ClipboardMenuDeps

/** 安装单元格默认菜单项 provider（列/行结构项由 feature-structure 提供）。 */
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

  registerWebMenuItem(ctx, cellProvider)
}
