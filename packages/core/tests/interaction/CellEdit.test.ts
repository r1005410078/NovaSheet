import { describe, expect, it } from 'bun:test'
import {
  formatCellForEdit,
  isEditableFieldType,
  isTypableEditKey,
  parseCellEditInput,
} from '../../src/interaction/CellEdit'

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

  it('isTypableEditKey 识别可键入字符', () => {
    expect(isTypableEditKey('a', {})).toBe(true)
    expect(isTypableEditKey('Enter', {})).toBe(false)
    expect(isTypableEditKey('a', { ctrlKey: true })).toBe(false)
  })
})
