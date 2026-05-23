// @novasheet/core 的公开 API barrel。
// 任何不在这里 export 的符号视为内部实现，不属于半稳定契约——CLAUDE.md「What goes where」。

// Note: public Grid is exported by @novasheet/web (renderer backend selected via options).
// Programmatic engine access: use DefaultGridEngine here.

// 数据层
export { InMemoryDataSource } from './data/InMemoryDataSource'
export type { CellValue, Field, FieldType, Row, Schema } from './data/Schema'
export type { DataSource, DataSourceEvent, DataSourceListener } from './data/DataSource'
export { isMutableDataSource } from './data/MutableDataSource'
export type { MutableDataSource } from './data/MutableDataSource'

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
  Quadrant,
  QuadrantRect,
  Quadrants,
  RenderRegion,
  RenderRegionId,
  RowBand,
} from './layout/FrozenRegions'
export { DefaultGridEngine } from './engine/DefaultGridEngine'
export type {
  FillCommitResult,
  GridEngine,
  GridEngineOptions,
  SetViewDataOptions,
} from './engine/GridEngine'
export type { RenderFrame } from './render/RenderFrame'
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
} from './interaction/ContextMenuModel'
export type {
  CellMenuContext,
  ContextMenuAction,
  ContextMenuContext,
  ContextMenuItem,
  ContextMenuTargetKind,
} from './interaction/ContextMenuModel'
export { computeCellRect } from './interaction/CellLayout'
export type { CellRect } from './interaction/CellLayout'

// 剪贴板层（Phase 4.1）
export { serializeRowsToTsv, parseTsvToCells } from './clipboard/TsvFormat'
export type { ClipboardAction, PasteSkippedCell } from './clipboard/types'
export { computePasteTarget, applyPaste } from './clipboard/ApplyPaste'
export type { ApplyPasteSource, GridDimensions, PasteTargetRect } from './clipboard/ApplyPaste'

// 填充柄层（Phase 4.3）
export { computeFillTarget, unionRange } from './fill/FillTarget'
export type { FillDimensions, FillDirection, FillTarget } from './fill/FillTarget'
export { computeFillWrites } from './fill/FillSeries'
export type { ComputeFillWritesInput, FillWrite } from './fill/FillSeries'

// 视图坐标协议（Phase 4.4）
export { findViewRow, resolveUnderlyingRow } from './view/coordinates'
export { FilterLayer } from './view/FilterLayer'
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
export { FrameScheduler, frameScheduler } from './util/raf'

// 度量层（M3 autofit）
export { tokenize, wrapText } from './measure/TextMeasurer'
export type { TextMeasurer, WrapOptions, WrappedText } from './measure/TextMeasurer'
export { autofitRowHeights } from './engine/AutofitRowHeights'
export type { AutofitRowsParams, AutofitRowsResult } from './engine/AutofitRowHeights'
export type { UndoCommand, CellWrite } from './undo/UndoCommand'
