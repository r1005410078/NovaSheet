import { describe, expect, it } from 'bun:test'
import { ChunkedAxis, CHUNK_SIZE } from '../../../src/kernel/geometry/ChunkedAxis'

/** 朴素参考轴：flat number[]，O(n) 但显然正确，作为 ChunkedAxis 的对拍基准。 */
class NaiveAxis {
  private sizes: number[]
  constructor(
    count: number,
    private defaultSize: number,
  ) {
    this.sizes = Array.from({ length: count }, () => defaultSize)
  }
  getCount() {
    return this.sizes.length
  }
  getTotalSize() {
    return this.sizes.reduce((a, b) => a + b, 0)
  }
  getSize(i: number) {
    return i < 0 || i >= this.sizes.length ? 0 : this.sizes[i]!
  }
  setSize(i: number, s: number) {
    if (i >= 0 && i < this.sizes.length) this.sizes[i] = s
  }
  setDefaultSize(next: number) {
    for (let i = 0; i < this.sizes.length; i++) if (this.sizes[i] === this.defaultSize) this.sizes[i] = next
    this.defaultSize = next
  }
  indexToPosition(index: number) {
    if (this.sizes.length === 0) return 0
    const clamped = Math.max(0, Math.min(this.sizes.length - 1, index))
    let pos = 0
    for (let i = 0; i < clamped; i++) pos += this.sizes[i]!
    return pos
  }
  positionToIndex(position: number) {
    if (this.sizes.length === 0) return 0
    if (position <= 0) return 0
    if (position >= this.getTotalSize()) return this.sizes.length - 1
    let acc = 0
    for (let i = 0; i < this.sizes.length; i++) {
      acc += this.sizes[i]!
      if (acc > position) return i
    }
    return this.sizes.length - 1
  }
  insertRange(at: number, count: number, size: number) {
    const clamped = Math.max(0, Math.min(at, this.sizes.length))
    this.sizes.splice(clamped, 0, ...Array.from({ length: count }, () => size))
  }
  deleteRange(removedSorted: readonly number[]) {
    const set = new Set(removedSorted)
    this.sizes = this.sizes.filter((_, i) => !set.has(i))
  }
}

/**
 * 抽样对拍：朴素参考 indexToPosition/positionToIndex 是 O(n)/调用，逐项全量验证会超时。
 * 故按 stride 抽样 ~sampleCount 个 index + position 探针，并必查首尾边界。
 */
function assertEquivalent(axis: ChunkedAxis, naive: NaiveAxis, sampleCount = 12): void {
  const n = naive.getCount()
  expect(axis.getCount()).toBe(n)
  expect(axis.getTotalSize()).toBeCloseTo(naive.getTotalSize(), 3)
  if (n === 0) {
    expect(axis.getVisibleRange(0, 100)).toEqual([0, -1])
    return
  }
  const step = Math.max(1, Math.floor(n / sampleCount))
  for (let i = 0; i < n; i += step) {
    expect(axis.getSize(i)).toBeCloseTo(naive.getSize(i), 3)
    expect(axis.indexToPosition(i)).toBeCloseTo(naive.indexToPosition(i), 3)
  }
  expect(axis.getSize(n - 1)).toBeCloseTo(naive.getSize(n - 1), 3)
  expect(axis.indexToPosition(n - 1)).toBeCloseTo(naive.indexToPosition(n - 1), 3)
  const total = naive.getTotalSize()
  const pstep = Math.max(1, Math.floor(total / sampleCount))
  for (let p = 0; p <= total; p += pstep) {
    expect(axis.positionToIndex(p)).toBe(naive.positionToIndex(p))
  }
  expect(axis.positionToIndex(0)).toBe(0)
  expect(axis.positionToIndex(total)).toBe(n - 1)
}

/** 小规模穷举对拍：n 小，逐项全量验证可接受，给抽样测试补盲。 */
function assertFully(axis: ChunkedAxis, naive: NaiveAxis): void {
  const n = naive.getCount()
  expect(axis.getCount()).toBe(n)
  expect(axis.getTotalSize()).toBeCloseTo(naive.getTotalSize(), 3)
  for (let i = 0; i < n; i++) {
    expect(axis.getSize(i)).toBeCloseTo(naive.getSize(i), 3)
    expect(axis.indexToPosition(i)).toBeCloseTo(naive.indexToPosition(i), 3)
  }
}

// 确定性 LCG，保证可复现
function makeRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

describe('ChunkedAxis — oracle 对拍', () => {
  it('随机 setSize / insert / delete 序列与朴素参考一致（抽样对拍）', () => {
    const rng = makeRng(12345)
    for (let trial = 0; trial < 10; trial++) {
      const count = 1 + Math.floor(rng() * (CHUNK_SIZE * 3))
      const def = 20 + Math.floor(rng() * 20)
      const axis = new ChunkedAxis({ count, defaultSize: def })
      const naive = new NaiveAxis(count, def)
      for (let op = 0; op < 30; op++) {
        const r = rng()
        if (r < 0.4 && naive.getCount() > 0) {
          const i = Math.floor(rng() * naive.getCount())
          const s = 10 + Math.floor(rng() * 50)
          axis.setSize(i, s)
          naive.setSize(i, s)
        } else if (r < 0.7) {
          const at = Math.floor(rng() * (naive.getCount() + 1))
          // 多数小插入；10% 大插入（> 2·CHUNK_SIZE）以在后续 task 触发分裂
          const c =
            rng() < 0.1 ? CHUNK_SIZE * 2 + 1 + Math.floor(rng() * 8) : 1 + Math.floor(rng() * 16)
          const s = rng() < 0.5 ? def : 10 + Math.floor(rng() * 50)
          axis.insertRange(at, c, s)
          naive.insertRange(at, c, s)
        } else if (naive.getCount() > 1) {
          const k = 1 + Math.floor(rng() * Math.min(10, naive.getCount()))
          const removed = new Set<number>()
          while (removed.size < k) removed.add(Math.floor(rng() * naive.getCount()))
          const sorted = [...removed].sort((a, b) => a - b)
          axis.deleteRange(sorted)
          naive.deleteRange(sorted)
        }
        assertEquivalent(axis, naive)
      }
    }
  })

  it('小规模穷举 insert / delete / setSize 与参考全量一致', () => {
    const axis = new ChunkedAxis({ count: 40, defaultSize: 20 })
    const naive = new NaiveAxis(40, 20)

    axis.setSize(5, 60)
    naive.setSize(5, 60)
    assertFully(axis, naive)

    axis.insertRange(0, 3, 99)
    naive.insertRange(0, 3, 99)
    assertFully(axis, naive)

    axis.insertRange(naive.getCount(), 2, 15) // 末尾追加
    naive.insertRange(naive.getCount(), 2, 15)
    assertFully(axis, naive)

    axis.deleteRange([0, 1])
    naive.deleteRange([0, 1])
    assertFully(axis, naive)

    axis.insertRange(10, 1, 20) // 默认尺寸插入
    naive.insertRange(10, 1, 20)
    assertFully(axis, naive)
  })

  it('setDefaultSize 后仍与参考一致', () => {
    const axis = new ChunkedAxis({ count: 3000, defaultSize: 28 })
    const naive = new NaiveAxis(3000, 28)
    for (const i of [0, 1023, 1024, 1025, 2999]) {
      axis.setSize(i, 50)
      naive.setSize(i, 50)
    }
    axis.setDefaultSize(40)
    naive.setDefaultSize(40)
    assertEquivalent(axis, naive)
  })
})
