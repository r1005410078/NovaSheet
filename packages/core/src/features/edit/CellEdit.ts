/**
 * Phase 3.5 — 单元格编辑：text / number 的展示与解析。
 */

import type { CellValue, Field, FieldType } from '../../kernel/data/Schema'
import { formatCellForEditWithTypes, parseCellEditInputWithTypes } from '../cell-types'

export function isEditableFieldType(type: FieldType): boolean {
  return type === 'text' || type === 'number'
}

/** 选中格后直接键入（Sheets 式）；不含 Enter / Tab / 方向键等。 */
export function isTypableEditKey(
  key: string,
  modifiers: {
    readonly ctrlKey?: boolean
    readonly metaKey?: boolean
    readonly altKey?: boolean
  },
): boolean {
  if (modifiers.ctrlKey || modifiers.metaKey || modifiers.altKey) return false
  if (key.length !== 1) return false
  return key !== '\n' && key !== '\t'
}

export function formatCellForEdit(value: CellValue | undefined, _type: FieldType): string {
  if (value === undefined || value === null) return ''
  return String(value)
}

/** 合法输入返回 CellValue；空串为 null；非法 number 返回 undefined。 */
export function parseCellEditInput(text: string, type: FieldType): CellValue | null | undefined {
  const trimmed = text.trim()
  if (trimmed === '') return null
  if (type !== 'number') return trimmed
  const n = Number(trimmed)
  return Number.isNaN(n) ? undefined : n
}

export { formatCellForEditWithTypes, parseCellEditInputWithTypes }
export type { Field }
