export { NativeScroller } from './scroll/NativeScroller'
export type { NativeScrollSource, ScrollListener } from './scroll/NativeScroller'
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

// —— 运行时白盒测试公开面：GridRuntime + 几个 overlay/handle 句柄类型，
//    供 @zhiguang/novasheet-canvas2d 的 GridRuntime.selection-overlay 集成测试白盒装配 runtime。
//    其余 DOM 壳内部类（drag/popover/各 overlay/handle）保持内部，不进半稳定契约。
export { DomFillHandleLayer } from './interaction/DomFillHandleLayer'
export { SelectionOverlay } from './overlay/SelectionOverlay'
export type { SelectionOverlayState } from './overlay/SelectionOverlay'
export type { OverlayRect } from './overlay/RangeOverlayRects'

// —— GridController 公开类型（原 web index 已公开）——
export type {
  AutofitRowsOptions,
  AutofitRowsResult,
  GridController,
  GridPublicEventMap,
  FillEvent,
  RedoEvent,
  UndoEvent,
  ViewChangeEvent,
  SortChangeEvent,
  FilterChangeEvent,
} from './runtime/GridController'

// GridRuntime — 运行时编排，供 canvas2d 的 selection-overlay 白盒测试直接装配。
export { GridRuntime } from './runtime/GridRuntime'
export type { GridRuntimeOptions } from './runtime/GridRuntime'
