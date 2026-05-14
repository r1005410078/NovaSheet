import { describe, expect, it } from 'vitest'
import { ChunkedAxis, CHUNK_SIZE } from '../../src/layout/ChunkedAxis'

describe('ChunkedAxis (all default)', () => {
  it('totalSize = count × defaultSize', () => {
    const axis = new ChunkedAxis({ count: 100, defaultSize: 28 })
    expect(axis.getTotalSize()).toBe(100 * 28)
  })

  it('indexToPosition uses O(1) fast path for null chunks', () => {
    const axis = new ChunkedAxis({ count: 5000, defaultSize: 28 })
    expect(axis.indexToPosition(0)).toBe(0)
    expect(axis.indexToPosition(1)).toBe(28)
    expect(axis.indexToPosition(10)).toBe(280)
    expect(axis.indexToPosition(1024)).toBe(1024 * 28)
    expect(axis.indexToPosition(4999)).toBe(4999 * 28)
  })

  it('positionToIndex inverts indexToPosition', () => {
    const axis = new ChunkedAxis({ count: 5000, defaultSize: 28 })
    expect(axis.positionToIndex(0)).toBe(0)
    expect(axis.positionToIndex(27)).toBe(0)
    expect(axis.positionToIndex(28)).toBe(1)
    expect(axis.positionToIndex(4999 * 28)).toBe(4999)
  })

  it('positionToIndex clamps to valid index range', () => {
    const axis = new ChunkedAxis({ count: 10, defaultSize: 28 })
    expect(axis.positionToIndex(-100)).toBe(0)
    expect(axis.positionToIndex(99999)).toBe(9)
  })

  it('chunk count = ceil(count / CHUNK_SIZE)', () => {
    expect(CHUNK_SIZE).toBe(1024)
    const axis1 = new ChunkedAxis({ count: 1, defaultSize: 28 })
    const axis2 = new ChunkedAxis({ count: 1024, defaultSize: 28 })
    const axis3 = new ChunkedAxis({ count: 1025, defaultSize: 28 })
    expect(axis1.getChunkCount()).toBe(1)
    expect(axis2.getChunkCount()).toBe(1)
    expect(axis3.getChunkCount()).toBe(2)
  })

  it('count = 0 produces zero total size and no chunks', () => {
    const axis = new ChunkedAxis({ count: 0, defaultSize: 28 })
    expect(axis.getTotalSize()).toBe(0)
    expect(axis.getChunkCount()).toBe(0)
  })
})
