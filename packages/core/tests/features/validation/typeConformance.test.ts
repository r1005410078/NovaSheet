import { describe, expect, it } from 'bun:test'
import { checkTypeConformance } from '../../../src/features/validation/typeConformance'

describe('checkTypeConformance', () => {
  it('returns null for null value on any type', () => {
    expect(checkTypeConformance(null, 'number')).toBeNull()
    expect(checkTypeConformance(null, 'date')).toBeNull()
    expect(checkTypeConformance(null, 'text')).toBeNull()
  })

  it('returns null for number value on number type', () => {
    expect(checkTypeConformance(42, 'number')).toBeNull()
  })

  it('returns error for string value on number type', () => {
    expect(checkTypeConformance('hello', 'number')).toBe('此值与列类型数字不匹配')
  })

  it('returns null for number (serial) on date type', () => {
    expect(checkTypeConformance(45000, 'date')).toBeNull()
  })

  it('returns error for string value on date type', () => {
    expect(checkTypeConformance('武强我', 'date')).toBe('此值与列类型日期不匹配')
  })

  it('returns null for boolean on checkbox type', () => {
    expect(checkTypeConformance(true, 'checkbox')).toBeNull()
    expect(checkTypeConformance(false, 'checkbox')).toBeNull()
  })

  it('returns error for non-boolean on checkbox type', () => {
    expect(checkTypeConformance('yes', 'checkbox')).toBe('此值与列类型复选框不匹配')
  })

  it('returns null for string on text/url type', () => {
    expect(checkTypeConformance('hello', 'text')).toBeNull()
    expect(checkTypeConformance('https://x.com', 'url')).toBeNull()
  })

  it('returns null for string on singleSelect type', () => {
    expect(checkTypeConformance('optA', 'singleSelect')).toBeNull()
  })

  it('returns null for array on multiSelect type', () => {
    expect(checkTypeConformance(['a', 'b'], 'multiSelect')).toBeNull()
  })

  it('returns null for any value on unknown/custom type', () => {
    expect(checkTypeConformance('anything', 'rating')).toBeNull()
    expect(checkTypeConformance(42, 'assignee')).toBeNull()
  })
})
