import { describe, expect, it } from 'bun:test'
import { BlockCache } from '../../../../src/kernel/data/windowed/BlockCache'
import { applySliceToBlocks } from '../../../../src/kernel/data/windowed/sliceToBlocks'
import type { Schema } from '../../../../src/kernel/data/Schema'

const schema: Schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text', width: 100 },
    { id: 'b', name: 'B', type: 'text', width: 100 },
    { id: 'c', name: 'C', type: 'text', width: 100 },
  ],
}

describe('applySliceToBlocks', () => {
  it('splits a merged two-block response back into per-block cache entries by column', () => {
    const cache = new BlockCache({ maxCachedBlocks: 10 })
    // rect covers cols 0..2 (blockCols=1 → 3 blocks: 0:0, 0:1, 0:2), rows 0..1
    applySliceToBlocks(
      cache,
      { startRow: 0, endRow: 1, startCol: 0, endCol: 2 },
      [
        { blockRow: 0, blockCol: 0 },
        { blockRow: 0, blockCol: 1 },
        { blockRow: 0, blockCol: 2 },
      ],
      { rows: [{ a: 'r0a', b: 'r0b', c: 'r0c' }, { a: 'r1a', b: 'r1b', c: 'r1c' }] },
      schema,
      2,
      1,
      1000,
      3,
      5000,
    )
    expect(cache.get('0:0', 0, 0)).toBe('r0a')
    expect(cache.get('0:1', 0, 0)).toBe('r0b')
    expect(cache.get('0:2', 1, 0)).toBe('r1c')
  })

  it('leaves missing tail rows as miss (undefined) rather than throwing', () => {
    const cache = new BlockCache({ maxCachedBlocks: 10 })
    applySliceToBlocks(
      cache,
      { startRow: 0, endRow: 1, startCol: 0, endCol: 0 },
      [{ blockRow: 0, blockCol: 0 }],
      { rows: [{ a: 'r0a' }] }, // only 1 row instead of 2
      schema,
      2,
      1,
      1000,
      3,
      5000,
    )
    expect(cache.get('0:0', 0, 0)).toBe('r0a')
    expect(cache.get('0:0', 1, 0)).toBeUndefined()
  })

  it('warns via console.warn when rows.length does not match the expected row span', () => {
    const cache = new BlockCache({ maxCachedBlocks: 10 })
    const warn = console.warn
    let warned = false
    console.warn = (...args: unknown[]) => {
      warned = true
      warn(...args)
    }
    try {
      applySliceToBlocks(
        cache,
        { startRow: 0, endRow: 2, startCol: 0, endCol: 0 },
        [{ blockRow: 0, blockCol: 0 }],
        { rows: [{ a: 'only-one' }] }, // expected 3 rows
        schema,
        3,
        1,
        1000,
        3,
        5000,
      )
      expect(warned).toBe(true)
    } finally {
      console.warn = warn
    }
  })
})
