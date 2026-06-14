import { describe, expect, it } from 'bun:test'
import {
  formatCellForEdit,
  isEditableFieldType,
  isTypableEditKey,
  parseCellEditInput,
} from '../../../src/features/edit/CellEdit'

describe('CellEdit — Phase 3.5', () => {
  it('仅 text / number 可编辑', () => {
    expect(isEditableFieldType('text')).toBe(true)
    expect(isEditableFieldType('number')).toBe(true)
    expect(isEditableFieldType('checkbox')).toBe(false)
  })

  it('formatCellForEdit 格式化展示值', () => {
    expect(formatCellForEdit('hello', 'text')).toBe('hello')
    expect(formatCellForEdit(42, 'number')).toBe('42')
    expect(formatCellForEdit(null, 'text')).toBe('')
  })

  it('formatCellForEdit 旧 helper 对非字符串/数字值返回 String()', () => {
    // date 字段现在存 serial 数；formatCellForEdit fallback 走 String(number)
    expect(formatCellForEdit(45309, 'date')).toBe('45309')
  })

  it('parseCellEditInput 解析 text', () => {
    expect(parseCellEditInput('  hi  ', 'text')).toBe('hi')
    expect(parseCellEditInput('', 'text')).toBe(null)
  })

  it('parseCellEditInput 保留 text 内部 \\n（wrap 字段 Alt+Enter round-trip）', () => {
    expect(parseCellEditInput('line1\nline2', 'text')).toBe('line1\nline2')
    expect(parseCellEditInput('  line1\nline2  ', 'text')).toBe('line1\nline2')
  })

  it('parseCellEditInput 解析 number', () => {
    expect(parseCellEditInput('3.5', 'number')).toBe(3.5)
    expect(parseCellEditInput('', 'number')).toBe(null)
    expect(parseCellEditInput('abc', 'number')).toBe(undefined)
  })

  it('parseCellEditInput 旧 helper 对非 number 类型返回 trim 后文本', () => {
    expect(parseCellEditInput('  2026-05-13  ', 'date')).toBe('2026-05-13')
    expect(parseCellEditInput('  true  ', 'checkbox')).toBe('true')
    expect(parseCellEditInput('  https://novasheet.test  ', 'url')).toBe('https://novasheet.test')
    expect(parseCellEditInput('  gold  ', 'rating')).toBe('gold')
    expect(parseCellEditInput('   ', 'date')).toBe(null)
  })

  it('isTypableEditKey 识别可键入字符', () => {
    expect(isTypableEditKey('a', {})).toBe(true)
    expect(isTypableEditKey('Enter', {})).toBe(false)
    expect(isTypableEditKey('a', { ctrlKey: true })).toBe(false)
  })
})
