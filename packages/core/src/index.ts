// @zhiguang/core 的公开 API barrel。
// 任何不在这里 export 的符号视为内部实现，不属于半稳定契约——CLAUDE.md「What goes where」。

// 对外 Grid 门面——渲染后端经 options.backend 注入（如 @zhiguang/canvas2d 的 canvas2dBackend）。
// 程序化引擎访问：使用下方 DefaultGridEngine。
export { Grid, withExcelHeaders } from './Grid'
export type { GridOptions } from './Grid'
export type { GridInteractions, ResolvedGridInteractions } from './dom/runtime/GridInteractions'
export { resolveGridInteractions } from './dom/runtime/GridInteractions'

// 数据层
export { InMemoryDataSource } from './kernel/data/InMemoryDataSource'
export { SparseExcelDataSource } from './kernel/data/SparseExcelDataSource'
export type {
  BuiltInFieldType,
  CellValue,
  ColumnGroup,
  ColumnGroupChild,
  Field,
  FieldType,
  Row,
  Schema,
} from './kernel/data/Schema'
export type { DataSource, DataSourceEvent, DataSourceListener, DataWindow } from './kernel/data/DataSource'
export type {
  CellUpdate,
  RangeSlice,
  WindowedDataEvent,
  WindowedDataProvider,
  WindowSubscription,
} from './ports/WindowedDataProvider'
export { WindowedDataSource } from './kernel/data/windowed/WindowedDataSource'
export type { WindowedDataSourceOptions } from './kernel/data/windowed/WindowedDataSource'
export { createSnapshotWindowedProvider } from './kernel/data/windowed/createSnapshotWindowedProvider'
export type {
  SnapshotCellReader,
  SnapshotWindowedProvider,
  SnapshotWindowedProviderOptions,
} from './kernel/data/windowed/createSnapshotWindowedProvider'
export { isMutableDataSource } from './kernel/data/MutableDataSource'
export type { MutableDataSource, RemovedFieldSnapshot } from './kernel/data/MutableDataSource'
export type {
  SparseExcelDataSourceOptions,
  SparseExcelWorkspaceSize,
} from './kernel/data/SparseExcelDataSource'

// Excel workspace domain
export {
  DEFAULT_EXCEL_WORKSPACE_POLICY,
  ExcelWorkspaceController,
  decideExcelWorkspaceResize,
} from './features/excel-workspace'
export type {
  ExcelWorkspaceControllerOptions,
  ExcelWorkspaceDecision,
  ExcelWorkspaceDecisionInput,
  ExcelWorkspacePolicy,
  ExcelWorkspacePort,
  ExcelWorkspaceScrollIntent,
  ExcelWorkspaceSize,
  ExcelWorkspaceVisibleRange,
} from './features/excel-workspace'

// 主题层
export { denseGridTheme } from './kernel/theme/denseGridTheme'
export type {
  IconDef,
  Theme,
  ThemeCell,
  ThemeColors,
  ThemeDimensions,
  ThemeEmptyState,
  ThemeEmptyStateLayer,
  ThemeFrozenSeparator,
  ThemeIcons,
  ThemeMetrics,
  ThemeScrollbar,
  ThemeText,
  ThemeValidation,
} from './kernel/theme/Theme'

// 布局层
export { ChunkedAxis, CHUNK_SIZE } from './kernel/geometry/ChunkedAxis'
export { Viewport } from './kernel/geometry/Viewport'
export { FrozenRegions } from './kernel/geometry/FrozenRegions'
export { columnIndexToLetter } from './kernel/geometry/columnLetter'
export type { Axis, MutableAxis } from './kernel/geometry/ChunkedAxis'
export type {
  ColBand,
  FrozenConfig,
  QuadrantRect,
  RenderRegion,
  RenderRegionId,
  RowBand,
} from './kernel/geometry/FrozenRegions'
export { DefaultGridEngine } from './engine/DefaultGridEngine'
export type {
  FillCommitResult,
  GridCellEditing,
  GridClipboardMutation,
  GridColumnStructure,
  GridDataAccess,
  GridEngine,
  GridEngineOptions,
  GridFillMutation,
  GridFormatting,
  GridFrameReader,
  GridHistory,
  GridLayout,
  GridMerging,
  GridRowStructure,
  GridSelectionAccess,
  SetViewDataOptions,
} from './engine/GridEngine'
export type {
  HoveredColumnHeaderMenu,
  RenderFrame,
  RenderFrameCollapsedColGap,
  RenderFrameCollapsedGap,
  RenderFrameColumnGroupHeader,
  RenderFrameGroupHeaderCell,
} from './kernel/render/RenderFrame'
export type { ViewportSnapshot } from './kernel/geometry/Viewport'

