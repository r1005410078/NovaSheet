# Core Perf Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 收口 `packages/core/src` 三处可扩展性债——ChunkedAxis 次线性 insert/delete、RangeStyleStore applyBorders 单层化、HideRowsLayer gap view 空间重写——纯重构 + 一处 hide+sort 坐标修正。

**Architecture:** 三组件互不依赖。组件 1 把 ChunkedAxis 固定寻址 `index>>>10` 换成「变长 chunk + 累计计数二分」，分步迁移（先抽象寻址保持行为不变、再变长化 insert/delete），全程 oracle 对拍守绿。组件 2/3 各为单组件 TDD。

**Tech Stack:** TypeScript（strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`）、`bun test`、oxlint。

**设计来源：** `docs/superpowers/specs/2026-06-06-novasheet-core-perf-hardening-design.md`

**全程纪律：**
- 每个 task 结束前跑 `bun run lint`、`bun run --filter '@novasheet/core' typecheck`、相关 `bun test` 全绿才提交。
- type-only import 用 `import type`。`noUncheckedIndexedAccess` 下数组读用 `!` 或显式 guard。
- 提交信息中文正文 + 英文 `type(scope)` 前缀；**禁止 `--no-verify`**。
- 不改任何对外 API / 渲染契约 / undo 命令形状。

---

## 组件 1 — ChunkedAxis 次线性 insert/delete

文件：
- Modify: `packages/core/src/kernel/geometry/ChunkedAxis.ts`
- Modify: `packages/core/src/kernel/util/ChunkArray.ts`（注释更新）
- Create: `packages/core/tests/kernel/geometry/ChunkedAxis.oracle.test.ts`
- Create: `packages/core/tests/kernel/geometry/ChunkedAxis.chunklocal.test.ts`

### Task 1: oracle 对拍测试（characterization，锁定现有行为）

这是行为保持型重构：oracle 用朴素 flat-array 参考实现镜像 ChunkedAxis 的可观察行为，对随机操作序列对拍。它**对当前实现应 PASS**（锁定现状），后续 task 在它的保护下重写内部，任何回归立即变红。

**Files:**
- Create: `packages/core/tests/kernel/geometry/ChunkedAxis.oracle.test.ts`

- [ ] **Step 1: 写 oracle 测试**

```ts
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

