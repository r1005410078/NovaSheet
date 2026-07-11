/**
 * ContextMenuController——host/行头/列头右键菜单的路由、action 分发与列头 hover 菜单按钮
 * （GridRuntime 拆分 Task 6，见
 * `docs/superpowers/specs/2026-07-11-grid-runtime-decomposition-design.md` §3.2）。
 *
 * `handleContextMenuSelected` 的分支优先级（务必保持原样，勿重排）：
 *   1. `rowHeader` ctx——始终走内置行头 action，无条件 `return`（不咨询 override）。
 *   2. `columnHeader` ctx——仅 sort-asc/desc/none、filter-clear/open、
 *      insert/delete/hide/unhide-col(s)、resize-column-width 这组内置 id 短路 `return`；
 *      其余 id（含自定义 item）落到第 3 步。
 *   3. consumer 的 `onContextMenuAction` override（若已注册）完全接管，`return`。
 *   4. 无 override 时回退内置 copy/cut/paste。
 */

import type { GridEngine } from '../../../engine/GridEngine'
import type { Field } from '../../../kernel/data/Schema'
import type { ViewPipeline } from '../../../features/view/ViewPipeline'
import type { SortLayer } from '../../../features/view/SortLayer'
import type { FilterLayer } from '../../../features/view/FilterLayer'
import {
  applyContextMenuConfig,
  getCellContextMenuItems,
  getColumnHeaderContextMenuItems,
  getRowHeaderContextMenuItems,
} from '../../../features/context-menu/ContextMenuModel'
import type {
  ContextMenuAction,
  ContextMenuContext,
  ContextMenuExtensionConfig,
  ContextMenuItem,
  ContextMenuRenderer,
} from '../../../features/context-menu/ContextMenuModel'
import type { Theme } from '../../../kernel/theme/Theme'
import { isMutableDataSource } from '../../../kernel/data/MutableDataSource'
import { hitTestCell } from '../../../kernel/interaction/HitTest'
import { computeCellRect } from '../../../kernel/interaction/CellLayout'
import type { DomContextMenuLayer } from '../../interaction/DomContextMenuLayer'
import type { WebHost, WebPointerEvent } from '../../host/Host'
import type { PopoverAnchorPoint } from './PopoverController'

/** 列头悬停菜单按钮尺寸（直径），与 HeaderPainter.HEADER_MENU_BUTTON_SIZE 保持一致。 */
const COLUMN_HEADER_MENU_BUTTON_SIZE = 24
/** 列宽小于此值时不显示（也不命中）菜单按钮，与 HeaderPainter.MIN_HEADER_MENU_BUTTON_COL_WIDTH 保持一致。 */
const COLUMN_HEADER_MENU_BUTTON_MIN_COL_WIDTH = 32

/** 内置 context menu action id 集合；用于区分 builtin 与 custom item。 */
const BUILTIN_CONTEXT_MENU_ACTIONS = new Set<string>([
  'cut', 'copy', 'paste',
  'sort-asc', 'sort-desc', 'sort-none',
  'filter-open', 'filter-clear',
  'insert-col-left', 'insert-col-right', 'delete-cols', 'hide-cols', 'unhide-cols', 'resize-column-width',
  'insert-above', 'insert-below', 'delete-rows', 'hide-rows', 'unhide-rows', 'resize-row-height',
])

/** ContextMenuController 的窄依赖接口——只列它真正需要的 GridRuntime 能力。 */
export interface ContextMenuControllerDeps {
  readonly engine: GridEngine
  readonly host: WebHost
  isDestroyed(): boolean
  invalidate(): void
  afterEngineMutation(): void
  getViewPipeline(): ViewPipeline | undefined
  getSortLayer(): SortLayer | undefined
  getFilterLayer(): FilterLayer | undefined
  getContextMenus(): ContextMenuExtensionConfig | undefined
  /** `resizeDrag.active || activeDrag?.active`。 */
  isDragActive(): boolean
  isCellEditing(): boolean
  commitCellEdit(moveAfter: boolean): void
  hitTestColumnHeader(event: WebPointerEvent): { colIndex: number } | null
  // 剪贴板（菜单默认动作）
  clipboardCopy(): Promise<boolean>
  clipboardCut(): Promise<boolean>
  clipboardPaste(): Promise<boolean>
  // popover 域
  openFilterPopover(
    ctx: Extract<ContextMenuContext, { targetKind: 'columnHeader' }>,
    anchor: PopoverAnchorPoint,
  ): void
  openRowHeightPopover(rowIds: readonly number[], anchor: PopoverAnchorPoint): void
  openColumnWidthPopover(fieldIds: readonly string[], anchor: PopoverAnchorPoint): void
  // 结构 mutation（Phase 2 后闭包体改直调 engine；接口不变）
  insertRows(beforeUnderlyingRow: number, count: number): readonly number[]
  deleteRows(underlyingRowIds: readonly number[]): void
  hideRows(underlyingRowIds: readonly number[]): void
  unhideRows(underlyingRowIds: readonly number[]): void
  insertCols(beforeFieldIndex: number, count: number): readonly Field[]
  deleteCols(fieldIds: readonly string[]): void
  hideCols(fieldIds: readonly string[]): void
  unhideCols(fieldIds: readonly string[]): void
}

