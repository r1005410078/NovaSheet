import type { CellMenuContext, ContextMenuAction } from '@novasheet/core'
import type { WebMergeCells, WebMergeCellsRuntimeDeps } from '@novasheet/web'

const MERGE_CELL_ACTIONS = new Set<ContextMenuAction>(['merge-cells', 'unmerge-cells'])

export class MergeCellsController implements WebMergeCells {
  constructor(private readonly deps: WebMergeCellsRuntimeDeps) {}

  handleCellMenuAction(id: ContextMenuAction, ctx: CellMenuContext): boolean {
    if (!MERGE_CELL_ACTIONS.has(id)) return false
    const range = ctx.selectedRange
    if (!range) return true

    if (id === 'merge-cells') {
      this.deps.mergeCells(range)
      return true
    }
    if (id === 'unmerge-cells') {
      this.deps.unmergeCells(range)
      return true
    }
    return false
  }
}
