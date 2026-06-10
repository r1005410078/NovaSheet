import { describe, expect, it } from 'bun:test'
import { formatValue } from '../../../src/kernel/protocol/formatValue'
import type { Field } from '../../../src/kernel/data/Schema'
import type { CellFormatter, FormatContext } from '../../../src/kernel/protocol/FormatTypes'

const field: Field = { id: 'a', name: 'A', type: 'number', width: 100 }
const ctx: FormatContext = { field, locale: 'en-US' }
const noReg: Record<string, CellFormatter> = {}

describe('formatValue', () => {
  it('number: 千分位', () => {
    expect(formatValue(1234567, { kind: 'number' }, ctx, noReg)).toBe('1,234,567')
  })
  it('number: decimals + 无千分位', () => {
    expect(formatValue(1234.5, { kind: 'number', decimals: 2, thousands: false }, ctx, noReg)).toBe('1234.50')
  })
  it('currency: ¥ + descriptor locale 优先', () => {
    expect(formatValue(1234.5, { kind: 'currency', currency: 'CNY', locale: 'zh-CN' }, ctx, noReg)).toBe('¥1,234.50')
  })
  it('percent: 0.1357 → 13.57%', () => {
    expect(formatValue(0.1357, { kind: 'percent', decimals: 2 }, ctx, noReg)).toBe('13.57%')
  })
  it('date: token 替换', () => {
    const d = new Date(2024, 5, 9, 8, 5, 3) // 2024-06-09 08:05:03 本地
    expect(formatValue(d, { kind: 'date', pattern: 'YYYY-MM-DD HH:mm:ss' }, ctx, noReg)).toBe('2024-06-09 08:05:03')
  })
  it('类型不匹配 → undefined（painter 兜底）', () => {
    expect(formatValue('x', { kind: 'number' }, ctx, noReg)).toBeUndefined()
  })
  it('custom: 命中注册表', () => {
    const reg = { kb: (v) => `${v} KB` } satisfies Record<string, CellFormatter>
    expect(formatValue(12, { kind: 'custom', formatterId: 'kb' }, ctx, reg)).toBe('12 KB')
  })
  it('custom: 未注册 → undefined', () => {
    expect(formatValue(12, { kind: 'custom', formatterId: 'missing' }, ctx, noReg)).toBeUndefined()
  })
  it('custom: 抛错隔离 → undefined', () => {
    const reg = { boom: () => { throw new Error('x') } } satisfies Record<string, CellFormatter>
    expect(formatValue(12, { kind: 'custom', formatterId: 'boom' }, ctx, reg)).toBeUndefined()
  })
})

// 文本工作区（SparseExcelDataSource）字段是 type:'text'，用户输入的数字被存为字符串。
// 值格式化须解析数字字符串，否则 out-of-the-box 套货币/百分比/千分位无效（实测 bug）。
describe('formatValue — 数字字符串解析', () => {
  it('number: 字符串 "1234567" → 千分位', () => {
    expect(formatValue('1234567', { kind: 'number' }, ctx, noReg)).toBe('1,234,567')
  })
  it('currency: 字符串 "1234.5" → CN¥（en-US ctx）', () => {
    expect(formatValue('1234.5', { kind: 'currency', currency: 'CNY' }, ctx, noReg)).toBe('CN¥1,234.50')
  })
  it('percent: 字符串 "0.1357" → 13.57%', () => {
    expect(formatValue('0.1357', { kind: 'percent', decimals: 2 }, ctx, noReg)).toBe('13.57%')
  })
  it('带首尾空白的数字字符串 " 1234 " 仍解析', () => {
    expect(formatValue(' 1234 ', { kind: 'number', thousands: true }, ctx, noReg)).toBe('1,234')
  })
  it('空白字符串 → undefined', () => {
    expect(formatValue('   ', { kind: 'number' }, ctx, noReg)).toBeUndefined()
  })
  it('非数字字符串 "abc" → undefined', () => {
    expect(formatValue('abc', { kind: 'currency', currency: 'CNY' }, ctx, noReg)).toBeUndefined()
  })
  it('Infinity 字符串 → undefined（仅有限数）', () => {
    expect(formatValue('Infinity', { kind: 'number' }, ctx, noReg)).toBeUndefined()
  })
})