export class ContextMenuController {
  private readonly deps: ContextMenuControllerDeps
  /** DOM 右键菜单 layer。 */
  private contextMenuLayer?: DomContextMenuLayer
  /** DOM override renderer：替换内置 DomContextMenuLayer，由 consumer 完全接管菜单渲染。 */
  private contextMenuRenderer?: ContextMenuRenderer
  /** 外部接管 context menu action 的回调。 */
  private onContextMenuAction?: (action: ContextMenuAction | string, ctx: ContextMenuContext) => void
  /** 最近一次打开菜单时的上下文，用于菜单项点击分发。 */
  private lastContextMenuContext: ContextMenuContext | null = null
  /** 最近一次打开菜单时的屏幕坐标，用于 filter popover 锚点。 */
  private lastContextMenuPoint: { clientX: number; clientY: number } | null = null
  /** 当前列头 hover 状态；null 表示未悬停。 */
  private lastHoveredColumnMenu: { colIndex: number; buttonHovered: boolean } | null = null

  constructor(deps: ContextMenuControllerDeps) {
    this.deps = deps
  }

  /** 注入右键菜单层（Phase 4.0）。 */
  setLayer(layer: DomContextMenuLayer): void {
    this.contextMenuLayer = layer
  }

  /** 注入 DOM override renderer，替换内置 DomContextMenuLayer。 */
  setRenderer(renderer: ContextMenuRenderer): void {
    this.contextMenuRenderer = renderer
  }

  /** 注册右键菜单 action 回调；设置后 consumer 可接管默认菜单行为。 */
  setOnAction(cb: (action: ContextMenuAction | string, ctx: ContextMenuContext) => void): void {
    this.onContextMenuAction = cb
  }

  /** 是否已注册 consumer 的 action override 回调。 */
  hasActionOverride(): boolean {
    return this.onContextMenuAction !== undefined
  }

  /**
   * 若已注册 override 回调则调用；否则 no-op。供其它域（如 PopoverController 的
   * filter-open 回退）在不经过 `handleContextMenuSelected` 完整优先级链的情况下，
   * 复用同一份 override 回调——避免 GridRuntime 额外重复持有一份回调引用。
   */
  invokeActionOverride(action: ContextMenuAction | string, ctx: ContextMenuContext): void {
    this.onContextMenuAction?.(action, ctx)
  }

  /** 关闭右键菜单并清理最近菜单上下文。 */
  close(): void {
    this.contextMenuLayer?.close()
    this.contextMenuRenderer?.close()
    this.lastContextMenuContext = null
  }

  /** 判断 id 是否为内置 action（非 custom id）。 */
  private isBuiltInContextMenuAction(id: string): boolean {
    return BUILTIN_CONTEXT_MENU_ACTIONS.has(id)
  }

  /** 将无 onContextMenuAction 处理器的自定义 item 标记为 disabled。 */
  private markUnhandledCustomItemsDisabled(items: readonly ContextMenuItem[]): readonly ContextMenuItem[] {
    return items.map((item) => {
      const submenu = item.submenu
        ? this.markUnhandledCustomItemsDisabled(item.submenu)
        : undefined
      const custom = !this.isBuiltInContextMenuAction(item.id)
      const shouldDisable = custom && !this.hasActionOverride()
      if (!shouldDisable && submenu === item.submenu) return item
      return {
        ...item,
        disabled: shouldDisable ? true : item.disabled,
        ...(submenu !== item.submenu ? { submenu } : {}),
      }
    })
  }

