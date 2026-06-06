// @novasheet/web — 浏览器宿主、运行时编排与对外 Grid 门面。
export { Grid } from './Grid'
export type { GridOptions, GridRendererBackend } from './Grid'
export { withExcelHeaders } from './Grid'
export type { AutofitRowsOptions, AutofitRowsResult } from '@novasheet/core'

export { ScrollMapper, SAFE_MAX, NativeScroller, DomGridHost } from '@novasheet/core'
export type { ScrollListener, WebHost, WebHostOptions, WebHostFactory } from '@novasheet/core'
export type { RenderBackend } from '@novasheet/core'
export { GridRuntime } from '@novasheet/core'
export type { GridRuntimeOptions } from '@novasheet/core'

export type {
  CellMenuContext,
  ColumnHeaderMenuContext,
  ContextMenuAction,
  ContextMenuContext,
  ContextMenuItem,
  ContextMenuTargetKind,
} from '@novasheet/core'
export type { ClipboardAction, PasteSkippedCell } from '@novasheet/core'
export { DomClipboardAdapter } from '@novasheet/core'

export type { UndoCommand } from '@novasheet/core'
export type { FillEvent, RedoEvent, UndoEvent } from '@novasheet/core'
