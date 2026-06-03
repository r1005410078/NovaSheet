import type {
  CellMenuContext,
  CellRange,
  ContextMenuAction,
  MergeRegion,
  SheetContext,
} from '@novasheet/core'

/** Merge/unmerge actions for the cell context menu. */
export interface WebMergeCells {
  handleCellMenuAction(id: ContextMenuAction, ctx: CellMenuContext): boolean
}

/** Runtime services for the merge-cells feature controller. */
export interface WebMergeCellsRuntimeDeps {
  getSelectedRange(): CellRange | null
  getVisibleMergeRegions(): readonly MergeRegion[]
  mergeCells(range: CellRange): boolean
  unmergeCells(range: CellRange): boolean
}

export const WEB_MERGE_CELLS_CONTRIBUTION = 'web.merge-cells'

export interface WebMergeCellsContribution {
  readonly id: string
  readonly order: number
  create(deps: WebMergeCellsRuntimeDeps): WebMergeCells | null
}

export function registerWebMergeCells(
  ctx: SheetContext,
  contribution: WebMergeCellsContribution,
): void {
  ctx.extensions.contribute(WEB_MERGE_CELLS_CONTRIBUTION, contribution)
}

export function getWebMergeCellsContributions(
  ctx: SheetContext,
): readonly WebMergeCellsContribution[] {
  return (ctx.registry.contributions.get(WEB_MERGE_CELLS_CONTRIBUTION) ?? [])
    .filter(isWebMergeCellsContribution)
    .sort((a, b) => a.order - b.order)
}

function isWebMergeCellsContribution(value: unknown): value is WebMergeCellsContribution {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Partial<WebMergeCellsContribution>
  return typeof c.id === 'string' && typeof c.order === 'number' && typeof c.create === 'function'
}
