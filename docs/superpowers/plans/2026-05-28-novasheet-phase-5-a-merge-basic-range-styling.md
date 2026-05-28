# NovaSheet Phase 5-A Merge + Basic Range Styling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Phase 5-A: manual range fill color, basic custom borders, merge/unmerge, undo/redo, internal clipboard metadata, public `Grid` API, and Storybook coverage.

**Architecture:** Keep the locked Single Canvas ADR. `@novasheet/core` owns sparse format/merge stores and exposes resolved visible formatting through `RenderFrame`; `@novasheet/web-canvas2d` adds internal painter stages (`FormatFillPainter`, `FormatBorderPainter`) without adding DOM or another canvas. Merge semantics are implemented in core first, then web/editor/clipboard guards are layered on top.

**Tech Stack:** TypeScript, bun, bun:test, Canvas2D `RecordingContext2D`, `@novasheet/core`, `@novasheet/web-canvas2d`, `@novasheet/web`, Storybook HTML.

---

## Scope Lock

This plan implements **Phase 5-A only** from `docs/superpowers/specs/2026-05-28-novasheet-phase-5-merge-range-formatting.md`.

| In scope | Out of scope |
| --- | --- |
| `CellFormat`, sparse manual format store, fill color, `all/outer/inner/clear` solid borders, merge/unmerge, undo/redo, internal clipboard metadata, public API, Storybook | dashed/dotted/double rendering, single-edge border UI, number/date/currency formatter, conditional formatting, rich toolbar, DOM format overlay, second canvas |

If any task finds that merge + sort/filter semantics contradict current architecture, STOP and report. Do not silently invent a rule; fix this plan first in a `docs(plan): ...` commit.

---

## File Map

| File | Responsibility |
| --- | --- |
| `packages/core/src/format/CellFormat.ts` | Public format types: fill, borders, presets, clear patch |
| `packages/core/src/format/RangeStyleStore.ts` | Sparse append-only manual format layers + visible resolve |
| `packages/core/src/format/BorderPreset.ts` | Pure preset-to-edge logic for `all/outer/inner/clear` |
| `packages/core/src/merge/MergeStore.ts` | Merge region storage, overlap rejection, anchor lookup, range hit mapping |
| `packages/core/src/render/RenderFrame.ts` | Add visible resolved format/merge structures to renderer contract |
| `packages/core/src/engine/GridEngine.ts` | Add Phase 5-A engine methods |
| `packages/core/src/engine/DefaultGridEngine.ts` | Own stores, mutation APIs, undo/redo, frame data |
| `packages/core/src/undo/UndoCommand.ts` | Add format and merge undo commands |
| `packages/core/src/clipboard/ApplyPaste.ts` | Guard structural paste over incompatible merge regions |
| `packages/core/src/clipboard/types.ts` | Add paste skipped reason `merge` |
| `packages/core/src/index.ts` | Export Phase 5-A types |
| `packages/web-canvas2d/src/painters/FormatFillPainter.ts` | Canvas internal fill stage |
| `packages/web-canvas2d/src/painters/FormatBorderPainter.ts` | Canvas internal custom border stage |
| `packages/web-canvas2d/src/render/Canvas2DRenderer.ts` | Insert fill/border painter stages; merge-aware text rendering |
| `packages/web/src/grid/GridController.ts` | Add public controller methods |
| `packages/web/src/Grid.ts` | Facade APIs: `setFillColor`, `setBorders`, `mergeCells`, `unmergeCells` |
| `apps/storybook/src/stories/RangeFormatting.stories.ts` | Manual format + merge story |
| `apps/storybook/src/stories/snippets/range-formatting.basic.snippet.ts` | Story source snippet |

---

## Task 1: Core Format Types + Sparse Range Store

**Files:**
- Create: `packages/core/src/format/CellFormat.ts`
- Create: `packages/core/src/format/RangeStyleStore.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/format/RangeStyleStore.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/format/RangeStyleStore.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { RangeStyleStore } from '../../src/format/RangeStyleStore'

describe('RangeStyleStore', () => {
  it('resolves later fill layers over earlier layers without expanding the full range', () => {
    const store = new RangeStyleStore()
    store.apply({ startRow: 0, endRow: 999_999, startCol: 0, endCol: 499 }, { fillColor: '#fff2cc' })
    store.apply({ startRow: 3, endRow: 4, startCol: 2, endCol: 2 }, { fillColor: '#d9ead3' })

    expect(store.getLayerCount()).toBe(2)
    expect(store.resolveCell(2, 2)?.fillColor).toBe('#fff2cc')
    expect(store.resolveCell(3, 2)?.fillColor).toBe('#d9ead3')
    expect(store.resolveVisible({ startRow: 3, endRow: 4, startCol: 2, endCol: 3 })).toEqual([
      { rowIndex: 3, colIndex: 2, format: { fillColor: '#d9ead3' } },
      { rowIndex: 3, colIndex: 3, format: { fillColor: '#fff2cc' } },
      { rowIndex: 4, colIndex: 2, format: { fillColor: '#d9ead3' } },
      { rowIndex: 4, colIndex: 3, format: { fillColor: '#fff2cc' } },
    ])
  })

  it('clearFill removes only fillColor while keeping other fields available for later tasks', () => {
    const store = new RangeStyleStore()
    store.apply({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 }, { fillColor: '#fff2cc' })
    store.clearFill({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 })

    expect(store.resolveCell(0, 0)).toBeUndefined()
    expect(store.resolveCell(0, 1)?.fillColor).toBe('#fff2cc')
  })
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test packages/core/tests/format/RangeStyleStore.test.ts
```

