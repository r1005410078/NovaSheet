import type { AutofitRowsResult, CellAddress, GridEngine, SheetContext } from '@novasheet/core'
import type { WebHost } from '../../host/WebHost'
import type { WebFrameSync } from '../drag/WebDragContribution'

/** 编辑器命令接口：runtime 的键盘/双击入口与 commitActiveEdit 服务委托给它。 */
export interface WebCellEditor {
  /** 打开编辑器（双击 / F2）；返回是否成功进入编辑。 */
  open(cell: CellAddress, options: { selectAll?: boolean }): boolean
  /** 以首个键入字符为 draft 打开（键入即编辑）。 */
  beginWithDraft(cell: CellAddress, draft: string): boolean
  /** 提交当前编辑；moveAfter 提交后下移选区。 */
  commitActive(moveAfter: boolean): void
  /** 取消当前编辑（含 multiline 行高恢复）。 */
  cancelActive(): void
}

/** 提供给 cell-editor feature 的 runtime 服务（feature 自定义 deps）。 */
export interface WebCellEditorRuntimeDeps {
  readonly engine: GridEngine
  readonly host: WebHost
  autofitRows(options: { rows?: readonly number[] }): AutofitRowsResult
  afterEngineMutation(): void
  refresh(): void
  /** 把当前选区目标滚动到可见（提交下移后用）。 */
  revealActiveCell(): void
  /** 打开编辑器前同步绘制一帧。 */
  requestSyncPaint(): void
  isBlocked(): boolean
  /** 自定义 editor 逃生口（决策债务）：返回 true 表示已被自定义 editor 接管。 */
  tryCustomEditor(cell: CellAddress): boolean
}

/** Contribution point id used by the web runtime cell-editor feature. */
export const WEB_CELL_EDITOR_CONTRIBUTION = 'web.cell-editor'

/** 贡献一个 cell-editor controller（同时实现 WebCellEditor + WebFrameSync）。 */
export interface WebCellEditorContribution {
  readonly id: string
  readonly order: number
  create(deps: WebCellEditorRuntimeDeps): (WebCellEditor & WebFrameSync) | null
}

/** 在 SheetContext 上注册 cell-editor 贡献。 */
export function registerWebCellEditor(
  ctx: SheetContext,
  contribution: WebCellEditorContribution,
): void {
  ctx.extensions.contribute(WEB_CELL_EDITOR_CONTRIBUTION, contribution)
}

/** 按 order 读取 cell-editor 贡献。 */
export function getWebCellEditorContributions(
  ctx: SheetContext,
): readonly WebCellEditorContribution[] {
  return (ctx.registry.contributions.get(WEB_CELL_EDITOR_CONTRIBUTION) ?? [])
    .filter(isWebCellEditorContribution)
    .sort((a, b) => a.order - b.order)
}

function isWebCellEditorContribution(value: unknown): value is WebCellEditorContribution {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Partial<WebCellEditorContribution>
  return typeof c.id === 'string' && typeof c.order === 'number' && typeof c.create === 'function'
}
