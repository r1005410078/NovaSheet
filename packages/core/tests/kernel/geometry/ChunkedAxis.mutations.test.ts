import { describe, expect, it } from 'bun:test'
import { ChunkedAxis } from '../../../src/kernel/geometry/ChunkedAxis'

const DEFAULT_SIZE = 20

function fresh(count: number): ChunkedAxis {
  return new ChunkedAxis({ count, defaultSize: DEFAULT_SIZE })
}

describe('ChunkedAxis.insertRange', () => {
  it('在中段插 3 行，总数 +3，新行尺寸 = defaultSize', () => {
    const axis = fresh(10)
    axis.insertRange(5, 3, DEFAULT_SIZE)
    expect(axis.getCount()).toBe(13)
    expect(axis.getSize(5)).toBe(DEFAULT_SIZE)
    expect(axis.getTotalSize()).toBe(13 * DEFAULT_SIZE)
  })

  it('在已 setSize 的行之后插入，前段尺寸保留', () => {
    const axis = fresh(10)
    axis.setSize(3, 50)
    axis.insertRange(7, 2, DEFAULT_SIZE)
    expect(axis.getSize(3)).toBe(50)
    expect(axis.getCount()).toBe(12)
  })

  it('跨 chunk 边界（CHUNK_SIZE=1024）插入', () => {
    const axis = new ChunkedAxis({ count: 2050, defaultSize: DEFAULT_SIZE })
    axis.insertRange(1023, 4, DEFAULT_SIZE)
    expect(axis.getCount()).toBe(2054)
    expect(axis.getSize(1023)).toBe(DEFAULT_SIZE)
    expect(axis.getTotalSize()).toBe(2054 * DEFAULT_SIZE)
  })
})

describe('ChunkedAxis.deleteRange', () => {
  it('删 [3, 5] 总数 -2', () => {
    const axis = fresh(10)
    axis.setSize(3, 50)
    axis.setSize(5, 60)
    axis.deleteRange([3, 5])
    expect(axis.getCount()).toBe(8)
    // 原索引 4 → 新索引 3，原索引 6 → 新索引 4
    expect(axis.getSize(3)).toBe(DEFAULT_SIZE) // 原 4
  })

  it('删尾部行，总数收缩', () => {
    const axis = fresh(10)
    axis.deleteRange([9])
    expect(axis.getCount()).toBe(9)
  })
})
