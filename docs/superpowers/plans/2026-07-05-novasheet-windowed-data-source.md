# WindowedDataSource Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `WindowedDataSource` — a `DataSource` that loads data through a transport-agnostic `WindowedDataProvider` port (two methods: `loadRange` + `subscribe`) using a sliding 2D window with overscan prefetch, LRU block caching, subscription-window push updates, and SWR/epoch cache freshness — per `docs/superpowers/specs/2026-07-05-novasheet-windowed-data-source-design.md`.

**Architecture:** New files under `packages/core/src/kernel/data/windowed/` (pure layer, no DOM). `DataSource` gets one new optional method (`hintWindow`) as the only change to the existing contract. `DefaultGridEngine.getFrame()` calls `hintWindow` every frame with the visible window; the four existing view decorators (Sort/Filter/HideRows/VisibleColumns) forward it downstream with view→raw envelope translation. All prefetch/cache/epoch/dispose logic lives inside `WindowedDataSource`; decorators and engine only plumb a window through.

**Tech Stack:** TypeScript (strict, `verbatimModuleSyntax`, `noUncheckedIndexedAccess`), `bun:test` (no vitest, no fake-timer library — tests use real `setTimeout` with small millisecond values, matching `ValidationScheduler.test.ts` convention), bun workspaces.

## Global Constraints

- Toolchain: **bun (≥1.2) only** — never npm/yarn/pnpm.
- Test: `bun test`. Typecheck: `bun run --filter '*' typecheck`. Lint: `bun run lint` (0 error/warning, includes `lint:architecture`). Build: `bun run --filter @novasheet/core build && bun run --filter @novasheet/canvas2d build` (core first). All four must pass before `main`.
- Tests use `bun:test` (`mock`/`spyOn`) — **not vitest**.
- `type-only` imports use `import type` (verbatimModuleSyntax). Immutable surfaces get `readonly`/`Readonly<>`. `noUncheckedIndexedAccess` requires `!`/guards on indexed access.
- Comments: sparse, only for non-obvious why (invariant, coordinate system, scheduling order, tradeoff). No decorative or "what it does" comments.
- Commits: Conventional Commits, **Chinese subject/body**, English `type(scope)` prefix and identifiers/paths/commands in code. **One task = one commit.** Never `--no-verify`, never amend pushed commits.
- `core/src/` kernel/features/engine layers never import `dom/**`, never touch DOM globals; this feature adds no DOM dependency at all (pure layer).
- `getRows` endIndex is **INCLUSIVE**; `DataWindow` follows the same convention (all four bounds inclusive) — this is load-bearing throughout every task.
- Do not implement write paths, sort/filter × remote composition beyond envelope forwarding, fine-grained structural push events, or shimmer skeleton visuals — all explicitly out of scope per spec §1.3.

---

### Task 1: Port types + `DataSource.hintWindow` seam

**Files:**
- Modify: `packages/core/src/kernel/data/DataSource.ts`
- Create: `packages/core/src/kernel/data/windowed/WindowedDataProvider.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/kernel/data/DataSource.hintWindow.test.ts`

**Interfaces:**
- Produces: `DataWindow` (in `DataSource.ts`, re-exported from `windowed/WindowedDataProvider.ts`), `DataSource.hintWindow?(window: DataWindow): void`, `CellUpdate`, `RangeSlice`, `WindowedDataEvent`, `WindowSubscription`, `WindowedDataProvider` (all in `windowed/WindowedDataProvider.ts`).

Note on file organization: the spec's code sample defines `DataWindow` inside `windowed/WindowedDataProvider.ts`. This plan instead defines it in `DataSource.ts` next to `DataSourceEvent` (re-exported from the windowed module), because `DataSource.ts` is the base interface and must not import from a feature subfolder beneath it — pure dependency-direction cleanup, the type shape and all behavior are unchanged from the spec.

- [ ] **Step 1: Write the failing test**

```ts
// packages/core/tests/kernel/data/DataSource.hintWindow.test.ts
import { describe, expect, it } from 'bun:test'
import type { DataSource, DataWindow } from '../../../src/kernel/data/DataSource'
import type { WindowedDataProvider } from '../../../src/kernel/data/windowed/WindowedDataProvider'

describe('DataSource.hintWindow seam', () => {
  it('DataSource remains satisfied by implementations without hintWindow', () => {
    const source: DataSource = {
      getRowCount: () => 0,
      getSchema: () => ({ fields: [] }),
      getRows: () => [],
      getCell: () => undefined,
      subscribe: () => () => {},
    }
    expect(source.hintWindow).toBeUndefined()
  })

  it('hintWindow is callable with an inclusive DataWindow when implemented', () => {
    const calls: DataWindow[] = []
    const source: DataSource = {
      getRowCount: () => 0,
      getSchema: () => ({ fields: [] }),
      getRows: () => [],
      getCell: () => undefined,
      subscribe: () => () => {},
      hintWindow: (window) => calls.push(window),
    }
    const window: DataWindow = { startRow: 0, endRow: 39, startCol: 0, endCol: 1 }
    source.hintWindow?.(window)
    expect(calls).toEqual([window])
  })

  it('WindowedDataProvider shape is importable and constructible', () => {
    const provider: WindowedDataProvider = {
      loadRange: async (window) => ({ rows: [] }),
      subscribe: (onEvent) => {
        onEvent({ type: 'resync' })
        return { setWindow: () => {}, close: () => {} }
      },
    }
    expect(typeof provider.loadRange).toBe('function')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test packages/core/tests/kernel/data/DataSource.hintWindow.test.ts`
Expected: FAIL — `DataWindow` and `windowed/WindowedDataProvider` do not exist yet (module resolution / type error).

- [ ] **Step 3: Implement — add `DataWindow` and `hintWindow` to `DataSource.ts`**

Insert after the `DataSourceListener` type (after line 27, before the `DataSource` interface doc comment) in `packages/core/src/kernel/data/DataSource.ts`:

```ts
/**
 * 矩形数据窗口，四端 INCLUSIVE——与 CellRange / DataSource.getRows 语义一致。
 * 独立于 kernel/coords 的 CellRange 命名：selection 与 data 是不同域。
 */
export interface DataWindow {
  readonly startRow: number
  readonly endRow: number
  readonly startCol: number
  readonly endCol: number
}
```

Add to the `DataSource` interface, immediately after `subscribe(listener: DataSourceListener): () => void`:

```ts
  /**
   * 可视窗口提示。engine 每帧调用；窗口未变时实现须 O(1) 短路。
   * 同步数据源无需实现——异步/窗口化数据源（如 WindowedDataSource）据此驱动预取。
   */
  hintWindow?(window: DataWindow): void
```

- [ ] **Step 4: Create `windowed/WindowedDataProvider.ts`**

```ts
// packages/core/src/kernel/data/windowed/WindowedDataProvider.ts
import type { CellValue, Row } from '../Schema'
import type { DataWindow } from '../DataSource'

export type { DataWindow } from '../DataSource'

/** 单元格推送更新。行按 raw 行号，列按 fieldId 锚定（与全仓 cell 值锚定惯例一致）。 */
export interface CellUpdate {
  readonly row: number
  readonly fieldId: string
  readonly value: CellValue
}

/** loadRange 响应切片。 */
export interface RangeSlice {
  /** 与 [startRow..endRow] 位置对齐（rows[i] = 第 startRow+i 行），行内至少含窗口列区间覆盖的字段。 */
  readonly rows: readonly Row[]
  /** 响应时刻的总行数——结构漂移（删/增行）检测通道，强烈建议每次都带。 */
  readonly rowCount?: number
  /** 可选单调数据版本；提供则 epoch 判定精确（乱序/陈旧响应可甄别丢弃）。 */
  readonly version?: number
}

export type WindowedDataEvent =
  | { type: 'cells'; updates: readonly CellUpdate[] }
  | { type: 'rowCount'; rowCount: number; version?: number }
  | { type: 'resync'; rowCount?: number }

export interface WindowSubscription {
  /** WindowedDataSource 滚动防抖后调用，告知服务端新的订阅窗口。 */
  setWindow(window: DataWindow): void
  close(): void
}

export interface WindowedDataProvider {
  /** 拉取矩形区间。 */
  loadRange(window: DataWindow, signal: AbortSignal): Promise<RangeSlice>
  /** 建立推送通道（典型 WebSocket），返回可变窗口的订阅句柄；构造 WindowedDataSource 时调用一次。 */
  subscribe(onEvent: (event: WindowedDataEvent) => void): WindowSubscription
}
```

- [ ] **Step 5: Export from package index**

Add to `packages/core/src/index.ts`, changing line 13 and adding a new block after it:

```ts
export type { DataSource, DataSourceEvent, DataSourceListener, DataWindow } from './kernel/data/DataSource'
export type {
  CellUpdate,
  RangeSlice,
  WindowedDataEvent,
  WindowedDataProvider,
  WindowSubscription,
} from './kernel/data/windowed/WindowedDataProvider'
```

- [ ] **Step 6: Run test to verify it passes**

