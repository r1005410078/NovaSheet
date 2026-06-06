import type { CellValue, Field } from '../kernel/data/Schema'
import type { DataSource } from '../kernel/data/DataSource'
import { isMutableDataSource } from '../kernel/data/MutableDataSource'
import type { RemovedFieldSnapshot } from '../kernel/data/MutableDataSource'
import { applyPaste, pasteTargetConflictsWithMerges } from '../clipboard/ApplyPaste'
import type { ApplyPasteSource, PasteTargetRect, PasteWriteRecord } from '../clipboard/ApplyPaste'
import type { PasteSkippedCell } from '../clipboard/types'
import { computeFillWrites } from '../fill/FillSeries'
import type { FillDirection, FillMergeSnap } from '../fill/FillTarget'
import { unionRange } from '../kernel/geometry/range'
import { RangeStyleStore } from '../format/RangeStyleStore'
import type {
  BorderPreset,
  BorderStyle,
  CellFormat,
  TextWrapMode,
} from '../format/CellFormat'
import { MergeStore } from '../merge/MergeStore'
import type { MergeRegion } from '../merge/MergeStore'
import { formatCellForEdit, isEditableFieldType, parseCellEditInput } from '../interaction/CellEdit'
import { CellEditModel } from '../interaction/CellEditModel'
import { parseSelectionNavigationKey } from '../features/selection/SelectionNavigation'
import type {
  CellAddress,
  CellRange,
  GridSelection,
  SelectCellOptions,
} from '../features/selection/SelectionTypes'
import type { ChunkedAxis } from '../kernel/geometry/ChunkedAxis'
import type { FrozenConfig } from '../kernel/geometry/FrozenRegions'
import type { Viewport } from '../kernel/geometry/Viewport'
import { DefaultLayoutState } from '../features/layout/LayoutState'
import type { RenderFrame } from '../kernel/render/RenderFrame'
import { denseGridTheme } from '../kernel/theme/denseGridTheme'
import type { Theme } from '../kernel/theme/Theme'
import { UndoStack } from '../kernel/undo/UndoStack'
import type { CellWrite, UndoCommand } from '../kernel/undo/UndoCommand'
import { UndoRegistry } from '../kernel/undo/UndoRegistry'
import { UndoReplay } from '../kernel/undo/UndoReplay'
import { registerCellUndo } from './undo/registerCellUndo'
import { registerFormatUndo } from './format/registerFormatUndo'
import { registerRowUndo } from '../features/row/registerRowUndo'
import { registerColumnUndo } from '../features/column/registerColumnUndo'
import { registerFillUndo } from './undo/registerFillUndo'
import { registerRowStructureUndo } from '../features/row/registerRowStructureUndo'
import { registerColumnStructureUndo } from '../features/column/registerColumnStructureUndo'
import { CoordinateSpace } from '../view/CoordinateSpace'
import type { RawRange } from '../view/coordinates'
import { VisibleFormatResolver } from './VisibleFormatResolver'
import { FormatController } from './format/FormatController'
import { FillStylePropagator } from './FillStylePropagator'
import { GridEventPipeline } from '../kernel/protocol/GridEventPipeline'
import { FormatEventHandler } from './format/FormatEventHandler'
import { DeleteRowsCommandHandler } from '../features/row/DeleteRowsCommandHandler'
import type {
  FillCommitResult,
  GridEngine,
  GridEngineOptions,
  SetViewDataOptions,
} from './GridEngine'
import { DefaultRowStructure } from '../features/row/DefaultRowStructure'
import { HideRowsCommandHandler } from '../features/row/HideRowsCommandHandler'
import { InsertRowsCommandHandler } from '../features/row/InsertRowsCommandHandler'
import { MoveRowsCommandHandler } from '../features/row/MoveRowsCommandHandler'
import { UnhideRowsCommandHandler } from '../features/row/UnhideRowsCommandHandler'
import { DefaultColumnStructure } from '../features/column/DefaultColumnStructure'
import { InsertColsCommandHandler } from '../features/column/InsertColsCommandHandler'
import { DeleteColsCommandHandler } from '../features/column/DeleteColsCommandHandler'
import { HideColsCommandHandler } from '../features/column/HideColsCommandHandler'
import { UnhideColsCommandHandler } from '../features/column/UnhideColsCommandHandler'
import { MoveColsCommandHandler } from '../features/column/MoveColsCommandHandler'
import { DefaultSelectionState } from '../features/selection/DefaultSelectionState'
import { SelectionController } from '../features/selection/SelectionController'
import { SelectionEventHandler } from '../features/selection/SelectionEventHandler'
import { resolveViewMergeRegion } from './MergeViewResolver'