  /** 统一菜单打开入口：设置上下文/坐标，路由到 renderer 或 contextMenuLayer。 */
  private openResolvedContextMenu(args: {
    readonly ctx: ContextMenuContext
    readonly clientX: number
    readonly clientY: number
    readonly items: readonly ContextMenuItem[]
  }): void {
    const items = this.markUnhandledCustomItemsDisabled(args.items)
    this.lastContextMenuContext = args.ctx
    this.lastContextMenuPoint = { clientX: args.clientX, clientY: args.clientY }
    if (this.contextMenuRenderer) {
      this.contextMenuLayer?.close()
      this.contextMenuRenderer.open({
        targetKind: args.ctx.targetKind,
        context: args.ctx,
        items,
        anchor: { clientX: args.clientX, clientY: args.clientY },
        select: (id) => this.handleContextMenuSelected(id),
        close: () => this.close(),
      })
      return
    }
    if (!this.contextMenuLayer) return
    this.contextMenuLayer.open({ clientX: args.clientX, clientY: args.clientY, items })
  }

  /** 处理 host contextmenu 事件，并根据列头/单元格命中打开对应菜单。 */
  handleHostContextMenu(event: WebPointerEvent): void {
    if (this.deps.isDestroyed()) return
    if (this.deps.isDragActive()) return

    if (this.deps.isCellEditing()) {
      this.deps.commitCellEdit(false)
    }

    const frame = this.deps.engine.getFrame()
    const headerHeight = frame.theme.metrics.headerHeight
    if (event.y < headerHeight) {
      const viewPipeline = this.deps.getViewPipeline()
      if (!viewPipeline) return
      const fields = frame.data.getSchema().fields
      const rowHeaderWidth = frame.viewport.rowHeaderWidth ?? 0
      if (event.x < rowHeaderWidth) return
      const scrollX = frame.viewport.scrollX ?? 0
      const logicalX = event.x - rowHeaderWidth + scrollX
      if (logicalX < 0 || logicalX >= frame.colsAxis.getTotalSize()) return
      const colIndex = frame.colsAxis.positionToIndex(logicalX)
      if (colIndex < 0 || colIndex >= fields.length) return
      const field = fields[colIndex]
      if (!field) return
      const sel = this.deps.engine.getSelection().selectedRange
      const startCol = sel?.startCol ?? colIndex
      const endCol = sel?.endCol ?? colIndex
      const ctx: ContextMenuContext = {
        targetKind: 'columnHeader',
        field,
        colIndex,
        multiSelect: field.type === 'multiSelect',
        selectedColCount: endCol - startCol + 1,
        hasHiddenInSelection: this.collectHiddenInViewColRange(startCol, endCol).length > 0,
      }
      const items = applyContextMenuConfig(
        getColumnHeaderContextMenuItems(ctx, viewPipeline),
        ctx,
        this.deps.getContextMenus()?.columnHeader,
      )
      this.openResolvedContextMenu({
        ctx,
        clientX: event.clientX ?? event.x,
        clientY: event.clientY ?? event.y,
        items,
      })
      return
    }

    // Phase 4.5 — 行头区域（x < rowHeaderWidth，y >= headerHeight）右键：选中整行并打开行头菜单
    const rowHeaderWidth = frame.viewport.rowHeaderWidth ?? 0
    if (rowHeaderWidth > 0 && event.x < rowHeaderWidth) {
      const scrollY = frame.viewport.scrollY ?? 0
      const logicalY = event.y - headerHeight + scrollY
      if (logicalY >= 0) {
        const rowIndex = frame.rowsAxis.positionToIndex(logicalY)
        const colCount = frame.data.getSchema().fields.length
        if (rowIndex >= 0 && rowIndex < frame.rowsAxis.getCount() && colCount > 0) {
          // 选中整行
          this.deps.engine.setSelection({
            activeCell: { rowIndex, colIndex: 0 },
            anchorCell: { rowIndex, colIndex: 0 },
            extentCell: { rowIndex, colIndex: colCount - 1 },
            selectedRange: {
              startRow: rowIndex,
              endRow: rowIndex,
              startCol: 0,
              endCol: colCount - 1,
            },
          })
          this.deps.afterEngineMutation()
          const hiddenSet = new Set(this.deps.engine.getHiddenRows())
          const sel = this.deps.engine.getSelection().selectedRange!
          let hasHidden = false
          for (let r = sel.startRow; r <= sel.endRow && !hasHidden; r++) {
            const underlying = this.deps.engine.getData().resolveUnderlyingRow?.(r) ?? r
            if (hiddenSet.has(underlying)) hasHidden = true
          }
          const n = sel.endRow - sel.startRow + 1
          const ctx: ContextMenuContext = { targetKind: 'rowHeader', targetRowIndex: rowIndex, selectedRowCount: n }
          const items = applyContextMenuConfig(
            getRowHeaderContextMenuItems(n, hasHidden),
            ctx,
            this.deps.getContextMenus()?.rowHeader,
          )
          this.openResolvedContextMenu({
            ctx,
            clientX: event.clientX ?? event.x,
            clientY: event.clientY ?? event.y,
            items,
          })
        }
      }
      return
    }

    const hit = hitTestCell(frame, event)
    if (!hit) return
    if (hit.colIndex < 0 || hit.rowIndex < 0) return

    const selection = this.deps.engine.getSelection()
    const range = selection.selectedRange
    const inRange =
      range !== null &&
      hit.rowIndex >= range.startRow &&
      hit.rowIndex <= range.endRow &&
      hit.colIndex >= range.startCol &&
      hit.colIndex <= range.endCol
    if (!inRange) {
      this.deps.engine.selectCell(hit)
      this.deps.afterEngineMutation()
    }

    const newSelection = this.deps.engine.getSelection()
    // Phase 4.1：Paste 项 enabled 与否取决于 DataSource 是否可写。
    // 外部剪贴板有没有内容需要异步 readText 才能确定，菜单同步阶段不读取。
    const dataMutable = isMutableDataSource(this.deps.engine.getData())
    const ctx: ContextMenuContext = {
      targetKind: 'cell',
      cell: hit,
      selectedRange: newSelection.selectedRange,
      hasSelection: newSelection.activeCell !== null,
      clipboardReady: dataMutable,
    }
    const items = applyContextMenuConfig(
      getCellContextMenuItems(ctx),
      ctx,
      this.deps.getContextMenus()?.cell,
    )
    this.openResolvedContextMenu({
      ctx,
      clientX: event.clientX ?? event.x,
      clientY: event.clientY ?? event.y,
      items,
    })
  }