Run: `bun test packages/core/tests/kernel/data/DataSource.hintWindow.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 7: Typecheck**

Run: `bun run --filter @novasheet/core typecheck`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/kernel/data/DataSource.ts packages/core/src/kernel/data/windowed/WindowedDataProvider.ts packages/core/src/index.ts packages/core/tests/kernel/data/DataSource.hintWindow.test.ts
git commit -m "$(cat <<'EOF'
feat(core): 新增 DataSource.hintWindow 缝与 WindowedDataProvider port 类型

DataSource 增加可选 hintWindow 方法（唯一的既有契约改动，向后兼容），
新建传输无关的 WindowedDataProvider port 类型（loadRange + subscribe），
为后续 WindowedDataSource 打基础。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: `blockGeometry` pure functions

**Files:**
- Create: `packages/core/src/kernel/data/windowed/blockGeometry.ts`
- Test: `packages/core/tests/kernel/data/windowed/blockGeometry.test.ts`

**Interfaces:**
- Consumes: `DataWindow` from `../DataSource` (Task 1).
- Produces: `BlockCoord`, `windowsEqual`, `expandWindow`, `clampWindow`, `blockKey`, `windowToBlocks`, `blockToWindow`, `mergeBlocksIntoRects` — all consumed by `WindowedDataSource` in Task 4.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/tests/kernel/data/windowed/blockGeometry.test.ts
import { describe, expect, it } from 'bun:test'
import {
  blockKey,
  blockToWindow,
  clampWindow,
  expandWindow,
  mergeBlocksIntoRects,
  windowsEqual,
  windowToBlocks,
} from '../../../../src/kernel/data/windowed/blockGeometry'

describe('blockGeometry', () => {
  it('windowsEqual compares by value, treats null correctly', () => {
    const a = { startRow: 0, endRow: 9, startCol: 0, endCol: 1 }
    const b = { startRow: 0, endRow: 9, startCol: 0, endCol: 1 }
    const c = { startRow: 0, endRow: 8, startCol: 0, endCol: 1 }
    expect(windowsEqual(a, b)).toBe(true)
    expect(windowsEqual(a, c)).toBe(false)
    expect(windowsEqual(null, null)).toBe(true)
    expect(windowsEqual(a, null)).toBe(false)
  })

  it('clampWindow clamps to [0, count-1] on both axes', () => {
    expect(clampWindow({ startRow: -5, endRow: 200, startCol: -1, endCol: 50 }, 100, 10)).toEqual({
      startRow: 0,
      endRow: 99,
      startCol: 0,
      endCol: 9,
    })
  })

  it('expandWindow doubles span symmetrically for preloadScreens=2 and clamps at data edges', () => {
    // rowSpan = 10 (0..9), preloadScreens=2 → margin = floor(10*(2-1)/2) = 5
    const expanded = expandWindow({ startRow: 20, endRow: 29, startCol: 0, endCol: 1 }, 2, 1000, 2)
    expect(expanded).toEqual({ startRow: 15, endRow: 34, startCol: 0, endCol: 1 })

    // near top edge: margin pushes startRow negative, must clamp to 0
    const nearEdge = expandWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 }, 2, 1000, 2)
    expect(nearEdge).toEqual({ startRow: 0, endRow: 14, startCol: 0, endCol: 1 })
  })

  it('windowToBlocks enumerates all intersecting block coordinates, row-major, dedup by construction', () => {
    // blockRows=10, blockCols=10; window spans blockRow 0-1, blockCol 0-1
    const blocks = windowToBlocks({ startRow: 5, endRow: 15, startCol: 5, endCol: 15 }, 10, 10)
    expect(blocks).toEqual([
      { blockRow: 0, blockCol: 0 },
      { blockRow: 0, blockCol: 1 },
      { blockRow: 1, blockCol: 0 },
      { blockRow: 1, blockCol: 1 },
    ])
  })

  it('windowToBlocks returns empty for an inverted (empty) window', () => {
    expect(windowToBlocks({ startRow: 5, endRow: 2, startCol: 0, endCol: 1 }, 10, 10)).toEqual([])
  })

  it('blockToWindow returns the block rectangle clamped to data bounds', () => {
    expect(blockToWindow({ blockRow: 0, blockCol: 0 }, 10, 10, 1000, 25)).toEqual({
      startRow: 0,
      endRow: 9,
      startCol: 0,
      endCol: 9,
    })
    // last column block: blockCol=2 covers cols 20..29, colCount=25 → clamp endCol to 24
    expect(blockToWindow({ blockRow: 0, blockCol: 2 }, 10, 10, 1000, 25)).toEqual({
      startRow: 0,
      endRow: 9,
      startCol: 20,
      endCol: 24,
    })
  })

  it('blockKey is stable and distinct per coordinate pair', () => {
    expect(blockKey(1, 2)).toBe('1:2')
    expect(blockKey(1, 2)).not.toBe(blockKey(2, 1))
  })

  it('mergeBlocksIntoRects merges horizontally-adjacent blocks within a blockRow only', () => {
    const groups = mergeBlocksIntoRects(
      [
        { blockRow: 0, blockCol: 0 },
        { blockRow: 0, blockCol: 1 },
        { blockRow: 0, blockCol: 3 }, // gap at blockCol 2 — separate group
        { blockRow: 1, blockCol: 0 }, // different blockRow — never merges with blockRow 0
      ],
      10,
      10,
      1000,
      100,
    )
    expect(groups).toHaveLength(3)
    const byFirstBlock = new Map(groups.map((g) => [blockKey(g.blocks[0]!.blockRow, g.blocks[0]!.blockCol), g]))

    const merged01 = byFirstBlock.get('0:0')!
    expect(merged01.blocks).toEqual([
      { blockRow: 0, blockCol: 0 },
      { blockRow: 0, blockCol: 1 },
    ])
    expect(merged01.window).toEqual({ startRow: 0, endRow: 9, startCol: 0, endCol: 19 })

    const solo3 = byFirstBlock.get('0:3')!
    expect(solo3.blocks).toEqual([{ blockRow: 0, blockCol: 3 }])
    expect(solo3.window).toEqual({ startRow: 0, endRow: 9, startCol: 30, endCol: 39 })

    const row1 = byFirstBlock.get('1:0')!
    expect(row1.window).toEqual({ startRow: 10, endRow: 19, startCol: 0, endCol: 9 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/core/tests/kernel/data/windowed/blockGeometry.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
// packages/core/src/kernel/data/windowed/blockGeometry.ts
import type { DataWindow } from '../DataSource'

export interface BlockCoord {
  readonly blockRow: number
  readonly blockCol: number
}

export function windowsEqual(a: DataWindow | null, b: DataWindow | null): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  return (
    a.startRow === b.startRow &&
    a.endRow === b.endRow &&
    a.startCol === b.startCol &&
    a.endCol === b.endCol
  )
}

export function clampWindow(window: DataWindow, rowCount: number, colCount: number): DataWindow {
  const maxRow = Math.max(rowCount - 1, 0)
  const maxCol = Math.max(colCount - 1, 0)
  return {
    startRow: Math.max(0, Math.min(window.startRow, maxRow)),
    endRow: Math.max(0, Math.min(window.endRow, maxRow)),
    startCol: Math.max(0, Math.min(window.startCol, maxCol)),
    endCol: Math.max(0, Math.min(window.endCol, maxCol)),
  }
}

/** 可视窗口按 preloadScreens 对称外扩（总面积 ≈ 可视区 × preloadScreens）并 clamp 到数据边界。 */
export function expandWindow(
  window: DataWindow,
  preloadScreens: number,
  rowCount: number,
  colCount: number,
): DataWindow {
  const rowSpan = window.endRow - window.startRow + 1
  const colSpan = window.endCol - window.startCol + 1
  const factor = Math.max(preloadScreens - 1, 0)
  const rowMargin = Math.floor((rowSpan * factor) / 2)
  const colMargin = Math.floor((colSpan * factor) / 2)
  return clampWindow(
    {
      startRow: window.startRow - rowMargin,
      endRow: window.endRow + rowMargin,
      startCol: window.startCol - colMargin,
      endCol: window.endCol + colMargin,
    },
    rowCount,
    colCount,
  )
}

export function blockKey(blockRow: number, blockCol: number): string {
  return `${blockRow}:${blockCol}`
}

/** 窗口相交的所有块坐标，行优先顺序。空窗口返回空数组。 */
export function windowToBlocks(window: DataWindow, blockRows: number, blockCols: number): BlockCoord[] {
  if (window.endRow < window.startRow || window.endCol < window.startCol) return []
  const startBlockRow = Math.floor(window.startRow / blockRows)
  const endBlockRow = Math.floor(window.endRow / blockRows)
  const startBlockCol = Math.floor(window.startCol / blockCols)
  const endBlockCol = Math.floor(window.endCol / blockCols)
  const blocks: BlockCoord[] = []
  for (let blockRow = startBlockRow; blockRow <= endBlockRow; blockRow += 1) {
    for (let blockCol = startBlockCol; blockCol <= endBlockCol; blockCol += 1) {
      blocks.push({ blockRow, blockCol })
    }
  }
  return blocks
}

/** 单个块在数据坐标系中的矩形范围，clamp 到数据边界（末块可能比 blockRows/blockCols 小）。 */
export function blockToWindow(
  block: BlockCoord,
  blockRows: number,
  blockCols: number,
  rowCount: number,
  colCount: number,
): DataWindow {
  return clampWindow(
    {
      startRow: block.blockRow * blockRows,
      endRow: block.blockRow * blockRows + blockRows - 1,
      startCol: block.blockCol * blockCols,
      endCol: block.blockCol * blockCols + blockCols - 1,
    },
    rowCount,
    colCount,
  )
}

/**
 * 同一 blockRow 内水平相邻（blockCol 连续）的块合并为一个矩形请求；
 * 不同 blockRow 从不合并（§6.1 步骤 4：仅同块行内水平合并）。
 */
export function mergeBlocksIntoRects(
  blocks: readonly BlockCoord[],
  blockRows: number,
  blockCols: number,
  rowCount: number,
  colCount: number,
): { window: DataWindow; blocks: BlockCoord[] }[] {
  const byBlockRow = new Map<number, number[]>()
  for (const b of blocks) {
    const cols = byBlockRow.get(b.blockRow) ?? []
    cols.push(b.blockCol)
    byBlockRow.set(b.blockRow, cols)
  }

  const groups: { window: DataWindow; blocks: BlockCoord[] }[] = []
  for (const [blockRow, cols] of byBlockRow) {
    const sorted = [...cols].sort((a, b) => a - b)
    let runStart = sorted[0]!
    let prev = sorted[0]!
    let runBlocks: BlockCoord[] = [{ blockRow, blockCol: prev }]

    const flush = (): void => {
      const startWindow = blockToWindow({ blockRow, blockCol: runStart }, blockRows, blockCols, rowCount, colCount)
      const endWindow = blockToWindow({ blockRow, blockCol: prev }, blockRows, blockCols, rowCount, colCount)
      groups.push({
        window: {
          startRow: startWindow.startRow,
          endRow: startWindow.endRow,
          startCol: startWindow.startCol,
          endCol: endWindow.endCol,
        },
        blocks: runBlocks,
      })
    }

    for (let i = 1; i < sorted.length; i += 1) {
      const col = sorted[i]!
      if (col === prev + 1) {
        runBlocks.push({ blockRow, blockCol: col })
        prev = col
        continue
      }
      flush()
      runStart = col
      prev = col
      runBlocks = [{ blockRow, blockCol: col }]
    }
    flush()
  }
  return groups
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/core/tests/kernel/data/windowed/blockGeometry.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/kernel/data/windowed/blockGeometry.ts packages/core/tests/kernel/data/windowed/blockGeometry.test.ts
git commit -m "$(cat <<'EOF'
feat(core): 新增 windowed 块几何纯函数（外扩/clamp/块规划/水平合并）

expandWindow/clampWindow/windowToBlocks/blockToWindow/mergeBlocksIntoRects
覆盖 WindowedDataSource 预取规划所需的全部坐标数学，纯函数、无状态。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: `BlockCache` — LRU block store with freshness tracking

**Files:**
- Create: `packages/core/src/kernel/data/windowed/BlockCache.ts`
- Test: `packages/core/tests/kernel/data/windowed/BlockCache.test.ts`

**Interfaces:**
- Consumes: `CellValue` from `../Schema`.
- Produces: `BlockCache` class with `has`, `isStale`, `getFreshAt`, `get`, `set`, `setCell`, `touch`, `refreshFreshness`, `markAllStale`, `delete`, `clear`, `evictExcess` — all consumed by `WindowedDataSource` in Task 4.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/tests/kernel/data/windowed/BlockCache.test.ts
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

    cache.set('0:0', { ...block(2, 2, (r, c) => `${r},${c}`), nowMs: 100 })
    expect(cache.get('0:0', 0, 0)).toBe('0,0')
    expect(cache.get('0:0', 1, 1)).toBe('1,1')
    expect(cache.has('0:0')).toBe(true)
  })

  it('setCell mutates a single cell in an already-resident block, no-op if block missing', () => {
    const cache = new BlockCache({ maxCachedBlocks: 10 })
    cache.set('0:0', { ...block(2, 2, () => 'orig'), nowMs: 100 })
    cache.setCell('0:0', 1, 0, 'patched')
    expect(cache.get('0:0', 1, 0)).toBe('patched')
    expect(cache.get('0:0', 0, 0)).toBe('orig')

    cache.setCell('9:9', 0, 0, 'ignored') // no such block
    expect(cache.has('9:9')).toBe(false)
  })

  it('markAllStale flags every resident block; new sets start fresh', () => {
    const cache = new BlockCache({ maxCachedBlocks: 10 })
    cache.set('0:0', { ...block(1, 1, () => 1), nowMs: 100 })
    expect(cache.isStale('0:0')).toBe(false)
    cache.markAllStale()
    expect(cache.isStale('0:0')).toBe(true)
    cache.set('0:0', { ...block(1, 1, () => 2), nowMs: 200 })
    expect(cache.isStale('0:0')).toBe(false)
  })

  it('refreshFreshness updates freshAt without touching values', () => {
    const cache = new BlockCache({ maxCachedBlocks: 10 })
    cache.set('0:0', { ...block(1, 1, () => 1), nowMs: 100 })
    cache.refreshFreshness('0:0', 500)
    expect(cache.getFreshAt('0:0')).toBe(500)
    expect(cache.get('0:0', 0, 0)).toBe(1)
  })

  it('evictExcess drops least-recently-used blocks beyond maxCachedBlocks, skipping protected keys', () => {
    const cache = new BlockCache({ maxCachedBlocks: 2 })
    cache.set('0:0', { ...block(1, 1, () => 'a'), nowMs: 1 })
    cache.set('0:1', { ...block(1, 1, () => 'b'), nowMs: 2 })
    cache.set('0:2', { ...block(1, 1, () => 'c'), nowMs: 3 }) // now 3 resident, over limit of 2

    cache.evictExcess(new Set(['0:0'])) // protect the oldest — force eviction of next-oldest instead
    expect(cache.has('0:0')).toBe(true) // protected, survives
    expect(cache.has('0:1')).toBe(false) // oldest unprotected, evicted
    expect(cache.has('0:2')).toBe(true)
  })

  it('touch moves a block to most-recently-used position for eviction purposes', () => {
    const cache = new BlockCache({ maxCachedBlocks: 2 })
    cache.set('0:0', { ...block(1, 1, () => 'a'), nowMs: 1 })
    cache.set('0:1', { ...block(1, 1, () => 'b'), nowMs: 2 })
    cache.touch('0:0') // 0:0 is now most-recently-used; 0:1 becomes least-recently-used
    cache.set('0:2', { ...block(1, 1, () => 'c'), nowMs: 3 })

    cache.evictExcess(new Set())
    expect(cache.has('0:1')).toBe(false) // evicted (least recently used)
    expect(cache.has('0:0')).toBe(true)
    expect(cache.has('0:2')).toBe(true)
  })

  it('get() touches the block (counts as recent access)', () => {
    const cache = new BlockCache({ maxCachedBlocks: 2 })
    cache.set('0:0', { ...block(1, 1, () => 'a'), nowMs: 1 })
    cache.set('0:1', { ...block(1, 1, () => 'b'), nowMs: 2 })
    cache.get('0:0', 0, 0) // touch 0:0
    cache.set('0:2', { ...block(1, 1, () => 'c'), nowMs: 3 })

    cache.evictExcess(new Set())
    expect(cache.has('0:1')).toBe(false)
    expect(cache.has('0:0')).toBe(true)
  })

  it('clear removes all blocks; delete removes one', () => {
    const cache = new BlockCache({ maxCachedBlocks: 10 })
    cache.set('0:0', { ...block(1, 1, () => 'a'), nowMs: 1 })
    cache.set('0:1', { ...block(1, 1, () => 'b'), nowMs: 1 })
    cache.delete('0:0')
    expect(cache.has('0:0')).toBe(false)
    expect(cache.has('0:1')).toBe(true)
    cache.clear()
    expect(cache.has('0:1')).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/core/tests/kernel/data/windowed/BlockCache.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
// packages/core/src/kernel/data/windowed/BlockCache.ts
import type { CellValue } from '../Schema'

interface CachedBlock {
  rowSpan: number
  colSpan: number
  values: (CellValue | undefined)[]
  freshAtMs: number
  stale: boolean
}

export interface BlockCacheOptions {
  readonly maxCachedBlocks: number
}

export interface SetBlockParams {
  readonly rowSpan: number
  readonly colSpan: number
  readonly values: (CellValue | undefined)[]
  readonly nowMs: number
}

/** 二维缓存块存储；Map 迭代顺序 = 插入顺序，充当 LRU 队列（触达即重插到末尾）。 */
export class BlockCache {
  private readonly blocks = new Map<string, CachedBlock>()

  constructor(private readonly options: BlockCacheOptions) {}

  has(key: string): boolean {
    return this.blocks.has(key)
  }

  isStale(key: string): boolean {
    return this.blocks.get(key)?.stale ?? false
  }

  getFreshAt(key: string): number | undefined {
    return this.blocks.get(key)?.freshAtMs
  }

  get(key: string, localRow: number, localCol: number): CellValue | undefined {
    const block = this.blocks.get(key)
    if (!block) return undefined
    this.touch(key)
    return block.values[localRow * block.colSpan + localCol]
  }

  set(key: string, params: SetBlockParams): void {
    this.blocks.delete(key)
    this.blocks.set(key, {
      rowSpan: params.rowSpan,
      colSpan: params.colSpan,
      values: params.values,
      freshAtMs: params.nowMs,
      stale: false,
    })
  }

  setCell(key: string, localRow: number, localCol: number, value: CellValue): void {
    const block = this.blocks.get(key)
    if (!block) return
    block.values[localRow * block.colSpan + localCol] = value
    this.touch(key)
  }

  touch(key: string): void {
    const block = this.blocks.get(key)
    if (!block) return
    this.blocks.delete(key)
    this.blocks.set(key, block)
  }

  refreshFreshness(key: string, nowMs: number): void {
    const block = this.blocks.get(key)
    if (block) block.freshAtMs = nowMs
  }

  markAllStale(): void {
    for (const block of this.blocks.values()) block.stale = true
  }

  delete(key: string): void {
    this.blocks.delete(key)
  }

  clear(): void {
    this.blocks.clear()
  }

  /** 超上限时淘汰最久未访问块（Map 前部），跳过 protectedKeys。 */
  evictExcess(protectedKeys: ReadonlySet<string>): void {
    if (this.blocks.size <= this.options.maxCachedBlocks) return
    for (const key of this.blocks.keys()) {
      if (this.blocks.size <= this.options.maxCachedBlocks) break
      if (protectedKeys.has(key)) continue
      this.blocks.delete(key)
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/core/tests/kernel/data/windowed/BlockCache.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/kernel/data/windowed/BlockCache.ts packages/core/tests/kernel/data/windowed/BlockCache.test.ts
git commit -m "$(cat <<'EOF'
feat(core): 新增 BlockCache——windowed 数据源的 LRU 块缓存与新鲜度追踪

按 blockKey 存储二维块，touch 语义驱动 LRU 淘汰（预取窗口内的块可保护），
markAllStale 支撑 epoch 软失效；WindowedDataSource 消费。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: `WindowedDataSource` — construction, sync reads, prefetch orchestration

**Files:**
- Create: `packages/core/src/kernel/data/windowed/sliceToBlocks.ts`
- Create: `packages/core/src/kernel/data/windowed/WindowedDataSource.ts`
- Create: `packages/core/src/kernel/data/windowed/index.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/tests/kernel/data/windowed/fakeProvider.ts`
- Test: `packages/core/tests/kernel/data/windowed/WindowedDataSource.test.ts`

**Interfaces:**
- Consumes: `blockKey`, `windowToBlocks`, `blockToWindow`, `mergeBlocksIntoRects`, `expandWindow`, `windowsEqual`, `BlockCoord` (Task 2); `BlockCache` (Task 3); `DataWindow`, `DataSource`, `DataSourceEvent`, `DataSourceListener` (Task 1 / existing); `CellUpdate`, `RangeSlice`, `WindowedDataEvent`, `WindowedDataProvider`, `WindowSubscription` (Task 1).
- Produces: `applySliceToBlocks(cache, rect, blocks, slice, schema, blockRowsSize, blockColsSize, rowCount, colCount, nowMs): void` (in `sliceToBlocks.ts`); `WindowedDataSource` class + `WindowedDataSourceOptions` (consumed by Task 5, 6, 7); `createFakeWindowedProvider()` test helper (consumed by Task 5, 6, 7 tests).

- [ ] **Step 1: Implement `sliceToBlocks.ts` (pure, testable in isolation first)**

```ts
// packages/core/src/kernel/data/windowed/sliceToBlocks.ts
import type { RangeSlice } from './WindowedDataProvider'
import type { BlockCache } from './BlockCache'
import type { BlockCoord } from './blockGeometry'
import { blockKey, blockToWindow } from './blockGeometry'
import type { CellValue, Schema } from '../Schema'
import type { DataWindow } from '../DataSource'

