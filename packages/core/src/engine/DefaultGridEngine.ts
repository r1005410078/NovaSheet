import type { CellValue, ColumnGroupChild, ColumnGroupsSnapshot, Field } from '../kernel/data/Schema'
import { ColumnGroupStore } from '../features/column-groups/ColumnGroupStore'
import {
  deriveSelectedGroupIds,
  resolveColumnGroupLayout,
  type ColumnGroupLayout,
} from '../features/column-groups/resolveColumnGroupLayout'
import type { DataSource, DataSourceEvent } from '../kernel/data/DataSource'
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
import {
  CellTypeController,
  CellTypeStore,
  registerCellTypeUndo,
  type CellTypeOverride,
  type CellTypeRegistry,
  type CellTypeSnapshot,
} from '../features/cell-types'
import type { CellAttachmentCodec } from '../kernel/protocol/AttachmentTypes'
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
import type {
  HoveredColumnHeaderMenu,
  RenderFrame,
  RenderFrameColumnGroupHeader,
} from '../kernel/render/RenderFrame'
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
import { CellTypeEventHandler } from '../features/cell-types/CellTypeEventHandler'
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
import { ValidationRuleStore } from '../features/validation/ValidationRuleStore'
import { ValidationResultStore } from '../features/validation/ValidationResultStore'
import { ValidationScheduler } from '../features/validation/ValidationScheduler'
import type { RawCell } from '../features/validation/ValidationScheduler'
import { ValidationService } from '../features/validation/ValidationService'
import { ValidationEventHandler } from '../features/validation/ValidationEventHandler'
import type { ValidationRule, ValidationState } from '../kernel/protocol/ValidationTypes'
import type { RawRange } from '../kernel/coords/coordinates'

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
  /** 列组树运行时状态；随 rawData schema 重建（构造/setData 抛错即 fail loud，见 ColumnGroupStore）。 */
  private columnGroups: ColumnGroupStore
  /**
   * `resolveColumnGroupLayout` 结果缓存：脏标记模式，`columnGroupLayoutVersion` 在会改变
   * 其输入（tree/visibleFields）的路径递增——`rebuildData`（schema 换）、`structural` 的
   * `rebuildCols` 闭包（insert/delete/hide/unhide/move cols 正向执行）、以及三处 undo/redo
   * 重放（`registerColumnUndo`/`registerColumnStructureUndo`/`applyMoveColsCommand`，
   * 它们绕过 `structural` 闭包直接调 `layout.rebuildCols`，须各自补一次 bump）；列宽调整不触发。
   */
  private columnGroupLayoutVersion = 0
  private columnGroupLayoutCache: { version: number; layout: ColumnGroupLayout | null } | null = null
  private theme: Theme
  private readonly excelHeaders: boolean
  private explicitDefaultRowHeight: number | undefined
  /** Phase 5-C — 自定义 formatter 注册表。 */
  private readonly formatters: Readonly<Record<string, CellFormatter>>
  /** Phase 5-C — formatter locale。 */
  private readonly locale: string
  /** 单元格类型语义注册表。 */
  private readonly cellTypes: CellTypeRegistry
  /** Fill handle 是否携带源格 resolved cell type；默认开启。 */
  private readonly fillCellTypes: boolean
  /** 附件 codec 注册表（namespace → codec）。 */
  private readonly codecRegistry = new Map<string, CellAttachmentCodec<unknown>>()
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
    resolveCellType: (cell, field) =>
      this.hasCellTypeOverrideAtView(cell.rowIndex, cell.colIndex)
        ? this.getCellType(cell.rowIndex, cell.colIndex)
        : field.type,
    viewRowToRaw: (viewRow) => this.coords.viewRowToRaw(viewRow),
    viewColToRaw: (viewCol) => this.coords.viewColToRaw(viewCol),
    pushUndo: (command) => this.undoStack.push(command),
    getAttachmentStore: () => this.formatState.attachmentStore,
  })
  private readonly pasteController = new PasteController({
    getMutableData: () => (isMutableDataSource(this.data) ? this.data : null),
    viewRangeToRaw: (range) => this.coords.viewRangeToRaw(range),
    getMergeSnapshot: () => this.formatState.mergeStore.snapshot(),
    getSchema: () => this.data.getSchema(),
    viewRowToRaw: (viewRow) => this.coords.viewRowToRaw(viewRow),
    pushUndo: (command) => this.undoStack.push(command),
    resolveCellType: (rowIndex, colIndex, fieldId) =>
      this.data.getSchema().fields.some((field) => field.id === fieldId)
        ? this.getCellType(rowIndex, colIndex)
        : 'text',
    getAttachmentStore: () => this.formatState.attachmentStore,
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
  /** Cell type override store（raw 坐标）。 */
  private readonly cellTypeStore = new CellTypeStore()
  /** 校验规则 store（raw 坐标）。 */
  private readonly validationRuleStore = new ValidationRuleStore()
  /** 校验结果缓存（raw 坐标）。 */
  private readonly validationResultStore = new ValidationResultStore()
  /** 校验执行服务；构造函数完成后初始化。 */
  private readonly validationService: ValidationService
  /** 批量调度器；构造函数完成后初始化。 */
  private readonly validationScheduler: ValidationScheduler
  /** 校验完成后的重绘回调；由 GridRuntime 在挂载时注入（engine 纯层，不直调 DOM）。 */
  private validationRedrawCallback: () => void = () => undefined
  /**
   * 数据源变更（rowsChanged/rowCountChanged/reset）后的重绘回调；由 GridRuntime 在挂载时注入
   * （同 validationRedrawCallback 模式，engine 纯层不直调 DOM）。桥接 WindowedDataSource 等
   * 异步/推送数据源到重绘管线——静止页面上后台拉取完成或推送到达时，无任何同步调用点会触发
   * invalidate，必须靠此订阅回调。
   */
  private dataChangeRedrawCallback: () => void = () => undefined
  /** 当前对 this.data 的取消订阅函数；rebuildData 换 this.data 引用后需先退订旧引用再订阅新引用。 */
  private unsubscribeFromData: () => void = () => undefined
  /**
   * rowCountChanged/reset 触发的 rebuildData 是否已排入下一个 microtask；
   * 用于合并同一轮同步事件里的多次触发，避免排队多个冗余 rebuild。
   */
  private dataRebuildScheduled = false
  /**
   * dispose() 是否已调用（回归修复，见 dispose() 与 scheduleDataRebuild() 注释）。
   * scheduleDataRebuild 用 queueMicrotask 延迟执行；若该 microtask 在 dispose() 调用前已排队，
   * dispose 之后它仍会跑到，命中行数不一致分支会调 rebuildData()，其收尾的 subscribeToData()
   * 会把刚被 dispose 掉的订阅重新建立起来——必须在 microtask 真正执行时（而非排队时）重新检查。
   */
  private disposed = false
  /** 列头悬停菜单状态；null 表示无悬停，构帧时转 undefined。 */
  private hoveredColumnHeaderMenu: HoveredColumnHeaderMenu | null = null
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
  /** CellType 写入门面：view→raw、快照比较、undo 入栈。 */
  private readonly cellTypeController = new CellTypeController(this.cellTypeStore, {
    translateRange: (range) => this.coords.viewRangeToRaw(range),
    pushUndo: (command) => this.undoStack.push(command),
    getSelection: () => this.selection.getSelection(),
  })
  /** 可见 format/merge → VIEW 帧字段的只读解析器（从 getFrame 抽出，R1）。 */
  private readonly frameFormat = new VisibleFormatResolver(
    this.formatState.formatStore,
    this.formatState.mergeStore,
    this.coords,
  )
  /** 填充柄「携带格式/合并」平铺逻辑（从 commitFill 抽出，R1）。 */
  private readonly fillStyles: FillStylePropagator
  private readonly eventPipeline = new GridEventPipeline([
    new SelectionEventHandler(this.selection, {
      getVisibleFieldIds: () => this.data.getSchema().fields.map((field) => field.id),
    }),
    new FormatEventHandler(this.formatState),
    new CellTypeEventHandler(this.cellTypeStore),
    new ValidationEventHandler(this.validationRuleStore, this.validationResultStore),
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
    // insertCols/deleteCols/hideCols/unhideCols/moveCols 正向执行都经此闭包重建列轴，会改变
    // visibleFields（列组布局输入之一），故列组布局缓存在此一并失效；对应的 undo/redo 重放
    // 绕过此闭包，各自在调用 layout.rebuildCols 处补了同样的 bump（见三处 registerColumn*Undo）。
    rebuildCols: () => {
      this.layout.rebuildCols(this.columnStructure.getViewColsAxis())
      this.columnGroupLayoutVersion += 1
    },
    snapshotFormatMerge: () => ({
      formatBefore: this.formatState.formatStore.snapshot(),
      mergeBefore: this.formatState.mergeStore.snapshot(),
      cellTypeBefore: this.snapshotCellTypes(),
    }),
    snapshotFormatMergeAfter: () => ({
      formatAfter: this.formatState.formatStore.snapshot(),
      mergeAfter: this.formatState.mergeStore.snapshot(),
      cellTypeAfter: this.snapshotCellTypes(),
    }),
    getFrozenConfig: () => this.layout.getFrozenConfig(),
  })

  constructor(options: GridEngineOptions) {
    this.rawData = options.data
    // 构造即校验（越过 fields 引用/不连续/重复等三条规则即 throw，fail loud）；须先于
    // `this.layout` 构造——下方 getGroupHeaderDepth 闭包引用 this.columnGroups，闭包本身
    // 惰性求值不受声明顺序影响，但此处仍需保证 initView() 首次调用它之前已完成赋值。
    this.columnGroups = new ColumnGroupStore(
      this.rawData.getSchema().fields,
      this.rawData.getSchema().columnGroups,
    )
    this.theme = options.theme ?? denseGridTheme
    this.excelHeaders = options.excelHeaders === true
    this.explicitDefaultRowHeight = options.defaultRowHeight
    this.formatters = options.formatters ?? {}
    this.locale = options.locale ?? 'en-US'
    this.cellTypes = options.cellTypes ?? {}
    this.fillCellTypes = options.fillCellTypes !== false
    this.fillStyles = new FillStylePropagator(
      this.formatState.formatStore,
      this.formatState.mergeStore,
      this.formatState.attachmentStore,
      this.cellTypeStore,
      this.coords,
      (rowIndex, colIndex) => {
        const field = this.rawData.getSchema().fields[colIndex]
        return field ? this.cellTypeStore.resolve(rowIndex, colIndex, field) : 'text'
      },
      (rawCol) => this.rawData.getSchema().fields[rawCol],
      this.fillCellTypes,
    )
    for (const codec of options.cellAttachments ?? []) {
      this.codecRegistry.set(codec.namespace, codec)
    }
    this.layout = new DefaultLayoutState({
      theme: this.theme,
      explicitDefaultRowHeight: this.explicitDefaultRowHeight,
      excelHeaders: this.excelHeaders,
      frozenInput: options.frozen,
      getSchema: () => this.rawData.getSchema(),
      getGroupHeaderDepth: () => this.columnGroups.getDepth(),
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
      restoreAttachments: (snap) => this.formatState.restoreAttachments(snap),
    })
    registerFormatUndo(this.undoRegistry, {
      restoreFormat: (layers) => this.formatState.restoreFormat(layers),
      restoreMerge: (regions) => this.formatState.restoreMerge(regions),
      restoreSelection: (selection) => this.selectionController.setSelection(selection),
      restoreAttachments: (snap) => this.formatState.restoreAttachments(snap),
    })
    registerCellTypeUndo(this.undoRegistry, {
      restoreCellTypes: (snapshot) => this.cellTypeStore.restore(snapshot),
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
      // undo/redo 重放绕过 structural.rebuildCols 闭包，需在此单独 bump 列组布局缓存版本。
      rebuildCols: () => {
        this.layout.rebuildCols(this.columnStructure.getViewColsAxis())
        this.columnGroupLayoutVersion += 1
      },
      restoreSelection: (selection) => this.selectionController.setSelection(selection),
      getDefaultColWidth: () => this.columnStructure.getDefaultColWidth(),
    })
    registerFillUndo(this.undoRegistry, {
      applyCellWrite: (rowIndex, fieldId, value) => this.applyEditCellWrite(rowIndex, fieldId, value),
      restoreSelectionForWrites: (writes, fallbackRange) =>
        this.restoreSelectionForWrites(writes, fallbackRange),
      restoreFormat: (layers) => this.formatState.restoreFormat(layers),
      restoreMerge: (regions) => this.formatState.restoreMerge(regions),
      restoreAttachments: (snap) => this.formatState.restoreAttachments(snap),
      restoreCellTypes: (snapshot) => this.cellTypeStore.restore(snapshot),
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
      restoreCellTypes: (snapshot) => this.restoreCellTypes(snapshot),
      restoreSelection: (selection) => this.selectionController.setSelection(selection),
    })
    registerColumnStructureUndo(this.undoRegistry, {
      reinsertCols: (snapshots, widths) => this.columnStructure.reinsertDeletedCols(snapshots, widths),
      removeFieldsByIds: (ids) => this.columnStructure.removeFieldsByIds(ids),
      insertFieldsAt: (at, fields, widths) => this.columnStructure.insertFieldsAt(at, fields, widths),
      replayMoveCols: (fieldIds, beforeFieldId, selection) =>
        this.applyMoveColsCommand(fieldIds, beforeFieldId, selection),
      restoreFrozen: (config) => this.layout.setFrozenConfig(config),
      // undo/redo 重放绕过 structural.rebuildCols 闭包，需在此单独 bump 列组布局缓存版本。
      rebuildCols: () => {
        this.layout.rebuildCols(this.columnStructure.getViewColsAxis())
        this.columnGroupLayoutVersion += 1
      },
      restoreFormat: (layers) => this.formatState.restoreFormat(layers),
      restoreMerge: (regions) => this.formatState.restoreMerge(regions),
      restoreCellTypes: (snapshot) => this.restoreCellTypes(snapshot),
      restoreColumnGroups: (snap) => this.columnGroups.restore(snap),
      restoreSelection: (selection) => this.selectionController.setSelection(selection),
    })
    this.validationService = new ValidationService({
      ruleStore: this.validationRuleStore,
      resultStore: this.validationResultStore,
      getCell: (rawRow, fieldId) => this.data.getCell(rawRow, fieldId),
      getField: (rawCol) => {
        const fields = this.data.getSchema().fields
        return fields[rawCol] ?? undefined
      },
      getResolvedType: (rawRow, rawCol) => {
        const field = this.data.getSchema().fields[rawCol]
        return field ? this.cellTypeStore.resolve(rawRow, rawCol, field) : 'text'
      },
      validators: options.validators,
      locale: this.locale,
    })
    this.validationScheduler = new ValidationScheduler(
      (r, c) => this.validationService.validateCell(r, c),
      () => this.validationRedrawCallback(),
      {
        batchSize: options.validationBatchSize ?? 50,
        maxConcurrent: options.validationMaxConcurrent ?? 4,
      },
    )
    this.subscribeToData()
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
    // 每次换数据源都重新校验+重建组树（构造抛错即 fail loud）；旧树对新 schema 可能已非法
    // （fieldId 不存在/不连续等），不能延续复用。
    this.columnGroups = new ColumnGroupStore(
      this.rawData.getSchema().fields,
      this.rawData.getSchema().columnGroups,
    )
    this.columnGroupLayoutVersion += 1
    this.rowStructure.rebuild(this.rawData, () => this.layout.resolveDefaultRowHeight())
    this.columnStructure.rebuild(this.rawData, () => this.layout.averageColWidth())
    this.data = this.columnStructure.getColViewData(this.rowStructure.getRowViewData())
    this.layout.initView(
      this.rowStructure.getViewRowsAxis(),
      this.columnStructure.getViewColsAxis(),
    )
    this.subscribeToData()
  }

  /** 订阅当前 this.data（outermost 装饰链）的 DataSourceEvent 流；先退订旧引用，防止监听孤儿对象或漏订新引用。 */
  private subscribeToData(): void {
    this.unsubscribeFromData()
    this.unsubscribeFromData = this.data.subscribe((event) => this.handleDataSourceEvent(event))
  }

  /**
   * 桥接数据源事件到重绘管线（无同步调用点时的兜底通道，如 WindowedDataSource 后台拉取/推送）。
   * rowsChanged 直接触发重绘；rowCountChanged/reset 需要 rebuildData 重建行/列轴——
   * HideRowsLayer._handleUpstreamEvent 对裸 rowCountChanged 不会重算 visibleRows（只认
   * rowsInserted/rowsDeleted/reset），必须靠 rebuildData 从 rawData.getRowCount() 重新派生
   * （复用同一 HideRowsLayer 实例，隐藏行集合不丢）。其余结构事件（rowsInserted 等）已由各自
   * command-handler 的同步调用点处理（含 layout.rebuildRows + facade invalidate），此处忽略避免重复处理。
   */
  private handleDataSourceEvent(event: DataSourceEvent): void {
    if (this.disposed) return
    switch (event.type) {
      case 'rowsChanged':
        this.dataChangeRedrawCallback()
        break
      case 'rowCountChanged':
      case 'reset':
        this.scheduleDataRebuild()
        break
      default:
        break
    }
  }

  /**
   * rebuildData 绝不能在这个事件的同步派发栈里跑：this.data 装饰链上游（SortLayer/FilterLayer/
   * HideRowsLayer 各自的转发 wrapper）都用活 Set 做 `for (const listener of this.listeners)`
   * 分发（SortLayer 自己也留了注释记录过同一个坑——见 SortLayer.ts handleUpstreamEvent 附近）。
   * rebuildData 会新建一个 HiddenDataSource 并在其构造函数里同步订阅同一个 upstream；若仍在
   * 这轮 emit 的 for-of 里执行，新订阅的监听器会被同一次遍历继续访问（Set 迭代器会看到遍历期间
   * 新增的项），再次触发 handleDataSourceEvent → rebuildData → 再次新增监听器……无限递归。
   * queueMicrotask 保证 rebuildData 在当前同步派发栈完全展开之后才跑，从根上掐断重入；
   * 布尔位合并同一轮同步事件里的多次触发，避免排队多个冗余 rebuild。
   *
   * 幂等检查（回归修复，见下方 if）：InMemoryDataSource 的 insertRows/deleteRows 等结构性
   * mutation 走 *CommandHandler 同步执行——mutable.xxxRows() 触发本函数排队之后，同一个调用栈里
   * 紧接着就会同步更新 rowStructure.rawRowsAxis（见 DefaultRowStructure.insertRows/deleteRows），
   * 使其在这个 microtask 真正跑之前就已经与 rawData.getRowCount() 一致；此时若仍无条件
   * rebuildData()，等于用默认行高、不保留 scroll 的 layout.initView() 覆盖掉命令处理器刚同步做
   * 对的事（丢自定义行高、滚动归零）。只有真正没有同步调用点处理过的行数漂移（WindowedDataSource
   * 后台 epoch 收缩/resync）才会在这里持续不一致，需要真正 rebuild。
   * 重绘回调不受这个判断影响、始终执行——`reset` 也可能在行数不变时发出（如
   * WindowedDataSource.handleResyncEvent 整体标记缓存失效但行数未变），此时行/列轴不需要重建，
   * 但仍需要一次重绘去 hintWindow 重新拉取已失效的缓存；这个回调本身是幂等的重绘请求（同
   * rowsChanged 分支），与已有的同步 invalidate 合并到同一帧，多调一次没有副作用。
   */
  private scheduleDataRebuild(): void {
    if (this.dataRebuildScheduled) return
    this.dataRebuildScheduled = true
    queueMicrotask(() => {
      this.dataRebuildScheduled = false
      // 若此 microtask 在 dispose() 调用前已排队，dispose 之后仍会跑到这里——此时决不能再碰
      // rebuildData()/subscribeToData()，否则会把刚被 dispose 掉的订阅重新建立起来。
      if (this.disposed) return
      if (this.rawData.getRowCount() !== this.rowStructure.getRawRowCount()) {
        this.rebuildData(this.rawData)
      }
      this.dataChangeRedrawCallback()
    })
  }

  /**
   * 释放 engine 持有的外部订阅（当前仅 this.data 的 DataSourceEvent 订阅）。
   * `DefaultGridEngine` 可脱离 `GridControllerImpl` 直接构造/使用（测试即如此）；此前只靠
   * `GridControllerImpl.destroy()` 先 dispose ViewPipeline 顺带切断上游，并非引擎自身的保证。
   *
   * 幂等：先置 disposed 再退订，重复调用安全（unsubscribeFromData 本身也允许重复调用）。
   * disposed 同时是 handleDataSourceEvent 与 scheduleDataRebuild 的 microtask 回调的门槛——
   * 后者尤其关键：dispose() 调用前已排队的 microtask 不受这次退订影响，必须在真正执行时
   * 重新检查这个标志，否则会经 rebuildData() 的收尾 subscribeToData() 复活刚被切断的订阅。
   */
  dispose(): void {
    this.disposed = true
    this.unsubscribeFromData()
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
    const editCell = this.editController.getSession()?.cell
    const result = this.editController.commit()
    if (result && editCell) {
      const rawRow = this.coords.viewRowToRaw(editCell.rowIndex)
      const rawCol = this.coords.viewColToRaw(editCell.colIndex)
      if (rawRow >= 0 && rawCol >= 0) this.validationScheduler.push([{ rawRow, rawCol }])
    }
    return result
  }

  commitCellValue(cell: CellAddress, fieldId: string, value: CellValue | null): boolean {
    const result = this.editController.commitCellValue(cell, fieldId, value)
    if (result) {
      const rawRow = this.coords.viewRowToRaw(cell.rowIndex)
      const rawCol = this.coords.viewColToRaw(cell.colIndex)
      if (rawRow >= 0 && rawCol >= 0) this.validationScheduler.push([{ rawRow, rawCol }])
    }
    return result
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
    const frame = assembleRenderFrame({
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
      viewRowToRaw: (viewRow) => this.coords.viewRowToRaw(viewRow),
      viewColToRaw: (viewCol) => this.coords.viewColToRaw(viewCol),
      resolveRawCellType: (row, col, field) => this.cellTypeStore.resolve(row, col, field),
      hasRawCellTypeOverride: (row, col) => this.cellTypeStore.get(row, col) !== undefined,
      attachmentStore: this.formatState.attachmentStore,
      getRawValidationState: (rawRow, rawCol) => {
        const s = this.validationResultStore.get(rawRow, rawCol)
        if (!s) return 'ok'
        return s.status
      },
      hoveredColumnHeaderMenu: this.hoveredColumnHeaderMenu ?? undefined,
    })
    frame.columnGroupHeader = this.buildColumnGroupHeaderFrame()
    const main = frame.viewport.regions.find((region) => region.id === 'main')
    if (main && main.rowRange[1] >= main.rowRange[0] && main.colRange[1] >= main.colRange[0]) {
      this.data.hintWindow?.({
        startRow: main.rowRange[0],
        endRow: main.rowRange[1],
        startCol: main.colRange[0],
        endCol: main.colRange[1],
      })
    }
    return frame
  }

  /**
   * `columnGroupHeader` frame 字段：布局（tree/visibleFields 决定的行结构）走缓存，
   * `selected` 逐帧派生（仅 O(组数)，随 selection 变化，不适合缓存）。
   * 无组或全组隐藏（`resolveColumnGroupLayout` 返回 null）时返回 undefined。
   */
  private buildColumnGroupHeaderFrame(): RenderFrameColumnGroupHeader | undefined {
    const layout = this.getColumnGroupLayout()
    if (!layout) return undefined
    const selectedGroupIds = deriveSelectedGroupIds(
      layout,
      this.selection.getSelection().selectedRange,
      this.data.getRowCount(),
    )
    return {
      depth: layout.depth,
      rows: layout.rows.map((row) =>
        row.map((cell) => ({ ...cell, selected: selectedGroupIds.has(cell.groupId) })),
      ),
      leafTopRowByViewCol: layout.leafTopRowByViewCol,
    }
  }

  private getColumnGroupLayout(): ColumnGroupLayout | null {
    if (this.columnGroupLayoutCache?.version === this.columnGroupLayoutVersion) {
      return this.columnGroupLayoutCache.layout
    }
    const layout = resolveColumnGroupLayout(this.columnGroups.getTree(), this.data.getSchema().fields)
    this.columnGroupLayoutCache = { version: this.columnGroupLayoutVersion, layout }
    return layout
  }

  setHoveredColumnHeaderMenu(state: HoveredColumnHeaderMenu | null): void {
    this.hoveredColumnHeaderMenu = state
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
        cellTypeBefore: ex!.cellTypeBefore!,
        cellTypeAfter: ex!.cellTypeAfter!,
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
        cellTypeBefore: ex!.cellTypeBefore!,
        cellTypeAfter: ex!.cellTypeAfter!,
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
        cellTypeBefore: ex!.cellTypeBefore!,
        cellTypeAfter: ex!.cellTypeAfter!,
      }),
    })
    return event !== null
  }

  /** 在 schema field index 位置前插入 count 个文本列。 */
  insertCols(beforeFieldIndex: number, count: number): readonly Field[] {
    // 无组时 hasGroups() 恒 false，columnGroupsBefore/After 缺省不写入 undo command
    // （见 UndoCommand.ts 上的注释——JSON round-trip 兼容既有命令）。
    const hasGroups = this.columnGroups.hasGroups()
    let fieldsBeforeGroups: readonly Field[] = []
    let columnGroupsBefore: ColumnGroupsSnapshot | undefined
    const event = this.structural.runCommandStructural({
      beforeExecute: () => {
        fieldsBeforeGroups = this.rawData.getSchema().fields
        if (hasGroups) columnGroupsBefore = this.columnGroups.snapshot()
      },
      execute: () =>
        this.insertColsCommand.execute({ kind: 'insertCols', beforeFieldIndex, count }),
      rebuild: 'cols',
      withFormatMerge: true,
      withFrozen: true,
      afterExecute: (event) => {
        this.layout.remapFrozenAfterColInsert(
          event.at,
          event.count,
          this.rawData.getSchema().fields.length - event.count,
        )
        this.columnGroups.applyInsertFields(
          event.at,
          event.newFields.map((f) => f.id),
          fieldsBeforeGroups,
        )
      },
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
        cellTypeBefore: ex!.cellTypeBefore!,
        cellTypeAfter: ex!.cellTypeAfter!,
        ...(hasGroups
          ? { columnGroupsBefore: columnGroupsBefore!, columnGroupsAfter: this.columnGroups.snapshot() }
          : {}),
      }),
    })
    return event?.newFields ?? []
  }

  /** 按 fieldId 删除列，返回删除快照。 */
  deleteCols(fieldIds: readonly string[]): readonly RemovedFieldSnapshot[] {
    let totalColsBefore = 0
    const hasGroups = this.columnGroups.hasGroups()
    let columnGroupsBefore: ColumnGroupsSnapshot | undefined
    const event = this.structural.runCommandStructural({
      beforeExecute: () => {
        totalColsBefore = this.rawData.getSchema().fields.length
        if (hasGroups) columnGroupsBefore = this.columnGroups.snapshot()
      },
      execute: () => this.deleteColsCommand.execute({ kind: 'deleteCols', fieldIds }),
      rebuild: 'cols',
      withFormatMerge: true,
      withFrozen: true,
      afterExecute: (event) => {
        this.layout.remapFrozenAfterColDelete(event.removedIndices, totalColsBefore)
        this.columnGroups.applyDeleteFields(event.snapshots.map((s) => s.field.id))
      },
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
        cellTypeBefore: ex!.cellTypeBefore!,
        cellTypeAfter: ex!.cellTypeAfter!,
        ...(hasGroups
          ? { columnGroupsBefore: columnGroupsBefore!, columnGroupsAfter: this.columnGroups.snapshot() }
          : {}),
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
    // 组一致性预检——先于任何 fields 变更；跨组移动整体 no-op（组用 raw fields，隐藏是纯视图
    // 概念，不影响树的 fieldId 归属判定，见 ColumnGroupStore.isMoveWithinSameGroup）。
    if (
      !this.columnGroups.isMoveWithinSameGroup(fieldIds, beforeFieldId, this.rawData.getSchema().fields)
    ) {
      return false
    }
    this.finishActiveEdit()
    const hasGroups = this.columnGroups.hasGroups()
    const columnGroupsBefore = hasGroups ? this.columnGroups.snapshot() : undefined
    const event = this.structural.runCommandStructural({
      beforeExecute: () =>
        this.selectionController.captureVisibleFieldIdsBefore(
          this.data.getSchema().fields.map((field) => field.id),
        ),
      execute: () => this.moveColsCommand.execute({ kind: 'moveCols', fieldIds, beforeFieldId }),
      rebuild: 'cols',
      withFormatMerge: true,
      afterExecute: () => {
        // execute() 已跑完 moveFields，此处 rawData schema 反映的是移动后的新序。
        this.columnGroups.applyMoveFields(this.rawData.getSchema().fields)
      },
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
        cellTypeBefore: ex!.cellTypeBefore!,
        cellTypeAfter: ex!.cellTypeAfter!,
        ...(hasGroups
          ? { columnGroupsBefore: columnGroupsBefore!, columnGroupsAfter: this.columnGroups.snapshot() }
          : {}),
      }),
    })
    return event !== null
  }

  /** Phase 4.5 — 程序化设置选区（不入 undo 栈）。 */
  setSelection(selection: GridSelection): void {
    this.selectionController.setSelection(selection)
  }

  /** 返回当前列组树（文档序，深拷贝，独立于内部 store）。无组返回空数组。 */
  getColumnGroups(): readonly ColumnGroupChild[] {
    return this.columnGroups.getTree()
  }

  /**
   * 组可见叶列整列选中；组不存在或组内叶列全隐藏时返回 false，不改动选区。
   * `anchorCell` 落首可见叶列（左边界），`activeCell`/`extentCell` 落末可见叶列（右边界，row
   * rowCount-1）——与 `InputController.selectWholeColumnRange(startCol, endCol)` 的整列选区字段填充惯例一致。
   */
  selectColumnGroup(groupId: string): boolean {
    const leafFieldIds = this.columnGroups.findGroupLeafFieldIds(groupId)
    if (!leafFieldIds) return false
    const visibleFieldIds = new Set(this.data.getSchema().fields.map((field) => field.id))
    const visibleLeafFieldIds = leafFieldIds.filter((id) => visibleFieldIds.has(id))
    if (visibleLeafFieldIds.length === 0) return false
    const viewCols = visibleLeafFieldIds.map((id) => this.getColumnIndex(id))
    const startCol = Math.min(...viewCols)
    const endCol = Math.max(...viewCols)
    const rowCount = this.data.getRowCount()
    // 无天然拖拽方向的程序化整选——按左到右 header-drag 惯例：anchor 左边界、active/extent
    // 右边界，与 InputController.selectWholeColumnRange(startCol, endCol) 约定一致。
    this.selectionController.setSelection({
      activeCell: { rowIndex: 0, colIndex: endCol },
      anchorCell: { rowIndex: 0, colIndex: startCol },
      extentCell: { rowIndex: rowCount - 1, colIndex: endCol },
      selectedRange: { startRow: 0, endRow: rowCount - 1, startCol, endCol },
    })
    return true
  }

  undo(): UndoCommand | undefined {
    const cmd = this.undoStack.popUndo()
    if (!cmd) return undefined
    this.undoReplay.undo(cmd)
    this.pushValidationForCommand(cmd)
    return cmd
  }

  redo(): UndoCommand | undefined {
    const cmd = this.undoStack.popRedo()
    if (!cmd) return undefined
    this.undoReplay.redo(cmd)
    this.pushValidationForCommand(cmd)
    return cmd
  }

  private pushValidationForCommand(cmd: UndoCommand): void {
    const cells: RawCell[] = []
    if (cmd.kind === 'editCell') {
      const rawRow = this.coords.viewRowToRaw(cmd.rowIndex)
      const rawCol = this.data.getSchema().fields.findIndex((f) => f.id === cmd.fieldId)
      if (rawRow >= 0 && rawCol >= 0) cells.push({ rawRow, rawCol })
    } else if (cmd.kind === 'paste' || cmd.kind === 'clearRange') {
      const range = cmd.kind === 'paste' ? cmd.target : cmd.range
      for (let r = range.startRow; r <= range.endRow; r++) {
        for (let c = range.startCol; c <= range.endCol; c++) {
          const rawRow = this.coords.viewRowToRaw(r)
          const rawCol = this.coords.viewColToRaw(c)
          if (rawRow >= 0 && rawCol >= 0) cells.push({ rawRow, rawCol })
        }
      }
    } else if (cmd.kind === 'fill') {
      const range = cmd.result
      for (let r = range.startRow; r <= range.endRow; r++) {
        for (let c = range.startCol; c <= range.endCol; c++) {
          const rawRow = this.coords.viewRowToRaw(r)
          const rawCol = this.coords.viewColToRaw(c)
          if (rawRow >= 0 && rawCol >= 0) cells.push({ rawRow, rawCol })
        }
      }
    }
    if (cells.length > 0) this.validationScheduler.push(cells)
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
    attachmentWrites?: readonly import('../features/clipboard/PasteController').AttachmentWrite[],
  ): void {
    this.pasteController.commit(source, target, fieldIdsAtCols, onSkipped, attachmentWrites)
    const cells: RawCell[] = []
    for (let r = target.startRow; r <= target.endRow; r++) {
      for (let c = target.startCol; c <= target.endCol; c++) {
        const rawRow = this.coords.viewRowToRaw(r)
        const rawCol = this.coords.viewColToRaw(c)
        if (rawRow >= 0 && rawCol >= 0) cells.push({ rawRow, rawCol })
      }
    }
    if (cells.length > 0) this.validationScheduler.push(cells)
  }

  commitFill(
    source: CellRange,
    fill: CellRange,
    direction: FillDirection,
  ): FillCommitResult | null {
    const result = this.fillController.commit(source, fill, direction)
    if (result) {
      const r = result.result
      const cells: RawCell[] = []
      for (let row = r.startRow; row <= r.endRow; row++) {
        for (let col = r.startCol; col <= r.endCol; col++) {
          const rawRow = this.coords.viewRowToRaw(row)
          const rawCol = this.coords.viewColToRaw(col)
          if (rawRow >= 0 && rawCol >= 0) cells.push({ rawRow, rawCol })
        }
      }
      if (cells.length > 0) this.validationScheduler.push(cells)
    }
    return result
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

  /** 给 raw cell 写扩展附件；data=undefined 清除；快照前后无变化返回 false。 */
  setCellAttachment(namespace: string, rawRow: number, rawCol: number, data: unknown): boolean {
    this.finishActiveEdit()
    return this.formatController.setCellAttachment(namespace, rawRow, rawCol, data)
  }

  /** 读 raw cell 的扩展附件；无则 undefined。 */
  getCellAttachment(namespace: string, rawRow: number, rawCol: number): unknown {
    return this.formatState.attachmentStore.get(namespace, rawRow, rawCol)
  }

  getAttachmentNamespaces(): readonly string[] {
    return [...this.codecRegistry.keys()]
  }

  getAttachmentCodec(namespace: string): import('../kernel/protocol/AttachmentTypes').CellAttachmentCodec<unknown> | undefined {
    return this.codecRegistry.get(namespace)
  }

  setCellType(range: CellRange, type: CellTypeOverride): boolean {
    this.finishActiveEdit()
    if (!this.canTranslateCellTypeRange(range)) return false
    return this.cellTypeController.setCellType(range, type)
  }

  clearCellType(range: CellRange): boolean {
    this.finishActiveEdit()
    if (!this.canTranslateCellTypeRange(range)) return false
    return this.cellTypeController.clearCellType(range)
  }

  getCellType(viewRow: number, viewCol: number): CellTypeOverride {
    if (viewRow < 0 || viewRow >= this.data.getRowCount()) return 'text'
    const rawCol = this.coords.viewColToRaw(viewCol)
    if (rawCol < 0) return 'text'
    const field = this.rawData.getSchema().fields[rawCol]
    if (!field) return 'text'
    const rawRow = this.coords.viewRowToRaw(viewRow)
    return this.cellTypeStore.resolve(rawRow, rawCol, field)
  }

  setValidationRule(rawRange: RawRange, rule: ValidationRule): void {
    this.validationRuleStore.setRange(rawRange, rule)
  }

  clearValidationRule(rawRange: RawRange): void {
    this.validationRuleStore.clearRange(rawRange)
  }

  validateAll(): void {
    const rowCount = this.data.getRowCount()
    const colCount = this.data.getSchema().fields.length
    const cells: RawCell[] = []
    for (let r = 0; r < rowCount; r++) {
      for (let c = 0; c < colCount; c++) {
        cells.push({ rawRow: r, rawCol: c })
      }
    }
    this.validationResultStore.clear()
    this.validationScheduler.pushAll(cells)
  }

  getValidationState(rawRow: number, rawCol: number): ValidationState | null {
    return this.validationResultStore.get(rawRow, rawCol)
  }

  setValidationRedrawCallback(cb: () => void): void {
    this.validationRedrawCallback = cb
  }

  setDataChangeRedrawCallback(cb: () => void): void {
    this.dataChangeRedrawCallback = cb
  }

  private hasCellTypeOverrideAtView(viewRow: number, viewCol: number): boolean {
    if (viewRow < 0 || viewRow >= this.data.getRowCount()) return false
    const rawCol = this.coords.viewColToRaw(viewCol)
    if (rawCol < 0) return false
    const rawRow = this.coords.viewRowToRaw(viewRow)
    return this.cellTypeStore.get(rawRow, rawCol) !== undefined
  }

  resolveRawCellTypeForField(rowIndex: number, field: Field): CellTypeOverride {
    const rawCol = this.rawData.getSchema().fields.findIndex((candidate) => candidate.id === field.id)
    if (rawCol < 0) return 'text'
    return this.cellTypeStore.resolve(rowIndex, rawCol, field)
  }

  private snapshotCellTypes(): CellTypeSnapshot {
    return this.cellTypeStore.snapshot()
  }

  private restoreCellTypes(snapshot: CellTypeSnapshot): void {
    this.cellTypeStore.restore(snapshot)
  }

  private canTranslateCellTypeRange(range: CellRange): boolean {
    const rowCount = this.data.getRowCount()
    return range.startRow >= 0 && range.endRow >= 0 && range.startRow < rowCount && range.endRow < rowCount
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

  /** view 行 → raw 行（sort/filter/hide 解析）。 */
  viewRowToRaw(viewRow: number): number { return this.coords.viewRowToRaw(viewRow) }

  /** view 列 → raw 列。 */
  viewColToRaw(viewCol: number): number { return this.coords.viewColToRaw(viewCol) }

  /** view range → raw range；排序/筛选打乱映射时返回 null。 */
  viewRangeToRaw(range: CellRange) {
    return this.coords.viewRangeToRaw(range)
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
    // undo/redo 重放绕过 structural.rebuildCols 闭包，需在此单独 bump 列组布局缓存版本。
    this.columnGroupLayoutVersion += 1
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
