import { describe, expect, it } from 'bun:test'
import { BUILT_IN_VALIDATORS } from '../../../src/features/validation/builtInValidators'
import type { ValidatorContext } from '../../../src/kernel/protocol/ValidationTypes'

const ctx = (options?: Record<string, unknown>): ValidatorContext => ({
  field: { id: 'f', name: 'F', type: 'number', width: 100 },
  resolvedCellType: 'number',
  rule: { type: 'number-range', options },
  locale: 'en-US',
  rowIndex: 0,
  colIndex: 0,
})

describe('number-range', () => {
  const v = BUILT_IN_VALIDATORS['number-range']!

  it('ok for null', async () => {
    expect(await v.validate(null, ctx({ min: 0, max: 100 }))).toBeNull()
  })

  it('ok within range', async () => {
    expect(await v.validate(50, ctx({ min: 0, max: 100 }))).toBeNull()
  })

  it('error below min', async () => {
    expect(await v.validate(-1, ctx({ min: 0, max: 100 }))).toBe('值必须在 0 到 100 之间')
  })

  it('error above max', async () => {
    expect(await v.validate(101, ctx({ min: 0, max: 100 }))).toBe('值必须在 0 到 100 之间')
  })

  it('exclusive: error at boundary', async () => {
    expect(await v.validate(0, ctx({ min: 0, max: 100, exclusive: true }))).toBe('值必须大于 0 且小于 100')
  })
})

describe('text-pattern', () => {
  const v = BUILT_IN_VALIDATORS['text-pattern']!
  const emailCtx = (): ValidatorContext => ({
    field: { id: 'f', name: 'F', type: 'text', width: 100 },
    resolvedCellType: 'text',
    rule: { type: 'text-pattern', options: { pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' } },
    locale: 'en-US',
    rowIndex: 0,
    colIndex: 0,
  })

  it('ok for null', async () => {
    expect(await v.validate(null, emailCtx())).toBeNull()
  })

  it('ok matching pattern', async () => {
    expect(await v.validate('user@example.com', emailCtx())).toBeNull()
  })

  it('error not matching', async () => {
    expect(await v.validate('not-an-email', emailCtx())).not.toBeNull()
  })
})

describe('list-in', () => {
  const v = BUILT_IN_VALIDATORS['list-in']!
  const listCtx = (): ValidatorContext => ({
    field: { id: 'f', name: 'F', type: 'text', width: 100 },
    resolvedCellType: 'text',
    rule: { type: 'list-in', options: { values: ['A', 'B', 'C'] } },
    locale: 'en-US',
    rowIndex: 0,
    colIndex: 0,
  })

  it('ok for null', async () => {
    expect(await v.validate(null, listCtx())).toBeNull()
  })

  it('ok for value in list', async () => {
    expect(await v.validate('A', listCtx())).toBeNull()
  })

  it('error for value not in list', async () => {
    expect(await v.validate('D', listCtx())).not.toBeNull()
  })
})

describe('date-range', () => {
  const v = BUILT_IN_VALIDATORS['date-range']!
  const dateCtx = (options: Record<string, unknown>): ValidatorContext => ({
    field: { id: 'f', name: 'F', type: 'date', width: 100 },
    resolvedCellType: 'date',
    rule: { type: 'date-range', options },
    locale: 'en-US',
    rowIndex: 0,
    colIndex: 0,
  })

  it('ok for null', async () => {
    expect(await v.validate(null, dateCtx({ min: 40000 }))).toBeNull()
  })

  it('ok above min serial', async () => {
    expect(await v.validate(45000, dateCtx({ min: 40000 }))).toBeNull()
  })

  it('error below min serial', async () => {
    expect(await v.validate(39999, dateCtx({ min: 40000 }))).not.toBeNull()
  })
})
