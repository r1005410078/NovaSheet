import type { CellValue, FieldType } from '../../kernel/data/Schema'

const TYPE_LABELS: Partial<Record<string, string>> = {
  number: '数字',
  date: '日期',
  checkbox: '复选框',
  text: '文本',
  url: '链接',
  singleSelect: '单选',
  multiSelect: '多选',
}

/** Layer A：检查 value 是否符合 resolvedType 的值域。null 始终合法。custom type 跳过检查。 */
export function checkTypeConformance(value: CellValue | undefined, resolvedType: FieldType): string | null {
  if (value === null || value === undefined) return null

  switch (resolvedType) {
    case 'number':
      if (typeof value !== 'number') return `此值与列类型${TYPE_LABELS['number']}不匹配`
      break
    case 'date':
      if (typeof value !== 'number') return `此值与列类型${TYPE_LABELS['date']}不匹配`
      break
    case 'checkbox':
      if (typeof value !== 'boolean') return `此值与列类型${TYPE_LABELS['checkbox']}不匹配`
      break
    case 'text':
    case 'url':
    case 'singleSelect':
      if (typeof value !== 'string') return `此值与列类型${TYPE_LABELS[resolvedType] ?? resolvedType}不匹配`
      break
    case 'multiSelect':
      if (!Array.isArray(value)) return `此值与列类型${TYPE_LABELS['multiSelect']}不匹配`
      break
    default:
      return null
  }
  return null
}