/**
 * 把一个合并矩形请求的响应切片拆回各构成块并写入缓存。
 * rect 的行范围恒等于单个 blockRow 的行范围（mergeBlocksIntoRects 只做水平合并），
 * 因此只需要按列切分；长度不符时按 §7 容错：多余截断、缺失位置保持 miss（undefined）。
 */
export function applySliceToBlocks(
  cache: BlockCache,
  rect: DataWindow,
  blocks: readonly BlockCoord[],
  slice: RangeSlice,
  schema: Schema,
  blockRowsSize: number,
  blockColsSize: number,
  rowCount: number,
  colCount: number,
  nowMs: number,
): void {
  const expectedRowSpan = rect.endRow - rect.startRow + 1
  if (slice.rows.length !== expectedRowSpan) {
    console.warn(
      `[WindowedDataSource] loadRange returned ${slice.rows.length} rows, expected ${expectedRowSpan} for window`,
      rect,
    )
  }

  for (const coord of blocks) {
    const blockWindow = blockToWindow(coord, blockRowsSize, blockColsSize, rowCount, colCount)
    const rowSpan = blockWindow.endRow - blockWindow.startRow + 1
    const colSpan = blockWindow.endCol - blockWindow.startCol + 1
    const values: (CellValue | undefined)[] = new Array(rowSpan * colSpan)

    for (let r = 0; r < rowSpan; r += 1) {
      const sliceIndex = blockWindow.startRow - rect.startRow + r
      const row = slice.rows[sliceIndex]
      for (let c = 0; c < colSpan; c += 1) {
        const field = schema.fields[blockWindow.startCol + c]
        values[r * colSpan + c] = field && row ? row[field.id] : undefined
      }
    }

    cache.set(blockKey(coord.blockRow, coord.blockCol), { rowSpan, colSpan, values, nowMs })
  }
}
```

- [ ] **Step 2: Write the failing tests for `sliceToBlocks`**

```ts
// packages/core/tests/kernel/data/windowed/sliceToBlocks.test.ts
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
    )
    expect(cache.get('0:0', 0, 0)).toBe('r0a')
    expect(cache.get('0:0', 1, 0)).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail, then pass**

Run: `bun test packages/core/tests/kernel/data/windowed/sliceToBlocks.test.ts`
Expected: FAIL first (module missing), then PASS (2 tests) once Step 1's file is saved with the simplified `values` line applied.

- [ ] **Step 4: Create the FakeProvider test helper (used by this task and Tasks 5–7)**

```ts
// packages/core/tests/kernel/data/windowed/fakeProvider.ts
import type {
  RangeSlice,
  WindowedDataEvent,
  WindowedDataProvider,
  WindowSubscription,
} from '../../../../src/kernel/data/windowed/WindowedDataProvider'
import type { DataWindow } from '../../../../src/kernel/data/DataSource'

export interface PendingLoad {
  readonly window: DataWindow
  readonly signal: AbortSignal
  resolve(slice: RangeSlice): void
  reject(error: unknown): void
}

export interface FakeWindowedProvider {
  readonly provider: WindowedDataProvider
  /** 尚未 resolve/reject 的请求，按发起顺序排列。 */
  pendingLoads(): PendingLoad[]
  /** 便捷方法：resolve 第一个匹配给定窗口的 pending 请求。 */
  resolveFirstMatching(window: DataWindow, slice: RangeSlice): void
  /** 模拟 subscribe 通道推送一个事件。 */
  emit(event: WindowedDataEvent): void
  /** setWindow 调用记录。 */
  readonly setWindowCalls: DataWindow[]
  /** subscription.close() 调用次数。 */
  readonly closeCalls: number
  /** 若非 null，构造期 subscribe() 直接抛出这个错误（测试降级路径）。 */
  subscribeThrows: unknown
}

export function createFakeWindowedProvider(): FakeWindowedProvider {
  const pending: PendingLoad[] = []
  const setWindowCalls: DataWindow[] = []
  let closeCalls = 0
  let onEvent: ((event: WindowedDataEvent) => void) | null = null

  const state: FakeWindowedProvider = {
    provider: {
      loadRange(window, signal) {
        return new Promise<RangeSlice>((resolve, reject) => {
          const entry: PendingLoad = {
            window,
            signal,
            resolve: (slice) => {
              const i = pending.indexOf(entry)
              if (i >= 0) pending.splice(i, 1)
              resolve(slice)
            },
            reject: (error) => {
              const i = pending.indexOf(entry)
              if (i >= 0) pending.splice(i, 1)
              reject(error)
            },
          }
          pending.push(entry)
        })
      },
      subscribe(handler) {
        if (state.subscribeThrows) throw state.subscribeThrows
        onEvent = handler
        const subscription: WindowSubscription = {
          setWindow: (window) => setWindowCalls.push(window),
          close: () => {
            closeCalls += 1
          },
        }
        return subscription
      },
    },
    pendingLoads: () => [...pending],
    resolveFirstMatching: (window, slice) => {
      const match = pending.find(
        (p) =>
          p.window.startRow === window.startRow &&
          p.window.endRow === window.endRow &&
          p.window.startCol === window.startCol &&
          p.window.endCol === window.endCol,
      )
      if (!match) throw new Error(`no pending load matches window ${JSON.stringify(window)}`)
      match.resolve(slice)
    },
    emit: (event) => onEvent?.(event),
    setWindowCalls,
    subscribeThrows: null,
    get closeCalls() {
      return closeCalls
    },
  }
  return state
}
```

- [ ] **Step 5: Write the failing tests for `WindowedDataSource` (construction, sync reads, prefetch, dispose)**

