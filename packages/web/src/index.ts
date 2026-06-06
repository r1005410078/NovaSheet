// @novasheet/web — 浏览器宿主、运行时编排与对外 Grid 门面。
export { Grid } from './Grid'
export type { GridOptions, GridRendererBackend } from './Grid'
export { withExcelHeaders } from './Grid'
export type { AutofitRowsOptions, AutofitRowsResult } from './grid/GridController'

export { ScrollMapper, SAFE_MAX, NativeScroller, DomGridHost } from '@novasheet/core'
export type { ScrollListener, WebHost, WebHostOptions, WebHostFactory } from '@novasheet/core'
export type { RenderBackend } from '@novasheet/core'
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