function assertEquivalent(axis: ChunkedAxis, naive: NaiveAxis): void {
  expect(axis.getCount()).toBe(naive.getCount())
  expect(axis.getTotalSize()).toBeCloseTo(naive.getTotalSize(), 3)
  const n = naive.getCount()
  for (let i = 0; i < n; i++) {
    expect(axis.getSize(i)).toBeCloseTo(naive.getSize(i), 3)
    expect(axis.indexToPosition(i)).toBeCloseTo(naive.indexToPosition(i), 3)
  }
  const total = naive.getTotalSize()
  for (let p = 0; p <= total; p += Math.max(1, Math.floor(total / 200))) {
    expect(axis.positionToIndex(p)).toBe(naive.positionToIndex(p))
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
  it('随机 setSize / insert / delete 序列与朴素参考一致', () => {
    const rng = makeRng(12345)
    for (let trial = 0; trial < 20; trial++) {
      const count = 1 + Math.floor(rng() * (CHUNK_SIZE * 3))
      const def = 20 + Math.floor(rng() * 20)
      const axis = new ChunkedAxis({ count, defaultSize: def })
      const naive = new NaiveAxis(count, def)
      for (let op = 0; op < 60; op++) {
        const r = rng()
        if (r < 0.4 && naive.getCount() > 0) {
          const i = Math.floor(rng() * naive.getCount())
          const s = 10 + Math.floor(rng() * 50)
          axis.setSize(i, s)
          naive.setSize(i, s)
        } else if (r < 0.7) {
          const at = Math.floor(rng() * (naive.getCount() + 1))
          const c = 1 + Math.floor(rng() * (CHUNK_SIZE + 5))
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
```

- [ ] **Step 2: 跑测试，确认对当前实现 PASS（锁定基线）**

Run: `bun test packages/core/tests/kernel/geometry/ChunkedAxis.oracle.test.ts`
Expected: PASS（当前 insert/delete 正确，只是慢；oracle 此刻是 characterization 网，不是红测试）

- [ ] **Step 3: 提交**

```bash
git add packages/core/tests/kernel/geometry/ChunkedAxis.oracle.test.ts
git commit -m "test(core): ChunkedAxis oracle 对拍网，锁定 insert/delete 现有行为"
```

### Task 2: 抽象寻址（`chunkCountPrefix` + `indexToChunk`），迁移读访问器

引入累计计数前缀与二分寻址 helper，把所有读访问器从 `index>>>10` 迁到 `indexToChunk`。此步 chunk 仍恒为 CHUNK_SIZE，**可观察行为不变**，oracle 与现有测试保持绿。

**Files:**
- Modify: `packages/core/src/kernel/geometry/ChunkedAxis.ts`

- [ ] **Step 1: 加字段与 helper**

在 `chunkPrefixSum` 字段旁加：

```ts
  /** chunkCountPrefix[i] = chunks[0..i) 的项数累计；长度 = chunks.length + 1，[0]=0，[last]=count */
  private chunkCountPrefix!: Float64Array
```

加私有 helper（放在 `getChunkCount` 之后）：

```ts
  /** 重算 chunkCountPrefix / chunkPrefixSum / totalSize（O(n_chunks)），结构变更后调用。 */
  private recomputePrefixes(): void {
    const n = this.chunks.length
    this.chunkCountPrefix = new Float64Array(n + 1)
    this.chunkPrefixSum = new Float64Array(n + 1)
    for (let i = 0; i < n; i++) {
      const chunk = this.chunks[i]!
      this.chunkCountPrefix[i + 1] = this.chunkCountPrefix[i]! + chunk.length
      this.chunkPrefixSum[i + 1] = this.chunkPrefixSum[i]! + chunk.totalSize
    }
    this.totalSize = n === 0 ? 0 : this.chunkPrefixSum[n]!
  }

  /** 二分 chunkCountPrefix 定位全局 index 所在 chunk 与块内偏移（O(log n_chunks)）。 */
  private indexToChunk(index: number): { chunkIdx: number; offset: number } {
    const chunkIdx = upperBound(this.chunkCountPrefix, this.chunks.length + 1, index) - 1
    return { chunkIdx, offset: index - this.chunkCountPrefix[chunkIdx]! }
  }
```

- [ ] **Step 2: rebuild() 改用 recomputePrefixes**

把 `rebuild()` 末尾的 prefixSum 累加循环替换为：

```ts
  private rebuild(): void {
    const nChunks = Math.ceil(this.count / CHUNK_SIZE)
    this.chunks = Array.from({ length: nChunks })
    for (let i = 0; i < nChunks; i++) {
      const rowsInChunk = i === nChunks - 1 ? this.count - i * CHUNK_SIZE : CHUNK_SIZE
      this.chunks[i] = createDefaultChunk(rowsInChunk, this.defaultSize)
    }
    this.recomputePrefixes()
    this._version++
  }
```

- [ ] **Step 3: 迁移 getSize / indexToPosition / positionToIndex / setSize 的寻址**

`getSize`：

```ts
  getSize(index: number): number {
    if (index < 0 || index >= this.count) return 0
    const { chunkIdx, offset } = this.indexToChunk(index)
    const chunk = this.chunks[chunkIdx]!
    if (chunk.sizes === null) return this.defaultSize
    return chunk.sizes[offset]!
  }
```

`indexToPosition`：

```ts
  indexToPosition(index: number): number {
    if (this.count === 0) return 0
    const clamped = Math.max(0, Math.min(this.count - 1, index))
    const { chunkIdx, offset } = this.indexToChunk(clamped)
    const base = this.chunkPrefixSum[chunkIdx]!
    const chunk = this.chunks[chunkIdx]!
    if (chunk.sizes === null) return base + offset * this.defaultSize
    let sum = 0
    for (let i = 0; i < offset; i++) sum += chunk.sizes[i]!
    return base + sum
  }
```

`positionToIndex`（块基索引从 `chunkIdx * CHUNK_SIZE` 改为 `chunkCountPrefix[chunkIdx]`，块内上界用 `chunk.length`）：

```ts
  positionToIndex(position: number): number {
    if (this.count === 0) return 0
    if (position <= 0) return 0
    if (position >= this.totalSize) return this.count - 1
    const chunkIdx = upperBound(this.chunkPrefixSum, this.chunks.length + 1, position) - 1
    const chunk = this.chunks[chunkIdx]!
    const baseIndex = this.chunkCountPrefix[chunkIdx]!
    const yInChunk = position - this.chunkPrefixSum[chunkIdx]!
    if (chunk.sizes === null) {
      const inner = Math.min(chunk.length - 1, Math.floor(yInChunk / this.defaultSize))
      return Math.min(this.count - 1, baseIndex + inner)
    }
    let acc = 0
    for (let i = 0; i < chunk.length; i++) {
      acc += chunk.sizes[i]!
      if (acc > yInChunk) return Math.min(this.count - 1, baseIndex + i)
    }
    return Math.min(this.count - 1, baseIndex + chunk.length - 1)
  }
```

`setSize`（寻址改 `indexToChunk`，物化按 `chunk.length` 分配；增量 prefixSum 传播保持不变——counts 不变故 chunkCountPrefix 不动）：

```ts
  setSize(index: number, size: number): void {
    if (index < 0 || index >= this.count) return
    const { chunkIdx, offset } = this.indexToChunk(index)
    const chunk = this.chunks[chunkIdx]!
    if (chunk.sizes === null) {
      if (size === this.defaultSize) return
      const sizes = new Float32Array(chunk.length)
      sizes.fill(this.defaultSize)
      chunk.sizes = sizes
    }
    const old = chunk.sizes[offset]!
    const delta = size - old
    if (delta === 0) return
    chunk.sizes[offset] = size
    chunk.totalSize += delta
    for (let i = chunkIdx + 1; i <= this.chunks.length; i++) {
      this.chunkPrefixSum[i] = this.chunkPrefixSum[i]! + delta
    }
    this.totalSize += delta
    this._version++
  }
```

> 注意：物化数组容量从「恒 `CHUNK_SIZE`」改为「`chunk.length`」。`flattenSizes`（Task 4 删除）此刻仍用 `>>>10`，但 Task 2 后 chunk 仍恒长，故仍正确——下一步若想立即统一可迁移，但本步留它不动以缩小 diff。

- [ ] **Step 4: 跑 oracle + 现有 ChunkedAxis 测试，确认全绿**

Run: `bun test packages/core/tests/kernel/geometry/`
Expected: PASS（行为不变）

- [ ] **Step 5: lint + typecheck + 提交**

```bash
bun run lint && bun run --filter '@novasheet/core' typecheck
git add packages/core/src/kernel/geometry/ChunkedAxis.ts
git commit -m "refactor(core): ChunkedAxis 抽象寻址为 chunkCountPrefix 二分，迁移读访问器"
```

### Task 3: setDefaultSize 改用 recomputePrefixes（变长就绪）

**Files:**
- Modify: `packages/core/src/kernel/geometry/ChunkedAxis.ts`

- [ ] **Step 1: 重写 setDefaultSize**

```ts
  setDefaultSize(newDefault: number): void {
    if (newDefault === this.defaultSize) return
    const oldDefault = this.defaultSize
    this.defaultSize = newDefault
    for (const chunk of this.chunks) {
      if (chunk.sizes === null) {
        chunk.totalSize = chunk.length * newDefault
      } else {
        let sum = 0
        for (let k = 0; k < chunk.length; k++) {
          if (chunk.sizes[k] === oldDefault) chunk.sizes[k] = newDefault
          sum += chunk.sizes[k]!
        }
        chunk.totalSize = sum
      }
    }
    this.recomputePrefixes()
    this._version++
  }
```

- [ ] **Step 2: 跑 oracle + 现有测试**

Run: `bun test packages/core/tests/kernel/geometry/`
Expected: PASS

- [ ] **Step 3: 提交**

```bash
git add packages/core/src/kernel/geometry/ChunkedAxis.ts
git commit -m "refactor(core): ChunkedAxis.setDefaultSize 走 recomputePrefixes，变长 chunk 就绪"
```

### Task 4: 变长 chunk insert/delete（核心）

把 `insertRange` / `deleteRange` 从「flatten + rebuild + setSize 风暴」换成块内 splice + 分裂/合并 + `recomputePrefixes`。删除 `flattenSizes`。chunk 自此变长，读访问器（已走 `indexToChunk`）自动适配。

**Files:**
- Modify: `packages/core/src/kernel/geometry/ChunkedAxis.ts`

- [ ] **Step 1: 加 rebalance 常量与块操作 helper**

在 `CHUNK_SIZE` 常量后加：

```ts
/** 单 chunk 超过此长度触发分裂，避免块内线性扫退化二分收益。 */
const SPLIT_THRESHOLD = CHUNK_SIZE * 2
/** 相邻两 chunk 长度之和不超过此值时合并，避免删除后碎片化。 */
const MERGE_THRESHOLD = CHUNK_SIZE
```

加私有 helper（放在 `indexToChunk` 之后）：

```ts
  private makeChunk(length: number, size: number): Chunk {
    if (size === this.defaultSize) return { length, totalSize: length * size, sizes: null }
    const sizes = new Float32Array(length)
    sizes.fill(size)
    return { length, totalSize: length * size, sizes }
  }

  /** 在 chunk 的 offset 处插入 count 个 size 项（就地改 chunk）。 */
  private insertIntoChunk(chunk: Chunk, offset: number, count: number, size: number): void {
    if (chunk.sizes === null && size === this.defaultSize) {
      chunk.length += count
      chunk.totalSize += count * size
      return
    }
    const oldLen = chunk.length
    const next = new Float32Array(oldLen + count)
    if (chunk.sizes === null) {
      next.fill(this.defaultSize)
      for (let i = 0; i < count; i++) next[offset + i] = size
    } else {
      for (let i = 0; i < offset; i++) next[i] = chunk.sizes[i]!
      for (let i = 0; i < count; i++) next[offset + i] = size
      for (let i = offset; i < oldLen; i++) next[i + count] = chunk.sizes[i]!
    }
    chunk.sizes = next
    chunk.length = oldLen + count
    chunk.totalSize += count * size
  }

  /** 从 chunk 移除给定块内偏移集合（就地改 chunk）。 */
  private removeFromChunk(chunk: Chunk, offsets: readonly number[]): void {
    const remove = new Set(offsets)
    const keepLen = chunk.length - remove.size
    if (chunk.sizes === null) {
      chunk.length = keepLen
      chunk.totalSize = keepLen * this.defaultSize
      return
    }
    const sizes = new Float32Array(keepLen)
    let w = 0
    let total = 0
    for (let i = 0; i < chunk.length; i++) {
      if (remove.has(i)) continue
      const v = chunk.sizes[i]!
      sizes[w++] = v
      total += v
    }
    chunk.sizes = sizes
    chunk.length = keepLen
    chunk.totalSize = total
  }

  /** 返回 chunk[from, length) 的新 chunk。 */
  private sliceChunk(chunk: Chunk, from: number): Chunk {
    const len = chunk.length - from
    if (chunk.sizes === null) return { length: len, totalSize: len * this.defaultSize, sizes: null }
    const sizes = chunk.sizes.slice(from, chunk.length)
    let total = 0
    for (let i = 0; i < sizes.length; i++) total += sizes[i]!
    return { length: len, totalSize: total, sizes }
  }

  /** 把 chunk 截断到 [0, to)（就地）。 */
  private truncateChunk(chunk: Chunk, to: number): void {
    if (chunk.sizes === null) {
      chunk.length = to
      chunk.totalSize = to * this.defaultSize
      return
    }
    const sizes = chunk.sizes.slice(0, to)
    let total = 0
    for (let i = 0; i < to; i++) total += sizes[i]!
    chunk.sizes = sizes
    chunk.length = to
    chunk.totalSize = total
  }

  private mergeChunks(a: Chunk, b: Chunk): Chunk {
    const length = a.length + b.length
    if (a.sizes === null && b.sizes === null) {
      return { length, totalSize: length * this.defaultSize, sizes: null }
    }
    const sizes = new Float32Array(length)
    for (let i = 0; i < a.length; i++) sizes[i] = a.sizes ? a.sizes[i]! : this.defaultSize
    for (let i = 0; i < b.length; i++) sizes[a.length + i] = b.sizes ? b.sizes[i]! : this.defaultSize
    return { length, totalSize: a.totalSize + b.totalSize, sizes }
  }

  /** 单遍把过大 chunk 切成 ≤ CHUNK_SIZE 的左块 + 余块（余块由后续迭代继续切）。 */
  private splitOversizedChunks(): void {
    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i]!
      if (chunk.length > SPLIT_THRESHOLD) {
        const right = this.sliceChunk(chunk, CHUNK_SIZE)
        this.truncateChunk(chunk, CHUNK_SIZE)
        this.chunks.splice(i + 1, 0, right)
      }
    }
  }

  /** 单遍贪心合并相邻小块。 */
  private mergeSmallChunks(): void {
    let i = 0
    while (i < this.chunks.length - 1) {
      const a = this.chunks[i]!
      const b = this.chunks[i + 1]!
      if (a.length + b.length <= MERGE_THRESHOLD) {
        this.chunks[i] = this.mergeChunks(a, b)
        this.chunks.splice(i + 1, 1)
      } else {
        i++
      }
    }
  }
```

- [ ] **Step 2: 重写 insertRange / deleteRange，删除 flattenSizes**

```ts
  insertRange(beforeIndex: number, count: number, size: number): void {
    if (count <= 0) return
    const oldCount = this.count
    const at = Math.max(0, Math.min(beforeIndex, oldCount))
    this.count = oldCount + count
    if (this.chunks.length === 0) {
      this.chunks = [this.makeChunk(count, size)]
    } else if (at === oldCount) {
      const last = this.chunks[this.chunks.length - 1]!
      this.insertIntoChunk(last, last.length, count, size)
    } else {
      const { chunkIdx, offset } = this.indexToChunk(at)
      this.insertIntoChunk(this.chunks[chunkIdx]!, offset, count, size)
    }
    this.splitOversizedChunks()
    this.recomputePrefixes()
    this._version++
  }

  deleteRange(removedSortedIndices: readonly number[]): void {
    if (removedSortedIndices.length === 0) return
    const byChunk = new Map<number, number[]>()
    for (const idx of removedSortedIndices) {
      if (idx < 0 || idx >= this.count) continue
      const { chunkIdx, offset } = this.indexToChunk(idx)
      const list = byChunk.get(chunkIdx)
      if (list) list.push(offset)
      else byChunk.set(chunkIdx, [offset])
    }
    let removedTotal = 0
    for (const [chunkIdx, offsets] of byChunk) {
      this.removeFromChunk(this.chunks[chunkIdx]!, offsets)
      removedTotal += offsets.length
    }
    this.count -= removedTotal
    this.chunks = this.chunks.filter((chunk) => chunk.length > 0)
    this.mergeSmallChunks()
    this.recomputePrefixes()
    this._version++
  }
```

删除整个 `flattenSizes` 私有方法。

- [ ] **Step 3: 跑 oracle + 现有 ChunkedAxis 测试**

Run: `bun test packages/core/tests/kernel/geometry/`
Expected: PASS（oracle 现在真正考验变长 insert/delete；若红，按 oracle 失败点修内部）

- [ ] **Step 4: 跑全 core 测试（DefaultRowStructure / engine 经 insertRange/deleteRange）**

Run: `bun test packages/core`
Expected: PASS

- [ ] **Step 5: lint + typecheck + 提交**

```bash
bun run lint && bun run --filter '@novasheet/core' typecheck
git add packages/core/src/kernel/geometry/ChunkedAxis.ts
git commit -m "refactor(core): ChunkedAxis 变长 chunk 块内 splice，insert/delete 次线性"
```

### Task 5: 新路径专项测试 + 文档更新

**Files:**
- Create: `packages/core/tests/kernel/geometry/ChunkedAxis.chunklocal.test.ts`
- Modify: `packages/core/src/kernel/geometry/ChunkedAxis.ts`（模块注释）
- Modify: `packages/core/src/kernel/util/ChunkArray.ts`（注释）

- [ ] **Step 1: 写专项测试（分裂 / 合并 / 跨界 / bulk）**

```ts
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
```

- [ ] **Step 2: 跑专项测试**

Run: `bun test packages/core/tests/kernel/geometry/ChunkedAxis.chunklocal.test.ts`
Expected: PASS

- [ ] **Step 3: 更新模块注释**

在 `ChunkedAxis.ts` 顶部模块注释把复杂度承诺改为现状：lookup（getSize/indexToPosition/positionToIndex）为 `O(log n_chunks)`（二分 chunkCountPrefix）；insert/delete 为 `O(n_chunks + CHUNK_SIZE)`（块内 splice + 前缀重算）。删除「固定 `index>>>10` O(1)」与「插入需重建整轴」相关旧表述。同步更新「关键不变量」段补 `chunkCountPrefix` 单调/首尾、每 chunk `0 < length ≤ 2·CHUNK_SIZE`、块内遍历用 `chunk.length`。

`ChunkArray.ts`：更新 `Chunk.sizes` 注释——物化数组容量现为 `chunk.length`（变长），不再恒 `CHUNK_SIZE`；遍历仍用 `length`。

- [ ] **Step 4: 跑全 core + lint + typecheck + 提交**

```bash
bun test packages/core && bun run lint && bun run --filter '@novasheet/core' typecheck
git add packages/core/src/kernel/geometry/ChunkedAxis.ts packages/core/src/kernel/util/ChunkArray.ts packages/core/tests/kernel/geometry/ChunkedAxis.chunklocal.test.ts
git commit -m "test(core): ChunkedAxis 分裂/合并/bulk 专项测试 + 复杂度注释更新"
```

---

## 组件 2 — RangeStyleStore applyBorders 单层化

文件：
- Modify: `packages/core/src/features/format/CellFormat.ts`
- Modify: `packages/core/src/features/format/RangeStyleStore.ts`
- Create: `packages/core/tests/features/format/RangeStyleStore.borders.test.ts`

### Task 6: applyBorders 单层化（TDD 红→绿）

- [ ] **Step 1: 写失败测试**

`packages/core/tests/features/format/RangeStyleStore.borders.test.ts`：

```ts
import { describe, expect, it } from 'bun:test'
import { RangeStyleStore } from '../../../src/features/format/RangeStyleStore'
import type { BorderStyle } from '../../../src/features/format/CellFormat'

const border: BorderStyle = { color: '#000', width: 'thin', lineStyle: 'solid' }

describe('RangeStyleStore — applyBorders 单层化', () => {
  it('多格 applyBorders 只产生一层', () => {
    const store = new RangeStyleStore()
    store.applyBorders({ startRow: 0, endRow: 2, startCol: 0, endCol: 2 }, 'all', border)
    expect(store.getLayerCount()).toBe(1)
  })

  it("'all' preset 每格四边都解析出边框", () => {
    const store = new RangeStyleStore()
    store.applyBorders({ startRow: 0, endRow: 2, startCol: 0, endCol: 2 }, 'all', border)
    const mid = store.resolveCell(1, 1)
    expect(mid?.borders).toEqual({ top: border, right: border, bottom: border, left: border })
  })

  it("'outer' preset 仅边缘格解析出对应边", () => {
    const store = new RangeStyleStore()
    store.applyBorders({ startRow: 0, endRow: 2, startCol: 0, endCol: 2 }, 'outer', border)
    expect(store.resolveCell(0, 0)?.borders).toEqual({ top: border, left: border })
    expect(store.resolveCell(1, 1)).toBeUndefined()
    expect(store.resolveCell(2, 2)?.borders).toEqual({ bottom: border, right: border })
  })

  it('单层 border 与填充叠加共存', () => {
    const store = new RangeStyleStore()
    store.apply({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, { fillColor: '#f00' })
    store.applyBorders({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, 'all', border)
    const cell = store.resolveCell(0, 0)
    expect(cell?.fillColor).toBe('#f00')
    expect(cell?.borders).toEqual({ top: border, right: border, bottom: border, left: border })
  })

  it('snapshot/restore round-trip 后单层 border 仍正确', () => {
    const store = new RangeStyleStore()
    store.applyBorders({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 }, 'all', border)
    const snap = store.snapshot()
    const restored = new RangeStyleStore()
    restored.restore(snap)
    expect(restored.getLayerCount()).toBe(1)
    expect(restored.resolveCell(0, 0)?.borders).toEqual({
      top: border,
      right: border,
      bottom: border,
      left: border,
    })
  })

  it('clearBorders 清除单层 border', () => {
    const store = new RangeStyleStore()
    store.applyBorders({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 }, 'all', border)
    store.clearBorders({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 })
    expect(store.resolveCell(0, 0)).toBeUndefined()
  })
})
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `bun test packages/core/tests/features/format/RangeStyleStore.borders.test.ts`
Expected: FAIL（第一条 `getLayerCount()` 期望 1，现状为 9）

- [ ] **Step 3: 给 FormatLayer 加字段**

`packages/core/src/features/format/CellFormat.ts` 的 `FormatLayer` 接口加两个可选字段：

```ts
export interface FormatLayer {
  readonly range: CellRange
  readonly patch: CellFormat
  readonly clearFill?: boolean
  /** When true, clears `borders` accumulated from prior layers for covered cells. */
  readonly clearBorders?: boolean
  /** 单层边框：覆盖整个 range，边缘归属在 resolveCell 读时按 preset+位置解析。 */
  readonly borderPreset?: Exclude<BorderPreset, 'clear'>
  readonly borderStyle?: BorderStyle
  readonly order: number
}
```

在 `CellFormat.ts` 顶部确保 `BorderPreset` / `BorderStyle` 已在本文件定义（它们就定义在此文件，无需 import）。

- [ ] **Step 4: 改 applyBorders 为单层 + resolveCell 读时解析**

`RangeStyleStore.ts` 的 `applyBorders`（保留重载签名，删除 per-cell 循环）：

```ts
  applyBorders(range: RawRange, preset: 'clear'): void
  applyBorders(range: RawRange, preset: Exclude<BorderPreset, 'clear'>, border: BorderStyle): void
  applyBorders(range: RawRange, preset: BorderPreset, border?: BorderStyle): void {
    if (preset === 'clear') {
      this.clearBorders(range)
      return
    }
    this.layers.push({
      range,
      patch: {},
      borderPreset: preset,
      borderStyle: border!,
      order: this.nextOrder++,
    })
  }
```

`anyLayerContributesBorders` 把带 `borderPreset` 的层算作贡献：

```ts
  private anyLayerContributesBorders(target: CellRange): boolean {
    for (const layer of this.layers) {
      if (!rangesIntersect(layer.range, target)) continue
      if (layer.clearBorders || layer.patch.borders !== undefined || layer.borderPreset !== undefined)
        return true
    }
    return false
  }
```

`resolveCell` 的 `else` 分支补单层 border 读时解析（放在 fillColor 处理之后、textWrap 之前）：

```ts
      } else {
        if (layer.patch.fillColor !== undefined) {
          fillColor = layer.patch.fillColor
          fillActive = true
        }
        if (layer.borderPreset !== undefined && layer.borderStyle !== undefined) {
          const patch = borderPatchForCell(
            layer.range,
            rowIndex,
            colIndex,
            layer.borderPreset,
            layer.borderStyle,
          )
          if (Object.keys(patch).length > 0) {
            borders = { ...borders, ...patch }
            hasBorders = true
          }
        } else if (layer.patch.borders !== undefined) {
          borders = { ...borders, ...layer.patch.borders }
          hasBorders = true
        }
        if (layer.patch.textWrap !== undefined) textWrap = layer.patch.textWrap
      }
```

> `borderPatchForCell` 已在文件顶部 import，无需新增。`else if` 保留旧 `patch.borders` 分支以兼容任何遗留快照。

- [ ] **Step 5: 跑新测试 + 现有 format 测试全绿**

Run: `bun test packages/core/tests/features/format/`
Expected: PASS（含 `RangeStyleStore.test.ts`、`RangeStyleStore.remap.test.ts`、`FormatController.test.ts`、`VisibleFormatResolver.test.ts`、`FormatUndoHandler.test.ts`）

- [ ] **Step 6: lint + typecheck + 提交**

```bash
bun run lint && bun run --filter '@novasheet/core' typecheck
git add packages/core/src/features/format/CellFormat.ts packages/core/src/features/format/RangeStyleStore.ts packages/core/tests/features/format/RangeStyleStore.borders.test.ts
git commit -m "refactor(core): RangeStyleStore applyBorders 单层化，边缘读时解析"
```

---

## 组件 3 — HideRowsLayer getCollapsedGaps view 空间重写

文件：
- Modify: `packages/core/src/features/view/HideRowsLayer.ts`
- Create: `packages/core/tests/features/view/HideRowsLayer.gaps.test.ts`

### Task 7: getCollapsedGaps view 空间重写（TDD 红→绿）

- [ ] **Step 1: 写失败测试（hide+sort 模拟 + hide-only 等价）**

`packages/core/tests/features/view/HideRowsLayer.gaps.test.ts`：

```ts
import { describe, expect, it } from 'bun:test'
import { HideRowsLayer } from '../../../src/features/view/HideRowsLayer'
import type { DataSource, DataSourceListener } from '../../../src/kernel/data/DataSource'
import type { Row, Schema } from '../../../src/kernel/data/Schema'

const schema: Schema = { fields: [{ id: 'a', name: 'A', type: 'text' }] }

/** 行数 + 可选 view→underlying 置换的最小 upstream。 */
function makeUpstream(rowCount: number, perm?: readonly number[]): DataSource {
  return {
    getRowCount: () => rowCount,
    getSchema: () => schema,
    getRows: () => [] as Row[],
    getCell: () => undefined,
    subscribe: (_l: DataSourceListener) => () => {},
    resolveUnderlyingRow: perm ? (viewRow: number) => perm[viewRow] ?? viewRow : undefined,
  }
}

describe('HideRowsLayer.getCollapsedGaps — view 空间', () => {
  it('hide-only：中段单行隐藏，gap 落在前一可见行', () => {
    const layer = new HideRowsLayer()
    layer.wrap(makeUpstream(5))
    layer.setHidden([2])
    const gaps = layer.getCollapsedGaps()
    expect(gaps).toEqual([{ atViewRow: 1, hiddenCount: 1, hiddenIds: [2] }])
  })

  it('hide-only：顶部隐藏段 atViewRow = -1', () => {
    const layer = new HideRowsLayer()
    layer.wrap(makeUpstream(5))
    layer.setHidden([0, 1])
    const gaps = layer.getCollapsedGaps()
    expect(gaps).toEqual([{ atViewRow: -1, hiddenCount: 2, hiddenIds: [0, 1] }])
  })

  it('hide-only：多段不连续', () => {
    const layer = new HideRowsLayer()
    layer.wrap(makeUpstream(8))
    layer.setHidden([2, 5, 6])
    const gaps = layer.getCollapsedGaps()
    expect(gaps).toEqual([
      { atViewRow: 1, hiddenCount: 1, hiddenIds: [2] },
      { atViewRow: 3, hiddenCount: 2, hiddenIds: [5, 6] },
    ])
  })

  it('hide+sort：隐藏 underlying 12（= 排序后 upstream 位置 2），gap 定位正确', () => {
    // 排序置换：view 位置 i → underlying id 10+i
    const layer = new HideRowsLayer()
    layer.wrap(makeUpstream(5, [10, 11, 12, 13, 14]))
    layer.setHidden([12]) // underlying id 12 → upstream 位置 2
    const gaps = layer.getCollapsedGaps()
    // visibleRows = upstream 位置 [0,1,3,4]；gap 在位置 1 与 3 之间 → atViewRow=1，hiddenIds=[12]
    expect(gaps).toEqual([{ atViewRow: 1, hiddenCount: 1, hiddenIds: [12] }])
  })

  it('全隐藏：单 gap atViewRow=-1 覆盖全部', () => {
    const layer = new HideRowsLayer()
    layer.wrap(makeUpstream(3))
    layer.setHidden([0, 1, 2])
    expect(layer.getCollapsedGaps()).toEqual([{ atViewRow: -1, hiddenCount: 3, hiddenIds: [0, 1, 2] }])
  })

  it('无隐藏：空数组', () => {
    const layer = new HideRowsLayer()
    layer.wrap(makeUpstream(3))
    expect(layer.getCollapsedGaps()).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `bun test packages/core/tests/features/view/HideRowsLayer.gaps.test.ts`
Expected: FAIL（hide+sort 用例现状 `atViewRow` 为 -1，应为 1）

- [ ] **Step 3: 重写 getCollapsedGaps，删除 makeGap**

`HideRowsLayer.ts` 把 `getCollapsedGaps` 与私有 `makeGap` 替换为：

```ts
  getCollapsedGaps(): readonly CollapsedGap[] {
    if (this.hiddenUnderlyingRows.size === 0) return []
    const upstream = this.currentUpstream
    if (upstream == null) return []
    const visible = this.visibleRows
    const total = upstream.getRowCount()
    const toUnderlying = (pos: number): number => upstream.resolveUnderlyingRow?.(pos) ?? pos
    const collectHidden = (fromPos: number, toPos: number): number[] => {
      const ids: number[] = []
      for (let pos = fromPos; pos < toPos; pos++) ids.push(toUnderlying(pos))
      return ids
    }
    const gaps: CollapsedGap[] = []

    // 顶部隐藏段：首个可见 upstream 位置之前的位置全被隐藏
    const firstVisible = visible.length > 0 ? visible[0]! : total
    if (firstVisible > 0) {
      const hiddenIds = collectHidden(0, firstVisible)
      gaps.push({ atViewRow: -1, hiddenCount: hiddenIds.length, hiddenIds })
    }

    // 中段：相邻可见位置间的跳变即隐藏段
    for (let k = 0; k < visible.length - 1; k++) {
      const prev = visible[k]!
      const cur = visible[k + 1]!
      if (cur > prev + 1) {
        const hiddenIds = collectHidden(prev + 1, cur)
        gaps.push({ atViewRow: k, hiddenCount: hiddenIds.length, hiddenIds })
      }
    }

    // 末尾隐藏段：末个可见位置之后的位置全被隐藏
    if (visible.length > 0) {
      const lastVisible = visible[visible.length - 1]!
      if (lastVisible < total - 1) {
        const hiddenIds = collectHidden(lastVisible + 1, total)
        gaps.push({ atViewRow: visible.length - 1, hiddenCount: hiddenIds.length, hiddenIds })
      }
    }

    return gaps
  }
```

删除私有 `makeGap` 方法。

- [ ] **Step 4: 跑新测试 + 现有 HideRowsLayer / RenderFrame / FrameAssembler / DefaultRowStructure 测试**

Run: `bun test packages/core/tests/features/view/HideRowsLayer.test.ts packages/core/tests/features/view/HideRowsLayer.gaps.test.ts packages/core/tests/kernel/render/RenderFrame.test.ts packages/core/tests/engine/FrameAssembler.test.ts packages/core/tests/features/row/DefaultRowStructure.test.ts`
Expected: PASS（hide-only 等价性守住既有行为）

- [ ] **Step 5: 跑全 core + lint + typecheck + 提交**

```bash
bun test packages/core && bun run lint && bun run --filter '@novasheet/core' typecheck
git add packages/core/src/features/view/HideRowsLayer.ts packages/core/tests/features/view/HideRowsLayer.gaps.test.ts
git commit -m "fix(core): HideRowsLayer.getCollapsedGaps view 空间重写，修 hide+sort 塌缩定位"
```

---

## 收尾验证

- [ ] **全门禁**

```bash
bun run lint
bun run --filter '*' typecheck
bun test
bun run --filter @novasheet/web build && bun run --filter @novasheet/web-canvas2d build && bun run --filter @novasheet/core build
```

Expected: 全绿。

- [ ] **更新 `packages/core/src/ARCHITECTURE.md` / `CLAUDE.md` 状态行**（可选，若用户要求记录本轮 perf hardening）。

---

## 非目标（本轮不做）

- RangeStyleStore 阈值 compaction 与读时空间索引。
- ChunkedAxis 退回固定寻址的「只去二次因子」方案。
- 任何对外 API / 渲染契约 / undo 命令形状变更。