  /** 处理右键菜单项选择，优先执行内置 sort/filter/clipboard 行为。 */
  handleContextMenuSelected(id: ContextMenuAction | string): void {
    const ctx = this.lastContextMenuContext
    if (ctx?.targetKind === 'rowHeader') {
      this.invokeRowHeaderContextMenuAction(id, { targetRowIndex: ctx.targetRowIndex })
      return
    }
    if (ctx?.targetKind === 'columnHeader') {
      if (id === 'sort-asc') {
        this.deps.getSortLayer()?.setSpec({ fieldId: ctx.field.id, direction: 'asc' })
        return
      }
      if (id === 'sort-desc') {
        this.deps.getSortLayer()?.setSpec({ fieldId: ctx.field.id, direction: 'desc' })
        return
      }
      if (id === 'sort-none') {
        const sortLayer = this.deps.getSortLayer()
        if (sortLayer?.getSpec()?.fieldId === ctx.field.id) sortLayer.setSpec(null)
        return
      }
      if (id === 'filter-clear') {
        this.deps.getFilterLayer()?.clear(ctx.field.id)
        return
      }
      if (id === 'filter-open') {
        this.deps.openFilterPopover(ctx, this.lastContextMenuPoint)
        return
      }
      if (
        id === 'insert-col-left' ||
        id === 'insert-col-right' ||
        id === 'delete-cols' ||
        id === 'hide-cols' ||
        id === 'unhide-cols' ||
        id === 'resize-column-width'
      ) {
        this.invokeColumnHeaderContextMenuAction(id, { targetColIndex: ctx.colIndex })
        return
      }
    }

    // Phase 4.1：consumer 传了 callback 完全接管；没传走默认引擎
    if (this.onContextMenuAction) {
      if (ctx) this.onContextMenuAction(id, ctx)
      return
    }
    if (id === 'copy') {
      void this.deps.clipboardCopy()
      return
    }
    if (id === 'cut') {
      void this.deps.clipboardCut()
      return
    }
    if (id === 'paste') {
      void this.deps.clipboardPaste()
    }
  }

