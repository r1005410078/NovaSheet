/**
 * InputController——pointer/keyboard 事件路由、表头命中测试与整行/整列选择编排
 * （GridRuntime 拆分 Task 9，见
 * `docs/superpowers/specs/2026-07-11-grid-runtime-decomposition-design.md` §3.2）。
 *
 * `handleHostKeyDown` 是全 runtime 优先级链最长的入口——按固定顺序试探 Escape 取消拖拽、
 * filter popover 阻断、编辑态阻断、剪贴板快捷键、undo/redo、F2/Enter/typing 触发编辑，
 * 最后落到选区导航；任何分支的 return true/false 语义与修饰键归属都逐字保留自原
 * `GridRuntime`（迁移前的 STOP+ASK 风险点，见 spec §6 首要风险）。
 *
 * `hitTestColumnHeader`/`hitTestRowHeader`/`isWholeColumnSelection`/`isWholeRowSelection`/
 * `selectWholeColumn(Range)`/`selectWholeRowRange` 保持 public——`DragCoordinator`（Task 8）
 * 与 `ContextMenuController`（Task 6）经各自 deps 反向消费这些表头命中/整行整列选择能力。
 */

import type { GridEngine } from '../../../engine/GridEngine'
import { isTypableEditKey } from '../../../features/edit/CellEdit'
import type { CellAddress, CellRange } from '../../../kernel/coords/SelectionTypes'
import { hitTestCell } from '../../../kernel/interaction/HitTest'
import type { CellActionHit, RenderBackend } from '../../../ports/RenderBackend'
import type { CellEditorTrigger } from '../../interaction/CellEditorContract'
import type { WebHost, WebKeyboardEvent, WebPointerEvent } from '../../host/Host'
import type { ValidationTooltip } from '../../overlay/ValidationTooltip'
import type { RuntimeRenderFrame } from '../runtime-frame'

/** InputController 的窄依赖接口——只列它真正需要的 GridRuntime 能力。 */
export interface InputControllerDeps {
  readonly engine: GridEngine
  readonly host: WebHost
  isDestroyed(): boolean
  refresh(): void
  /** `getCellActionAt` 用；renderer 可被 replaceRenderer 替换，故经函数取最新值。 */
  getRenderer(): RenderBackend
  readonly validationTooltip?: ValidationTooltip
  // drag（DragCoordinator，Task 8）
  tryStartDrag(event: WebPointerEvent): boolean
  moveActiveDrag(event: WebPointerEvent): boolean
  commitActiveDrag(): boolean
  cancelActiveDrag(): boolean
  isAnyDragActive(): boolean
  // edit（CellEditController，Task 7）
  closeActiveCustomEditor(): void
  commitCellEdit(moveAfter: boolean): void
  openCellEditorForTrigger(args: {
    readonly cell: CellAddress
    readonly trigger: CellEditorTrigger
    readonly initialInput?: string
    readonly selectAll?: boolean
  }): boolean
  hasCustomCellEditor(cell: CellAddress): boolean
  invokeCellAction(action: CellActionHit): void
  // clipboard / undo（ClipboardController，Task 4）
  clipboardCopy(): Promise<boolean>
  clipboardCut(): Promise<boolean>
  clipboardPaste(): Promise<boolean>
  undo(): void
  redo(): void
  // menu（ContextMenuController，Task 6 / PopoverController，Task 5）
  hitTestColumnHeaderMenuButton(event: WebPointerEvent): { colIndex: number } | null
  openColumnHeaderContextMenu(colIndex: number, event: WebPointerEvent): void
  updateHoveredColumnHeaderMenu(event: WebPointerEvent): void
  isFilterPopoverOpen(): boolean
  // viewport（ViewportController，Task 2）
  ensureCellVisible(cell: CellAddress): void
  getSelectionScrollTarget(): CellAddress | null
  /**
   * `hitTestColumnHeader` 原体读 `this.viewport.getColsTotalSizeForFrame(frame)`；
   * brief 深依赖清单未列出此项，按"缺 deps 则补一条闭包"规则补上（Task 9）。
   */
  getColsTotalSizeForFrame(frame: RuntimeRenderFrame): number
}

export class InputController {
  private readonly deps: InputControllerDeps

  constructor(deps: InputControllerDeps) {
    this.deps = deps
  }

