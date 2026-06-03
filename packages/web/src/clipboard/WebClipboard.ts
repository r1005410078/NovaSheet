import type { CellRange, GridEngine, PasteSkippedCell, SheetContext } from '@novasheet/core'

/** 剪贴板命令接口：runtime 的键盘/菜单/Grid 入口委托给它。 */
export interface WebClipboard {
  copy(): Promise<boolean>
  cut(): Promise<boolean>
  paste(): Promise<boolean>
  /** 数据源被替换（setData/updateViewData）后调用：使 typed-paste 缓存失效。 */
  onDataReplaced(): void
}

/** 提供给 clipboard feature 的 runtime 服务（feature 自定义 deps）。 */
export interface WebClipboardRuntimeDeps {
  readonly engine: GridEngine
  afterEngineMutation(): void
  /** per-Grid 事件回调（决策债务）。 */
  onCopy(range: CellRange): void
  onCut(range: CellRange): void
  onPaste(target: CellRange): void
  onPasteSkipped(cells: readonly PasteSkippedCell[]): void
}

/** Contribution point id used by the web runtime clipboard feature. */
export const WEB_CLIPBOARD_CONTRIBUTION = 'web.clipboard'

/** 贡献一个剪贴板命令 controller。 */
export interface WebClipboardContribution {
  readonly id: string
  readonly order: number
  create(deps: WebClipboardRuntimeDeps): WebClipboard | null
}

/** 在 SheetContext 上注册剪贴板贡献。 */
export function registerWebClipboard(ctx: SheetContext, contribution: WebClipboardContribution): void {
  ctx.extensions.contribute(WEB_CLIPBOARD_CONTRIBUTION, contribution)
}

/** 按 order 读取剪贴板贡献。 */
export function getWebClipboardContributions(ctx: SheetContext): readonly WebClipboardContribution[] {
  return (ctx.registry.contributions.get(WEB_CLIPBOARD_CONTRIBUTION) ?? [])
    .filter(isWebClipboardContribution)
    .sort((a, b) => a.order - b.order)
}

function isWebClipboardContribution(value: unknown): value is WebClipboardContribution {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Partial<WebClipboardContribution>
  return typeof c.id === 'string' && typeof c.order === 'number' && typeof c.create === 'function'
}