  /** 按单元格坐标程序化打开右键菜单，锚点位于单元格右下角。 */
  openContextMenuAt(rowIndex: number, fieldId: string): void {
    if (this.deps.isDestroyed() || (!this.contextMenuLayer && !this.contextMenuRenderer)) return
    const colIndex = this.deps.engine.getColumnIndex(fieldId)
    if (colIndex < 0) return
    const frame = this.deps.engine.getFrame()
    const rect = computeCellRect(frame, { rowIndex, colIndex })
    if (!rect) return
    const hostRect = this.deps.host.getContainerBoundingRect()
    // anchor at cell bottom-right corner; client coords add the host's viewport offset
    this.handleHostContextMenu({
      x: rect.x + rect.width,
      y: rect.y + rect.height,
      clientX: hostRect.left + rect.x + rect.width,
      clientY: hostRect.top + rect.y + rect.height,
      shiftKey: false,
    })
  }

  /** Phase 4.5 — 生成行头右键菜单项列表（含条件 unhide 项）。 */
  getRowHeaderContextMenuItems(ctx: { targetRowIndex: number }): readonly ContextMenuItem[] {
    const sel = this.deps.engine.getSelection().selectedRange
    const startRow = sel?.startRow ?? ctx.targetRowIndex
    const endRow = sel?.endRow ?? ctx.targetRowIndex
    const n = endRow - startRow + 1
    const hidden = this.deps.engine.getHiddenRows()
    // 检查选区 span 的底层行区间内是否存在隐藏行（包括被 hide 而不在视图中的行）
    let hasHidden = false
    if (hidden.length > 0) {
      const data = this.deps.engine.getData()
      const underlyingStart = data.resolveUnderlyingRow?.(startRow) ?? startRow
      const underlyingEnd = data.resolveUnderlyingRow?.(endRow) ?? endRow
      const minU = Math.min(underlyingStart, underlyingEnd)
      const maxU = Math.max(underlyingStart, underlyingEnd)
      for (const hiddenId of hidden) {
        if (hiddenId >= minU && hiddenId <= maxU) {
          hasHidden = true
          break
        }
      }
    }
    const menuCtx: ContextMenuContext = { targetKind: 'rowHeader', targetRowIndex: ctx.targetRowIndex, selectedRowCount: n }
    return applyContextMenuConfig(
      getRowHeaderContextMenuItems(n, hasHidden),
      menuCtx,
      this.deps.getContextMenus()?.rowHeader,
    )
  }

  /** Phase 4.5 — 执行行头右键菜单动作。 */
  invokeRowHeaderContextMenuAction(id: string, ctx: { targetRowIndex: number }): void {
    const sel = this.deps.engine.getSelection().selectedRange
    const startRow = sel?.startRow ?? ctx.targetRowIndex
    const endRow = sel?.endRow ?? ctx.targetRowIndex
    const underlying: number[] = []
    for (let r = startRow; r <= endRow; r++) {
      underlying.push(this.deps.engine.getData().resolveUnderlyingRow?.(r) ?? r)
    }
    const sortedIds = [...new Set(underlying)].sort((a, b) => a - b)
    if (id === 'insert-above') {
      const at = this.deps.engine.getData().resolveUnderlyingRow?.(startRow) ?? startRow
      this.deps.insertRows(at, endRow - startRow + 1)
    } else if (id === 'insert-below') {
      const at = (this.deps.engine.getData().resolveUnderlyingRow?.(endRow) ?? endRow) + 1
      this.deps.insertRows(at, endRow - startRow + 1)
    } else if (id === 'delete-rows') {
      this.deps.deleteRows(sortedIds)
    } else if (id === 'hide-rows') {
      this.deps.hideRows(sortedIds)
    } else if (id === 'unhide-rows') {
      const hiddenSet = new Set(this.deps.engine.getHiddenRows())
      const toUnhide = sortedIds.filter((id) => hiddenSet.has(id))
      this.deps.unhideRows(toUnhide)
    } else if (id === 'resize-row-height') {
      this.deps.openRowHeightPopover(sortedIds, this.lastContextMenuPoint)
    }
  }

