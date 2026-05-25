# NovaSheet Phase 4.7 Column Drag Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Google Sheets-style selected-column drag reorder: select one or more visible columns, drag from the selected column header, show a DOM drag-following band immediately on pointerdown, show a snapped drop line for active drag, and commit schema reorder on pointerup.

**Architecture:** Core owns schema order mutation (`moveFields` / `moveCols`) and undo/redo. Web runtime owns the pointer state machine and DOM-only preview overlay. Canvas remains unchanged except for normal repaint after schema order changes.

**Tech Stack:** TypeScript, bun:test, `@novasheet/core`, `@novasheet/web`, Storybook HTML.

---

## File Map

| File | Responsibility |
| --- | --- |
| `packages/core/src/data/DataSource.ts` | Add `colsMoved` event variant |
| `packages/core/src/data/MutableDataSource.ts` | Add optional `moveFields` |
| `packages/core/src/data/InMemoryDataSource.ts` | Implement schema reorder + event emit |
| `packages/core/src/engine/GridEngine.ts` | Add `moveCols` contract |
| `packages/core/src/engine/DefaultGridEngine.ts` | Implement normalize/move, axis width preservation, selection remap, undo |
| `packages/core/src/undo/UndoCommand.ts` | Add `moveCols` variant |
| `packages/web/src/grid/GridController.ts` | Add controller API |
| `packages/web/src/Grid.ts` | Add facade API + `onColumnsMoved` callback |
| `packages/web/src/overlay/ColumnReorderOverlay.ts` | DOM drag-following band + snapped drop line |
| `packages/web/src/backends/Canvas2DBackend.ts` | Instantiate overlay |
| `packages/web/src/runtime/WebGridRuntime.ts` | Header drag state machine + preview/drop commit |
| `apps/storybook/src/stories/ColumnReorder.stories.ts` | Manual demo stories |

---

### Task 1: DataSource `moveFields`

**Files:**
- Modify: `packages/core/src/data/DataSource.ts`
- Modify: `packages/core/src/data/MutableDataSource.ts`
- Modify: `packages/core/src/data/InMemoryDataSource.ts`
- Test: `packages/core/tests/data/InMemoryDataSource.moveField.test.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/core/tests/data/InMemoryDataSource.moveField.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'
import type { DataSourceEvent } from '../../src/data/DataSource'

const schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text' as const },
    { id: 'b', name: 'B', type: 'text' as const },
    { id: 'c', name: 'C', type: 'text' as const },
    { id: 'd', name: 'D', type: 'text' as const },
  ],
}

describe('InMemoryDataSource.moveFields', () => {
  it('moves a contiguous field group before a target field and emits colsMoved', () => {
    const ds = new InMemoryDataSource({ schema, rows: [{ a: 'A', b: 'B', c: 'C', d: 'D' }] })
    const events: DataSourceEvent[] = []
    ds.subscribe((event) => events.push(event))

    ds.moveFields!(['b', 'c'], 'a')

    expect(ds.getSchema().fields.map((field) => field.id)).toEqual(['b', 'c', 'a', 'd'])
    expect(ds.getCell(0, 'b')).toBe('B')
    expect(events).toEqual([{ type: 'colsMoved', fieldIds: ['b', 'c'], beforeFieldId: 'a' }])
  })

  it('moves fields to the end when beforeFieldId is null', () => {
    const ds = new InMemoryDataSource({ schema, rows: [] })

    ds.moveFields!(['a', 'b'], null)

    expect(ds.getSchema().fields.map((field) => field.id)).toEqual(['c', 'd', 'a', 'b'])
  })

  it('treats unknown fields and self targets as no-op', () => {
    const ds = new InMemoryDataSource({ schema, rows: [] })

    ds.moveFields!(['x'], 'a')
    ds.moveFields!(['b', 'c'], 'c')

    expect(ds.getSchema().fields.map((field) => field.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test packages/core/tests/data/InMemoryDataSource.moveField.test.ts
```

Expected: FAIL because `moveFields` is not implemented / type does not exist.

- [ ] **Step 3: Implement minimal data mutation**

Add the event variant:

```ts
| { type: 'colsMoved'; fieldIds: readonly string[]; beforeFieldId: string | null }
```

Add optional `moveFields` to `MutableDataSource`, then implement in `InMemoryDataSource`:

```ts
moveFields(fieldIds: readonly string[], beforeFieldId: string | null): void {
  const ids = new Set(fieldIds)
  const moving = this.schema.fields.filter((field) => ids.has(field.id))
  if (moving.length === 0) return
  if (beforeFieldId !== null && ids.has(beforeFieldId)) return
  const remaining = this.schema.fields.filter((field) => !ids.has(field.id))
  const at =
    beforeFieldId === null
      ? remaining.length
      : remaining.findIndex((field) => field.id === beforeFieldId)
  if (at < 0) return
  const next = remaining.slice()
  next.splice(at, 0, ...moving)
  if (next.map((field) => field.id).join('\0') === this.schema.fields.map((field) => field.id).join('\0')) return
  this.schema = { ...this.schema, fields: next }
  this.emit({ type: 'colsMoved', fieldIds: moving.map((field) => field.id), beforeFieldId })
}
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test packages/core/tests/data/InMemoryDataSource.moveField.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/data/DataSource.ts packages/core/src/data/MutableDataSource.ts packages/core/src/data/InMemoryDataSource.ts packages/core/tests/data/InMemoryDataSource.moveField.test.ts
git commit -m "feat(core): 新增字段重排数据源协议"
```

---

### Task 2: Engine `moveCols` + Undo

**Files:**
- Modify: `packages/core/src/engine/GridEngine.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`
- Modify: `packages/core/src/undo/UndoCommand.ts`
- Test: `packages/core/tests/engine/DefaultGridEngine.col-reorder.test.ts`
- Test: `packages/core/tests/undo/UndoStack.col-reorder.test.ts`

- [ ] **Step 1: Write failing engine tests**

Create `packages/core/tests/engine/DefaultGridEngine.col-reorder.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource, DefaultGridEngine, denseGridTheme } from '../../src'
import type { Schema } from '../../src'

function makeEngine() {
  const schema: Schema = {
    fields: [
      { id: 'a', name: 'A', type: 'text', width: 80 },
      { id: 'b', name: 'B', type: 'text', width: 120 },
      { id: 'c', name: 'C', type: 'text', width: 140 },
      { id: 'd', name: 'D', type: 'text', width: 160 },
    ],
  }
  return new DefaultGridEngine({
    data: new InMemoryDataSource({ schema, rows: [{ a: 'A', b: 'B', c: 'C', d: 'D' }] }),
    theme: denseGridTheme,
    frozen: { leftCols: 1 },
  })
}

describe('DefaultGridEngine.moveCols', () => {
  it('moves multiple columns before a target and preserves widths/cells', () => {
    const engine = makeEngine()

    expect(engine.moveCols(['b', 'c'], 'a')).toBe(true)

    expect(engine.getData().getSchema().fields.map((field) => field.id)).toEqual(['b', 'c', 'a', 'd'])
    expect(engine.getData().getCell(0, 'c')).toBe('C')
    expect(engine.getColsAxis().getSize(0)).toBe(120)
    expect(engine.getColsAxis().getSize(1)).toBe(140)
  })

  it('keeps hidden field ids anchored after reorder', () => {
    const engine = makeEngine()
    engine.hideCols(['c'])

    engine.moveCols(['a'], null)
    engine.unhideCols(['c'])

    expect(engine.getData().getSchema().fields.map((field) => field.id)).toEqual(['b', 'c', 'd', 'a'])
  })

  it('returns false and does not push undo for equivalent self drops', () => {
    const engine = makeEngine()

    expect(engine.moveCols(['b', 'c'], 'b')).toBe(false)
    expect(engine.canUndo()).toBe(false)
  })
})
```

Create `packages/core/tests/undo/UndoStack.col-reorder.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine, InMemoryDataSource, denseGridTheme } from '../../src'

describe('UndoStack — moveCols', () => {
  it('undo / redo restores schema order after column reorder', () => {
    const engine = new DefaultGridEngine({
      data: new InMemoryDataSource({
        schema: {
          fields: [
            { id: 'a', name: 'A', type: 'text' },
            { id: 'b', name: 'B', type: 'text' },
            { id: 'c', name: 'C', type: 'text' },
          ],
        },
        rows: [],
      }),
      theme: denseGridTheme,
    })

    engine.moveCols(['a'], null)
    expect(engine.getData().getSchema().fields.map((field) => field.id)).toEqual(['b', 'c', 'a'])

    engine.undo()
    expect(engine.getData().getSchema().fields.map((field) => field.id)).toEqual(['a', 'b', 'c'])

    engine.redo()
    expect(engine.getData().getSchema().fields.map((field) => field.id)).toEqual(['b', 'c', 'a'])
  })
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test packages/core/tests/engine/DefaultGridEngine.col-reorder.test.ts packages/core/tests/undo/UndoStack.col-reorder.test.ts
```

