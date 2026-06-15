import { describe, expect, it } from 'bun:test'
import { ValidationRuleStore } from '../../../src/features/validation/ValidationRuleStore'
import type { ValidationRule } from '../../../src/kernel/protocol/ValidationTypes'
import { asRawRange } from '../../../src/kernel/coords/coordinates'

const rule: ValidationRule = { type: 'number-range', options: { min: 0, max: 100 } }
const emailRule: ValidationRule = { type: 'email' }

describe('ValidationRuleStore', () => {
  it('returns null when no rule set', () => {
    const store = new ValidationRuleStore()
    expect(store.get(0, 0)).toBeNull()
  })

  it('sets and gets rule for a range', () => {
    const store = new ValidationRuleStore()
    store.setRange(asRawRange({ startRow: 0, endRow: 2, startCol: 1, endCol: 1 }), rule)
    expect(store.get(0, 1)).toEqual(rule)
    expect(store.get(1, 1)).toEqual(rule)
    expect(store.get(2, 1)).toEqual(rule)
    expect(store.get(0, 0)).toBeNull()
    expect(store.get(3, 1)).toBeNull()
  })

  it('later set overwrites earlier for same cell', () => {
    const store = new ValidationRuleStore()
    store.setRange(asRawRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }), rule)
    store.setRange(asRawRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }), emailRule)
    expect(store.get(0, 0)).toEqual(emailRule)
  })

  it('clearRange removes cells', () => {
    const store = new ValidationRuleStore()
    store.setRange(asRawRange({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 }), rule)
    store.clearRange(asRawRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 }))
    expect(store.get(0, 0)).toBeNull()
    expect(store.get(1, 0)).toEqual(rule)
  })

  it('remapAfterRowsInserted shifts rows down', () => {
    const store = new ValidationRuleStore()
    store.setRange(asRawRange({ startRow: 2, endRow: 2, startCol: 0, endCol: 0 }), rule)
    store.remapAfterRowsInserted(1, 2)
    expect(store.get(2, 0)).toBeNull()
    expect(store.get(4, 0)).toEqual(rule)
  })

  it('remapAfterRowsDeleted removes deleted rows and shifts survivors', () => {
    const store = new ValidationRuleStore()
    store.setRange(asRawRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }), rule)
    store.setRange(asRawRange({ startRow: 2, endRow: 2, startCol: 0, endCol: 0 }), emailRule)
    store.remapAfterRowsDeleted([1])
    expect(store.get(0, 0)).toEqual(rule)
    expect(store.get(1, 0)).toEqual(emailRule) // was row 2, now 1
  })

  it('allCells() iterates all stored cells', () => {
    const store = new ValidationRuleStore()
    store.setRange(asRawRange({ startRow: 0, endRow: 1, startCol: 0, endCol: 0 }), rule)
    const cells = [...store.allCells()]
    expect(cells).toHaveLength(2)
  })
})