```ts
// packages/core/tests/kernel/data/windowed/WindowedDataSource.test.ts
import { describe, expect, it } from 'bun:test'
import { WindowedDataSource } from '../../../../src/kernel/data/windowed/WindowedDataSource'
import { createFakeWindowedProvider } from './fakeProvider'
import type { Schema } from '../../../../src/kernel/data/Schema'
import type { DataSourceEvent } from '../../../../src/kernel/data/DataSource'

const schema: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 100 },
    { id: 'score', name: 'Score', type: 'number', width: 80 },
  ],
}

async function tick(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => queueMicrotask(() => resolve(undefined)))
}

describe('WindowedDataSource — construction, sync reads, prefetch', () => {
  it('exposes rowCount/schema synchronously; miss before hintWindow', () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({ schema, rowCount: 100_000, provider: fake.provider })

    expect(source.getRowCount()).toBe(100_000)
    expect(source.getSchema()).toBe(schema)
    expect(source.getCell(0, 'name')).toBeUndefined()
    source.dispose()
  })

  it('hintWindow issues exactly one loadRange for the expanded+clamped window; resolve fills cache and emits rowsChanged once', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({
      schema,
      rowCount: 100_000,
      provider: fake.provider,
      preloadScreens: 2,
      blockRows: 20,
      blockCols: 2,
    })
    const events: DataSourceEvent[] = []
    source.subscribe((e) => events.push(e))

    source.hintWindow({ startRow: 0, endRow: 19, startCol: 0, endCol: 1 })
    expect(fake.pendingLoads()).toHaveLength(1)
    const [load] = fake.pendingLoads()
    expect(load!.window).toEqual({ startRow: 0, endRow: 29, startCol: 0, endCol: 1 })

    expect(source.getCell(0, 'name')).toBeUndefined()

    load!.resolve({ rows: Array.from({ length: 30 }, (_, i) => ({ name: `n${i}`, score: i })) })
    await tick()

    expect(source.getCell(0, 'name')).toBe('n0')
    expect(source.getCell(19, 'score')).toBe(19)
    expect(events).toEqual([{ type: 'rowsChanged', startIndex: 0, endIndex: 29 }])
    source.dispose()
  })

  it('repeated hintWindow calls with the same window are a no-op (no new loadRange)', () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({ schema, rowCount: 1000, provider: fake.provider })
    const window = { startRow: 0, endRow: 19, startCol: 0, endCol: 1 }

    source.hintWindow(window)
    expect(fake.pendingLoads()).toHaveLength(1)
    source.hintWindow({ ...window })
    expect(fake.pendingLoads()).toHaveLength(1) // still just the one request
    source.dispose()
  })

  it('scrolling within the preload window triggers zero additional requests; scrolling out aborts stale in-flight requests outside the new preload window', () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({
      schema,
      rowCount: 1000,
      provider: fake.provider,
      preloadScreens: 2,
      blockRows: 10,
      blockCols: 2,
    })

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 }) // preload → rows 0..14
    expect(fake.pendingLoads()).toHaveLength(1)
    const firstLoad = fake.pendingLoads()[0]!

    source.hintWindow({ startRow: 500, endRow: 509, startCol: 0, endCol: 1 }) // far away
    expect(firstLoad.signal.aborted).toBe(true)
    source.dispose()
  })

  it('applyEpoch: a loadRange response whose rowCount shrinks soft-invalidates — updates rowCount, emits rowCountChanged, marks other cached blocks stale, and reprioritizes their refetch', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({ schema, rowCount: 1000, provider: fake.provider, blockRows: 10, blockCols: 2 })
    const events: DataSourceEvent[] = []
    source.subscribe((e) => events.push(e))

    // block A resident and fresh
    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    const [blockALoad] = fake.pendingLoads()
    blockALoad!.resolve({ rows: Array.from({ length: 10 }, () => ({ name: 'a', score: 1 })), rowCount: 1000 })
    await tick()
    events.length = 0

    // scrolling to block B's revalidation response carries a shrunk rowCount (server deleted rows)
    source.hintWindow({ startRow: 100, endRow: 109, startCol: 0, endCol: 1 })
    const blockBLoad = fake.pendingLoads().find((l) => l.window.startRow >= 100)!
    blockBLoad.resolve({ rows: Array.from({ length: 10 }, () => ({ name: 'b', score: 1 })), rowCount: 800 })
    await tick()

    expect(source.getRowCount()).toBe(800)
    expect(events).toContainEqual({ type: 'rowCountChanged', newCount: 800 })
    expect(source.getCell(0, 'name')).toBe('a') // stale block A still readable, not cleared

    // reprioritized refetch: scrolling back to block A immediately re-requests it (marked stale)
    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    expect(fake.pendingLoads().some((l) => l.window.startRow <= 0 && l.window.endRow >= 9)).toBe(true)
    source.dispose()
  })

  it('applyEpoch: a lower-version response is dropped as stale, does not overwrite fresher cached data', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({
      schema,
      rowCount: 1000,
      provider: fake.provider,
      blockRows: 10,
      blockCols: 2,
      staleAfterMs: 5,
    })

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    const [firstLoad] = fake.pendingLoads()
    firstLoad!.resolve({ rows: Array.from({ length: 10 }, () => ({ name: 'fresh', score: 1 })), version: 5 })
    await tick()
    expect(source.getCell(0, 'name')).toBe('fresh')

    // scroll far enough away, long enough, to make the block stale and trigger a background refetch on return
    source.hintWindow({ startRow: 500, endRow: 509, startCol: 0, endCol: 1 })
    await new Promise((resolve) => setTimeout(resolve, 10))
    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    const staleReplay = fake.pendingLoads().find((l) => l.window.startRow <= 0 && l.window.endRow >= 9)!

    staleReplay.resolve({
      rows: Array.from({ length: 10 }, () => ({ name: 'stale-out-of-order', score: 0 })),
      version: 3, // arrives out of order, older than the already-applied version 5
    })
    await tick()

    expect(source.getCell(0, 'name')).toBe('fresh') // lower-version response discarded, not applied
    source.dispose()
  })

  it('applyEpoch: a higher version with unchanged rowCount still soft-invalidates without emitting rowCountChanged', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({
      schema,
      rowCount: 1000,
      provider: fake.provider,
      blockRows: 10,
      blockCols: 2,
      staleAfterMs: 100_000, // freshness clock alone would never explain a later refetch
    })
    const events: DataSourceEvent[] = []
    source.subscribe((e) => events.push(e))

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    const [firstLoad] = fake.pendingLoads()
    firstLoad!.resolve({ rows: Array.from({ length: 10 }, () => ({ name: 'v1', score: 1 })), version: 1, rowCount: 1000 })
    await tick()
    events.length = 0

    source.hintWindow({ startRow: 100, endRow: 109, startCol: 0, endCol: 1 })
    const [secondLoad] = fake.pendingLoads()
    secondLoad!.resolve({ rows: Array.from({ length: 10 }, () => ({ name: 'v2', score: 1 })), version: 2, rowCount: 1000 })
    await tick()

    expect(events.some((e) => e.type === 'rowCountChanged')).toBe(false) // rowCount unchanged — no event

    // block from version 1, still well within staleAfterMs, is nonetheless marked stale by the
    // version bump — scrolling back to it re-fetches instead of trusting the freshness clock alone
    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    expect(fake.pendingLoads().some((l) => l.window.startRow <= 0 && l.window.endRow >= 9)).toBe(true)
    source.dispose()
  })

  it('dispose aborts in-flight requests, closes the subscription, and ignores late resolutions', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({ schema, rowCount: 1000, provider: fake.provider })
    const events: DataSourceEvent[] = []
    source.subscribe((e) => events.push(e))

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    const [load] = fake.pendingLoads()

    source.dispose()
    expect(fake.closeCalls).toBe(1)
    expect(load!.signal.aborted).toBe(true)

    load!.resolve({ rows: Array.from({ length: 10 }, () => ({ name: 'x', score: 1 })) })
    await tick()
    expect(events).toEqual([])
    expect(source.getCell(0, 'name')).toBeUndefined()

    source.dispose() // idempotent, no throw
  })
})
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `bun test packages/core/tests/kernel/data/windowed/WindowedDataSource.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 7: Implement `WindowedDataSource.ts`**

```ts
// packages/core/src/kernel/data/windowed/WindowedDataSource.ts
import type {
  DataSource,
  DataSourceEvent,
  DataSourceListener,
  DataWindow,
} from '../DataSource'
import type { CellValue, Row, Schema } from '../Schema'
import {
  blockKey,
  expandWindow,
  mergeBlocksIntoRects,
  windowsEqual,
  windowToBlocks,
  type BlockCoord,
} from './blockGeometry'
import { BlockCache } from './BlockCache'
import { applySliceToBlocks } from './sliceToBlocks'
import type { CellUpdate, RangeSlice, WindowedDataProvider, WindowSubscription } from './WindowedDataProvider'

export interface WindowedDataSourceOptions {
  readonly schema: Schema
  readonly rowCount: number
  readonly provider: WindowedDataProvider
  readonly preloadScreens?: number
  readonly blockRows?: number
  readonly blockCols?: number
  readonly maxCachedBlocks?: number
  readonly subscribeDebounceMs?: number
  readonly staleAfterMs?: number
}

interface InFlightRequest {
  readonly controller: AbortController
  readonly blockKeys: readonly string[]
  readonly rect: DataWindow
  readonly blocks: readonly BlockCoord[]
  readonly pendingByBlock: Map<string, CellUpdate[]>
}

export class WindowedDataSource implements DataSource {
  private schema: Schema
  private rowCount: number
  private currentVersion: number | undefined
  private readonly provider: WindowedDataProvider
  private readonly preloadScreens: number
  private readonly blockRowsSize: number
  private readonly blockColsSize: number
  private readonly subscribeDebounceMs: number
  private readonly staleAfterMs: number
  private readonly cache: BlockCache
  private readonly fieldIdToCol = new Map<string, number>()
  private readonly listeners = new Set<DataSourceListener>()
  private subscription: WindowSubscription | null = null
  private subscribeTimer: ReturnType<typeof setTimeout> | null = null
  private disposed = false
  private lastHintWindow: DataWindow | null = null

  private readonly requests = new Map<string, InFlightRequest>()
  private readonly inFlightByBlock = new Map<string, string>()
  private readonly cooldownUntil = new Map<string, number>()
  private requestSeq = 0

  private pendingChangedRange: { minRow: number; maxRow: number } | null = null
  private flushScheduled = false

  constructor(options: WindowedDataSourceOptions) {
    this.schema = options.schema
    this.rowCount = options.rowCount
    this.provider = options.provider
    this.preloadScreens = options.preloadScreens ?? 2
    this.blockRowsSize = options.blockRows ?? 128
    this.blockColsSize = options.blockCols ?? 16
    this.subscribeDebounceMs = options.subscribeDebounceMs ?? 150
    this.staleAfterMs = options.staleAfterMs ?? 30_000
    this.cache = new BlockCache({ maxCachedBlocks: options.maxCachedBlocks ?? 256 })
    this.schema.fields.forEach((field, index) => this.fieldIdToCol.set(field.id, index))

    try {
      this.subscription = this.provider.subscribe((event) => this.handleEvent(event))
    } catch (error) {
      console.warn('[WindowedDataSource] provider.subscribe threw; falling back to fetch-only mode', error)
      this.subscription = null
    }
  }

  getRowCount(): number {
    return this.rowCount
  }

  getSchema(): Schema {
    return this.schema
  }

  getCell(rowIndex: number, fieldId: string): CellValue | undefined {
    const col = this.fieldIdToCol.get(fieldId)
    if (col === undefined) return undefined
    const blockRow = Math.floor(rowIndex / this.blockRowsSize)
    const blockCol = Math.floor(col / this.blockColsSize)
    const localRow = rowIndex - blockRow * this.blockRowsSize
    const localCol = col - blockCol * this.blockColsSize
    return this.cache.get(blockKey(blockRow, blockCol), localRow, localCol)
  }

  getRows(startIndex: number, endIndex: number): Row[] {
    const start = Math.max(0, startIndex)
    const end = Math.min(this.rowCount - 1, endIndex)
    if (end < start) return []
    const rows: Row[] = []
    for (let row = start; row <= end; row += 1) {
      const record: Row = {}
      for (const field of this.schema.fields) {
        const value = this.getCell(row, field.id)
        if (value !== undefined) record[field.id] = value
      }
      rows.push(record)
    }
    return rows
  }

  resolveUnderlyingRow(viewRow: number): number {
    return viewRow
  }

  findViewRow(underlyingRow: number): number {
    return underlyingRow
  }

  subscribe(listener: DataSourceListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  hintWindow(window: DataWindow): void {
    if (this.disposed) return
    if (windowsEqual(window, this.lastHintWindow)) return
    this.lastHintWindow = window
    this.planAndFetch(window)
    this.scheduleSubscriptionFollow(window)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.subscribeTimer !== null) clearTimeout(this.subscribeTimer)
    this.subscription?.close()
    for (const request of this.requests.values()) request.controller.abort()
    this.requests.clear()
    this.inFlightByBlock.clear()
    this.cooldownUntil.clear()
    this.cache.clear()
  }

  private planAndFetch(visibleWindow: DataWindow): void {
    const colCount = this.schema.fields.length
    const preloadWindow = expandWindow(visibleWindow, this.preloadScreens, this.rowCount, colCount)
    const allBlocks = windowToBlocks(preloadWindow, this.blockRowsSize, this.blockColsSize)
    const allKeys = new Set(allBlocks.map((b) => blockKey(b.blockRow, b.blockCol)))

    for (const [requestId, request] of this.requests) {
      const stillRelevant = request.blockKeys.some((key) => allKeys.has(key))
      if (!stillRelevant) {
        request.controller.abort()
        this.requests.delete(requestId)
        for (const key of request.blockKeys) this.inFlightByBlock.delete(key)
      }
    }

    const now = Date.now()
    const needed = allBlocks.filter((b) => {
      const key = blockKey(b.blockRow, b.blockCol)
      if (this.inFlightByBlock.has(key)) return false
      const cooldown = this.cooldownUntil.get(key)
      if (cooldown !== undefined && cooldown > now) return false
      if (!this.cache.has(key)) return true
      const freshAt = this.cache.getFreshAt(key) ?? 0
      return this.cache.isStale(key) || now - freshAt > this.staleAfterMs
    })

    if (needed.length > 0) {
      const groups = mergeBlocksIntoRects(needed, this.blockRowsSize, this.blockColsSize, this.rowCount, colCount)
      for (const group of groups) this.issueRequest(group.window, group.blocks)
    }

    this.cache.evictExcess(allKeys)
  }

  private issueRequest(rect: DataWindow, blocks: readonly BlockCoord[]): void {
    const requestId = `r${this.requestSeq}`
    this.requestSeq += 1
    const controller = new AbortController()
    const blockKeys = blocks.map((b) => blockKey(b.blockRow, b.blockCol))
    const pendingByBlock = new Map<string, CellUpdate[]>()
    for (const key of blockKeys) {
      this.inFlightByBlock.set(key, requestId)
      pendingByBlock.set(key, [])
    }
    this.requests.set(requestId, { controller, blockKeys, rect, blocks, pendingByBlock })

    this.provider.loadRange(rect, controller.signal).then(
      (slice) => this.handleResolve(requestId, slice),
      (error) => this.handleReject(requestId, error),
    )
  }

  private handleResolve(requestId: string, slice: RangeSlice): void {
    if (this.disposed) return
    const request = this.requests.get(requestId)
    if (!request) return
    this.requests.delete(requestId)
    for (const key of request.blockKeys) this.inFlightByBlock.delete(key)

    const epochResult = this.applyEpoch(slice)
    if (epochResult === 'stale') return

    const now = Date.now()
    const colCount = this.schema.fields.length
    applySliceToBlocks(
      this.cache,
      request.rect,
      request.blocks,
      slice,
      this.schema,
      this.blockRowsSize,
      this.blockColsSize,
      this.rowCount,
      colCount,
      now,
    )

    for (const [key, updates] of request.pendingByBlock) {
      for (const update of updates) this.writeCellUpdateIntoCache(key, update, now)
    }

    this.emitRowsChanged(request.rect.startRow, request.rect.endRow)

    if (epochResult === 'invalidated' && this.lastHintWindow) this.planAndFetch(this.lastHintWindow)
  }

  private handleReject(requestId: string, error: unknown): void {
    if (this.disposed) return
    const request = this.requests.get(requestId)
    if (!request) return
    this.requests.delete(requestId)
    for (const key of request.blockKeys) this.inFlightByBlock.delete(key)
    if (error instanceof Error && error.name === 'AbortError') return

    const until = Date.now() + 2000
    for (const key of request.blockKeys) this.cooldownUntil.set(key, until)
    setTimeout(() => {
      if (this.disposed) return
      if (this.lastHintWindow) this.planAndFetch(this.lastHintWindow)
    }, 2000)
  }

  private applyEpoch(slice: RangeSlice): 'stale' | 'invalidated' | 'normal' {
    if (slice.version !== undefined && this.currentVersion !== undefined && slice.version < this.currentVersion) {
      return 'stale'
    }
    const versionAdvanced = slice.version !== undefined && slice.version !== this.currentVersion
    const rowCountChanged = slice.rowCount !== undefined && slice.rowCount !== this.rowCount
    if (slice.version !== undefined) this.currentVersion = slice.version

    if (versionAdvanced || (slice.version === undefined && rowCountChanged)) {
      if (rowCountChanged) {
        this.rowCount = slice.rowCount!
        this.cache.markAllStale()
        this.emit({ type: 'rowCountChanged', newCount: this.rowCount })
      } else {
        this.cache.markAllStale()
      }
      return 'invalidated'
    }
    return 'normal'
  }

  private writeCellUpdateIntoCache(_unused: string, update: CellUpdate, nowMs: number): void {
    const col = this.fieldIdToCol.get(update.fieldId)
    if (col === undefined) return
    const blockRow = Math.floor(update.row / this.blockRowsSize)
    const blockCol = Math.floor(col / this.blockColsSize)
    const key = blockKey(blockRow, blockCol)
    if (!this.cache.has(key)) return
    const localRow = update.row - blockRow * this.blockRowsSize
    const localCol = col - blockCol * this.blockColsSize
    this.cache.setCell(key, localRow, localCol, update.value)
    this.cache.refreshFreshness(key, nowMs)
  }

  private scheduleSubscriptionFollow(window: DataWindow): void {
    if (this.subscribeTimer !== null) clearTimeout(this.subscribeTimer)
    this.subscribeTimer = setTimeout(() => {
      this.subscribeTimer = null
      if (this.disposed) return
      this.subscription?.setWindow(window)
    }, this.subscribeDebounceMs)
  }

  private emitRowsChanged(startRow: number, endRow: number): void {
    this.pendingChangedRange = this.pendingChangedRange
      ? {
          minRow: Math.min(this.pendingChangedRange.minRow, startRow),
          maxRow: Math.max(this.pendingChangedRange.maxRow, endRow),
        }
      : { minRow: startRow, maxRow: endRow }

    if (this.flushScheduled) return
    this.flushScheduled = true
    queueMicrotask(() => {
      this.flushScheduled = false
      const range = this.pendingChangedRange
      this.pendingChangedRange = null
      if (range && !this.disposed) {
        this.emit({ type: 'rowsChanged', startIndex: range.minRow, endIndex: range.maxRow })
      }
    })
  }

  private emit(event: DataSourceEvent): void {
    if (this.disposed) return
    for (const listener of this.listeners) listener(event)
  }

  private handleEvent(event: import('./WindowedDataProvider').WindowedDataEvent): void {
    if (this.disposed) return
    if (event.type !== 'cells') return
    const now = Date.now()
    let touched: { minRow: number; maxRow: number } | null = null
    for (const update of event.updates) {
      const col = this.fieldIdToCol.get(update.fieldId)
      if (col === undefined) continue
      const blockRow = Math.floor(update.row / this.blockRowsSize)
      const blockCol = Math.floor(col / this.blockColsSize)
      const key = blockKey(blockRow, blockCol)
      const inFlightRequestId = this.inFlightByBlock.get(key)
      if (inFlightRequestId !== undefined) {
        this.requests.get(inFlightRequestId)?.pendingByBlock.get(key)?.push(update)
        continue
      }
      if (!this.cache.has(key)) continue
      this.writeCellUpdateIntoCache(key, update, now)
      touched = touched
        ? { minRow: Math.min(touched.minRow, update.row), maxRow: Math.max(touched.maxRow, update.row) }
        : { minRow: update.row, maxRow: update.row }
    }
    if (touched) this.emitRowsChanged(touched.minRow, touched.maxRow)
  }
}
```

