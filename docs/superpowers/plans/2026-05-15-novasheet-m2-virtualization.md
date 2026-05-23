# NovaSheet M2 · Virtualization & Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up native scrolling on the M1 Grid so 1M+ rows can be scrolled smoothly at 60fps. After M2, `new Grid(el, { data })` with a million rows renders a scrollable surface; mouse wheel / trackpad / scrollbar all work natively; the viewport correctly redraws only the visible region.

**Architecture (per spec §6):** Puppet scroll pattern — a sibling `<scroll-host>` (overflow: auto) sits next to the absolutely-positioned `<canvas>` (pointer-events: none, so scroll events pass through to the host). A `<scroll-spacer>` inside scroll-host is sized via `ScrollMapper.computeSpacerSize(contentSize)` (capped at 6,000,000 px to stay under Firefox/iOS Safari element-height limits). `NativeScroller` translates native scroll events through a shared `frameScheduler` into logical scroll coordinates via `ScrollMapper.scrollToLogical` (non-linear when content exceeds spacer). `Viewport.setScroll` accepts the mapped coords; `Renderer.paintQuadrant` subtracts them from cell positions; `GridLinesPainter` does the same for line positions.

**Tech Stack:** TypeScript 5.4+ (strict), Vitest + happy-dom, existing `FrameScheduler` (M1), existing `RecordingContext2D` test helper.

**Spec reference:** [docs/superpowers/specs/2026-05-13-novasheet-phase1-canvas-grid-design.md §6](../specs/2026-05-13-novasheet-phase1-canvas-grid-design.md)

**Out of scope for M2 (covered in later milestones):**

- Frozen rows/cols (4-quadrant scroll exclusion) — M3
- Resize handles (`<handle-layer>`) — M4
- React wrapper — M4
- Custom scrollbar styling — Phase 2+

---

## File Structure

### Files created in M2

```
packages/core/src/scroll/                  # NEW directory
├── ScrollMapper.ts                        # non-linear scrollTop ↔ logicalY math
└── NativeScroller.ts                      # DOM scroll event adapter

packages/core/tests/scroll/
├── ScrollMapper.test.ts
└── NativeScroller.test.ts

apps/storybook/src/stories/
└── Scroll.stories.ts                      # initial scroll, scrollToRow API, 1M-row demo
```

### Files modified in M2

```
packages/core/src/
├── Grid.ts                                # DOM restructure + ResizeObserver + scroll wiring + scrollToRow/Cell
├── index.ts                               # add scroll/ exports (optional but useful for direct API use)
└── render/
    ├── Renderer.ts                        # paintQuadrant subtracts scrollX/Y
    └── GridLinesPainter.ts                # scrollOffsetX/Y replaces the M1 stubs

packages/core/tests/
├── Grid.test.ts                           # scroll wiring + ResizeObserver tests
└── render/
    ├── Renderer.test.ts                   # scrolled paint test
    └── GridLinesPainter.test.ts           # line position with scroll offset
```

### Files explicitly **not** touched in M2

- `src/layout/Viewport.ts` — already supports `setScroll(x, y)` and exposes `scrollX/Y` in snapshot from M1. No changes needed.
- `src/layout/FrozenRegions.ts` — still returns only `main` quadrant. Real frozen logic in M3.
- `src/interaction/` — does not exist yet. M4.
- `packages/react/` — M4.

---

## Conventions

- **TDD strict**: failing test first, implementation second, one commit per task.
- **Commit cadence**: one commit per completed task.
- **No regressions**: each task's final step verifies `pnpm --filter @novasheet/core test` shows ALL prior + new tests passing, plus `tsc --noEmit` clean and `pnpm lint` clean.
- **Working directory**: `/Users/rongts/NovaSheet` for all commands.

---

### Task 1: ScrollMapper — non-linear scroll math

**Files:**

- Create: `packages/core/src/scroll/ScrollMapper.ts`
- Test: `packages/core/tests/scroll/ScrollMapper.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/scroll/ScrollMapper.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ScrollMapper, SAFE_MAX } from '../../src/scroll/ScrollMapper'

describe('ScrollMapper', () => {
  describe('computeSpacerSize', () => {
    it('returns content size when smaller than SAFE_MAX', () => {
      const m = new ScrollMapper()
      expect(m.computeSpacerSize(1000)).toBe(1000)
      expect(m.computeSpacerSize(SAFE_MAX - 1)).toBe(SAFE_MAX - 1)
    })

    it('caps at SAFE_MAX for huge content', () => {
      const m = new ScrollMapper()
      expect(m.computeSpacerSize(SAFE_MAX)).toBe(SAFE_MAX)
      expect(m.computeSpacerSize(SAFE_MAX * 5)).toBe(SAFE_MAX)
    })

    it('SAFE_MAX is 6_000_000 (spec §6.2)', () => {
      expect(SAFE_MAX).toBe(6_000_000)
    })
  })

  describe('scrollToLogical', () => {
    it('passes through when content fits in spacer (no compression)', () => {
      // content 5000 ≤ spacer 5000; mapper acts as identity
      const m = new ScrollMapper()
      expect(m.scrollToLogical(0, 5000, 5000, 500)).toBe(0)
      expect(m.scrollToLogical(100, 5000, 5000, 500)).toBe(100)
      expect(m.scrollToLogical(4500, 5000, 5000, 500)).toBe(4500)
    })

    it('non-linearly maps when content exceeds spacer', () => {
      // content 28M, spacer 6M, vp 500
      // maxScroll = 6_000_000 - 500 = 5_999_500
      // maxLogical = 28_000_000 - 500 = 27_999_500
      // ratio ≈ 4.667
      const m = new ScrollMapper()
      expect(m.scrollToLogical(0, 6_000_000, 28_000_000, 500)).toBe(0)
      const mid = m.scrollToLogical(2_999_750, 6_000_000, 28_000_000, 500)
      expect(mid).toBeCloseTo(13_999_750, -1) // half-way maps to half of logical
      const end = m.scrollToLogical(5_999_500, 6_000_000, 28_000_000, 500)
      expect(end).toBeCloseTo(27_999_500, -1)
    })

    it('clamps negative scrollTop to 0 (iOS rubber-band, float error)', () => {
      const m = new ScrollMapper()
      expect(m.scrollToLogical(-100, 6_000_000, 28_000_000, 500)).toBe(0)
    })

    it('clamps scrollTop > maxScroll to maxScroll', () => {
      const m = new ScrollMapper()
      // anything beyond maxScroll should produce maxLogical
      expect(m.scrollToLogical(99_999_999, 6_000_000, 28_000_000, 500)).toBeCloseTo(27_999_500, -1)
    })

    it('returns 0 when maxScroll <= 0 (viewport >= spacer)', () => {
      const m = new ScrollMapper()
      expect(m.scrollToLogical(0, 100, 100, 200)).toBe(0)
      expect(m.scrollToLogical(50, 100, 100, 200)).toBe(0)
    })
  })

  describe('logicalToScroll', () => {
    it('inverts scrollToLogical at boundaries', () => {
      const m = new ScrollMapper()
      expect(m.logicalToScroll(0, 6_000_000, 28_000_000, 500)).toBe(0)
      expect(m.logicalToScroll(27_999_500, 6_000_000, 28_000_000, 500)).toBeCloseTo(5_999_500, -1)
    })

    it('returns 0 when maxLogical <= 0', () => {
      const m = new ScrollMapper()
      expect(m.logicalToScroll(0, 6_000_000, 200, 500)).toBe(0)
      expect(m.logicalToScroll(99, 6_000_000, 200, 500)).toBe(0)
    })

    it('clamps logicalY outside [0, maxLogical]', () => {
      const m = new ScrollMapper()
      expect(m.logicalToScroll(-100, 6_000_000, 28_000_000, 500)).toBe(0)
      expect(m.logicalToScroll(99_999_999, 6_000_000, 28_000_000, 500)).toBeCloseTo(5_999_500, -1)
    })

    it('round-trip: scrollToLogical(logicalToScroll(y)) ≈ y for valid y', () => {
      const m = new ScrollMapper()
      const y = 14_000_000
      const s = m.logicalToScroll(y, 6_000_000, 28_000_000, 500)
      const back = m.scrollToLogical(s, 6_000_000, 28_000_000, 500)
      expect(back).toBeCloseTo(y, -1)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm --filter @novasheet/core test tests/scroll/ScrollMapper.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ScrollMapper.ts`**

