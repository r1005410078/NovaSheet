import { ChunkedAxis } from '../../kernel/geometry/ChunkedAxis'
import { HideRowsLayer } from '../../view/HideRowsLayer'
import { isMutableDataSource } from '../../kernel/data/MutableDataSource'
import type { CollapsedGap } from '../../view/HideRowsLayer'
import type { DataSource } from '../../kernel/data/DataSource'
import type { DeletedRowSnapshot, MutableDataSource } from '../../kernel/data/MutableDataSource'
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
import type { RowStructure } from './RowStructure'

/** 默认行结构领域实现（聚合根）；自持行高轴与隐藏层。 */
export class DefaultRowStructure implements RowStructure {
  // 经 rebuild() 在构造期赋值（见 CLAUDE.md：构造器调用的 helper 内赋值可用 definite-assignment）。
  private rawData!: DataSource
  private resolveDefaultRowHeight!: () => number
  private rawRowsAxis!: ChunkedAxis
  private rowViewData!: DataSource
  private readonly hideLayer = new HideRowsLayer()

  constructor(rawData: DataSource, resolveDefaultRowHeight: () => number) {
    this.rebuild(rawData, resolveDefaultRowHeight)
  }

  rebuild(rawData: DataSource, resolveDefaultRowHeight: () => number): void {
    this.rawData = rawData
    this.resolveDefaultRowHeight = resolveDefaultRowHeight
    this.rawRowsAxis = new ChunkedAxis({
      count: rawData.getRowCount(),
      defaultSize: resolveDefaultRowHeight(),
    })
    this.rowViewData = this.hideLayer.wrap(rawData)
  }

  clearHidden(): void {
    this.hideLayer.setHidden([])
  }

  private get mutable(): MutableDataSource | null {
    return isMutableDataSource(this.rawData) ? this.rawData : null
  }

  insertRows(operation: InsertRowsOperation): RowsInserted | null {
    if (operation.count <= 0) return null
    const newRowIds = this.mutable?.insertRows?.(operation.at, operation.count) ?? []
    if (newRowIds.length === 0) return null
    const at = newRowIds[0]!
    this.rawRowsAxis.insertRange(at, operation.count, this.resolveDefaultRowHeight())
    return { kind: 'rowsInserted', at, count: operation.count, newRowIds }
  }

  deleteRows(operation: DeleteRowsOperation): RowsDeleted | null {
    const rowIds = normalizeDeleteRows(this.rawData.getRowCount(), operation.rowIds)
    if (!rowIds) return null
    const deletedHeights = rowIds.map((id) => this.rawRowsAxis.getSize(id))
    const snapshots = this.mutable?.deleteRows?.(rowIds) ?? []
    if (snapshots.length === 0) return null
    this.rawRowsAxis.deleteRange(rowIds)
    return { kind: 'rowsDeleted', rowIds, snapshots, deletedHeights }
  }

  hideRows(operation: HideRowsOperation): RowsHidden | null {
    const newlyHidden = getNewlyHiddenRows(operation.rowIds, this.hideLayer.getHiddenUnderlyingRows())
    if (newlyHidden.length === 0) return null
    this.hideLayer.addHidden(newlyHidden)
    return { kind: 'rowsHidden', rowIds: newlyHidden }
  }

  unhideRows(operation: UnhideRowsOperation): RowsUnhidden | null {
    const newlyVisible = getNewlyVisibleRows(operation.rowIds, this.hideLayer.getHiddenUnderlyingRows())
    if (newlyVisible.length === 0) return null
    this.hideLayer.removeHidden(newlyVisible)
    return { kind: 'rowsUnhidden', rowIds: newlyVisible }
  }

