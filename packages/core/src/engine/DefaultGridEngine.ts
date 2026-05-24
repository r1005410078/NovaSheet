import type { CellValue } from '../data/Schema'
import type { DataSource } from '../data/DataSource'
import { isMutableDataSource } from '../data/MutableDataSource'
import { HideRowsLayer } from '../view/HideRowsLayer'
import { applyPaste } from '../clipboard/ApplyPaste'
import type { ApplyPasteSource, PasteTargetRect, PasteWriteRecord } from '../clipboard/ApplyPaste'
import type { PasteSkippedCell } from '../clipboard/types'
import { computeFillWrites } from '../fill/FillSeries'
import { unionRange, type FillDirection } from '../fill/FillTarget'
import { formatCellForEdit, isEditableFieldType, parseCellEditInput } from '../interaction/CellEdit'
import { CellEditModel } from '../interaction/CellEditModel'
import { parseSelectionNavigationKey } from '../interaction/SelectionNavigation'
import {
  SelectionModel,
  type CellAddress,
  type CellRange,
  type GridSelection,
  type SelectCellOptions,
} from '../interaction/SelectionModel'
import { ChunkedAxis } from '../layout/ChunkedAxis'
import { FrozenRegions, type FrozenConfig } from '../layout/FrozenRegions'
import { Viewport } from '../layout/Viewport'
import type { RenderFrame } from '../render/RenderFrame'
import { denseGridTheme } from '../theme/denseGridTheme'
import type { Theme } from '../theme/Theme'
import { UndoStack } from '../undo/UndoStack'
import type { CellWrite, UndoCommand } from '../undo/UndoCommand'
import { findViewRow, resolveUnderlyingRow } from '../view/coordinates'
import type {
  FillCommitResult,
  GridEngine,
  GridEngineOptions,
  SetViewDataOptions,
} from './GridEngine'

/**
 * `GridEngine` 默认实现。
 *
 * 管理 `ChunkedAxis`、`FrozenRegions`、`Viewport` 与 `DataSource` 绑定。
 * `setData` 会重建轴与 viewport（字段/行数变化时）；`getFrame()` 产出不可变快照供渲染。
 */
const DEFAULT_EXCEL_ROW_HEADER_WIDTH = 44

export class DefaultGridEngine implements GridEngine {
  /** raw 可变数据源（InMemoryDataSource 等）；mutation 方法直接操作此字段。 */
  private rawData: DataSource
  /** HideRowsLayer 包裹后的视图数据源；getFrame() / getDataSource() 等读取此字段。 */
  private data: DataSource
  private readonly hideRowsLayer = new HideRowsLayer()
  private theme: Theme
  private readonly excelHeaders: boolean
  private explicitDefaultRowHeight: number | undefined
  /**
   * rawRowsAxis：按 underlying row index 存储行高，供 setRowHeight / insertRows / deleteRows 操作。
   * rowsAxis：视图行轴（隐藏行已剔除），供 Viewport / RenderFrame / Renderer 使用。
   * 每次 hide/unhide/rebuildData 后调用 rebuildViewRowsAxis() 同步。
   */
  private rawRowsAxis: ChunkedAxis
  private rowsAxis: ChunkedAxis
  private colsAxis: ChunkedAxis
  private frozen: FrozenRegions
  private viewport: Viewport
  private selection = new SelectionModel()
  private cellEdit = new CellEditModel()
  private undoStack = new UndoStack()

  constructor(options: GridEngineOptions) {
    this.rawData = options.data
    this.theme = options.theme ?? denseGridTheme
    this.excelHeaders = options.excelHeaders === true
    this.explicitDefaultRowHeight = options.defaultRowHeight
    this.data = this.hideRowsLayer.wrap(this.rawData)
    this.rawRowsAxis = new ChunkedAxis({
      count: this.rawData.getRowCount(),
      defaultSize: this.resolveDefaultRowHeight(),
    })
    this.rowsAxis = this.buildViewRowsAxis()
    this.colsAxis = new ChunkedAxis({
      count: this.rawData.getSchema().fields.length,
      defaultSize: this.averageColWidth(),
    })
    this.frozen = new FrozenRegions(this.rowsAxis, this.colsAxis, this.resolveFrozenConfig(options))
    this.viewport = new Viewport(this.rowsAxis, this.colsAxis, this.frozen)
    this.viewport.setHeaderHeight(this.theme.metrics.headerHeight)
    this.applySheetChrome()
    this.applyFieldWidths()
  }

