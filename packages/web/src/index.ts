// @novasheet/web — 浏览器宿主、运行时编排与 DOM 原语。

export { ScrollMapper, SAFE_MAX } from './scroll/ScrollMapper'
export { NativeScroller } from './scroll/NativeScroller'
export type { ScrollListener } from './scroll/NativeScroller'
export type { WebRenderer } from './render/WebRenderer'
export type { WebHost, WebHostOptions, WebHostFactory } from './host/WebHost'
export { DomGridHost } from './host/DomGridHost'
export { WebGridRuntime } from './runtime/WebGridRuntime'
export type { FillEvent, RedoEvent, UndoEvent, WebGridRuntimeOptions } from './runtime/WebGridRuntime'
export { DomCellEditor } from './interaction/DomCellEditor'
export { DomContextMenuLayer } from './interaction/DomContextMenuLayer'
export { DomFillHandleLayer } from './interaction/DomFillHandleLayer'
export { DomHandleLayer } from './interaction/DomHandleLayer'
export { FilterPopover } from './interaction/FilterPopover'
export { HideColToggleHandle } from './handle/HideColToggleHandle'
export { HideToggleHandle } from './handle/HideToggleHandle'
export { ColumnReorderOverlay } from './overlay/ColumnReorderOverlay'
export { ColumnWidthPopover } from './overlay/ColumnWidthPopover'
export { RowHeightPopover } from './overlay/RowHeightPopover'
export { RowReorderOverlay } from './overlay/RowReorderOverlay'
export { SelectionOverlay } from './overlay/SelectionOverlay'
export type { SelectionOverlayState } from './overlay/SelectionOverlay'
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
export { WebClipboardAdapter } from './clipboard/WebClipboardAdapter'

export type { UndoCommand } from '@novasheet/core'