Expected: FAIL because `RangeStyleStore` does not exist.

- [ ] **Step 3: Implement types and append-only store**

Create `packages/core/src/format/CellFormat.ts` with:

```ts
import type { CellRange } from '../interaction/SelectionModel'

export type BorderWidth = 'thin' | 'medium' | 'thick'
export type BorderLineStyle = 'solid' | 'dashed' | 'dotted' | 'double'
export type BorderPreset = 'all' | 'outer' | 'inner' | 'clear'

export interface BorderStyle {
  readonly color: string
  readonly width: BorderWidth
  readonly lineStyle: BorderLineStyle
}

export interface CellBorders {
  readonly top?: BorderStyle
  readonly right?: BorderStyle
  readonly bottom?: BorderStyle
  readonly left?: BorderStyle
}

export interface CellFormat {
  readonly fillColor?: string
  readonly borders?: CellBorders
}

export interface ResolvedCellFormat {
  readonly rowIndex: number
  readonly colIndex: number
  readonly format: CellFormat
}

export interface FormatLayer {
  readonly range: CellRange
  readonly patch: CellFormat
  readonly clearFill?: boolean
  readonly order: number
}
```

Create `packages/core/src/format/RangeStyleStore.ts` with an append-only array of `FormatLayer`. Implement:

```ts
apply(range: CellRange, patch: CellFormat): void
clearFill(range: CellRange): void
resolveCell(rowIndex: number, colIndex: number): CellFormat | undefined
resolveVisible(range: CellRange): readonly ResolvedCellFormat[]
snapshot(): readonly FormatLayer[]
restore(layers: readonly FormatLayer[]): void
getLayerCount(): number
```

Implementation rules:

- Later layers win.
- `clearFill` clears only `fillColor`.
- Empty `CellFormat` returns `undefined`.
- `resolveVisible()` must iterate only requested visible rows/cols.

Update `packages/core/src/index.ts` exports:

```ts
export { RangeStyleStore } from './format/RangeStyleStore'
export type {
  BorderLineStyle,
  BorderPreset,
  BorderStyle,
  BorderWidth,
  CellBorders,
  CellFormat,
  FormatLayer,
  ResolvedCellFormat,
} from './format/CellFormat'
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test packages/core/tests/format/RangeStyleStore.test.ts
bun run --filter @novasheet/core typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/format packages/core/src/index.ts packages/core/tests/format/RangeStyleStore.test.ts
git commit -m "feat(core): 新增稀疏 Range 样式存储"
```

---

## Task 2: Border Preset Pure Logic

**Files:**
- Create: `packages/core/src/format/BorderPreset.ts`
- Modify: `packages/core/src/format/RangeStyleStore.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/format/BorderPreset.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/format/BorderPreset.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { borderPatchForCell } from '../../src/format/BorderPreset'
import type { BorderStyle } from '../../src/format/CellFormat'

const red: BorderStyle = { color: '#d93025', width: 'thin', lineStyle: 'solid' }
const range = { startRow: 1, endRow: 3, startCol: 2, endCol: 4 }

describe('borderPatchForCell', () => {
  it('applies outer borders only to range perimeter', () => {
    expect(borderPatchForCell(range, 1, 3, 'outer', red)).toEqual({ top: red })
    expect(borderPatchForCell(range, 2, 2, 'outer', red)).toEqual({ left: red })
    expect(borderPatchForCell(range, 2, 3, 'outer', red)).toEqual({})
    expect(borderPatchForCell(range, 3, 4, 'outer', red)).toEqual({ right: red, bottom: red })
  })

  it('applies inner borders only between cells', () => {
    expect(borderPatchForCell(range, 1, 2, 'inner', red)).toEqual({ right: red, bottom: red })
    expect(borderPatchForCell(range, 3, 4, 'inner', red)).toEqual({})
  })

  it('applies all borders to every edge', () => {
    expect(borderPatchForCell(range, 2, 3, 'all', red)).toEqual({
      top: red,
      right: red,
      bottom: red,
      left: red,
    })
  })
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test packages/core/tests/format/BorderPreset.test.ts
```

Expected: FAIL because `BorderPreset.ts` does not exist.

- [ ] **Step 3: Implement border preset**

Create `packages/core/src/format/BorderPreset.ts`:

```ts
import type { CellRange } from '../interaction/SelectionModel'
import type { BorderPreset, BorderStyle, CellBorders } from './CellFormat'

export function borderPatchForCell(
  range: CellRange,
  rowIndex: number,
  colIndex: number,
  preset: Exclude<BorderPreset, 'clear'>,
  border: BorderStyle,
): CellBorders {
  const patch: CellBorders = {}
  const isTop = rowIndex === range.startRow
  const isBottom = rowIndex === range.endRow
  const isLeft = colIndex === range.startCol
  const isRight = colIndex === range.endCol

  if (preset === 'all') return { top: border, right: border, bottom: border, left: border }
  if (preset === 'outer') {
    return {
      ...(isTop ? { top: border } : {}),
      ...(isRight ? { right: border } : {}),
      ...(isBottom ? { bottom: border } : {}),
      ...(isLeft ? { left: border } : {}),
    }
  }
  return {
    ...(!isRight ? { right: border } : {}),
    ...(!isBottom ? { bottom: border } : {}),
  }
}
```