  /** Phase 4.6 — 生成列头右键菜单项列表（含结构项与条件 unhide 项）。 */
  getColumnHeaderContextMenuItems(ctx: { targetColIndex: number }): readonly ContextMenuItem[] {
    const frame = this.deps.engine.getFrame()
    const fields = frame.data.getSchema().fields
    const field = fields[ctx.targetColIndex]
    const viewPipeline = this.deps.getViewPipeline()
    if (!field || !viewPipeline) return []
    const sel = this.deps.engine.getSelection().selectedRange
    const startCol = sel?.startCol ?? ctx.targetColIndex
    const endCol = sel?.endCol ?? ctx.targetColIndex
    const menuCtx = {
      targetKind: 'columnHeader' as const,
      field,
      colIndex: ctx.targetColIndex,
      multiSelect: field.type === 'multiSelect',
      selectedColCount: endCol - startCol + 1,
      hasHiddenInSelection: this.collectHiddenInViewColRange(startCol, endCol).length > 0,
    }
    return applyContextMenuConfig(
      getColumnHeaderContextMenuItems(menuCtx, viewPipeline),
      menuCtx,
      this.deps.getContextMenus()?.columnHeader,
    )
  }

  /** Phase 4.6 — 执行列头右键菜单动作。 */
  invokeColumnHeaderContextMenuAction(id: string, ctx: { targetColIndex: number }): void {
    const sel = this.deps.engine.getSelection().selectedRange
    const startCol = sel?.startCol ?? ctx.targetColIndex
    const endCol = sel?.endCol ?? ctx.targetColIndex
    const fieldIds: string[] = []
    for (let viewCol = startCol; viewCol <= endCol; viewCol += 1) {
      const fieldId = this.viewColToFieldId(viewCol)
      if (fieldId) fieldIds.push(fieldId)
    }
    const count = endCol - startCol + 1
    if (id === 'insert-col-left') {
      this.deps.insertCols(this.rawSchemaIndexBeforeViewCol(startCol), count)
    } else if (id === 'insert-col-right') {
      this.deps.insertCols(this.rawSchemaIndexAfterViewCol(endCol), count)
    } else if (id === 'delete-cols') {
      this.deps.deleteCols(fieldIds)
    } else if (id === 'hide-cols') {
      this.deps.hideCols(fieldIds)
    } else if (id === 'unhide-cols') {
      this.deps.unhideCols(this.collectHiddenInViewColRange(startCol, endCol))
    } else if (id === 'resize-column-width') {
      this.deps.openColumnWidthPopover(fieldIds, this.lastContextMenuPoint)
    }
  }

  private viewColToFieldId(viewCol: number): string | null {
    return this.deps.engine.getData().getSchema().fields[viewCol]?.id ?? null
  }

  private rawSchemaIndexBeforeViewCol(viewCol: number): number {
    const hiddenBefore = this.deps.engine
      .getFrame()
      .collapsedColGaps.filter((gap) => gap.atViewCol < viewCol)
      .reduce((sum, gap) => sum + gap.hiddenCount, 0)
    return viewCol + hiddenBefore
  }

  private rawSchemaIndexAfterViewCol(viewCol: number): number {
    const hiddenThrough = this.deps.engine
      .getFrame()
      .collapsedColGaps.filter((gap) => gap.atViewCol <= viewCol)
      .reduce((sum, gap) => sum + gap.hiddenCount, 0)
    return viewCol + 1 + hiddenThrough
  }

  private collectHiddenInViewColRange(startCol: number, endCol: number): readonly string[] {
    const out: string[] = []
    for (const gap of this.deps.engine.getFrame().collapsedColGaps) {
      if (gap.atViewCol >= startCol - 1 && gap.atViewCol < endCol) {
        out.push(...gap.hiddenFieldIds)
      }
    }
    return out
  }

  /**
   * 列头悬停：仅在列头区域内更新 engine 侧的 hoveredColumnHeaderMenu 状态。
   * 使用去重优化：状态未变时不调用 engine 也不 invalidate。
   */
  updateHoveredColumnHeaderMenu(event: WebPointerEvent): void {
    const hit = this.deps.hitTestColumnHeader(event)
    if (!hit) {
      if (this.lastHoveredColumnMenu !== null) {
        this.lastHoveredColumnMenu = null
        this.deps.engine.setHoveredColumnHeaderMenu(null)
        this.deps.invalidate()
      }
      return
    }
    const colIndex = hit.colIndex
    const buttonHovered = this.hitTestColumnHeaderMenuButton(event) !== null
    const prev = this.lastHoveredColumnMenu
    if (prev?.colIndex === colIndex && prev?.buttonHovered === buttonHovered) return
    this.lastHoveredColumnMenu = { colIndex, buttonHovered }
    this.deps.engine.setHoveredColumnHeaderMenu({ colIndex, buttonHovered })
    this.deps.invalidate()
  }

