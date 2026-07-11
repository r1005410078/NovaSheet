/**
 * PopoverController——filter/rowHeight/columnWidth 三个 DOM popover 的注入、打开与状态
 * 暂存（GridRuntime 拆分 Task 5，见
 * `docs/superpowers/specs/2026-07-11-grid-runtime-decomposition-design.md` §3.2）。
 *
 * `openRowHeightPopover`/`openColumnWidthPopover` 目前也是
 * `invokeRowHeaderContextMenuAction`/`invokeColumnHeaderContextMenuAction` 里
 * `resize-row-height`/`resize-column-width` 分支的落脚点；这两个菜单动作方法的其余分支
 * 仍留在 GridRuntime，等 Task 6 ContextMenuController 整体迁移。
 */

import type { GridEngine } from '../../../engine/GridEngine'
import type { FilterLayer, FilterOp } from '../../../features/view/FilterLayer'
import type {
  ContextMenuAction,
  ContextMenuContext,
} from '../../../features/context-menu/ContextMenuModel'
import type { Theme } from '../../../kernel/theme/Theme'
import type { FilterPopover } from '../../overlay/FilterPopover'
import type { RowHeightPopover } from '../../overlay/RowHeightPopover'
import type { ColumnWidthPopover } from '../../overlay/ColumnWidthPopover'

/** PopoverController 的窄依赖接口——只列它真正需要的 GridRuntime 能力。 */
export interface PopoverControllerDeps {
  readonly engine: GridEngine
  getFilterLayer(): FilterLayer | undefined
  /** filter-open 回退：未注入 filterPopover 时，转交外部 context menu action 回调处理。 */
  onContextMenuAction(action: ContextMenuAction | string, ctx: ContextMenuContext): void
  closeContextMenu(): void
  hideFillPreview(): void
  hideColumnReorderOverlay(): void
}

/** 触发菜单时的 client 坐标；无坐标（如程序化调用）时为 null。 */
export type PopoverAnchorPoint = { readonly clientX: number; readonly clientY: number } | null

export class PopoverController {
  private readonly deps: PopoverControllerDeps
  /** DOM filter popover。 */
  private filterPopover?: FilterPopover
  /** Phase 4.5 行高调整弹层。 */
  private rowHeightPopover?: RowHeightPopover
  /** Phase 4.6 列宽调整弹层。 */
  private columnWidthPopover?: ColumnWidthPopover
  /** resize-row-height 操作暂存的行 id 列表，供 onSubmit 回调读取。 */
  private pendingRowHeightIds: number[] = []
  /** resize-column-width 操作暂存的 fieldId 列表，供 onSubmit 回调读取。 */
  private pendingColumnWidthFieldIds: string[] = []
  /** 当前打开 filter popover 绑定的 field id。 */
  private filterPopoverFieldId: string | null = null

  constructor(deps: PopoverControllerDeps) {
    this.deps = deps
  }

  /** 注入 filter popover。 */
  setFilterPopover(popover: FilterPopover): void {
    this.filterPopover = popover
  }

  /** 注入 row-height popover（Phase 4.5）。 */
  setRowHeightPopover(popover: RowHeightPopover): void {
    this.rowHeightPopover = popover
  }

  /** 注入 column-width popover（Phase 4.6）。 */
  setColumnWidthPopover(popover: ColumnWidthPopover): void {
    this.columnWidthPopover = popover
  }

  /** filter popover 当前是否处于打开状态。 */
  isFilterPopoverOpen(): boolean {
    return this.filterPopover?.isOpen() ?? false
  }

  /** 打开列头 filter popover；未注入 popover 时回退到外部 action 回调。 */
  openFilterPopover(
    ctx: Extract<ContextMenuContext, { targetKind: 'columnHeader' }>,
    anchor: PopoverAnchorPoint,
  ): void {
    if (!this.filterPopover) {
      this.deps.onContextMenuAction('filter-open', ctx)
      return
    }
    const point = anchor ?? { clientX: 0, clientY: 0 }
    const currentSpec = this.deps.getFilterLayer()?.getSpec()
    this.filterPopoverFieldId = ctx.field.id
    this.deps.closeContextMenu()
    this.deps.hideFillPreview()
    this.deps.hideColumnReorderOverlay()
    this.filterPopover.open(point, {
      field: ctx.field,
      op: currentSpec?.fieldId === ctx.field.id ? currentSpec.op : null,
    })
  }

  /** 应用 filter popover 返回的条件；null 表示清除当前列筛选。 */
  handleFilterPopoverApply(op: FilterOp | null): void {
    const fieldId = this.filterPopoverFieldId
    if (!fieldId) return
    if (op) this.deps.getFilterLayer()?.setSpec({ fieldId, op })
    else this.deps.getFilterLayer()?.clear(fieldId)
    this.filterPopoverFieldId = null
  }

  /**
   * 打开行高调整弹层（原 `invokeRowHeaderContextMenuAction` 的 `resize-row-height` 分支）。
   * rowIds 已 sorted-unique；anchor 为触发菜单的 client 坐标。
   */
  openRowHeightPopover(rowIds: readonly number[], anchor: PopoverAnchorPoint): void {
    if (!this.rowHeightPopover || rowIds.length === 0) return
    this.pendingRowHeightIds = [...rowIds]
    const currentHeight = this.deps.engine.getRowHeight(rowIds[0]!)
    const triggerRect = anchor
      ? { x: anchor.clientX, y: anchor.clientY, width: 0, height: 0 }
      : { x: 100, y: 100, width: 0, height: 0 }
    this.rowHeightPopover.open(triggerRect, currentHeight)
  }

  /**
   * 打开列宽调整弹层（原 `invokeColumnHeaderContextMenuAction` 的 `resize-column-width` 分支）。
   */
  openColumnWidthPopover(fieldIds: readonly string[], anchor: PopoverAnchorPoint): void {
    if (!this.columnWidthPopover || fieldIds.length === 0) return
    this.pendingColumnWidthFieldIds = [...fieldIds]
    const fields = this.deps.engine.getData().getSchema().fields
    const currentWidth = fields.find((field) => field.id === fieldIds[0])?.width ?? 100
    const triggerRect = anchor
      ? { x: anchor.clientX, y: anchor.clientY, width: 0, height: 0 }
      : { x: 100, y: 100, width: 0, height: 0 }
    this.columnWidthPopover.open(triggerRect, currentWidth)
  }

  /** 返回当前 resize-row-height 操作暂存的行 id 列表，供 onSubmit 回调读取。 */
  getPendingRowHeightIds(): number[] {
    return this.pendingRowHeightIds
  }

  /** 返回当前 resize-column-width 操作暂存的 fieldId 列表，供 onSubmit 回调读取。 */
  getPendingColumnWidthFieldIds(): readonly string[] {
    return this.pendingColumnWidthFieldIds
  }

  /** 同步 filter popover 主题。 */
  applyTheme(theme: Theme): void {
    this.filterPopover?.applyTheme(theme)
  }
}