/**
 * `GridEngine` 默认实现。
 *
 * 管理 `ChunkedAxis`、`FrozenRegions`、`Viewport` 与 `DataSource` 绑定。
 * `setData` 会重建轴与 viewport（字段/行数变化时）；`getFrame()` 产出不可变快照供渲染。
 */
export class DefaultGridEngine implements GridEngine {
  /** raw 可变数据源（InMemoryDataSource 等）；mutation 方法直接操作此字段。 */
  private rawData: DataSource
  /** HideRowsLayer + 可见列过滤后的视图数据源；getFrame() / getDataSource() 等读取此字段。 */
  private data: DataSource
  private theme: Theme
  private readonly excelHeaders: boolean
  private explicitDefaultRowHeight: number | undefined
  /** Layout 领域聚合根：自持 rowsAxis/colsAxis/frozen/viewport，engine 全部委派。 */
  private readonly layout: DefaultLayoutState
  /** 行/列/区 raw↔view 翻译唯一入口；getter 读引擎活状态（data/rawData/columnStructure）。 */
  private readonly coords = new CoordinateSpace({
    getViewData: () => this.data,
    getRawSchema: () => this.rawData.getSchema(),
    isColHidden: (id) => this.columnStructure.isColHidden(id),
  })
  private readonly selection = new DefaultSelectionState()
  private cellEdit = new CellEditModel()
  private undoStack = new UndoStack()
  /**
   * undo 派发：全 21 kind 经 `UndoRegistry` 路由到各域 undo handler（无中心 switch）。
   * 各域在构造函数经 `registerXxxUndo` 自注册；派发核心 `UndoReplay` 不认识任何具体 kind。
   */
  private readonly undoRegistry = new UndoRegistry()
  private readonly undoReplay = new UndoReplay(this.undoRegistry)
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
  /**
   * Selection 写入门面；engine 经此写选区，不直连聚合 mutation（invariant #3）。
   * merge lookup 经 resolveViewMergeRegion 做 view→raw→view 翻译，sort/filter/隐藏列下亦正确。
   */
  private readonly selectionController = new SelectionController(this.selection, {
    resolveMergeRegion: (rowIndex, colIndex) =>
      resolveViewMergeRegion(this.mergeStore, this.coords, rowIndex, colIndex)?.range ?? null,
  })
  /**
   * Format/Merge 写入门面；engine 经此做 5 个正向 mutation 的编排，不直连 store mutation。
   * undo restore 仍在 engine 统一 switch（与 selection 一致）。
   */
  private readonly formatController = new FormatController(this.formatStore, this.mergeStore, {
    translateRange: (range) => this.coords.viewRangeToRaw(range),
    pushUndo: (command) => this.undoStack.push(command),
    getSelection: () => this.selection.getSelection(),
    selectRange: (range) => this.selectionController.setSelectedRange(range),
  })
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
  private readonly eventPipeline = new GridEventPipeline([
    new SelectionEventHandler(this.selection, {
      getVisibleFieldIds: () => this.data.getSchema().fields.map((field) => field.id),
    }),
    new FormatEventHandler({
      remapFormatRows: (indexMap) => this.formatStore.remapByRowIndexMap(indexMap),
      remapMergeRows: (indexMap) => this.mergeStore.remapByRowIndexMap(indexMap),
      remapFormatAfterRowsInserted: (at, count) =>
        this.formatStore.remapAfterRowsInserted(at, count),
      remapMergeAfterRowsInserted: (at, count) =>
        this.mergeStore.remapAfterRowsInserted(at, count),
      remapFormatAfterRowsDeleted: (rowIds) =>
        this.formatStore.remapAfterRowsDeleted([...rowIds].sort((a, b) => a - b)),
      remapMergeAfterRowsDeleted: (rowIds) =>
        this.mergeStore.remapAfterRowsDeleted([...rowIds].sort((a, b) => a - b)),
      remapFormatAfterColsInserted: (at, count) =>
        this.formatStore.remapAfterColsInserted(at, count),
      remapMergeAfterColsInserted: (at, count) =>
        this.mergeStore.remapAfterColsInserted(at, count),
      remapFormatAfterColsDeleted: (idx) =>
        this.formatStore.remapAfterColsDeleted([...idx].sort((a, b) => a - b)),
      remapMergeAfterColsDeleted: (idx) =>
        this.mergeStore.remapAfterColsDeleted([...idx].sort((a, b) => a - b)),
      remapFormatCols: (m) => this.formatStore.remapByColIndexMap(m),
      remapMergeCols: (m) => this.mergeStore.remapByColIndexMap(m),
    }),
  ])
  private readonly columnStructure!: DefaultColumnStructure
  private readonly insertColsCommand!: InsertColsCommandHandler
  private readonly deleteColsCommand!: DeleteColsCommandHandler
  private readonly hideColsCommand!: HideColsCommandHandler
  private readonly unhideColsCommand!: UnhideColsCommandHandler
  private readonly moveColsCommand!: MoveColsCommandHandler
  private readonly rowStructure: DefaultRowStructure
  private readonly moveRowsCommand: MoveRowsCommandHandler
  private readonly insertRowsCommand: InsertRowsCommandHandler
  private readonly deleteRowsCommand: DeleteRowsCommandHandler
  private readonly hideRowsCommand: HideRowsCommandHandler
  private readonly unhideRowsCommand: UnhideRowsCommandHandler

