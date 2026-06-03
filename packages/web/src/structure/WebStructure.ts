import type {
  ColumnHeaderMenuContext,
  ContextMenuAction,
  Field,
  GridEngine,
  Rect,
  RowHeaderMenuContext,
  SheetContext,
} from '@novasheet/core'

/** Row/column structural menu actions (insert/delete/hide/resize entry). */
export interface WebStructure {
  handleColumnMenuAction(id: ContextMenuAction, ctx: ColumnHeaderMenuContext): boolean
  handleRowHeaderMenuAction(id: ContextMenuAction, ctx: RowHeaderMenuContext): boolean
}

/** Runtime services for the structure feature controller. */
export interface WebStructureRuntimeDeps {
  readonly engine: GridEngine
  afterEngineMutation(): void
  getLastMenuPoint(): { clientX: number; clientY: number } | null
  collectHiddenInViewColRange(startCol: number, endCol: number): readonly string[]
  viewColToFieldId(viewCol: number): string | null
  rawSchemaIndexBeforeViewCol(viewCol: number): number
  rawSchemaIndexAfterViewCol(viewCol: number): number
  insertRows(beforeUnderlyingRow: number, count: number): readonly number[]
  deleteRows(underlyingRowIds: readonly number[]): void
  hideRows(underlyingRowIds: readonly number[]): void
  unhideRows(underlyingRowIds: readonly number[]): void
  getRowHeight(rowId: number): number
  openRowHeightPopover(
    sortedUnderlyingRowIds: readonly number[],
    triggerRect: Rect,
    currentHeight: number,
  ): void
  hasRowHeightPopover(): boolean
  insertCols(beforeFieldIndex: number, count: number): readonly Field[]
  deleteCols(fieldIds: readonly string[]): void
  hideCols(fieldIds: readonly string[]): void
  unhideCols(fieldIds: readonly string[]): void
  openColumnWidthPopover(
    fieldIds: readonly string[],
    triggerRect: Rect,
    currentWidth: number,
  ): void
  hasColumnWidthPopover(): boolean
}

export const WEB_STRUCTURE_CONTRIBUTION = 'web.structure'

export interface WebStructureContribution {
  readonly id: string
  readonly order: number
  create(deps: WebStructureRuntimeDeps): WebStructure | null
}

export function registerWebStructure(ctx: SheetContext, contribution: WebStructureContribution): void {
  ctx.extensions.contribute(WEB_STRUCTURE_CONTRIBUTION, contribution)
}

export function getWebStructureContributions(ctx: SheetContext): readonly WebStructureContribution[] {
  return (ctx.registry.contributions.get(WEB_STRUCTURE_CONTRIBUTION) ?? [])
    .filter(isWebStructureContribution)
    .sort((a, b) => a.order - b.order)
}

function isWebStructureContribution(value: unknown): value is WebStructureContribution {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Partial<WebStructureContribution>
  return typeof c.id === 'string' && typeof c.order === 'number' && typeof c.create === 'function'
}
