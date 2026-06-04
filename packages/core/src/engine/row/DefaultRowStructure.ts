import type { RowsDeleted, RowsHidden, RowsInserted, RowsMoved, RowsUnhidden } from './RowEvent'
import type {
  DeleteRowsOperation,
  HideRowsOperation,
  InsertRowsOperation,
  MoveRowsOperation,
  UnhideRowsOperation,
} from './RowOperation'
import {
  buildRawRowsAxisFromHeights,
  captureRowHeights,
  getNewlyHiddenRows,
  getNewlyVisibleRows,
  normalizeDeleteRows,
  normalizeMoveRows,
  remapRowsByIndexMap,
  reorderByIndexMap,
} from './RowRules'
import type { RowStructure, RowStructureContext } from './RowStructure'

/** 默认行结构领域实现。 */
export class DefaultRowStructure implements RowStructure {
  constructor(private readonly context: RowStructureContext) {}

  insertRows(operation: InsertRowsOperation): RowsInserted | null {
    if (operation.count <= 0) return null
    const newRowIds = this.context.insertRows(operation.at, operation.count)
    if (newRowIds.length === 0) return null
    const at = newRowIds[0]!
    this.context
      .getRawRowsAxis()
      .insertRange(at, operation.count, this.context.resolveDefaultRowHeight())
    return {
      kind: 'rowsInserted',
      at,
      count: operation.count,
      newRowIds,
    }
  }

  deleteRows(operation: DeleteRowsOperation): RowsDeleted | null {
    const rowIds = normalizeDeleteRows(this.context.getRowCount(), operation.rowIds)
    if (!rowIds) return null
    const deletedHeights = rowIds.map((id) => this.context.getRawRowsAxis().getSize(id))
    const snapshots = this.context.deleteRows(rowIds)
    if (snapshots.length === 0) return null
    this.context.getRawRowsAxis().deleteRange(rowIds)
    return {
      kind: 'rowsDeleted',
      rowIds,
      snapshots,
      deletedHeights,
    }
  }

  hideRows(operation: HideRowsOperation): RowsHidden | null {
    const hidden = new Set(this.context.getHiddenRows())
    const newlyHidden = getNewlyHiddenRows(operation.rowIds, hidden)
    if (newlyHidden.length === 0) return null
    this.context.setHiddenRows([...hidden, ...newlyHidden])
    return {
      kind: 'rowsHidden',
      rowIds: newlyHidden,
    }
  }

  unhideRows(operation: UnhideRowsOperation): RowsUnhidden | null {
    const hidden = new Set(this.context.getHiddenRows())
    const newlyVisible = getNewlyVisibleRows(operation.rowIds, hidden)
    if (newlyVisible.length === 0) return null
    this.context.setHiddenRows([...hidden].filter((rowId) => !newlyVisible.includes(rowId)))
    return {
      kind: 'rowsUnhidden',
      rowIds: newlyVisible,
    }
  }

  moveRows(operation: MoveRowsOperation): RowsMoved | null {
    const plan = normalizeMoveRows(
      this.context.getRowCount(),
      operation.rowIds,
      operation.beforeRowId,
    )
    if (!plan) return null

    const heightsBefore = captureRowHeights(this.context.getRawRowsAxis())
    if (!this.context.moveRows(plan.rowIds, plan.beforeRowId)) return null
    this.context.setRawRowsAxis(
      buildRawRowsAxisFromHeights(
        reorderByIndexMap(heightsBefore, plan.indexMap),
        this.context.resolveDefaultRowHeight(),
      ),
    )

    this.context.setHiddenRows(remapRowsByIndexMap(this.context.getHiddenRows(), plan.indexMap))

    return {
      kind: 'rowsMoved',
      rowIds: plan.rowIds,
      beforeRowId: plan.beforeRowId,
      inverseRowIds: plan.inverseRowIds,
      inverseBeforeRowId: plan.inverseBeforeRowId,
      indexMap: plan.indexMap,
    }
  }
}
