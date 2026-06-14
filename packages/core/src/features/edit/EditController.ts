import type { CellValue, Field } from '../../kernel/data/Schema'
import type { DataSource } from '../../kernel/data/DataSource'
import { isMutableDataSource } from '../../kernel/data/MutableDataSource'
import type { MutableDataSource } from '../../kernel/data/MutableDataSource'
import type { UndoCommand } from '../../kernel/undo/UndoCommand'
import type { CellAddress, CellRange } from '../../kernel/coords/SelectionTypes'
import type { CellTypeRegistry } from '../cell-types'
import {
  SKIP_CELL_VALUE,
  formatCellForEditWithTypes,
  isEditableFieldTypeWithTypes,
  parseCellEditInputWithTypes,
} from '../cell-types'
import type { CellEditModel } from './CellEditModel'
import type { CellEditSession } from './CellEditModel'
import type { CellAttachmentStore } from '../attachment/CellAttachmentStore'

/** Edit 写入门面所需的 engine 能力（merge 解析、mutable 检查、undo 入栈）。 */
export interface EditControllerContext {
  getData(): DataSource
  getCellTypes(): CellTypeRegistry
  getLocale(): string
  /** view 坐标 → 实际编辑格（合并区域时为 anchor）。 */
  resolveEditCell(cell: CellAddress): CellAddress
  viewRowToRaw(viewRow: number): number
  /** view 列坐标 → raw 列坐标（attachment store 按 raw 键控）。 */
  viewColToRaw(viewCol: number): number
  pushUndo(command: UndoCommand): void
  /** attachment 存储（clearRange 清 attachment 并 bundle 进同一 undo）。 */
  getAttachmentStore(): CellAttachmentStore
}

/** 单元格编辑 + clearRange 写入门面（对称 FormatController / SelectionController）。 */
export class EditController {
  constructor(
    private readonly model: CellEditModel,
    private readonly ctx: EditControllerContext,
  ) {}

  beginCellEdit(cell: CellAddress): boolean {
    const editCell = this.ctx.resolveEditCell(cell)
    const field = this.fieldAt(editCell.colIndex)
    if (!field || !isEditableFieldTypeWithTypes(field, this.cellTypes())) return false
    const data = this.mutableData()
    if (!data) return false

    const value = data.getCell(editCell.rowIndex, field.id)
    this.model.begin(
      editCell,
      field.id,
      field.type,
      formatCellForEditWithTypes(value, field, this.cellTypes(), this.locale()),
    )
    return true
  }

  updateDraft(draft: string): void {
    this.model.setDraft(draft)
  }

  cancel(): void {
    this.model.clear()
  }

  commit(): boolean {
    const session = this.model.getSession()
    if (!session) return false

    const field = this.fieldById(session.fieldId)
    if (!field) return false

    const parsed = parseCellEditInputWithTypes(
      session.draft,
      field,
      this.cellTypes(),
      this.locale(),
    )
    if (parsed === SKIP_CELL_VALUE) return false

    if (!this.commitCellValue(session.cell, session.fieldId, parsed)) return false
    this.model.clear()
    return true
  }

  commitCellValue(cell: CellAddress, fieldId: string, value: CellValue | null): boolean {
    const data = this.mutableData()
    if (!data) return false
    if (!this.fieldById(fieldId)) return false

    const editCell = this.ctx.resolveEditCell(cell)
    const before = data.getCell(editCell.rowIndex, fieldId) ?? null
    const underlyingRow = this.ctx.viewRowToRaw(editCell.rowIndex)
    data.updateCell(editCell.rowIndex, fieldId, value)
    this.ctx.pushUndo({
      kind: 'editCell',
      rowIndex: underlyingRow,
      fieldId,
      before,
      after: value,
    })
    return true
  }

  isEditing(): boolean {
    return this.model.isEditing()
  }

  getSession(): CellEditSession | null {
    return this.model.getSession()
  }

  clearRange(range: CellRange): void {
    const data = this.mutableData()
    if (!data) return
    const fields = data.getSchema().fields
    const before: { rowIndex: number; fieldId: string; value: CellValue }[] = []
    for (let r = range.startRow; r <= range.endRow; r++) {
      for (let c = range.startCol; c <= range.endCol; c++) {
        const field = fields[c]
        if (!field) continue
        const v = data.getCell(r, field.id)
        if (v === null || v === undefined) continue
        before.push({ rowIndex: this.ctx.viewRowToRaw(r), fieldId: field.id, value: v })
        data.updateCell(r, field.id, null)
      }
    }

    // F9：同时清选区内所有格的 attachment，快照 bundle 进同一 undo。
    const attachmentStore = this.ctx.getAttachmentStore()
    const attachmentBefore = attachmentStore.snapshot()
    const namespaces = attachmentStore.namespaces()
    if (namespaces.length > 0) {
      for (let r = range.startRow; r <= range.endRow; r++) {
        const rawRow = this.ctx.viewRowToRaw(r)
        for (let c = range.startCol; c <= range.endCol; c++) {
          const field = fields[c]
          if (!field) continue
          const rawCol = this.ctx.viewColToRaw(c)
          for (const ns of namespaces) {
            attachmentStore.set(ns, rawRow, rawCol, undefined)
          }
        }
      }
    }
    const attachmentAfter = attachmentStore.snapshot()

    const hasAttachmentChange = attachmentBefore.length > 0
    if (before.length > 0 || hasAttachmentChange) {
      this.ctx.pushUndo({
        kind: 'clearRange',
        range,
        before,
        attachmentBefore: hasAttachmentChange ? attachmentBefore : undefined,
        attachmentAfter: hasAttachmentChange ? attachmentAfter : undefined,
      })
    }
  }

  private fieldAt(colIndex: number): Field | undefined {
    return this.ctx.getData().getSchema().fields[colIndex]
  }

  private fieldById(fieldId: string): Field | undefined {
    return this.ctx.getData().getSchema().fields.find((field) => field.id === fieldId)
  }

  private cellTypes(): CellTypeRegistry {
    return this.ctx.getCellTypes()
  }

  private locale(): string {
    return this.ctx.getLocale()
  }

  private mutableData(): MutableDataSource | null {
    const data = this.ctx.getData()
    return isMutableDataSource(data) ? data : null
  }
}
