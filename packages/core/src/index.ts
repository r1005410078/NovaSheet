// @novasheet/core 的公开 API barrel。
// 任何不在这里 export 的符号视为内部实现，不属于半稳定契约——CLAUDE.md「What goes where」。

// Note: public Grid is exported by @novasheet/sheet (renderer backend selected via options).
// Programmatic engine access: use DefaultGridEngine here.

// 数据层
export { InMemoryDataSource } from './data/InMemoryDataSource'
export type { CellValue, Field, FieldType, Row, Schema } from './data/Schema'
export type { DataSource, DataSourceEvent, DataSourceListener } from './data/DataSource'
export { isMutableDataSource } from './data/MutableDataSource'
export type { MutableDataSource, RemovedFieldSnapshot } from './data/MutableDataSource'

// 主题层
export { denseGridTheme } from './theme/denseGridTheme'
export type {
  IconDef,
  Theme,
  ThemeCell,
  ThemeColors,
  ThemeEmptyState,
  ThemeEmptyStateLayer,
  ThemeFrozenSeparator,
  ThemeIcons,
  ThemeMetrics,
  ThemeScrollbar,
} from './theme/Theme'

// 布局层
export { ChunkedAxis, CHUNK_SIZE } from './layout/ChunkedAxis'
export { Viewport } from './layout/Viewport'
export { FrozenRegions } from './layout/FrozenRegions'
export { columnIndexToLetter } from './layout/columnLetter'
export type { Axis, MutableAxis } from './layout/ChunkedAxis'
export type {
  ColBand,
  FrozenConfig,
  QuadrantRect,
  RenderRegion,
  RenderRegionId,
  RowBand,
} from './layout/FrozenRegions'
export { DefaultGridEngine } from './engine/DefaultGridEngine'
export { AxisViewBuilder } from './engine/AxisViewBuilder'
export type { BuildColsAxisParams, BuildRowsAxisParams } from './engine/AxisViewBuilder'
export { CollapsedColGapBuilder } from './engine/CollapsedColGapBuilder'
export type { CollapsedColGap } from './engine/CollapsedColGapBuilder'
export { FrameBuilder } from './engine/FrameBuilder'
export type { FrameBuilderParams, FrameFormatResolver } from './engine/FrameBuilder'
export { FrozenColumnSyncer } from './engine/FrozenColumnSyncer'
export type { FrozenColumnDelete, FrozenColumnInsert } from './engine/FrozenColumnSyncer'
export { SelectionRemapper } from './engine/SelectionRemapper'
export type { SelectionRemapContext } from './engine/SelectionRemapper'
export { ViewportRebuilder } from './engine/ViewportRebuilder'
export type { ViewportRebuildParams, ViewportRebuildResult } from './engine/ViewportRebuilder'
export type {
  FillCommitResult,
  GridEngine,
  GridEngineOptions,
  SetViewDataOptions,
} from './engine/GridEngine'
export type {
  RenderFrame,
  RenderFrameCollapsedColGap,
  RenderFrameCollapsedGap,
} from './render/RenderFrame'
export type { ViewportSnapshot } from './layout/Viewport'

