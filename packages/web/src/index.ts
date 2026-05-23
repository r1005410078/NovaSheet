// @novasheet/web — 浏览器宿主、运行时编排与对外 Grid 门面。
export { Grid } from './Grid'
export type { GridOptions, GridRendererBackend } from './Grid'
export { withExcelHeaders } from './Grid'
export type { AutofitRowsOptions, AutofitRowsResult } from './grid/GridController'

export { ScrollMapper, SAFE_MAX } from './scroll/ScrollMapper'
export { NativeScroller } from './scroll/NativeScroller'
export type { ScrollListener } from './scroll/NativeScroller'
export type { WebRenderer } from './render/WebRenderer'
export type { WebHost, WebHostOptions, WebHostFactory } from './host/WebHost'
export { DomGridHost } from './host/DomGridHost'
export { WebGridRuntime } from './runtime/WebGridRuntime'
export type { WebGridRuntimeOptions } from './runtime/WebGridRuntime'

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
export type { FillEvent, RedoEvent, UndoEvent } from './grid/GridController'