  constructor(options: GridEngineOptions) {
    this.rawData = options.data
    this.theme = options.theme ?? denseGridTheme
    this.excelHeaders = options.excelHeaders === true
    this.explicitDefaultRowHeight = options.defaultRowHeight
    this.layout = new DefaultLayoutState({
      theme: this.theme,
      explicitDefaultRowHeight: this.explicitDefaultRowHeight,
      excelHeaders: this.excelHeaders,
      frozenInput: options.frozen,
      getSchema: () => this.rawData.getSchema(),
    })
    this.rowStructure = new DefaultRowStructure(this.rawData, () =>
      this.layout.resolveDefaultRowHeight(),
    )
    this.moveRowsCommand = new MoveRowsCommandHandler(this.rowStructure, this.eventPipeline)
    this.insertRowsCommand = new InsertRowsCommandHandler(this.rowStructure, this.eventPipeline)
    this.deleteRowsCommand = new DeleteRowsCommandHandler(this.rowStructure, this.eventPipeline)
    this.hideRowsCommand = new HideRowsCommandHandler(this.rowStructure, this.eventPipeline)
    this.unhideRowsCommand = new UnhideRowsCommandHandler(this.rowStructure, this.eventPipeline)
    this.columnStructure = new DefaultColumnStructure(this.rawData, () =>
      this.layout.averageColWidth(),
    )
    this.insertColsCommand = new InsertColsCommandHandler(this.columnStructure, this.eventPipeline)
    this.deleteColsCommand = new DeleteColsCommandHandler(this.columnStructure, this.eventPipeline)
    this.hideColsCommand = new HideColsCommandHandler(this.columnStructure, this.eventPipeline)
    this.unhideColsCommand = new UnhideColsCommandHandler(this.columnStructure, this.eventPipeline)
    this.moveColsCommand = new MoveColsCommandHandler(this.columnStructure, this.eventPipeline)
    this.data = this.columnStructure.getColViewData(this.rowStructure.getRowViewData())
    this.layout.initView(
      this.rowStructure.getViewRowsAxis(),
      this.columnStructure.getViewColsAxis(),
    )
    registerCellUndo(this.undoRegistry, {
      applyCellWrite: (rowIndex, fieldId, value) =>
        this.applyEditCellWrite(rowIndex, fieldId, value),
      restoreSelectionAfterEdit: (rowIndex, fieldId) =>
        this.restoreSelectionForEdit(rowIndex, fieldId),
      restoreSelectionForWrites: (writes, fallbackRange) =>
        this.restoreSelectionForWrites(writes, fallbackRange),
    })
    registerFormatUndo(this.undoRegistry, {
      restoreFormat: (layers) => this.formatStore.restore(layers),
      restoreMerge: (regions) => this.mergeStore.restore(regions),
      restoreSelection: (selection) => this.selectionController.setSelection(selection),
    })
    registerRowUndo(this.undoRegistry, {
      setRowHeight: (rowIndex, height) => this.rowStructure.setRowHeight(rowIndex, height),
      setRowHeightsMulti: (rowIds, height) => this.rowStructure.setRowHeightsMulti(rowIds, height),
      addHiddenRows: (ids) => this.rowStructure.addHidden(ids),
      removeHiddenRows: (ids) => this.rowStructure.removeHidden(ids),
      rebuildRows: () => this.layout.rebuildRows(this.rowStructure.getViewRowsAxis()),
      restoreSelection: (selection) => this.selectionController.setSelection(selection),
      resolveDefaultRowHeight: () => this.layout.resolveDefaultRowHeight(),
    })
    registerColumnUndo(this.undoRegistry, {
      setColWidth: (colIndex, width) => this.columnStructure.setColWidth(colIndex, width),
      setColWidthById: (fieldId, width) => this.columnStructure.setColWidthById(fieldId, width),
      addHiddenCols: (ids) => this.columnStructure.addHidden(ids),
      removeHiddenCols: (ids) => this.columnStructure.removeHidden(ids),
      rebuildCols: () => this.layout.rebuildCols(this.columnStructure.getViewColsAxis()),
      restoreSelection: (selection) => this.selectionController.setSelection(selection),
      getDefaultColWidth: () => this.columnStructure.getDefaultColWidth(),
    })
    registerFillUndo(this.undoRegistry, {
      applyCellWrite: (rowIndex, fieldId, value) => this.applyEditCellWrite(rowIndex, fieldId, value),
      restoreSelectionForWrites: (writes, fallbackRange) =>
        this.restoreSelectionForWrites(writes, fallbackRange),
      restoreFormat: (layers) => this.formatStore.restore(layers),
      restoreMerge: (regions) => this.mergeStore.restore(regions),
    })
    registerRowStructureUndo(this.undoRegistry, {
      canInsertRows: () => !!(isMutableDataSource(this.rawData) && this.rawData.insertRows),
      canDeleteRows: () => !!(isMutableDataSource(this.rawData) && this.rawData.deleteRows),
      deleteRowsByIds: (ids) => this.rowStructure.deleteRowsByIds(ids),
      insertBlankRows: (at, count) => this.rowStructure.insertBlankRows(at, count),
      reinsertRows: (snapshots, heights) => this.rowStructure.reinsertDeletedRows(snapshots, heights),
      replayMoveRows: (rowIds, beforeRowId, selection) =>
        this.applyMoveRowsCommand(rowIds, beforeRowId, selection),
      rebuildRows: () => this.layout.rebuildRows(this.rowStructure.getViewRowsAxis()),
      restoreFormat: (layers) => this.formatStore.restore(layers),
      restoreMerge: (regions) => this.mergeStore.restore(regions),
      restoreSelection: (selection) => this.selectionController.setSelection(selection),
    })
    registerColumnStructureUndo(this.undoRegistry, {
      reinsertCols: (snapshots, widths) => this.columnStructure.reinsertDeletedCols(snapshots, widths),
      removeFieldsByIds: (ids) => this.columnStructure.removeFieldsByIds(ids),
      insertFieldsAt: (at, fields, widths) => this.columnStructure.insertFieldsAt(at, fields, widths),
      replayMoveCols: (fieldIds, beforeFieldId, selection) =>
        this.applyMoveColsCommand(fieldIds, beforeFieldId, selection),
      restoreFrozen: (config) => this.layout.setFrozenConfig(config),
      rebuildCols: () => this.layout.rebuildCols(this.columnStructure.getViewColsAxis()),
      restoreFormat: (layers) => this.formatStore.restore(layers),
      restoreMerge: (regions) => this.mergeStore.restore(regions),
      restoreSelection: (selection) => this.selectionController.setSelection(selection),
    })
  }

