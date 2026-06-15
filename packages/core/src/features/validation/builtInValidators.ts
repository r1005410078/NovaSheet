import type { ValidatorDefinition, ValidatorContext } from '../../kernel/protocol/ValidationTypes'
import type { CellValue } from '../../kernel/data/Schema'

function numberRangeMessage(min: number | undefined, max: number | undefined, exclusive: boolean): string {
  if (min !== undefined && max !== undefined)
    return exclusive ? `值必须大于 ${min} 且小于 ${max}` : `值必须在 ${min} 到 ${max} 之间`
  if (min !== undefined) return exclusive ? `值必须大于 ${min}` : `值必须 ≥ ${min}`
  if (max !== undefined) return exclusive ? `值必须小于 ${max}` : `值必须 ≤ ${max}`
  return '值不在允许范围内'
}

const numberRange: ValidatorDefinition = {
  validate(value: CellValue | undefined, ctx: ValidatorContext): string | null {
    if (value === null || value === undefined) return null
    if (typeof value !== 'number') return null
    const { min, max, exclusive } = ctx.rule.options as { min?: number; max?: number; exclusive?: boolean }
    const exc = exclusive === true
    if (min !== undefined && (exc ? value <= min : value < min))
      return numberRangeMessage(min, max, exc)
    if (max !== undefined && (exc ? value >= max : value > max))
      return numberRangeMessage(min, max, exc)
    return null
  },
  message: '值不在允许范围内',
}

const textPattern: ValidatorDefinition = {
  validate(value: CellValue | undefined, ctx: ValidatorContext): string | null {
    if (value === null || value === undefined) return null
    if (typeof value !== 'string') return null
    const { pattern, flags } = ctx.rule.options as { pattern: string; flags?: string }
    const re = new RegExp(pattern, flags)
    return re.test(value) ? null : `值不匹配格式 ${pattern}`
  },
  message: '值格式不正确',
}

const listIn: ValidatorDefinition = {
  validate(value: CellValue | undefined, ctx: ValidatorContext): string | null {
    if (value === null || value === undefined) return null
    const { values } = ctx.rule.options as { values: string[] }
    const str = String(value)
    return values.includes(str) ? null : `值必须是以下之一：${values.join('、')}`
  },
  message: '值不在允许列表中',
}

const dateRange: ValidatorDefinition = {
  validate(value: CellValue | undefined, ctx: ValidatorContext): string | null {
    if (value === null || value === undefined) return null
    if (typeof value !== 'number') return null
    const { min, max } = ctx.rule.options as { min?: number; max?: number }
    if (min !== undefined && value < min) return `日期早于允许的最小值`
    if (max !== undefined && value > max) return `日期晚于允许的最大值`
    return null
  },
  message: '日期不在允许范围内',
}

export const BUILT_IN_VALIDATORS: Record<string, ValidatorDefinition> = {
  'number-range': numberRange,
  'text-pattern': textPattern,
  'list-in': listIn,
  'date-range': dateRange,
}
