import type { CellValue, Field } from '../../kernel/data/Schema'
import type { DataSource } from '../../kernel/data/DataSource'
import { isMutableDataSource } from '../../kernel/data/MutableDataSource'
import type { MutableDataSource } from '../../kernel/data/MutableDataSource'
import type { UndoCommand } from '../../kernel/undo/UndoCommand'
import type { CellAddress, CellRange } from '../selection/SelectionTypes'
import { formatCellForEdit, isEditableFieldType, parseCellEditInput } from './CellEdit'
import type { CellEditModel } from './CellEditModel'
import type { CellEditSession } from './CellEditModel'

/** Edit 写入门面所需的 engine 能力（merge 解析、mutable 检查、undo 入栈）。 */
export interface EditControllerContext {
  getData(): DataSource
  /** view 坐标 → 实际编辑格（合并区域时为 anchor）。 */
  resolveEditCell(cell: CellAddress): CellAddress
  viewRowToRaw(viewRow: number): number
  pushUndo(command: UndoCommand): void
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
    if (!field || !isEditableFieldType(field.type)) return false
    const data = this.mutableData()
    if (!data) return false

    const value = data.getCell(editCell.rowIndex, field.id)
    this.model.begin(editCell, field.id, field.type, formatCellForEdit(value, field.type))
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
    const data = this.mutableData()
    if (!data) return false

    const parsed = parseCellEditInput(session.draft, session.fieldType)
    if (parsed === undefined) return false

    const before = data.getCell(session.cell.rowIndex, session.fieldId) ?? null
    const underlyingRow = this.ctx.viewRowToRaw(session.cell.rowIndex)
    data.updateCell(session.cell.rowIndex, session.fieldId, parsed)
    this.ctx.pushUndo({
      kind: 'editCell',
      rowIndex: underlyingRow,
      fieldId: session.fieldId,
      before,
      after: parsed,
    })
    this.model.clear()
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
    if (before.length > 0) {
      this.ctx.pushUndo({ kind: 'clearRange', range, before })
    }
  }

  private fieldAt(colIndex: number): Field | undefined {
    return this.ctx.getData().getSchema().fields[colIndex]
  }

  private mutableData(): MutableDataSource | null {
    const data = this.ctx.getData()
    return isMutableDataSource(data) ? data : null
  }
}