  /**
   * 点击命中检测：判断指针是否落在列头菜单按钮（圆形 hover 按钮）上。
   * 按钮位置与 HeaderPainter.paintHeaderMenuButton 一致：
   *   centerX = colLeft + colWidth - padX - buttonSize/2
   *   button 横跨 [colLeft + colWidth - padX - buttonSize, colLeft + colWidth - padX]
   */
  hitTestColumnHeaderMenuButton(event: WebPointerEvent): { colIndex: number } | null {
    const headerHit = this.deps.hitTestColumnHeader(event)
    if (!headerHit) return null
    const frame = this.deps.engine.getFrame()
    const colIndex = headerHit.colIndex
    const colWidth = frame.colsAxis.getSize(colIndex)
    if (colWidth < COLUMN_HEADER_MENU_BUTTON_MIN_COL_WIDTH) return null
    const padX = frame.theme.metrics.cellPaddingX ?? 8
    const rowHeaderWidth = frame.viewport.rowHeaderWidth ?? 0
    const scrollX = frame.viewport.scrollX ?? 0
    const colLeft = rowHeaderWidth + frame.colsAxis.indexToPosition(colIndex) - scrollX
    const buttonLeft = colLeft + colWidth - padX - COLUMN_HEADER_MENU_BUTTON_SIZE
    const buttonRight = colLeft + colWidth - padX
    if (event.x < buttonLeft || event.x > buttonRight) return null
    return { colIndex }
  }

  /** 打开指定列索引对应的列头上下文菜单（复用 openResolvedContextMenu）。 */
  openColumnHeaderContextMenu(colIndex: number, _event: WebPointerEvent): void {
    const viewPipeline = this.deps.getViewPipeline()
    if (!viewPipeline) return
    const frame = this.deps.engine.getFrame()
    const fields = frame.data.getSchema().fields
    const field = fields[colIndex]
    if (!field) return
    const sel = this.deps.engine.getSelection().selectedRange
    const startCol = sel?.startCol ?? colIndex
    const endCol = sel?.endCol ?? colIndex
    const ctx: ContextMenuContext = {
      targetKind: 'columnHeader',
      field,
      colIndex,
      multiSelect: field.type === 'multiSelect',
      selectedColCount: endCol - startCol + 1,
      hasHiddenInSelection: this.collectHiddenInViewColRange(startCol, endCol).length > 0,
    }
    const items = applyContextMenuConfig(
      getColumnHeaderContextMenuItems(ctx, viewPipeline),
      ctx,
      this.deps.getContextMenus()?.columnHeader,
    )
    // 锚点：按钮左边缘 × header 底部（viewport 坐标）。
    // DomContextMenuLayer.clampToViewport 负责右边缘溢出时向左推。
    const rowHeaderWidth = frame.viewport.rowHeaderWidth ?? 0
    const scrollX = frame.viewport.scrollX ?? 0
    const headerHeight = frame.viewport.headerHeight ?? frame.theme.metrics.headerHeight
    const colLeft = rowHeaderWidth + frame.colsAxis.indexToPosition(colIndex) - scrollX
    const colWidth = frame.colsAxis.getSize(colIndex)
    const padX = frame.theme.metrics.cellPaddingX ?? 8
    const buttonLeft = colLeft + colWidth - padX - COLUMN_HEADER_MENU_BUTTON_SIZE
    const hostRect = this.deps.host.getContainerBoundingRect()
    this.openResolvedContextMenu({
      ctx,
      clientX: hostRect.left + buttonLeft,
      clientY: hostRect.top + headerHeight,
      items,
    })
  }

  /** 同步 context menu layer 主题。 */
  applyTheme(theme: Theme): void {
    this.contextMenuLayer?.applyTheme(theme)
  }

  /** 销毁 override renderer（若已注入）。 */
  destroy(): void {
    this.contextMenuRenderer?.destroy()
  }
}