// 交互层（Phase 3）
export { SelectionModel } from './interaction/SelectionModel'
export type {
  CellAddress,
  CellRange,
  GridSelection,
  SelectCellOptions,
} from './interaction/SelectionModel'
export { hitTestCell } from './interaction/HitTest'
export type { HitTestPoint } from './interaction/HitTest'
export {
  applySelectionNavigation,
  parseSelectionNavigationKey,
} from './interaction/SelectionNavigation'
export type {
  GridIndexBounds,
  SelectionNavigationIntent,
  SelectionNavigationTarget,
} from './interaction/SelectionNavigation'
export { computeScrollReveal } from './interaction/scrollCellIntoView'
export type { ScrollRevealInput, ScrollRevealResult } from './interaction/scrollCellIntoView'
export {
  computeResizeHandles,
  MIN_RESIZE_SIZE,
  RESIZE_HANDLE_HIT_SIZE,
  RESIZE_KEYBOARD_STEP,
  RESIZE_KEYBOARD_STEP_LARGE,
} from './interaction/HandleLayout'
export type { ResizeHandleKind, ResizeHandleRect } from './interaction/HandleLayout'
export {
  formatCellForEdit,
  isEditableFieldType,
  isTypableEditKey,
  parseCellEditInput,
} from './interaction/CellEdit'
export { CellEditModel } from './interaction/CellEditModel'
export type { CellEditSession } from './interaction/CellEditModel'
export {
  getCellContextMenuItems,
  getColumnHeaderContextMenuItems,
  getRowHeaderContextMenuItems,
} from './interaction/ContextMenuModel'
export type {
  CellMenuContext,
  ContextMenuAction,
  ContextMenuContext,
  ContextMenuItem,
  ContextMenuTargetKind,
  RowHeaderMenuContext,
} from './interaction/ContextMenuModel'
export { computeCellRect } from './interaction/CellLayout'
export type { CellRect } from './interaction/CellLayout'

// 上下文扩展层
export { createSheetContext } from './context/SheetContext'
export type { SheetContext } from './context/SheetContext'
export type {
  CanvasHandle,
  CellHandle,
  GridHandle,
  OverlayHandle,
  Rect,
  RuntimeScope,
} from './context/RuntimeScope'
export type {
  CellExtension,
  CommandHandler,
  ExtensionRegistrar,
  ExtensionRegistry,
} from './context/extensions'

// 剪贴板层（Phase 4.1）
export { serializeRowsToTsv, parseTsvToCells } from './clipboard/TsvFormat'
export type { ClipboardAction, PasteSkippedCell } from './clipboard/types'
export {
  computePasteTarget,
  applyPaste,
  pasteTargetConflictsWithMerges,
} from './clipboard/ApplyPaste'
export type { ApplyPasteSource, GridDimensions, PasteTargetRect } from './clipboard/ApplyPaste'

// 填充柄层（Phase 4.3）
export { computeFillTarget } from './fill/FillTarget'
export {
  cellInRange,
  clamp,
  clampRange,
  isCellInRange,
  normalizeRange,
  rangesIntersect,
  unionRange,
} from './geometry/range'
export type { FillDimensions, FillDirection, FillTarget } from './fill/FillTarget'
export { computeFillWrites } from './fill/FillSeries'
export type { ComputeFillWritesInput, FillWrite } from './fill/FillSeries'

// 视图坐标协议（Phase 4.4）
export { findViewRow, resolveUnderlyingRow } from './view/coordinates'
export { FilterLayer } from './view/FilterLayer'
export { HideRowsLayer } from './view/HideRowsLayer'
export type { CollapsedGap } from './view/HideRowsLayer'
export type { FilterOp, FilterSpec } from './view/FilterLayer'
export { SortLayer } from './view/SortLayer'
export type { SortDirection, SortSpec } from './view/SortLayer'
export { ViewPipeline } from './view/ViewPipeline'
export type {
  ColumnHeaderMenuAction,
  ColumnHeaderMenuContext,
  ColumnHeaderMenuItem,
  HeaderDecoration,
  ViewLayer,
  ViewLayerChange,
  ViewLayerChangeReason,
} from './view/ViewLayer'

// Utility — exported so @novasheet/web can share RAF scheduling
export { FrameScheduler } from './util/raf'

// 度量层（M3 autofit）
export { tokenize, wrapText } from './measure/TextMeasurer'
export type { TextMeasurer, WrapOptions, WrappedText } from './measure/TextMeasurer'
export { autofitRowHeights } from './engine/AutofitRowHeights'
export type { AutofitRowsParams, AutofitRowsResult } from './engine/AutofitRowHeights'
export type { UndoCommand, CellWrite } from './undo/UndoCommand'

export { RangeStyleStore } from './format/RangeStyleStore'
export { borderPatchForCell } from './format/BorderPreset'
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
} from './format/CellFormat'
export { MergeStore } from './merge/MergeStore'
export type { MergeRegion } from './merge/MergeStore'
