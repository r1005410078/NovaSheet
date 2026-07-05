import { describe, expect, it } from 'bun:test'
import { BlockCache } from '../../../../src/kernel/data/windowed/BlockCache'

function block(rowSpan: number, colSpan: number, fill: (r: number, c: number) => unknown) {
  const values: unknown[] = new Array(rowSpan * colSpan)
  for (let r = 0; r < rowSpan; r += 1) {
    for (let c = 0; c < colSpan; c += 1) values[r * colSpan + c] = fill(r, c)
  }
  return { rowSpan, colSpan, values, nowMs: 0 } as const
}

describe('BlockCache', () => {
  it('set/get round-trips values by local row/col, miss before set', () => {
    const cache = new BlockCache({ maxCachedBlocks: 10 })
    expect(cache.get('0:0', 0, 0)).toBeUndefined()

    const b1 = block(2, 2, (r, c) => `${r},${c}`)
    cache.set('0:0', { ...b1, values: b1.values as never, nowMs: 100 })
    expect(cache.get('0:0', 0, 0)).toBe('0,0')
    expect(cache.get('0:0', 1, 1)).toBe('1,1')
    expect(cache.has('0:0')).toBe(true)
  })

  it('setCell mutates a single cell in an already-resident block, no-op if block missing', () => {
    const cache = new BlockCache({ maxCachedBlocks: 10 })
    const b2 = block(2, 2, () => 'orig')
    cache.set('0:0', { ...b2, values: b2.values as never, nowMs: 100 })
    cache.setCell('0:0', 1, 0, 'patched')
    expect(cache.get('0:0', 1, 0)).toBe('patched')
    expect(cache.get('0:0', 0, 0)).toBe('orig')

    cache.setCell('9:9', 0, 0, 'ignored') // no such block
    expect(cache.has('9:9')).toBe(false)
  })

  it('markAllStale flags every resident block; new sets start fresh', () => {
    const cache = new BlockCache({ maxCachedBlocks: 10 })
    const b3a = block(1, 1, () => 1)
    cache.set('0:0', { ...b3a, values: b3a.values as never, nowMs: 100 })
    expect(cache.isStale('0:0')).toBe(false)
    cache.markAllStale()
    expect(cache.isStale('0:0')).toBe(true)
    const b3b = block(1, 1, () => 2)
    cache.set('0:0', { ...b3b, values: b3b.values as never, nowMs: 200 })
    expect(cache.isStale('0:0')).toBe(false)
  })

  it('refreshFreshness updates freshAt without touching values', () => {
    const cache = new BlockCache({ maxCachedBlocks: 10 })
    const b4 = block(1, 1, () => 1)
    cache.set('0:0', { ...b4, values: b4.values as never, nowMs: 100 })
    cache.refreshFreshness('0:0', 500)
    expect(cache.getFreshAt('0:0')).toBe(500)
    expect(cache.get('0:0', 0, 0)).toBe(1)
  })

  it('evictExcess drops least-recently-used blocks beyond maxCachedBlocks, skipping protected keys', () => {
    const cache = new BlockCache({ maxCachedBlocks: 2 })
    const b5a = block(1, 1, () => 'a')
    const b5b = block(1, 1, () => 'b')
    const b5c = block(1, 1, () => 'c')
    cache.set('0:0', { ...b5a, values: b5a.values as never, nowMs: 1 })
    cache.set('0:1', { ...b5b, values: b5b.values as never, nowMs: 2 })
    cache.set('0:2', { ...b5c, values: b5c.values as never, nowMs: 3 }) // now 3 resident, over limit of 2

    cache.evictExcess(new Set(['0:0'])) // protect the oldest — force eviction of next-oldest instead
    expect(cache.has('0:0')).toBe(true) // protected, survives
    expect(cache.has('0:1')).toBe(false) // oldest unprotected, evicted
    expect(cache.has('0:2')).toBe(true)
  })

  it('touch moves a block to most-recently-used position for eviction purposes', () => {
    const cache = new BlockCache({ maxCachedBlocks: 2 })
    const b6a = block(1, 1, () => 'a')
    const b6b = block(1, 1, () => 'b')
    const b6c = block(1, 1, () => 'c')
    cache.set('0:0', { ...b6a, values: b6a.values as never, nowMs: 1 })
    cache.set('0:1', { ...b6b, values: b6b.values as never, nowMs: 2 })
    cache.touch('0:0') // 0:0 is now most-recently-used; 0:1 becomes least-recently-used
    cache.set('0:2', { ...b6c, values: b6c.values as never, nowMs: 3 })

    cache.evictExcess(new Set())
    expect(cache.has('0:1')).toBe(false) // evicted (least recently used)
    expect(cache.has('0:0')).toBe(true)
    expect(cache.has('0:2')).toBe(true)
  })

  it('get() touches the block (counts as recent access)', () => {
    const cache = new BlockCache({ maxCachedBlocks: 2 })
    const b7a = block(1, 1, () => 'a')
    const b7b = block(1, 1, () => 'b')
    const b7c = block(1, 1, () => 'c')
    cache.set('0:0', { ...b7a, values: b7a.values as never, nowMs: 1 })
    cache.set('0:1', { ...b7b, values: b7b.values as never, nowMs: 2 })
    cache.get('0:0', 0, 0) // touch 0:0
    cache.set('0:2', { ...b7c, values: b7c.values as never, nowMs: 3 })

    cache.evictExcess(new Set())
    expect(cache.has('0:1')).toBe(false)
    expect(cache.has('0:0')).toBe(true)
  })

  it('clear removes all blocks; delete removes one', () => {
    const cache = new BlockCache({ maxCachedBlocks: 10 })
    const b8a = block(1, 1, () => 'a')
    const b8b = block(1, 1, () => 'b')
    cache.set('0:0', { ...b8a, values: b8a.values as never, nowMs: 1 })
    cache.set('0:1', { ...b8b, values: b8b.values as never, nowMs: 1 })
    cache.delete('0:0')
    expect(cache.has('0:0')).toBe(false)
    expect(cache.has('0:1')).toBe(true)
    cache.clear()
    expect(cache.has('0:1')).toBe(false)
  })
})
