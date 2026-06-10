import type { CellValue } from '../data/Schema'
import type { CellFormatter, FormatContext, ValueFormat } from './FormatTypes'

const warned = new Set<string>()
function warnOnce(msg: string): void {
  if (warned.has(msg)) return
  warned.add(msg)
  console.warn(`[novasheet] ${msg}`)
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
    case 'number':
      if (typeof value !== 'number') return undefined
      return new Intl.NumberFormat(ctx.locale, {
        useGrouping: format.thousands ?? true,
        minimumFractionDigits: format.decimals,
        maximumFractionDigits: format.decimals,
      }).format(value)
    case 'currency':
      if (typeof value !== 'number') return undefined
      return new Intl.NumberFormat(format.locale ?? ctx.locale, {
        style: 'currency',
        currency: format.currency,
        minimumFractionDigits: format.decimals,
        maximumFractionDigits: format.decimals,
      }).format(value)
    case 'percent':
      if (typeof value !== 'number') return undefined
      return new Intl.NumberFormat(ctx.locale, {
        style: 'percent',
        minimumFractionDigits: format.decimals ?? 0,
        maximumFractionDigits: format.decimals ?? 0,
      }).format(value)
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
