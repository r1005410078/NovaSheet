import type {
  ContextMenuAction,
  ContextMenuContext,
  ContextMenuItem,
  GridEngine,
  SheetContext,
  ViewPipeline,
} from '@novasheet/core'

/** Contribution point id for context menu item providers. */
export const WEB_MENU_ITEM_CONTRIBUTION = 'web.menu-item'

/** Runtime services passed to menu item providers when building items. */
export interface WebMenuItemRuntimeDeps {
  readonly viewPipeline?: ViewPipeline
  readonly engine?: GridEngine
  collectHiddenInViewColRange?(startCol: number, endCol: number): readonly string[]
}

/** @deprecated Use WebMenuItemRuntimeDeps — alias for feature packages. */
export type WebMenuItemDeps = WebMenuItemRuntimeDeps

/** Supplies menu items for a given open-menu context. */
export interface WebMenuItemProvider {
  readonly id: string
  readonly order: number
  getItems(ctx: ContextMenuContext, deps: WebMenuItemRuntimeDeps): readonly ContextMenuItem[]
  /** Return true if the action was handled. */
  handleAction?(
    id: ContextMenuAction,
    ctx: ContextMenuContext,
    deps: WebMenuItemRuntimeDeps,
  ): boolean
}

/** Register a menu item provider on a SheetContext. */
export function registerWebMenuItem(ctx: SheetContext, provider: WebMenuItemProvider): void {
  ctx.extensions.contribute(WEB_MENU_ITEM_CONTRIBUTION, provider)
}

/** Read menu item providers in deterministic dispatch order. */
export function getWebMenuItemContributions(ctx: SheetContext): readonly WebMenuItemProvider[] {
  return (ctx.registry.contributions.get(WEB_MENU_ITEM_CONTRIBUTION) ?? [])
    .filter(isWebMenuItemProvider)
    .sort((a, b) => a.order - b.order)
}

/**
 * Flatten provider item lists: later providers override earlier items with the same `id`.
 */
export function mergeMenuItems(chunks: readonly (readonly ContextMenuItem[])[]): readonly ContextMenuItem[] {
  const byId = new Map<string, ContextMenuItem>()
  for (const chunk of chunks) {
    for (const item of chunk) {
      byId.set(item.id, item)
    }
  }
  const seen = new Set<string>()
  const merged: ContextMenuItem[] = []
  for (const chunk of chunks) {
    for (const item of chunk) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      const resolved = byId.get(item.id)
      if (resolved) merged.push(resolved)
    }
  }
  return merged
}

function isWebMenuItemProvider(value: unknown): value is WebMenuItemProvider {
  if (typeof value !== 'object' || value === null) return false
  const p = value as Partial<WebMenuItemProvider>
  return typeof p.id === 'string' && typeof p.order === 'number' && typeof p.getItems === 'function'
}
