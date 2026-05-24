import { describe, expect, it } from 'bun:test'
import {
  remapColIndexAfterDelete,
  remapColIndexAfterInsert,
  remapRowIndexAfterInsert,
  remapRowIndexAfterDelete,
} from '../../src/coords/remap'

describe('remapRowIndexAfterInsert', () => {
  it('行在 at 之前 → 不动', () => {
    expect(remapRowIndexAfterInsert(2, 5, 3)).toBe(2)
  })
  it('行 == at → 向后挪 count（被插行顶到下面）', () => {
    expect(remapRowIndexAfterInsert(5, 5, 3)).toBe(8)
  })
  it('行 > at → +count', () => {
    expect(remapRowIndexAfterInsert(10, 5, 3)).toBe(13)
  })
})

describe('remapRowIndexAfterDelete', () => {
  it('行在所有 removed 之前 → 不动', () => {
    expect(remapRowIndexAfterDelete(2, [5, 8])).toBe(2)
  })
  it('行恰是 removed 中的一个 → null', () => {
    expect(remapRowIndexAfterDelete(5, [3, 5, 7])).toBe(null)
  })
  it('行在 removed 之间 → 减去之前的 removed 数', () => {
    expect(remapRowIndexAfterDelete(6, [3, 5])).toBe(4)
  })
  it('行大于所有 removed → 减总 removed 数', () => {
    expect(remapRowIndexAfterDelete(10, [3, 5])).toBe(8)
  })
})

describe('remapColIndexAfterInsert', () => {
  it('列在 at 之前 → 不动', () => {
    expect(remapColIndexAfterInsert(2, 5, 3)).toBe(2)
  })
  it('列 == at → +count', () => {
    expect(remapColIndexAfterInsert(5, 5, 3)).toBe(8)
  })
  it('列 > at → +count', () => {
    expect(remapColIndexAfterInsert(10, 5, 3)).toBe(13)
  })
})

describe('remapColIndexAfterDelete', () => {
  it('列在所有 removed 之前 → 不动', () => {
    expect(remapColIndexAfterDelete(2, [5, 8])).toBe(2)
  })
  it('列恰是 removed 中的一个 → null', () => {
    expect(remapColIndexAfterDelete(5, [3, 5, 7])).toBe(null)
  })
  it('列在 removed 之间 → 减去之前的 removed 数', () => {
    expect(remapColIndexAfterDelete(6, [3, 5])).toBe(4)
  })
  it('列大于所有 removed → 减总 removed 数', () => {
    expect(remapColIndexAfterDelete(10, [3, 5])).toBe(8)
  })
})