// 交互层（Phase 3）
export type {
  CellAddress,
  CellRange,
  GridSelection,
  SelectCellOptions,
} from './kernel/coords/SelectionTypes'
export { hitTestCell } from './kernel/interaction/HitTest'
export type { HitTestPoint } from './kernel/interaction/HitTest'
export {
  applySelectionNavigation,
  parseSelectionNavigationKey,
} from './features/selection/SelectionNavigation'
export type {
  GridIndexBounds,
  SelectionNavigationIntent,
  SelectionNavigationTarget,
} from './features/selection/SelectionNavigation'
export { computeScrollReveal } from './kernel/interaction/scrollCellIntoView'
export type { ScrollRevealInput, ScrollRevealResult } from './kernel/interaction/scrollCellIntoView'
export {
  computeResizeHandles,
  MIN_RESIZE_SIZE,
  RESIZE_HANDLE_HIT_SIZE,
  RESIZE_KEYBOARD_STEP,
  RESIZE_KEYBOARD_STEP_LARGE,
} from './kernel/interaction/HandleLayout'
export type { ResizeHandleKind, ResizeHandleRect } from './kernel/interaction/HandleLayout'
export {
  formatCellForEdit,
  isEditableFieldType,
  isTypableEditKey,
  parseCellEditInput,
} from './features/edit/CellEdit'
export {
  CellTypeStore,
  SKIP_CELL_VALUE,
  formatCellForEditWithTypes,
  getCellTypeDefinition,
  isEditableFieldTypeWithTypes,
  normalizeFieldType,
  parseCellEditInputWithTypes,
} from './features/cell-types'
export type {
  CellActionContext,
  CellFilterOperator,
  CellParseResult,
  CellTypeContext,
  CellTypeDefinition,
  CellTypeEntry,
  CellTypeOverride,
  CellTypeRegistry,
  CellTypeSnapshot,
} from './features/cell-types'
export { CellEditModel } from './features/edit/CellEditModel'
export type { CellEditSession } from './kernel/render/RenderTypes'
export {
  getCellContextMenuItems,
  getColumnHeaderContextMenuItems,
  getRowHeaderContextMenuItems,
} from './features/context-menu/ContextMenuModel'
export type {
  BuiltInMenuIconName,
  CellMenuContext,
  ContextMenuAction,
  ContextMenuConfig,
  ContextMenuContext,
  ContextMenuExtensionConfig,
  ContextMenuItem,
  ContextMenuRenderOptions,
  ContextMenuRenderer,
  ContextMenuTargetKind,
  MenuIcon,
  RowHeaderMenuContext,
} from './features/context-menu/ContextMenuModel'
export { computeCellRect } from './kernel/interaction/CellLayout'
export type { CellRect } from './kernel/interaction/CellLayout'
export type {
  CellEditor,
  CellEditorOpenContext,
  CellEditorRegistry,
  CellEditorTrigger,
} from './dom/interaction/CellEditorContract'

// 剪贴板层（Phase 4.1）
export { serializeRowsToTsv, parseTsvToCells } from './features/clipboard/TsvFormat'
export type { ClipboardAction, PasteSkippedCell } from './features/clipboard/types'
export {
  computePasteTarget,
  applyPaste,
  pasteTargetConflictsWithMerges,
} from './features/clipboard/ApplyPaste'
export type { ApplyPasteSource, GridDimensions, PasteTargetRect } from './features/clipboard/ApplyPaste'

// 填充柄层（Phase 4.3）
export { computeFillTarget } from './features/fill/FillTarget'
export {
  cellInRange,
  clamp,
  clampRange,
  isCellInRange,
  normalizeRange,
  rangesIntersect,
  unionRange,
} from './kernel/geometry/range'
export type { FillDimensions, FillDirection, FillTarget } from './features/fill/FillTarget'
export { computeFillWrites } from './features/fill/FillSeries'
export type { ComputeFillWritesInput, FillWrite } from './features/fill/FillSeries'

// 视图坐标协议（Phase 4.4）
export { findViewRow, resolveUnderlyingRow } from './kernel/coords/coordinates'
export type { RawRange } from './kernel/coords/coordinates'
export { FilterLayer } from './features/view/FilterLayer'
export { HideRowsLayer } from './features/view/HideRowsLayer'
export type { CollapsedGap } from './kernel/render/RenderTypes'
export type { FilterOp, FilterSpec } from './features/view/FilterLayer'
export { SortLayer } from './features/view/SortLayer'
export type { SortDirection, SortSpec } from './features/view/SortLayer'
export { ViewPipeline } from './features/view/ViewPipeline'
export type {
  ColumnHeaderMenuAction,
  ColumnHeaderMenuContext,
  ColumnHeaderMenuItem,
  HeaderDecoration,
  ViewLayer,
  ViewLayerChange,
  ViewLayerChangeReason,
} from './features/view/ViewLayer'

// Utility — exported for RAF scheduling in dom runtime and tests
export { FrameScheduler } from './kernel/util/raf'

// 度量层（M3 autofit）
export { tokenize, wrapText } from './kernel/measure/TextMeasurer'
export type { TextMeasurer, WrapOptions, WrappedText } from './kernel/measure/TextMeasurer'
export { autofitRowHeights } from './features/row/AutofitRowHeights'
export type { AutofitRowsParams, AutofitRowsResult } from './features/row/AutofitRowHeights'
export type { UndoCommand, CellWrite } from './kernel/undo/UndoCommand'

export { RangeStyleStore } from './features/format/RangeStyleStore'
export { borderPatchForCell } from './features/format/BorderPreset'
export type {
  BorderLineStyle,
  BorderPreset,
  BorderStyle,
  BorderWidth,
  CellBorders,
  CellFormat,
  FormatLayer,
  ResolvedCellFormat,
  TextWrapMode,
  ValueFormat,
  CellFormatter,
  FormatContext,
} from './kernel/protocol/FormatTypes'
export { formatValue } from './kernel/protocol/formatValue'
export { dateToSerial, serialToDate, SERIAL_EPOCH_MS } from './kernel/protocol/serial'
export type { CellAttachmentCodec, CellAttachmentSnapshot } from './kernel/protocol/AttachmentTypes'
export { MergeStore } from './features/merge/MergeStore'
export type { MergeRegion } from './kernel/coords/MergeRegion'
export type {
  ValidationRule,
  ValidationState,
  ValidatorContext,
  ValidatorDefinition,
} from './kernel/protocol/ValidationTypes'
export type {
  CellActionHit,
  RenderBackend,
  GridEngineFrameSource,
  RenderBackendDeps,
  RenderBackendHandle,
  RenderBackendFactory,
} from './ports/RenderBackend'
export * from './dom'
