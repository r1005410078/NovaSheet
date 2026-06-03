import type {
  ColumnHeaderMenuContext,
  ContextMenuAction,
  ContextMenuContext,
  GridEngine,
  SheetContext,
  Theme,
  ViewPipeline,
} from '@novasheet/core'
import type { WebHost, WebPointerEvent } from '../host/WebHost'

/** Context menu controller installed via web.context-menu. */
export interface WebContextMenu {
  attach(container: HTMLElement): void
  destroy(): void
  applyTheme(theme: Theme): void
  close(): void
  isOpen(): boolean
  handleHostContextMenu(event: WebPointerEvent): void
  handleAction(id: ContextMenuAction): void
}

/** Runtime services for the context menu feature controller. */
export interface WebContextMenuRuntimeDeps {
  readonly context: SheetContext
  readonly engine: GridEngine
  readonly host: WebHost
  readonly viewPipeline?: ViewPipeline
  refresh(): void
  afterEngineMutation(): void
  commitActiveEdit(moveSelection: boolean): void
  /** 与现 runtime 一致：resize 或 activeDrag 进行中时不打开菜单。 */
  isContextMenuBlocked(): boolean
  collectHiddenInViewColRange(startCol: number, endCol: number): readonly string[]
  recordMenuOpen(ctx: ContextMenuContext, point: { clientX: number; clientY: number }): void
  getLastMenuContext(): ContextMenuContext | null
  clearMenuContext(): void
  hasContextMenuConsumer(): boolean
  /** 若 consumer 注册了 onContextMenuAction 则派发并返回 true。 */
  notifyContextMenuAction(action: ContextMenuAction, ctx: ContextMenuContext): boolean
  clipboardCopy(): Promise<boolean>
  clipboardCut(): Promise<boolean>
  clipboardPaste(): Promise<boolean>
  invokeRowHeaderContextMenuAction(id: string, ctx: { targetRowIndex: number }): void
  invokeColumnHeaderContextMenuAction(id: string, ctx: { targetColIndex: number }): void
  /** sort/filter 列头动作；返回 true 表示已消费。 */
  handleColumnMenuAction(id: ContextMenuAction, ctx: ColumnHeaderMenuContext): boolean
  focusScrollHost(): void
}

/** Contribution point id for the context menu controller. */
export const WEB_CONTEXT_MENU_CONTRIBUTION = 'web.context-menu'

export interface WebContextMenuContribution {
  readonly id: string
  readonly order: number
  create(deps: WebContextMenuRuntimeDeps): WebContextMenu | null
}

export function registerWebContextMenu(ctx: SheetContext, contribution: WebContextMenuContribution): void {
  ctx.extensions.contribute(WEB_CONTEXT_MENU_CONTRIBUTION, contribution)
}

export function getWebContextMenuContributions(ctx: SheetContext): readonly WebContextMenuContribution[] {
  return (ctx.registry.contributions.get(WEB_CONTEXT_MENU_CONTRIBUTION) ?? [])
    .filter(isWebContextMenuContribution)
    .sort((a, b) => a.order - b.order)
}

function isWebContextMenuContribution(value: unknown): value is WebContextMenuContribution {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Partial<WebContextMenuContribution>
  return typeof c.id === 'string' && typeof c.order === 'number' && typeof c.create === 'function'
}
