// @novasheet/web — 浏览器宿主、运行时编排与 DOM 原语。

export { ScrollMapper, SAFE_MAX } from './scroll/ScrollMapper'
export { NativeScroller } from './scroll/NativeScroller'
export type { ScrollListener } from './scroll/NativeScroller'
export type { WebRenderer } from './render/WebRenderer'
export type { WebHost, WebHostOptions, WebHostFactory, WebPointerEvent } from './host/WebHost'
export { DomGridHost } from './host/DomGridHost'
export { WebGridRuntime } from './runtime/WebGridRuntime'
export type { FillEvent, RedoEvent, UndoEvent, WebGridRuntimeOptions } from './runtime/WebGridRuntime'
export type { AutoScrollAxis, Drag } from './interaction/drag/Drag'
export {
  WEB_DRAG_CONTRIBUTION,
  getWebDragContributions,
  registerWebDrag,
} from './interaction/drag/WebDragContribution'
export type {
  WebDragContribution,
  WebDragRuntimeDeps,
  WebFrameSync,
  WebInteractionStatus,
} from './interaction/drag/WebDragContribution'
export {
  WEB_CELL_EDITOR_CONTRIBUTION,
  registerWebCellEditor,
  getWebCellEditorContributions,
} from './interaction/cell-editor/WebCellEditor'
export type {
  WebCellEditor,
  WebCellEditorContribution,
  WebCellEditorRuntimeDeps,
} from './interaction/cell-editor/WebCellEditor'
export {
  WEB_CLIPBOARD_CONTRIBUTION,
  registerWebClipboard,
  getWebClipboardContributions,
} from './clipboard/WebClipboard'
export type {
  WebClipboard,
  WebClipboardContribution,
  WebClipboardRuntimeDeps,
} from './clipboard/WebClipboard'
export {
  WEB_MENU_ITEM_CONTRIBUTION,
  registerWebMenuItem,
  getWebMenuItemContributions,
  mergeMenuItems,
} from './menu/WebMenuItem'
export type { WebMenuItemProvider, WebMenuItemRuntimeDeps } from './menu/WebMenuItem'
export {
  WEB_CONTEXT_MENU_CONTRIBUTION,
  registerWebContextMenu,
  getWebContextMenuContributions,
} from './menu/WebContextMenu'
export type {
  WebContextMenu,
  WebContextMenuContribution,
  WebContextMenuRuntimeDeps,
} from './menu/WebContextMenu'
export {
  WEB_SORT_FILTER_CONTRIBUTION,
  registerWebSortFilter,
  getWebSortFilterContributions,
} from './sort-filter/WebSortFilter'
export type {
  WebSortFilter,
  WebSortFilterContribution,
  WebSortFilterRuntimeDeps,
} from './sort-filter/WebSortFilter'
export {
  WEB_STRUCTURE_CONTRIBUTION,
  registerWebStructure,
  getWebStructureContributions,
} from './structure/WebStructure'
export type {
  WebStructure,
  WebStructureContribution,
  WebStructureRuntimeDeps,
} from './structure/WebStructure'
export {
  WEB_MERGE_CELLS_CONTRIBUTION,
  registerWebMergeCells,
  getWebMergeCellsContributions,
} from './merge-cells/WebMergeCells'
export type {
  WebMergeCells,
  WebMergeCellsContribution,
  WebMergeCellsRuntimeDeps,
} from './merge-cells/WebMergeCells'
export { DomHandleLayer } from './interaction/DomHandleLayer'
export { HideColToggleHandle } from './handle/HideColToggleHandle'
export { HideToggleHandle } from './handle/HideToggleHandle'
export { ColumnReorderOverlay } from './overlay/ColumnReorderOverlay'
export type { ColumnReorderPreview } from './overlay/ColumnReorderOverlay'
export { ColumnWidthPopover } from './overlay/ColumnWidthPopover'
export { RowHeightPopover } from './overlay/RowHeightPopover'
export { RowReorderOverlay } from './overlay/RowReorderOverlay'
export type { RowReorderPreview } from './overlay/RowReorderOverlay'
export { SelectionOverlay } from './overlay/SelectionOverlay'
export type { SelectionOverlayState } from './overlay/SelectionOverlay'
export { computeRangeOverlayRects } from './interaction/RangeOverlayRects'
export type { OverlayRect } from './interaction/RangeOverlayRects'

export type {
  CellMenuContext,
  ColumnHeaderMenuContext,
  ContextMenuAction,
  ContextMenuContext,
  ContextMenuItem,
  ContextMenuTargetKind,
} from '@novasheet/core'
export type { ClipboardAction, PasteSkippedCell } from '@novasheet/core'

export type { UndoCommand } from '@novasheet/core'
