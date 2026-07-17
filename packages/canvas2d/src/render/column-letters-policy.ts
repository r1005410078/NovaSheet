import type { Field, RenderFrame } from '@zhiguang/novasheet-core'

/**
 * 是否绘制 Excel 列标（A/B/…）。
 *
 * - 无 excel 行头 gutter：不画列标
 * - 有 columnGroups：叶头用字段名（簇名），不画列标
 * - 扁平列且任一 field.name 非空：一层头直接画 name（如液冷A1），不画列标
 * - 扁平列且字段均无名：保留 A/B 列标
 *
 * @param excelChrome 是否启用 excel 行头 gutter（通常由 rowHeaderWidth > 0 推导）
 * @param columnGroupHeader 列组表头布局；有值表示存在 columnGroups
 * @param fields schema.fields
 * @returns true 时叶头画 A/B/…；false 时叶头画 field.name
 */
export function resolveShouldPaintColumnLetters(
  excelChrome: boolean,
  columnGroupHeader: RenderFrame['columnGroupHeader'] | undefined,
  fields: readonly Field[],
): boolean {
  if (!excelChrome || columnGroupHeader) return false
  const hasNamedField = fields.some(
    (field) => typeof field?.name === 'string' && field.name.length > 0,
  )
  return !hasNamedField
}