- [ ] **Step 8: Create `windowed/index.ts` and wire package exports**

```ts
// packages/core/src/kernel/data/windowed/index.ts
export { WindowedDataSource } from './WindowedDataSource'
export type { WindowedDataSourceOptions } from './WindowedDataSource'
export type {
  CellUpdate,
  DataWindow,
  RangeSlice,
  WindowedDataEvent,
  WindowedDataProvider,
  WindowSubscription,
} from './WindowedDataProvider'
```

Add to `packages/core/src/index.ts` (near the other `kernel/data` exports):

```ts
export { WindowedDataSource } from './kernel/data/windowed/WindowedDataSource'
export type { WindowedDataSourceOptions } from './kernel/data/windowed/WindowedDataSource'
```

(The `CellUpdate`/`RangeSlice`/`WindowedDataEvent`/`WindowedDataProvider`/`WindowSubscription` exports already exist from Task 1 — don't duplicate.)

- [ ] **Step 9: Run tests and typecheck**

Run: `bun test packages/core/tests/kernel/data/windowed/`
Expected: PASS (all `WindowedDataSource.test.ts`, `sliceToBlocks.test.ts`, `blockGeometry.test.ts`, `BlockCache.test.ts` tests)

Run: `bun run --filter @novasheet/core typecheck`
Expected: no errors — fix any unused-import or `noUncheckedIndexedAccess` complaints revealed here (e.g. add `!` where `Array` indexing is known-safe, such as `sorted[0]!` patterns already used elsewhere in this plan).

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/kernel/data/windowed/ packages/core/src/index.ts packages/core/tests/kernel/data/windowed/
git commit -m "$(cat <<'EOF'
feat(core): 新增 WindowedDataSource——构造/同步读/预取编排/dispose

覆盖 §6.1-6.2/6.4-6.6：帧驱动预取管线（外扩+块规划+水平合并+去重+cooldown+
离场 abort）、epoch 检测（陈旧丢弃/软失效/正常落块）、in-flight 期间的
cells 推送 pending buffer 回放、按帧合并的 rowsChanged 广播、dispose 幂等。
rowCount/resync 推送与订阅窗口跟随留给下一个 task。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Push channel — `rowCount` / `resync` handling + subscription-follow verification

**Files:**
- Modify: `packages/core/src/kernel/data/windowed/WindowedDataSource.ts`
- Modify: `packages/core/tests/kernel/data/windowed/WindowedDataSource.test.ts`

**Interfaces:**
- Consumes: everything from Task 4 (same class, same file).
- Produces: `WindowedDataSource.handleEvent` now handles all three `WindowedDataEvent` variants; behavior consumed by Task 7's BDD tests (`windowed-epoch-shrink`, `windowed-resync`, `windowed-subscription-follow`, `windowed-stale-revalidate`).

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/tests/kernel/data/windowed/WindowedDataSource.test.ts`:

```ts
describe('WindowedDataSource — push channel (rowCount/resync) and subscription follow', () => {
  it('rowCount event with a smaller value shrinks rowCount, emits rowCountChanged, marks cache stale, and re-plans the current window immediately', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({ schema, rowCount: 1000, provider: fake.provider, blockRows: 10, blockCols: 2 })
    const events: DataSourceEvent[] = []
    source.subscribe((e) => events.push(e))

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    const [firstLoad] = fake.pendingLoads()
    firstLoad!.resolve({
      rows: Array.from(
        { length: firstLoad!.window.endRow - firstLoad!.window.startRow + 1 },
        () => ({ name: 'x', score: 1 }),
      ),
    })
    await tick()
    events.length = 0

    fake.emit({ type: 'rowCount', rowCount: 800 })

    expect(source.getRowCount()).toBe(800)
    expect(events).toContainEqual({ type: 'rowCountChanged', newCount: 800 })
    // re-plan for the still-active hinted window fires a fresh loadRange for the now-stale block
    expect(fake.pendingLoads().length).toBeGreaterThan(0)
    source.dispose()
  })

  it('resync aborts in-flight requests, clears the cache, emits reset (and rowCountChanged if rowCount provided), and re-fetches the current window', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({ schema, rowCount: 1000, provider: fake.provider, blockRows: 10, blockCols: 2 })
    const events: DataSourceEvent[] = []
    source.subscribe((e) => events.push(e))

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    const [firstLoad] = fake.pendingLoads()
    firstLoad!.resolve({ rows: Array.from({ length: firstLoad!.window.endRow - firstLoad!.window.startRow + 1 }, () => ({ name: 'x', score: 1 })) })
    await tick()
    expect(source.getCell(0, 'name')).toBe('x')
    events.length = 0

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 }) // ensure no pending unrelated request before resync
    const inFlightBeforeResync = fake.pendingLoads()

    fake.emit({ type: 'resync', rowCount: 500 })

    for (const load of inFlightBeforeResync) expect(load.signal.aborted).toBe(true)
    expect(source.getCell(0, 'name')).toBeUndefined() // cache cleared
    expect(source.getRowCount()).toBe(500)
    expect(events).toContainEqual({ type: 'rowCountChanged', newCount: 500 })
    expect(events).toContainEqual({ type: 'reset' })
    expect(fake.pendingLoads().length).toBeGreaterThan(0) // re-fetch issued for current window
    source.dispose()
  })

  it('setWindow is called once, with the visible (unexpanded) window, only after the debounce interval settles', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({
      schema,
      rowCount: 1000,
      provider: fake.provider,
      subscribeDebounceMs: 20,
    })

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    source.hintWindow({ startRow: 1, endRow: 10, startCol: 0, endCol: 1 })
    source.hintWindow({ startRow: 2, endRow: 11, startCol: 0, endCol: 1 })
    expect(fake.setWindowCalls).toHaveLength(0) // still within debounce window

    await new Promise((resolve) => setTimeout(resolve, 40))

    expect(fake.setWindowCalls).toEqual([{ startRow: 2, endRow: 11, startCol: 0, endCol: 1 }])
    source.dispose()
  })

  it('a block that goes stale (staleAfterMs elapsed) is refetched in the background when it re-enters the preload window, without clearing its old value first', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({
      schema,
      rowCount: 1000,
      provider: fake.provider,
      blockRows: 10,
      blockCols: 2,
      staleAfterMs: 10,
    })

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    const [firstLoad] = fake.pendingLoads()
    firstLoad!.resolve({ rows: Array.from({ length: 10 }, () => ({ name: 'old', score: 1 })) })
    await tick()
    expect(source.getCell(0, 'name')).toBe('old')

    source.hintWindow({ startRow: 500, endRow: 509, startCol: 0, endCol: 1 }) // scroll far away
    await new Promise((resolve) => setTimeout(resolve, 20)) // exceed staleAfterMs

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 }) // scroll back

    expect(source.getCell(0, 'name')).toBe('old') // stale value still readable, not cleared
    const refetch = fake.pendingLoads().find(
      (l) => l.window.startRow <= 0 && l.window.endRow >= 9 && l.window.startCol === 0,
    )
    expect(refetch).toBeDefined()

    refetch!.resolve({ rows: Array.from({ length: refetch!.window.endRow - refetch!.window.startRow + 1 }, () => ({ name: 'new', score: 2 })) })
    await tick()
    expect(source.getCell(0, 'name')).toBe('new')
    source.dispose()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/core/tests/kernel/data/windowed/WindowedDataSource.test.ts`
Expected: FAIL — `handleEvent` currently ignores `rowCount` and `resync` (ts compiles fine since `handleEvent`'s parameter type already covers all three variants; the new tests fail on assertions, not compilation).

- [ ] **Step 3: Extend `handleEvent` to cover `rowCount` and `resync`**

In `packages/core/src/kernel/data/windowed/WindowedDataSource.ts`, replace the `handleEvent` method body (the `if (event.type !== 'cells') return` early-return version from Task 4) with:

```ts
  private handleEvent(event: import('./WindowedDataProvider').WindowedDataEvent): void {
    if (this.disposed) return
    try {
      if (event.type === 'cells') {
        this.handleCellsEvent(event.updates)
        return
      }
      if (event.type === 'rowCount') {
        this.handleRowCountEvent(event.rowCount, event.version)
        return
      }
      this.handleResyncEvent(event.rowCount)
    } catch (error) {
      console.warn('[WindowedDataSource] error handling provider event', error)
    }
  }

  private handleCellsEvent(updates: readonly CellUpdate[]): void {
    const now = Date.now()
    let touched: { minRow: number; maxRow: number } | null = null
    for (const update of updates) {
      const col = this.fieldIdToCol.get(update.fieldId)
      if (col === undefined) continue
      const blockRow = Math.floor(update.row / this.blockRowsSize)
      const blockCol = Math.floor(col / this.blockColsSize)
      const key = blockKey(blockRow, blockCol)
      const inFlightRequestId = this.inFlightByBlock.get(key)
      if (inFlightRequestId !== undefined) {
        this.requests.get(inFlightRequestId)?.pendingByBlock.get(key)?.push(update)
        continue
      }
      if (!this.cache.has(key)) continue
      this.writeCellUpdateIntoCache(key, update, now)
      touched = touched
        ? { minRow: Math.min(touched.minRow, update.row), maxRow: Math.max(touched.maxRow, update.row) }
        : { minRow: update.row, maxRow: update.row }
    }
    if (touched) this.emitRowsChanged(touched.minRow, touched.maxRow)
  }

  private handleRowCountEvent(rowCount: number, version?: number): void {
    if (version !== undefined) this.currentVersion = version
    const changed = rowCount !== this.rowCount
    this.cache.markAllStale()
    if (changed) {
      this.rowCount = rowCount
      this.emit({ type: 'rowCountChanged', newCount: rowCount })
    }
    if (this.lastHintWindow) this.planAndFetch(this.lastHintWindow)
  }

  private handleResyncEvent(rowCount?: number): void {
    for (const request of this.requests.values()) request.controller.abort()
    this.requests.clear()
    this.inFlightByBlock.clear()
    this.cooldownUntil.clear()
    this.cache.clear()

    if (rowCount !== undefined && rowCount !== this.rowCount) {
      this.rowCount = rowCount
      this.emit({ type: 'rowCountChanged', newCount: rowCount })
    }
    this.emit({ type: 'reset' })
    if (this.lastHintWindow) this.planAndFetch(this.lastHintWindow)
  }