Expected: FAIL because `moveCols` does not exist.

- [ ] **Step 3: Implement engine and undo**

Add `moveCols` to `GridEngine`, add `moveCols` undo variant, then implement:

```ts
moveCols(fieldIds: readonly string[], beforeFieldId: string | null): boolean {
  if (!isMutableDataSource(this.rawData) || !this.rawData.moveFields) return false
  const selectionBefore = this.selection.getSelection()
  const beforeOrder = this.rawData.getSchema().fields.map((field) => field.id)
  const normalized = this.normalizeMoveCols(fieldIds, beforeFieldId)
  if (!normalized) return false
  const widthById = new Map(beforeOrder.map((id, index) => [id, this.rawColsAxis.getSize(index)]))
  this.rawData.moveFields(normalized.fieldIds, normalized.beforeFieldId)
  this.rebuildRawColsAxisFromSchema(widthById)
  this.rebuildViewColsAxis()
  this.restoreSelectionByFieldIds(selectionBefore, beforeOrder)
  const selectionAfter = this.selection.getSelection()
  this.undoStack.push({
    kind: 'moveCols',
    fieldIds: normalized.fieldIds,
    beforeFieldId: normalized.beforeFieldId,
    beforeOrder,
    afterOrder: this.rawData.getSchema().fields.map((field) => field.id),
    selectionBefore,
    selectionAfter,
  })
  return true
}
```

Use an internal helper for undo/redo that restores exact `beforeOrder` / `afterOrder` without pushing a new command.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test packages/core/tests/engine/DefaultGridEngine.col-reorder.test.ts packages/core/tests/undo/UndoStack.col-reorder.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/engine/GridEngine.ts packages/core/src/engine/DefaultGridEngine.ts packages/core/src/undo/UndoCommand.ts packages/core/tests/engine/DefaultGridEngine.col-reorder.test.ts packages/core/tests/undo/UndoStack.col-reorder.test.ts
git commit -m "feat(core): 新增列重排引擎能力与 undo"
```

---

### Task 3: DOM `ColumnReorderOverlay`

**Files:**
- Create: `packages/web/src/overlay/ColumnReorderOverlay.ts`
- Test: `packages/web/tests/overlay/ColumnReorderOverlay.test.ts`

- [ ] **Step 1: Write failing overlay test**

```ts
import { describe, expect, it } from 'bun:test'
import { ColumnReorderOverlay } from '../../src/overlay/ColumnReorderOverlay'

