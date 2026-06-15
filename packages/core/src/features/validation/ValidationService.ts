import type { CellValue, Field, FieldType } from '../../kernel/data/Schema'
import type { ValidatorDefinition } from '../../kernel/protocol/ValidationTypes'
import type { ValidationRuleStore } from './ValidationRuleStore'
import type { ValidationResultStore } from './ValidationResultStore'
import { checkTypeConformance } from './typeConformance'
import { BUILT_IN_VALIDATORS } from './builtInValidators'

export interface ValidationServiceOptions {
  ruleStore: ValidationRuleStore
  resultStore: ValidationResultStore
  /** raw 坐标 getCell；service 在 raw 空间工作 */
  getCell: (rawRow: number, fieldId: string) => CellValue | undefined
  getField: (rawCol: number) => Field | undefined
  getResolvedType: (rawRow: number, rawCol: number) => FieldType
  validators?: Readonly<Record<string, ValidatorDefinition>>
  locale: string
}

export class ValidationService {
  private readonly allValidators: Readonly<Record<string, ValidatorDefinition>>

  constructor(private readonly opts: ValidationServiceOptions) {
    this.allValidators = { ...BUILT_IN_VALIDATORS, ...opts.validators }
  }

  async validateCell(rawRow: number, rawCol: number): Promise<void> {
    const field = this.opts.getField(rawCol)
    if (!field) {
      this.opts.resultStore.delete(rawRow, rawCol)
      return
    }

    const value = this.opts.getCell(rawRow, field.id)
    const resolvedType = this.opts.getResolvedType(rawRow, rawCol)

    // Layer A: type conformance (short-circuit)
    const typeError = checkTypeConformance(value, resolvedType)
    if (typeError) {
      this.opts.resultStore.set(rawRow, rawCol, { status: 'invalid', message: typeError })
      return
    }

    // Layer B/C: declared rule (range rule > column default)
    const rule = this.opts.ruleStore.get(rawRow, rawCol) ?? (field.options?.validation ?? null)
    if (!rule) {
      this.opts.resultStore.delete(rawRow, rawCol)
      return
    }

    const validator = this.allValidators[rule.type]
    if (!validator) {
      // Unknown validator type: skip
      this.opts.resultStore.delete(rawRow, rawCol)
      return
    }

    this.opts.resultStore.set(rawRow, rawCol, { status: 'pending' })

    const message = await validator.validate(value, {
      field,
      resolvedCellType: resolvedType,
      rule,
      locale: this.opts.locale,
      rowIndex: rawRow,
      colIndex: rawCol,
    })

    if (message) {
      this.opts.resultStore.set(rawRow, rawCol, {
        status: 'invalid',
        message: rule.message ?? message,
      })
    } else {
      this.opts.resultStore.delete(rawRow, rawCol)
    }
  }
}
