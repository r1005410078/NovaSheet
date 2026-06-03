import type {
  ColumnHeaderMenuContext,
  ContextMenuAction,
  RowHeaderMenuContext,
} from '@novasheet/core'
import type { WebStructure, WebStructureRuntimeDeps } from '@novasheet/web'

const COLUMN_STRUCTURE_ACTIONS = new Set<ContextMenuAction>([
  'insert-col-left',
  'insert-col-right',
  'delete-cols',
  'hide-cols',
  'unhide-cols',
  'resize-column-width',
])

const ROW_STRUCTURE_ACTIONS = new Set<ContextMenuAction>([
  'insert-above',
  'insert-below',
  'delete-rows',
  'hide-rows',
  'unhide-rows',
  'resize-row-height',
])

export class StructureController implements WebStructure {
  constructor(private readonly deps: WebStructureRuntimeDeps) {}

  handleColumnMenuAction(id: ContextMenuAction, ctx: ColumnHeaderMenuContext): boolean {
    if (!COLUMN_STRUCTURE_ACTIONS.has(id)) return false

    const sel = this.deps.engine.getSelection().selectedRange
    const startCol = sel?.startCol ?? ctx.colIndex
    const endCol = sel?.endCol ?? ctx.colIndex
    const fieldIds: string[] = []
    for (let viewCol = startCol; viewCol <= endCol; viewCol += 1) {
      const fieldId = this.deps.viewColToFieldId(viewCol)
      if (fieldId) fieldIds.push(fieldId)
    }
    const count = endCol - startCol + 1

    if (id === 'insert-col-left') {
      this.deps.insertCols(this.deps.rawSchemaIndexBeforeViewCol(startCol), count)
      return true
    }
    if (id === 'insert-col-right') {
      this.deps.insertCols(this.deps.rawSchemaIndexAfterViewCol(endCol), count)
      return true
    }
    if (id === 'delete-cols') {
      this.deps.deleteCols(fieldIds)
      return true
    }
    if (id === 'hide-cols') {
      this.deps.hideCols(fieldIds)
      return true
    }
    if (id === 'unhide-cols') {
      this.deps.unhideCols(this.deps.collectHiddenInViewColRange(startCol, endCol))
      return true
    }
    if (id === 'resize-column-width') {
      if (!this.deps.hasColumnWidthPopover() || fieldIds.length === 0) return true
      const fields = this.deps.engine.getData().getSchema().fields
      const currentWidth = fields.find((field) => field.id === fieldIds[0])?.width ?? 100
      const point = this.deps.getLastMenuPoint()
      const triggerRect = point
        ? { x: point.clientX, y: point.clientY, width: 0, height: 0 }
        : { x: 100, y: 100, width: 0, height: 0 }
      this.deps.openColumnWidthPopover(fieldIds, triggerRect, currentWidth)
      return true
    }
    return false
  }

  handleRowHeaderMenuAction(id: ContextMenuAction, ctx: RowHeaderMenuContext): boolean {
    if (!ROW_STRUCTURE_ACTIONS.has(id)) return false

    const sel = this.deps.engine.getSelection().selectedRange
    const startRow = sel?.startRow ?? ctx.targetRowIndex
    const endRow = sel?.endRow ?? ctx.targetRowIndex
    const data = this.deps.engine.getData()
    const underlying: number[] = []
    for (let r = startRow; r <= endRow; r++) {
      underlying.push(data.resolveUnderlyingRow?.(r) ?? r)
    }
    const sortedIds = [...new Set(underlying)].sort((a, b) => a - b)
    const count = endRow - startRow + 1

    if (id === 'insert-above') {
      const at = data.resolveUnderlyingRow?.(startRow) ?? startRow
      this.deps.insertRows(at, count)
      return true
    }
    if (id === 'insert-below') {
      const at = (data.resolveUnderlyingRow?.(endRow) ?? endRow) + 1
      this.deps.insertRows(at, count)
      return true
    }
    if (id === 'delete-rows') {
      this.deps.deleteRows(sortedIds)
      return true
    }
    if (id === 'hide-rows') {
      this.deps.hideRows(sortedIds)
      return true
    }
    if (id === 'unhide-rows') {
      const hiddenSet = new Set(this.deps.engine.getHiddenRows())
      this.deps.unhideRows(sortedIds.filter((rowId) => hiddenSet.has(rowId)))
      return true
    }
    if (id === 'resize-row-height') {
      if (!this.deps.hasRowHeightPopover() || sortedIds.length === 0) return true
      const currentHeight = this.deps.getRowHeight(sortedIds[0]!)
      const pt = this.deps.getLastMenuPoint()
      const triggerRect = pt
        ? { x: pt.clientX, y: pt.clientY, width: 0, height: 0 }
        : { x: 100, y: 100, width: 0, height: 0 }
      this.deps.openRowHeightPopover(sortedIds, triggerRect, currentHeight)
      return true
    }
    return false
  }
}
