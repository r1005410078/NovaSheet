import type { CellValue, Field, Row, Schema } from '../data/Schema'
import type { DataSource, DataSourceEvent, DataSourceListener } from '../data/DataSource'
import { isMutableDataSource } from '../data/MutableDataSource'
import type { MutableDataSource, RemovedFieldSnapshot } from '../data/MutableDataSource'
import { HideRowsLayer } from '../view/HideRowsLayer'
import { applyPaste, pasteTargetConflictsWithMerges } from '../clipboard/ApplyPaste'
import type { ApplyPasteSource, PasteTargetRect, PasteWriteRecord } from '../clipboard/ApplyPaste'
import type { PasteSkippedCell } from '../clipboard/types'
import { computeFillWrites } from '../fill/FillSeries'
import type { FillDirection, FillMergeSnap } from '../fill/FillTarget'
import { unionRange } from '../geometry/range'
import { RangeStyleStore } from '../format/RangeStyleStore'
import type {
  BorderPreset,
  BorderStyle,
  CellFormat,
  FormatLayer,
  TextWrapMode,
} from '../format/CellFormat'
import { MergeStore } from '../merge/MergeStore'
import type { MergeRegion } from '../merge/MergeStore'
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
import type { RenderFrame, RenderFrameCollapsedColGap } from '../render/RenderFrame'
import { denseGridTheme } from '../theme/denseGridTheme'
import type { Theme } from '../theme/Theme'
import { UndoStack } from '../undo/UndoStack'
import type { CellWrite, UndoCommand } from '../undo/UndoCommand'
import { CoordinateSpace } from '../view/CoordinateSpace'
import type { RawRange } from '../view/coordinates'
import { AxisViewBuilder } from './AxisViewBuilder'
import { CollapsedColGapBuilder } from './CollapsedColGapBuilder'
import { FrameBuilder } from './FrameBuilder'
import { ViewportRebuilder } from './ViewportRebuilder'
import { VisibleFormatResolver } from './VisibleFormatResolver'
import { FillStylePropagator } from './FillStylePropagator'
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
  /** HideRowsLayer + 可见列过滤后的视图数据源；getFrame() / getDataSource() 等读取此字段。 */
  private data: DataSource
  private rowViewData: DataSource
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
  private rawColsAxis: ChunkedAxis
  private colsAxis: ChunkedAxis
  private hiddenColIds = new Set<string>()
  /** 行/列/区 raw↔view 翻译唯一入口；getter 读引擎活状态（data/rawData/hiddenColIds）。 */
  private readonly coords = new CoordinateSpace({
    getViewData: () => this.data,
    getRawSchema: () => this.rawData.getSchema(),
    isColHidden: (id) => this.hiddenColIds.has(id),
  })
  private newFieldCounter = 0
  private frozen: FrozenRegions
  private viewport: Viewport
  private selection = new SelectionModel()
  private cellEdit = new CellEditModel()
  private undoStack = new UndoStack()
  private readonly axisViewBuilder = new AxisViewBuilder()
  private readonly collapsedColGaps = new CollapsedColGapBuilder()
  private readonly frameBuilder = new FrameBuilder()
  private readonly viewportRebuilder = new ViewportRebuilder()
  /**
   * Phase 5-A — 稀疏格式存储，按 **raw** 坐标键控（Task 7 的结构变更按 raw 重映）。
   * mutation 入口先把 view range 翻译为 raw range 再写入；getFrame() 反向翻译回 view。
   */
  private readonly formatStore = new RangeStyleStore()
  /**
   * Phase 5-A — 合并区域存储，与 formatStore 同按 **raw** 坐标键控。
   * mergeCells/unmergeCells 先把 view range 翻译为 raw range 再写入；getFrame() 反向翻译回 view。
   */
  private readonly mergeStore = new MergeStore()
  /** 可见 format/merge → VIEW 帧字段的只读解析器（从 getFrame 抽出，R1）。 */
  private readonly frameFormat = new VisibleFormatResolver(
    this.formatStore,
    this.mergeStore,
    this.coords,
  )
  /** 填充柄「携带格式/合并」平铺逻辑（从 commitFill 抽出，R1）。 */
  private readonly fillStyles = new FillStylePropagator(
    this.formatStore,
    this.mergeStore,
    this.coords,
  )

  constructor(options: GridEngineOptions) {
    this.rawData = options.data
    this.theme = options.theme ?? denseGridTheme
    this.excelHeaders = options.excelHeaders === true
    this.explicitDefaultRowHeight = options.defaultRowHeight
    this.rowViewData = this.hideRowsLayer.wrap(this.rawData)
    this.data = this.wrapViewData(this.rowViewData)
    this.rawRowsAxis = new ChunkedAxis({
      count: this.rawData.getRowCount(),
      defaultSize: this.resolveDefaultRowHeight(),
    })
    this.rowsAxis = this.buildViewRowsAxis()
    this.rawColsAxis = new ChunkedAxis({
      count: this.rawData.getSchema().fields.length,
      defaultSize: this.averageColWidth(),
    })
    this.colsAxis = this.buildViewColsAxis()
    this.frozen = new FrozenRegions(this.rowsAxis, this.colsAxis, this.resolveFrozenConfig(options))
    this.viewport = new Viewport(this.rowsAxis, this.colsAxis, this.frozen)
    this.viewport.setHeaderHeight(this.theme.metrics.headerHeight)
    this.applySheetChrome()
    this.applyFieldWidths()
  }

  setData(data: DataSource): void {
    this.hideRowsLayer.setHidden([])
    this.hiddenColIds.clear()
    this.newFieldCounter = 0
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
    this.rowViewData = this.hideRowsLayer.wrap(this.rawData)
    this.data = this.wrapViewData(this.rowViewData)
    this.rawRowsAxis = new ChunkedAxis({
      count: this.rawData.getRowCount(),
      defaultSize: this.resolveDefaultRowHeight(),
    })
    this.rowsAxis = this.buildViewRowsAxis()
    this.rawColsAxis = new ChunkedAxis({
      count: this.rawData.getSchema().fields.length,
      defaultSize: this.averageColWidth(),
    })
    this.colsAxis = this.buildViewColsAxis()
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

  setFrozen(config: Partial<FrozenConfig>): void {
    this.frozen.setFrozen(config)
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
    const index = this.getRawColumnIndex(fieldId)
    if (index < 0) return
    this.rawColsAxis.setSize(index, width)
    this.setFieldWidth(fieldId, width)
    this.rebuildViewColsAxis()
  }

  selectCell(cell: CellAddress, options?: SelectCellOptions): void {
    if (!options?.extend) {
      const region = this.mergeStore.getRegionAt(cell.rowIndex, cell.colIndex)
      if (region) {
        this.selection.setSelectedRange(region.range)
        return
      }
    }
    this.selection.selectCell(cell, options)
  }

  clearSelection(): void {
    this.cancelCellEdit()
    this.selection.clear()
  }

  beginCellEdit(cell: CellAddress): boolean {
    const region = this.mergeStore.getRegionAt(cell.rowIndex, cell.colIndex)
    const editCell = region?.anchor ?? cell
    const field = this.fieldAt(editCell.colIndex)
    if (!field || !isEditableFieldType(field.type)) return false
    if (!isMutableDataSource(this.data)) return false

    const value = this.data.getCell(editCell.rowIndex, field.id)
    this.cellEdit.begin(editCell, field.id, field.type, formatCellForEdit(value, field.type))
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
    const underlyingRow = this.coords.viewRowToRaw(session.cell.rowIndex)
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

  setCellValue(cell: CellAddress, value: CellValue): boolean {
    if (!isMutableDataSource(this.data)) return false
    if (cell.rowIndex < 0 || cell.rowIndex >= this.data.getRowCount()) return false

    const field = this.fieldAt(cell.colIndex)
    if (!field) return false

    const before = this.data.getCell(cell.rowIndex, field.id) ?? null
    const underlyingRow = this.coords.viewRowToRaw(cell.rowIndex)
    this.data.updateCell(cell.rowIndex, field.id, value)
    this.undoStack.push({
      kind: 'editCell',
      rowIndex: underlyingRow,
      fieldId: field.id,
      before,
      after: value,
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
        before.push({ rowIndex: this.coords.viewRowToRaw(r), fieldId: field.id, value: v })
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
    return this.frameBuilder.build({
      data: this.data,
      theme: this.theme,
      rowsAxis: this.rowsAxis,
      colsAxis: this.colsAxis,
      viewport: this.viewport.snapshot(),
      selection: this.selection.getSelection(),
      cellEdit: this.cellEdit.getSession() ?? undefined,
      collapsedRowGaps: this.hideRowsLayer.getCollapsedGaps(),
      collapsedColGaps: this.computeCollapsedColGaps(),
      formatResolver: this.frameFormat,
    })
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
    const formatBefore = this.formatStore.snapshot()
    const mergeBefore = this.mergeStore.snapshot()
    const newIds = this.rawData.insertRows(beforeUnderlyingRow, count)
    this.rawRowsAxis.insertRange(beforeUnderlyingRow, count, this.resolveDefaultRowHeight())
    this.rebuildViewAxis()
    this.formatStore.remapAfterRowsInserted(beforeUnderlyingRow, count)
    this.mergeStore.remapAfterRowsInserted(beforeUnderlyingRow, count)
    this.selection.remapAfterRowsInserted(beforeUnderlyingRow, count)
    const selectionAfter = this.selection.getSelection()
    this.undoStack.push({
      kind: 'insertRows',
      at: beforeUnderlyingRow,
      count,
      newIds,
      selectionBefore,
      selectionAfter,
      formatBefore,
      formatAfter: this.formatStore.snapshot(),
      mergeBefore,
      mergeAfter: this.mergeStore.snapshot(),
    })
    return newIds
  }

  /**
   * 删除给定 underlying row id 集合（调用方保证升序、去重）。
   * 返回被删行快照，供上层 UI 反馈。
   */
  deleteRows(underlyingRowIds: readonly number[]): void {
    if (!isMutableDataSource(this.rawData) || !this.rawData.deleteRows) return
    const selectionBefore = this.selection.getSelection()
    const formatBefore = this.formatStore.snapshot()
    const mergeBefore = this.mergeStore.snapshot()
    // 捕获删前高度，需在 axis 更新之前读取
    const deletedHeights = underlyingRowIds.map((id) => this.rawRowsAxis.getSize(id))
    const snapshots = this.rawData.deleteRows(underlyingRowIds)
    this.rawRowsAxis.deleteRange(underlyingRowIds)
    this.rebuildViewAxis()
    const removedRowsSorted = [...underlyingRowIds].sort((a, b) => a - b)
    this.formatStore.remapAfterRowsDeleted(removedRowsSorted)
    this.mergeStore.remapAfterRowsDeleted(removedRowsSorted)
    this.selection.remapAfterRowsDeleted(underlyingRowIds)
    const selectionAfter = this.selection.getSelection()
    this.undoStack.push({
      kind: 'deleteRows',
      snapshots,
      deletedHeights,
      selectionBefore,
      selectionAfter,
      formatBefore,
      formatAfter: this.formatStore.snapshot(),
      mergeBefore,
      mergeAfter: this.mergeStore.snapshot(),
    })
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
    this.undoStack.push({
      kind: 'hideRows',
      underlyingRowIds: newlyHidden,
      selectionBefore,
      selectionAfter,
    })
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
    this.undoStack.push({
      kind: 'unhideRows',
      underlyingRowIds: newlyVisible,
      selectionBefore,
      selectionAfter,
    })
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
    this.undoStack.push({
      kind: 'resizeRowsMulti',
      rowIds,
      oldHeights,
      newHeight: h,
      selectionBefore,
      selectionAfter,
    })
  }

  /** 移动连续行组；当前仅支持 raw/view 行一一对应的连续 block。 */
  moveRows(rowIds: readonly number[], beforeRowId: number | null): boolean {
    if (!isMutableDataSource(this.rawData) || !this.rawData.moveRows) return false
    if (this.data.getRowCount() !== this.rawData.getRowCount()) return false
    const normalized = this.normalizeMoveRows(rowIds, beforeRowId)
    if (!normalized) return false

    this.finishActiveEdit()
    const selectionBefore = this.selection.getSelection()
    const formatBefore = this.formatStore.snapshot()
    const mergeBefore = this.mergeStore.snapshot()
    const sizesBefore = this.captureRawRowHeights()
    this.rawData.moveRows(normalized.rowIds, normalized.beforeRowId)
    this.rebuildRawRowsAxisFromHeights(reorderByIndexMap(sizesBefore, normalized.indexMap))
    this.remapHiddenRowsByIndexMap(normalized.indexMap)
    this.formatStore.remapByRowIndexMap(normalized.indexMap)
    this.mergeStore.remapByRowIndexMap(normalized.indexMap)
    this.rebuildViewAxis()
    this.restoreSelectionByRowIndexMap(selectionBefore, normalized.indexMap)
    const selectionAfter = this.selection.getSelection()
    this.undoStack.push({
      kind: 'moveRows',
      rowIds: normalized.rowIds,
      beforeRowId: normalized.beforeRowId,
      inverseRowIds: normalized.inverseRowIds,
      inverseBeforeRowId: normalized.inverseBeforeRowId,
      selectionBefore,
      selectionAfter,
      formatBefore,
      formatAfter: this.formatStore.snapshot(),
      mergeBefore,
      mergeAfter: this.mergeStore.snapshot(),
    })
    return true
  }

  /** 在 schema field index 位置前插入 count 个文本列。 */
  insertCols(beforeFieldIndex: number, count: number): readonly Field[] {
    if (count <= 0 || !isMutableDataSource(this.rawData) || !this.rawData.insertField) return []
    const at = Math.max(0, Math.min(beforeFieldIndex, this.rawData.getSchema().fields.length))
    const selectionBefore = this.selection.getSelection()
    const formatBefore = this.formatStore.snapshot()
    const mergeBefore = this.mergeStore.snapshot()
    const frozenBefore = this.frozen.getFrozenConfig()
    const defaultWidth = this.resolveDefaultColWidth()
    const newFields: Field[] = []
    for (let i = 0; i < count; i += 1) {
      this.newFieldCounter += 1
      newFields.push({
        id: `field_${this.newFieldCounter}`,
        name: `新列 ${this.newFieldCounter}`,
        type: 'text',
        width: defaultWidth,
      })
    }
    for (let i = 0; i < newFields.length; i += 1) {
      this.rawData.insertField(at + i, newFields[i]!)
    }
    this.rawColsAxis.insertRange(at, newFields.length, defaultWidth)
    this.syncFrozenAfterColInsert(at, newFields.length)
    this.rebuildViewColsAxis()
    this.formatStore.remapAfterColsInserted(at, newFields.length)
    this.mergeStore.remapAfterColsInserted(at, newFields.length)
    this.selection.remapAfterColsInserted(at, newFields.length)
    const selectionAfter = this.selection.getSelection()
    const frozenAfter = this.frozen.getFrozenConfig()
    this.undoStack.push({
      kind: 'insertCols',
      at,
      count: newFields.length,
      newFields,
      selectionBefore,
      selectionAfter,
      frozenBefore,
      frozenAfter,
      formatBefore,
      formatAfter: this.formatStore.snapshot(),
      mergeBefore,
      mergeAfter: this.mergeStore.snapshot(),
    })
    return newFields
  }

  /** 按 fieldId 删除列，返回删除快照。 */
  deleteCols(fieldIds: readonly string[]): readonly RemovedFieldSnapshot[] {
    if (!isMutableDataSource(this.rawData) || !this.rawData.removeField) return []
    const schemaBefore = this.rawData.getSchema().fields
    const removed = fieldIds
      .map((id) => {
        const idx = schemaBefore.findIndex((field) => field.id === id)
        return idx >= 0 ? { id, idx, width: this.rawColsAxis.getSize(idx) } : null
      })
      .filter((item): item is { id: string; idx: number; width: number } => item !== null)
      .sort((a, b) => a.idx - b.idx)
    if (removed.length === 0) return []

    const selectionBefore = this.selection.getSelection()
    const formatBefore = this.formatStore.snapshot()
    const mergeBefore = this.mergeStore.snapshot()
    const frozenBefore = this.frozen.getFrozenConfig()
    const snapshots: RemovedFieldSnapshot[] = []
    const deletedWidths: number[] = []
    for (let i = removed.length - 1; i >= 0; i -= 1) {
      const item = removed[i]!
      const snap = this.rawData.removeField(item.id)
      if (snap) {
        snapshots.unshift(snap)
        deletedWidths.unshift(item.width)
      }
    }
    const removedIndices = removed.map((item) => item.idx)
    this.rawColsAxis.deleteRange(removedIndices)
    this.syncFrozenAfterColDelete(removedIndices, schemaBefore.length)
    for (const id of fieldIds) this.hiddenColIds.delete(id)
    this.rebuildViewColsAxis()
    this.formatStore.remapAfterColsDeleted(removedIndices)
    this.mergeStore.remapAfterColsDeleted(removedIndices)
    this.selection.remapAfterColsDeleted(removedIndices)
    const selectionAfter = this.selection.getSelection()
    const frozenAfter = this.frozen.getFrozenConfig()
    this.undoStack.push({
      kind: 'deleteCols',
      snapshots,
      deletedWidths,
      selectionBefore,
      selectionAfter,
      frozenBefore,
      frozenAfter,
      formatBefore,
      formatAfter: this.formatStore.snapshot(),
      mergeBefore,
      mergeAfter: this.mergeStore.snapshot(),
    })
    return snapshots
  }

  /** 隐藏给定 fieldId 集合。 */
  hideCols(fieldIds: readonly string[]): void {
    const known = new Set(this.rawData.getSchema().fields.map((field) => field.id))
    const newlyHidden = fieldIds.filter((id) => known.has(id) && !this.hiddenColIds.has(id))
    if (newlyHidden.length === 0) return
    const selectionBefore = this.selection.getSelection()
    for (const id of newlyHidden) this.hiddenColIds.add(id)
    this.rebuildViewColsAxis()
    const selectionAfter = this.selection.getSelection()
    this.undoStack.push({
      kind: 'hideCols',
      fieldIds: newlyHidden,
      selectionBefore,
      selectionAfter,
    })
  }

  /** 取消隐藏给定 fieldId 集合。 */
  unhideCols(fieldIds: readonly string[]): void {
    const newlyVisible = fieldIds.filter((id) => this.hiddenColIds.has(id))
    if (newlyVisible.length === 0) return
    const selectionBefore = this.selection.getSelection()
    for (const id of newlyVisible) this.hiddenColIds.delete(id)
    this.rebuildViewColsAxis()
    const selectionAfter = this.selection.getSelection()
    this.undoStack.push({
      kind: 'unhideCols',
      fieldIds: newlyVisible,
      selectionBefore,
      selectionAfter,
    })
  }

  /** 批量设置多列宽度为同一个值。 */
  setColumnWidths(fieldIds: readonly string[], widthPx: number): void {
    const selectionBefore = this.selection.getSelection()
    const oldWidths: number[] = []
    const changed: string[] = []
    for (const id of fieldIds) {
      const idx = this.getRawColumnIndex(id)
      if (idx < 0) continue
      oldWidths.push(this.rawColsAxis.getSize(idx))
      changed.push(id)
      this.rawColsAxis.setSize(idx, widthPx)
      this.setFieldWidth(id, widthPx)
    }
    if (changed.length === 0) return
    this.rebuildViewColsAxis()
    const selectionAfter = this.selection.getSelection()
    this.undoStack.push({
      kind: 'resizeColumnsMulti',
      fieldIds: changed,
      oldWidths,
      newWidth: widthPx,
      selectionBefore,
      selectionAfter,
    })
  }

  /** 返回当前隐藏列 fieldId，按 schema 顺序排序。 */
  getHiddenCols(): readonly string[] {
    return this.rawData
      .getSchema()
      .fields.map((field) => field.id)
      .filter((id) => this.hiddenColIds.has(id))
  }

  /** 返回当前冻结配置快照。 */
  getFrozenConfig(): FrozenConfig {
    return this.frozen.getFrozenConfig()
  }

  /** 按 fieldId 移动列组；cell 值、hidden 状态与列宽都按 fieldId 锚定。 */
  moveCols(fieldIds: readonly string[], beforeFieldId: string | null): boolean {
    if (!isMutableDataSource(this.rawData) || !this.rawData.moveFields) return false
    const normalized = this.normalizeMoveCols(fieldIds, beforeFieldId)
    if (!normalized) return false

    this.finishActiveEdit()
    const selectionBefore = this.selection.getSelection()
    const formatBefore = this.formatStore.snapshot()
    const mergeBefore = this.mergeStore.snapshot()
    const visibleFieldIdsBefore = this.data.getSchema().fields.map((field) => field.id)
    // Trap 1：moveCols 走 fieldId 路径，normalizeMoveCols 不产出数值 index map。
    // 在 moveFields 前后各取 raw 字段序，按 fieldId 配对出 oldRawIndex → newRawIndex。
    const rawFieldIdsBefore = this.rawData.getSchema().fields.map((field) => field.id)
    const widthById = this.captureRawColWidths()
    this.rawData.moveFields(normalized.fieldIds, normalized.beforeFieldId)
    const colIndexMap = this.buildColIndexMap(rawFieldIdsBefore)
    this.formatStore.remapByColIndexMap(colIndexMap)
    this.mergeStore.remapByColIndexMap(colIndexMap)
    this.rebuildRawColsAxisFromWidths(widthById)
    this.rebuildViewColsAxis()
    this.restoreSelectionByVisibleFieldIds(selectionBefore, visibleFieldIdsBefore)
    const selectionAfter = this.selection.getSelection()
    this.undoStack.push({
      kind: 'moveCols',
      fieldIds: normalized.fieldIds,
      beforeFieldId: normalized.beforeFieldId,
      inverseBeforeFieldId: normalized.inverseBeforeFieldId,
      selectionBefore,
      selectionAfter,
      formatBefore,
      formatAfter: this.formatStore.snapshot(),
      mergeBefore,
      mergeAfter: this.mergeStore.snapshot(),
    })
    return true
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
    const rawColIndex = this.getRawColumnIndexForViewIndex(colIndex)
    if (rawColIndex < 0) return
    this.rawColsAxis.setSize(rawColIndex, newWidth)
    const field = this.rawData.getSchema().fields[rawColIndex]
    if (field) field.width = newWidth
    this.rebuildViewColsAxis()
    this.undoStack.push({
      kind: 'resizeColumn',
      colIndex: rawColIndex,
      before: oldWidth,
      after: newWidth,
    })
  }

  commitPaste(
    source: ApplyPasteSource,
    target: PasteTargetRect,
    fieldIdsAtCols: readonly string[],
    onSkipped?: (cells: readonly PasteSkippedCell[]) => void,
  ): void {
    if (!isMutableDataSource(this.data)) return

    // 合并守卫：target 是 view 矩形、mergeStore 存 raw 区域，须在同一空间比较。
    // 先把 view target 翻译为 raw（viewRangeToRawRange）；非连续映射（排序/筛选打乱）
    // 时保守视为冲突，避免在 raw 空间漏判。冲突则跳过整次粘贴：不写值、不入栈。
    const rawTarget = this.viewRangeToRawRange({
      startRow: target.startRow,
      endRow: target.endRow,
      startCol: target.startCol,
      endCol: target.endCol,
    })
    const conflictsWithMerges =
      rawTarget === null ||
      pasteTargetConflictsWithMerges(
        { ...rawTarget, tile: target.tile },
        this.mergeStore.snapshot(),
      )
    if (conflictsWithMerges) {
      const topLeftFieldId = fieldIdsAtCols[target.startCol]
      if (topLeftFieldId !== undefined) {
        onSkipped?.([{ rowIndex: target.startRow, fieldId: topLeftFieldId, reason: 'merge' }])
      }
      return
    }

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
        const underlyingRow = this.coords.viewRowToRaw(rec.rowIndex)
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
      rowIndex: this.coords.viewRowToRaw(w.rowIndex),
      fieldId: w.fieldId,
      value: w.value,
    }))
    if (after.length === 0) return null

    const before: CellWrite[] = viewWrites.map((w) => ({
      rowIndex: this.coords.viewRowToRaw(w.rowIndex),
      fieldId: w.fieldId,
      value: this.data.getCell(w.rowIndex, w.fieldId) ?? null,
    }))
    for (const w of viewWrites) this.data.updateCell(w.rowIndex, w.fieldId, w.value)

    // Phase 5-A fill：把源选区的填充色/边框/合并按填充轴平铺到目标区。
    // 非连续 raw 映射（排序/筛选散裂）时保守跳过，仅保留值填充。
    const styles = this.fillStyles.propagateFillStyles(source, fill, direction)

    const result = unionRange(source, fill)
    this.undoStack.push({ kind: 'fill', source, fill, result, before, after, ...styles })
    this.selection.setSelectedRange(result)
    return { source, fill, result, writes: resultWrites }
  }

  /**
   * Phase 5-A — 返回 view `source` 的合并块吸附尺寸。source 含合并时返回其 raw 跨度，
   * 否则（无合并或映射非连续）返回 `{ rowSpan: 1, colSpan: 1 }`，让填充柄不吸附。
   */
  getFillMergeSnap(source: CellRange): FillMergeSnap {
    return this.fillStyles.getFillMergeSnap(source)
  }

  /**
   * Phase 5-A — 给 view `range` 设置填充色；`color === null` 走 clearFill。
   * 写入前把 view range 翻译为 raw range；`range` 须已归一化（`startRow ≤ endRow`，`startCol ≤ endCol`）。
   * 快照前后一致则不入栈并返回 false。
   */
  setFillColor(range: CellRange, color: string | null): boolean {
    this.finishActiveEdit()
    const rawRange = this.viewRangeToRawRange(range)
    if (!rawRange) return false
    const selectionBefore = this.selection.getSelection()
    const before = this.formatStore.snapshot()
    if (color === null) {
      this.formatStore.clearFill(rawRange)
    } else {
      this.formatStore.apply(rawRange, { fillColor: color })
    }
    return this.commitFormatChange(before, selectionBefore)
  }

  /**
   * 设置 view `range` 的文本显示模式（overflow/wrap/clip）。view→raw 翻译，
   * 非连续映射返回 false；快照前后一致也返回 false（沿用 format undo 命令）。
   */
  setTextWrap(range: CellRange, mode: TextWrapMode): boolean {
    this.finishActiveEdit()
    const rawRange = this.viewRangeToRawRange(range)
    if (!rawRange) return false
    const selectionBefore = this.selection.getSelection()
    const before = this.formatStore.snapshot()
    this.formatStore.apply(rawRange, { textWrap: mode })
    return this.commitFormatChange(before, selectionBefore)
  }

  /**
   * 给 view `range` 设置边框；`preset === 'clear'` 需 `border === null` 并清除。
   * Phase 5-B 起支持全部 `lineStyle`（solid/dashed/dotted/double）。`range` 须已归一化。
   * 写入前把 view range 翻译为 raw range；快照前后一致则不入栈并返回 false。
   */
  setBorders(range: CellRange, preset: BorderPreset, border: BorderStyle | null): boolean {
    this.finishActiveEdit()
    if (preset === 'clear') {
      if (border !== null) return false
    } else {
      if (border === null) return false
    }
    const rawRange = this.viewRangeToRawRange(range)
    if (!rawRange) return false
    const selectionBefore = this.selection.getSelection()
    const before = this.formatStore.snapshot()
    if (preset === 'clear') {
      this.formatStore.applyBorders(rawRange, 'clear')
    } else {
      this.formatStore.applyBorders(rawRange, preset, border!)
    }
    return this.commitFormatChange(before, selectionBefore)
  }

  /** Phase 5-A — 解析单个单元格的格式。坐标为 **raw** 空间（与 store 键控一致）。 */
  getCellFormat(rowIndex: number, colIndex: number): CellFormat | undefined {
    return this.formatStore.resolveCell(rowIndex, colIndex)
  }

  /**
   * Phase 5-A — 合并 view `range`。
   * 把 view range 翻译为 raw range（排序/筛选打乱行序时 null → 返回 false）；
   * 单格或与现存合并重叠由 `MergeStore.merge` 拒绝（返回 false）。
   * 成功时选中整个合并 view 范围、入栈一条 merge 命令并返回 true。
   * `range` 须已归一化（`startRow ≤ endRow`，`startCol ≤ endCol`）。
   */
  mergeCells(range: CellRange): boolean {
    this.finishActiveEdit()
    const rawRange = this.viewRangeToRawRange(range)
    if (!rawRange) return false
    const selectionBefore = this.selection.getSelection()
    const before = this.mergeStore.snapshot()
    const region = this.mergeStore.merge(rawRange)
    if (!region) return false
    this.selection.setSelectedRange(range)
    const after = this.mergeStore.snapshot()
    const selectionAfter = this.selection.getSelection()
    this.undoStack.push({ kind: 'merge', before, after, selectionBefore, selectionAfter })
    return true
  }

  /**
   * Phase 5-A — 取消 view `range` 触及的所有合并区域。
   * 把 view range 翻译为 raw range（非连续映射时 null → 返回 false）；
   * 移除任何区域则入栈一条 unmerge 命令并返回 true，否则返回 false。
   */
  unmergeCells(range: CellRange): boolean {
    this.finishActiveEdit()
    const rawRange = this.viewRangeToRawRange(range)
    if (!rawRange) return false
    const selectionBefore = this.selection.getSelection()
    const before = this.mergeStore.snapshot()
    const removed = this.mergeStore.unmerge(rawRange)
    if (removed.length === 0) return false
    const after = this.mergeStore.snapshot()
    const selectionAfter = this.selection.getSelection()
    this.undoStack.push({ kind: 'unmerge', before, after, selectionBefore, selectionAfter })
    return true
  }

  /** Phase 5-A — 返回覆盖单元格的合并区域。坐标为 **raw** 空间（与 `getCellFormat` 一致）。 */
  getMergeRegion(rowIndex: number, colIndex: number): MergeRegion | null {
    return this.mergeStore.getRegionAt(rowIndex, colIndex)
  }

  /**
   * 把 view `CellRange` 翻译为 raw `RawRange`。无 hide/sort/filter 时为恒等映射。
   * 行经 `viewRowToRaw`、列经 `fieldId → raw col index` 映射；映射结果在 raw 空间
   * 非连续（排序/筛选打乱行序）时返回 null（5-A 不展开大范围，见 plan Coordinate Space Invariant）。
   */
  private viewRangeToRawRange(range: CellRange): RawRange | null {
    return this.coords.viewRangeToRaw(range)
  }

  /** 快照前后一致时说明 store 未变动（无副作用），直接返回 false；否则入栈一条 format 命令并返回 true。 */
  private commitFormatChange(
    before: readonly FormatLayer[],
    selectionBefore: GridSelection,
  ): boolean {
    const after = this.formatStore.snapshot()
    if (sameFormatLayers(before, after)) {
      // Store unchanged: no-op (clearFill/clearBorders already skipped push when no layers intersected).
      return false
    }
    const selectionAfter = this.selection.getSelection()
    this.undoStack.push({ kind: 'format', before, after, selectionBefore, selectionAfter })
    return true
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
        if (cmd.formatBefore) this.formatStore.restore(cmd.formatBefore)
        if (cmd.mergeBefore) this.mergeStore.restore(cmd.mergeBefore)
        this.restoreSelectionForWrites(cmd.before, cmd.source)
        return
      case 'resizeRow':
        this.rawRowsAxis.setSize(cmd.rowIndex, cmd.before)
        this.rebuildViewAxis()
        return
      case 'resizeColumn':
        this.rawColsAxis.setSize(cmd.colIndex, cmd.before)
        const beforeField = this.rawData.getSchema().fields[cmd.colIndex]
        if (beforeField) beforeField.width = cmd.before
        this.rebuildViewColsAxis()
        return
      case 'insertRows': {
        // unapply insertRows = delete the count rows that were inserted at cmd.at
        if (!isMutableDataSource(this.rawData) || !this.rawData.deleteRows) return
        const idsToRemove = Array.from({ length: cmd.count }, (_, i) => cmd.at + i)
        this.rawData.deleteRows(idsToRemove)
        this.rawRowsAxis.deleteRange(idsToRemove)
        this.rebuildViewAxis()
        this.formatStore.restore(cmd.formatBefore)
        this.mergeStore.restore(cmd.mergeBefore)
        this.selection.setSelection(cmd.selectionBefore)
        return
      }
      case 'deleteRows': {
        // unapply deleteRows = re-insert rows at their original positions and restore cells
        if (!isMutableDataSource(this.rawData) || !this.rawData.insertRows) return
        // Re-insert in reverse snapshot order so earlier indices stay valid
        const sorted = [...cmd.snapshots].sort(
          (a, b) => a.originalUnderlyingRow - b.originalUnderlyingRow,
        )
        for (let i = sorted.length - 1; i >= 0; i -= 1) {
          const snap = sorted[i]!
          this.rawData.insertRows(snap.originalUnderlyingRow, 1)
          this.rawRowsAxis.insertRange(
            snap.originalUnderlyingRow,
            1,
            cmd.deletedHeights[i] ?? this.resolveDefaultRowHeight(),
          )
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
        this.formatStore.restore(cmd.formatBefore)
        this.mergeStore.restore(cmd.mergeBefore)
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
          this.rawRowsAxis.setSize(
            cmd.rowIds[i]!,
            cmd.oldHeights[i] ?? this.resolveDefaultRowHeight(),
          )
        }
        this.rebuildViewAxis()
        this.selection.setSelection(cmd.selectionBefore)
        return
      case 'moveRows':
        this.applyMoveRowsCommand(cmd.inverseRowIds, cmd.inverseBeforeRowId, cmd.selectionBefore)
        this.formatStore.restore(cmd.formatBefore)
        this.mergeStore.restore(cmd.mergeBefore)
        return
      case 'insertCols':
        this.unapplyInsertCols(cmd)
        this.formatStore.restore(cmd.formatBefore)
        this.mergeStore.restore(cmd.mergeBefore)
        return
      case 'deleteCols':
        this.unapplyDeleteCols(cmd)
        this.formatStore.restore(cmd.formatBefore)
        this.mergeStore.restore(cmd.mergeBefore)
        return
      case 'hideCols':
        for (const id of cmd.fieldIds) this.hiddenColIds.delete(id)
        this.rebuildViewColsAxis()
        this.selection.setSelection(cmd.selectionBefore)
        return
      case 'unhideCols':
        for (const id of cmd.fieldIds) this.hiddenColIds.add(id)
        this.rebuildViewColsAxis()
        this.selection.setSelection(cmd.selectionBefore)
        return
      case 'resizeColumnsMulti':
        for (let i = 0; i < cmd.fieldIds.length; i += 1) {
          const id = cmd.fieldIds[i]!
          const idx = this.getRawColumnIndex(id)
          if (idx < 0) continue
          const width = cmd.oldWidths[i] ?? this.resolveDefaultColWidth()
          this.rawColsAxis.setSize(idx, width)
          this.setFieldWidth(id, width)
        }
        this.rebuildViewColsAxis()
        this.selection.setSelection(cmd.selectionBefore)
        return
      case 'moveCols':
        this.applyMoveColsCommand(cmd.fieldIds, cmd.inverseBeforeFieldId, cmd.selectionBefore)
        this.formatStore.restore(cmd.formatBefore)
        this.mergeStore.restore(cmd.mergeBefore)
        return
      case 'format':
        this.formatStore.restore(cmd.before)
        this.selection.setSelection(cmd.selectionBefore)
        return
      case 'merge':
      case 'unmerge':
        this.mergeStore.restore(cmd.before)
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
        if (cmd.formatAfter) this.formatStore.restore(cmd.formatAfter)
        if (cmd.mergeAfter) this.mergeStore.restore(cmd.mergeAfter)
        this.restoreSelectionForWrites(cmd.after, cmd.result)
        return
      case 'resizeRow':
        this.rawRowsAxis.setSize(cmd.rowIndex, cmd.after)
        this.rowsAxis = this.buildViewRowsAxis()
        return
      case 'resizeColumn':
        this.rawColsAxis.setSize(cmd.colIndex, cmd.after)
        const afterField = this.rawData.getSchema().fields[cmd.colIndex]
        if (afterField) afterField.width = cmd.after
        this.rebuildViewColsAxis()
        return
      case 'insertRows': {
        // redo insertRows = insert count blank rows at cmd.at
        if (!isMutableDataSource(this.rawData) || !this.rawData.insertRows) return
        this.rawData.insertRows(cmd.at, cmd.count)
        this.rawRowsAxis.insertRange(cmd.at, cmd.count, this.resolveDefaultRowHeight())
        this.rowsAxis = this.buildViewRowsAxis()
        this.formatStore.restore(cmd.formatAfter)
        this.mergeStore.restore(cmd.mergeAfter)
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
        this.formatStore.restore(cmd.formatAfter)
        this.mergeStore.restore(cmd.mergeAfter)
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
      case 'moveRows':
        this.applyMoveRowsCommand(cmd.rowIds, cmd.beforeRowId, cmd.selectionAfter)
        this.formatStore.restore(cmd.formatAfter)
        this.mergeStore.restore(cmd.mergeAfter)
        return
      case 'insertCols':
        this.applyInsertCols(cmd)
        this.formatStore.restore(cmd.formatAfter)
        this.mergeStore.restore(cmd.mergeAfter)
        return
      case 'deleteCols':
        this.applyDeleteCols(cmd)
        this.formatStore.restore(cmd.formatAfter)
        this.mergeStore.restore(cmd.mergeAfter)
        return
      case 'hideCols':
        for (const id of cmd.fieldIds) this.hiddenColIds.add(id)
        this.rebuildViewColsAxis()
        this.selection.setSelection(cmd.selectionAfter)
        return
      case 'unhideCols':
        for (const id of cmd.fieldIds) this.hiddenColIds.delete(id)
        this.rebuildViewColsAxis()
        this.selection.setSelection(cmd.selectionAfter)
        return
      case 'resizeColumnsMulti':
        for (const id of cmd.fieldIds) {
          const idx = this.getRawColumnIndex(id)
          if (idx < 0) continue
          this.rawColsAxis.setSize(idx, cmd.newWidth)
          this.setFieldWidth(id, cmd.newWidth)
        }
        this.rebuildViewColsAxis()
        this.selection.setSelection(cmd.selectionAfter)
        return
      case 'moveCols':
        this.applyMoveColsCommand(cmd.fieldIds, cmd.beforeFieldId, cmd.selectionAfter)
        this.formatStore.restore(cmd.formatAfter)
        this.mergeStore.restore(cmd.mergeAfter)
        return
      case 'format':
        this.formatStore.restore(cmd.after)
        this.selection.setSelection(cmd.selectionAfter)
        return
      case 'merge':
      case 'unmerge':
        this.mergeStore.restore(cmd.after)
        this.selection.setSelection(cmd.selectionAfter)
        return
    }
  }

  private applyMoveColsCommand(
    fieldIds: readonly string[],
    beforeFieldId: string | null,
    selection: GridSelection,
  ): void {
    if (!isMutableDataSource(this.rawData) || !this.rawData.moveFields) return
    const normalized = this.normalizeMoveCols(fieldIds, beforeFieldId)
    if (!normalized) return
    const widthById = this.captureRawColWidths()
    this.rawData.moveFields(normalized.fieldIds, normalized.beforeFieldId)
    this.rebuildRawColsAxisFromWidths(widthById)
    this.rebuildViewColsAxis()
    this.selection.setSelection(selection)
  }

  private applyMoveRowsCommand(
    rowIds: readonly number[],
    beforeRowId: number | null,
    selection: GridSelection,
  ): void {
    if (!isMutableDataSource(this.rawData) || !this.rawData.moveRows) return
    const normalized = this.normalizeMoveRows(rowIds, beforeRowId)
    if (!normalized) return
    const sizesBefore = this.captureRawRowHeights()
    this.rawData.moveRows(normalized.rowIds, normalized.beforeRowId)
    this.rebuildRawRowsAxisFromHeights(reorderByIndexMap(sizesBefore, normalized.indexMap))
    this.remapHiddenRowsByIndexMap(normalized.indexMap)
    this.rebuildViewAxis()
    this.selection.setSelection(selection)
  }

  private applyInsertCols(cmd: Extract<UndoCommand, { kind: 'insertCols' }>): void {
    if (!isMutableDataSource(this.rawData) || !this.rawData.insertField) return
    for (let i = 0; i < cmd.newFields.length; i += 1) {
      this.rawData.insertField(cmd.at + i, cmd.newFields[i]!)
    }
    this.rawColsAxis.insertRange(cmd.at, cmd.count, this.resolveDefaultColWidth())
    for (let i = 0; i < cmd.newFields.length; i += 1) {
      this.rawColsAxis.setSize(cmd.at + i, cmd.newFields[i]!.width)
    }
    this.frozen.setFrozen(cmd.frozenAfter)
    this.rebuildViewColsAxis()
    this.selection.setSelection(cmd.selectionAfter)
  }

  private unapplyInsertCols(cmd: Extract<UndoCommand, { kind: 'insertCols' }>): void {
    if (!isMutableDataSource(this.rawData) || !this.rawData.removeField) return
    const removed = cmd.newFields
      .map((field) => this.getRawColumnIndex(field.id))
      .filter((idx) => idx >= 0)
      .sort((a, b) => a - b)
    for (let i = cmd.newFields.length - 1; i >= 0; i -= 1) {
      this.rawData.removeField(cmd.newFields[i]!.id)
      this.hiddenColIds.delete(cmd.newFields[i]!.id)
    }
    this.rawColsAxis.deleteRange(removed)
    this.frozen.setFrozen(cmd.frozenBefore)
    this.rebuildViewColsAxis()
    this.selection.setSelection(cmd.selectionBefore)
  }

  private applyDeleteCols(cmd: Extract<UndoCommand, { kind: 'deleteCols' }>): void {
    if (!isMutableDataSource(this.rawData) || !this.rawData.removeField) return
    const removed = cmd.snapshots
      .map((snap) => this.getRawColumnIndex(snap.field.id))
      .filter((idx) => idx >= 0)
      .sort((a, b) => a - b)
    for (let i = cmd.snapshots.length - 1; i >= 0; i -= 1) {
      this.rawData.removeField(cmd.snapshots[i]!.field.id)
      this.hiddenColIds.delete(cmd.snapshots[i]!.field.id)
    }
    this.rawColsAxis.deleteRange(removed)
    this.frozen.setFrozen(cmd.frozenAfter)
    this.rebuildViewColsAxis()
    this.selection.setSelection(cmd.selectionAfter)
  }

  private unapplyDeleteCols(cmd: Extract<UndoCommand, { kind: 'deleteCols' }>): void {
    if (!isMutableDataSource(this.rawData) || !this.rawData.insertField) return
    const sorted = [...cmd.snapshots].sort((a, b) => a.originalIndex - b.originalIndex)
    for (const snap of sorted) {
      const width = cmd.deletedWidths[cmd.snapshots.indexOf(snap)] ?? snap.field.width
      const restoredField = { ...snap.field, width }
      this.rawData.insertField(snap.originalIndex, restoredField)
      this.rawColsAxis.insertRange(snap.originalIndex, 1, width)
      this.rawColsAxis.setSize(snap.originalIndex, width)
      for (let rowIndex = 0; rowIndex < snap.cells.length; rowIndex += 1) {
        const value = snap.cells[rowIndex]
        if (value !== undefined) this.rawData.updateCell(rowIndex, snap.field.id, value)
      }
    }
    this.frozen.setFrozen(cmd.frozenBefore)
    this.rebuildViewColsAxis()
    this.selection.setSelection(cmd.selectionBefore)
  }

  private restoreSelectionForWrites(writes: readonly CellWrite[], fallbackRange: CellRange): void {
    const visibleRows: number[] = []
    for (const write of writes) {
      const viewRow = this.coords.rawRowToView(write.rowIndex)
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
    const viewRow = this.coords.rawRowToView(rowIndex)
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
    const viewRow = this.coords.rawRowToView(rowIndex)
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
    const viewRow = this.coords.rawRowToView(underlyingRow)
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
      const viewRow = this.coords.rawRowToView(underlyingRow)
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
    return this.axisViewBuilder.buildRowsAxis({
      rawRowsAxis: this.rawRowsAxis,
      visibleRows: this.hideRowsLayer.getVisibleRows(),
      defaultSize: this.resolveDefaultRowHeight(),
    })
  }

  /**
   * 重建 viewRowsAxis 并同步 frozen / viewport 持有的引用。
   * 在 constructor / rebuildData 中不调用（彼时 frozen/viewport 尚未构建，由调用方自行处理）；
   * 在 hide/unhide/setRowHeight/insertRows/deleteRows 等 mutation 路径中使用。
   */
  private rebuildViewAxis(): void {
    this.rowsAxis = this.buildViewRowsAxis()
    const rebuilt = this.viewportRebuilder.rebuild({
      rowsAxis: this.rowsAxis,
      colsAxis: this.colsAxis,
      previousViewport: this.viewport,
      frozenConfig: this.frozen.getFrozenConfig(),
    })
    this.frozen = rebuilt.frozen
    this.viewport = rebuilt.viewport
  }

  private buildViewColsAxis(): ChunkedAxis {
    return this.axisViewBuilder.buildColsAxis({
      rawColsAxis: this.rawColsAxis,
      fields: this.rawData.getSchema().fields,
      hiddenFieldIds: this.hiddenColIds,
    })
  }

  private rebuildViewColsAxis(): void {
    this.colsAxis = this.buildViewColsAxis()
    const rebuilt = this.viewportRebuilder.rebuild({
      rowsAxis: this.rowsAxis,
      colsAxis: this.colsAxis,
      previousViewport: this.viewport,
      frozenConfig: this.frozen.getFrozenConfig(),
    })
    this.frozen = rebuilt.frozen
    this.viewport = rebuilt.viewport
  }

  private wrapViewData(data: DataSource): DataSource {
    return new VisibleColumnsDataSource(data, () => this.hiddenColIds)
  }

  private computeCollapsedColGaps(): readonly Omit<RenderFrameCollapsedColGap, 'xPx'>[] {
    return this.collapsedColGaps.build(this.rawData.getSchema().fields, this.hiddenColIds)
  }

  private syncFrozenAfterColInsert(at: number, count: number): void {
    const cfg = this.frozen.getFrozenConfig()
    const oldTotalCols = this.rawData.getSchema().fields.length - count
    let { leftCols, rightCols } = cfg
    if (at < leftCols) leftCols += count
    if (rightCols > 0 && at >= oldTotalCols - rightCols) rightCols += count
    this.frozen.setFrozen({ topRows: cfg.topRows, leftCols, rightCols })
  }

  private syncFrozenAfterColDelete(
    removedIndices: readonly number[],
    totalColsBefore: number,
  ): void {
    const cfg = this.frozen.getFrozenConfig()
    const leftHit = removedIndices.filter((idx) => idx < cfg.leftCols).length
    const rightBoundary = totalColsBefore - cfg.rightCols
    const rightHit = removedIndices.filter((idx) => idx >= rightBoundary).length
    this.frozen.setFrozen({
      topRows: cfg.topRows,
      leftCols: Math.max(0, cfg.leftCols - leftHit),
      rightCols: Math.max(0, cfg.rightCols - rightHit),
    })
  }

  private normalizeMoveCols(
    fieldIds: readonly string[],
    beforeFieldId: string | null,
  ): {
    readonly fieldIds: readonly string[]
    readonly beforeFieldId: string | null
    readonly inverseBeforeFieldId: string | null
  } | null {
    const fields = this.rawData.getSchema().fields
    const requested = new Set(fieldIds)
    const moving = fields.filter((field) => requested.has(field.id)).map((field) => field.id)
    if (moving.length === 0) return null
    if (!this.isContiguousFieldGroup(moving)) return null
    const movingSet = new Set(moving)
    if (beforeFieldId !== null) {
      if (movingSet.has(beforeFieldId)) return null
      if (!fields.some((field) => field.id === beforeFieldId)) return null
    }

    const remaining = fields.filter((field) => !movingSet.has(field.id)).map((field) => field.id)
    const insertAt = beforeFieldId === null ? remaining.length : remaining.indexOf(beforeFieldId)
    if (insertAt < 0) return null

    const next = remaining.slice()
    next.splice(insertAt, 0, ...moving)
    const current = fields.map((field) => field.id)
    if (sameStringOrder(current, next)) return null

    const firstMovingIndex = current.findIndex((id) => movingSet.has(id))
    let inverseBeforeFieldId: string | null = null
    for (let i = firstMovingIndex + moving.length; i < current.length; i += 1) {
      const id = current[i]!
      if (!movingSet.has(id)) {
        inverseBeforeFieldId = id
        break
      }
    }
    return { fieldIds: moving, beforeFieldId, inverseBeforeFieldId }
  }

  private normalizeMoveRows(
    rowIds: readonly number[],
    beforeRowId: number | null,
  ): {
    readonly rowIds: readonly number[]
    readonly beforeRowId: number | null
    readonly inverseRowIds: readonly number[]
    readonly inverseBeforeRowId: number | null
    readonly indexMap: ReadonlyMap<number, number>
  } | null {
    const count = this.rawData.getRowCount()
    if (rowIds.length === 0) return null
    const moving = [...rowIds].sort((a, b) => a - b)
    if (!areContiguousRows(moving)) return null
    const start = moving[0]!
    const end = moving[moving.length - 1]!
    if (start < 0 || end >= count) return null
    if (beforeRowId !== null && (beforeRowId < 0 || beforeRowId > count)) return null
    if (beforeRowId !== null && beforeRowId >= start && beforeRowId <= end + 1) return null

    const nextOrder = moveIndexBlock(count, start, end, beforeRowId)
    const currentOrder = Array.from({ length: count }, (_, index) => index)
    if (sameNumberOrder(currentOrder, nextOrder)) return null

    const indexMap = new Map<number, number>()
    for (let nextIndex = 0; nextIndex < nextOrder.length; nextIndex += 1) {
      indexMap.set(nextOrder[nextIndex]!, nextIndex)
    }
    const inverseRowIds = moving.map((id) => indexMap.get(id)!).sort((a, b) => a - b)
    const inverseSourceRow = end + 1 < count ? end + 1 : null
    const inverseBeforeRowId = inverseSourceRow === null ? null : indexMap.get(inverseSourceRow)!
    return { rowIds: moving, beforeRowId, inverseRowIds, inverseBeforeRowId, indexMap }
  }

  private captureRawRowHeights(): number[] {
    return Array.from({ length: this.rawRowsAxis.getCount() }, (_, index) =>
      this.rawRowsAxis.getSize(index),
    )
  }

  private rebuildRawRowsAxisFromHeights(heights: readonly number[]): void {
    const defaultHeight = this.resolveDefaultRowHeight()
    this.rawRowsAxis = new ChunkedAxis({ count: heights.length, defaultSize: defaultHeight })
    for (let i = 0; i < heights.length; i += 1) {
      if (heights[i] !== defaultHeight) this.rawRowsAxis.setSize(i, heights[i]!)
    }
  }

  private remapHiddenRowsByIndexMap(indexMap: ReadonlyMap<number, number>): void {
    const remapped = this.getHiddenRows()
      .map((rowId) => indexMap.get(rowId))
      .filter((rowId): rowId is number => rowId !== undefined)
    this.hideRowsLayer.setHidden(remapped)
  }

  private captureRawColWidths(): Map<string, number> {
    const widths = new Map<string, number>()
    const fields = this.rawData.getSchema().fields
    for (let i = 0; i < fields.length; i += 1) {
      widths.set(fields[i]!.id, this.rawColsAxis.getSize(i))
    }
    return widths
  }

  private isContiguousFieldGroup(fieldIds: readonly string[]): boolean {
    const fields = this.rawData.getSchema().fields
    const indices = fieldIds
      .map((id) => fields.findIndex((field) => field.id === id))
      .filter((index) => index >= 0)
      .sort((a, b) => a - b)
    if (indices.length !== fieldIds.length) return false
    for (let i = 1; i < indices.length; i += 1) {
      if (indices[i]! !== indices[i - 1]! + 1) return false
    }
    return true
  }

  /**
   * 由「移动前 raw 字段序」与当前（移动后）raw 字段序按 fieldId 配对，
   * 推导 `oldRawIndex → newRawIndex` map（Trap 1）。必须在 `moveFields` 之后调用。
   */
  private buildColIndexMap(rawFieldIdsBefore: readonly string[]): ReadonlyMap<number, number> {
    const newIndexById = new Map<string, number>()
    const fieldsAfter = this.rawData.getSchema().fields
    for (let i = 0; i < fieldsAfter.length; i += 1) {
      newIndexById.set(fieldsAfter[i]!.id, i)
    }
    const indexMap = new Map<number, number>()
    for (let oldIndex = 0; oldIndex < rawFieldIdsBefore.length; oldIndex += 1) {
      const newIndex = newIndexById.get(rawFieldIdsBefore[oldIndex]!)
      if (newIndex !== undefined) indexMap.set(oldIndex, newIndex)
    }
    return indexMap
  }

  private rebuildRawColsAxisFromWidths(widthById: ReadonlyMap<string, number>): void {
    const fields = this.rawData.getSchema().fields
    const defaultWidth = this.rawColsAxis.getDefaultSize()
    this.rawColsAxis = new ChunkedAxis({ count: fields.length, defaultSize: defaultWidth })
    for (let i = 0; i < fields.length; i += 1) {
      const field = fields[i]!
      const width = widthById.get(field.id) ?? field.width
      if (width !== defaultWidth) this.rawColsAxis.setSize(i, width)
      field.width = width
    }
  }

  private restoreSelectionByVisibleFieldIds(
    selection: GridSelection,
    visibleFieldIdsBefore: readonly string[],
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

    const fieldsAfter = this.data.getSchema().fields
    const indexAfterById = new Map<string, number>()
    for (let i = 0; i < fieldsAfter.length; i += 1) {
      indexAfterById.set(fieldsAfter[i]!.id, i)
    }
    const mapCell = (cell: CellAddress): CellAddress | null => {
      const fieldId = visibleFieldIdsBefore[cell.colIndex]
      if (!fieldId) return null
      const colIndex = indexAfterById.get(fieldId)
      if (colIndex === undefined) return null
      return { rowIndex: cell.rowIndex, colIndex }
    }

    const activeCell = mapCell(selection.activeCell)
    const anchorCell = mapCell(selection.anchorCell)
    const extentCell = mapCell(selection.extentCell)
    if (!activeCell || !anchorCell || !extentCell) {
      this.selection.clear()
      return
    }

    this.selection.setSelection({
      activeCell,
      anchorCell,
      extentCell,
      selectedRange: normalizeCellRange(anchorCell, extentCell),
    })
  }

  private restoreSelectionByRowIndexMap(
    selection: GridSelection,
    indexMap: ReadonlyMap<number, number>,
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
    const mapCell = (cell: CellAddress): CellAddress | null => {
      const rowIndex = indexMap.get(cell.rowIndex)
      if (rowIndex === undefined) return null
      return { rowIndex, colIndex: cell.colIndex }
    }
    const activeCell = mapCell(selection.activeCell)
    const anchorCell = mapCell(selection.anchorCell)
    const extentCell = mapCell(selection.extentCell)
    if (!activeCell || !anchorCell || !extentCell) {
      this.selection.clear()
      return
    }
    this.selection.setSelection({
      activeCell,
      anchorCell,
      extentCell,
      selectedRange: normalizeCellRange(anchorCell, extentCell),
    })
  }

  private resolveDefaultColWidth(): number {
    return this.rawColsAxis.getDefaultSize()
  }

  private getRawColumnIndex(fieldId: string): number {
    return this.coords.fieldIdToRaw(fieldId)
  }

  private getRawColumnIndexForViewIndex(viewColIndex: number): number {
    return this.coords.viewColToRaw(viewColIndex)
  }

  private setFieldWidth(fieldId: string, width: number): void {
    const field = this.rawData.getSchema().fields.find((candidate) => candidate.id === fieldId)
    if (field) field.width = width
  }

  private resolveFrozenConfig(options: GridEngineOptions): FrozenConfig {
    const frozen = options.frozen ?? {}
    return {
      topRows: frozen.topRows ?? 0,
      leftCols: frozen.leftCols ?? 0,
      rightCols: frozen.rightCols ?? 0,
    }
  }

  private averageColWidth(): number {
    const fields = this.rawData.getSchema().fields
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
    const fields = this.rawData.getSchema().fields
    const avg = this.rawColsAxis.getDefaultSize()
    for (let i = 0; i < fields.length; i++) {
      if (fields[i]!.width !== avg) {
        this.rawColsAxis.setSize(i, fields[i]!.width)
      }
    }
    this.rebuildViewColsAxis()
  }
}

class VisibleColumnsDataSource implements DataSource {
  readonly updateCell?: MutableDataSource['updateCell']
  readonly updateCellByUnderlyingRow?: MutableDataSource['updateCellByUnderlyingRow']
  readonly insertRows?: MutableDataSource['insertRows']
  readonly deleteRows?: MutableDataSource['deleteRows']
  readonly moveRows?: MutableDataSource['moveRows']
  readonly insertField?: MutableDataSource['insertField']
  readonly removeField?: MutableDataSource['removeField']
  readonly moveFields?: MutableDataSource['moveFields']

  constructor(
    private readonly upstream: DataSource,
    private readonly getHiddenIds: () => ReadonlySet<string>,
  ) {
    const mutableUpstream = isMutableDataSource(this.upstream) ? this.upstream : null
    if (mutableUpstream) {
      this.updateCell = (rowIndex, fieldId, value) =>
        mutableUpstream.updateCell(rowIndex, fieldId, value)
      this.updateCellByUnderlyingRow =
        mutableUpstream.updateCellByUnderlyingRow?.bind(mutableUpstream)
      this.insertRows = mutableUpstream.insertRows?.bind(mutableUpstream)
      this.deleteRows = mutableUpstream.deleteRows?.bind(mutableUpstream)
      this.moveRows = mutableUpstream.moveRows?.bind(mutableUpstream)
      this.insertField = mutableUpstream.insertField?.bind(mutableUpstream)
      this.removeField = mutableUpstream.removeField?.bind(mutableUpstream)
      this.moveFields = mutableUpstream.moveFields?.bind(mutableUpstream)
    }
  }

  getRowCount(): number {
    return this.upstream.getRowCount()
  }

  getSchema(): Schema {
    const hidden = this.getHiddenIds()
    if (hidden.size === 0) return this.upstream.getSchema()
    return {
      fields: this.upstream.getSchema().fields.filter((field) => !hidden.has(field.id)),
    }
  }

  getRows(startIndex: number, endIndex: number): Row[] | Promise<Row[]> {
    return this.upstream.getRows(startIndex, endIndex)
  }

  getCell(rowIndex: number, fieldId: string): CellValue | undefined {
    return this.upstream.getCell(rowIndex, fieldId)
  }

  resolveUnderlyingRow(viewRow: number): number {
    return this.upstream.resolveUnderlyingRow?.(viewRow) ?? viewRow
  }

  findViewRow(underlyingRow: number): number {
    return this.upstream.findViewRow?.(underlyingRow) ?? underlyingRow
  }

  subscribe(listener: DataSourceListener): () => void {
    return this.upstream.subscribe((event: DataSourceEvent) => listener(event))
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

function sameStringOrder(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function sameNumberOrder(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function moveIndexBlock(
  count: number,
  start: number,
  end: number,
  beforeRowId: number | null,
): number[] {
  const current = Array.from({ length: count }, (_, index) => index)
  const moving = current.slice(start, end + 1)
  const remaining = current.filter((index) => index < start || index > end)
  const insertAt =
    beforeRowId === null
      ? remaining.length
      : beforeRowId > end
        ? beforeRowId - moving.length
        : beforeRowId
  const next = remaining.slice()
  next.splice(insertAt, 0, ...moving)
  return next
}

function reorderByIndexMap<T>(values: readonly T[], indexMap: ReadonlyMap<number, number>): T[] {
  const next = values.slice()
  for (let oldIndex = 0; oldIndex < values.length; oldIndex += 1) {
    const newIndex = indexMap.get(oldIndex)
    if (newIndex !== undefined) next[newIndex] = values[oldIndex]!
  }
  return next
}

function normalizeCellRange(a: CellAddress, b: CellAddress): CellRange {
  return {
    startRow: Math.min(a.rowIndex, b.rowIndex),
    endRow: Math.max(a.rowIndex, b.rowIndex),
    startCol: Math.min(a.colIndex, b.colIndex),
    endCol: Math.max(a.colIndex, b.colIndex),
  }
}

/** 比较两个 format 层快照是否引用同一组层（按 order 标识，append-only 故 order 唯一）。 */
function sameFormatLayers(a: readonly FormatLayer[], b: readonly FormatLayer[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}