  setData(data: DataSource): void {
    this.hideRowsLayer.setHidden([])
    this.rebuildData(data)
    this.undoStack.clear()
  }

  setViewData(data: DataSource, options: SetViewDataOptions = {}): void {
    this.finishActiveEdit()
    const selection = this.selection.getSelection()
    this.rebuildData(data)
    if (options.oldResolveUnderlyingRow) {
      this.remapSelection(selection, options.oldResolveUnderlyingRow)
      return
    }
    if (options.clearSelection !== false) this.selection.clear()
  }

  private rebuildData(data: DataSource): void {
    this.rawData = data
    this.data = this.hideRowsLayer.wrap(this.rawData)
    this.rawRowsAxis = new ChunkedAxis({
      count: this.rawData.getRowCount(),
      defaultSize: this.resolveDefaultRowHeight(),
    })
    this.rowsAxis = this.buildViewRowsAxis()
    this.colsAxis = new ChunkedAxis({
      count: this.rawData.getSchema().fields.length,
      defaultSize: this.averageColWidth(),
    })
    this.frozen = new FrozenRegions(this.rowsAxis, this.colsAxis, this.frozen.getFrozenConfig())
    this.viewport = new Viewport(this.rowsAxis, this.colsAxis, this.frozen)
    this.viewport.setHeaderHeight(this.theme.metrics.headerHeight)
    this.applySheetChrome()
    this.applyFieldWidths()
  }

  setTheme(theme: Theme): void {
    this.theme = theme
    this.viewport.setHeaderHeight(theme.metrics.headerHeight)
    this.applySheetChrome()
    if (this.explicitDefaultRowHeight === undefined) {
      this.rawRowsAxis.setDefaultSize(theme.metrics.rowHeight)
      this.rebuildViewAxis()
    }
  }

  setFrozen(config: Partial<FrozenConfig>): void
  setFrozen(rows: number, cols: number): void
  setFrozen(configOrRows: Partial<FrozenConfig> | number, cols = 0): void {
    this.frozen.setFrozen(configOrRows, cols)
  }

  setViewportSize(width: number, height: number): void {
    this.viewport.setSize(width, height)
  }

  setHeaderHeight(headerHeight: number): void {
    this.viewport.setHeaderHeight(headerHeight)
  }

  setScroll(logicalX: number, logicalY: number): void {
    this.viewport.setScroll(logicalX, logicalY)
  }

  setRowHeight(rowIndex: number, height: number): void {
    this.rawRowsAxis.setSize(rowIndex, height)
    this.rebuildViewAxis()
  }

  setColumnWidth(fieldId: string, width: number): void {
    const index = this.getColumnIndex(fieldId)
    if (index < 0) return
    this.colsAxis.setSize(index, width)
  }

  selectCell(cell: CellAddress, options?: SelectCellOptions): void {
    this.selection.selectCell(cell, options)
  }

  clearSelection(): void {
    this.cancelCellEdit()
    this.selection.clear()
  }

  beginCellEdit(cell: CellAddress): boolean {
    const field = this.fieldAt(cell.colIndex)
    if (!field || !isEditableFieldType(field.type)) return false
    if (!isMutableDataSource(this.data)) return false

    const value = this.data.getCell(cell.rowIndex, field.id)
    this.cellEdit.begin(cell, field.id, field.type, formatCellForEdit(value, field.type))
    return true
  }

  updateCellEditDraft(draft: string): void {
    this.cellEdit.setDraft(draft)
  }

  cancelCellEdit(): void {
    this.cellEdit.clear()
  }

  commitCellEdit(): boolean {
    const session = this.cellEdit.getSession()
    if (!session) return false
    if (!isMutableDataSource(this.data)) return false

    const parsed = parseCellEditInput(session.draft, session.fieldType)
    if (parsed === undefined) return false

    const before = this.data.getCell(session.cell.rowIndex, session.fieldId) ?? null
    const underlyingRow = resolveUnderlyingRow(this.data, session.cell.rowIndex)
    this.data.updateCell(session.cell.rowIndex, session.fieldId, parsed)
    this.undoStack.push({
      kind: 'editCell',
      rowIndex: underlyingRow,
      fieldId: session.fieldId,
      before,
      after: parsed,
    })
    this.cellEdit.clear()
    return true
  }

  isCellEditing(): boolean {
    return this.cellEdit.isEditing()
  }

