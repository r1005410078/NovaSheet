# NovaSheet DOM Selection Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move body selection fill and active-cell border from Canvas2D overlay painting to a DOM `SelectionOverlay`, while keeping the existing core selection model unchanged.

**Architecture:** `@novasheet/web` owns a new DOM overlay layer that syncs from the same `RenderFrame` used by the renderer. `@novasheet/web-canvas2d` stops painting body selection visuals, but keeps header and row-header selection chrome. Existing `computeRangeOverlayRects()` remains the single range-to-viewport-rect helper.

**Tech Stack:** TypeScript, bun:test, happy-dom, `@novasheet/web`, `@novasheet/web-canvas2d`, `@novasheet/core`.

---

## File Map

| File | Responsibility |
| --- | --- |
| `packages/web/src/overlay/SelectionOverlay.ts` | New DOM layer for selected range fill/border and active-cell border |
| `packages/web/tests/overlay/SelectionOverlay.test.ts` | Unit tests for attach/sync/destroy and DOM output |
| `packages/web/src/backends/Canvas2DBackend.ts` | Instantiate and destroy `SelectionOverlay` |
| `packages/web/src/runtime/WebGridRuntime.ts` | Accept overlay dependency and sync after render/paintSync |
| `packages/web/tests/runtime/WebGridRuntime.selection-overlay.test.ts` | Runtime integration tests |
| `packages/web-canvas2d/src/render/Canvas2DRenderer.ts` | Remove body selection fill and active-cell border from Canvas overlay layer |
| `packages/web-canvas2d/tests/render/Canvas2DRenderer.test.ts` | Update renderer assertions: body selection gone, header chrome stays |

---

### Task 1: Add `SelectionOverlay` DOM Layer

**Files:**
- Create: `packages/web/src/overlay/SelectionOverlay.ts`
- Test: `packages/web/tests/overlay/SelectionOverlay.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/web/tests/overlay/SelectionOverlay.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { SelectionOverlay } from '../../src/overlay/SelectionOverlay'
import type { OverlayRect } from '../../src/interaction/RangeOverlayRects'

describe('SelectionOverlay', () => {
  it('renders range rects and active cell rect with pointer-events disabled', () => {
    const root = document.createElement('div')
    const overlay = new SelectionOverlay(root)
    const rangeRects: OverlayRect[] = [
      { x: 10, y: 20, width: 100, height: 40 },
      { x: 10, y: 80, width: 100, height: 30 },
    ]

    overlay.sync({ rangeRects, activeRect: { x: 12, y: 22, width: 50, height: 20 } })

    const layer = root.querySelector<HTMLElement>('[data-novasheet-selection-layer]')!
    expect(layer.style.pointerEvents).toBe('none')
    expect(root.querySelectorAll('[data-novasheet-selection-range]').length).toBe(2)
    expect(root.querySelectorAll('[data-novasheet-selection-active]').length).toBe(1)
    expect(root.querySelector<HTMLElement>('[data-novasheet-selection-range]')!.style.left).toBe('10px')
    expect(root.querySelector<HTMLElement>('[data-novasheet-selection-active]')!.style.borderColor).toContain(
      'var(--novasheet-selection-border',
    )
  })

  it('clears all rects for null sync and destroy is idempotent', () => {
    const root = document.createElement('div')
    const overlay = new SelectionOverlay(root)

    overlay.sync({ rangeRects: [{ x: 0, y: 0, width: 10, height: 10 }], activeRect: null })
    overlay.sync(null)

    expect(root.querySelectorAll('[data-novasheet-selection-range]').length).toBe(0)
    overlay.destroy()
    overlay.destroy()
    expect(root.querySelector('[data-novasheet-selection-layer]')).toBeNull()
  })
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test packages/web/tests/overlay/SelectionOverlay.test.ts
```

Expected: FAIL because `packages/web/src/overlay/SelectionOverlay.ts` does not exist.

- [ ] **Step 3: Implement minimal overlay**

Create `packages/web/src/overlay/SelectionOverlay.ts`:

```ts
import type { OverlayRect } from '../interaction/RangeOverlayRects'

export interface SelectionOverlayState {
  readonly rangeRects: readonly OverlayRect[]
  readonly activeRect: OverlayRect | null
}

/** DOM 选区浮层：只负责视觉，不参与 pointer hit test。 */
export class SelectionOverlay {
  private readonly layer: HTMLDivElement
  private rangeEls: HTMLDivElement[] = []
  private activeEl: HTMLDivElement | null = null
  private destroyed = false

  constructor(private readonly root: HTMLElement) {
    this.layer = document.createElement('div')
    this.layer.setAttribute('data-novasheet-selection-layer', '')
    Object.assign(this.layer.style, {
      position: 'absolute',
      inset: '0',
      pointerEvents: 'none',
      zIndex: '2',
    })
    this.root.appendChild(this.layer)
  }

  sync(state: SelectionOverlayState | null): void {
    if (this.destroyed) return
    this.clear()
    if (!state) return
    for (const rect of state.rangeRects) {
      const el = document.createElement('div')
      el.setAttribute('data-novasheet-selection-range', '')
      Object.assign(el.style, {
        position: 'absolute',
        pointerEvents: 'none',
        boxSizing: 'border-box',
        background: 'var(--novasheet-selection-bg, rgba(9, 105, 218, 0.12))',
        border: '1px solid var(--novasheet-selection-border, #0969da)',
        left: `${rect.x}px`,
        top: `${rect.y}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      })
      this.layer.appendChild(el)
      this.rangeEls.push(el)
    }
    if (state.activeRect) this.renderActive(state.activeRect)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.clear()
    this.layer.remove()
  }

  private renderActive(rect: OverlayRect): void {
    const el = document.createElement('div')
    el.setAttribute('data-novasheet-selection-active', '')
    Object.assign(el.style, {
      position: 'absolute',
      pointerEvents: 'none',
      boxSizing: 'border-box',
      background: 'transparent',
      border: '2px solid var(--novasheet-selection-border, #0969da)',
      left: `${rect.x}px`,
      top: `${rect.y}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    })
    this.layer.appendChild(el)
    this.activeEl = el
  }

  private clear(): void {
    for (const el of this.rangeEls) el.remove()
    this.rangeEls = []
    this.activeEl?.remove()
    this.activeEl = null
  }
}
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test packages/web/tests/overlay/SelectionOverlay.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/overlay/SelectionOverlay.ts packages/web/tests/overlay/SelectionOverlay.test.ts
git commit -m "feat(web): 新增 DOM 选区浮层"
```

---

### Task 2: Wire `SelectionOverlay` Into Runtime

**Files:**
- Modify: `packages/web/src/backends/Canvas2DBackend.ts`
- Modify: `packages/web/src/runtime/WebGridRuntime.ts`
- Test: `packages/web/tests/runtime/WebGridRuntime.selection-overlay.test.ts`

- [ ] **Step 1: Write failing runtime tests**

Create `packages/web/tests/runtime/WebGridRuntime.selection-overlay.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { Grid } from '../../src/Grid'

describe('WebGridRuntime selection overlay', () => {
  it('syncs DOM selection overlay after setSelection render flush', async () => {
    const container = document.createElement('div')
    Object.assign(container.style, { width: '480px', height: '320px' })
    document.body.appendChild(container)

    const grid = new Grid(container, {
      columns: [
        { id: 'a', name: 'A', type: 'text', width: 80 },
        { id: 'b', name: 'B', type: 'text', width: 80 },
      ],
      rows: [{ a: 'A1', b: 'B1' }],
      excelChrome: true,
    })

    grid.setSelection({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 0, colIndex: 1 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 1 },
    })

    await Promise.resolve()

    expect(container.querySelectorAll('[data-novasheet-selection-range]').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('[data-novasheet-selection-active]').length).toBe(1)
    grid.destroy()
  })

  it('clears DOM selection overlay when selection is empty', async () => {
    const container = document.createElement('div')
    Object.assign(container.style, { width: '480px', height: '320px' })
    document.body.appendChild(container)

    const grid = new Grid(container, {
      columns: [{ id: 'a', name: 'A', type: 'text', width: 80 }],
      rows: [{ a: 'A1' }],
      excelChrome: true,
    })

    grid.setSelection({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 0, colIndex: 0 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
    })
    await Promise.resolve()
    expect(container.querySelectorAll('[data-novasheet-selection-range]').length).toBeGreaterThan(0)

    grid.setSelection({
      activeCell: null,
      anchorCell: null,
      extentCell: null,
      selectedRange: null,
    })
    await Promise.resolve()

    expect(container.querySelectorAll('[data-novasheet-selection-range]').length).toBe(0)
    expect(container.querySelectorAll('[data-novasheet-selection-active]').length).toBe(0)
    grid.destroy()
  })
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test packages/web/tests/runtime/WebGridRuntime.selection-overlay.test.ts
```

Expected: FAIL because backend/runtime do not instantiate or sync `SelectionOverlay`.

- [ ] **Step 3: Instantiate overlay in backend**

In `packages/web/src/backends/Canvas2DBackend.ts`, import and create the overlay next to fill/reorder overlays:

```ts
import { SelectionOverlay } from '../overlay/SelectionOverlay'
```

Pass it into runtime construction:

```ts
const selectionOverlay = new SelectionOverlay(container)

this.runtime = new WebGridRuntime({
  // existing options...
  selectionOverlay,
})
```

Destroy it in the same lifecycle path as other DOM overlays:

```ts
selectionOverlay.destroy()
```

- [ ] **Step 4: Sync overlay in runtime**

In `packages/web/src/runtime/WebGridRuntime.ts`, add the dependency:

```ts
import type { SelectionOverlay } from '../overlay/SelectionOverlay'
```

Add option/property:

```ts
readonly selectionOverlay?: SelectionOverlay
```

After `renderer.render(frame)` in both `invalidate()` and `paintSync()`, call:

```ts
this.syncSelectionOverlay(frame)
```

Add:

```ts
private syncSelectionOverlay(frame = this.getRenderFrame()): void {
  if (!this.selectionOverlay) return
  if (this.engine.isCellEditing()) {
    this.selectionOverlay.sync(null)
    return
  }
  const selection = frame.selection
  const range = selection.selectedRange
  if (!range) {
    this.selectionOverlay.sync(null)
    return
  }
  const active = selection.activeCell
  const activeRect = active
    ? computeRangeOverlayRects(frame, {
        startRow: active.rowIndex,
        endRow: active.rowIndex,
        startCol: active.colIndex,
        endCol: active.colIndex,
      }).at(-1) ?? null
    : null
  this.selectionOverlay.sync({
    rangeRects: computeRangeOverlayRects(frame, range),
    activeRect,
  })
}
```

Use the same `frame` variable already passed to `renderer.render(frame)` so Canvas and DOM stay in lockstep.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
bun test packages/web/tests/runtime/WebGridRuntime.selection-overlay.test.ts packages/web/tests/overlay/SelectionOverlay.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/backends/Canvas2DBackend.ts packages/web/src/runtime/WebGridRuntime.ts packages/web/tests/runtime/WebGridRuntime.selection-overlay.test.ts
git commit -m "feat(web): 同步 DOM 选区浮层"
```

---

### Task 3: Remove Body Selection Painting From Canvas2D

**Files:**
- Modify: `packages/web-canvas2d/src/render/Canvas2DRenderer.ts`
- Modify: `packages/web-canvas2d/tests/render/Canvas2DRenderer.test.ts`

- [ ] **Step 1: Update failing renderer tests**

In `packages/web-canvas2d/tests/render/Canvas2DRenderer.test.ts`, replace the body-selection assertions around the current tests named:

- `overlay 层根据 frame.selection 绘制选区填充与 active cell 边框`
- `overlay 层绘制多格 selectedRange，active cell 边框仍留在 anchor 起点`

with:

```ts
it('overlay 层不再绘制 body 选区与 active cell，交给 DOM SelectionOverlay', () => {
  const { renderer, ctx, frame } = setupRenderer()

  renderer.render({
    ...frame,
    selection: {
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 0, colIndex: 1 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 1 },
    },
  })

  const ops = ctx.getOps()
  expect(ops).not.toContainEqual({ op: 'set:fillStyle', value: denseGridTheme.colors.selectionBg })
  expect(ops).not.toContainEqual({ op: 'set:strokeStyle', value: denseGridTheme.colors.selectionBorder })
})
```

Keep the existing Excel chrome tests:

- `Excel 模式下普通选区同步浅色高亮列头与左侧行号`
- `Excel 模式下整列选区使用强列头选中态`
- `Excel 模式下整行选区使用强行头选中态`

If the first Excel chrome test depends on `selectionBg`, narrow its assertion to header/row-header coordinates instead of global `fillStyle`.

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test packages/web-canvas2d/tests/render/Canvas2DRenderer.test.ts
```

Expected: FAIL because Canvas still paints body selection fill/active border.

- [ ] **Step 3: Remove body overlay painting**

In `packages/web-canvas2d/src/render/Canvas2DRenderer.ts`, change `paintOverlayLayer` to only keep Excel header/row-header chrome:

```ts
private paintOverlayLayer(ctx: Canvas2DPaintFrameContext): void {
  const selection = ctx.frame.selection
  if (!selection?.selectedRange) return

  if (ctx.excelChrome) {
    this.paintSelectedColumnHeaders(ctx, selection.selectedRange)
    this.paintSelectedRowHeaders(ctx, selection.selectedRange)
  }
}
```

Remove the now-unused private methods:

```ts
private paintSelectionRangeInRegion(...)
private paintActiveCellInRegion(...)
```

Then remove unused imports/types if TypeScript reports them.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test packages/web-canvas2d/tests/render/Canvas2DRenderer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web-canvas2d/src/render/Canvas2DRenderer.ts packages/web-canvas2d/tests/render/Canvas2DRenderer.test.ts
git commit -m "feat(canvas2d): 停止绘制 body 选区"
```

---

### Task 4: Full Verification And Docs Count

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run focused package tests**

Run:

```bash
bun test packages/web/tests/overlay/SelectionOverlay.test.ts packages/web/tests/runtime/WebGridRuntime.selection-overlay.test.ts packages/web-canvas2d/tests/render/Canvas2DRenderer.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full test suite**

Run:

```bash
bun test
```

Expected: PASS. Record the final `N pass / 0 fail` count.

- [ ] **Step 3: Update README test count if changed**

If `README.md` contains the previous test count, update it to the count from Step 2. For example:

```md
685 passing
```

becomes:

```md
688 passing
```

Use the actual count from `bun test`; do not guess.

- [ ] **Step 4: Run all gates**

Run:

```bash
bun run lint
bun run --filter '*' typecheck
bun test
bun run --filter @novasheet/web build && bun run --filter @novasheet/web-canvas2d build && bun run --filter @novasheet/core build
```

Expected:

- lint: 0 errors / 0 warnings
- typecheck: all packages exit code 0
- test: `0 fail`
- build: web, web-canvas2d, core all exit code 0

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs(repo): 更新 DOM 选区浮层测试数量"
```

If README did not need changes, skip this commit and document the unchanged test count in the task report.

---

## Self-Review

- **Spec coverage:** Tasks cover DOM `SelectionOverlay`, render-frame sync timing, reuse of `computeRangeOverlayRects()`, Canvas body-selection removal, header/row-header preservation, and full gates.
- **Scope:** No core selection model, clipboard, undo/redo, data source, React, or WebGL changes.
- **Known risk:** Runtime tests depend on RAF/microtask flushing in happy-dom. If `await Promise.resolve()` is insufficient, use the existing runtime test helper pattern from nearby `WebGridRuntime.*.test.ts` files rather than adding sleeps.
- **Placeholder scan:** No `TBD`, `TODO`, or deferred unspecified implementation steps remain.
