import { describe, expect, it } from 'bun:test'
import { ValidationResultStore } from '../../../src/features/validation/ValidationResultStore'

describe('ValidationResultStore', () => {
  it('returns null (ok) when no state set', () => {
    const store = new ValidationResultStore()
    expect(store.get(0, 0)).toBeNull()
  })

  it('stores invalid state', () => {
    const store = new ValidationResultStore()
    store.set(1, 2, { status: 'invalid', message: '超出范围' })
    expect(store.get(1, 2)).toEqual({ status: 'invalid', message: '超出范围' })
    expect(store.get(0, 0)).toBeNull()
  })

  it('stores pending state', () => {
    const store = new ValidationResultStore()
    store.set(0, 0, { status: 'pending' })
    expect(store.get(0, 0)).toEqual({ status: 'pending' })
  })

  it('delete reverts to ok (null)', () => {
    const store = new ValidationResultStore()
    store.set(0, 0, { status: 'invalid', message: 'err' })
    store.delete(0, 0)
    expect(store.get(0, 0)).toBeNull()
  })

  it('clear removes all entries', () => {
    const store = new ValidationResultStore()
    store.set(0, 0, { status: 'invalid', message: 'err' })
    store.set(1, 1, { status: 'pending' })
    store.clear()
    expect(store.get(0, 0)).toBeNull()
    expect(store.get(1, 1)).toBeNull()
  })

  it('remapAfterRowsInserted shifts rows', () => {
    const store = new ValidationResultStore()
    store.set(2, 0, { status: 'invalid', message: 'err' })
    store.remapAfterRowsInserted(1, 2)
    expect(store.get(2, 0)).toBeNull()
    expect(store.get(4, 0)).toEqual({ status: 'invalid', message: 'err' })
  })

  it('remapAfterRowsDeleted removes deleted rows', () => {
    const store = new ValidationResultStore()
    store.set(1, 0, { status: 'invalid', message: 'err' })
    store.set(2, 0, { status: 'pending' })
    store.remapAfterRowsDeleted([1])
    expect(store.get(1, 0)).toEqual({ status: 'pending' }) // was row 2
    expect(store.get(0, 0)).toBeNull()
  })
})
