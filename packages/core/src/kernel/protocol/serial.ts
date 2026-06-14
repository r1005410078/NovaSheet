/**
 * Excel/Google 序列日期 ↔ Date 转换器。
 *
 * 不变量（ADR-A/B/C）：
 * - 纪元 1899-12-30 = serial 0；连续 proleptic Gregorian，**不复刻 Excel 1900 闰 bug**（对齐 Google）。
 * - 整数 = 自纪元天数；小数 = 日内时间（0.5 = 12:00:00）。
 * - **时区中性**：仅用 UTC 毫秒做算术，调用方须以 UTC 语义构造/读取 Date，否则跨时区差一天。
 */
const MS_PER_DAY = 86_400_000

/** 纪元 1899-12-30T00:00:00Z 的 UTC 毫秒。供 formatValue 等消费者复用，避免重复字面量。 */
export const SERIAL_EPOCH_MS = Date.UTC(1899, 11, 30)

/** Date（按其 UTC 瞬时）→ serial。前置条件：`d.getTime()` 为有限数（调用点先 guard）。 */
export function dateToSerial(d: Date): number {
  return (d.getTime() - SERIAL_EPOCH_MS) / MS_PER_DAY
}

/** serial → Date（UTC 瞬时）。前置条件：`serial` 为有限数（调用点先 guard）。 */
export function serialToDate(serial: number): Date {
  return new Date(SERIAL_EPOCH_MS + serial * MS_PER_DAY)
}