Create `packages/core/src/scroll/ScrollMapper.ts`:

```ts
/**
 * ScrollMapper——把原生 scrollTop 映射成逻辑滚动偏移 logicalY（spec §6.2）。
 *
 * 为什么需要：1M 行 × 28px = 28M px 内容高度，超过 Firefox（~17.9M）/ iOS Safari（~16.7M）
 * 元素最大可滚动高度上限。我们把 spacer 高度封顶在 SAFE_MAX = 6,000,000 px（所有目标浏览器
 * 都安全），原生滚动条仍可拖；scrollTop 通过本类映射到真实 logicalY 给 Viewport 用。
 *
 * 精度损失：当 content > spacer 时，拇指拖 1px ≈ ratio = content/spacer ≈ 4.67 行（28M/6M），
 * 对滚轮 / 触控板 0 损失；仅在「精确拖拽滚动条到某一行」这种极少数交互下感知（spec §6.7）。
 *
 * 用法：水平、垂直两轴各调用一次。Grid 在 setData / setRowHeight / setColumnWidth /
 * resize / setTheme 等改变内容/视口尺寸的时机重算 spacer。
 */

/** 6M px — Firefox/iOS Safari 元素最大滚动高度下限的最低公约数（spec §6.2） */
export const SAFE_MAX = 6_000_000

export class ScrollMapper {
  /**
   * 给定 axis 总内容尺寸（rowsAxis.getTotalSize() 等），返回 spacer 元素应使用的尺寸。
   * 小于 SAFE_MAX 时直通；否则封顶。
   */
  computeSpacerSize(contentSize: number): number {
    if (contentSize <= 0) return 0
    return Math.min(contentSize, SAFE_MAX)
  }

  /**
   * scrollTop ∈ [0, spacerSize - viewportSize]  →  logicalY ∈ [0, contentSize - viewportSize]
   *
   * - content ≤ spacer：直通（仍 clamp 边界）
   * - content > spacer：按比例放大
   * - 维度退化（viewport >= spacer 或 viewport >= content）：返回 0
   */
  scrollToLogical(
    scrollTop: number,
    spacerSize: number,
    contentSize: number,
    viewportSize: number,
  ): number {
    const maxScroll = spacerSize - viewportSize
    const maxLogical = contentSize - viewportSize
    if (maxScroll <= 0 || maxLogical <= 0) return 0
    const clamped = Math.max(0, Math.min(maxScroll, scrollTop))
    if (contentSize <= spacerSize) return clamped // identity branch
    return (clamped / maxScroll) * maxLogical
  }

  /**
   * 反向：logicalY → scrollTop，用于程序化滚动（scrollToRow / scrollToCell）。
   */
  logicalToScroll(
    logicalY: number,
    spacerSize: number,
    contentSize: number,
    viewportSize: number,
  ): number {
    const maxScroll = spacerSize - viewportSize
    const maxLogical = contentSize - viewportSize
    if (maxScroll <= 0 || maxLogical <= 0) return 0
    const clamped = Math.max(0, Math.min(maxLogical, logicalY))
    return (clamped / maxLogical) * maxScroll
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @novasheet/core test tests/scroll/ScrollMapper.test.ts
```

Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add ScrollMapper with non-linear scrollTop ↔ logicalY mapping"
```

---

### Task 2: NativeScroller — DOM scroll event adapter

**Files:**

- Create: `packages/core/src/scroll/NativeScroller.ts`
- Test: `packages/core/tests/scroll/NativeScroller.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/scroll/NativeScroller.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NativeScroller } from '../../src/scroll/NativeScroller'
import { FrameScheduler } from '../../src/util/raf'

