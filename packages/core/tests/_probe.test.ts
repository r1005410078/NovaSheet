import { describe, it, expect } from 'bun:test'
import { ChunkedAxis, CHUNK_SIZE } from '../src/layout/ChunkedAxis'

describe('probe — 轴算法探针（非契约）', () => {
  it('CHUNK_SIZE 恒为 1024', () => {
    expect(CHUNK_SIZE).toBe(1024)
  })

  it('positionToIndex：y=i×defaultSize 落在行 i', () => {
    const axis = new ChunkedAxis({ count: 100, defaultSize: 28 })
    // At y=28 should land on row 1
    expect(axis.positionToIndex(28)).toBe(1)
    // At y=27.999 should be row 0
    expect(axis.positionToIndex(27.999)).toBe(0)
  })

  it('positionToIndex 在 chunk 边界 upperBound 正确', () => {
    const axis = new ChunkedAxis({ count: 3000, defaultSize: 28 })
    // chunkPrefixSum[1] = 1024*28 = 28672
    expect(axis.positionToIndex(28672)).toBe(1024) // first row of chunk 1
    expect(axis.positionToIndex(28671)).toBe(1023) // last row of chunk 0
  })

  it('indexToPosition 超 count 时钳制', () => {
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

  it('覆盖 chunk 时 indexToPosition 的 chunk 末端语义', () => {
    const axis = new ChunkedAxis({ count: 2048, defaultSize: 28 })
    axis.setSize(1023, 100) // last row of chunk 0
    // chunk 0 totalSize: 1023*28 + 100 = 28744
    // indexToPosition(1024) should be 28744 (start of chunk 1)
    expect(axis.indexToPosition(1024)).toBe(28744)
    // BUT: indexToPosition(1024) actually reads chunk 1 base, offsetInChunk=0 → returns base
    // base = chunkPrefixSum[1] = chunk0.totalSize = 28744. ✓
  })

  it('覆盖 chunk 内 offset=0 的 indexToPosition', () => {
    const axis = new ChunkedAxis({ count: 3000, defaultSize: 28 })
    axis.setSize(50, 100) // chunk 0 materialized
    // indexToPosition(0) in chunk 0 with sizes array: should return base (0) + sum of [0..0) = 0
    expect(axis.indexToPosition(0)).toBe(0)
  })

  it('count=1 边界情况', () => {
    const axis = new ChunkedAxis({ count: 1, defaultSize: 28 })
    expect(axis.getTotalSize()).toBe(28)
    expect(axis.indexToPosition(0)).toBe(0)
    expect(axis.positionToIndex(0)).toBe(0)
    expect(axis.positionToIndex(27)).toBe(0)
    expect(axis.positionToIndex(28)).toBe(0)
  })

  it('末 chunk setSize：Float32 填充不影响 totalSize', () => {
    const axis = new ChunkedAxis({ count: 1025, defaultSize: 28 })
    // chunk 1 has 1 row, but Float32Array is size CHUNK_SIZE=1024
    // After setSize(1024, 100): expect totalSize = 1024*28 + 100
    axis.setSize(1024, 100)
    expect(axis.getTotalSize()).toBe(1024 * 28 + 100)
    // And positionToIndex of the very last position
    expect(axis.positionToIndex(1024 * 28 + 99)).toBe(1024)
  })

  it('部分物化 chunk：positionToIndex 用 chunk.length', () => {
    const axis = new ChunkedAxis({ count: 1025, defaultSize: 28 })
    axis.setSize(1024, 100) // chunk 1 materialized; chunk 1 has length=1
    // Iteration uses chunk.length=1, never reaches Float32Array padding zeros.
    // Total = 1024*28 + 100 = 28772
    expect(axis.positionToIndex(28672)).toBe(1024) // start of chunk 1
    expect(axis.positionToIndex(28771)).toBe(1024) // last position of chunk 1
  })

  it('末 chunk 越界 setSize 静默 no-op', () => {
    const axis = new ChunkedAxis({ count: 1025, defaultSize: 28 })
    // setSize(1025, ...) — index >= count, no-op ✓
    axis.setSize(1025, 100)
    expect(axis.getTotalSize()).toBe(1025 * 28)
  })

  it('末行高度用 totalSize 回退（非 indexToPosition 差分）', () => {
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