  setData(data: DataSource): void {
    this.rowStructure.clearHidden()
    this.columnStructure.clearHidden()
    this.columnStructure.resetNewFieldCounter()
    this.rebuildData(data)
    this.undoStack.clear()
  }

  setViewData(data: DataSource, options: SetViewDataOptions = {}): void {
    this.finishActiveEdit()
    this.rebuildData(data)
    if (options.oldResolveUnderlyingRow) {
      this.selectionController.remapAfterViewRowsChanged({
        oldViewRowToRaw: options.oldResolveUnderlyingRow,
        rawRowToView: (rawRow) => this.coords.rawRowToView(rawRow),
      })
      return
    }
    if (options.clearSelection !== false) this.selectionController.clear()
  }

  private rebuildData(data: DataSource): void {
    this.rawData = data
    this.rowStructure.rebuild(this.rawData, () => this.layout.resolveDefaultRowHeight())
    this.columnStructure.rebuild(this.rawData, () => this.layout.averageColWidth())
    this.data = this.columnStructure.getColViewData(this.rowStructure.getRowViewData())
    this.layout.initView(
      this.rowStructure.getViewRowsAxis(),
      this.columnStructure.getViewColsAxis(),
    )
  }

  setTheme(theme: Theme): void {
    this.theme = theme
    this.layout.applyTheme(theme)
    if (this.explicitDefaultRowHeight === undefined) {
      this.rowStructure.setDefaultRowHeight(theme.metrics.rowHeight)
      this.layout.rebuildRows(this.rowStructure.getViewRowsAxis())
    }
  }

  setFrozen(config: Partial<FrozenConfig>): void {
    this.layout.setFrozenConfig(config)
  }

  setViewportSize(width: number, height: number): void {
    this.layout.setViewportSize(width, height)
  }

  setHeaderHeight(headerHeight: number): void {
    this.layout.setHeaderHeight(headerHeight)
  }

  setScroll(logicalX: number, logicalY: number): void {
    this.layout.setScroll(logicalX, logicalY)
  }

  setRowHeight(rowIndex: number, height: number): void {
    this.rowStructure.setRowHeight(rowIndex, height)
    this.layout.rebuildRows(this.rowStructure.getViewRowsAxis())
  }

