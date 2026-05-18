/**
 * Phase 4.1 TSV 序列化与解析。
 *
 * 实现行集合与 TSV 格式的双向转换，支持多种单元格类型的规范化：
 * - null/undefined → 空串
 * - number：有限数字 → String；NaN/Infinity → 空串
 * - boolean → 'true'/'false'
 * - Date → ISO 字符串
 * - Array（multiSelect）→ 逗号连接
 *
 * 解析端支持类型强制：number/checkbox 按规则将字符串转换为对应值或 null。
 */

import type { CellValue, Row, Schema } from '../data/Schema'

type ParsedCellValue = string | number | boolean | null

/**
 * 将单个单元格值序列化为 TSV 表示。
 * - null/undefined → 空串
 * - number：有限数字保留，NaN/Infinity → 空串
 * - boolean → 'true'/'false'
 * - Date → ISO 字符串
 * - Array → 逗号连接
 * - 其他 → toString()
 */
function serializeValue(v: CellValue | undefined): string {
  if (v === null || v === undefined) return ''

  if (typeof v === 'number') {
    return Number.isFinite(v) ? String(v) : ''
  }

  if (typeof v === 'boolean') {
    return v ? 'true' : 'false'
  }

  if (v instanceof Date) {
    return v.toISOString()
  }

  if (Array.isArray(v)) {
    return v.join(',')
  }

  return String(v)
}

/**
 * 将行集合序列化为 TSV 字符串。
 *
 * @param rows 行集合（每行是 { fieldId: value } 的对象）
 * @param fieldIds 列顺序（决定 TSV 列序）
 * @returns TSV 字符串，行用 `\n` 分隔，列用 `\t` 分隔
 */
export function serializeRowsToTsv(rows: readonly Row[], fieldIds: readonly string[]): string {
  if (rows.length === 0) {
    return ''
  }

  return rows
    .map(row =>
      fieldIds
        .map(fieldId => {
          const val = row[fieldId]
          return serializeValue(val)
        })
        .join('\t'),
    )
    .join('\n')
}

/**
 * 根据字段类型和值将字符串强制为对应的单元格值类型。
 *
 * @param value 待强制的字符串
 * @param type 目标字段类型（从 schema 查询）
 * @returns 强制后的值（string/number/boolean/null）
 */
function coerce(value: string, type: string | undefined): ParsedCellValue {
  // 如果类型未知，返回原始字符串
  if (!type) {
    return value
  }

  if (type === 'number') {
    // 空串 → null
    if (value === '') {
      return null
    }
    // trim + 尝试转换
    const trimmed = value.trim()
    const num = Number(trimmed)
    // 只有有限的数字才接受，NaN → null
    return Number.isFinite(num) ? num : null
  }

  if (type === 'checkbox') {
    // 规范化：trim + lowercase
    const normalized = value.trim().toLowerCase()
    // true/1/yes → true
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true
    }
    // false/0/no/'' → false
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === '') {
      return false
    }
    // 其他值 → null
    return null
  }

  // text / 其他类型 → raw string（不转换）
  return value
}

/**
 * 将 TSV 字符串解析为二维单元格数组。
 *
 * @param text TSV 文本（行用 `\n` 分隔，列用 `\t` 分隔）
 * @param fieldIds 列顺序（决定解析时的字段 ID 顺序）
 * @param schema 字段定义（用于类型强制）
 * @returns 二维数组 `ParsedCellValue[][]`，短行右侧补 null
 */
export function parseTsvToCells(
  text: string,
  fieldIds: readonly string[],
  schema: Schema,
): readonly (readonly ParsedCellValue[])[] {
  // 规范化：\r\n → \n；trim 末尾换行
  const normalized = text.replace(/\r\n/g, '\n').trimEnd()

  // 空输入
  if (normalized === '') {
    return []
  }

  // 按行分隔
  const lines = normalized.split('\n')

  // 从 schema 构建 fieldId → type 映射
  const typeMap = new Map<string, string | undefined>()
  for (const field of schema.fields) {
    typeMap.set(field.id, field.type)
  }

  // 解析每一行
  const result: ParsedCellValue[][] = []
  for (const line of lines) {
    // 按列分隔
    const cells = line.split('\t')

    // 按 fieldIds 顺序解析并强制类型
    const row: ParsedCellValue[] = []
    for (let colIdx = 0; colIdx < fieldIds.length; colIdx++) {
      const fieldId = fieldIds[colIdx]!
      const rawValue = cells[colIdx] ?? ''
      const fieldType = typeMap.get(fieldId)
      const coercedValue = coerce(rawValue, fieldType)
      row.push(coercedValue)
    }

    result.push(row)
  }

  return result
}