  clearRange(range: CellRange): void {
    if (!isMutableDataSource(this.data)) return
    const fields = this.data.getSchema().fields
    const before: { rowIndex: number; fieldId: string; value: CellValue }[] = []
    for (let r = range.startRow; r <= range.endRow; r++) {
      for (let c = range.startCol; c <= range.endCol; c++) {
        const field = fields[c]
        if (!field) continue
        const v = this.data.getCell(r, field.id)
        if (v === null || v === undefined) continue
        before.push({ rowIndex: resolveUnderlyingRow(this.data, r), fieldId: field.id, value: v })
        this.data.updateCell(r, field.id, null)
      }
    }
    if (before.length > 0) {
      this.undoStack.push({ kind: 'clearRange', range, before })
    }
  }

  navigateSelection(key: string, shiftKey: boolean): boolean {
    const intent = parseSelectionNavigationKey(key, shiftKey)
    if (!intent) return false

    const rowCount = this.data.getRowCount()
    const colCount = this.data.getSchema().fields.length
    if (rowCount <= 0 || colCount <= 0) return true

    this.selection.navigate(intent, { rowCount, colCount })
    return true
  }

  getFrame(): RenderFrame {
    const vpSnap = this.viewport.snapshot()
    const allGaps = this.hideRowsLayer.getCollapsedGaps()
    const [firstVisible, lastVisible] = this.rowsAxis.getVisibleRange(
      vpSnap.scrollY,
      vpSnap.scrollY + vpSnap.contentRect.height,
    )
    const collapsedRowGaps = allGaps
      .filter((g) => g.atViewRow >= firstVisible && g.atViewRow <= lastVisible)
      .map((g) => ({
        ...g,
        yPx: this.rowsAxis.indexToPosition(g.atViewRow + 1) - vpSnap.scrollY,
      }))
    return {
      data: this.data,
      theme: this.theme,
      rowsAxis: this.rowsAxis,
      colsAxis: this.colsAxis,
      viewport: vpSnap,
      selection: this.selection.getSelection(),
      cellEdit: this.cellEdit.getSession() ?? undefined,
      collapsedRowGaps,
    }
  }

  getSelection(): GridSelection {
    return this.selection.getSelection()
  }

  getRowsTotalSize(): number {
    return this.rowsAxis.getTotalSize()
  }

  getColsTotalSize(): number {
    return this.colsAxis.getTotalSize()
  }

  getColumnIndex(fieldId: string): number {
    return this.data.getSchema().fields.findIndex((f) => f.id === fieldId)
  }

  getTheme(): Theme {
    return this.theme
  }

  getRowsAxis(): ChunkedAxis {
    return this.rowsAxis
  }

  getColsAxis(): ChunkedAxis {
    return this.colsAxis
  }

  getViewport(): Viewport {
    return this.viewport
  }

  getData(): DataSource {
    return this.data
  }

  /** 返回视图数据源（HideRowsLayer 包裹后）。测试 / 外部代码通过此方法读取行数与单元格值。 */
  getDataSource(): DataSource {
    return this.data
  }

  /** 当前行高（单行）。rowIndex 为 underlying raw 索引，委托给 rawRowsAxis.getSize。 */
  getRowHeight(rowIndex: number): number {
    return this.rawRowsAxis.getSize(rowIndex)
  }

  /** 主题默认行高（或 options.defaultRowHeight 覆盖值）。 */
  getDefaultRowHeight(): number {
    return this.resolveDefaultRowHeight()
  }

  /** 返回当前隐藏行的 underlying row id 升序数组。 */
  getHiddenRows(): readonly number[] {
    return Array.from(this.hideRowsLayer.getHiddenUnderlyingRows()).sort((a, b) => a - b)
  }

  /**
   * 在 beforeUnderlyingRow 位置前插入 count 空白行。
   * 触发 UndoStack 并将新行 id 返回。
   */
  insertRows(beforeUnderlyingRow: number, count: number): readonly number[] {
    if (!isMutableDataSource(this.rawData) || !this.rawData.insertRows) return []
    const selectionBefore = this.selection.getSelection()
    const newIds = this.rawData.insertRows(beforeUnderlyingRow, count)
    this.rawRowsAxis.insertRange(beforeUnderlyingRow, count, this.resolveDefaultRowHeight())
    this.rebuildViewAxis()
    this.selection.remapAfterRowsInserted(beforeUnderlyingRow, count)
    const selectionAfter = this.selection.getSelection()
    this.undoStack.push({ kind: 'insertRows', at: beforeUnderlyingRow, count, newIds, selectionBefore, selectionAfter })
    return newIds
  }

