import { ChunkedAxis } from '../../kernel/geometry/ChunkedAxis'
import { VisibleColumnsDataSource } from '../../kernel/data/VisibleColumnsDataSource'
import { isMutableDataSource } from '../../kernel/data/MutableDataSource'
import {
  buildColIndexMap,
  captureRawColWidths,
  getNewlyHiddenCols,
  getNewlyVisibleCols,
  normalizeDeleteCols,
  normalizeMoveCols,
} from './ColumnRules'
import type { DataSource } from '../../kernel/data/DataSource'
import type { Field } from '../../kernel/data/Schema'
import type { MutableDataSource, RemovedFieldSnapshot } from '../../kernel/data/MutableDataSource'
import type { RenderFrameCollapsedColGap } from '../../kernel/render/RenderFrame'
import type {
  ColumnsDeleted,
  ColumnsHidden,
  ColumnsInserted,
  ColumnsMoved,
  ColumnsUnhidden,
} from '../../kernel/protocol/ColumnEvent'
import type {
  DeleteColsOperation,
  HideColsOperation,
  InsertColsOperation,
  MoveColsOperation,
  UnhideColsOperation,
} from '../../kernel/protocol/ColumnOperation'
import type { ColumnStructure } from './ColumnStructure'

/**
 * 列结构聚合根：自持列宽轴（`rawColsAxis`，raw 列序）与隐藏列集（`hiddenColIds`），
 * 执行正向结构变迁并返回列领域事件，派生视图列轴/列隐藏视图源，并提供 undo/redo 逆变迁。
 * 不持有 frozen/selection/undo/format/merge —— 那些留在 `DefaultGridEngine` 门面编排。
 */
export class DefaultColumnStructure implements ColumnStructure {
  private rawData!: DataSource
  private rawColsAxis!: ChunkedAxis
  private hiddenColIds: Set<string> = new Set()
  private newFieldCounter = 0

  constructor(rawData: DataSource, resolveDefaultColWidth: () => number) {
    this.rebuild(rawData, resolveDefaultColWidth)
  }

  rebuild(rawData: DataSource, resolveDefaultColWidth: () => number): void {
    this.rawData = rawData
    this.rawColsAxis = new ChunkedAxis({
      count: rawData.getSchema().fields.length,
      defaultSize: resolveDefaultColWidth(),
    })
    // 从 field.width 回填非默认列宽（对应 engine.applyFieldWidths）。
    const fields = rawData.getSchema().fields
    const def = this.rawColsAxis.getDefaultSize()
    for (let i = 0; i < fields.length; i += 1) {
      if (fields[i]!.width !== def) this.rawColsAxis.setSize(i, fields[i]!.width)
    }
  }

  clearHidden(): void {
    this.hiddenColIds.clear()
  }

  resetNewFieldCounter(): void {
    this.newFieldCounter = 0
  }

  private get mutable(): MutableDataSource | null {
    return isMutableDataSource(this.rawData) ? this.rawData : null
  }

  private get fields(): readonly Field[] {
    return this.rawData.getSchema().fields
  }

  insertCols(operation: InsertColsOperation): ColumnsInserted | null {
    const mutable = this.mutable
    if (operation.count <= 0 || !mutable?.insertField) return null
    const at = Math.max(0, Math.min(operation.beforeFieldIndex, this.fields.length))
    const defaultWidth = this.rawColsAxis.getDefaultSize()
    const newFields: Field[] = []
    for (let i = 0; i < operation.count; i += 1) {
      this.newFieldCounter += 1
      newFields.push({
        id: `field_${this.newFieldCounter}`,
        name: `新列 ${this.newFieldCounter}`,
        type: 'text',
        width: defaultWidth,
      })
    }
    for (let i = 0; i < newFields.length; i += 1) mutable.insertField(at + i, newFields[i]!)
    this.rawColsAxis.insertRange(at, newFields.length, defaultWidth)
    return { kind: 'columnsInserted', at, count: newFields.length, newFields }
  }

