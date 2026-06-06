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

import type { CellValue, Row, Schema } from '../kernel/data/Schema'

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
    .map((row) =>
      fieldIds
        .map((fieldId) => escapeTsvField(serializeValue(row[fieldId])))
        .join('\t'),
    )
    .join('\n')
}

/**
 * RFC-4180 风格转义：含 `\n` / `\t` / `"` 的字段用双引号包裹、内部 `"` 翻倍。
 * 与 Excel / Google 表格的多行单元格剪贴板格式一致，避免 cell 内换行被当作行分隔。
 */
function escapeTsvField(s: string): string {
  if (s.includes('\n') || s.includes('\t') || s.includes('"')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/**
 * 按 RFC-4180 引号规则把 TSV 文本切成「行 × 字段」二维字符串数组：
 * 引号内的 `\t` / `\n` 不作分隔，`""` 还原为字面 `"`。
 */
function tokenizeTsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }
    if (ch === '"') inQuotes = true
    else if (ch === '\t') {
      row.push(field)
      field = ''
    } else if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else field += ch
  }
  row.push(field)
  rows.push(row)
  // 末尾换行产生的空行（单个空字段）丢弃，与旧 trimEnd 行为一致。
  if (rows.length > 0) {
    const last = rows[rows.length - 1]!
    if (last.length === 1 && last[0] === '') rows.pop()
  }
  return rows
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
    if (value === '') return null
    const trimmed = value.trim()
    const num = Number(trimmed)
    // 不能 coerce 的就保留 raw string——让 applyPaste 的 coerceForType 决定 SKIP，
    // 不在这里偷偷把 'abc' 吞成 null。spec §4.3：类型不匹配跳过 + onPasteSkipped 事件。
    return Number.isFinite(num) ? num : value
  }

  if (type === 'checkbox') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true
    if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === '') {
      return false
    }
    // unknown checkbox text → 保留 raw，applyPaste 决定 SKIP
    return value
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
  // 规范化行尾；引号外的 \n 才是行分隔（引号内的换行属 cell 内容，由 tokenizeTsv 处理）
  const normalized = text.replace(/\r\n/g, '\n')

  // 空输入
  if (normalized === '') {
    return []
  }

  // 按 RFC-4180 引号规则切分为行 × 字段
  const lines = tokenizeTsv(normalized)

  // 从 schema 构建 fieldId → type 映射
  const typeMap = new Map<string, string | undefined>()
  for (const field of schema.fields) {
    typeMap.set(field.id, field.type)
  }

  // 解析每一行
  const result: ParsedCellValue[][] = []
  for (const cells of lines) {
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
