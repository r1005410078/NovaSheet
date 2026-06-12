import type { CellValue, Field } from '../kernel/data/Schema'
import type { DataSource } from '../kernel/data/DataSource'
import { isMutableDataSource } from '../kernel/data/MutableDataSource'
import type { RemovedFieldSnapshot } from '../kernel/data/MutableDataSource'
import type { ExcelWorkspaceSize } from '../features/excel-workspace'
import type { ApplyPasteSource, PasteTargetRect } from '../features/clipboard/ApplyPaste'
import type { PasteSkippedCell } from '../features/clipboard/types'
import { PasteController } from '../features/clipboard/PasteController'
import type { FillDirection, FillMergeSnap } from '../features/fill/FillTarget'
import { FillController } from '../features/fill/FillController'
import { DefaultFormatState } from '../features/format/FormatState'
import type {
  BorderPreset,
  BorderStyle,
  CellFormatter,
  CellFormat,
  TextWrapMode,
  ValueFormat,
} from '../kernel/protocol/FormatTypes'
import type { MergeRegion } from '../kernel/coords/MergeRegion'
import { EditController } from '../features/edit/EditController'
import { CellEditModel } from '../features/edit/CellEditModel'
import type { CellTypeRegistry } from '../features/cell-types'
import { parseSelectionNavigationKey } from '../features/selection/SelectionNavigation'
import type {
  CellAddress,
  CellRange,
  GridSelection,
  SelectCellOptions,
} from '../kernel/coords/SelectionTypes'
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
import { registerCellUndo } from '../features/edit/registerCellUndo'
import { registerFormatUndo } from '../features/format/registerFormatUndo'
import { registerRowUndo } from '../features/row/registerRowUndo'
import { registerColumnUndo } from '../features/column/registerColumnUndo'
import { registerFillUndo } from '../features/fill/registerFillUndo'
import { registerRowStructureUndo } from '../features/row/registerRowStructureUndo'
import { registerColumnStructureUndo } from '../features/column/registerColumnStructureUndo'
import { CoordinateSpace } from '../kernel/coords/CoordinateSpace'
import { VisibleFormatResolver } from '../features/format/VisibleFormatResolver'
import { FormatController } from '../features/format/FormatController'
import { FillStylePropagator } from '../features/fill/FillStylePropagator'
import { GridEventPipeline } from '../kernel/protocol/GridEventPipeline'
import { FormatEventHandler } from '../features/format/FormatEventHandler'
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
import { resolveViewMergeRegion } from '../features/merge/MergeViewResolver'
import { StructuralMutationCoordinator } from './StructuralMutationCoordinator'
import { assembleRenderFrame } from './FrameAssembler'

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
  /** Phase 5-C — 自定义 formatter 注册表。 */
  private readonly formatters: Readonly<Record<string, CellFormatter>>
  /** Phase 5-C — formatter locale。 */
  private readonly locale: string
  /** 单元格类型语义注册表。 */
  private readonly cellTypes: CellTypeRegistry
  /** Layout 领域聚合根：自持 rowsAxis/colsAxis/frozen/viewport，engine 全部委派。 */
  private readonly layout: DefaultLayoutState
  /** 行/列/区 raw↔view 翻译唯一入口；getter 读引擎活状态（data/rawData/columnStructure）。 */
  private readonly coords = new CoordinateSpace({
    getViewData: () => this.data,
    getRawSchema: () => this.rawData.getSchema(),
    isColHidden: (id) => this.columnStructure.isColHidden(id),
  })
  private readonly selection = new DefaultSelectionState()
  private readonly editController = new EditController(new CellEditModel(), {
    getData: () => this.data,
    getCellTypes: () => this.cellTypes,
    getLocale: () => this.locale,
    resolveEditCell: (cell) =>
      resolveViewMergeRegion(this.formatState.mergeStore, this.coords, cell.rowIndex, cell.colIndex)
        ?.anchor ?? cell,
    viewRowToRaw: (viewRow) => this.coords.viewRowToRaw(viewRow),
    pushUndo: (command) => this.undoStack.push(command),
  })
  private readonly pasteController = new PasteController({
    getMutableData: () => (isMutableDataSource(this.data) ? this.data : null),
    viewRangeToRaw: (range) => this.coords.viewRangeToRaw(range),
    getMergeSnapshot: () => this.formatState.mergeStore.snapshot(),
    getSchema: () => this.data.getSchema(),
    viewRowToRaw: (viewRow) => this.coords.viewRowToRaw(viewRow),
    pushUndo: (command) => this.undoStack.push(command),
  })
  private readonly fillController = new FillController({
    getMutableData: () => (isMutableDataSource(this.data) ? this.data : null),
    viewRowToRaw: (viewRow) => this.coords.viewRowToRaw(viewRow),
    pushUndo: (command) => this.undoStack.push(command),
    propagateFillStyles: (source, fill, direction) =>
      this.fillStyles.propagateFillStyles(source, fill, direction),
    selectRange: (range) => this.selectionController.setSelectedRange(range),
  })
  private undoStack = new UndoStack()
  /**
   * undo 派发：全 21 kind 经 `UndoRegistry` 路由到各域 undo handler（无中心 switch）。
   * 各域在构造函数经 `registerXxxUndo` 自注册；派发核心 `UndoReplay` 不认识任何具体 kind。
   */
  private readonly undoRegistry = new UndoRegistry()
  private readonly undoReplay = new UndoReplay(this.undoRegistry)
  /** Phase 5-A — format/merge 聚合根；store 按 **raw** 坐标键控，结构变更经 remap 面委托。 */
  private readonly formatState = new DefaultFormatState()
  /**
   * Selection 写入门面；engine 经此写选区，不直连聚合 mutation（invariant #3）。
   * merge lookup 经 resolveViewMergeRegion 做 view→raw→view 翻译，sort/filter/隐藏列下亦正确。
   */
  private readonly selectionController = new SelectionController(this.selection, {
    resolveMergeRegion: (rowIndex, colIndex) =>
      resolveViewMergeRegion(this.formatState.mergeStore, this.coords, rowIndex, colIndex)?.range ?? null,
  })
  /**
   * Format/Merge 写入门面；engine 经此做 5 个正向 mutation 的编排，不直连 store mutation。
   * undo restore 仍在 engine 统一 switch（与 selection 一致）。
   */
  private readonly formatController = new FormatController(this.formatState, {
    translateRange: (range) => this.coords.viewRangeToRaw(range),
    pushUndo: (command) => this.undoStack.push(command),
    getSelection: () => this.selection.getSelection(),
    selectRange: (range) => this.selectionController.setSelectedRange(range),
  })
  /** 可见 format/merge → VIEW 帧字段的只读解析器（从 getFrame 抽出，R1）。 */
  private readonly frameFormat = new VisibleFormatResolver(
    this.formatState.formatStore,
    this.formatState.mergeStore,
    this.coords,
  )
  /** 填充柄「携带格式/合并」平铺逻辑（从 commitFill 抽出，R1）。 */
  private readonly fillStyles = new FillStylePropagator(
    this.formatState.formatStore,
    this.formatState.mergeStore,
    this.coords,
  )
  private readonly eventPipeline = new GridEventPipeline([
    new SelectionEventHandler(this.selection, {
      getVisibleFieldIds: () => this.data.getSchema().fields.map((field) => field.id),
    }),
    new FormatEventHandler(this.formatState),
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
  private readonly structural = new StructuralMutationCoordinator({
    getSelection: () => this.selection.getSelection(),
    pushUndo: (command) => this.undoStack.push(command),
    rebuildRows: () => this.layout.rebuildRows(this.rowStructure.getViewRowsAxis()),
    rebuildCols: () => this.layout.rebuildCols(this.columnStructure.getViewColsAxis()),
    snapshotFormatMerge: () => ({
      formatBefore: this.formatState.formatStore.snapshot(),
      mergeBefore: this.formatState.mergeStore.snapshot(),
    }),
    snapshotFormatMergeAfter: () => ({
      formatAfter: this.formatState.formatStore.snapshot(),
      mergeAfter: this.formatState.mergeStore.snapshot(),
    }),
    getFrozenConfig: () => this.layout.getFrozenConfig(),
  })

  constructor(options: GridEngineOptions) {
    this.rawData = options.data
    this.theme = options.theme ?? denseGridTheme
    this.excelHeaders = options.excelHeaders === true
    this.explicitDefaultRowHeight = options.defaultRowHeight
    this.formatters = options.formatters ?? {}
    this.locale = options.locale ?? 'en-US'
    this.cellTypes = options.cellTypes ?? {}
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
      restoreFormat: (layers) => this.formatState.restoreFormat(layers),
      restoreMerge: (regions) => this.formatState.restoreMerge(regions),
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
      restoreFormat: (layers) => this.formatState.restoreFormat(layers),
      restoreMerge: (regions) => this.formatState.restoreMerge(regions),
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
      restoreFormat: (layers) => this.formatState.restoreFormat(layers),
      restoreMerge: (regions) => this.formatState.restoreMerge(regions),
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
      restoreFormat: (layers) => this.formatState.restoreFormat(layers),
      restoreMerge: (regions) => this.formatState.restoreMerge(regions),
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

  resizeExcelWorkspace(size: ExcelWorkspaceSize): boolean {
    if (!isExcelWorkspaceDataSource(this.rawData)) return false
    this.rawData.resizeWorkspace(size)
    this.rebuildData(this.rawData)
    return true
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
    return this.editController.beginCellEdit(cell)
  }

  updateCellEditDraft(draft: string): void {
    this.editController.updateDraft(draft)
  }

  cancelCellEdit(): void {
    this.editController.cancel()
  }

  commitCellEdit(): boolean {
    return this.editController.commit()
  }

  commitCellValue(cell: CellAddress, fieldId: string, value: CellValue | null): boolean {
    return this.editController.commitCellValue(cell, fieldId, value)
  }

  isCellEditing(): boolean {
    return this.editController.isEditing()
  }

  clearRange(range: CellRange): void {
    this.editController.clearRange(range)
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
    return assembleRenderFrame({
      data: this.data,
      theme: this.theme,
      rowsAxis: this.layout.getRowsAxis(),
      colsAxis: this.layout.getColsAxis(),
      viewport: this.layout.getViewport().snapshot(),
      selection: this.selection.getSelection(),
      cellEdit: this.editController.getSession() ?? undefined,
      allRowGaps: this.rowStructure.getCollapsedGaps(),
      allColGaps: this.columnStructure.getCollapsedColGaps(),
      frameFormat: this.frameFormat,
      formatters: this.formatters,
      locale: this.locale,
    })
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
    const event = this.structural.runCommandStructural({
      execute: () =>
        this.insertRowsCommand.execute({ kind: 'insertRows', at: beforeUnderlyingRow, count }),
      rebuild: 'rows',
      withFormatMerge: true,
      buildUndo: (event, sel, ex) => ({
        kind: 'insertRows',
        at: event.at,
        count: event.count,
        newIds: event.newRowIds,
        selectionBefore: sel.selectionBefore,
        selectionAfter: sel.selectionAfter,
        formatBefore: ex!.formatBefore!,
        formatAfter: ex!.formatAfter!,
        mergeBefore: ex!.mergeBefore!,
        mergeAfter: ex!.mergeAfter!,
      }),
    })
    return event?.newRowIds ?? []
  }

  /**
   * 删除给定 underlying row id 集合（调用方保证升序、去重）。
   * 返回被删行快照，供上层 UI 反馈。
   */
  deleteRows(underlyingRowIds: readonly number[]): void {
    this.structural.runCommandStructural({
      execute: () => this.deleteRowsCommand.execute({ kind: 'deleteRows', rowIds: underlyingRowIds }),
      rebuild: 'rows',
      withFormatMerge: true,
      buildUndo: (event, sel, ex) => ({
        kind: 'deleteRows',
        snapshots: event.snapshots,
        deletedHeights: event.deletedHeights,
        selectionBefore: sel.selectionBefore,
        selectionAfter: sel.selectionAfter,
        formatBefore: ex!.formatBefore!,
        formatAfter: ex!.formatAfter!,
        mergeBefore: ex!.mergeBefore!,
        mergeAfter: ex!.mergeAfter!,
      }),
    })
  }

  /**
   * 隐藏给定 underlying row id 集合（幂等：已隐藏的行不重复计入命令）。
   */
  hideRows(underlyingRowIds: readonly number[]): void {
    this.structural.runCommandStructural({
      execute: () => this.hideRowsCommand.execute({ kind: 'hideRows', rowIds: underlyingRowIds }),
      rebuild: 'rows',
      buildUndo: (event, sel) => ({
        kind: 'hideRows',
        underlyingRowIds: event.rowIds,
        selectionBefore: sel.selectionBefore,
        selectionAfter: sel.selectionAfter,
      }),
    })
  }

  /**
   * 取消隐藏给定 underlying row id 集合（幂等：未隐藏的行不重复计入命令）。
   */
  unhideRows(underlyingRowIds: readonly number[]): void {
    this.structural.runCommandStructural({
      execute: () => this.unhideRowsCommand.execute({ kind: 'unhideRows', rowIds: underlyingRowIds }),
      rebuild: 'rows',
      buildUndo: (event, sel) => ({
        kind: 'unhideRows',
        underlyingRowIds: event.rowIds,
        selectionBefore: sel.selectionBefore,
        selectionAfter: sel.selectionAfter,
      }),
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
    const event = this.structural.runCommandStructural({
      execute: () => this.moveRowsCommand.execute({ kind: 'moveRows', rowIds, beforeRowId }),
      rebuild: 'rows',
      withFormatMerge: true,
      buildUndo: (event, sel, ex) => ({
        kind: 'moveRows',
        rowIds: event.rowIds,
        beforeRowId: event.beforeRowId,
        inverseRowIds: event.inverseRowIds,
        inverseBeforeRowId: event.inverseBeforeRowId,
        selectionBefore: sel.selectionBefore,
        selectionAfter: sel.selectionAfter,
        formatBefore: ex!.formatBefore!,
        formatAfter: ex!.formatAfter!,
        mergeBefore: ex!.mergeBefore!,
        mergeAfter: ex!.mergeAfter!,
      }),
    })
    return event !== null
  }

  /** 在 schema field index 位置前插入 count 个文本列。 */
  insertCols(beforeFieldIndex: number, count: number): readonly Field[] {
    const event = this.structural.runCommandStructural({
      execute: () =>
        this.insertColsCommand.execute({ kind: 'insertCols', beforeFieldIndex, count }),
      rebuild: 'cols',
      withFormatMerge: true,
      withFrozen: true,
      afterExecute: (event) =>
        this.layout.remapFrozenAfterColInsert(
          event.at,
          event.count,
          this.rawData.getSchema().fields.length - event.count,
        ),
      buildUndo: (event, sel, ex) => ({
        kind: 'insertCols',
        at: event.at,
        count: event.count,
        newFields: event.newFields,
        selectionBefore: sel.selectionBefore,
        selectionAfter: sel.selectionAfter,
        frozenBefore: ex!.frozenBefore!,
        frozenAfter: ex!.frozenAfter!,
        formatBefore: ex!.formatBefore!,
        formatAfter: ex!.formatAfter!,
        mergeBefore: ex!.mergeBefore!,
        mergeAfter: ex!.mergeAfter!,
      }),
    })
    return event?.newFields ?? []
  }

  /** 按 fieldId 删除列，返回删除快照。 */
  deleteCols(fieldIds: readonly string[]): readonly RemovedFieldSnapshot[] {
    let totalColsBefore = 0
    const event = this.structural.runCommandStructural({
      beforeExecute: () => {
        totalColsBefore = this.rawData.getSchema().fields.length
      },
      execute: () => this.deleteColsCommand.execute({ kind: 'deleteCols', fieldIds }),
      rebuild: 'cols',
      withFormatMerge: true,
      withFrozen: true,
      afterExecute: (event) =>
        this.layout.remapFrozenAfterColDelete(event.removedIndices, totalColsBefore),
      buildUndo: (event, sel, ex) => ({
        kind: 'deleteCols',
        snapshots: event.snapshots,
        deletedWidths: event.deletedWidths,
        selectionBefore: sel.selectionBefore,
        selectionAfter: sel.selectionAfter,
        frozenBefore: ex!.frozenBefore!,
        frozenAfter: ex!.frozenAfter!,
        formatBefore: ex!.formatBefore!,
        formatAfter: ex!.formatAfter!,
        mergeBefore: ex!.mergeBefore!,
        mergeAfter: ex!.mergeAfter!,
      }),
    })
    return event?.snapshots ?? []
  }

  /** 隐藏给定 fieldId 集合。 */
  hideCols(fieldIds: readonly string[]): void {
    this.finishActiveEdit()
    this.structural.runCommandStructural({
      execute: () => this.hideColsCommand.execute({ kind: 'hideCols', fieldIds }),
      rebuild: 'cols',
      buildUndo: (event, sel) => ({
        kind: 'hideCols',
        fieldIds: event.fieldIds,
        selectionBefore: sel.selectionBefore,
        selectionAfter: sel.selectionAfter,
      }),
    })
  }

  /** 取消隐藏给定 fieldId 集合。 */
  unhideCols(fieldIds: readonly string[]): void {
    this.finishActiveEdit()
    this.structural.runCommandStructural({
      execute: () => this.unhideColsCommand.execute({ kind: 'unhideCols', fieldIds }),
      rebuild: 'cols',
      buildUndo: (event, sel) => ({
        kind: 'unhideCols',
        fieldIds: event.fieldIds,
        selectionBefore: sel.selectionBefore,
        selectionAfter: sel.selectionAfter,
      }),
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
    const event = this.structural.runCommandStructural({
      beforeExecute: () =>
        this.selectionController.captureVisibleFieldIdsBefore(
          this.data.getSchema().fields.map((field) => field.id),
        ),
      execute: () => this.moveColsCommand.execute({ kind: 'moveCols', fieldIds, beforeFieldId }),
      rebuild: 'cols',
      withFormatMerge: true,
      buildUndo: (event, sel, ex) => ({
        kind: 'moveCols',
        fieldIds: event.fieldIds,
        beforeFieldId: event.beforeFieldId,
        inverseBeforeFieldId: event.inverseBeforeFieldId,
        selectionBefore: sel.selectionBefore,
        selectionAfter: sel.selectionAfter,
        formatBefore: ex!.formatBefore!,
        formatAfter: ex!.formatAfter!,
        mergeBefore: ex!.mergeBefore!,
        mergeAfter: ex!.mergeAfter!,
      }),
    })
    return event !== null
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
    this.pasteController.commit(source, target, fieldIdsAtCols, onSkipped)
  }

  commitFill(
    source: CellRange,
    fill: CellRange,
    direction: FillDirection,
  ): FillCommitResult | null {
    return this.fillController.commit(source, fill, direction)
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
  /** 设置 view `range` 值格式（Phase 5-C）。 */
  setValueFormat(range: CellRange, valueFormat: ValueFormat): boolean {
    this.finishActiveEdit()
    return this.formatController.setValueFormat(range, valueFormat)
  }

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
    return this.formatState.resolveCellFormat(rowIndex, colIndex)
  }

  /** 解析 view 坐标的单元格格式；无格式返回 undefined。 */
  getViewCellFormat(viewRow: number, viewCol: number): CellFormat | undefined {
    const rawRow = this.coords.viewRowToRaw(viewRow)
    const rawCol = this.coords.viewColToRaw(viewCol)
    if (rawCol < 0) return undefined
    return this.formatState.resolveCellFormat(rawRow, rawCol)
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
    return this.formatState.getMergeRegionAt(rowIndex, colIndex)
  }

  /** 返回覆盖 view 坐标单元格的合并区域；无则返回 null。 */
  getViewMergeRegion(viewRow: number, viewCol: number): MergeRegion | null {
    return resolveViewMergeRegion(this.formatState.mergeStore, this.coords, viewRow, viewCol)
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
    if (!this.editController.isEditing()) return
    if (!this.commitCellEdit()) this.cancelCellEdit()
  }

  private getRawColumnIndex(fieldId: string): number {
    return this.coords.fieldIdToRaw(fieldId)
  }

  private getRawColumnIndexForViewIndex(viewColIndex: number): number {
    return this.coords.viewColToRaw(viewColIndex)
  }
}

interface ExcelWorkspaceResizableDataSource extends DataSource {
  resizeWorkspace(size: ExcelWorkspaceSize): void
}

function isExcelWorkspaceDataSource(data: DataSource): data is ExcelWorkspaceResizableDataSource {
  return typeof (data as ExcelWorkspaceResizableDataSource).resizeWorkspace === 'function'
}