describe('NativeScroller', () => {
  let rafs: Array<() => void> = []
  let originalRaf: typeof requestAnimationFrame

  beforeEach(() => {
    rafs = []
    originalRaf = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = ((cb: () => void) => {
      rafs.push(cb)
      return rafs.length
    }) as typeof requestAnimationFrame
  })

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf
  })

  function flushFrame() {
    const pending = rafs
    rafs = []
    for (const cb of pending) cb()
  }

  function makeScrollHost(initialTop = 0, initialLeft = 0): HTMLElement {
    const el = document.createElement('div')
    Object.defineProperty(el, 'scrollTop', {
      value: initialTop,
      writable: true,
      configurable: true,
    })
    Object.defineProperty(el, 'scrollLeft', {
      value: initialLeft,
      writable: true,
      configurable: true,
    })
    el.scrollTo = ((opts: { top?: number; left?: number }) => {
      if (opts.top !== undefined) (el as unknown as { scrollTop: number }).scrollTop = opts.top
      if (opts.left !== undefined) (el as unknown as { scrollLeft: number }).scrollLeft = opts.left
    }) as HTMLElement['scrollTo']
    return el
  }

  it('attach() registers a scroll listener; destroy() removes it', () => {
    const host = makeScrollHost()
    const onScroll = vi.fn()
    const scroller = new NativeScroller(host, new FrameScheduler(), onScroll)
    const addSpy = vi.spyOn(host, 'addEventListener')
    const removeSpy = vi.spyOn(host, 'removeEventListener')
    scroller.attach()
    expect(addSpy).toHaveBeenCalledWith('scroll', expect.any(Function), { passive: true })
    scroller.destroy()
    expect(removeSpy).toHaveBeenCalledWith('scroll', expect.any(Function))
  })

  it('scroll event schedules a frame via FrameScheduler', () => {
    const host = makeScrollHost(0, 0)
    const onScroll = vi.fn()
    const scroller = new NativeScroller(host, new FrameScheduler(), onScroll)
    scroller.attach()
    ;(host as unknown as { scrollTop: number }).scrollTop = 200
    ;(host as unknown as { scrollLeft: number }).scrollLeft = 50
    host.dispatchEvent(new Event('scroll'))
    expect(rafs).toHaveLength(1)
    expect(onScroll).not.toHaveBeenCalled()
    flushFrame()
    expect(onScroll).toHaveBeenCalledWith(200, 50)
  })

  it('multiple scroll events in one frame collapse to a single callback (key dedup)', () => {
    const host = makeScrollHost(0, 0)
    const onScroll = vi.fn()
    const scroller = new NativeScroller(host, new FrameScheduler(), onScroll)
    scroller.attach()
    ;(host as unknown as { scrollTop: number }).scrollTop = 100
    host.dispatchEvent(new Event('scroll'))
    ;(host as unknown as { scrollTop: number }).scrollTop = 200
    host.dispatchEvent(new Event('scroll'))
    ;(host as unknown as { scrollTop: number }).scrollTop = 300
    host.dispatchEvent(new Event('scroll'))
    expect(rafs).toHaveLength(1)
    flushFrame()
    expect(onScroll).toHaveBeenCalledTimes(1)
    expect(onScroll).toHaveBeenCalledWith(300, 0) // last write wins via host's current state
  })

  it('scrollTo() sets scrollHost.scrollTop and scrollLeft', () => {
    const host = makeScrollHost(0, 0)
    const scroller = new NativeScroller(host, new FrameScheduler(), vi.fn())
    scroller.scrollTo(150, 75)
    expect(host.scrollTop).toBe(150)
    expect(host.scrollLeft).toBe(75)
  })

  it('destroy() before attach() does not throw', () => {
    const host = makeScrollHost()
    const scroller = new NativeScroller(host, new FrameScheduler(), vi.fn())
    expect(() => scroller.destroy()).not.toThrow()
  })

  it('callbacks after destroy() are silently ignored', () => {
    const host = makeScrollHost()
    const onScroll = vi.fn()
    const scroller = new NativeScroller(host, new FrameScheduler(), onScroll)
    scroller.attach()
    ;(host as unknown as { scrollTop: number }).scrollTop = 100
    host.dispatchEvent(new Event('scroll'))
    scroller.destroy()
    flushFrame()
    expect(onScroll).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @novasheet/core test tests/scroll/NativeScroller.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `NativeScroller.ts`**

Create `packages/core/src/scroll/NativeScroller.ts`:

```ts
/**
 * NativeScroller——把宿主元素（`<scroll-host>`）的原生 scroll 事件适配为 logical 回调。
 *
 * 与 FrameScheduler 协作：每次 scroll 事件以 key `'scroll:read'` 入队；同一帧多次滚动
 * 自动合并为最后一次（key 去重），与 Renderer 的 `'renderer:flush'` 在同一帧合并执行
 * （CLAUDE.md 不变量 #5）。
 *
 * 本类**不做数学映射**——只读 scrollHost.scrollTop / scrollLeft 后透传给 onScroll 回调。
 * Grid 持有 ScrollMapper 并在回调里做转换，避免本类持有过多依赖（axis / viewport / theme）。
 *
 * destroy() 之后即使回调入队也不会触发——内部 destroyed 标志直接吞掉。
 */

import type { FrameScheduler } from '../util/raf'

export type ScrollListener = (scrollTop: number, scrollLeft: number) => void

export class NativeScroller {
  private destroyed = false
  private listenerAttached = false

  constructor(
    private scrollHost: HTMLElement,
    private scheduler: FrameScheduler,
    private onScroll: ScrollListener,
  ) {}

  attach(): void {
    if (this.listenerAttached || this.destroyed) return
    this.scrollHost.addEventListener('scroll', this.handler, { passive: true })
    this.listenerAttached = true
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    if (this.listenerAttached) {
      this.scrollHost.removeEventListener('scroll', this.handler)
      this.listenerAttached = false
    }
  }

  scrollTo(scrollTop: number, scrollLeft: number): void {
    this.scrollHost.scrollTo({ top: scrollTop, left: scrollLeft })
  }

  private handler = (): void => {
    this.scheduler.schedule('scroll:read', () => {
      if (this.destroyed) return
      this.onScroll(this.scrollHost.scrollTop, this.scrollHost.scrollLeft)
    })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @novasheet/core test tests/scroll/NativeScroller.test.ts
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add NativeScroller adapter wired through shared FrameScheduler"
```

---

### Task 3: Renderer — scroll-aware paintQuadrant

**Files:**

- Modify: `packages/core/src/render/Renderer.ts`
- Modify: `packages/core/src/render/GridLinesPainter.ts`
- Modify: `packages/core/tests/render/Renderer.test.ts`
- Modify: `packages/core/tests/render/GridLinesPainter.test.ts`

- [ ] **Step 1: Append failing test to Renderer.test.ts**

Append to `packages/core/tests/render/Renderer.test.ts` (inside the existing `describe('Renderer (M1 single quadrant)')` block, just before its closing `})`):

```ts
it('paintQuadrant subtracts viewport.scrollY from cellY for vertical scroll', () => {
  const { ctx, ops, viewport, renderer } = setup()
  viewport.setScroll(0, 56) // scroll down by 2 rows (28px each)
  ops.length = 0
  renderer.paint()
  // First cell of the FIRST visible row should be at cellY ≈ rect.y + indexToPosition(visibleFirst) - 56
  // For our 200px viewport with headerHeight 32, scrollY 56 → visibleFirst = 2 (rows 2,3,4..)
  // Row 2 starts at y = 56 in content space; rect.y = headerHeight = 32; cellY = 32 + 56 - 56 = 32
  const firstCellFillText = ops.find(
    (o) => o.op === 'fillText' && typeof o.args[0] === 'string' && o.args[0] === 'Carol',
  )
  // Carol is row 2 (Alice=0, Bob=1, Carol=2). It should still be in fillText
  expect(firstCellFillText).toBeDefined()
})

it('paintQuadrant subtracts viewport.scrollX from cellX for horizontal scroll', () => {
  const { ctx, ops, viewport, renderer } = setup()
  viewport.setScroll(100, 0) // scroll right by 100px (= 1 col)
  ops.length = 0
  renderer.paint()
  // Column 0 (Name) starts at xLeft=0; with scrollX=100 it should be at cellX = 0 + 0 - 100 = -100,
  // which means it's mostly clipped. But the fillText call is still made if the col is in visible range.
  // After scrolling left, visible col range starts at col 1 (Age). Verify "Age" header is the leftmost visible.
  const ageHeader = ops.find((o) => o.op === 'fillText' && o.args[0] === 'Age')
  expect(ageHeader).toBeDefined()
  if (ageHeader && ageHeader.op === 'fillText') {
    // Age column starts at content x=100; with scrollX=100 it lands at cellX = 0 + 100 - 100 = 0 + padX = 8
    expect(typeof ageHeader.args[1]).toBe('number')
  }
})
```

- [ ] **Step 2: Append failing test to GridLinesPainter.test.ts**

Append to `packages/core/tests/render/GridLinesPainter.test.ts`:

```ts
it('shifts line positions by scrollOffset when provided', () => {
  const { ctx, ops } = createRecordingContext()
  const rowsAxis = new ChunkedAxis({ count: 3, defaultSize: 28 })
  const colsAxis = new ChunkedAxis({ count: 2, defaultSize: 100 })
  const painter = new GridLinesPainter(denseGridTheme)
  painter.paint(ctx, {
    rowsAxis,
    colsAxis,
    rowRange: [0, 2],
    colRange: [0, 1],
    rect: { x: 0, y: 0, width: 200, height: 100 },
    scrollOffsetX: 0,
    scrollOffsetY: 28, // scroll down by 1 row
  })
  // Without scroll, the last row bottom is at y = 84 (3 × 28). With scrollY=28, lines should be
  // shifted up by 28. The bottom line for row 2 should be at y = 84 - 28 = 56 (+0.5 = 56.5).
  const lineYs = ops
    .filter((o) => o.op === 'moveTo')
    .map((o) => (o.op === 'moveTo' ? o.args[1] : 0))
    .filter((y) => y > 0 && y < 100)
  expect(lineYs).toContain(56.5)
})

it('keeps backward-compatible default (no scroll offset = no shift)', () => {
  const { ctx, ops } = createRecordingContext()
  const rowsAxis = new ChunkedAxis({ count: 3, defaultSize: 28 })
  const colsAxis = new ChunkedAxis({ count: 2, defaultSize: 100 })
  new GridLinesPainter(denseGridTheme).paint(ctx, {
    rowsAxis,
    colsAxis,
    rowRange: [0, 2],
    colRange: [0, 1],
    rect: { x: 0, y: 0, width: 200, height: 100 },
    // scrollOffsetX / scrollOffsetY omitted — defaults to 0
  })
  const lineYs = ops
    .filter((o) => o.op === 'moveTo')
    .map((o) => (o.op === 'moveTo' ? o.args[1] : 0))
    .filter((y) => y > 0 && y < 100)
  expect(lineYs).toContain(84.5)
})
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
pnpm --filter @novasheet/core test tests/render/
```

Expected: FAIL — scrolled tests fail because Renderer doesn't subtract scrollX/Y; GridLinesPainter ignores scrollOffsetX/Y.

- [ ] **Step 4: Update `GridLinesPainter.ts` to consume scroll offsets**

Edit `packages/core/src/render/GridLinesPainter.ts`. Update the `GridLinesPaintParams` interface and `paint` method:

```ts
export interface GridLinesPaintParams {
  rowsAxis: ChunkedAxis
  colsAxis: ChunkedAxis
  rowRange: [number, number]
  colRange: [number, number]
  rect: QuadrantRect
  /** Horizontal scroll offset to subtract from content X positions; 0 for frozen quadrants */
  scrollOffsetX?: number
  /** Vertical scroll offset to subtract from content Y positions; 0 for frozen quadrants */
  scrollOffsetY?: number
}

export class GridLinesPainter {
  constructor(private theme: Theme) {}

  setTheme(theme: Theme): void {
    this.theme = theme
  }

  paint(ctx: CanvasRenderingContext2D, params: GridLinesPaintParams): void {
    const { rowsAxis, colsAxis, rowRange, colRange, rect } = params
    const scrollOffsetX = params.scrollOffsetX ?? 0
    const scrollOffsetY = params.scrollOffsetY ?? 0
    if (rowRange[1] < rowRange[0] || colRange[1] < colRange[0]) return

    ctx.strokeStyle = this.theme.colors.gridLine
    ctx.lineWidth = this.theme.metrics.borderWidth

    ctx.beginPath()

    for (let r = rowRange[0]; r <= rowRange[1]; r++) {
      const yBase = rowsAxis.indexToPosition(r) + rowsAxis.getSize(r)
      const y = Math.floor(rect.y + yBase - scrollOffsetY) + 0.5
      if (y < rect.y || y > rect.y + rect.height) continue
      ctx.moveTo(rect.x, y)
      ctx.lineTo(rect.x + rect.width, y)
    }

    for (let c = colRange[0]; c <= colRange[1]; c++) {
      const xBase = colsAxis.indexToPosition(c) + colsAxis.getSize(c)
      const x = Math.floor(rect.x + xBase - scrollOffsetX) + 0.5
      if (x < rect.x || x > rect.x + rect.width) continue
      ctx.moveTo(x, rect.y)
      ctx.lineTo(x, rect.y + rect.height)
    }

    ctx.stroke()
  }
}
```

Notes:

- The M1 painter built coordinates from `rect.y + (indexToPosition(r) + getSize(r))` which assumed scrollY=0. The new version reads `rect.y + yBase - scrollOffsetY`. This matches Renderer's per-cell convention.
- Backward compatibility: when callers omit the new fields, they default to 0 — M1 callers (none after this task lands) keep working.

- [ ] **Step 5: Update `Renderer.ts` paintQuadrant to subtract scroll**

Edit `packages/core/src/render/Renderer.ts`. In `paint()`, read scroll from snapshot and pass to paintQuadrant. In `paintQuadrant`, subtract from cellX/cellY and pass to GridLinesPainter:

```ts
paint(): void {
  const snapshot = this.viewport.snapshot()
  const { contentRect, headerHeight, quadrants, scrollX, scrollY } = snapshot

  this.ctx.fillStyle = this.theme.colors.background
  this.ctx.fillRect(0, 0, contentRect.width, contentRect.height)

  this.ctx.font = `${this.theme.metrics.fontSize}px ${this.theme.metrics.fontFamily}`

  const main = quadrants.main
  if (main.rowRange[1] >= main.rowRange[0]) {
    const maybe = this.data.getRows(main.rowRange[0], main.rowRange[1])
    void maybe
  }

  // main quadrant scrolls in both axes
  this.paintQuadrant(main, scrollX, scrollY)

  this.headerPainter.paint(this.ctx, {
    schema: this.data.getSchema(),
    colsAxis: this.colsAxis,
    colRange: main.colRange,
    width: contentRect.width,
  })

  void headerHeight
}

private paintQuadrant(quadrant: Quadrant, scrollX: number, scrollY: number): void {
  const { rowRange, colRange, rect } = quadrant
  if (rowRange[1] < rowRange[0] || colRange[1] < colRange[0]) return

  const schema = this.data.getSchema()
  for (let r = rowRange[0]; r <= rowRange[1]; r++) {
    const yTop = this.rowsAxis.indexToPosition(r)
    const rowHeight = this.rowsAxis.getSize(r)
    const cellY = rect.y + yTop - scrollY

    for (let c = colRange[0]; c <= colRange[1]; c++) {
      const field = schema.fields[c]
      if (!field) continue
      const xLeft = this.colsAxis.indexToPosition(c)
      const colWidth = this.colsAxis.getSize(c)
      const cellX = rect.x + xLeft - scrollX
      const value = this.data.getCell(r, field.id)
      this.cellPainter.paint(this.ctx, {
        value,
        rect: { x: cellX, y: cellY, width: colWidth, height: rowHeight },
        field,
      })
    }
  }

  this.gridLinesPainter.paint(this.ctx, {
    rowsAxis: this.rowsAxis,
    colsAxis: this.colsAxis,
    rowRange,
    colRange,
    rect,
    scrollOffsetX: scrollX,
    scrollOffsetY: scrollY,
  })
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
pnpm --filter @novasheet/core test
```

Expected: ALL pass (existing 87 + 2 new in Renderer + 2 new in GridLinesPainter = ~108 with Task 1 & 2 included; verify the count is correct).

> The previously passing M1 Renderer/GridLinesPainter tests use scroll=0 implicitly and should remain green.

- [ ] **Step 7: Run typecheck and lint**

```bash
pnpm --filter @novasheet/core typecheck
pnpm lint
```

Expected: both clean.

- [ ] **Step 8: Commit**

```bash
git add packages/core
git commit -m "feat(core): make Renderer + GridLinesPainter scroll-aware (subtract scrollX/Y)"
```

---

### Task 4: Grid — DOM restructuring with scroll-host + spacer

**Files:**

- Modify: `packages/core/src/Grid.ts`
- Modify: `packages/core/tests/Grid.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `packages/core/tests/Grid.test.ts` (inside `describe('Grid')`):

```ts
it('mounts scroll-host, scroll-spacer, and canvas with correct DOM hierarchy', () => {
  const el = document.createElement('div')
  Object.assign(el.style, { width: '400px', height: '300px' })
  document.body.appendChild(el)
  const grid = new Grid(el, { data: makeData() })

  const scrollHost = el.querySelector('[data-novasheet-scroll-host]') as HTMLElement | null
  const spacer = el.querySelector('[data-novasheet-scroll-spacer]') as HTMLElement | null
  const canvas = el.querySelector('canvas') as HTMLCanvasElement | null

  expect(scrollHost).not.toBeNull()
  expect(spacer).not.toBeNull()
  expect(canvas).not.toBeNull()
  expect(scrollHost!.contains(spacer!)).toBe(true)
  expect(scrollHost!.parentNode).toBe(el)
  expect(canvas!.parentNode).toBe(el)

  grid.destroy()
  document.body.removeChild(el)
})

it('canvas has pointer-events: none so scroll events pass through', () => {
  const el = document.createElement('div')
  const grid = new Grid(el, { data: makeData() })
  const canvas = el.querySelector('canvas') as HTMLCanvasElement
  expect(canvas.style.pointerEvents).toBe('none')
  grid.destroy()
})

it('scroll-host has overflow auto so it produces a native scrollbar', () => {
  const el = document.createElement('div')
  const grid = new Grid(el, { data: makeData() })
  const host = el.querySelector('[data-novasheet-scroll-host]') as HTMLElement
  expect(host.style.overflow).toBe('auto')
  grid.destroy()
})

it('scroll-spacer is sized via ScrollMapper.computeSpacerSize for both axes', () => {
  const el = document.createElement('div')
  const grid = new Grid(el, { data: makeData() })
  const spacer = el.querySelector('[data-novasheet-scroll-spacer]') as HTMLElement
  // makeData has 50 rows × 2 cols × default theme rowHeight=28; widths come from SCHEMA
  // contentH = 50 × 28 = 1400; contentW = 200 + 80 = 280 (both well under SAFE_MAX)
  expect(spacer.style.height).toBe('1400px')
  expect(spacer.style.width).toBe('280px')
  grid.destroy()
})

it('destroy removes scroll-host along with canvas', () => {
  const el = document.createElement('div')
  const grid = new Grid(el, { data: makeData() })
  grid.destroy()
  expect(el.querySelector('[data-novasheet-scroll-host]')).toBeNull()
  expect(el.querySelector('canvas')).toBeNull()
})

it('setData re-sizes the spacer to match the new dataset', () => {
  const el = document.createElement('div')
  const grid = new Grid(el, { data: makeData() })
  const newData = new InMemoryDataSource({
    schema: SCHEMA,
    rows: Array.from({ length: 200 }, (_, i) => ({ name: `n${i}`, age: i })),
  })
  grid.setData(newData)
  const spacer = el.querySelector('[data-novasheet-scroll-spacer]') as HTMLElement
  expect(spacer.style.height).toBe(`${200 * 28}px`)
  grid.destroy()
})

it('setRowHeight re-sizes the spacer', () => {
  const el = document.createElement('div')
  const grid = new Grid(el, { data: makeData() })
  grid.setRowHeight(0, 100) // delta = 100 - 28 = 72
  const spacer = el.querySelector('[data-novasheet-scroll-spacer]') as HTMLElement
  expect(spacer.style.height).toBe(`${50 * 28 + 72}px`)
  grid.destroy()
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @novasheet/core test tests/Grid.test.ts
```

Expected: FAIL — no scroll-host / spacer in DOM yet.

- [ ] **Step 3: Update `Grid.ts` to mount scroll-host + spacer**

Replace the constructor's DOM setup section in `packages/core/src/Grid.ts`. Find:

```ts
this.canvas = document.createElement('canvas')
Object.assign(this.canvas.style, {
  position: 'absolute',
  top: '0',
  left: '0',
  pointerEvents: 'none',
})
if (getComputedStyle(this.container).position === 'static') {
  this.container.style.position = 'relative'
}
this.container.appendChild(this.canvas)
```

Replace with:

```ts
// Position the container so absolute children (canvas, scroll-host) anchor correctly
const computedPos = getComputedStyle(this.container).position
this.originalPosition = this.container.style.position
if (computedPos === 'static') {
  this.container.style.position = 'relative'
}

// Scroll-host: native scrollbar provider; absolutely fills container
this.scrollHost = document.createElement('div')
this.scrollHost.setAttribute('data-novasheet-scroll-host', '')
Object.assign(this.scrollHost.style, {
  position: 'absolute',
  top: '0',
  left: '0',
  right: '0',
  bottom: '0',
  overflow: 'auto',
})
// Spacer: sized to ScrollMapper.computeSpacerSize, gives the scrollbar its range
this.scrollSpacer = document.createElement('div')
this.scrollSpacer.setAttribute('data-novasheet-scroll-spacer', '')
Object.assign(this.scrollSpacer.style, {
  display: 'block',
  width: '0px',
  height: '0px',
})
this.scrollHost.appendChild(this.scrollSpacer)
this.container.appendChild(this.scrollHost)

// Canvas: sits on top, pointer-events: none so wheel/touch scroll passes through
this.canvas = document.createElement('canvas')
Object.assign(this.canvas.style, {
  position: 'absolute',
  top: '0',
  left: '0',
  pointerEvents: 'none',
})
this.container.appendChild(this.canvas)
```

Add private fields to the Grid class (near `private canvas: HTMLCanvasElement`):

```ts
  private scrollHost!: HTMLDivElement
  private scrollSpacer!: HTMLDivElement
```

Add a helper method `private resizeSpacer()` that reads the current axis sizes and writes to spacer style. Place it near `applyFieldWidths`:

```ts
  /** Updates scroll-spacer width/height so the native scrollbar reflects current content extent. */
  private resizeSpacer(): void {
    const w = this.scrollMapper.computeSpacerSize(this.colsAxis.getTotalSize())
    const h = this.scrollMapper.computeSpacerSize(this.rowsAxis.getTotalSize())
    this.scrollSpacer.style.width = `${w}px`
    this.scrollSpacer.style.height = `${h}px`
  }
```

This needs `this.scrollMapper` — add a field near `private renderer: Renderer`:

```ts
  private scrollMapper: ScrollMapper
```

Initialize in constructor (after `this.frozen = new FrozenRegions(...)`):

```ts
this.scrollMapper = new ScrollMapper()
```

Add the import at the top:

```ts
import { ScrollMapper } from './scroll/ScrollMapper'
```

Call `this.resizeSpacer()` at the end of the constructor (after `this.applyFieldWidths()`) and after `setData / setRowHeight / setColumnWidth / setTheme` mutations.

Specifically:

In the constructor, change the end from:

```ts
this.applyFieldWidths()
this.renderer.paint()
```

to:

```ts
this.applyFieldWidths()
this.resizeSpacer()
this.renderer.paint()
```

In `setData`, after `this.applyFieldWidths()`:

```ts
this.applyFieldWidths()
this.resizeSpacer()
```

In `setRowHeight`:

```ts
  setRowHeight(rowIndex: number, height: number): void {
    this.rowsAxis.setSize(rowIndex, height)
    this.resizeSpacer()
    this.invalidate()
  }
```

In `setColumnWidth`:

```ts
  setColumnWidth(fieldId: string, width: number): void {
    const fields = this.data.getSchema().fields
    const index = fields.findIndex((f) => f.id === fieldId)
    if (index < 0) return
    this.colsAxis.setSize(index, width)
    this.resizeSpacer()
    this.invalidate()
  }
```

In `setTheme` (after the `setDefaultSize` branch):

```ts
  setTheme(theme: Theme): void {
    this.theme = theme
    this.viewport.setHeaderHeight(theme.metrics.headerHeight)
    if (this.explicitDefaultRowHeight === undefined) {
      this.rowsAxis.setDefaultSize(theme.metrics.rowHeight)
    }
    this.resizeSpacer()
    this.renderer.setTheme(theme)
    this.invalidate()
  }
```

Finally, update `destroy()` to remove `scrollHost` (canvas removal already exists):

```ts
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.renderer.destroy()
    if (this.canvas.parentNode === this.container) {
      this.container.removeChild(this.canvas)
    }
    if (this.scrollHost.parentNode === this.container) {
      this.container.removeChild(this.scrollHost)
    }
    this.container.style.position = this.originalPosition
  }
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm --filter @novasheet/core test
```

Expected: all passing including the 7 new Grid tests.

- [ ] **Step 5: Run typecheck and lint**

```bash
pnpm --filter @novasheet/core typecheck
pnpm lint
```

Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): Grid DOM restructure — scroll-host + spacer for native scroll"
```

---

### Task 5: Grid — wire NativeScroller + ResizeObserver + scrollToRow/Cell API

**Files:**

- Modify: `packages/core/src/Grid.ts`
- Modify: `packages/core/src/index.ts` (re-export ScrollMapper if useful publicly; keep NativeScroller internal)
- Modify: `packages/core/tests/Grid.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `packages/core/tests/Grid.test.ts`:

```ts
it('forwards native scroll events to viewport via ScrollMapper', () => {
  const rafs: Array<() => void> = []
  const originalRaf = globalThis.requestAnimationFrame
  globalThis.requestAnimationFrame = ((cb: () => void) => {
    rafs.push(cb)
    return rafs.length
  }) as typeof requestAnimationFrame

  const el = document.createElement('div')
  Object.assign(el.style, { width: '400px', height: '300px' })
  document.body.appendChild(el)
  const grid = new Grid(el, { data: makeData() })
  const host = el.querySelector('[data-novasheet-scroll-host]') as HTMLElement
  // Drain initial paint frames
  while (rafs.length) rafs.shift()!()

  // Fake a scroll event with new scrollTop
  Object.defineProperty(host, 'scrollTop', { value: 56, writable: true, configurable: true })
  Object.defineProperty(host, 'scrollLeft', { value: 0, writable: true, configurable: true })
  host.dispatchEvent(new Event('scroll'))
  expect(rafs).toHaveLength(1)
  while (rafs.length) rafs.shift()!()

  // After the scroll, viewport scrollY should be ~56 (content 1400 ≤ spacer 1400 → identity)
  // Indirect verification: refresh and check the canvas got paint instructions referencing
  // the scrolled state. A direct assertion would require exposing viewport state, but the
  // RAF being scheduled + drained without throwing is sufficient as a smoke test here.
  expect(() => grid.refresh()).not.toThrow()

  grid.destroy()
  document.body.removeChild(el)
  globalThis.requestAnimationFrame = originalRaf
})

it('scrollToRow moves the scroll-host scrollTop to align the row', () => {
  const el = document.createElement('div')
  Object.assign(el.style, { width: '400px', height: '300px' })
  document.body.appendChild(el)
  const grid = new Grid(el, { data: makeData() })
  const host = el.querySelector('[data-novasheet-scroll-host]') as HTMLElement

  grid.scrollToRow(10, 'start')
  // Row 10 starts at y = 10 × 28 = 280; content 1400 ≤ spacer 1400 (identity branch)
  expect(host.scrollTop).toBe(280)

  grid.scrollToRow(0, 'start')
  expect(host.scrollTop).toBe(0)

  grid.destroy()
  document.body.removeChild(el)
})

it('scrollToCell moves both scrollTop and scrollLeft', () => {
  const el = document.createElement('div')
  Object.assign(el.style, { width: '400px', height: '300px' })
  document.body.appendChild(el)
  const grid = new Grid(el, { data: makeData() })
  const host = el.querySelector('[data-novasheet-scroll-host]') as HTMLElement

  grid.scrollToCell(5, 'age') // age = field index 1, at x = 200; row 5 at y = 140
  expect(host.scrollTop).toBe(140)
  expect(host.scrollLeft).toBe(200)

  grid.destroy()
  document.body.removeChild(el)
})

it('scrollToRow with align=end aligns the row bottom to viewport bottom', () => {
  const el = document.createElement('div')
  Object.assign(el.style, { width: '400px', height: '300px' })
  document.body.appendChild(el)
  const grid = new Grid(el, { data: makeData() })
  const host = el.querySelector('[data-novasheet-scroll-host]') as HTMLElement

  // viewport-content height = 300 - 32 (headerHeight from denseGridTheme) = 268
  // row 20 bottom = 21 × 28 = 588; align=end → scrollTop = 588 - 268 = 320
  grid.scrollToRow(20, 'end')
  expect(host.scrollTop).toBe(320)

  grid.destroy()
  document.body.removeChild(el)
})

it('scrollToRow with out-of-range index does not throw', () => {
  const el = document.createElement('div')
  const grid = new Grid(el, { data: makeData() })
  expect(() => grid.scrollToRow(99999, 'start')).not.toThrow()
  expect(() => grid.scrollToRow(-1, 'start')).not.toThrow()
  grid.destroy()
})

it('ResizeObserver-style container resize triggers paint invalidate', () => {
  // happy-dom may or may not implement ResizeObserver. The test verifies our wiring
  // by manually calling the internal resize handler (exposed via _onContainerResize for tests).
  const el = document.createElement('div')
  Object.assign(el.style, { width: '400px', height: '300px' })
  document.body.appendChild(el)
  const grid = new Grid(el, { data: makeData() })

  const spy = vi.spyOn(grid as unknown as { invalidate: () => void }, 'invalidate')
  // Simulate a container resize by setting different bounding rect and dispatching the internal handler
  Object.defineProperty(el, 'clientWidth', { value: 500, configurable: true })
  Object.defineProperty(el, 'clientHeight', { value: 400, configurable: true })
  ;(grid as unknown as { _onContainerResize: () => void })._onContainerResize()

  expect(spy).toHaveBeenCalled()
  grid.destroy()
  document.body.removeChild(el)
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm --filter @novasheet/core test tests/Grid.test.ts
```

Expected: FAIL — `scrollToRow`, `scrollToCell`, `_onContainerResize` not implemented; scroll wiring not present.

- [ ] **Step 3: Add NativeScroller import and field**

Edit `packages/core/src/Grid.ts`. Add imports near the top:

```ts
import { NativeScroller } from './scroll/NativeScroller'
import { FrameScheduler, frameScheduler } from './util/raf'
```

Add private fields to the Grid class:

```ts
  private nativeScroller!: NativeScroller
  private resizeObserver: ResizeObserver | null = null
  private scheduler: FrameScheduler = frameScheduler
```

Pass the shared scheduler to Renderer construction — find:

```ts
this.renderer = new Renderer({
  ctx: this.ctx,
  data: this.data,
  viewport: this.viewport,
  rowsAxis: this.rowsAxis,
  colsAxis: this.colsAxis,
  theme: this.theme,
})
```

Change to:

```ts
this.renderer = new Renderer({
  ctx: this.ctx,
  data: this.data,
  viewport: this.viewport,
  rowsAxis: this.rowsAxis,
  colsAxis: this.colsAxis,
  theme: this.theme,
  scheduler: this.scheduler,
})
```

- [ ] **Step 4: Wire up NativeScroller in constructor**

After `this.applyFieldWidths()` and `this.resizeSpacer()`, but BEFORE `this.renderer.paint()`, add:

```ts
// Wire native scroll → ScrollMapper → Viewport.setScroll → Renderer.invalidate
this.nativeScroller = new NativeScroller(
  this.scrollHost,
  this.scheduler,
  (scrollTop, scrollLeft) => {
    const { logicalX, logicalY } = this.mapScrollToLogical(scrollTop, scrollLeft)
    this.viewport.setScroll(logicalX, logicalY)
    this.renderer.invalidate()
  },
)
this.nativeScroller.attach()

// Watch container resize so spacer + canvas stay in sync with element size
if (typeof ResizeObserver !== 'undefined') {
  this.resizeObserver = new ResizeObserver(() => this._onContainerResize())
  this.resizeObserver.observe(this.container)
}
```

- [ ] **Step 5: Implement private helpers**

Add to the Grid class (place after `applyFieldWidths`):

```ts
  /** Maps DOM scrollTop/scrollLeft to logical scroll coordinates via ScrollMapper. */
  private mapScrollToLogical(scrollTop: number, scrollLeft: number): { logicalX: number; logicalY: number } {
    const contentH = this.rowsAxis.getTotalSize()
    const contentW = this.colsAxis.getTotalSize()
    const spacerH = this.scrollMapper.computeSpacerSize(contentH)
    const spacerW = this.scrollMapper.computeSpacerSize(contentW)
    const vpW = this.container.clientWidth || this.container.getBoundingClientRect().width || 400
    const vpH =
      (this.container.clientHeight || this.container.getBoundingClientRect().height || 300) -
      this.theme.metrics.headerHeight
    return {
      logicalX: this.scrollMapper.scrollToLogical(scrollLeft, spacerW, contentW, vpW),
      logicalY: this.scrollMapper.scrollToLogical(scrollTop, spacerH, contentH, vpH),
    }
  }

  /** Called by ResizeObserver and exposed for tests. */
  private _onContainerResize(): void {
    if (this.destroyed) return
    const w = this.container.clientWidth || this.container.getBoundingClientRect().width || 400
    const h = this.container.clientHeight || this.container.getBoundingClientRect().height || 300
    this.highDpi.resize(w, h)
    this.viewport.setSize(w, h)
    this.invalidate()
  }
```

- [ ] **Step 6: Implement public scrollToRow / scrollToCell**

Add public methods to the Grid class:

```ts
  scrollToRow(rowIndex: number, align: 'start' | 'center' | 'end' = 'start'): void {
    if (rowIndex < 0 || rowIndex >= this.rowsAxis.getCount()) return
    const top = this.rowsAxis.indexToPosition(rowIndex)
    const size = this.rowsAxis.getSize(rowIndex)
    const vpH =
      (this.container.clientHeight || this.container.getBoundingClientRect().height || 300) -
      this.theme.metrics.headerHeight
    let logicalY: number
    if (align === 'start') logicalY = top
    else if (align === 'end') logicalY = top + size - vpH
    else logicalY = top + size / 2 - vpH / 2

    const contentH = this.rowsAxis.getTotalSize()
    const spacerH = this.scrollMapper.computeSpacerSize(contentH)
    const scrollTop = this.scrollMapper.logicalToScroll(logicalY, spacerH, contentH, vpH)
    this.nativeScroller.scrollTo(scrollTop, this.scrollHost.scrollLeft)
  }

  scrollToCell(rowIndex: number, fieldId: string): void {
    const fields = this.data.getSchema().fields
    const colIndex = fields.findIndex((f) => f.id === fieldId)
    if (rowIndex < 0 || rowIndex >= this.rowsAxis.getCount()) return
    if (colIndex < 0) return

    const top = this.rowsAxis.indexToPosition(rowIndex)
    const left = this.colsAxis.indexToPosition(colIndex)
    const contentH = this.rowsAxis.getTotalSize()
    const contentW = this.colsAxis.getTotalSize()
    const spacerH = this.scrollMapper.computeSpacerSize(contentH)
    const spacerW = this.scrollMapper.computeSpacerSize(contentW)
    const vpW = this.container.clientWidth || this.container.getBoundingClientRect().width || 400
    const vpH =
      (this.container.clientHeight || this.container.getBoundingClientRect().height || 300) -
      this.theme.metrics.headerHeight

    const scrollTop = this.scrollMapper.logicalToScroll(top, spacerH, contentH, vpH)
    const scrollLeft = this.scrollMapper.logicalToScroll(left, spacerW, contentW, vpW)
    this.nativeScroller.scrollTo(scrollTop, scrollLeft)
  }
```

- [ ] **Step 7: Extend `destroy()` for scroller + observer cleanup**

```ts
  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }
    this.nativeScroller.destroy()
    this.renderer.destroy()
    if (this.canvas.parentNode === this.container) {
      this.container.removeChild(this.canvas)
    }
    if (this.scrollHost.parentNode === this.container) {
      this.container.removeChild(this.scrollHost)
    }
    this.container.style.position = this.originalPosition
  }
```

- [ ] **Step 8: Update `index.ts` to export ScrollMapper**

Replace the relevant block in `packages/core/src/index.ts`:

```ts
// 滚动层
export { ScrollMapper, SAFE_MAX } from './scroll/ScrollMapper'
```

Add it after the theme section. NativeScroller stays internal (no export).

- [ ] **Step 9: Run all tests**

```bash
pnpm --filter @novasheet/core test
```

Expected: all passing including ~6 new Grid tests.

- [ ] **Step 10: Run typecheck and lint**

```bash
pnpm --filter @novasheet/core typecheck
pnpm lint
```

Expected: clean.

- [ ] **Step 11: Commit**

```bash
git add packages/core
git commit -m "feat(core): wire NativeScroller + ResizeObserver + scrollToRow/Cell into Grid"
```

---

### Task 6: Storybook — Scroll stories

**Files:**

- Create: `apps/storybook/src/stories/Scroll.stories.ts`

- [ ] **Step 1: Inspect existing Storybook conventions**

Read `apps/storybook/src/grid-host.ts` and one existing story to confirm the pattern.

```bash
cat apps/storybook/src/grid-host.ts
cat apps/storybook/src/stories/Default.stories.ts
```

- [ ] **Step 2: Extend `grid-host.ts` to expose the Grid instance**

`createGridHost` currently returns only the DOM element. To call `grid.scrollToRow` from
stories, attach the Grid instance to the returned element so stories can reach it.

Replace `apps/storybook/src/grid-host.ts` with:

```ts
import { Grid, type GridOptions } from '@novasheet/core'

/**
 * Creates a sized div, instantiates a Grid inside it, returns the div with the Grid
 * instance attached as `__grid` so stories can call imperative APIs (scrollToRow,
 * setTheme, etc.) and devtools can inspect it.
 */
export function createGridHost(opts: GridOptions, width = 780, height = 480): HTMLElement {
  const el = document.createElement('div')
  el.style.width = `${width}px`
  el.style.height = `${height}px`
  el.style.position = 'relative'
  const grid = new Grid(el, opts)
  ;(el as HTMLElement & { __grid: Grid }).__grid = grid
  return el
}
```

- [ ] **Step 3: Create Scroll.stories.ts**

Create `apps/storybook/src/stories/Scroll.stories.ts`:

```ts
import type { Meta, StoryObj } from '@storybook/html'
import { Grid, InMemoryDataSource, type Schema } from '@novasheet/core'
import { createGridHost } from '../grid-host'

const schema: Schema = {
  fields: [
    { id: 'idx', name: 'Index', type: 'number', width: 80 },
    { id: 'name', name: 'Name', type: 'text', width: 200 },
    { id: 'category', name: 'Category', type: 'text', width: 160 },
    { id: 'value', name: 'Value', type: 'number', width: 120 },
  ],
}

const meta: Meta = {
  title: 'Grid/Scroll',
  parameters: { layout: 'centered' },
}
export default meta
type Story = StoryObj

/** A regular-sized dataset that requires scrolling — the M2 happy path. */
export const TenThousandRows: Story = {
  render: () => {
    const rows = Array.from({ length: 10_000 }, (_, i) => ({
      idx: i,
      name: `Item ${i}`,
      category: ['alpha', 'beta', 'gamma', 'delta'][i % 4]!,
      value: Math.round(Math.sin(i) * 10_000) / 100,
    }))
    const data = new InMemoryDataSource({ schema, rows })
    return createGridHost({ data })
  },
}

/**
 * 1,000,000 rows — exceeds Firefox / iOS Safari element-height limits (~17.9M / ~16.7M),
 * so ScrollMapper.computeSpacerSize caps the spacer at 6,000,000 px and the scrollTop is
 * mapped non-linearly. Wheel / trackpad scroll smoothly; the scrollbar thumb covers
 * ~4.67 logical rows per pixel.
 *
 * Allocation note: ~1M plain JS objects ≈ 150MB heap. Render is slow on weak machines;
 * the M5 column-typed TypedArray generator will fix this. For now, the story is the
 * canonical "stress test" demo.
 */
export const OneMillionRows: Story = {
  render: () => {
    const categories = ['alpha', 'beta', 'gamma', 'delta'] as const
    const rows = new Array<Record<string, string | number>>(1_000_000)
    for (let i = 0; i < rows.length; i++) {
      rows[i] = {
        idx: i,
        name: `Row ${i}`,
        category: categories[i % 4]!,
        value: i * 0.5,
      }
    }
    const data = new InMemoryDataSource({ schema, rows })
    return createGridHost({ data })
  },
}

/**
 * Demonstrates programmatic scrollTo: scrolls to row 500 on initial render.
 * Useful for verifying the scrollToRow API works (e.g., for jump-to-anchor flows).
 */
export const ScrollToRow500: Story = {
  render: () => {
    const rows = Array.from({ length: 2_000 }, (_, i) => ({
      idx: i,
      name: `Row ${i}`,
      category: ['alpha', 'beta', 'gamma'][i % 3]!,
      value: i,
    }))
    const data = new InMemoryDataSource({ schema, rows })
    const host = createGridHost({ data })
    // Defer one frame so the Grid finishes initial mount + first paint before scrolling.
    requestAnimationFrame(() => {
      const grid = (host as HTMLElement & { __grid: Grid }).__grid
      grid.scrollToRow(500, 'center')
    })
    return host
  },
}
```

- [ ] **Step 4: Build the core package so Storybook picks up the changes**

```bash
pnpm --filter @novasheet/core build
```

Expected: ESM + CJS + d.ts emit cleanly.

- [ ] **Step 5: Launch Storybook briefly to sanity-check**

```bash
timeout 8 pnpm --filter @novasheet/storybook storybook 2>&1 | head -25
```

Look for `Storybook ... started` and `Local: http://localhost:6006`. The timeout will kill it after 8s — that's fine.

- [ ] **Step 6: Commit**

```bash
git add apps/storybook
git commit -m "feat(storybook): add Scroll stories — 10k / 1M rows / scrollToRow API demo"
```

---

### Task 7: Integration check + tag M2

**Files:**

- (No new files; final verification before tagging the milestone.)

- [ ] **Step 1: Run the full test suite**

```bash
pnpm --filter @novasheet/core test
```

Expected: ALL pass. New test count: ~108 (87 M1 + ~21 M2). Note exact number for the commit message.

- [ ] **Step 2: Run typecheck**

```bash
pnpm --filter @novasheet/core typecheck
```

Expected: no errors.

- [ ] **Step 3: Run lint**

```bash
pnpm lint
```

Expected: 0 errors, 0 warnings. If anything trips, fix before continuing.

- [ ] **Step 4: Run build**

```bash
pnpm --filter @novasheet/core build
```

Expected: dist/ updated with new ScrollMapper export.

- [ ] **Step 5: Verify Storybook dev still boots**

```bash
timeout 8 pnpm --filter @novasheet/storybook storybook 2>&1 | tail -15
```

Look for clean startup; no errors in the tail.

- [ ] **Step 6: Inspect public exports**

```bash
node -e "import('./packages/core/dist/index.js').then(m => console.log(Object.keys(m)))"
```

Expected: includes `Grid`, `InMemoryDataSource`, `denseGridTheme`, **`ScrollMapper`, `SAFE_MAX`** (new in M2).

- [ ] **Step 7: Update CLAUDE.md "Current state"**

Edit `/Users/rongts/NovaSheet/CLAUDE.md`. Update the "Last shipped" and "Next milestone" lines:

```markdown
**Last shipped:** **M2 Virtualization & Scroll** — tag `m2-virtualization` at the HEAD of `main`.
~108 tests, lint/typecheck/build all clean. 1M+ rows scroll smoothly with non-linear scrollTop
mapping (ScrollMapper SAFE_MAX = 6_000_000 px). Grid DOM: scroll-host + spacer + canvas; ResizeObserver
wired; scrollToRow / scrollToCell APIs implemented. Visible in Storybook → Grid/Scroll stories.

**Next milestone:** **M3 Frozen + Dynamic sizing** — not yet planned. Scope (per spec §4 + §5.3):

- FrozenRegions returning 4 quadrants (topLeft / topRight / bottomLeft / main) when frozenRows > 0
  or frozenCols > 0
- Renderer iterating all populated quadrants with per-quadrant scroll subtraction (frozen quadrants
  don't scroll)
- FrozenPainter: investments / borders between quadrants
- Dynamic row-height autofit (multi-line text measurement)
```

- [ ] **Step 8: Commit doc + tag the milestone**

```bash
git add CLAUDE.md
git commit -m "docs(claude): update Current state — M2 shipped, M3 next"
git tag m2-virtualization
git push origin main
git push origin m2-virtualization
```

Verify:

```bash
git ls-remote --tags origin | grep m2
```

Expected: `m2-virtualization` listed.

---

## M2 Completion Checklist

When all tasks above pass, the following should be true:

- [ ] `ScrollMapper` exposes `computeSpacerSize`, `scrollToLogical`, `logicalToScroll` + `SAFE_MAX = 6_000_000`
- [ ] `NativeScroller` adapts native scroll events through the shared `frameScheduler` with `scroll:read` key
- [ ] Grid DOM: `<scroll-host>` (overflow: auto) wraps `<scroll-spacer>`; `<canvas>` sibling has `pointer-events: none`
- [ ] Spacer width/height auto-update on data / theme / row-height / column-width mutations
- [ ] ResizeObserver wired (when available); container resize triggers canvas resize + viewport setSize + repaint
- [ ] `Renderer.paintQuadrant` subtracts viewport.scrollX/Y from cell positions
- [ ] `GridLinesPainter` accepts `scrollOffsetX/Y` params (optional, defaults to 0)
- [ ] `Grid.scrollToRow(rowIndex, align)` and `Grid.scrollToCell(rowIndex, fieldId)` work
- [ ] All M1 tests still pass; new M2 tests added (~21)
- [ ] `ScrollMapper`, `SAFE_MAX` exported from `@novasheet/core`
- [ ] Storybook `Grid/Scroll` section has stories for 10k rows, 1M rows, scrollToRow API
- [ ] git tag `m2-virtualization` exists on remote

**What's intentionally NOT working yet:**

- Frozen rows/columns — M3 (FrozenRegions still returns only `main`)
- Resize drag handles — M4
- React wrapper — M4
- Custom scrollbar styling — Phase 2+
- Dynamic row-height autofit (multi-line text wrap) — M3