  /**
   * 删除给定 underlying row id 集合（调用方保证升序、去重）。
   * 返回被删行快照，供上层 UI 反馈。
   */
  deleteRows(underlyingRowIds: readonly number[]): void {
    if (!isMutableDataSource(this.rawData) || !this.rawData.deleteRows) return
    const selectionBefore = this.selection.getSelection()
    // 捕获删前高度，需在 axis 更新之前读取
    const deletedHeights = underlyingRowIds.map((id) => this.rawRowsAxis.getSize(id))
    const snapshots = this.rawData.deleteRows(underlyingRowIds)
    this.rawRowsAxis.deleteRange(underlyingRowIds)
    this.rebuildViewAxis()
    this.selection.remapAfterRowsDeleted(underlyingRowIds)
    const selectionAfter = this.selection.getSelection()
    this.undoStack.push({ kind: 'deleteRows', snapshots, deletedHeights, selectionBefore, selectionAfter })
  }

  /**
   * 隐藏给定 underlying row id 集合（幂等：已隐藏的行不重复计入命令）。
   */
  hideRows(underlyingRowIds: readonly number[]): void {
    const already = this.hideRowsLayer.getHiddenUnderlyingRows()
    const newlyHidden = underlyingRowIds.filter((id) => !already.has(id))
    if (newlyHidden.length === 0) return
    const selectionBefore = this.selection.getSelection()
    this.hideRowsLayer.addHidden(newlyHidden)
    this.rebuildViewAxis()
    const selectionAfter = this.selection.getSelection()
    this.undoStack.push({ kind: 'hideRows', underlyingRowIds: newlyHidden, selectionBefore, selectionAfter })
  }

  /**
   * 取消隐藏给定 underlying row id 集合（幂等：未隐藏的行不重复计入命令）。
   */
  unhideRows(underlyingRowIds: readonly number[]): void {
    const already = this.hideRowsLayer.getHiddenUnderlyingRows()
    const newlyVisible = underlyingRowIds.filter((id) => already.has(id))
    if (newlyVisible.length === 0) return
    const selectionBefore = this.selection.getSelection()
    this.hideRowsLayer.removeHidden(newlyVisible)
    this.rebuildViewAxis()
    const selectionAfter = this.selection.getSelection()
    this.undoStack.push({ kind: 'unhideRows', underlyingRowIds: newlyVisible, selectionBefore, selectionAfter })
  }

  /**
   * 批量设置多行高度为同一个值 h。
   */
  setRowHeights(rowIds: readonly number[], h: number): void {
    const selectionBefore = this.selection.getSelection()
    const oldHeights = rowIds.map((id) => this.rawRowsAxis.getSize(id))
    for (const id of rowIds) this.rawRowsAxis.setSize(id, h)
    this.rebuildViewAxis()
    const selectionAfter = this.selection.getSelection()
    this.undoStack.push({ kind: 'resizeRowsMulti', rowIds, oldHeights, newHeight: h, selectionBefore, selectionAfter })
  }

  /** Phase 4.5 — 程序化设置选区（不入 undo 栈）。 */
  setSelection(selection: GridSelection): void {
    this.selection.setSelection(selection)
  }

  undo(): UndoCommand | undefined {
    const cmd = this.undoStack.popUndo()
    if (!cmd) return undefined
    this.applyUndo(cmd)
    return cmd
  }

  redo(): UndoCommand | undefined {
    const cmd = this.undoStack.popRedo()
    if (!cmd) return undefined
    this.applyRedo(cmd)
    return cmd
  }

  canUndo(): boolean {
    return this.undoStack.canUndo()
  }

  canRedo(): boolean {
    return this.undoStack.canRedo()
  }

  commitRowResize(rowIndex: number, oldHeight: number, newHeight: number): void {
    if (oldHeight === newHeight) return
    this.rawRowsAxis.setSize(rowIndex, newHeight)
    this.rebuildViewAxis()
    this.undoStack.push({ kind: 'resizeRow', rowIndex, before: oldHeight, after: newHeight })
  }

  commitColumnResize(colIndex: number, oldWidth: number, newWidth: number): void {
    if (oldWidth === newWidth) return
    this.colsAxis.setSize(colIndex, newWidth)
    this.undoStack.push({ kind: 'resizeColumn', colIndex, before: oldWidth, after: newWidth })
  }

