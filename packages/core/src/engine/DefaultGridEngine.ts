import type { CellValue } from '../data/Schema'
import type { DataSource } from '../data/DataSource'
import { isMutableDataSource } from '../data/MutableDataSource'
import {
  formatCellForEdit,
  isEditableFieldType,
  parseCellEditInput,
} from '../interaction/CellEdit'
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
import type { UndoCommand } from '../undo/UndoCommand'
import type { GridEngine, GridEngineOptions } from './GridEngine'

/**
 * `GridEngine` 默认实现。
 *
 * 管理 `ChunkedAxis`、`FrozenRegions`、`Viewport` 与 `DataSource` 绑定。
 * `setData` 会重建轴与 viewport（字段/行数变化时）；`getFrame()` 产出不可变快照供渲染。
 */
const DEFAULT_EXCEL_ROW_HEADER_WIDTH = 44

export class DefaultGridEngine implements GridEngine {
  private data: DataSource
  private theme: Theme
  private readonly excelHeaders: boolean
  private explicitDefaultRowHeight: number | undefined
  private rowsAxis: ChunkedAxis
  private colsAxis: ChunkedAxis
  private frozen: FrozenRegions
  private viewport: Viewport
  private selection = new SelectionModel()
  private cellEdit = new CellEditModel()
  private undoStack = new UndoStack()

  constructor(options: GridEngineOptions) {
    this.data = options.data
    this.theme = options.theme ?? denseGridTheme
    this.excelHeaders = options.excelHeaders === true
    this.explicitDefaultRowHeight = options.defaultRowHeight
    this.rowsAxis = new ChunkedAxis({
      count: this.data.getRowCount(),
      defaultSize: this.resolveDefaultRowHeight(),
    })
    this.colsAxis = new ChunkedAxis({
      count: this.data.getSchema().fields.length,
      defaultSize: this.averageColWidth(),
    })
    this.frozen = new FrozenRegions(
      this.rowsAxis,
      this.colsAxis,
      this.resolveFrozenConfig(options),
    )
    this.viewport = new Viewport(this.rowsAxis, this.colsAxis, this.frozen)
    this.viewport.setHeaderHeight(this.theme.metrics.headerHeight)
    this.applySheetChrome()
    this.applyFieldWidths()
  }

  setData(data: DataSource): void {
    this.data = data
    this.rowsAxis = new ChunkedAxis({
      count: this.data.getRowCount(),
      defaultSize: this.resolveDefaultRowHeight(),
    })
    this.colsAxis = new ChunkedAxis({
      count: this.data.getSchema().fields.length,
      defaultSize: this.averageColWidth(),
    })
    this.frozen = new FrozenRegions(
      this.rowsAxis,
      this.colsAxis,
      this.frozen.getFrozenConfig(),
    )
    this.viewport = new Viewport(this.rowsAxis, this.colsAxis, this.frozen)
    this.viewport.setHeaderHeight(this.theme.metrics.headerHeight)
    this.applySheetChrome()
    this.applyFieldWidths()
    this.undoStack.clear()
  }

  setTheme(theme: Theme): void {
    this.theme = theme
    this.viewport.setHeaderHeight(theme.metrics.headerHeight)
    this.applySheetChrome()
    if (this.explicitDefaultRowHeight === undefined) {
      this.rowsAxis.setDefaultSize(theme.metrics.rowHeight)
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
    this.rowsAxis.setSize(rowIndex, height)
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
    this.data.updateCell(session.cell.rowIndex, session.fieldId, parsed)
    this.undoStack.push({
      kind: 'editCell',
      rowIndex: session.cell.rowIndex,
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
        before.push({ rowIndex: r, fieldId: field.id, value: v })
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
    return {
      data: this.data,
      theme: this.theme,
      rowsAxis: this.rowsAxis,
      colsAxis: this.colsAxis,
      viewport: this.viewport.snapshot(),
      selection: this.selection.getSelection(),
      cellEdit: this.cellEdit.getSession() ?? undefined,
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
    this.rowsAxis.setSize(rowIndex, newHeight)
    this.undoStack.push({ kind: 'resizeRow', rowIndex, before: oldHeight, after: newHeight })
  }

  commitColumnResize(colIndex: number, oldWidth: number, newWidth: number): void {
    if (oldWidth === newWidth) return
    this.colsAxis.setSize(colIndex, newWidth)
    this.undoStack.push({ kind: 'resizeColumn', colIndex, before: oldWidth, after: newWidth })
  }

  private applyUndo(cmd: UndoCommand): void {
    switch (cmd.kind) {
      case 'editCell':
        this.applyEditCellWrite(cmd.rowIndex, cmd.fieldId, cmd.before)
        this.restoreSelectionForEdit(cmd.rowIndex, cmd.fieldId)
        return
      case 'clearRange':
        for (const w of cmd.before) this.applyEditCellWrite(w.rowIndex, w.fieldId, w.value)
        this.restoreSelectionForRange(cmd.range)
        return
      default:
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
        this.restoreSelectionForRange(cmd.range)
        return
      default:
        return
    }
  }

  private restoreSelectionForRange(range: CellRange): void {
    this.selection.setSelectedRange(range)
  }

  private applyEditCellWrite(rowIndex: number, fieldId: string, value: CellValue): void {
    if (!isMutableDataSource(this.data)) return
    this.data.updateCell(rowIndex, fieldId, value)
  }

  private restoreSelectionForEdit(rowIndex: number, fieldId: string): void {
    const colIndex = this.getColumnIndex(fieldId)
    if (colIndex < 0) return
    this.selection.selectCell({ rowIndex, colIndex })
  }

  private resolveDefaultRowHeight(): number {
    return this.explicitDefaultRowHeight ?? this.theme.metrics.rowHeight
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