  setColumnWidth(fieldId: string, width: number): void {
    const index = this.getRawColumnIndex(fieldId)
    if (index < 0) return
    this.columnStructure.setColWidth(index, width)
    this.layout.rebuildCols(this.columnStructure.getViewColsAxis())
  }

  selectCell(cell: CellAddress, options?: SelectCellOptions): void {
    this.selectionController.selectCell(cell, options)
  }

  clearSelection(): void {
    this.cancelCellEdit()
    this.selectionController.clear()
  }

  beginCellEdit(cell: CellAddress): boolean {
    // view→raw→view 翻译：合并格编辑落到 view 坐标的 anchor（sort/filter/隐藏列下亦正确）。
    const region = resolveViewMergeRegion(this.mergeStore, this.coords, cell.rowIndex, cell.colIndex)
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

    this.selectionController.navigate(intent, { rowCount, colCount })
    return true
  }

  getFrame(): RenderFrame {
    const rowsAxis = this.layout.getRowsAxis()
    const colsAxis = this.layout.getColsAxis()
    const vpSnap = this.layout.getViewport().snapshot()
    const allGaps = this.rowStructure.getCollapsedGaps()
    const [firstVisible, lastVisible] = rowsAxis.getVisibleRange(
      vpSnap.scrollY,
      vpSnap.scrollY + vpSnap.contentRect.height,
    )
    const collapsedRowGaps = allGaps
      .filter((g) => g.atViewRow >= firstVisible && g.atViewRow <= lastVisible)
      .map((g) => ({
        ...g,
        yPx: rowsAxis.indexToPosition(g.atViewRow + 1) - vpSnap.scrollY,
      }))
    const allColGaps = this.columnStructure.getCollapsedColGaps()
    const [firstVisibleCol, lastVisibleCol] = colsAxis.getVisibleRange(
      vpSnap.scrollX,
      vpSnap.scrollX + vpSnap.contentRect.width,
    )
    const collapsedColGaps = allColGaps
      .filter((g) => g.atViewCol >= firstVisibleCol && g.atViewCol <= lastVisibleCol)
      .map((g) => ({
        ...g,
        xPx: colsAxis.indexToPosition(g.atViewCol + 1) - vpSnap.scrollX,
      }))
    const mergeRegions = this.frameFormat.mergeRegions(
      firstVisible,
      lastVisible,
      firstVisibleCol,
      lastVisibleCol,
    )
    const cellFormats = this.frameFormat.cellFormats(
      firstVisible,
      lastVisible,
      firstVisibleCol,
      lastVisibleCol,
      mergeRegions,
    )
    return {
      data: this.data,
      theme: this.theme,
      rowsAxis,
      colsAxis,
      viewport: vpSnap,
      selection: this.selection.getSelection(),
      cellEdit: this.cellEdit.getSession() ?? undefined,
      collapsedRowGaps,
      collapsedColGaps,
      cellFormats,
      mergeRegions,
    }
  }

  getSelection(): GridSelection {
    return this.selection.getSelection()
  }

  getRowsTotalSize(): number {
    return this.layout.getRowsAxis().getTotalSize()
  }

  getColsTotalSize(): number {
    return this.layout.getColsAxis().getTotalSize()
  }

  getColumnIndex(fieldId: string): number {
    return this.data.getSchema().fields.findIndex((f) => f.id === fieldId)
  }

  getTheme(): Theme {
    return this.theme
  }

  getRowsAxis(): ChunkedAxis {
    return this.layout.getRowsAxis()
  }

  getColsAxis(): ChunkedAxis {
    return this.layout.getColsAxis()
  }

  getViewport(): Viewport {
    return this.layout.getViewport()
  }

  getData(): DataSource {
    return this.data
  }

  /** 返回视图数据源（HideRowsLayer 包裹后）。测试 / 外部代码通过此方法读取行数与单元格值。 */
  getDataSource(): DataSource {
    return this.data
  }

  /** 当前行高（单行）。rowIndex 为 underlying raw 索引，委托给 rowStructure。 */
  getRowHeight(rowIndex: number): number {
    return this.rowStructure.getRowHeight(rowIndex)
  }

  /** 主题默认行高（或 options.defaultRowHeight 覆盖值）。 */
  getDefaultRowHeight(): number {
    return this.layout.resolveDefaultRowHeight()
  }

  /** 返回当前隐藏行的 underlying row id 升序数组。 */
  getHiddenRows(): readonly number[] {
    return this.rowStructure.getHiddenRows()
  }