  deleteCols(operation: DeleteColsOperation): ColumnsDeleted | null {
    const mutable = this.mutable
    if (!mutable?.removeField) return null
    const removed = normalizeDeleteCols(this.fields, operation.fieldIds)
    if (removed.length === 0) return null
    const deletedWidthsByOrder = removed.map((item) => this.rawColsAxis.getSize(item.idx))
    const snapshots: RemovedFieldSnapshot[] = []
    const deletedWidths: number[] = []
    for (let i = removed.length - 1; i >= 0; i -= 1) {
      const item = removed[i]!
      const snap = mutable.removeField(item.id)
      if (snap) {
        snapshots.unshift(snap)
        deletedWidths.unshift(deletedWidthsByOrder[i]!)
      }
    }
    const removedIndices = removed.map((item) => item.idx)
    this.rawColsAxis.deleteRange(removedIndices)
    for (const id of operation.fieldIds) this.hiddenColIds.delete(id)
    return { kind: 'columnsDeleted', removedIndices, snapshots, deletedWidths }
  }

  hideCols(operation: HideColsOperation): ColumnsHidden | null {
    const newly = getNewlyHiddenCols(this.fields, operation.fieldIds, this.hiddenColIds)
    if (newly.length === 0) return null
    for (const id of newly) this.hiddenColIds.add(id)
    return { kind: 'columnsHidden', fieldIds: newly }
  }

  unhideCols(operation: UnhideColsOperation): ColumnsUnhidden | null {
    const newly = getNewlyVisibleCols(operation.fieldIds, this.hiddenColIds)
    if (newly.length === 0) return null
    for (const id of newly) this.hiddenColIds.delete(id)
    return { kind: 'columnsUnhidden', fieldIds: newly }
  }

  moveCols(operation: MoveColsOperation): ColumnsMoved | null {
    const mutable = this.mutable
    if (!mutable?.moveFields) return null
    const plan = normalizeMoveCols(this.fields, operation.fieldIds, operation.beforeFieldId)
    if (!plan) return null
    const rawFieldIdsBefore = this.fields.map((field) => field.id)
    const widthById = captureRawColWidths(this.fields, this.rawColsAxis)
    mutable.moveFields(plan.fieldIds, plan.beforeFieldId)
    const indexMap = buildColIndexMap(rawFieldIdsBefore, this.fields)
    this.rebuildRawColsAxisFromWidths(widthById)
    return {
      kind: 'columnsMoved',
      fieldIds: plan.fieldIds,
      beforeFieldId: plan.beforeFieldId,
      inverseBeforeFieldId: plan.inverseBeforeFieldId,
      indexMap,
    }
  }

  getColWidth(rawColIndex: number): number {
    return this.rawColsAxis.getSize(rawColIndex)
  }

  getDefaultColWidth(): number {
    return this.rawColsAxis.getDefaultSize()
  }

  setColWidth(rawColIndex: number, width: number): void {
    this.rawColsAxis.setSize(rawColIndex, width)
    const field = this.fields[rawColIndex]
    if (field) field.width = width
  }

  setColWidthById(fieldId: string, width: number): void {
    const idx = this.getRawColumnIndex(fieldId)
    if (idx >= 0) this.setColWidth(idx, width)
  }

  setColWidthsMulti(fieldIds: readonly string[], width: number): void {
    for (const id of fieldIds) this.setColWidthById(id, width)
  }

  getViewColsAxis(): ChunkedAxis {
    const fields = this.fields
    const visibleIndices: number[] = []
    for (let i = 0; i < fields.length; i += 1) {
      if (!this.hiddenColIds.has(fields[i]!.id)) visibleIndices.push(i)
    }
    const defaultSize = this.rawColsAxis.getDefaultSize()
    const viewAxis = new ChunkedAxis({ count: visibleIndices.length, defaultSize })
    for (let viewCol = 0; viewCol < visibleIndices.length; viewCol += 1) {
      const rawCol = visibleIndices[viewCol]!
      const size = this.rawColsAxis.getSize(rawCol)
      if (size !== defaultSize) viewAxis.setSize(viewCol, size)
    }
    return viewAxis
  }

  getColViewData(rowViewData: DataSource): DataSource {
    return new VisibleColumnsDataSource(rowViewData, () => this.hiddenColIds)
  }

  getHiddenCols(): readonly string[] {
    return this.fields.map((field) => field.id).filter((id) => this.hiddenColIds.has(id))
  }

  isColHidden(fieldId: string): boolean {
    return this.hiddenColIds.has(fieldId)
  }

  getRawColumnIndex(fieldId: string): number {
    return this.fields.findIndex((field) => field.id === fieldId)
  }