  commitPaste(
    source: ApplyPasteSource,
    target: PasteTargetRect,
    fieldIdsAtCols: readonly string[],
    onSkipped?: (cells: readonly PasteSkippedCell[]) => void,
  ): void {
    if (!isMutableDataSource(this.data)) return
    const before: CellWrite[] = []
    const after: CellWrite[] = []
    applyPaste(
      source,
      target,
      this.data.getSchema(),
      fieldIdsAtCols,
      this.data,
      onSkipped,
      (rec: PasteWriteRecord) => {
        const underlyingRow = resolveUnderlyingRow(this.data, rec.rowIndex)
        before.push({ rowIndex: underlyingRow, fieldId: rec.fieldId, value: rec.before })
        after.push({ rowIndex: underlyingRow, fieldId: rec.fieldId, value: rec.after })
      },
    )
    if (after.length === 0) return
    const range: CellRange = {
      startRow: target.startRow,
      endRow: target.endRow,
      startCol: target.startCol,
      endCol: target.endCol,
    }
    this.undoStack.push({ kind: 'paste', target: range, before, after })
  }

  commitFill(
    source: CellRange,
    fill: CellRange,
    direction: FillDirection,
  ): FillCommitResult | null {
    if (!isMutableDataSource(this.data)) return null
    const viewWrites = computeFillWrites({ data: this.data, source, fill, direction })
    const resultWrites: CellWrite[] = viewWrites.map((w) => ({
      rowIndex: w.rowIndex,
      fieldId: w.fieldId,
      value: w.value,
    }))
    const after: CellWrite[] = viewWrites.map((w) => ({
      rowIndex: resolveUnderlyingRow(this.data, w.rowIndex),
      fieldId: w.fieldId,
      value: w.value,
    }))
    if (after.length === 0) return null

    const before: CellWrite[] = viewWrites.map((w) => ({
      rowIndex: resolveUnderlyingRow(this.data, w.rowIndex),
      fieldId: w.fieldId,
      value: this.data.getCell(w.rowIndex, w.fieldId) ?? null,
    }))
    for (const w of viewWrites) this.data.updateCell(w.rowIndex, w.fieldId, w.value)

    const result = unionRange(source, fill)
    this.undoStack.push({ kind: 'fill', source, fill, result, before, after })
    this.selection.setSelectedRange(result)
    return { source, fill, result, writes: resultWrites }
  }

  private applyUndo(cmd: UndoCommand): void {
    switch (cmd.kind) {
      case 'editCell':
        this.applyEditCellWrite(cmd.rowIndex, cmd.fieldId, cmd.before)
        this.restoreSelectionForEdit(cmd.rowIndex, cmd.fieldId)
        return
      case 'clearRange':
        for (const w of cmd.before) this.applyEditCellWrite(w.rowIndex, w.fieldId, w.value)
        this.restoreSelectionForWrites(cmd.before, cmd.range)
        return
      case 'paste':
        for (const w of cmd.before) this.applyEditCellWrite(w.rowIndex, w.fieldId, w.value)
        this.restoreSelectionForWrites(cmd.before, cmd.target)
        return
      case 'fill':
        for (const w of cmd.before) this.applyEditCellWrite(w.rowIndex, w.fieldId, w.value)
        this.restoreSelectionForWrites(cmd.before, cmd.source)
        return
      case 'resizeRow':
        this.rawRowsAxis.setSize(cmd.rowIndex, cmd.before)
        this.rebuildViewAxis()
        return
      case 'resizeColumn':
        this.colsAxis.setSize(cmd.colIndex, cmd.before)
        return
      case 'insertRows': {
        // unapply insertRows = delete the count rows that were inserted at cmd.at
        if (!isMutableDataSource(this.rawData) || !this.rawData.deleteRows) return
        const idsToRemove = Array.from({ length: cmd.count }, (_, i) => cmd.at + i)
        this.rawData.deleteRows(idsToRemove)
        this.rawRowsAxis.deleteRange(idsToRemove)
        this.rebuildViewAxis()
        this.selection.setSelection(cmd.selectionBefore)
        return
      }
      case 'deleteRows': {
        // unapply deleteRows = re-insert rows at their original positions and restore cells
        if (!isMutableDataSource(this.rawData) || !this.rawData.insertRows) return
        // Re-insert in reverse snapshot order so earlier indices stay valid
        const sorted = [...cmd.snapshots].sort((a, b) => a.originalUnderlyingRow - b.originalUnderlyingRow)
        for (let i = sorted.length - 1; i >= 0; i -= 1) {
          const snap = sorted[i]!
          this.rawData.insertRows(snap.originalUnderlyingRow, 1)
          this.rawRowsAxis.insertRange(snap.originalUnderlyingRow, 1, cmd.deletedHeights[i] ?? this.resolveDefaultRowHeight())
          // restore cells
          const fields = this.rawData.getSchema().fields
          for (const field of fields) {
            const val = snap.cells[field.id]
            if (val !== undefined) {
              if (this.rawData.updateCellByUnderlyingRow) {
                this.rawData.updateCellByUnderlyingRow(snap.originalUnderlyingRow, field.id, val)
              } else {
                this.rawData.updateCell(snap.originalUnderlyingRow, field.id, val)
              }
            }
          }
        }
        this.rebuildViewAxis()
        this.selection.setSelection(cmd.selectionBefore)
        return
      }
      case 'hideRows':
        // unapply hideRows = remove from hidden set
        this.hideRowsLayer.removeHidden(cmd.underlyingRowIds)
        this.rebuildViewAxis()
        this.selection.setSelection(cmd.selectionBefore)
        return
      case 'unhideRows':
        // unapply unhideRows = add back to hidden set
        this.hideRowsLayer.addHidden(cmd.underlyingRowIds)
        this.rebuildViewAxis()
        this.selection.setSelection(cmd.selectionBefore)
        return
      case 'resizeRowsMulti':
        // unapply = restore each row's old height
        for (let i = 0; i < cmd.rowIds.length; i += 1) {
          this.rawRowsAxis.setSize(cmd.rowIds[i]!, cmd.oldHeights[i] ?? this.resolveDefaultRowHeight())
        }
        this.rebuildViewAxis()
        this.selection.setSelection(cmd.selectionBefore)
        return
    }
  }