  /**
   * 在 beforeUnderlyingRow 位置前插入 count 空白行。
   * 触发 UndoStack 并将新行 id 返回。
   */
  insertRows(beforeUnderlyingRow: number, count: number): readonly number[] {
    const selectionBefore = this.selection.getSelection()
    const formatBefore = this.formatStore.snapshot()
    const mergeBefore = this.mergeStore.snapshot()
    const event = this.insertRowsCommand.execute({
      kind: 'insertRows',
      at: beforeUnderlyingRow,
      count,
    })
    if (!event) return []
    this.layout.rebuildRows(this.rowStructure.getViewRowsAxis())
    const selectionAfter = this.selection.getSelection()
    this.undoStack.push({
      kind: 'insertRows',
      at: event.at,
      count: event.count,
      newIds: event.newRowIds,
      selectionBefore,
      selectionAfter,
      formatBefore,
      formatAfter: this.formatStore.snapshot(),
      mergeBefore,
      mergeAfter: this.mergeStore.snapshot(),
    })
    return event.newRowIds
  }

  /**
   * 删除给定 underlying row id 集合（调用方保证升序、去重）。
   * 返回被删行快照，供上层 UI 反馈。
   */
  deleteRows(underlyingRowIds: readonly number[]): void {
    const selectionBefore = this.selection.getSelection()
    const formatBefore = this.formatStore.snapshot()
    const mergeBefore = this.mergeStore.snapshot()
    const event = this.deleteRowsCommand.execute({
      kind: 'deleteRows',
      rowIds: underlyingRowIds,
    })
    if (!event) return
    this.layout.rebuildRows(this.rowStructure.getViewRowsAxis())
    const selectionAfter = this.selection.getSelection()
    this.undoStack.push({
      kind: 'deleteRows',
      snapshots: event.snapshots,
      deletedHeights: event.deletedHeights,
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
    const selectionBefore = this.selection.getSelection()
    const event = this.hideRowsCommand.execute({ kind: 'hideRows', rowIds: underlyingRowIds })
    if (!event) return
    this.layout.rebuildRows(this.rowStructure.getViewRowsAxis())
    const selectionAfter = this.selection.getSelection()
    this.undoStack.push({
      kind: 'hideRows',
      underlyingRowIds: event.rowIds,
      selectionBefore,
      selectionAfter,
    })
  }

  /**
   * 取消隐藏给定 underlying row id 集合（幂等：未隐藏的行不重复计入命令）。
   */
  unhideRows(underlyingRowIds: readonly number[]): void {
    const selectionBefore = this.selection.getSelection()
    const event = this.unhideRowsCommand.execute({ kind: 'unhideRows', rowIds: underlyingRowIds })
    if (!event) return
    this.layout.rebuildRows(this.rowStructure.getViewRowsAxis())
    const selectionAfter = this.selection.getSelection()
    this.undoStack.push({
      kind: 'unhideRows',
      underlyingRowIds: event.rowIds,
      selectionBefore,
      selectionAfter,
    })
  }

  /**
   * 批量设置多行高度为同一个值 h。
   */
  setRowHeights(rowIds: readonly number[], h: number): void {
    const selectionBefore = this.selection.getSelection()
    const oldHeights = rowIds.map((id) => this.rowStructure.getRowHeight(id))
    this.rowStructure.setRowHeightsMulti(rowIds, h)
    this.layout.rebuildRows(this.rowStructure.getViewRowsAxis())
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

    this.finishActiveEdit()
    const selectionBefore = this.selection.getSelection()
    const formatBefore = this.formatStore.snapshot()
    const mergeBefore = this.mergeStore.snapshot()
    const event = this.moveRowsCommand.execute({ kind: 'moveRows', rowIds, beforeRowId })
    if (!event) return false
    this.layout.rebuildRows(this.rowStructure.getViewRowsAxis())
    const selectionAfter = this.selection.getSelection()
    this.undoStack.push({
      kind: 'moveRows',
      rowIds: event.rowIds,
      beforeRowId: event.beforeRowId,
      inverseRowIds: event.inverseRowIds,
      inverseBeforeRowId: event.inverseBeforeRowId,
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
    const selectionBefore = this.selection.getSelection()
    const formatBefore = this.formatStore.snapshot()
    const mergeBefore = this.mergeStore.snapshot()
    const frozenBefore = this.layout.getFrozenConfig()
    const event = this.insertColsCommand.execute({ kind: 'insertCols', beforeFieldIndex, count })
    if (!event) return []
    this.layout.remapFrozenAfterColInsert(
      event.at,
      event.count,
      this.rawData.getSchema().fields.length - event.count,
    )
    this.layout.rebuildCols(this.columnStructure.getViewColsAxis())
    const selectionAfter = this.selection.getSelection()
    const frozenAfter = this.layout.getFrozenConfig()
    this.undoStack.push({
      kind: 'insertCols',
      at: event.at,
      count: event.count,
      newFields: event.newFields,
      selectionBefore,
      selectionAfter,
      frozenBefore,
      frozenAfter,
      formatBefore,
      formatAfter: this.formatStore.snapshot(),
      mergeBefore,
      mergeAfter: this.mergeStore.snapshot(),
    })
    return event.newFields
  }

  /** 按 fieldId 删除列，返回删除快照。 */
  deleteCols(fieldIds: readonly string[]): readonly RemovedFieldSnapshot[] {
    const selectionBefore = this.selection.getSelection()
    const formatBefore = this.formatStore.snapshot()
    const mergeBefore = this.mergeStore.snapshot()
    const frozenBefore = this.layout.getFrozenConfig()
    const totalColsBefore = this.rawData.getSchema().fields.length
    const event = this.deleteColsCommand.execute({ kind: 'deleteCols', fieldIds })
    if (!event) return []
    this.layout.remapFrozenAfterColDelete(event.removedIndices, totalColsBefore)
    this.layout.rebuildCols(this.columnStructure.getViewColsAxis())
    const selectionAfter = this.selection.getSelection()
    const frozenAfter = this.layout.getFrozenConfig()
    this.undoStack.push({
      kind: 'deleteCols',
      snapshots: event.snapshots,
      deletedWidths: event.deletedWidths,
      selectionBefore,
      selectionAfter,
      frozenBefore,
      frozenAfter,
      formatBefore,
      formatAfter: this.formatStore.snapshot(),
      mergeBefore,
      mergeAfter: this.mergeStore.snapshot(),
    })
    return event.snapshots
  }

  /** 隐藏给定 fieldId 集合。 */
  hideCols(fieldIds: readonly string[]): void {
    const selectionBefore = this.selection.getSelection()
    const event = this.hideColsCommand.execute({ kind: 'hideCols', fieldIds })
    if (!event) return
    this.layout.rebuildCols(this.columnStructure.getViewColsAxis())
    const selectionAfter = this.selection.getSelection()
    this.undoStack.push({
      kind: 'hideCols',
      fieldIds: event.fieldIds,
      selectionBefore,
      selectionAfter,
    })
  }

  /** 取消隐藏给定 fieldId 集合。 */
  unhideCols(fieldIds: readonly string[]): void {
    const selectionBefore = this.selection.getSelection()
    const event = this.unhideColsCommand.execute({ kind: 'unhideCols', fieldIds })
    if (!event) return
    this.layout.rebuildCols(this.columnStructure.getViewColsAxis())
    const selectionAfter = this.selection.getSelection()
    this.undoStack.push({
      kind: 'unhideCols',
      fieldIds: event.fieldIds,
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
      oldWidths.push(this.columnStructure.getColWidth(idx))
      changed.push(id)
    }
    if (changed.length === 0) return
    this.columnStructure.setColWidthsMulti(changed, widthPx)
    this.layout.rebuildCols(this.columnStructure.getViewColsAxis())
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
    return this.columnStructure.getHiddenCols()
  }

  /** 返回当前冻结配置快照。 */
  getFrozenConfig(): FrozenConfig {
    return this.layout.getFrozenConfig()
  }

  /** 按 fieldId 移动列组；cell 值、hidden 状态与列宽都按 fieldId 锚定。 */
  moveCols(fieldIds: readonly string[], beforeFieldId: string | null): boolean {
    if (!isMutableDataSource(this.rawData) || !this.rawData.moveFields) return false
    this.finishActiveEdit()
    const selectionBefore = this.selection.getSelection()
    const formatBefore = this.formatStore.snapshot()
    const mergeBefore = this.mergeStore.snapshot()
    this.selectionController.captureVisibleFieldIdsBefore(
      this.data.getSchema().fields.map((field) => field.id),
    )
    const event = this.moveColsCommand.execute({ kind: 'moveCols', fieldIds, beforeFieldId })
    if (!event) return false
    this.layout.rebuildCols(this.columnStructure.getViewColsAxis())
    const selectionAfter = this.selection.getSelection()
    this.undoStack.push({
      kind: 'moveCols',
      fieldIds: event.fieldIds,
      beforeFieldId: event.beforeFieldId,
      inverseBeforeFieldId: event.inverseBeforeFieldId,
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
    this.selectionController.setSelection(selection)
  }

  undo(): UndoCommand | undefined {
    const cmd = this.undoStack.popUndo()
    if (!cmd) return undefined
    this.undoReplay.undo(cmd)
    return cmd
  }

  redo(): UndoCommand | undefined {
    const cmd = this.undoStack.popRedo()
    if (!cmd) return undefined
    this.undoReplay.redo(cmd)
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
    this.rowStructure.setRowHeight(rowIndex, newHeight)
    this.layout.rebuildRows(this.rowStructure.getViewRowsAxis())
    this.undoStack.push({ kind: 'resizeRow', rowIndex, before: oldHeight, after: newHeight })
  }

  commitColumnResize(colIndex: number, oldWidth: number, newWidth: number): void {
    if (oldWidth === newWidth) return
    const rawColIndex = this.getRawColumnIndexForViewIndex(colIndex)
    if (rawColIndex < 0) return
    this.columnStructure.setColWidth(rawColIndex, newWidth)
    this.layout.rebuildCols(this.columnStructure.getViewColsAxis())
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
    this.selectionController.setSelectedRange(result)
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
    return this.formatController.setFillColor(range, color)
  }

  /**
   * 设置 view `range` 的文本显示模式（overflow/wrap/clip）。view→raw 翻译，
   * 非连续映射返回 false；快照前后一致也返回 false（沿用 format undo 命令）。
   */
  setTextWrap(range: CellRange, mode: TextWrapMode): boolean {
    this.finishActiveEdit()
    return this.formatController.setTextWrap(range, mode)
  }

  /**
   * 给 view `range` 设置边框；`preset === 'clear'` 需 `border === null` 并清除。
   * Phase 5-B 起支持全部 `lineStyle`（solid/dashed/dotted/double）。`range` 须已归一化。
   * 写入前把 view range 翻译为 raw range；快照前后一致则不入栈并返回 false。
   */
  setBorders(range: CellRange, preset: BorderPreset, border: BorderStyle | null): boolean {
    this.finishActiveEdit()
    return this.formatController.setBorders(range, preset, border)
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
    return this.formatController.mergeCells(range)
  }

  /**
   * Phase 5-A — 取消 view `range` 触及的所有合并区域。
   * 把 view range 翻译为 raw range（非连续映射时 null → 返回 false）；
   * 移除任何区域则入栈一条 unmerge 命令并返回 true，否则返回 false。
   */
  unmergeCells(range: CellRange): boolean {
    this.finishActiveEdit()
    return this.formatController.unmergeCells(range)
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

  private applyMoveColsCommand(
    fieldIds: readonly string[],
    beforeFieldId: string | null,
    selection: GridSelection,
  ): void {
    if (!isMutableDataSource(this.rawData) || !this.rawData.moveFields) return
    // undo/redo 路径：command.execute 经管线 dispatch 的 columnsMoved 会触发 format/merge
    // remap，但调用方随后用 formatStore/mergeStore.restore(快照) 覆盖它——故此处 remap 被丢弃，
    // 不要因此移除调用方的 restore（否则 store 会被 double-remap）。
    const event = this.moveColsCommand.execute({ kind: 'moveCols', fieldIds, beforeFieldId })
    if (!event) return
    this.layout.rebuildCols(this.columnStructure.getViewColsAxis())
    this.selectionController.setSelection(selection)
  }

  private applyMoveRowsCommand(
    rowIds: readonly number[],
    beforeRowId: number | null,
    selection: GridSelection,
  ): void {
    if (!isMutableDataSource(this.rawData) || !this.rawData.moveRows) return
    // undo/redo 路径：command.execute 经管线 dispatch 的 rowsMoved 会触发 format/merge remap，
    // 但调用方随后用 formatStore/mergeStore.restore(快照) 覆盖它——故此处 remap 被丢弃，
    // 不要因此移除调用方的 restore（否则 store 会被 double-remap）。
    const event = this.moveRowsCommand.execute({ kind: 'moveRows', rowIds, beforeRowId })
    if (!event) return
    this.layout.rebuildRows(this.rowStructure.getViewRowsAxis())
    this.selectionController.setSelection(selection)
  }

  private restoreSelectionForWrites(writes: readonly CellWrite[], fallbackRange: CellRange): void {
    const visibleRows: number[] = []
    for (const write of writes) {
      const viewRow = this.coords.rawRowToView(write.rowIndex)
      if (viewRow !== -1) visibleRows.push(viewRow)
    }
    if (visibleRows.length === 0) return
    this.selectionController.setSelectedRange({
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
    this.selectionController.selectCell({ rowIndex: viewRow, colIndex })
  }

  private finishActiveEdit(): void {
    if (!this.cellEdit.isEditing()) return
    if (!this.commitCellEdit()) this.cancelCellEdit()
  }

  private getRawColumnIndex(fieldId: string): number {
    return this.coords.fieldIdToRaw(fieldId)
  }

  private getRawColumnIndexForViewIndex(viewColIndex: number): number {
    return this.coords.viewColToRaw(viewColIndex)
  }

  private fieldAt(colIndex: number) {
    return this.data.getSchema().fields[colIndex]
  }
}
