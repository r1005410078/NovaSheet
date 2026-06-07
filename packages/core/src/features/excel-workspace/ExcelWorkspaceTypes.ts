import type { CellRange } from '../../kernel/coords/SelectionTypes'
import type { ExcelWorkspacePolicy } from './ExcelWorkspacePolicy'

/** Current logical workspace dimensions. */
export interface ExcelWorkspaceSize {
  readonly rowCount: number
  readonly colCount: number
}

/** Visible raw row/column range, inclusive on both ends. */
export interface ExcelWorkspaceVisibleRange {
  readonly rows: readonly [number, number]
  readonly cols: readonly [number, number]
}

/** Latest scroll source used to distinguish wheel edge intent from other scrolls. */
export type ExcelWorkspaceScrollIntent =
  | { readonly kind: 'wheel'; readonly atMs: number; readonly deltaX: number; readonly deltaY: number }
  | { readonly kind: 'scrollbar'; readonly atMs: number }
  | { readonly kind: 'programmatic'; readonly atMs: number }

/** Pure resize decision for a caller to apply through a workspace port. */
export type ExcelWorkspaceDecision =
  | { readonly kind: 'none' }
  | { readonly kind: 'grow'; readonly rows: number; readonly cols: number }
  | { readonly kind: 'shrink'; readonly rowCount: number; readonly colCount: number }

/** Inputs required to decide whether Excel workspace size should change. */
export interface ExcelWorkspaceDecisionInput {
  readonly policy: ExcelWorkspacePolicy
  readonly nowMs: number
  readonly size: ExcelWorkspaceSize
  readonly visible: ExcelWorkspaceVisibleRange
  readonly contentBounds: CellRange | null
  readonly intent: ExcelWorkspaceScrollIntent | null
  readonly hasMaterializedRows: boolean
  readonly hasMaterializedCols: boolean
  readonly lastGrowAtMs: number | null
}
