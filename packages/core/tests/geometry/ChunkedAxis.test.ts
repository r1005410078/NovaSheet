import { describe, expect, it } from 'bun:test'
import { ChunkedAxis, CHUNK_SIZE } from '../../src/geometry/ChunkedAxis'

describe('ChunkedAxis — 全默认尺寸', () => {
  it('totalSize = count × defaultSize', () => {
    const axis = new ChunkedAxis({ count: 100, defaultSize: 28 })
    expect(axis.getTotalSize()).toBe(100 * 28)
  })

  it('indexToPosition 对空 chunk 走 O(1) 快路径', () => {
    const axis = new ChunkedAxis({ count: 5000, defaultSize: 28 })
    expect(axis.indexToPosition(0)).toBe(0)
    expect(axis.indexToPosition(1)).toBe(28)
    expect(axis.indexToPosition(10)).toBe(280)
    expect(axis.indexToPosition(1024)).toBe(1024 * 28)
    expect(axis.indexToPosition(4999)).toBe(4999 * 28)
  })

  it('positionToIndex 与 indexToPosition 互逆', () => {
    const axis = new ChunkedAxis({ count: 5000, defaultSize: 28 })
    expect(axis.positionToIndex(0)).toBe(0)
    expect(axis.positionToIndex(27)).toBe(0)
    expect(axis.positionToIndex(28)).toBe(1)
    expect(axis.positionToIndex(4999 * 28)).toBe(4999)
  })

  it('positionToIndex 钳制到合法索引', () => {
    const axis = new ChunkedAxis({ count: 10, defaultSize: 28 })
    expect(axis.positionToIndex(-100)).toBe(0)
    expect(axis.positionToIndex(99999)).toBe(9)
  })

  it('chunk 数 = ceil(count / CHUNK_SIZE)', () => {
    expect(CHUNK_SIZE).toBe(1024)
    const axis1 = new ChunkedAxis({ count: 1, defaultSize: 28 })
    const axis2 = new ChunkedAxis({ count: 1024, defaultSize: 28 })
    const axis3 = new ChunkedAxis({ count: 1025, defaultSize: 28 })
    expect(axis1.getChunkCount()).toBe(1)
    expect(axis2.getChunkCount()).toBe(1)
    expect(axis3.getChunkCount()).toBe(2)
  })

  it('count=0 时 totalSize=0 且无 chunk', () => {
    const axis = new ChunkedAxis({ count: 0, defaultSize: 28 })
    expect(axis.getTotalSize()).toBe(0)
    expect(axis.getChunkCount()).toBe(0)
  })
})

describe('ChunkedAxis — 变更尺寸', () => {
  it('setSize 物化 chunk 并更新 total', () => {
    const axis = new ChunkedAxis({ count: 100, defaultSize: 28 })
    const before = axis.version
    axis.setSize(5, 50)
    expect(axis.getTotalSize()).toBe(99 * 28 + 50)
    expect(axis.indexToPosition(5)).toBe(5 * 28)
    expect(axis.indexToPosition(6)).toBe(5 * 28 + 50)
    expect(axis.version).toBeGreaterThan(before)
  })

  it('跨 chunk setSize 更新前缀和', () => {
    const axis = new ChunkedAxis({ count: 3000, defaultSize: 28 })
    axis.setSize(100, 100)
    axis.setSize(2000, 200)
    expect(axis.indexToPosition(2001)).toBe(101 * 28 + (100 - 28) + (2000 - 101) * 28 + 200)
    expect(axis.getTotalSize()).toBe(3000 * 28 + (100 - 28) + (200 - 28))
  })

  it('空 chunk 上 setSize 为默认值时不分配', () => {
    const axis = new ChunkedAxis({ count: 100, defaultSize: 28 })
    const before = axis.version
    axis.setSize(5, 28)
    expect(axis.getTotalSize()).toBe(100 * 28)
    expect(axis.version).toBe(before)
  })

  it('越界 setSize 为 no-op', () => {
    const axis = new ChunkedAxis({ count: 10, defaultSize: 28 })
    axis.setSize(-1, 100)
    axis.setSize(100, 100)
    expect(axis.getTotalSize()).toBe(10 * 28)
  })

  it('变更后 positionToIndex 仍可互逆', () => {
    const axis = new ChunkedAxis({ count: 1000, defaultSize: 28 })
    axis.setSize(10, 100)
    axis.setSize(11, 100)
    expect(axis.positionToIndex(axis.indexToPosition(10))).toBe(10)
    expect(axis.positionToIndex(axis.indexToPosition(11))).toBe(11)
    expect(axis.positionToIndex(axis.indexToPosition(12) - 1)).toBe(11)
  })
})