  getCollapsedColGaps(): readonly Omit<RenderFrameCollapsedColGap, 'xPx'>[] {
    if (this.hiddenColIds.size === 0) return []
    const fields = this.fields
    const hiddenSchemaIndices: number[] = []
    for (let i = 0; i < fields.length; i += 1) {
      if (this.hiddenColIds.has(fields[i]!.id)) hiddenSchemaIndices.push(i)
    }

    const gaps: Omit<RenderFrameCollapsedColGap, 'xPx'>[] = []
    let run: number[] = []
    for (const schemaIndex of hiddenSchemaIndices) {
      if (run.length === 0 || schemaIndex === run[run.length - 1]! + 1) {
        run.push(schemaIndex)
        continue
      }
      gaps.push(this.makeColGap(run, fields))
      run = [schemaIndex]
    }
    if (run.length > 0) gaps.push(this.makeColGap(run, fields))
    return gaps
  }

  private makeColGap(
    run: readonly number[],
    fields: readonly Field[],
  ): Omit<RenderFrameCollapsedColGap, 'xPx'> {
    const upperRawCol = run[0]! - 1
    let atViewCol = -1
    if (upperRawCol >= 0) {
      let visibleCount = 0
      for (let rawCol = 0; rawCol <= upperRawCol; rawCol += 1) {
        if (this.hiddenColIds.has(fields[rawCol]!.id)) continue
        if (rawCol === upperRawCol) atViewCol = visibleCount
        visibleCount += 1
      }
    }
    return {
      atViewCol,
      hiddenCount: run.length,
      hiddenFieldIds: run.map((rawCol) => fields[rawCol]!.id),
    }
  }

  insertFieldsAt(at: number, fields: readonly Field[], widths: readonly number[]): void {
    const mutable = this.mutable
    if (!mutable?.insertField) return
    for (let i = 0; i < fields.length; i += 1) mutable.insertField(at + i, fields[i]!)
    this.rawColsAxis.insertRange(at, fields.length, this.getDefaultColWidth())
    for (let i = 0; i < fields.length; i += 1) {
      this.rawColsAxis.setSize(at + i, widths[i] ?? fields[i]!.width)
    }
  }

  removeFieldsByIds(fieldIds: readonly string[]): void {
    const mutable = this.mutable
    if (!mutable?.removeField) return
    const removed = fieldIds
      .map((id) => this.getRawColumnIndex(id))
      .filter((idx) => idx >= 0)
      .sort((a, b) => a - b)
    for (let i = fieldIds.length - 1; i >= 0; i -= 1) {
      mutable.removeField(fieldIds[i]!)
      this.hiddenColIds.delete(fieldIds[i]!)
    }
    this.rawColsAxis.deleteRange(removed)
  }

  reinsertDeletedCols(
    snapshots: readonly RemovedFieldSnapshot[],
    widths: readonly number[],
  ): void {
    const mutable = this.mutable
    if (!mutable?.insertField) return
    const sorted = [...snapshots].sort((a, b) => a.originalIndex - b.originalIndex)
    for (const snap of sorted) {
      const width = widths[snapshots.indexOf(snap)] ?? snap.field.width
      const restoredField = { ...snap.field, width }
      mutable.insertField(snap.originalIndex, restoredField)
      this.rawColsAxis.insertRange(snap.originalIndex, 1, width)
      this.rawColsAxis.setSize(snap.originalIndex, width)
      for (let rowIndex = 0; rowIndex < snap.cells.length; rowIndex += 1) {
        const value = snap.cells[rowIndex]
        if (value !== undefined) mutable.updateCell(rowIndex, snap.field.id, value)
      }
    }
  }

  addHidden(fieldIds: readonly string[]): void {
    for (const id of fieldIds) this.hiddenColIds.add(id)
  }

  removeHidden(fieldIds: readonly string[]): void {
    for (const id of fieldIds) this.hiddenColIds.delete(id)
  }

  private rebuildRawColsAxisFromWidths(widthById: ReadonlyMap<string, number>): void {
    const fields = this.fields
    const defaultWidth = this.rawColsAxis.getDefaultSize()
    this.rawColsAxis = new ChunkedAxis({ count: fields.length, defaultSize: defaultWidth })
    for (let i = 0; i < fields.length; i += 1) {
      const field = fields[i]!
      const width = widthById.get(field.id) ?? field.width
      if (width !== defaultWidth) this.rawColsAxis.setSize(i, width)
      field.width = width
    }
  }
}