Update `RangeStyleStore` with `applyBorders(range, preset, border)` and `clearBorders(range)`; for 5-A this may append per-visible-cell border patches only when called by engine for selected range. Keep this pure enough for tests; do not expand 1M-row ranges in engine calls.

Export `borderPatchForCell` from `packages/core/src/index.ts`.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test packages/core/tests/format/BorderPreset.test.ts packages/core/tests/format/RangeStyleStore.test.ts
bun run --filter @novasheet/core typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/format packages/core/src/index.ts packages/core/tests/format
git commit -m "feat(core): 新增基础边框预设逻辑"
```

---

## Task 3: Engine APIs + Undo for Fill and Border

**Files:**
- Modify: `packages/core/src/engine/GridEngine.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`
- Modify: `packages/core/src/render/RenderFrame.ts`
- Modify: `packages/core/src/undo/UndoCommand.ts`
- Test: `packages/core/tests/engine/DefaultGridEngine.format.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/engine/DefaultGridEngine.format.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine, InMemoryDataSource } from '../../src'
import type { BorderStyle } from '../../src'

function makeEngine() {
  const data = new InMemoryDataSource({
    schema: { fields: [{ id: 'a', name: 'A', type: 'text' }, { id: 'b', name: 'B', type: 'text' }] },
    rows: [{ a: 'A1', b: 'B1' }, { a: 'A2', b: 'B2' }],
  })
  return new DefaultGridEngine({ data })
}