  moveRows(operation: MoveRowsOperation): RowsMoved | null {
    const mutable = this.mutable
    if (!mutable?.moveRows) return null
    const plan = normalizeMoveRows(this.rawData.getRowCount(), operation.rowIds, operation.beforeRowId)
    if (!plan) return null

    const heightsBefore = captureRowHeights(this.rawRowsAxis)
    mutable.moveRows(plan.rowIds, plan.beforeRowId)
    this.rawRowsAxis = buildRawRowsAxisFromHeights(
      reorderByIndexMap(heightsBefore, plan.indexMap),
      this.resolveDefaultRowHeight(),
    )
    this.hideLayer.setHidden(remapRowsByIndexMap(this.getHiddenRows(), plan.indexMap))

    return {
      kind: 'rowsMoved',
      rowIds: plan.rowIds,
      beforeRowId: plan.beforeRowId,
      inverseRowIds: plan.inverseRowIds,
      inverseBeforeRowId: plan.inverseBeforeRowId,
      indexMap: plan.indexMap,
    }
  }

  getRowHeight(underlyingRow: number): number {
    return this.rawRowsAxis.getSize(underlyingRow)
  }

  setRowHeight(underlyingRow: number, height: number): void {
    this.rawRowsAxis.setSize(underlyingRow, height)
  }

  setRowHeightsMulti(underlyingRows: readonly number[], height: number): void {
    for (const id of underlyingRows) this.rawRowsAxis.setSize(id, height)
  }

  setDefaultRowHeight(height: number): void {
    this.rawRowsAxis.setDefaultSize(height)
  }

  getViewRowsAxis(): ChunkedAxis {
    const visibleRows = this.hideLayer.getVisibleRows()
    const defaultSize = this.resolveDefaultRowHeight()
    const viewAxis = new ChunkedAxis({ count: visibleRows.length, defaultSize })
    for (let viewRow = 0; viewRow < visibleRows.length; viewRow += 1) {
      const underlyingRow = visibleRows[viewRow]!
      const size = this.rawRowsAxis.getSize(underlyingRow)
      if (size !== defaultSize) viewAxis.setSize(viewRow, size)
    }
    return viewAxis
  }

  getRowViewData(): DataSource {
    return this.rowViewData
  }

  getHiddenRows(): readonly number[] {
    return Array.from(this.hideLayer.getHiddenUnderlyingRows()).sort((a, b) => a - b)
  }

  getCollapsedGaps(): readonly CollapsedGap[] {
    return this.hideLayer.getCollapsedGaps()
  }

  insertBlankRows(at: number, count: number): void {
    this.mutable?.insertRows?.(at, count)
    this.rawRowsAxis.insertRange(at, count, this.resolveDefaultRowHeight())
  }

  deleteRowsByIds(underlyingRowIds: readonly number[]): void {
    this.mutable?.deleteRows?.(underlyingRowIds)
    this.rawRowsAxis.deleteRange(underlyingRowIds)
  }

  reinsertDeletedRows(
    snapshots: readonly DeletedRowSnapshot[],
    heights: readonly number[],
  ): void {
    const mutable = this.mutable
    if (!mutable?.insertRows) return
    // 按 originalUnderlyingRow 升序回插；heights 与 sorted 同序对齐，依赖 deleteRows 经
    // normalizeDeleteRows 产出严格升序 rowIds（故 deletedHeights 亦升序）。从末尾向前回插以保持索引有效。
    const sorted = [...snapshots].sort(
      (a, b) => a.originalUnderlyingRow - b.originalUnderlyingRow,
    )
    for (let i = sorted.length - 1; i >= 0; i -= 1) {
      const snap = sorted[i]!
      mutable.insertRows(snap.originalUnderlyingRow, 1)
      this.rawRowsAxis.insertRange(
        snap.originalUnderlyingRow,
        1,
        heights[i] ?? this.resolveDefaultRowHeight(),
      )
      for (const field of this.rawData.getSchema().fields) {
        const val = snap.cells[field.id]
        if (val === undefined) continue
        if (mutable.updateCellByUnderlyingRow) {
          mutable.updateCellByUnderlyingRow(snap.originalUnderlyingRow, field.id, val)
        } else {
          mutable.updateCell(snap.originalUnderlyingRow, field.id, val)
        }
      }
    }
  }

  addHidden(underlyingRowIds: readonly number[]): void {
    this.hideLayer.addHidden(underlyingRowIds)
  }

  removeHidden(underlyingRowIds: readonly number[]): void {
    this.hideLayer.removeHidden(underlyingRowIds)
  }
}
