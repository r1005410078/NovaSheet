import type { CellRange, GridEngine, SheetContext } from '@novasheet/core'
import type { WebHost, WebPointerEvent } from '../../host/WebHost'
import type { ColumnReorderOverlay } from '../../overlay/ColumnReorderOverlay'
import type { RowReorderOverlay } from '../../overlay/RowReorderOverlay'
import type { Drag } from './Drag'

/** Contribution point id used by web runtime drag features. */
export const WEB_DRAG_CONTRIBUTION = 'web.drag'

/** Runtime services exposed to drag feature factories. */
export interface WebDragRuntimeDeps {
  readonly engine: GridEngine
  readonly host: WebHost
  readonly columnReorderOverlay?: ColumnReorderOverlay
  readonly rowReorderOverlay?: RowReorderOverlay
  refresh(): void
  afterEngineMutation(): void
  closeContextMenu(): void
  requestAutoScroll(pointer: WebPointerEvent): void
  stopAutoScroll(): void
  isBlocked(): boolean
  hitTestColumnHeader(event: WebPointerEvent): { colIndex: number; fieldId: string } | null
  hitTestRowHeader(event: WebPointerEvent): { rowIndex: number } | null
  isWholeColumnSelection(range: CellRange): boolean
  isWholeRowSelection(range: CellRange): boolean
  selectWholeColumn(colIndex: number): void
  selectWholeColumnRange(anchorCol: number, extentCol: number): void
  selectWholeRowRange(anchorRow: number, extentRow: number): void
  getColsTotalSize(): number
}

/** Factory contribution that creates one web drag state machine for a runtime instance. */
export interface WebDragContribution {
  readonly id: string
  readonly order: number
  create(deps: WebDragRuntimeDeps): Drag | null
}

/** Register a web drag contribution on a SheetContext. */
export function registerWebDrag(ctx: SheetContext, contribution: WebDragContribution): void {
  ctx.extensions.contribute(WEB_DRAG_CONTRIBUTION, contribution)
}

/** Read web drag contributions in deterministic dispatch order. */
export function getWebDragContributions(ctx: SheetContext): readonly WebDragContribution[] {
  return (ctx.registry.contributions.get(WEB_DRAG_CONTRIBUTION) ?? [])
    .filter(isWebDragContribution)
    .sort((a, b) => a.order - b.order)
}

function isWebDragContribution(value: unknown): value is WebDragContribution {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<WebDragContribution>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.order === 'number' &&
    typeof candidate.create === 'function'
  )
}