```

Delete the now-superseded standalone `handleCellsEvent`-equivalent inline body that Task 4 left directly inside `handleEvent` (Task 4's version is fully replaced by the dispatcher above — there should be exactly one `handleEvent` method and one `handleCellsEvent` method after this edit, not two).

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun test packages/core/tests/kernel/data/windowed/WindowedDataSource.test.ts`
Expected: PASS (all tests from Task 4 and Task 5)

- [ ] **Step 5: Typecheck**

Run: `bun run --filter @novasheet/core typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/kernel/data/windowed/WindowedDataSource.ts packages/core/tests/kernel/data/windowed/WindowedDataSource.test.ts
git commit -m "$(cat <<'EOF'
feat(core): WindowedDataSource 补齐 rowCount/resync 推送与订阅跟随验证

rowCount 事件触发 epoch 软失效（标记全部块 stale + rowCountChanged +
立即对当前窗口重新规划，不等待下次滚动）；resync 做硬失效闸门
（abort 全部 in-flight + 清缓存 + reset + 重拉当前窗口）。
新增测试验证 staleAfterMs 触发的 SWR 后台重拉与订阅防抖只发最后一次窗口。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Error boundary hardening (§7 remaining cases)

**Files:**
- Modify: `packages/core/tests/kernel/data/windowed/WindowedDataSource.test.ts`
- Modify: `packages/core/tests/kernel/data/windowed/sliceToBlocks.test.ts`

No production code changes are expected — Tasks 4–5 already implemented every behavior in §7's table (subscribe-throw degrade in the constructor, `AbortError` silence in `handleReject`, disposed-flag guards in every async callback, `console.warn` on `RangeSlice` length mismatch in `sliceToBlocks.ts`). This task's job is to **prove** each row of §7 with a dedicated test, since none of Tasks 4–5's tests exercised the `subscribe`-throws-at-construction path, the length-mismatch console-warning specifically, or an `onEvent` handler that throws. If any of these tests reveals a real gap, fix it here.

**Interfaces:**
- Consumes: `WindowedDataSource`, `createFakeWindowedProvider` (Tasks 4–5).

- [ ] **Step 1: Write the tests**

Append to `packages/core/tests/kernel/data/windowed/WindowedDataSource.test.ts`:

```ts
describe('WindowedDataSource — error boundaries (§7)', () => {
  it('provider.subscribe throwing at construction degrades to fetch-only mode without throwing', () => {
    const fake = createFakeWindowedProvider()
    fake.subscribeThrows = new Error('ws unavailable')
    const warn = console.warn
    let warned = false
    console.warn = (...args: unknown[]) => {
      warned = true
      warn(...args)
    }
    try {
      expect(() => new WindowedDataSource({ schema, rowCount: 100, provider: fake.provider })).not.toThrow()
      expect(warned).toBe(true)
    } finally {
      console.warn = warn
    }
  })

  it('a genuinely malformed cells payload (updates: null) throws internally but is caught and contained, not propagated', () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({ schema, rowCount: 100, provider: fake.provider })
    const warn = console.warn
    let warned = false
    console.warn = (...args: unknown[]) => {
      warned = true
      warn(...args)
    }
    try {
      // `for (const update of event.updates)` throws TypeError when updates is null —
      // a real shape a misbehaving provider could send. Must not escape handleEvent.
      expect(() => fake.emit({ type: 'cells', updates: null as never })).not.toThrow()
      expect(warned).toBe(true)
    } finally {
      console.warn = warn
      source.dispose()
    }
  })

  it('reject that is not an AbortError puts affected blocks into cooldown (no immediate retry loop)', () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({ schema, rowCount: 100, provider: fake.provider, blockRows: 10, blockCols: 2 })
    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    const [load] = fake.pendingLoads()
    load!.reject(new Error('network down'))

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    source.hintWindow({ startRow: 1, endRow: 10, startCol: 0, endCol: 1 }) // force short-circuit bypass
    // immediately after rejection, the same block should not be re-requested (cooldown active)
    expect(fake.pendingLoads()).toHaveLength(0)
    source.dispose()
  })

  it('a rejection named AbortError is silent — no cooldown, block is immediately re-requestable', () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({ schema, rowCount: 100, provider: fake.provider, blockRows: 10, blockCols: 2 })
    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    const [load] = fake.pendingLoads()

    source.hintWindow({ startRow: 90, endRow: 99, startCol: 0, endCol: 1 }) // scroll away → internal abort() called
    expect(load!.signal.aborted).toBe(true)
    // simulate what a real fetch-based provider does when its AbortSignal fires
    load!.reject(new DOMException('The operation was aborted', 'AbortError'))

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 }) // scroll back immediately
    expect(fake.pendingLoads().length).toBeGreaterThan(0) // no cooldown — re-requested right away
    source.dispose()
  })
})
```

Append to `packages/core/tests/kernel/data/windowed/sliceToBlocks.test.ts`:

```ts
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
      )
      expect(warned).toBe(true)
    } finally {
      console.warn = warn
    }
  })
```

- [ ] **Step 2: Run tests**

Run: `bun test packages/core/tests/kernel/data/windowed/`
Expected: PASS. If any test fails, it identifies a real gap against §7 — fix the corresponding production code in `WindowedDataSource.ts` or `sliceToBlocks.ts` (do not weaken the test to make it pass).

- [ ] **Step 3: Commit**

```bash
git add packages/core/tests/kernel/data/windowed/WindowedDataSource.test.ts packages/core/tests/kernel/data/windowed/sliceToBlocks.test.ts
git commit -m "$(cat <<'EOF'
test(core): 补齐 WindowedDataSource §7 错误边界的显式验证

subscribe 构造期抛错降级、畸形 cells payload 不崩溃、非 AbortError 的
reject 进入 cooldown 不立即重试、loadRange 响应行数不符时 console.warn——
这些行为已随 Task4/5 落地，本 task 只补测试证明覆盖到位。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: BDD acceptance — implement the 8 scenarios, flip draft → implemented

**Files:**
- Create: `packages/core/tests/acceptance/functional/data-ops/windowed-bdd.test.ts`
- Modify: `packages/core/tests/acceptance/functional/data-ops/scenarios/L0-datasource-windowed-initial-skeleton.md` (status: draft → implemented)
- Modify: `packages/core/tests/acceptance/functional/data-ops/scenarios/L0-datasource-windowed-scroll-prefetch.md` (status: draft → implemented)
- Modify: `packages/core/tests/acceptance/functional/data-ops/scenarios/L0-datasource-windowed-push-update.md` (status: draft → implemented)
- Modify: `packages/core/tests/acceptance/functional/data-ops/scenarios/L0-datasource-windowed-subscription-follow.md` (status: draft → implemented)
- Modify: `packages/core/tests/acceptance/functional/data-ops/scenarios/L0-datasource-windowed-stale-revalidate.md` (status: draft → implemented)
- Modify: `packages/core/tests/acceptance/functional/data-ops/scenarios/L0-datasource-windowed-epoch-shrink.md` (status: draft → implemented)
- Modify: `packages/core/tests/acceptance/functional/data-ops/scenarios/L0-datasource-windowed-resync.md` (status: draft → implemented)
- Modify: `packages/core/tests/acceptance/functional/data-ops/scenarios/L0-datasource-windowed-dispose.md` (status: draft → implemented)
- Modify: `packages/core/tests/acceptance/README.md` (add a row to the "测试文件职责" table)