describe('ColumnReorderOverlay', () => {
  it('shows drag-following band and snapped drop line, then hides them', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    const overlay = new ColumnReorderOverlay(root)

    overlay.show({ lineX: 240, dragBandX: 180, bandWidth: 260, height: 600 })

    const band = root.querySelector('[data-novasheet-column-reorder-band]') as HTMLElement
    const line = root.querySelector('[data-novasheet-column-reorder-line]') as HTMLElement
    expect(band.style.left).toBe('180px')
    expect(band.style.width).toBe('260px')
    expect(line.style.left).toBe('240px')

    overlay.hide()
    expect(band.style.display).toBe('none')
    expect(line.style.display).toBe('none')

    overlay.destroy()
    expect(root.querySelector('[data-novasheet-column-reorder-band]')).toBeNull()
    document.body.removeChild(root)
  })
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test packages/web/tests/overlay/ColumnReorderOverlay.test.ts
```

Expected: FAIL because the file does not exist.

- [ ] **Step 3: Implement overlay**

Create a small DOM class with `show`, `hide`, `destroy`; use `position:absolute`, `pointerEvents:none`, and fixed rgba values from the spec.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test packages/web/tests/overlay/ColumnReorderOverlay.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/overlay/ColumnReorderOverlay.ts packages/web/tests/overlay/ColumnReorderOverlay.test.ts
git commit -m "feat(web): 新增列重排 DOM 预览层"
```

---

### Task 4: Runtime Header Drag State Machine

**Files:**
- Modify: `packages/web/src/runtime/WebGridRuntime.ts`
- Modify: `packages/web/src/backends/Canvas2DBackend.ts`
- Test: `packages/web/tests/runtime/WebGridRuntime.col-reorder.test.ts`

- [ ] **Step 1: Write failing runtime tests**

Cover these behaviors:

```ts
it('starts column reorder only after pointer moves beyond threshold from a selected header')
it('moves selected multiple columns on pointerup and hides preview')
it('clicking an unselected header selects it and does not reorder on the same pointerdown')
it('body drag-select does not enter column reorder')
it('resize drag blocks column reorder')
```

Use the existing runtime test helpers in `packages/web/tests/runtime/WebGridRuntime.test.ts` as the template.

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test packages/web/tests/runtime/WebGridRuntime.col-reorder.test.ts
```

Expected: FAIL because runtime has no column reorder state.

- [ ] **Step 3: Implement runtime state**

Add constructor injection for `ColumnReorderOverlay`, seed drag in `handleHostPointerDown` only for selected column headers, update overlay in `handleHostPointerMove`, commit in `handleHostPointerUp`, cancel on destroy/Escape.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test packages/web/tests/runtime/WebGridRuntime.col-reorder.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/runtime/WebGridRuntime.ts packages/web/src/backends/Canvas2DBackend.ts packages/web/tests/runtime/WebGridRuntime.col-reorder.test.ts
git commit -m "feat(web): 接入列头拖拽重排状态机"
```

---

### Task 5: Grid Facade + Integration

**Files:**
- Modify: `packages/web/src/grid/GridController.ts`
- Modify: `packages/web/src/Grid.ts`
- Test: `packages/web/tests/Grid.col-reorder.test.ts`
- Test: `packages/web/tests/integration/Phase47.scenarios.test.ts`

- [ ] **Step 1: Write failing facade/integration tests**

Facade test:

```ts
it('Grid.moveCols delegates and emits onColumnsMoved only when order changes')
```

Integration test:

```ts
it('Phase 4.7: moving D:E before B preserves cells, hidden ids, and undo/redo')
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test packages/web/tests/Grid.col-reorder.test.ts packages/web/tests/integration/Phase47.scenarios.test.ts
```

Expected: FAIL because facade API does not exist.

- [ ] **Step 3: Implement facade**

Add `moveCols` to controller/runtime/facade and `onColumnsMoved` callback in `GridOptions`.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test packages/web/tests/Grid.col-reorder.test.ts packages/web/tests/integration/Phase47.scenarios.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/grid/GridController.ts packages/web/src/Grid.ts packages/web/tests/Grid.col-reorder.test.ts packages/web/tests/integration/Phase47.scenarios.test.ts
git commit -m "feat(web): 暴露列重排 facade 与集成场景"
```

---

### Task 6: Storybook + Docs State

**Files:**
- Create: `apps/storybook/src/stories/ColumnReorder.stories.ts`
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add Storybook story**

Create stories: `Default`, `MultiColumn`, `HiddenCols`.

- [ ] **Step 2: Update docs**

Update README milestone table: Phase 4.7 status complete after implementation. Update CLAUDE current state: Last shipped Phase 4.7, next milestone deferred / ask user.

- [ ] **Step 3: Run focused checks**

Run:

```bash
bun run --filter @novasheet/storybook typecheck
bun run --filter @novasheet/storybook build-storybook
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/storybook/src/stories/ColumnReorder.stories.ts README.md CLAUDE.md
git commit -m "docs(repo): Phase 4.7 标记为已落地"
```

---

### Task 7: Final Verification

**Files:** all touched files

- [ ] **Step 1: Run all required gates**

```bash
bun run lint
bun run --filter '*' typecheck
bun test
bun run --filter @novasheet/web build && bun run --filter @novasheet/web-canvas2d build && bun run --filter @novasheet/core build
```

Expected:

- lint: 0 errors / 0 warnings
- typecheck: exit 0
- test: all tests pass
- build chain: exit 0

- [ ] **Step 2: Self-review**

Check:

```bash
git diff --stat main...HEAD
git diff main...HEAD -- packages/core/src packages/web/src packages/core/tests packages/web/tests
```

Verify no unrelated refactor, no `npm`/`yarn`/`pnpm` artifacts, no hardcoded canvas painter visual values.

- [ ] **Step 3: Final code-review pass**

Review against spec invariants:

- No mutation during drag before pointerup
- DOM overlay only for preview
- No hidden gap drag/drop
- No no-op undo entries
- Resize/contextmenu/body drag-selection priority preserved

---

## Plan Self-Review

- [x] Spec coverage: data protocol, engine, undo, DOM overlay, runtime, facade, Storybook, docs, final gates
- [x] Placeholder scan: no incomplete placeholder steps
- [x] Type consistency: `moveFields`, `colsMoved`, `moveCols`, `ColumnReorderOverlay` names align across tasks
- [x] TDD rhythm: each implementation task starts with failing tests and explicit RED/GREEN commands