  /** 处理 host pointerdown，开始单元格选择或扩展选择。 */
  handleHostPointerDown(event: WebPointerEvent): void {
    if (this.deps.isDestroyed()) return
    // 仅左键进入 drag-select；右键 / 中键留给 contextmenu / 其它路径
    if ((event.button ?? 0) !== 0) return
    this.deps.closeActiveCustomEditor()
    if (this.deps.engine.isCellEditing()) {
      this.deps.commitCellEdit(false)
    }
    const action = this.deps.getRenderer().getCellActionAt?.(event.x, event.y)
    if (action) {
      this.deps.invokeCellAction(action)
      return
    }
    // 列头菜单按钮命中：左键单击时优先打开列头菜单，不进入 drag-select
    const menuButtonHit = this.deps.hitTestColumnHeaderMenuButton(event)
    if (menuButtonHit) {
      this.deps.openColumnHeaderContextMenu(menuButtonHit.colIndex, event)
      return
    }
    // 组头行命中：单击选中整组；不进入 tryStartDrag/DragCoordinator（组头拖拽扩展选区不在本期范围）
    const groupHit = this.hitTestGroupHeader(event)
    if (groupHit) {
      this.deps.engine.selectColumnGroup(groupHit.groupId)
      this.deps.refresh()
      return
    }
    this.deps.tryStartDrag(event)
  }

  /** 处理 host pointermove，更新拖拽选区并启动边缘自动滚动。 */
  handleHostPointerMove(event: WebPointerEvent): void {
    if (this.deps.moveActiveDrag(event)) return
    if (this.deps.isDestroyed()) return
    this.updateHeaderCursor(event)
    this.updateValidationTooltip(event)
    this.deps.updateHoveredColumnHeaderMenu(event)
  }

  private updateValidationTooltip(event: WebPointerEvent): void {
    if (!this.deps.validationTooltip) return
    const frame = this.deps.engine.getFrame()
    const hit = hitTestCell(frame, event)
    if (!hit) {
      this.deps.validationTooltip.hide()
      return
    }
    const state = frame.getValidationState?.(hit.rowIndex, hit.colIndex)
    if (state !== 'invalid') {
      this.deps.validationTooltip.hide()
      return
    }
    const rawRow = this.deps.engine.viewRowToRaw(hit.rowIndex)
    const rawCol = this.deps.engine.viewColToRaw(hit.colIndex)
    const result = this.deps.engine.getValidationState(rawRow, rawCol)
    if (!result || result.status !== 'invalid') {
      this.deps.validationTooltip.hide()
      return
    }
    const cellRect = this.computeValidationCellRect(hit.rowIndex, hit.colIndex, frame)
    if (!cellRect) {
      this.deps.validationTooltip.hide()
      return
    }
    const hostRect = this.deps.host.getContainerBoundingRect()
    const { width: containerWidth } = this.deps.host.getContainerSize()
    const containerRect = { left: hostRect.left, top: hostRect.top, width: containerWidth }
    this.deps.validationTooltip.show(result.message, cellRect, containerRect)
  }

  private computeValidationCellRect(
    viewRow: number,
    viewCol: number,
    frame: RuntimeRenderFrame,
  ): { left: number; right: number; top: number; width: number; height: number } | null {
    const { rowsAxis, colsAxis, viewport } = frame
    const region = viewport.regions.find(
      (r) =>
        viewRow >= r.rowRange[0] &&
        viewRow <= r.rowRange[1] &&
        viewCol >= r.colRange[0] &&
        viewCol <= r.colRange[1],
    )
    if (!region) return null
    const x = colsAxis.indexToPosition(viewCol) - region.scrollOffsetX + region.rect.x
    const y = rowsAxis.indexToPosition(viewRow) - region.scrollOffsetY + region.rect.y
    const cellWidth = colsAxis.getSize(viewCol)
    const cellHeight = rowsAxis.getSize(viewRow)
    const hostRect = this.deps.host.getContainerBoundingRect()
    return {
      left: hostRect.left + x,
      right: hostRect.left + x + cellWidth,
      top: hostRect.top + y,
      width: cellWidth,
      height: cellHeight,
    }
  }

  /** 处理 host pointerup，结束选区拖拽并恢复 fill handle。 */
  handleHostPointerUp(): void {
    this.deps.commitActiveDrag()
  }

  /** 处理双击单元格，进入编辑模式。 */
  handleHostDoubleClick(event: WebPointerEvent): void {
    if (this.deps.isDestroyed() || this.deps.isAnyDragActive()) return
    const hit = hitTestCell(this.deps.engine.getFrame(), event)
    if (!hit) return
    this.deps.engine.selectCell(hit)
    this.deps.openCellEditorForTrigger({ cell: hit, trigger: 'double-click', selectAll: false })
  }