describe('DefaultGridEngine format APIs', () => {
  it('sets fill color, exposes it on RenderFrame, and undo/redo restores snapshots', () => {
    const engine = makeEngine()
    const range = { startRow: 0, endRow: 1, startCol: 0, endCol: 0 }

    expect(engine.setFillColor(range, '#fff2cc')).toBe(true)
    expect(engine.getCellFormat(0, 0)?.fillColor).toBe('#fff2cc')
    expect(engine.getFrame().cellFormats.find((f) => f.rowIndex === 0 && f.colIndex === 0)?.format.fillColor).toBe(
      '#fff2cc',
    )

    expect(engine.undo()?.kind).toBe('format')
    expect(engine.getCellFormat(0, 0)).toBeUndefined()
    expect(engine.redo()?.kind).toBe('format')
    expect(engine.getCellFormat(0, 0)?.fillColor).toBe('#fff2cc')
  })

  it('sets solid outer borders and clears them', () => {
    const engine = makeEngine()
    const border: BorderStyle = { color: '#d93025', width: 'medium', lineStyle: 'solid' }
    const range = { startRow: 0, endRow: 1, startCol: 0, endCol: 1 }

    expect(engine.setBorders(range, 'outer', border)).toBe(true)
    expect(engine.getCellFormat(0, 0)?.borders?.top?.color).toBe('#d93025')
    expect(engine.getCellFormat(0, 0)?.borders?.left?.width).toBe('medium')

    expect(engine.setBorders(range, 'clear', null)).toBe(true)
    expect(engine.getCellFormat(0, 0)?.borders).toBeUndefined()
  })
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test packages/core/tests/engine/DefaultGridEngine.format.test.ts
```

Expected: FAIL because engine APIs and `RenderFrame.cellFormats` do not exist.

- [ ] **Step 3: Implement engine APIs**

Add to `RenderFrame`:

```ts
import type { ResolvedCellFormat } from '../format/CellFormat'

export interface RenderFrame {
  // existing fields...
  cellFormats: readonly ResolvedCellFormat[]
}
```

Add to `UndoCommand`:

```ts
| {
    readonly kind: 'format'
    readonly before: readonly FormatLayer[]
    readonly after: readonly FormatLayer[]
    readonly selectionBefore: GridSelection
    readonly selectionAfter: GridSelection
  }
```

`DefaultGridEngine` owns:

```ts
private readonly formatStore = new RangeStyleStore()
```

Add methods:

```ts
setFillColor(range: CellRange, color: string | null): boolean
setBorders(range: CellRange, preset: BorderPreset, border: BorderStyle | null): boolean
getCellFormat(rowIndex: number, colIndex: number): CellFormat | undefined
```

Rules:

- Snapshot `formatStore.snapshot()` before and after.
- Push one `format` undo command when snapshots differ.
- `color === null` calls `clearFill(range)`.
- `preset === 'clear'` requires `border === null` and clears borders.
- `lineStyle !== 'solid'` returns `false` in 5-A.
- `getFrame()` resolves formats only for `main` visible range for this task; later tasks can broaden to frozen regions if tests expose gaps.

Update `applyUndo` / `applyRedo` for `kind: 'format'` via `formatStore.restore(...)`.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test packages/core/tests/engine/DefaultGridEngine.format.test.ts
bun run --filter @novasheet/core typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src packages/core/tests/engine/DefaultGridEngine.format.test.ts
git commit -m "feat(core): 支持填充色与基础边框格式命令"
```

---

## Task 4: Canvas Format Fill Painter

**Files:**
- Create: `packages/web-canvas2d/src/painters/FormatFillPainter.ts`
- Modify: `packages/web-canvas2d/src/render/Canvas2DRenderer.ts`
- Test: `packages/web-canvas2d/tests/painters/FormatFillPainter.test.ts`
- Test: `packages/web-canvas2d/tests/render/Canvas2DRenderer.format-fill.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/web-canvas2d/tests/painters/FormatFillPainter.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { FormatFillPainter } from '../../src/painters/FormatFillPainter'
import { createRecordingContext } from '../helpers/recording-context'

describe('FormatFillPainter', () => {
  it('paints fillColor rects before text/grid stages consume the same canvas', () => {
    const { ctx, ops } = createRecordingContext()
    const painter = new FormatFillPainter()

    painter.paint(ctx, {
      rowsAxis: { indexToPosition: (i: number) => i * 24, getSize: () => 24 },
      colsAxis: { indexToPosition: (i: number) => i * 80, getSize: () => 80 },
      rect: { x: 40, y: 24, width: 160, height: 48 },
      rowRange: [0, 1],
      colRange: [0, 1],
      scrollOffsetX: 0,
      scrollOffsetY: 0,
      cellFormats: [{ rowIndex: 1, colIndex: 0, format: { fillColor: '#fff2cc' } }],
    })

    expect(ops).toContainEqual({ op: 'set:fillStyle', value: '#fff2cc' })
    expect(ops).toContainEqual({ op: 'fillRect', args: [40, 48, 80, 24] })
  })
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test packages/web-canvas2d/tests/painters/FormatFillPainter.test.ts
```

Expected: FAIL because `FormatFillPainter` does not exist.

- [ ] **Step 3: Implement painter and renderer hook**

Create `FormatFillPainter`:

- Accept axes, region rect, ranges, scroll offsets, and `RenderFrame.cellFormats`.
- Clip to region rect.
- For each resolved format with `fillColor`, compute:
  - `x = rect.x + colsAxis.indexToPosition(colIndex) - scrollOffsetX`
  - `y = rect.y + rowsAxis.indexToPosition(rowIndex) - scrollOffsetY`
  - `width = colsAxis.getSize(colIndex)`
  - `height = rowsAxis.getSize(rowIndex)`
- Use `ctx.fillStyle = fillColor` and `ctx.fillRect(...)`.

Modify `Canvas2DRenderer`:

- Instantiate `FormatFillPainter`.
- In `paintContentLayer`, after empty-state guard and before `this.ctx.font = ...`, call fill painter for each `paintOrder` region.
- Do not alter `CellPainter`.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test packages/web-canvas2d/tests/painters/FormatFillPainter.test.ts
bun run --filter @novasheet/web-canvas2d typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web-canvas2d/src packages/web-canvas2d/tests
git commit -m "feat(canvas2d): 新增格式填充绘制阶段"
```

---

## Task 5: Canvas Format Border Painter

**Files:**
- Create: `packages/web-canvas2d/src/painters/FormatBorderPainter.ts`
- Modify: `packages/web-canvas2d/src/render/Canvas2DRenderer.ts`
- Test: `packages/web-canvas2d/tests/painters/FormatBorderPainter.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/web-canvas2d/tests/painters/FormatBorderPainter.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { FormatBorderPainter } from '../../src/painters/FormatBorderPainter'
import { createRecordingContext } from '../helpers/recording-context'

describe('FormatBorderPainter', () => {
  it('strokes custom borders after default grid with semantic width mapping', () => {
    const { ctx, ops } = createRecordingContext()
    const painter = new FormatBorderPainter()

    painter.paint(ctx, {
      rowsAxis: { indexToPosition: (i: number) => i * 24, getSize: () => 24 },
      colsAxis: { indexToPosition: (i: number) => i * 80, getSize: () => 80 },
      rect: { x: 40, y: 24, width: 160, height: 48 },
      rowRange: [0, 1],
      colRange: [0, 1],
      scrollOffsetX: 0,
      scrollOffsetY: 0,
      cellFormats: [
        {
          rowIndex: 0,
          colIndex: 0,
          format: {
            borders: { top: { color: '#d93025', width: 'medium', lineStyle: 'solid' } },
          },
        },
      ],
    })

    expect(ops).toContainEqual({ op: 'set:strokeStyle', value: '#d93025' })
    expect(ops).toContainEqual({ op: 'set:lineWidth', value: 2 })
    expect(ops).toContainEqual({ op: 'moveTo', args: [40, 24.5] })
    expect(ops).toContainEqual({ op: 'lineTo', args: [120, 24.5] })
  })
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test packages/web-canvas2d/tests/painters/FormatBorderPainter.test.ts
```

Expected: FAIL because `FormatBorderPainter` does not exist.

- [ ] **Step 3: Implement painter and renderer hook**

Create `FormatBorderPainter`:

- Map widths: `thin -> 1`, `medium -> 2`, `thick -> 3`.
- 5-A only supports `lineStyle === 'solid'`; skip other line styles.
- Group by `color + width`.
- Draw top/right/bottom/left edge lines from `cellFormats`.
- Use `snapLineInside` for every horizontal and vertical border coordinate before `moveTo`.

Modify `Canvas2DRenderer.paintGridLayer()`:

- Keep default grid lines unchanged.
- After default grid lines and frozen separators, call `FormatBorderPainter` for each `paintOrder` region.
- Keep `paintOuterFrame()` after custom borders only if tests show viewport frame must stay above custom borders. If custom borders need to cover the outer frame, move `paintOuterFrame()` before `FormatBorderPainter` and update tests.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test packages/web-canvas2d/tests/painters/FormatBorderPainter.test.ts
bun run --filter @novasheet/web-canvas2d typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web-canvas2d/src packages/web-canvas2d/tests
git commit -m "feat(canvas2d): 新增自定义边框绘制阶段"
```

---

## Task 6: MergeStore + Engine Merge Undo

**Files:**
- Create: `packages/core/src/merge/MergeStore.ts`
- Modify: `packages/core/src/engine/GridEngine.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`
- Modify: `packages/core/src/render/RenderFrame.ts`
- Modify: `packages/core/src/undo/UndoCommand.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/merge/MergeStore.test.ts`
- Test: `packages/core/tests/engine/DefaultGridEngine.merge.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/merge/MergeStore.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { MergeStore } from '../../src/merge/MergeStore'

describe('MergeStore', () => {
  it('creates merge regions and maps any covered cell to the anchor region', () => {
    const store = new MergeStore()
    const region = store.merge({ startRow: 1, endRow: 2, startCol: 3, endCol: 4 })

    expect(region).toEqual({
      id: 'merge-1',
      range: { startRow: 1, endRow: 2, startCol: 3, endCol: 4 },
      anchor: { rowIndex: 1, colIndex: 3 },
    })
    expect(store.getRegionAt(2, 4)?.id).toBe('merge-1')
    expect(store.getRegionAt(0, 0)).toBeNull()
  })

  it('rejects single-cell and overlapping merges', () => {
    const store = new MergeStore()
    expect(store.merge({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 })).toBeNull()
    expect(store.merge({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 })?.id).toBe('merge-1')
    expect(store.merge({ startRow: 1, endRow: 2, startCol: 1, endCol: 2 })).toBeNull()
  })
})
```

Create `packages/core/tests/engine/DefaultGridEngine.merge.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine, InMemoryDataSource } from '../../src'

function makeEngine() {
  return new DefaultGridEngine({
    data: new InMemoryDataSource({
      schema: { fields: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] },
      rows: [{ a: 'A1', b: 'B1' }, { a: 'A2', b: 'B2' }],
    }),
  })
}

describe('DefaultGridEngine merge APIs', () => {
  it('merges, selects the merged range, and supports undo/redo', () => {
    const engine = makeEngine()
    const range = { startRow: 0, endRow: 1, startCol: 0, endCol: 1 }

    expect(engine.mergeCells(range)).toBe(true)
    expect(engine.getMergeRegion(1, 1)?.anchor).toEqual({ rowIndex: 0, colIndex: 0 })
    expect(engine.getSelection().selectedRange).toEqual(range)

    expect(engine.undo()?.kind).toBe('merge')
    expect(engine.getMergeRegion(1, 1)).toBeNull()
    expect(engine.redo()?.kind).toBe('merge')
    expect(engine.getMergeRegion(1, 1)?.id).toBe('merge-1')
  })

  it('unmerges any region touched by the target range', () => {
    const engine = makeEngine()
    engine.mergeCells({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 })

    expect(engine.unmergeCells({ startRow: 1, endRow: 1, startCol: 1, endCol: 1 })).toBe(true)
    expect(engine.getMergeRegion(0, 0)).toBeNull()
  })
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test packages/core/tests/merge/MergeStore.test.ts packages/core/tests/engine/DefaultGridEngine.merge.test.ts
```

Expected: FAIL because `MergeStore` and engine APIs do not exist.

- [ ] **Step 3: Implement merge store and engine commands**

Create `MergeStore` with:

```ts
merge(range: CellRange): MergeRegion | null
unmerge(range: CellRange): readonly MergeRegion[]
getRegionAt(rowIndex: number, colIndex: number): MergeRegion | null
getRegionsInRange(range: CellRange): readonly MergeRegion[]
snapshot(): readonly MergeRegion[]
restore(regions: readonly MergeRegion[]): void
```

Add to `RenderFrame`:

```ts
mergeRegions: readonly MergeRegion[]
```

Add `UndoCommand` variants:

```ts
| { kind: 'merge'; before: readonly MergeRegion[]; after: readonly MergeRegion[]; selectionBefore: GridSelection; selectionAfter: GridSelection }
| { kind: 'unmerge'; before: readonly MergeRegion[]; after: readonly MergeRegion[]; selectionBefore: GridSelection; selectionAfter: GridSelection }
```

`DefaultGridEngine` rules:

- `mergeCells(singleCell)` returns `false`.
- Overlap returns `false`.
- Successful merge selects the full merge range.
- `unmergeCells(range)` removes every merge region touched by `range`.
- Undo/redo restore merge snapshots and selection snapshots.
- `getFrame()` includes all merge regions intersecting visible range.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test packages/core/tests/merge/MergeStore.test.ts packages/core/tests/engine/DefaultGridEngine.merge.test.ts
bun run --filter @novasheet/core typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src packages/core/tests/merge packages/core/tests/engine/DefaultGridEngine.merge.test.ts
git commit -m "feat(core): 新增单元格合并存储与命令"
```

---

## Task 7: Structural Remap for Format and Merge Stores

**Files:**
- Modify: `packages/core/src/format/RangeStyleStore.ts`
- Modify: `packages/core/src/merge/MergeStore.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`
- Test: `packages/core/tests/format/RangeStyleStore.remap.test.ts`
- Test: `packages/core/tests/merge/MergeStore.remap.test.ts`
- Test: `packages/core/tests/engine/DefaultGridEngine.format-merge-structural.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/format/RangeStyleStore.remap.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { RangeStyleStore } from '../../src/format/RangeStyleStore'

describe('RangeStyleStore structural remap', () => {
  it('shifts format ranges after rows and columns are inserted', () => {
    const store = new RangeStyleStore()
    store.apply({ startRow: 2, endRow: 3, startCol: 1, endCol: 1 }, { fillColor: '#fff2cc' })

    store.remapAfterRowsInserted(1, 2)
    store.remapAfterColsInserted(1, 1)

    expect(store.resolveCell(4, 2)?.fillColor).toBe('#fff2cc')
    expect(store.resolveCell(2, 1)).toBeUndefined()
  })

  it('drops deleted rows and columns from format ranges', () => {
    const store = new RangeStyleStore()
    store.apply({ startRow: 0, endRow: 2, startCol: 0, endCol: 2 }, { fillColor: '#fff2cc' })

    store.remapAfterRowsDeleted([1])
    store.remapAfterColsDeleted([0])

    expect(store.resolveCell(0, 0)?.fillColor).toBe('#fff2cc')
    expect(store.resolveCell(1, 1)?.fillColor).toBe('#fff2cc')
    expect(store.resolveCell(2, 1)).toBeUndefined()
  })

  it('moves format ranges with row and column reorder index maps', () => {
    const store = new RangeStyleStore()
    store.apply({ startRow: 0, endRow: 0, startCol: 1, endCol: 1 }, { fillColor: '#fff2cc' })

    store.remapByRowIndexMap(new Map([[0, 2], [1, 0], [2, 1]]))
    store.remapByColIndexMap(new Map([[0, 1], [1, 2], [2, 0]]))

    expect(store.resolveCell(2, 2)?.fillColor).toBe('#fff2cc')
    expect(store.resolveCell(0, 1)).toBeUndefined()
  })
})
```

Create `packages/core/tests/merge/MergeStore.remap.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { MergeStore } from '../../src/merge/MergeStore'

describe('MergeStore structural remap', () => {
  it('shifts merge regions after insertions', () => {
    const store = new MergeStore()
    store.merge({ startRow: 2, endRow: 3, startCol: 1, endCol: 2 })

    store.remapAfterRowsInserted(1, 2)
    store.remapAfterColsInserted(1, 1)

    expect(store.getRegionAt(4, 2)?.range).toEqual({ startRow: 4, endRow: 5, startCol: 2, endCol: 3 })
  })

  it('removes merge regions touched by deleted rows or columns', () => {
    const store = new MergeStore()
    store.merge({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 })

    store.remapAfterRowsDeleted([1])

    expect(store.getRegionAt(0, 0)).toBeNull()
  })

  it('moves merge regions with row and column reorder index maps', () => {
    const store = new MergeStore()
    store.merge({ startRow: 0, endRow: 1, startCol: 1, endCol: 2 })

    store.remapByRowIndexMap(new Map([[0, 2], [1, 3], [2, 0], [3, 1]]))
    store.remapByColIndexMap(new Map([[0, 0], [1, 3], [2, 4], [3, 1], [4, 2]]))

    expect(store.getRegionAt(2, 3)?.range).toEqual({ startRow: 2, endRow: 3, startCol: 3, endCol: 4 })
  })
})
```

Create `packages/core/tests/engine/DefaultGridEngine.format-merge-structural.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine, InMemoryDataSource } from '../../src'

function makeEngine() {
  return new DefaultGridEngine({
    data: new InMemoryDataSource({
      schema: { fields: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }] },
      rows: [{ a: 'A1', b: 'B1', c: 'C1' }, { a: 'A2', b: 'B2', c: 'C2' }, { a: 'A3', b: 'B3', c: 'C3' }],
    }),
  })
}

describe('DefaultGridEngine format/merge structural remap', () => {
  it('keeps format and merge coordinates aligned after row/col insertions', () => {
    const engine = makeEngine()
    engine.setFillColor({ startRow: 1, endRow: 1, startCol: 1, endCol: 1 }, '#fff2cc')
    engine.mergeCells({ startRow: 1, endRow: 2, startCol: 1, endCol: 2 })

    engine.insertRows(1, 1)
    engine.insertCols(1, 1)

    expect(engine.getCellFormat(2, 2)?.fillColor).toBe('#fff2cc')
    expect(engine.getMergeRegion(2, 2)?.range).toEqual({ startRow: 2, endRow: 3, startCol: 2, endCol: 3 })
  })

  it('keeps format and merge coordinates aligned after row and column moves', () => {
    const engine = makeEngine()
    engine.setFillColor({ startRow: 0, endRow: 0, startCol: 1, endCol: 1 }, '#fff2cc')
    engine.mergeCells({ startRow: 0, endRow: 1, startCol: 1, endCol: 2 })

    expect(engine.moveRows([0, 1], null)).toBe(true)
    expect(engine.moveCols(['b', 'c'], null)).toBe(true)

    expect(engine.getCellFormat(1, 1)?.fillColor).toBe('#fff2cc')
    expect(engine.getMergeRegion(1, 1)?.range).toEqual({ startRow: 1, endRow: 2, startCol: 1, endCol: 2 })
  })
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test packages/core/tests/format/RangeStyleStore.remap.test.ts packages/core/tests/merge/MergeStore.remap.test.ts packages/core/tests/engine/DefaultGridEngine.format-merge-structural.test.ts
```

Expected: FAIL because remap methods do not exist or engine does not call them.

- [ ] **Step 3: Implement remap methods**

Add to `RangeStyleStore`:

```ts
remapAfterRowsInserted(at: number, count: number): void
remapAfterRowsDeleted(removedSorted: readonly number[]): void
remapAfterColsInserted(at: number, count: number): void
remapAfterColsDeleted(removedSorted: readonly number[]): void
remapByRowIndexMap(indexMap: ReadonlyMap<number, number>): void
remapByColIndexMap(indexMap: ReadonlyMap<number, number>): void
```

Add same method names to `MergeStore`.

Rules:

- Insertions shift ranges at or after insertion index.
- Deletions rebuild each range from surviving row/col indices.
- If a style range has no surviving rows or columns, drop that layer.
- If a merge region is touched by a deleted row or col, remove the whole merge region in 5-A. Do not shrink merge regions; that needs a separate UX decision.

Call these methods from existing `DefaultGridEngine` row/col structural mutation paths:

- `insertRows`
- `deleteRows`
- `insertCols`
- `deleteCols`
- `moveRows`
- `moveCols`

Do not remap on hide/unhide; hidden rows/cols affect view visibility, not raw format coordinates.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test packages/core/tests/format/RangeStyleStore.remap.test.ts packages/core/tests/merge/MergeStore.remap.test.ts packages/core/tests/engine/DefaultGridEngine.format-merge-structural.test.ts
bun run --filter @novasheet/core typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src packages/core/tests/format/RangeStyleStore.remap.test.ts packages/core/tests/merge/MergeStore.remap.test.ts packages/core/tests/engine/DefaultGridEngine.format-merge-structural.test.ts
git commit -m "feat(core): 同步结构变更中的格式与合并坐标"
```

---

## Task 8: Merge-Aware Rendering

**Files:**
- Modify: `packages/web-canvas2d/src/render/Canvas2DRenderer.ts`
- Modify: `packages/web-canvas2d/src/painters/FormatFillPainter.ts`
- Modify: `packages/web-canvas2d/src/painters/FormatBorderPainter.ts`
- Test: `packages/web-canvas2d/tests/render/Canvas2DRenderer.merge.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/web-canvas2d/tests/render/Canvas2DRenderer.merge.test.ts` using existing renderer test helpers. Assert:

```ts
it('draws merged region text once at the anchor and skips covered non-anchor cells', () => {
  // frame.data has A1/B1/A2/B2 values
  // frame.mergeRegions includes A1:B2
  // render()
  // expect fillText("A1", ...) once
  // expect no fillText("B1"), no fillText("A2"), no fillText("B2")
})
```

Also assert `FormatFillPainter` paints the full merged visual rect when the anchor has fill.

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test packages/web-canvas2d/tests/render/Canvas2DRenderer.merge.test.ts
```

Expected: FAIL because renderer ignores `mergeRegions`.

- [ ] **Step 3: Implement merge-aware paint**

Rules:

- Build a per-frame lookup from covered cell key `row:col` to merge region.
- In normal cell loop:
  - skip non-anchor cells covered by a merge.
  - for anchor cells, compute merged rect by summing axis `getSize()` across the merge range.
  - draw anchor value once in merged rect.
- `FormatFillPainter`:
  - if a cell format belongs to a merge anchor, paint merged rect.
  - if a non-anchor has resolved format, ignore it unless later product decision says non-anchor style participates.
- `FormatBorderPainter`:
  - for 5-A, border presets stored on cell edges can draw normally; no special merge border synthesis unless tests show duplicate inner lines. If duplicate inner lines appear inside merged region, filter covered internal edges.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test packages/web-canvas2d/tests/render/Canvas2DRenderer.merge.test.ts
bun run --filter @novasheet/web-canvas2d typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web-canvas2d/src packages/web-canvas2d/tests/render/Canvas2DRenderer.merge.test.ts
git commit -m "feat(canvas2d): 支持合并单元格绘制"
```

---

## Task 9: Web/Public API + Clipboard Merge Guard

**Files:**
- Modify: `packages/web/src/grid/GridController.ts`
- Modify: `packages/web/src/Grid.ts`
- Modify: `packages/web/src/backends/Canvas2DBackend.ts`
- Modify: `packages/core/src/clipboard/types.ts`
- Modify: `packages/core/src/clipboard/ApplyPaste.ts`
- Test: `packages/web/tests/Grid.format.test.ts`
- Test: `packages/core/tests/clipboard/ApplyPaste.merge.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/web/tests/Grid.format.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { Grid } from '../src/Grid'
import { InMemoryDataSource } from '@novasheet/core'

describe('Grid Phase 5-A APIs', () => {
  it('forwards fill, border, merge, and unmerge to the controller', () => {
    const container = document.createElement('div')
    const grid = new Grid(container, {
      data: new InMemoryDataSource({
        schema: { fields: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] },
        rows: [{ a: 'A1', b: 'B1' }, { a: 'A2', b: 'B2' }],
      }),
    })

    expect(grid.setFillColor({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, '#fff2cc')).toBe(true)
    expect(
      grid.setBorders(
        { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
        'outer',
        { color: '#d93025', width: 'thin', lineStyle: 'solid' },
      ),
    ).toBe(true)
    expect(grid.mergeCells({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 })).toBe(true)
    expect(grid.unmergeCells({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 })).toBe(true)

    grid.destroy()
  })
})
```

Create `packages/core/tests/clipboard/ApplyPaste.merge.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { pasteTargetConflictsWithMerges } from '../../src/clipboard/ApplyPaste'

describe('pasteTargetConflictsWithMerges', () => {
  it('rejects target ranges that partially overlap merge regions', () => {
    const target = { startRow: 0, endRow: 0, startCol: 0, endCol: 0, tile: { rows: 1, cols: 1 } }
    const merges = [
      { id: 'merge-1', range: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 }, anchor: { rowIndex: 0, colIndex: 0 } },
    ]

    expect(pasteTargetConflictsWithMerges(target, merges)).toBe(true)
  })
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test packages/web/tests/Grid.format.test.ts packages/core/tests/clipboard/ApplyPaste.merge.test.ts
```

Expected: FAIL because APIs and helper do not exist.

- [ ] **Step 3: Implement public API and paste guard**

Add to `GridController` and `Canvas2DBackend`:

```ts
setFillColor(range: CellRange, color: string | null): boolean
setBorders(range: CellRange, preset: BorderPreset, border: BorderStyle | null): boolean
mergeCells(range: CellRange): boolean
unmergeCells(range: CellRange): boolean
```

Each method calls engine, then invalidates renderer if changed.

Add same methods to `Grid`.

Extend `PasteSkippedCell.reason`:

```ts
readonly reason: 'type' | 'readonly' | 'merge'
```

Add pure helper:

```ts
pasteTargetConflictsWithMerges(target: PasteTargetRect, merges: readonly MergeRegion[]): boolean
```

Engine `commitPaste()` must call this helper before applying writes. If conflict:

- call `onSkipped` once with the active target top-left field and `reason: 'merge'`
- do not write values
- do not push undo

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test packages/web/tests/Grid.format.test.ts packages/core/tests/clipboard/ApplyPaste.merge.test.ts
bun run --filter '*' typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/clipboard packages/core/tests/clipboard packages/web/src packages/web/tests/Grid.format.test.ts
git commit -m "feat(web): 暴露 Phase 5-A 格式与合并 API"
```

---

## Task 10: Storybook Range Formatting Story

**Files:**
- Create: `apps/storybook/src/stories/RangeFormatting.stories.ts`
- Create: `apps/storybook/src/stories/snippets/range-formatting.basic.snippet.ts`
- Test: `apps/storybook/src/stories/RangeFormatting.stories.ts`

- [ ] **Step 1: Add story**

Create a story titled `表格/合并与格式化` with:

- a grid using `withExcelHeaders`
- buttons:
  - `填充黄色`
  - `红色外框`
  - `全部细边框`
  - `合并选区`
  - `取消合并`
  - `Undo`
  - `Redo`
- a status line showing last action.

Use public `Grid` APIs only; do not reach into engine internals.

- [ ] **Step 2: Verify story compiles**

Run:

```bash
bun run --filter @novasheet/storybook build-storybook
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/storybook/src/stories/RangeFormatting.stories.ts apps/storybook/src/stories/snippets/range-formatting.basic.snippet.ts
git commit -m "feat(storybook): 新增合并与 Range 格式化示例"
```

---

## Task 11: Final Verification + Docs Sync

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-05-28-novasheet-phase-5-merge-range-formatting.md` only if implementation changed a decision

- [ ] **Step 1: Update README status text**

If all tasks shipped, update README Phase 5 row from `计划中` to the precise delivered state:

```md
| Phase 5-A 合并 / 基础 Range 格式化 | 单元格合并 / 填充色 / 基础边框颜色与粗细 / undo-redo / 内部复制粘贴格式 | ✅ | [spec](...) · [plan](...) |
```

Keep 5-B/C/D as planned follow-ups.

- [ ] **Step 2: Run full gates**

Run:

```bash
bun run lint
bun run --filter '*' typecheck
bun test
bun run --filter @novasheet/web build && bun run --filter @novasheet/web-canvas2d build && bun run --filter @novasheet/core build
```

Expected:

- lint: 0 errors / 0 warnings
- typecheck: PASS
- tests: PASS
- builds: PASS in the specified order

- [ ] **Step 3: Commit docs/status**

```bash
git add README.md docs/superpowers/specs/2026-05-28-novasheet-phase-5-merge-range-formatting.md
git commit -m "docs(repo): 更新 Phase 5-A 交付状态"
```

---

## Plan Self-Review Checklist

| Spec requirement | Covered by |
| --- | --- |
| `CellFormat` independent from `CellValue` | Task 1 |
| sparse range style store | Task 1 |
| fill color | Tasks 3, 4 |
| border presets/color/width/solid style | Tasks 2, 3, 5 |
| undo/redo for format | Task 3 |
| merge/unmerge | Tasks 6, 8 |
| row/col structural remap | Task 7 |
| single canvas internal render stages | Tasks 4, 5, 8 |
| internal clipboard merge guard | Task 9 |
| public API | Task 9 |
| Storybook | Task 10 |
| full gates | Task 11 |

Known implementation gate:

- Merge + sort/filter is conservative; if current runtime cannot block or reason about it cleanly, stop and amend this plan before implementation.