describe('ChunkedAxis — 可见区间与默认行高', () => {
  it('getVisibleRange 返回闭区间 [first, last]', () => {
    const axis = new ChunkedAxis({ count: 1000, defaultSize: 28 })
    expect(axis.getVisibleRange(0, 100)).toEqual([0, 3]) // 0..27, 28..55, 56..83, 84..111 (last covered)
    expect(axis.getVisibleRange(56, 84)).toEqual([2, 3])
  })

  it('getVisibleRange 钳制到 0..count-1', () => {
    const axis = new ChunkedAxis({ count: 5, defaultSize: 28 })
    expect(axis.getVisibleRange(-100, 99999)).toEqual([0, 4])
  })

  it('count=0 时 getVisibleRange 为 [0,-1]', () => {
    const axis = new ChunkedAxis({ count: 0, defaultSize: 28 })
    expect(axis.getVisibleRange(0, 100)).toEqual([0, -1])
  })

  it('setDefaultSize 更新 total 且保留覆盖', () => {
    const axis = new ChunkedAxis({ count: 100, defaultSize: 28 })
    axis.setSize(5, 100)
    axis.setDefaultSize(40)
    expect(axis.getDefaultSize()).toBe(40)
    // Override sticks: row 5 stays at 100. All other rows (which were 28) scale to 40.
    // Total = 99 rows × 40 + 1 override × 100 = 4060
    expect(axis.getTotalSize()).toBe(99 * 40 + 100)
    // Row 5 still 100 wide: position of row 6 = 5 defaults + the override
    expect(axis.indexToPosition(6)).toBe(5 * 40 + 100)
    // Row 5 itself starts after 5 default rows
    expect(axis.indexToPosition(5)).toBe(5 * 40)
  })
})

describe('ChunkedAxis.getSize — 行高读取', () => {
  it('默认 chunk 返回 defaultSize', () => {
    const axis = new ChunkedAxis({ count: 100, defaultSize: 28 })
    expect(axis.getSize(0)).toBe(28)
    expect(axis.getSize(99)).toBe(28)
  })

  it('物化 chunk 返回覆盖尺寸', () => {
    const axis = new ChunkedAxis({ count: 100, defaultSize: 28 })
    axis.setSize(5, 60)
    expect(axis.getSize(5)).toBe(60)
    expect(axis.getSize(4)).toBe(28)
    expect(axis.getSize(6)).toBe(28)
  })

  it('越界索引 getSize 返回 0', () => {
    const axis = new ChunkedAxis({ count: 10, defaultSize: 28 })
    expect(axis.getSize(-1)).toBe(0)
    expect(axis.getSize(10)).toBe(0)
    expect(axis.getSize(100)).toBe(0)
  })

  it('最后一行 getSize 正确（边界无零高 bug）', () => {
    const axis = new ChunkedAxis({ count: 10, defaultSize: 28 })
    axis.setSize(9, 50)
    expect(axis.getSize(9)).toBe(50)
    // Confirm the buggy alternative gives 0
    expect(axis.indexToPosition(10) - axis.indexToPosition(9)).toBe(0)
  })
})