  private applyRedo(cmd: UndoCommand): void {
    switch (cmd.kind) {
      case 'editCell':
        this.applyEditCellWrite(cmd.rowIndex, cmd.fieldId, cmd.after)
        this.restoreSelectionForEdit(cmd.rowIndex, cmd.fieldId)
        return
      case 'clearRange':
        for (const w of cmd.before) this.applyEditCellWrite(w.rowIndex, w.fieldId, null)
        this.restoreSelectionForWrites(cmd.before, cmd.range)
        return
      case 'paste':
        for (const w of cmd.after) this.applyEditCellWrite(w.rowIndex, w.fieldId, w.value)
        this.restoreSelectionForWrites(cmd.after, cmd.target)
        return
      case 'fill':
        for (const w of cmd.after) this.applyEditCellWrite(w.rowIndex, w.fieldId, w.value)
        this.restoreSelectionForWrites(cmd.after, cmd.result)
        return
      case 'resizeRow':
        this.rawRowsAxis.setSize(cmd.rowIndex, cmd.after)
        this.rowsAxis = this.buildViewRowsAxis()
        return
      case 'resizeColumn':
        this.colsAxis.setSize(cmd.colIndex, cmd.after)
        return
      case 'insertRows': {
        // redo insertRows = insert count blank rows at cmd.at
        if (!isMutableDataSource(this.rawData) || !this.rawData.insertRows) return
        this.rawData.insertRows(cmd.at, cmd.count)
        this.rawRowsAxis.insertRange(cmd.at, cmd.count, this.resolveDefaultRowHeight())
        this.rowsAxis = this.buildViewRowsAxis()
        this.selection.setSelection(cmd.selectionAfter)
        return
      }
      case 'deleteRows': {
        // redo deleteRows = delete by original positions (ascending)
        if (!isMutableDataSource(this.rawData) || !this.rawData.deleteRows) return
        const ids = [...cmd.snapshots]
          .sort((a, b) => a.originalUnderlyingRow - b.originalUnderlyingRow)
          .map((s) => s.originalUnderlyingRow)
        this.rawData.deleteRows(ids)
        this.rawRowsAxis.deleteRange(ids)
        this.rowsAxis = this.buildViewRowsAxis()
        this.selection.setSelection(cmd.selectionAfter)
        return
      }
      case 'hideRows':
        this.hideRowsLayer.addHidden(cmd.underlyingRowIds)
        this.rowsAxis = this.buildViewRowsAxis()
        this.selection.setSelection(cmd.selectionAfter)
        return
      case 'unhideRows':
        this.hideRowsLayer.removeHidden(cmd.underlyingRowIds)
        this.rowsAxis = this.buildViewRowsAxis()
        this.selection.setSelection(cmd.selectionAfter)
        return
      case 'resizeRowsMulti':
        for (const id of cmd.rowIds) this.rawRowsAxis.setSize(id, cmd.newHeight)
        this.rowsAxis = this.buildViewRowsAxis()
        this.selection.setSelection(cmd.selectionAfter)
        return
    }
  }

