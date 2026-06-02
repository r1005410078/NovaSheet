import type {
  AutofitRowsResult,
  CellRange,
  FillDirection,
  GridEngine,
  RenderFrame,
  SheetContext,
} from '@novasheet/core'
import type { WebHost, WebPointerEvent } from '../../host/WebHost'
import type { ColumnReorderOverlay } from '../../overlay/ColumnReorderOverlay'
import type { RowReorderOverlay } from '../../overlay/RowReorderOverlay'
import type { DomHandleLayer } from '../DomHandleLayer'
import type { Drag } from './Drag'

/** 填充应用事件（公共 onFill 回调载荷）。决策 B：暂留 web。 */
export interface FillEvent {
  readonly source: CellRange
  readonly fill: CellRange
  readonly result: CellRange
  readonly direction: FillDirection
}

/** runtime 每帧交互状态，供 overlay 决定显隐。 */
export interface WebInteractionStatus {
  /** 任一 drag 处于 active（拖拽进行中）。 */
  readonly interacting: boolean
  /** 引擎当前在编辑单元格。 */
  readonly editing: boolean
}

/**
 * 拥有 DOM overlay 的 drag 可选实现：让 runtime 在 flush/teardown 中驱动它每帧同步。
 * feature-agnostic：runtime 按能力探测，不关心具体 overlay。
 */
export interface WebFrameSync {
  attach(container: HTMLElement): void
  syncFrame(frame: RenderFrame, status: WebInteractionStatus): void
  destroy(): void
}

/** Contribution point id used by web runtime drag features. */
export const WEB_DRAG_CONTRIBUTION = 'web.drag'

/** Runtime services exposed to drag feature factories. */
export interface WebDragRuntimeDeps {
  readonly engine: GridEngine
  readonly host: WebHost
  readonly handleLayer?: DomHandleLayer
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
  /** 通用 runtime 服务：自动行高。 */
  autofitRows(options: { rows?: readonly number[]; minHeight?: number; maxHeight?: number }): AutofitRowsResult
  /** 通用 runtime 服务：提交进行中的编辑。 */
  commitActiveEdit(moveSelection: boolean): void
  /** 决策 B 债务：填充应用回调，唯一保留的 fill-named 成员。 */
  onFill?(event: FillEvent): void
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
