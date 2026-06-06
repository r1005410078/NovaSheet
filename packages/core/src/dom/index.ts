export { NativeScroller } from './scroll/NativeScroller'
export type { ScrollListener } from './scroll/NativeScroller'
export { ScrollMapper, SAFE_MAX } from './scroll/ScrollMapper'
export { DomGridHost } from './host/DomGridHost'
export type {
  WebHost,
  WebHostOptions,
  WebHostFactory,
  WebPointerEvent,
  WebKeyboardEvent,
} from './host/Host'

// —— 稳定公开（原 web index 已公开）——
export { DomClipboardAdapter } from './clipboard/DomClipboardAdapter'

// —— TRANSITIONAL(web-into-core): web 的 runtime/backend 仍在 web，需跨包引用这些
//    DOM 壳内部类；Task 6 删除 web 后整段删除。grep 锚点：TRANSITIONAL(web-into-core)
export { DomCellEditor } from './interaction/DomCellEditor'
export type { DomCellEditorCallbacks, OpenCellEditorOptions } from './interaction/DomCellEditor'
export { DomContextMenuLayer } from './interaction/DomContextMenuLayer'
export type { DomContextMenuLayerCallbacks } from './interaction/DomContextMenuLayer'
export { DomFillHandleLayer } from './interaction/DomFillHandleLayer'
export type { DomFillHandleLayerCallbacks } from './interaction/DomFillHandleLayer'
export { DomHandleLayer } from './interaction/DomHandleLayer'
export type { ResizeIndicatorLine } from './interaction/DomHandleLayer'
export { FilterPopover } from './overlay/FilterPopover'
export type { FilterPopoverCallbacks, FilterPopoverAnchor, FilterPopoverOpenOptions } from './overlay/FilterPopover'
export { SelectionOverlay } from './overlay/SelectionOverlay'
export type { SelectionOverlayState } from './overlay/SelectionOverlay'
export { ColumnReorderOverlay } from './overlay/ColumnReorderOverlay'
export type { ColumnReorderPreview } from './overlay/ColumnReorderOverlay'
export { RowReorderOverlay } from './overlay/RowReorderOverlay'
export type { RowReorderPreview } from './overlay/RowReorderOverlay'
export { ColumnWidthPopover } from './overlay/ColumnWidthPopover'
export type { ColumnWidthPopoverOptions } from './overlay/ColumnWidthPopover'
export { RowHeightPopover } from './overlay/RowHeightPopover'
export type { RowHeightPopoverOptions } from './overlay/RowHeightPopover'
export { HideToggleHandle } from './interaction/handle/HideToggleHandle'
export type { HideToggleHandleOptions } from './interaction/handle/HideToggleHandle'
export { HideColToggleHandle } from './interaction/handle/HideColToggleHandle'
export type { HideColToggleHandleOptions } from './interaction/handle/HideColToggleHandle'
export { computeFillHandleRect, computeRangeOverlayRects } from './overlay/RangeOverlayRects'
export type { OverlayRect } from './overlay/RangeOverlayRects'
export type { Drag } from './interaction/drag/Drag'
export { ColumnHeaderDrag } from './interaction/drag/ColumnHeaderDrag'
export { FillHandleDrag } from './interaction/drag/FillHandleDrag'
export { ResizeDrag } from './interaction/drag/ResizeDrag'
export { RowHeaderDrag } from './interaction/drag/RowHeaderDrag'
export { SelectionDrag } from './interaction/drag/SelectionDrag'
