import type { CellValue } from '../data/Schema'
import type { CellFormatter, FormatContext, ValueFormat } from './FormatTypes'

const warned = new Set<string>()
function warnOnce(msg: string): void {
  if (warned.has(msg)) return
  warned.add(msg)
  console.warn(`[novasheet] ${msg}`)
}

/**
 * 把值解析为有限数：number 原样；数字字符串（如文本工作区输入的 "1234"）解析。
 * 解析失败（空白 / 非数字 / Infinity / NaN）返回 null，调用方回退 undefined。
 * 文本工作区（SparseExcelDataSource）字段为 type:'text'，输入数字存为字符串，故须解析。
 */
function asFiniteNumber(value: CellValue): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return null
    const n = Number(trimmed)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** v1 固定 token 子集；未识别 token 原样保留。使用本地时间。 */
function formatDatePattern(d: Date, pattern: string): string {
  return pattern
    .replace(/YYYY/g, String(d.getFullYear()))
    .replace(/MM/g, pad(d.getMonth() + 1))
    .replace(/DD/g, pad(d.getDate()))
    .replace(/HH/g, pad(d.getHours()))
    .replace(/mm/g, pad(d.getMinutes()))
    .replace(/ss/g, pad(d.getSeconds()))
}

/**
 * raw value + ValueFormat → 显示文本。纯函数，跑在帧装配热路径。
 * 返回 `undefined` 表示"无法格式化"（类型不匹配 / custom 未注册或抛错）——
 * 调用方（frame formatCell / painter）据此回退到默认显示路径。
 */
export function formatValue(
  value: CellValue,
  format: ValueFormat,
  ctx: FormatContext,
  registry: Readonly<Record<string, CellFormatter>>,
): string | undefined {
  switch (format.kind) {
    case 'number': {
      const n = asFiniteNumber(value)
      if (n === null) return undefined
      return new Intl.NumberFormat(ctx.locale, {
        useGrouping: format.thousands ?? true,
        minimumFractionDigits: format.decimals,
        maximumFractionDigits: format.decimals,
      }).format(n)
    }
    case 'currency': {
      const n = asFiniteNumber(value)
      if (n === null) return undefined
      return new Intl.NumberFormat(format.locale ?? ctx.locale, {
        style: 'currency',
        currency: format.currency,
        minimumFractionDigits: format.decimals,
        maximumFractionDigits: format.decimals,
      }).format(n)
    }
    case 'percent': {
      const n = asFiniteNumber(value)
      if (n === null) return undefined
      return new Intl.NumberFormat(ctx.locale, {
        style: 'percent',
        minimumFractionDigits: format.decimals ?? 0,
        maximumFractionDigits: format.decimals ?? 0,
      }).format(n)
    }
    case 'date': {
      const d = value instanceof Date ? value : typeof value === 'number' ? new Date(value) : null
      if (!d || Number.isNaN(d.getTime())) return undefined
      return formatDatePattern(d, format.pattern)
    }
    case 'custom': {
      const fn = registry[format.formatterId]
      if (!fn) {
        warnOnce(`formatter '${format.formatterId}' 未注册`)
        return undefined
      }
      try {
        return fn(value, ctx)
      } catch (e) {
        warnOnce(`formatter '${format.formatterId}' 抛错: ${String(e)}`)
        return undefined
      }
    }
  }
}
