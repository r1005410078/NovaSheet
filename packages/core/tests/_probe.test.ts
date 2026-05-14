import { describe, it, expect } from 'vitest'
import { ChunkedAxis, CHUNK_SIZE } from '../src/layout/ChunkedAxis'

describe('probe', () => {
  it('CHUNK_SIZE invariant is 1024 (used by partial-chunk tests below)', () => {
    expect(CHUNK_SIZE).toBe(1024)
  })

  it('positionToIndex at exact boundary y = i*defaultSize lands on i', () => {
    const axis = new ChunkedAxis({ count: 100, defaultSize: 28 })
    // At y=28 should land on row 1
    expect(axis.positionToIndex(28)).toBe(1)
    // At y=27.999 should be row 0
    expect(axis.positionToIndex(27.999)).toBe(0)
  })

  it('positionToIndex at chunkPrefixSum boundary handles upperBound correctly', () => {
    const axis = new ChunkedAxis({ count: 3000, defaultSize: 28 })
    // chunkPrefixSum[1] = 1024*28 = 28672
    expect(axis.positionToIndex(28672)).toBe(1024) // first row of chunk 1
    expect(axis.positionToIndex(28671)).toBe(1023) // last row of chunk 0
  })

  it('indexToPosition for index BEYOND count clamps', () => {
    const axis = new ChunkedAxis({ count: 10, defaultSize: 28 })
    // Renderer code: rowsAxis.indexToPosition(r + 1) when r = count-1 = 9
    // This will pass index=10, which should clamp to 9. The implementation clamps to count-1=9,
    // returning position of row 9, not the END of row 9. That's the bug.
    const lastIdx = axis.indexToPosition(9)
    const beyond = axis.indexToPosition(10)
    // So beyond == lastIdx (== 9*28), NOT 10*28 (=totalSize). Renderer compensates with the
    // (r+1 >= count) special case.
    expect(beyond).toBe(lastIdx)
  })

  it('indexToPosition with override chunk: end-of-chunk semantics', () => {
    const axis = new ChunkedAxis({ count: 2048, defaultSize: 28 })
    axis.setSize(1023, 100) // last row of chunk 0
    // chunk 0 totalSize: 1023*28 + 100 = 28744
    // indexToPosition(1024) should be 28744 (start of chunk 1)
    expect(axis.indexToPosition(1024)).toBe(28744)
    // BUT: indexToPosition(1024) actually reads chunk 1 base, offsetInChunk=0 → returns base
    // base = chunkPrefixSum[1] = chunk0.totalSize = 28744. ✓
  })

  it('indexToPosition for index inside override chunk at offset 0 still sums [0..offset)', () => {
    const axis = new ChunkedAxis({ count: 3000, defaultSize: 28 })
    axis.setSize(50, 100) // chunk 0 materialized
    // indexToPosition(0) in chunk 0 with sizes array: should return base (0) + sum of [0..0) = 0
    expect(axis.indexToPosition(0)).toBe(0)
  })

  it('count=1 edge case', () => {
    const axis = new ChunkedAxis({ count: 1, defaultSize: 28 })
    expect(axis.getTotalSize()).toBe(28)
    expect(axis.indexToPosition(0)).toBe(0)
    expect(axis.positionToIndex(0)).toBe(0)
    expect(axis.positionToIndex(27)).toBe(0)
    expect(axis.positionToIndex(28)).toBe(0)
  })

  it('setSize on last partial chunk: Float32Array pad with zeros must NOT affect totalSize', () => {
    const axis = new ChunkedAxis({ count: 1025, defaultSize: 28 })
    // chunk 1 has 1 row, but Float32Array is size CHUNK_SIZE=1024
    // After setSize(1024, 100): expect totalSize = 1024*28 + 100
    axis.setSize(1024, 100)
    expect(axis.getTotalSize()).toBe(1024 * 28 + 100)
    // And positionToIndex of the very last position
    expect(axis.positionToIndex(1024 * 28 + 99)).toBe(1024)
  })

  it('positionToIndex in materialized partial chunk: iteration uses chunk.length (not padded array length)', () => {
    const axis = new ChunkedAxis({ count: 1025, defaultSize: 28 })
    axis.setSize(1024, 100) // chunk 1 materialized; chunk 1 has length=1
    // Iteration uses chunk.length=1, never reaches Float32Array padding zeros.
    // Total = 1024*28 + 100 = 28772
    expect(axis.positionToIndex(28672)).toBe(1024) // start of chunk 1
    expect(axis.positionToIndex(28771)).toBe(1024) // last position of chunk 1
  })

  it('setSize last partial chunk: writing to a PAST-rowsInChunk index is silently allowed', () => {
    const axis = new ChunkedAxis({ count: 1025, defaultSize: 28 })
    // setSize(1025, ...) — index >= count, no-op ✓
    axis.setSize(1025, 100)
    expect(axis.getTotalSize()).toBe(1025 * 28)
  })

  it('Renderer.paintQuadrant computes row height for last row using totalSize fallback', () => {
    // Validate the implementation in Renderer: for r = count-1, indexToPosition(r+1) returns
    // the SAME as indexToPosition(r) (because index r+1 clamps to count-1). So rowHeight needs
    // the special case (r + 1 >= count) ? getTotalSize() - yTop : yBottom - yTop. ✓ has it.
    const axis = new ChunkedAxis({ count: 10, defaultSize: 28 })
    axis.setSize(9, 50) // last row override
    expect(axis.indexToPosition(9)).toBe(9 * 28)
    expect(axis.indexToPosition(10)).toBe(9 * 28) // clamps
    expect(axis.getTotalSize() - axis.indexToPosition(9)).toBe(50) // ← correct
  })
})
