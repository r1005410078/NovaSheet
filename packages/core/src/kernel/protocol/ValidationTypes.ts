import type { CellValue, Field, FieldType } from '../data/Schema'

export interface ValidationRule {
  type: string
  message?: string
  options?: Record<string, unknown>
}

export type ValidationState =
  | { status: 'invalid'; message: string }
  | { status: 'pending' }

export interface ValidatorContext {
  readonly field: Field
  readonly resolvedCellType: FieldType
  readonly rule: ValidationRule
  readonly locale: string
  readonly rowIndex: number
  readonly colIndex: number
}

export interface ValidatorDefinition {
  validate(
    value: CellValue | undefined,
    ctx: ValidatorContext,
  ): string | null | Promise<string | null>
  message?: string
}