  private restoreSelectionForWrites(writes: readonly CellWrite[], fallbackRange: CellRange): void {
    const visibleRows: number[] = []
    for (const write of writes) {
      const viewRow = findViewRow(this.data, write.rowIndex)
      if (viewRow !== -1) visibleRows.push(viewRow)
    }
    if (visibleRows.length === 0) return
    this.selection.setSelectedRange({
      startRow: Math.min(...visibleRows),
      endRow: Math.max(...visibleRows),
      startCol: fallbackRange.startCol,
      endCol: fallbackRange.endCol,
    })
  }

  private applyEditCellWrite(rowIndex: number, fieldId: string, value: CellValue): void {
    if (!isMutableDataSource(this.data)) return
    const viewRow = findViewRow(this.data, rowIndex)
    if (viewRow === -1 && this.data.updateCellByUnderlyingRow) {
      this.data.updateCellByUnderlyingRow(rowIndex, fieldId, value)
    } else if (viewRow !== -1) {
      this.data.updateCell(viewRow, fieldId, value)
    } else {
      this.data.updateCell(rowIndex, fieldId, value)
    }
  }

  private restoreSelectionForEdit(rowIndex: number, fieldId: string): void {
    const colIndex = this.getColumnIndex(fieldId)
    if (colIndex < 0) return
    const viewRow = findViewRow(this.data, rowIndex)
    if (viewRow === -1) return
    this.selection.selectCell({ rowIndex: viewRow, colIndex })
  }

  private finishActiveEdit(): void {
    if (!this.cellEdit.isEditing()) return
    if (!this.commitCellEdit()) this.cancelCellEdit()
  }

  private remapSelection(
    selection: GridSelection,
    oldResolveUnderlyingRow: (viewRow: number) => number,
  ): void {
    if (
      !selection.activeCell ||
      !selection.anchorCell ||
      !selection.extentCell ||
      !selection.selectedRange
    ) {
      this.selection.clear()
      return
    }

    const activeCell = this.remapCell(selection.activeCell, oldResolveUnderlyingRow)
    if (!activeCell) {
      this.selection.clear()
      return
    }

    if (isSingleCellRange(selection.selectedRange)) {
      this.selection.selectCell(activeCell)
      return
    }

    const anchorCell = this.remapCell(selection.anchorCell, oldResolveUnderlyingRow)
    const extentCell = this.remapCell(selection.extentCell, oldResolveUnderlyingRow)
    const remappedRows = this.remapSelectedRows(selection.selectedRange, oldResolveUnderlyingRow)

    if (
      anchorCell &&
      extentCell &&
      remappedRows &&
      areContiguousRows(remappedRows) &&
      selection.selectedRange.endRow - selection.selectedRange.startRow ===
        Math.max(...remappedRows) - Math.min(...remappedRows)
    ) {
      const range = {
        startRow: Math.min(...remappedRows),
        endRow: Math.max(...remappedRows),
        startCol: selection.selectedRange.startCol,
        endCol: selection.selectedRange.endCol,
      }
      this.selection.setSelection({
        activeCell,
        anchorCell: { rowIndex: range.startRow, colIndex: range.startCol },
        extentCell: { rowIndex: range.endRow, colIndex: range.endCol },
        selectedRange: range,
      })
      return
    }

    this.selection.selectCell(activeCell)
  }

  private remapCell(
    cell: CellAddress,
    oldResolveUnderlyingRow: (viewRow: number) => number,
  ): CellAddress | null {
    return this.remapRangeEndpoint(cell.rowIndex, cell.colIndex, oldResolveUnderlyingRow)
  }

  private remapRangeEndpoint(
    rowIndex: number,
    colIndex: number,
    oldResolveUnderlyingRow: (viewRow: number) => number,
  ): CellAddress | null {
    const underlyingRow = oldResolveUnderlyingRow(rowIndex)
    const viewRow = findViewRow(this.data, underlyingRow)
    if (viewRow === -1) return null
    return { rowIndex: viewRow, colIndex }
  }