**Interfaces:**
- Consumes: `WindowedDataSource` (Tasks 4–6), `createFakeWindowedProvider` from `packages/core/tests/kernel/data/windowed/fakeProvider.ts` (imported via relative path — test-only cross-suite reuse, not subject to the `src/` kernel/DOM boundary lint since it's under `tests/`).

- [ ] **Step 1: Write the 8 scenario tests**

```ts
// packages/core/tests/acceptance/functional/data-ops/windowed-bdd.test.ts
import { describe, expect, it } from 'bun:test'
import { WindowedDataSource } from '../../../../src/kernel/data/windowed/WindowedDataSource'
import { createFakeWindowedProvider } from '../../../kernel/data/windowed/fakeProvider'
import type { Schema } from '../../../../src/kernel/data/Schema'
import type { DataSourceEvent } from '../../../../src/kernel/data/DataSource'

const schema: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 100 },
    { id: 'score', name: 'Score', type: 'number', width: 80 },
  ],
}

async function flush(): Promise<void> {
  await Promise.resolve()
  await new Promise((resolve) => queueMicrotask(() => resolve(undefined)))
}

function rowsFor(window: { startRow: number; endRow: number }, label: string): { name: string; score: number }[] {
  const count = window.endRow - window.startRow + 1
  return Array.from({ length: count }, (_, i) => ({ name: `${label}${window.startRow + i}`, score: window.startRow + i }))
}

describe('Core acceptance windowed data source', () => {
  it('core.L0.datasource-windowed-initial-skeleton exposes full skeleton immediately, fills on first load', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({ schema, rowCount: 100_000, provider: fake.provider })
    const events: DataSourceEvent[] = []
    source.subscribe((e) => events.push(e))

    expect(source.getRowCount()).toBe(100_000)
    expect(source.getSchema()).toBe(schema)
    expect(source.getCell(0, 'name')).toBeUndefined()

    source.hintWindow({ startRow: 0, endRow: 39, startCol: 0, endCol: 1 })
    const [load] = fake.pendingLoads()
    load!.resolve({ rows: rowsFor(load!.window, 'r') })
    await flush()

    expect(source.getCell(0, 'name')).toBe('r0')
    expect(events).toContainEqual(expect.objectContaining({ type: 'rowsChanged' }))
    source.dispose()
  })

  it('core.L0.datasource-windowed-scroll-prefetch: zero requests inside the preload window, aligned merged request when scrolling out', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({
      schema,
      rowCount: 100_000,
      provider: fake.provider,
      preloadScreens: 2,
      blockRows: 20,
      blockCols: 2,
    })

    source.hintWindow({ startRow: 0, endRow: 19, startCol: 0, endCol: 1 })
    const [firstLoad] = fake.pendingLoads()
    firstLoad!.resolve({ rows: rowsFor(firstLoad!.window, 'r') })
    await flush()

    source.hintWindow({ startRow: 5, endRow: 24, startCol: 0, endCol: 1 }) // still inside preload window
    expect(fake.pendingLoads()).toHaveLength(0)

    source.hintWindow({ startRow: 200, endRow: 219, startCol: 0, endCol: 1 }) // scroll far away
    expect(fake.pendingLoads().length).toBeGreaterThan(0)
    source.dispose()
  })

  it('core.L0.datasource-windowed-push-update: resident block updates instantly, in-flight buffers, unloaded block drops', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({
      schema,
      rowCount: 1000,
      provider: fake.provider,
      blockRows: 10,
      blockCols: 2,
    })
    const events: DataSourceEvent[] = []
    source.subscribe((e) => events.push(e))

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 }) // block A
    const [blockALoad] = fake.pendingLoads()
    blockALoad!.resolve({ rows: rowsFor(blockALoad!.window, 'a') })
    await flush()

    source.hintWindow({ startRow: 100, endRow: 109, startCol: 0, endCol: 1 }) // block B, still in-flight
    const blockBLoad = fake.pendingLoads().find((l) => l.window.startRow >= 100)!

    fake.emit({
      type: 'cells',
      updates: [
        { row: 0, fieldId: 'name', value: 'pushed-a' }, // resident
        { row: 100, fieldId: 'name', value: 'pushed-b' }, // in-flight
        { row: 500, fieldId: 'name', value: 'pushed-c' }, // never loaded
      ],
    })
    await flush()

    expect(source.getCell(0, 'name')).toBe('pushed-a')
    expect(source.getCell(500, 'name')).toBeUndefined()

    blockBLoad.resolve({ rows: rowsFor(blockBLoad.window, 'b') }) // stale snapshot value for row 100
    await flush()
    expect(source.getCell(100, 'name')).toBe('pushed-b') // pending buffer replay wins over stale fetch value
    source.dispose()
  })

  it('core.L0.datasource-windowed-subscription-follow: setWindow fires once with the last window after the debounce settles', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({ schema, rowCount: 1000, provider: fake.provider, subscribeDebounceMs: 15 })

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    source.hintWindow({ startRow: 1, endRow: 10, startCol: 0, endCol: 1 })
    expect(fake.setWindowCalls).toHaveLength(0)

    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(fake.setWindowCalls).toEqual([{ startRow: 1, endRow: 10, startCol: 0, endCol: 1 }])
    source.dispose()
  })

  it('core.L0.datasource-windowed-stale-revalidate: stale block re-entering the window is readable immediately and refetched in the background', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({
      schema,
      rowCount: 1000,
      provider: fake.provider,
      blockRows: 10,
      blockCols: 2,
      staleAfterMs: 10,
    })

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    const [load] = fake.pendingLoads()
    load!.resolve({ rows: rowsFor(load!.window, 'old') })
    await flush()

    source.hintWindow({ startRow: 500, endRow: 509, startCol: 0, endCol: 1 })
    await new Promise((resolve) => setTimeout(resolve, 20))
    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })

    expect(source.getCell(0, 'name')).toBe('old0') // still readable, not cleared
    const refetch = fake.pendingLoads().find((l) => l.window.startRow <= 0 && l.window.endRow >= 9)!
    refetch.resolve({ rows: rowsFor(refetch.window, 'new') })
    await flush()
    expect(source.getCell(0, 'name')).toBe('new0')
    source.dispose()
  })

  it('core.L0.datasource-windowed-epoch-shrink: a loadRange response carrying a shrunk rowCount soft-invalidates the cache', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({ schema, rowCount: 1000, provider: fake.provider, blockRows: 10, blockCols: 2 })
    const events: DataSourceEvent[] = []
    source.subscribe((e) => events.push(e))

    // block A: resident and fresh, well within data bounds even after the shrink below
    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    const [blockALoad] = fake.pendingLoads()
    blockALoad!.resolve({ rows: rowsFor(blockALoad!.window, 'a'), rowCount: 1000 })
    await flush()
    events.length = 0

    // scrolling elsewhere triggers an ordinary load whose response reveals a smaller server-side rowCount
    source.hintWindow({ startRow: 100, endRow: 109, startCol: 0, endCol: 1 })
    const blockBLoad = fake.pendingLoads().find((l) => l.window.startRow >= 100)!
    blockBLoad.resolve({ rows: rowsFor(blockBLoad.window, 'b'), rowCount: 800 })
    await flush()

    expect(source.getRowCount()).toBe(800)
    expect(events).toContainEqual({ type: 'rowCountChanged', newCount: 800 })
    expect(source.getCell(0, 'name')).toBe('a0') // block A's stale value still readable, not cleared

    // scrolling back to block A immediately triggers its reprioritized refetch (marked stale above)
    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    expect(fake.pendingLoads().some((l) => l.window.startRow <= 0 && l.window.endRow >= 9)).toBe(true)
    source.dispose()
  })

  it('core.L0.datasource-windowed-resync: resets cache, aborts in-flight, emits reset, and re-fetches the current window', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({ schema, rowCount: 1000, provider: fake.provider, blockRows: 10, blockCols: 2 })
    const events: DataSourceEvent[] = []
    source.subscribe((e) => events.push(e))

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    const [load] = fake.pendingLoads()
    load!.resolve({ rows: rowsFor(load!.window, 'r') })
    await flush()

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    fake.emit({ type: 'resync' })

    expect(source.getCell(0, 'name')).toBeUndefined()
    expect(events).toContainEqual({ type: 'reset' })
    expect(fake.pendingLoads().length).toBeGreaterThan(0)
    source.dispose()
  })

  it('core.L0.datasource-windowed-dispose: closes subscription, aborts in-flight, ignores late arrivals, idempotent', async () => {
    const fake = createFakeWindowedProvider()
    const source = new WindowedDataSource({ schema, rowCount: 1000, provider: fake.provider })
    const events: DataSourceEvent[] = []
    source.subscribe((e) => events.push(e))

    source.hintWindow({ startRow: 0, endRow: 9, startCol: 0, endCol: 1 })
    const [load] = fake.pendingLoads()

    source.dispose()
    expect(fake.closeCalls).toBe(1)
    expect(load!.signal.aborted).toBe(true)

    load!.resolve({ rows: rowsFor(load!.window, 'late') })
    await flush()
    expect(events).toEqual([])
    expect(source.getCell(0, 'name')).toBeUndefined()

    expect(() => source.dispose()).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `bun test packages/core/tests/acceptance/functional/data-ops/windowed-bdd.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 3: Flip scenario status from draft to implemented**

In each of the 8 files under `packages/core/tests/acceptance/functional/data-ops/scenarios/L0-datasource-windowed-*.md`, change the frontmatter line:

```yaml
status: draft
```
to:
```yaml
status: implemented
```

- [ ] **Step 4: Validate and sync the manifest**

Run: `bun run --filter @novasheet/core lint:mbd`
Expected: `mbd validate: <N> scenario(s) ok`

Run: `bun run --filter @novasheet/core manifest:mbd`
Expected: writes `tests/acceptance/scenarios.manifest.json` and `tests/acceptance/SCENARIOS.md`

- [ ] **Step 5: Update the acceptance README's test-file table**

In `packages/core/tests/acceptance/README.md`, add a row to the "测试文件职责" table (after the `functional/data-ops/bdd.test.ts` row):

```markdown
| [`functional/data-ops/windowed-bdd.test.ts`](./functional/data-ops/windowed-bdd.test.ts) | 8 | L0 | `WindowedDataSource`：骨架优先、overscan 预取、推送更新、订阅跟随、SWR 新鲜度、epoch 收缩、resync、dispose |
```

Also bump the "当前 N 条场景" count in the section heading above the table to match the new total (read the current number from the heading text and add 8).

- [ ] **Step 6: Run full core test suite and lint**

Run: `bun test packages/core`
Expected: all pass, no regressions

Run: `bun run --filter @novasheet/core lint`
Expected: 0 errors/warnings

- [ ] **Step 7: Commit**

```bash
git add packages/core/tests/acceptance/functional/data-ops/windowed-bdd.test.ts packages/core/tests/acceptance/functional/data-ops/scenarios/L0-datasource-windowed-*.md packages/core/tests/acceptance/scenarios.manifest.json packages/core/tests/acceptance/SCENARIOS.md packages/core/tests/acceptance/README.md
git commit -m "$(cat <<'EOF'
test(core): WindowedDataSource 8 条 BDD 场景转绿，status draft → implemented

外环行为测试落地（骨架优先/预取/推送/订阅跟随/SWR/epoch 收缩/resync/
dispose），mbd validate + manifest 同步，README 场景表更新。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `hintWindow` decorator forwarding + `DefaultGridEngine` wiring

**Files:**
- Modify: `packages/core/src/features/view/SortLayer.ts`
- Modify: `packages/core/src/features/view/FilterLayer.ts`
- Modify: `packages/core/src/features/view/HideRowsLayer.ts`
- Modify: `packages/core/src/kernel/data/VisibleColumnsDataSource.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`
- Test: `packages/core/tests/features/view/SortLayer.hintWindow.test.ts`
- Test: `packages/core/tests/features/view/FilterLayer.hintWindow.test.ts`
- Test: `packages/core/tests/features/view/HideRowsLayer.hintWindow.test.ts`
- Test: `packages/core/tests/kernel/data/VisibleColumnsDataSource.hintWindow.test.ts`
- Test: `packages/core/tests/engine/DefaultGridEngine.hintWindow.test.ts`

**Interfaces:**
- Consumes: `DataWindow`, `hintWindow?` (Task 1); each file's existing wrapper class and its existing `resolveUnderlyingRow`.
- Produces: no new public API — pure internal forwarding so that a `WindowedDataSource` placed under any combination of these decorators still receives (a conservative envelope of) the real view window.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/core/tests/features/view/SortLayer.hintWindow.test.ts
import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../../src/kernel/data/InMemoryDataSource'
import { SortLayer } from '../../../src/features/view/SortLayer'
import type { DataWindow } from '../../../src/kernel/data/DataSource'
import type { Row, Schema } from '../../../src/kernel/data/Schema'

const schema: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 100 },
    { id: 'score', name: 'Score', type: 'number', width: 80 },
  ],
}

function makeUpstreamWithHint(rows: Row[]): { data: InMemoryDataSource; hints: DataWindow[] } {
  const data = new InMemoryDataSource({ schema, rows })
  const hints: DataWindow[] = []
  ;(data as unknown as { hintWindow: (w: DataWindow) => void }).hintWindow = (w) => hints.push(w)
  return { data, hints }
}

describe('SortLayer hintWindow forwarding', () => {
  it('forwards an identity window unchanged when no sort is active', () => {
    const { data, hints } = makeUpstreamWithHint([
      { name: 'b', score: 2 },
      { name: 'a', score: 1 },
      { name: 'c', score: 3 },
    ])
    const layer = new SortLayer()
    const wrapped = layer.wrap(data)

    wrapped.hintWindow?.({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 })
    expect(hints).toEqual([{ startRow: 0, endRow: 1, startCol: 0, endCol: 1 }])
  })

  it('translates a view window to a conservative raw envelope when sorted', () => {
    const { data, hints } = makeUpstreamWithHint([
      { name: 'c', score: 3 },
      { name: 'a', score: 1 },
      { name: 'b', score: 2 },
    ])
    const layer = new SortLayer()
    const wrapped = layer.wrap(data)
    layer.setSpec({ fieldId: 'score', direction: 'asc' }) // view order becomes raw rows [1, 2, 0]

    wrapped.hintWindow?.({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 }) // view rows 0..1 → raw rows {1, 2}
    expect(hints).toEqual([{ startRow: 1, endRow: 2, startCol: 0, endCol: 1 }])
  })
})
```

```ts
// packages/core/tests/features/view/FilterLayer.hintWindow.test.ts
import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../../src/kernel/data/InMemoryDataSource'
import { FilterLayer } from '../../../src/features/view/FilterLayer'
import type { DataWindow } from '../../../src/kernel/data/DataSource'
import type { Row, Schema } from '../../../src/kernel/data/Schema'

const schema: Schema = {
  fields: [{ id: 'name', name: 'Name', type: 'text', width: 100 }],
}

describe('FilterLayer hintWindow forwarding', () => {
  it('translates a view window to the raw envelope of the surviving rows', () => {
    const data = new InMemoryDataSource({
      schema,
      rows: [{ name: 'alpha' }, { name: 'skip' }, { name: 'alpine' }, { name: 'skip' }] satisfies Row[],
    })
    const hints: DataWindow[] = []
    ;(data as unknown as { hintWindow: (w: DataWindow) => void }).hintWindow = (w) => hints.push(w)

    const layer = new FilterLayer()
    const wrapped = layer.wrap(data)
    layer.setSpec({ fieldId: 'name', op: { kind: 'text-contains', value: 'alp', caseSensitive: false } })
    // surviving raw rows: 0 ('alpha'), 2 ('alpine') → view rows [0, 1]

    wrapped.hintWindow?.({ startRow: 0, endRow: 1, startCol: 0, endCol: 0 })
    expect(hints).toEqual([{ startRow: 0, endRow: 2, startCol: 0, endCol: 0 }])
  })
})
```

```ts
// packages/core/tests/features/view/HideRowsLayer.hintWindow.test.ts
import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../../src/kernel/data/InMemoryDataSource'
import { HideRowsLayer } from '../../../src/features/view/HideRowsLayer'
import type { DataWindow } from '../../../src/kernel/data/DataSource'
import type { Row, Schema } from '../../../src/kernel/data/Schema'

const schema: Schema = { fields: [{ id: 'n', name: 'N', type: 'number', width: 60 }] }

describe('HideRowsLayer hintWindow forwarding', () => {
  it('translates a view window to the raw envelope skipping hidden rows', () => {
    const data = new InMemoryDataSource({
      schema,
      rows: [{ n: 0 }, { n: 1 }, { n: 2 }, { n: 3 }] satisfies Row[],
    })
    const hints: DataWindow[] = []
    ;(data as unknown as { hintWindow: (w: DataWindow) => void }).hintWindow = (w) => hints.push(w)

    const layer = new HideRowsLayer()
    const wrapped = layer.wrap(data)
    layer.setHidden([1]) // raw row 1 hidden → view rows map to raw [0, 2, 3]

    wrapped.hintWindow?.({ startRow: 0, endRow: 1, startCol: 0, endCol: 0 }) // view rows 0..1 → raw {0, 2}
    expect(hints).toEqual([{ startRow: 0, endRow: 2, startCol: 0, endCol: 0 }])
  })
})
```

```ts
// packages/core/tests/kernel/data/VisibleColumnsDataSource.hintWindow.test.ts
import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../../src/kernel/data/InMemoryDataSource'
import { VisibleColumnsDataSource } from '../../../src/kernel/data/VisibleColumnsDataSource'
import type { DataWindow } from '../../../src/kernel/data/DataSource'
import type { Row, Schema } from '../../../src/kernel/data/Schema'

const schema: Schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text', width: 60 },
    { id: 'b', name: 'B', type: 'text', width: 60 },
    { id: 'c', name: 'C', type: 'text', width: 60 },
  ],
}

describe('VisibleColumnsDataSource hintWindow forwarding', () => {
  it('translates a view column window to the raw column envelope skipping hidden columns', () => {
    const data = new InMemoryDataSource({ schema, rows: [{ a: '1', b: '2', c: '3' }] satisfies Row[] })
    const hints: DataWindow[] = []
    ;(data as unknown as { hintWindow: (w: DataWindow) => void }).hintWindow = (w) => hints.push(w)

    const wrapped = new VisibleColumnsDataSource(data, () => new Set(['b'])) // hide column b (raw index 1)
    // visible schema is [a, c]; view col 1 (c) maps to raw col 2
    wrapped.hintWindow?.({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 })
    expect(hints).toEqual([{ startRow: 0, endRow: 0, startCol: 0, endCol: 2 }])
  })

  it('forwards identity when no columns are hidden', () => {
    const data = new InMemoryDataSource({ schema, rows: [{ a: '1', b: '2', c: '3' }] satisfies Row[] })
    const hints: DataWindow[] = []
    ;(data as unknown as { hintWindow: (w: DataWindow) => void }).hintWindow = (w) => hints.push(w)

    const wrapped = new VisibleColumnsDataSource(data, () => new Set())
    wrapped.hintWindow?.({ startRow: 0, endRow: 0, startCol: 0, endCol: 2 })
    expect(hints).toEqual([{ startRow: 0, endRow: 0, startCol: 0, endCol: 2 }])
  })
})
```

```ts
// packages/core/tests/engine/DefaultGridEngine.hintWindow.test.ts
import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import { InMemoryDataSource } from '../../src/kernel/data/InMemoryDataSource'
import type { DataWindow } from '../../src/kernel/data/DataSource'
import type { Row, Schema } from '../../src/kernel/data/Schema'

const schema: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 100 },
    { id: 'score', name: 'Score', type: 'number', width: 80 },
  ],
}

describe('DefaultGridEngine hintWindow wiring', () => {
  it('getFrame() calls data.hintWindow with the main region row/col range', () => {
    const data = new InMemoryDataSource({
      schema,
      rows: Array.from({ length: 100 }, (_, i) => ({ name: `n${i}`, score: i })) satisfies Row[],
    })
    const hints: DataWindow[] = []
    ;(data as unknown as { hintWindow: (w: DataWindow) => void }).hintWindow = (w) => hints.push(w)

    const engine = new DefaultGridEngine({ data })
    engine.getFrame()

    expect(hints).toHaveLength(1)
    expect(hints[0]).toEqual(
      expect.objectContaining({ startRow: expect.any(Number), endRow: expect.any(Number) }),
    )
  })

  it('does nothing (no throw) when the data source does not implement hintWindow', () => {
    const data = new InMemoryDataSource({
      schema,
      rows: [{ name: 'a', score: 1 }] satisfies Row[],
    })
    const engine = new DefaultGridEngine({ data })
    expect(() => engine.getFrame()).not.toThrow()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bun test packages/core/tests/features/view/SortLayer.hintWindow.test.ts packages/core/tests/features/view/FilterLayer.hintWindow.test.ts packages/core/tests/features/view/HideRowsLayer.hintWindow.test.ts packages/core/tests/kernel/data/VisibleColumnsDataSource.hintWindow.test.ts packages/core/tests/engine/DefaultGridEngine.hintWindow.test.ts`
Expected: FAIL — none of the wrapper classes forward `hintWindow` yet; `hints` stays empty in every test.

- [ ] **Step 3: Add `hintWindow` to `SortedDataSource` (`SortLayer.ts`)**

In `packages/core/src/features/view/SortLayer.ts`, add this method to the `SortedDataSource` class (near `resolveUnderlyingRow`):

```ts
  hintWindow(window: import('../../kernel/data/DataSource').DataWindow): void {
    if (!this.upstream.hintWindow) return
    let minRaw = Infinity
    let maxRaw = -Infinity
    for (let viewRow = window.startRow; viewRow <= window.endRow; viewRow += 1) {
      const upstreamRow = this.order[viewRow]
      if (upstreamRow == null) continue
      const raw = this.upstream.resolveUnderlyingRow?.(upstreamRow) ?? upstreamRow
      if (raw < minRaw) minRaw = raw
      if (raw > maxRaw) maxRaw = raw
    }
    if (minRaw > maxRaw) return
    this.upstream.hintWindow({
      startRow: minRaw,
      endRow: maxRaw,
      startCol: window.startCol,
      endCol: window.endCol,
    })
  }
```

- [ ] **Step 4: Add `hintWindow` to `FilteredDataSource` (`FilterLayer.ts`)**

`FilteredDataSource` (from line 129 of `FilterLayer.ts`) uses the identical field name to `SortedDataSource`: `private order: number[] = []` (view row → upstream row). Add this method to the class (near its `resolveUnderlyingRow`):

```ts
  hintWindow(window: import('../../kernel/data/DataSource').DataWindow): void {
    if (!this.upstream.hintWindow) return
    let minRaw = Infinity
    let maxRaw = -Infinity
    for (let viewRow = window.startRow; viewRow <= window.endRow; viewRow += 1) {
      const upstreamRow = this.order[viewRow]
      if (upstreamRow == null) continue
      const raw = this.upstream.resolveUnderlyingRow?.(upstreamRow) ?? upstreamRow
      if (raw < minRaw) minRaw = raw
      if (raw > maxRaw) maxRaw = raw
    }
    if (minRaw > maxRaw) return
    this.upstream.hintWindow({
      startRow: minRaw,
      endRow: maxRaw,
      startCol: window.startCol,
      endCol: window.endCol,
    })
  }
```

- [ ] **Step 5: Add `hintWindow` to `HiddenDataSource` (`HideRowsLayer.ts`)**

In `packages/core/src/features/view/HideRowsLayer.ts`, add to the `HiddenDataSource` class (near `resolveUnderlyingRow`):

```ts
  hintWindow(window: import('../../kernel/data/DataSource').DataWindow): void {
    if (!this.upstream.hintWindow) return
    const visibleRows = this.layer.getVisibleRows()
    let minRaw = Infinity
    let maxRaw = -Infinity
    for (let viewRow = window.startRow; viewRow <= window.endRow; viewRow += 1) {
      const upstreamRow = visibleRows[viewRow]
      if (upstreamRow == null) continue
      const raw = this.upstream.resolveUnderlyingRow?.(upstreamRow) ?? upstreamRow
      if (raw < minRaw) minRaw = raw
      if (raw > maxRaw) maxRaw = raw
    }
    if (minRaw > maxRaw) return
    this.upstream.hintWindow({
      startRow: minRaw,
      endRow: maxRaw,
      startCol: window.startCol,
      endCol: window.endCol,
    })
  }
```

- [ ] **Step 6: Add `hintWindow` to `VisibleColumnsDataSource.ts`**

In `packages/core/src/kernel/data/VisibleColumnsDataSource.ts`, add (near `findViewRow`):

```ts
  hintWindow(window: DataWindow): void {
    if (!this.upstream.hintWindow) return
    const visibleFields = this.getSchema().fields // already filtered by hidden id set
    const startField = visibleFields[window.startCol]
    const endField = visibleFields[window.endCol]
    if (!startField || !endField) return
    const upstreamFields = this.upstream.getSchema().fields
    const startCol = upstreamFields.findIndex((f) => f.id === startField.id)
    const endCol = upstreamFields.findIndex((f) => f.id === endField.id)
    if (startCol < 0 || endCol < 0) return
    this.upstream.hintWindow({
      startRow: window.startRow,
      endRow: window.endRow,
      startCol,
      endCol,
    })
  }
```

Add the import at the top of the file: `import type { DataWindow } from './DataSource'` (extend the existing `import type { DataSource, DataSourceEvent, DataSourceListener } from './DataSource'` line to include `DataWindow`).

- [ ] **Step 7: Wire `DefaultGridEngine.getFrame()` to call `hintWindow`**

In `packages/core/src/engine/DefaultGridEngine.ts`, modify the `getFrame()` method (around line 549) to call `hintWindow` on the assembled frame's main region before returning:

```ts
  getFrame(): RenderFrame {
    const frame = assembleRenderFrame({
      data: this.data,
      theme: this.theme,
      rowsAxis: this.layout.getRowsAxis(),
      colsAxis: this.layout.getColsAxis(),
      viewport: this.layout.getViewport().snapshot(),
      selection: this.selection.getSelection(),
      cellEdit: this.editController.getSession() ?? undefined,
      allRowGaps: this.rowStructure.getCollapsedGaps(),
      allColGaps: this.columnStructure.getCollapsedColGaps(),
      frameFormat: this.frameFormat,
      formatters: this.formatters,
      locale: this.locale,
      viewRowToRaw: (viewRow) => this.coords.viewRowToRaw(viewRow),
      viewColToRaw: (viewCol) => this.coords.viewColToRaw(viewCol),
      resolveRawCellType: (row, col, field) => this.cellTypeStore.resolve(row, col, field),
      hasRawCellTypeOverride: (row, col) => this.cellTypeStore.get(row, col) !== undefined,
      attachmentStore: this.formatState.attachmentStore,
      getRawValidationState: (rawRow, rawCol) => {
        const s = this.validationResultStore.get(rawRow, rawCol)
        if (!s) return 'ok'
        return s.status
      },
      hoveredColumnHeaderMenu: this.hoveredColumnHeaderMenu ?? undefined,
    })
    const main = frame.viewport.regions.find((region) => region.id === 'main')
    if (main && main.rowRange[1] >= main.rowRange[0] && main.colRange[1] >= main.colRange[0]) {
      this.data.hintWindow?.({
        startRow: main.rowRange[0],
        endRow: main.rowRange[1],
        startCol: main.colRange[0],
        endCol: main.colRange[1],
      })
    }
    return frame
  }
```

(This replaces the existing `return assembleRenderFrame({...})` single-expression form with an assignment + hint call + explicit return — same assembly arguments, unchanged.)

- [ ] **Step 8: Run tests to verify they pass**

Run: `bun test packages/core/tests/features/view/SortLayer.hintWindow.test.ts packages/core/tests/features/view/FilterLayer.hintWindow.test.ts packages/core/tests/features/view/HideRowsLayer.hintWindow.test.ts packages/core/tests/kernel/data/VisibleColumnsDataSource.hintWindow.test.ts packages/core/tests/engine/DefaultGridEngine.hintWindow.test.ts`
Expected: PASS (all tests)

- [ ] **Step 9: Run the full core suite, typecheck, lint, build**

Run: `bun test packages/core`
Expected: all pass

Run: `bun run --filter '*' typecheck`
Expected: no errors

Run: `bun run lint`
Expected: 0 errors/warnings

Run: `bun run --filter @novasheet/core build && bun run --filter @novasheet/canvas2d build`
Expected: both build successfully

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/features/view/SortLayer.ts packages/core/src/features/view/FilterLayer.ts packages/core/src/features/view/HideRowsLayer.ts packages/core/src/kernel/data/VisibleColumnsDataSource.ts packages/core/src/engine/DefaultGridEngine.ts packages/core/tests/features/view/SortLayer.hintWindow.test.ts packages/core/tests/features/view/FilterLayer.hintWindow.test.ts packages/core/tests/features/view/HideRowsLayer.hintWindow.test.ts packages/core/tests/kernel/data/VisibleColumnsDataSource.hintWindow.test.ts packages/core/tests/engine/DefaultGridEngine.hintWindow.test.ts
git commit -m "$(cat <<'EOF'
feat(core): hintWindow 经 Sort/Filter/HideRows/VisibleColumns 装饰链转发

四层 view 装饰器向下转发 hintWindow，做 view→raw 包络翻译（min/max 保守
外扩，无重排时恒等透传）；DefaultGridEngine.getFrame() 每帧用 main region
行列区间调用 data.hintWindow?.()。排序/筛选 × 远程源组合本期不支持，
包络翻译只保证语义不错、按需多拉，不改变现有渲染路径。

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Post-plan verification

After Task 8's commit, run the full CLAUDE.md-mandated gate before this branch is considered ready:

```bash
bun test
bun run --filter '*' typecheck
bun run lint
bun run --filter @novasheet/core build && bun run --filter @novasheet/canvas2d build
```

All four must pass. Then proceed to `superpowers:finishing-a-development-branch` (verify, push, tag) per the repo's Superpowers pipeline — do not skip self-review even though every task already ran tests/typecheck/lint incrementally; a milestone-level review (spec re-read + diff read) is still expected per CLAUDE.md's "不跳过 self-review（plan + spec）；里程碑收尾 dispatch code-reviewer".
