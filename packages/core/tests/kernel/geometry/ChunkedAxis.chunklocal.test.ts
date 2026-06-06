import { describe, expect, it } from 'bun:test'
import { ChunkedAxis, CHUNK_SIZE } from '../../../src/kernel/geometry/ChunkedAxis'

describe('ChunkedAxis — 变长 chunk 边界', () => {
  it('在块尾 / 块首 / 正中插入后 position 一致', () => {
    for (const at of [0, CHUNK_SIZE - 1, CHUNK_SIZE, CHUNK_SIZE + 1, 2 * CHUNK_SIZE]) {
      const axis = new ChunkedAxis({ count: 3 * CHUNK_SIZE, defaultSize: 30 })
      axis.insertRange(at, 5, 50)
      expect(axis.getCount()).toBe(3 * CHUNK_SIZE + 5)
      expect(axis.getSize(at)).toBe(50)
      expect(axis.getSize(at + 4)).toBe(50)
      // 插入点处位置 = at 个 30
      expect(axis.indexToPosition(at)).toBe(at * 30)
      // 互逆
      expect(axis.positionToIndex(axis.indexToPosition(at))).toBe(at)
    }
  })

  it('bulk 插入 > SPLIT_THRESHOLD 触发多次分裂仍正确', () => {
    const axis = new ChunkedAxis({ count: 10, defaultSize: 28 })
    axis.insertRange(5, CHUNK_SIZE * 5, 28)
    expect(axis.getCount()).toBe(10 + CHUNK_SIZE * 5)
    expect(axis.getTotalSize()).toBe((10 + CHUNK_SIZE * 5) * 28)
    expect(axis.indexToPosition(axis.getCount() - 1)).toBe((axis.getCount() - 1) * 28)
    // 没有超过 SPLIT_THRESHOLD 的 chunk
    expect(axis.getChunkCount()).toBeGreaterThan(1)
  })

  it('删除大部分后空块过滤 + 访问器正确', () => {
    const axis = new ChunkedAxis({ count: 2 * CHUNK_SIZE, defaultSize: 30 })
    // 删掉第二块绝大部分（含被删的 setSize 项），覆盖空块/小块过滤路径
    const removed = Array.from({ length: CHUNK_SIZE - 2 }, (_, i) => CHUNK_SIZE + 2 + i)
    axis.deleteRange(removed)
    const remaining = 2 * CHUNK_SIZE - removed.length
    expect(axis.getCount()).toBe(remaining)
    // 全默认 30，末项左边界 = (remaining - 1) * 30
    expect(axis.indexToPosition(remaining - 1)).toBe((remaining - 1) * 30)
    expect(axis.getTotalSize()).toBe(remaining * 30)
    expect(axis.positionToIndex(0)).toBe(0)
    expect(axis.positionToIndex(axis.getTotalSize())).toBe(remaining - 1)
  })

  it('删空全部后回到空轴语义', () => {
    const axis = new ChunkedAxis({ count: 3, defaultSize: 20 })
    axis.deleteRange([0, 1, 2])
    expect(axis.getCount()).toBe(0)
    expect(axis.getTotalSize()).toBe(0)
    expect(axis.getVisibleRange(0, 100)).toEqual([0, -1])
    axis.insertRange(0, 2, 25)
    expect(axis.getCount()).toBe(2)
    expect(axis.getSize(0)).toBe(25)
  })
})

// ─── 追加：全量对拍 trial（内联 NaiveAxis，确定性 LCG，约 n=2·CHUNK_SIZE 规模）─────────────

/** 最小朴素参考轴：仅用于对拍，O(n) 但显然正确。 */
class NaiveAxis {
  private sizes: number[]
  constructor(count: number, defaultSize: number) {
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

function makeRng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

/**
 * 全量逐项对拍：验证所有 index 的 getSize/indexToPosition，以及抽样 positionToIndex。
 * 规模约 2·CHUNK_SIZE，每步全量遍历，补强抽样 oracle 在采样间隙可能漏掉的单点回归。
 */
describe('ChunkedAxis — 全量对拍 trial（n≈2·CHUNK_SIZE）', () => {
  it('约 30 步混合操作后逐项 getSize/indexToPosition 与 NaiveAxis 完全一致', () => {
    const rng = makeRng(99991)
    const initCount = CHUNK_SIZE * 2
    const def = 24
    const axis = new ChunkedAxis({ count: initCount, defaultSize: def })
    const naive = new NaiveAxis(initCount, def)

    for (let op = 0; op < 30; op++) {
      const r = rng()
      if (r < 0.4 && naive.getCount() > 0) {
        // setSize
        const i = Math.floor(rng() * naive.getCount())
        const s = 10 + Math.floor(rng() * 60)
        axis.setSize(i, s)
        naive.setSize(i, s)
      } else if (r < 0.7) {
        // insertRange（偶尔大插入触发分裂）
        const at = Math.floor(rng() * (naive.getCount() + 1))
        const c = rng() < 0.1 ? CHUNK_SIZE * 2 + 3 : 1 + Math.floor(rng() * 12)
        const s = rng() < 0.5 ? def : 10 + Math.floor(rng() * 50)
        axis.insertRange(at, c, s)
        naive.insertRange(at, c, s)
      } else if (naive.getCount() > 1) {
        // deleteRange
        const k = 1 + Math.floor(rng() * Math.min(8, naive.getCount()))
        const removed = new Set<number>()
        while (removed.size < k) removed.add(Math.floor(rng() * naive.getCount()))
        const sorted = [...removed].sort((a, b) => a - b)
        axis.deleteRange(sorted)
        naive.deleteRange(sorted)
      }

      // 全量逐项验证
      const n = naive.getCount()
      expect(axis.getCount()).toBe(n)
      expect(axis.getTotalSize()).toBeCloseTo(naive.getTotalSize(), 3)
      for (let i = 0; i < n; i++) {
        expect(axis.getSize(i)).toBeCloseTo(naive.getSize(i), 3)
        expect(axis.indexToPosition(i)).toBeCloseTo(naive.indexToPosition(i), 3)
      }
      // 抽样 positionToIndex（全量太慢，NaiveAxis O(n²) 会超时）
      const total = naive.getTotalSize()
      if (n > 0 && total > 0) {
        const step = Math.max(1, Math.floor(total / 16))
        for (let p = 0; p <= total; p += step) {
          expect(axis.positionToIndex(p)).toBe(naive.positionToIndex(p))
        }
        expect(axis.positionToIndex(0)).toBe(0)
        expect(axis.positionToIndex(total)).toBe(n - 1)
      }
    }
  })
})
