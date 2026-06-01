import type { CellAddress, CellRange } from '../interaction/SelectionModel'

/** Rectangle in CSS-pixel coordinates. */
export interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** Per-cell handle exposed while a cell extension is running. */
export interface CellHandle {
  value(): unknown
  rect(): Rect
  address(): CellAddress
  range(): CellRange
  commit(value: unknown): void
  invalidate(): void
}

/** Canvas handle exposed while a canvas-backed extension is running. */
export interface CanvasHandle<TCanvasContext = unknown> {
  ctx(): TCanvasContext
}

/** Overlay handle exposed while an extension can open transient UI. */
export interface OverlayHandle<TElement = unknown> {
  openPopover(options: { anchor: Rect; content: TElement }): void
  close(): void
}

/** Grid-level handle exposed inside grid-scoped extension work. */
export interface GridHandle {
  id(): string
  invalidate(): void
}

/** Runtime handles available for one extension invocation. */
export interface RuntimeScope<TCanvasContext = unknown, TElement = unknown> {
  readonly cell?: CellHandle
  readonly canvas?: CanvasHandle<TCanvasContext>
  readonly overlay?: OverlayHandle<TElement>
  readonly grid?: GridHandle
}