  private remapSelectedRows(
    range: CellRange,
    oldResolveUnderlyingRow: (viewRow: number) => number,
  ): number[] | null {
    const rows: number[] = []
    for (let rowIndex = range.startRow; rowIndex <= range.endRow; rowIndex += 1) {
      const underlyingRow = oldResolveUnderlyingRow(rowIndex)
      const viewRow = findViewRow(this.data, underlyingRow)
      if (viewRow === -1) return null
      rows.push(viewRow)
    }
    return rows
  }

  private resolveDefaultRowHeight(): number {
    return this.explicitDefaultRowHeight ?? this.theme.metrics.rowHeight
  }

  /**
   * 从 rawRowsAxis 按视图行顺序（hideRowsLayer.getVisibleRows）构建视图行轴，
   * 并同步更新 frozen / viewport 以持有新 rowsAxis 的引用。
   * 在 hide/unhide/rebuildData/setRowHeight 等操作后调用以保持与 data 一致。
   */
  private buildViewRowsAxis(): ChunkedAxis {
    const visibleRows = this.hideRowsLayer.getVisibleRows()
    const defaultSize = this.resolveDefaultRowHeight()
    const viewAxis = new ChunkedAxis({ count: visibleRows.length, defaultSize })
    for (let viewRow = 0; viewRow < visibleRows.length; viewRow += 1) {
      const underlyingRow = visibleRows[viewRow]!
      const size = this.rawRowsAxis.getSize(underlyingRow)
      if (size !== defaultSize) viewAxis.setSize(viewRow, size)
    }
    return viewAxis
  }

  /**
   * 重建 viewRowsAxis 并同步 frozen / viewport 持有的引用。
   * 在 constructor / rebuildData 中不调用（彼时 frozen/viewport 尚未构建，由调用方自行处理）；
   * 在 hide/unhide/setRowHeight/insertRows/deleteRows 等 mutation 路径中使用。
   */
  private rebuildViewAxis(): void {
    this.rowsAxis = this.buildViewRowsAxis()
    const snap = this.viewport.snapshot()
    this.frozen = new FrozenRegions(this.rowsAxis, this.colsAxis, this.frozen.getFrozenConfig())
    this.viewport = new Viewport(this.rowsAxis, this.colsAxis, this.frozen)
    this.viewport.setHeaderHeight(snap.headerHeight)
    this.viewport.setRowHeaderWidth(snap.rowHeaderWidth)
    this.viewport.setSize(snap.contentRect.width, snap.contentRect.height)
    this.viewport.setScroll(snap.scrollX, snap.scrollY)
  }

  private resolveFrozenConfig(options: GridEngineOptions): FrozenConfig {
    if (options.frozen) {
      return {
        topRows: options.frozen.topRows ?? 0,
        leftCols: options.frozen.leftCols ?? 0,
        rightCols: options.frozen.rightCols ?? 0,
      }
    }
    return {
      topRows: options.frozenRows ?? 0,
      leftCols: options.frozenCols ?? 0,
      rightCols: 0,
    }
  }

  private averageColWidth(): number {
    const fields = this.data.getSchema().fields
    if (fields.length === 0) return 100
    const sum = fields.reduce((acc, f) => acc + f.width, 0)
    return Math.max(1, Math.round(sum / fields.length))
  }

  private applySheetChrome(): void {
    const gutter = this.excelHeaders
      ? Math.max(this.theme.metrics.rowHeaderWidth, DEFAULT_EXCEL_ROW_HEADER_WIDTH)
      : 0
    this.viewport.setRowHeaderWidth(gutter)
  }

  private fieldAt(colIndex: number) {
    return this.data.getSchema().fields[colIndex]
  }

  private applyFieldWidths(): void {
    const fields = this.data.getSchema().fields
    const avg = this.colsAxis.getDefaultSize()
    for (let i = 0; i < fields.length; i++) {
      if (fields[i]!.width !== avg) {
        this.colsAxis.setSize(i, fields[i]!.width)
      }
    }
  }
}

function isSingleCellRange(range: CellRange): boolean {
  return range.startRow === range.endRow && range.startCol === range.endCol
}

function areContiguousRows(rows: readonly number[]): boolean {
  const uniqueRows = new Set(rows)
  if (uniqueRows.size !== rows.length) return false
  const minRow = Math.min(...rows)
  const maxRow = Math.max(...rows)
  return maxRow - minRow + 1 === rows.length
}