  /** Phase 3.3 / 3.5 — 导航；选中后直接键入进入编辑（Sheets 式）。 */
  handleHostKeyDown(event: WebKeyboardEvent): boolean {
    if (this.deps.isDestroyed()) return false
    if (event.key === 'Escape' && this.deps.cancelActiveDrag()) {
      return true
    }
    if (this.deps.isFilterPopoverOpen()) return false
    if (this.deps.engine.isCellEditing()) return false

    // Phase 4.1 — Ctrl+X / C / V（Mac 上 Cmd）剪贴板快捷键；Shift / Alt 组合不抢
    const mod = event.ctrlKey || event.metaKey
    if (mod && !event.shiftKey && !event.altKey) {
      const k = event.key.toLowerCase()
      if (k === 'c') {
        void this.deps.clipboardCopy()
        return true
      }
      if (k === 'x') {
        void this.deps.clipboardCut()
        return true
      }
      if (k === 'v') {
        void this.deps.clipboardPaste()
        return true
      }
      if (k === 'z') {
        if (!this.deps.engine.canUndo()) return false
        this.deps.undo()
        return true
      }
      if (k === 'y' && event.ctrlKey && !event.metaKey) {
        if (!this.deps.engine.canRedo()) return false
        this.deps.redo()
        return true
      }
    }

    // Cmd/Ctrl+Shift+Z — redo
    if (mod && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'z') {
      if (!this.deps.engine.canRedo()) return false
      this.deps.redo()
      return true
    }

    const cell = this.deps.engine.getSelection().activeCell

    if (event.key === 'F2' && cell) {
      if (this.deps.openCellEditorForTrigger({ cell, trigger: 'f2', selectAll: false })) return true
    }

    if (event.key === 'Enter' && cell && this.deps.hasCustomCellEditor(cell)) {
      if (this.deps.openCellEditorForTrigger({ cell, trigger: 'enter', selectAll: false }))
        return true
    }

    if (
      cell &&
      isTypableEditKey(event.key, {
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
      })
    ) {
      if (
        this.deps.openCellEditorForTrigger({
          cell,
          trigger: 'typing',
          initialInput: event.key,
          selectAll: false,
        })
      ) {
        return true
      }
    }

    if (!this.deps.engine.navigateSelection(event.key, event.shiftKey)) return false

    const focus = this.deps.getSelectionScrollTarget()
    if (focus) this.deps.ensureCellVisible(focus)
    this.deps.refresh()
    return true
  }

  private updateHeaderCursor(event: WebPointerEvent): void {
    if (this.deps.isAnyDragActive()) {
      this.deps.host.setCursor(null)
      return
    }
    const hit = this.hitTestColumnHeader(event)
    const range = this.deps.engine.getSelection().selectedRange
    const canDrag =
      hit &&
      range &&
      this.isWholeColumnSelection(range) &&
      hit.colIndex >= range.startCol &&
      hit.colIndex <= range.endCol
    if (canDrag) {
      this.deps.host.setCursor('grab')
      return
    }

    const rowHit = this.hitTestRowHeader(event)
    const rowRange = this.deps.engine.getSelection().selectedRange
    const canRowDrag =
      rowHit &&
      rowRange &&
      this.isWholeRowSelection(rowRange) &&
      rowHit.rowIndex >= rowRange.startRow &&
      rowHit.rowIndex <= rowRange.endRow
    this.deps.host.setCursor(canRowDrag ? 'grab' : null)
  }

  /** 供 DragCoordinator/ContextMenuController deps 反向消费。 */
  isWholeColumnSelection(range: CellRange): boolean {
    const rowCount = this.deps.engine.getFrame().data.getRowCount()
    return rowCount > 0 && range.startRow === 0 && range.endRow === rowCount - 1
  }

  /** 供 DragCoordinator deps 反向消费。 */
  isWholeRowSelection(range: CellRange): boolean {
    const colCount = this.deps.engine.getFrame().data.getSchema().fields.length
    return colCount > 0 && range.startCol === 0 && range.endCol === colCount - 1
  }

  /** 供 DragCoordinator/ContextMenuController deps 反向消费。 */
  hitTestColumnHeader(event: WebPointerEvent): { colIndex: number; fieldId: string } | null {
    const frame = this.deps.engine.getFrame()
    const headerHeight = frame.viewport.headerHeight ?? frame.theme.metrics.headerHeight
    if (event.y < 0 || event.y >= headerHeight) return null
    const rowHeaderWidth = frame.viewport.rowHeaderWidth ?? 0
    if (event.x < rowHeaderWidth) return null
    const scrollX = frame.viewport.scrollX ?? 0
    const logicalX = event.x - rowHeaderWidth + scrollX
    const totalSize = this.deps.getColsTotalSizeForFrame(frame)
    if (logicalX < 0 || logicalX >= totalSize) return null
    const colIndex = frame.colsAxis.positionToIndex(logicalX)
    if (typeof frame.data.getSchema !== 'function') return null
    const field = frame.data.getSchema().fields[colIndex]
    if (!field) return null
    // 列组存在时：y 落在该列自身叶头内容起点之上（组行区，非本列——空隙或别组的格）不算命中；
    // 无列组时 columnGroupHeader 为 undefined，整段跳过，行为与 M1 零成本一致。
    const columnGroupHeader = frame.columnGroupHeader
    if (columnGroupHeader) {
      const leafTopRow = columnGroupHeader.leafTopRowByViewCol[colIndex] ?? columnGroupHeader.depth
      const leafTop = leafTopRow * frame.theme.metrics.groupHeaderRowHeight
      if (event.y < leafTop) return null
    }
    return { colIndex, fieldId: field.id }
  }

