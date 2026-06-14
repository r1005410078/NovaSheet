import type { CellValue, Field, FieldType } from '../../kernel/data/Schema'
import type { CellAddress } from '../../kernel/coords/SelectionTypes'
import { dateToSerial, serialToDate } from '../../kernel/protocol/serial'

export const SKIP_CELL_VALUE = Symbol('novasheet.skip-cell-value')

export type CellParseResult = CellValue | typeof SKIP_CELL_VALUE

export interface CellTypeContext {
  readonly field: Field
  readonly locale: string
}

export interface CellFilterOperator {
  readonly id: string
  readonly label: string
  matches(
    value: CellValue | undefined,
    operand: CellValue | undefined,
    ctx: CellTypeContext,
  ): boolean
}

export interface CellActionContext extends CellTypeContext {
  readonly cell: CellAddress
  readonly value: CellValue | undefined
  readonly trigger: 'cell-action'
  readonly rowIndex: number
  readonly colIndex: number
  readonly actionId: string
  preventOpenEditor(): void
  commit(value: CellValue | null): void
}

export interface CellTypeDefinition {
  readonly editable?: boolean
  formatForEdit?(value: CellValue | undefined, ctx: CellTypeContext): string
  parseEditInput?(input: string, ctx: CellTypeContext): CellParseResult
  serializeClipboard?(value: CellValue | undefined, ctx: CellTypeContext): string
  parseClipboard?(text: string, ctx: CellTypeContext): CellParseResult
  sortValue?(value: CellValue | undefined, ctx: CellTypeContext): string | number | boolean | Date | null
  isEmpty?(value: CellValue | undefined, ctx: CellTypeContext): boolean
  readonly filterOperators?: readonly CellFilterOperator[]
  onAction?(ctx: CellActionContext): void
}

export type CellTypeRegistry = Readonly<Record<string, CellTypeDefinition>>

const builtInCellTypes: CellTypeRegistry = {
  text: {
    editable: true,
    formatForEdit: (value) => formatBuiltInEditValue(value),
    parseEditInput: (input) => {
      const trimmed = input.trim()
      return trimmed === '' ? null : trimmed
    },
  },
  number: {
    editable: true,
    formatForEdit: (value) => formatBuiltInEditValue(value),
    parseEditInput: (input) => {
      const trimmed = input.trim()
      if (trimmed === '') return null
      const n = Number(trimmed)
      return Number.isNaN(n) ? SKIP_CELL_VALUE : n
    },
  },
  date: {
    editable: true,
    formatForEdit: (value) => {
      if (typeof value !== 'number' || !Number.isFinite(value)) return ''
      return serialToDate(value).toISOString().slice(0, 10) // YYYY-MM-DD
    },
    parseEditInput: (input) => {
      const trimmed = input.trim()
      if (trimmed === '') return null
      const d = new Date(trimmed) // ISO date-only 按 UTC 午夜解析
      return Number.isNaN(d.getTime()) ? SKIP_CELL_VALUE : dateToSerial(d)
    },
  },
}

export function getCellTypeDefinition(
  type: FieldType,
  overrides: CellTypeRegistry = {},
): CellTypeDefinition | undefined {
  return overrides[type] ?? builtInCellTypes[type]
}

export function isEditableFieldTypeWithTypes(field: Field, registry: CellTypeRegistry = {}): boolean {
  const definition = getCellTypeDefinition(field.type, registry)
  return definition !== undefined && definition.editable !== false && definition.parseEditInput !== undefined
}

export function formatCellForEditWithTypes(
  value: CellValue | undefined,
  field: Field,
  registry: CellTypeRegistry = {},
  locale = 'en-US',
): string {
  const ctx = { field, locale }
  return getCellTypeDefinition(field.type, registry)?.formatForEdit?.(value, ctx) ?? fallbackDisplay(value)
}

export function parseCellEditInputWithTypes(
  input: string,
  field: Field,
  registry: CellTypeRegistry = {},
  locale = 'en-US',
): CellParseResult {
  const definition = getCellTypeDefinition(field.type, registry)
  if (definition === undefined || definition.editable === false || !definition.parseEditInput) {
    return SKIP_CELL_VALUE
  }
  return definition.parseEditInput(input, { field, locale })
}

function formatBuiltInEditValue(value: CellValue | undefined): string {
  if (value === undefined || value === null) return ''
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}

function fallbackDisplay(value: CellValue | undefined): string {
  return formatBuiltInEditValue(value)
}
