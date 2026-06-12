/**
 * Phase 3.5 — 单元格编辑：text / number 的展示与解析。
 */

import type { CellValue, Field, FieldType } from '../../kernel/data/Schema'
import {
  SKIP_CELL_VALUE,
  formatCellForEditWithTypes,
  parseCellEditInputWithTypes,
} from '../cell-types'

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

export function formatCellForEdit(value: CellValue | undefined, type: FieldType): string {
  return formatCellForEditWithTypes(value, createEditField(type))
}

/** 合法输入返回 CellValue；空串为 null；非法 number 返回 undefined。 */
export function parseCellEditInput(text: string, type: FieldType): CellValue | null | undefined {
  const parsed = parseCellEditInputWithTypes(text, createEditField(type))
  return parsed === SKIP_CELL_VALUE ? undefined : parsed
}

function createEditField(type: FieldType): Field {
  return { id: '', name: '', type, width: 0 }
}

export { formatCellForEditWithTypes, parseCellEditInputWithTypes }
export type { Field }