  /** 供 pointer 路由消费；组头点击选组入口。 */
  hitTestGroupHeader(event: WebPointerEvent): { groupId: string } | null {
    const frame = this.deps.engine.getFrame()
    const columnGroupHeader = frame.columnGroupHeader
    if (!columnGroupHeader) return null
    const headerHeight = frame.viewport.headerHeight ?? frame.theme.metrics.headerHeight
    if (event.y < 0 || event.y >= headerHeight) return null
    const rowHeaderWidth = frame.viewport.rowHeaderWidth ?? 0
    if (event.x < rowHeaderWidth) return null
    const scrollX = frame.viewport.scrollX ?? 0
    const logicalX = event.x - rowHeaderWidth + scrollX
    const totalSize = this.deps.getColsTotalSizeForFrame(frame)
    if (logicalX < 0 || logicalX >= totalSize) return null
    const groupRowHeight = frame.theme.metrics.groupHeaderRowHeight
    const level = Math.floor(event.y / groupRowHeight)
    if (level >= columnGroupHeader.depth) return null
    const colIndex = frame.colsAxis.positionToIndex(logicalX)
    const row = columnGroupHeader.rows[level] ?? []
    const cell = row.find((c) => colIndex >= c.startViewCol && colIndex <= c.endViewCol)
    if (!cell) return null
    return { groupId: cell.groupId }
  }

  /** 供 DragCoordinator deps 反向消费。 */
  hitTestRowHeader(event: WebPointerEvent): { rowIndex: number } | null {
    const frame = this.deps.engine.getFrame()
    const rowHeaderWidth = frame.viewport.rowHeaderWidth ?? 0
    if (rowHeaderWidth <= 0 || event.x < 0 || event.x >= rowHeaderWidth) return null
    const headerHeight = frame.viewport.headerHeight ?? frame.theme.metrics.headerHeight
    if (event.y < headerHeight) return null
    const scrollY = frame.viewport.scrollY ?? 0
    const logicalY = event.y - headerHeight + scrollY
    if (logicalY < 0) return null
    const rowIndex = frame.rowsAxis.positionToIndex(logicalY)
    if (rowIndex < 0 || rowIndex >= frame.rowsAxis.getCount()) return null
    return { rowIndex }
  }

  /** 供 DragCoordinator deps 反向消费。 */
  selectWholeColumn(colIndex: number): void {
    this.selectWholeColumnRange(colIndex, colIndex)
  }

  /** 供 DragCoordinator deps 反向消费。 */
  selectWholeColumnRange(anchorCol: number, extentCol: number): void {
    const frame = this.deps.engine.getFrame()
    const rowCount = frame.data.getRowCount()
    if (rowCount <= 0) return
    const startCol = Math.min(anchorCol, extentCol)
    const endCol = Math.max(anchorCol, extentCol)
    this.deps.engine.setSelection({
      activeCell: { rowIndex: 0, colIndex: extentCol },
      anchorCell: { rowIndex: 0, colIndex: anchorCol },
      extentCell: { rowIndex: rowCount - 1, colIndex: extentCol },
      selectedRange: { startRow: 0, endRow: rowCount - 1, startCol, endCol },
    })
  }

  /** 供 DragCoordinator deps 反向消费。 */
  selectWholeRowRange(anchorRow: number, extentRow: number): void {
    const frame = this.deps.engine.getFrame()
    const colCount = frame.data.getSchema().fields.length
    if (colCount <= 0) return
    const startRow = Math.min(anchorRow, extentRow)
    const endRow = Math.max(anchorRow, extentRow)
    this.deps.engine.setSelection({
      activeCell: { rowIndex: extentRow, colIndex: 0 },
      anchorCell: { rowIndex: anchorRow, colIndex: 0 },
      extentCell: { rowIndex: extentRow, colIndex: colCount - 1 },
      selectedRange: { startRow, endRow, startCol: 0, endCol: colCount - 1 },
    })
  }
}
