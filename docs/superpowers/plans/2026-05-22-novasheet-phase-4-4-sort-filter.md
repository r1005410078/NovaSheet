# Phase 4.4 排序 / 筛选实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现列头排序、单列筛选、ViewLayer 管线，并让 selection / undo / redo 在排序筛选视图下保持底层行语义正确。

**Architecture:** Core 新增 `ViewLayer` / `ViewPipeline` 与 `SortLayer` / `FilterLayer`，通过 `DataSource -> DataSource` wrapper 组合视图。`DefaultGridEngine` 继续使用 view 坐标渲染和选择，但 undo command 写入底层 rowIndex；Web 层只负责任务分派、DOM popover、header 菜单与事件。Renderer 只消费 `RenderFrame.viewPipeline` 做 header icon 绘制。

**Tech Stack:** TypeScript、Bun test、`@novasheet/core`、`@novasheet/web`、`@novasheet/web-canvas2d`、DOM overlay、Canvas2D painter。

---

## 文件结构

新增：

- `packages/core/src/view/ViewLayer.ts` — ViewLayer 协议、`HeaderDecoration`、`ColumnHeaderMenuContext`、`ViewLayerChange`。
- `packages/core/src/view/ViewPipeline.ts` — layer 装配、rebuild、header decoration 汇总、菜单贡献汇总、change 订阅。
- `packages/core/src/view/coordinates.ts` — `resolveUnderlyingRow` / `findViewRow` identity fallback helper。
- `packages/core/src/view/SortLayer.ts` — 单列三态排序与 `SortedDataSource` wrapper。
- `packages/core/src/view/FilterLayer.ts` — 单列 typed predicate 筛选与 `FilteredDataSource` wrapper。
- `packages/core/tests/view/ViewPipeline.test.ts`
- `packages/core/tests/view/SortLayer.test.ts`
- `packages/core/tests/view/FilterLayer.test.ts`
- `packages/web/src/interaction/FilterPopover.ts` — DOM 筛选面板。
- `packages/web/tests/interaction/FilterPopover.test.ts`
- `apps/storybook/src/stories/SortFilter.stories.ts`

修改：

- `packages/core/src/data/DataSource.ts` — optional `resolveUnderlyingRow` / `findViewRow`。
- `packages/core/src/data/MutableDataSource.ts` — optional `updateCellByUnderlyingRow`，`isMutableDataSource` 类型守卫保持可用。
- `packages/core/src/data/InMemoryDataSource.ts` — 实现 `updateCellByUnderlyingRow` 为 identity 写入。
- `packages/core/src/interaction/ContextMenuModel.ts` — 泛化 cell / columnHeader 菜单上下文与 action。
- `packages/core/src/theme/Theme.ts`、`packages/core/src/theme/denseGridTheme.ts` — 新增 sort / filter icon。
- `packages/core/src/render/RenderFrame.ts` — 携带 `viewPipeline?: ViewPipeline`。
- `packages/core/src/engine/GridEngine.ts`、`packages/core/src/engine/DefaultGridEngine.ts` — view change 协调、底层行 undo/redo、公开 selection helper。
- `packages/core/src/index.ts` — export view APIs。
- `packages/web-canvas2d/src/painters/HeaderPainter.ts` — 绘制 sort / filter icon，文本预留 icon 区域。
- `packages/web-canvas2d/src/render/Canvas2DRenderer.ts` — 把 `frame.viewPipeline` 传给 HeaderPainter。
- `packages/web/src/runtime/WebGridRuntime.ts` — 列头右键、popover 生命周期、键盘 gate、viewChange 后刷新。
- `packages/web/src/backends/Canvas2DBackend.ts` — 创建 `FilterPopover` 并注入 runtime。
- `packages/web/src/grid/GridController.ts`、`packages/web/src/Grid.ts`、`packages/web/src/index.ts` — public API 与事件。
- `README.md` — Phase 4.4 完成后更新状态。

---

## Task 1: Core 坐标协议

**Files:**
- Modify: `packages/core/src/data/DataSource.ts`
- Modify: `packages/core/src/data/MutableDataSource.ts`
- Modify: `packages/core/src/data/InMemoryDataSource.ts`
- Create: `packages/core/src/view/coordinates.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/data/InMemoryDataSource.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `packages/core/tests/data/InMemoryDataSource.test.ts`:

```ts
it('updates cells by underlying row with identity semantics', () => {
  const ds = new InMemoryDataSource({
    schema,
    rows: [{ name: 'A' }, { name: 'B' }],
  })

  ds.updateCellByUnderlyingRow(1, 'name', 'B2')

  expect(ds.getCell(1, 'name')).toBe('B2')
})
```

Create `packages/core/tests/view/coordinates.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import type { DataSource } from '../../src/data/DataSource'
import { findViewRow, resolveUnderlyingRow } from '../../src/view/coordinates'

const identitySource: DataSource = {
  getRowCount: () => 3,
  getSchema: () => ({ fields: [] }),
  getRows: () => [],
  getCell: () => undefined,
  subscribe: () => () => {},
}

describe('view coordinates helpers', () => {
  it('falls back to identity for undecorated sources', () => {
    expect(resolveUnderlyingRow(identitySource, 2)).toBe(2)
    expect(findViewRow(identitySource, 2)).toBe(2)
  })

  it('uses decorated source coordinate methods when present', () => {
    const source = {
      ...identitySource,
      resolveUnderlyingRow: (row: number) => row + 10,
      findViewRow: (row: number) => row - 10,
    }
    expect(resolveUnderlyingRow(source, 2)).toBe(12)
    expect(findViewRow(source, 12)).toBe(2)
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
bun test packages/core/tests/data/InMemoryDataSource.test.ts packages/core/tests/view/coordinates.test.ts
```

Expected: FAIL because `coordinates.ts` and `updateCellByUnderlyingRow` do not exist.

- [ ] **Step 3: Implement protocol**

Add optional methods to `DataSource`, add optional method to `MutableDataSource`, implement `InMemoryDataSource.updateCellByUnderlyingRow` as `this.updateCell(underlyingRow, fieldId, value)`, create:

```ts
// packages/core/src/view/coordinates.ts
import type { DataSource } from '../data/DataSource'

export function resolveUnderlyingRow(source: DataSource, viewRow: number): number {
  return source.resolveUnderlyingRow?.(viewRow) ?? viewRow
}

export function findViewRow(source: DataSource, underlyingRow: number): number {
  return source.findViewRow?.(underlyingRow) ?? underlyingRow
}
```

Export both helpers from `packages/core/src/index.ts`.

- [ ] **Step 4: Run tests**

Run:

```bash
bun test packages/core/tests/data/InMemoryDataSource.test.ts packages/core/tests/view/coordinates.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/data/DataSource.ts packages/core/src/data/MutableDataSource.ts packages/core/src/data/InMemoryDataSource.ts packages/core/src/view/coordinates.ts packages/core/src/index.ts packages/core/tests/data/InMemoryDataSource.test.ts packages/core/tests/view/coordinates.test.ts
git commit -m "feat(core): add view coordinate protocol"
```

---

## Task 2: ViewLayer / ViewPipeline

**Files:**
- Create: `packages/core/src/view/ViewLayer.ts`
- Create: `packages/core/src/view/ViewPipeline.ts`
- Create: `packages/core/tests/view/ViewPipeline.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests**

Create tests that use two small fake layers:

```ts
import { describe, expect, it } from 'bun:test'
import type { DataSource } from '../../src/data/DataSource'
import type { ColumnHeaderMenuContext, HeaderDecoration, ViewLayer, ViewLayerChange } from '../../src/view/ViewLayer'
import { ViewPipeline } from '../../src/view/ViewPipeline'

const source: DataSource = {
  getRowCount: () => 3,
  getSchema: () => ({ fields: [{ id: 'name', name: 'Name', type: 'text', width: 120 }] }),
  getRows: () => [],
  getCell: (row) => row,
  subscribe: () => () => {},
}

class FakeLayer implements ViewLayer<string | null> {
  readonly id: string
  private spec: string | null = null
  private notify: ((change: ViewLayerChange) => void) | null = null
  constructor(id: string, private decoration: HeaderDecoration) {
    this.id = id
  }
  bindPipeline(notify: (change: ViewLayerChange) => void): void {
    this.notify = notify
  }
  getSpec(): string | null {
    return this.spec
  }
  setSpec(spec: string | null): boolean {
    if (this.spec === spec) return false
    this.spec = spec
    this.notify?.({ layerId: this.id, reason: 'spec-changed' })
    return true
  }
  wrap(upstream: DataSource): DataSource {
    const offset = this.id === 'a' ? 10 : 100
    return {
      ...upstream,
      resolveUnderlyingRow: (row) => upstream.resolveUnderlyingRow?.(row + offset) ?? row + offset,
    }
  }
  headerDecoration(): HeaderDecoration {
    return this.decoration
  }
  contextMenuItems(ctx: ColumnHeaderMenuContext) {
    return [{ id: 'filter-open' as const, label: `${this.id}:${ctx.field.id}`, disabled: false }]
  }
}

describe('ViewPipeline', () => {
  it('wraps layers in add order and returns composed source', () => {
    const pipeline = new ViewPipeline(source)
    pipeline.add(new FakeLayer('a', { filterActive: true }))
    pipeline.add(new FakeLayer('b', { sortIndicator: 'asc' }))
    expect(pipeline.getComposed().resolveUnderlyingRow?.(0)).toBe(110)
  })

  it('notifies subscribers with layer id and old resolver snapshot', () => {
    const pipeline = new ViewPipeline(source)
    const layer = new FakeLayer('a', { filterActive: true })
    pipeline.add(layer)
    const events: Array<{ layerId: string; oldRow: number }> = []
    pipeline.subscribe((change, oldResolveUnderlyingRow) => {
      events.push({ layerId: change.layerId, oldRow: oldResolveUnderlyingRow(0) })
    })
    layer.setSpec('x')
    expect(events).toEqual([{ layerId: 'a', oldRow: 10 }])
  })

  it('collects header decorations and menu items in layer order', () => {
    const pipeline = new ViewPipeline(source)
    pipeline.add(new FakeLayer('a', { filterActive: true }))
    pipeline.add(new FakeLayer('b', { sortIndicator: 'desc' }))
    const field = source.getSchema().fields[0]!
    expect(pipeline.collectHeaderDecorations(field)).toEqual({ filterActive: true, sortIndicator: 'desc' })
    expect(pipeline.collectColumnHeaderMenuItems({ targetKind: 'columnHeader', field, colIndex: 0 }).map((i) => i.label)).toEqual(['a:name', 'b:name'])
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
bun test packages/core/tests/view/ViewPipeline.test.ts
```

Expected: FAIL because view files do not exist.

- [ ] **Step 3: Implement ViewLayer and ViewPipeline**

Implement the interfaces from `docs/superpowers/specs/2026-05-22-sort-filter-design.md §3`. `ViewPipeline.rebuild(change)` must capture:

```ts
const oldComposed = this.composed
const oldResolveUnderlyingRow = (viewRow: number) =>
  oldComposed.resolveUnderlyingRow?.(viewRow) ?? viewRow
```

Then rebuild by reducing `layers` over `source`, assign `this.composed`, and notify listeners.

- [ ] **Step 4: Run tests**

Run:

```bash
bun test packages/core/tests/view/ViewPipeline.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/view/ViewLayer.ts packages/core/src/view/ViewPipeline.ts packages/core/src/index.ts packages/core/tests/view/ViewPipeline.test.ts
git commit -m "feat(core): add view pipeline"
```

---

## Task 3: SortLayer

**Files:**
- Create: `packages/core/src/view/SortLayer.ts`
- Create: `packages/core/tests/view/SortLayer.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests**

Cover `text`, `number`, null-last in asc/desc, stable sort, `singleSelect` choice order, `multiSelect` rejected, coordinate mapping, and mutable writes. Use `InMemoryDataSource` with fields:

```ts
const schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 120 },
    { id: 'score', name: 'Score', type: 'number', width: 80 },
    { id: 'status', name: 'Status', type: 'singleSelect', width: 100, options: { choices: ['Todo', 'Doing', 'Done'] } },
    { id: 'tags', name: 'Tags', type: 'multiSelect', width: 120, options: { choices: ['A', 'B'] } },
  ],
} as const
```

Expected assertions:

- `setSpec({ fieldId: 'score', direction: 'asc' })` yields score order `[1, 2, 2, null]`
- equal values keep original row order
- `resolveUnderlyingRow(0)` returns the original row index of the first sorted row
- `findViewRow(underlyingRow)` returns the current sorted row
- `setSpec({ fieldId: 'tags', direction: 'asc' })` returns `false` and leaves spec `null`
- `updateCellByUnderlyingRow(hiddenOrMovedRow, 'name', 'X')` writes raw row, not current view row

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
bun test packages/core/tests/view/SortLayer.test.ts
```

Expected: FAIL because `SortLayer` does not exist.

- [ ] **Step 3: Implement SortLayer**

Implement:

- `SortSpec`, `SortDirection`
- `cycle(fieldId)` as `null -> asc -> desc -> null`
- comparator by `FieldType`
- stable sort with original upstream row as tie-breaker
- `SortedDataSource` wrapper with `order`, `inverse`, `resolveUnderlyingRow`, `findViewRow`, `updateCell`, `updateCellByUnderlyingRow`
- `contextMenuItems` and `headerDecoration`

Keep `rowsChanged` as pass-through without resorting.

- [ ] **Step 4: Run tests**

Run:

```bash
bun test packages/core/tests/view/SortLayer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/view/SortLayer.ts packages/core/src/index.ts packages/core/tests/view/SortLayer.test.ts
git commit -m "feat(core): add sort view layer"
```

---

## Task 4: FilterLayer

**Files:**
- Create: `packages/core/src/view/FilterLayer.ts`
- Create: `packages/core/tests/view/FilterLayer.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests**

Cover:

- `text-contains`, `text-equals`, case sensitive / insensitive
- `number-between`, `number-equals`
- `date-between`
- `select-in` for `singleSelect` and overlap semantics for `multiSelect`
- `checkbox-equals`
- `is-empty` / `is-not-empty`
- `clear(fieldId)` no-op for non-active field
- `rowsChanged` does not re-filter
- `resolveUnderlyingRow` / `findViewRow`
- `updateCellByUnderlyingRow` writes filtered-out raw rows

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
bun test packages/core/tests/view/FilterLayer.test.ts
```

Expected: FAIL because `FilterLayer` does not exist.

- [ ] **Step 3: Implement FilterLayer**

Implement `FilterOp`, `FilterSpec`, typed predicate builders, `FilteredDataSource` with `order` and `inverse`. `setSpec` must reject incompatible op / field type combinations and clear invalid spec on `schemaChanged`.

Important behavior:

```ts
// rowsChanged is pass-through.
// An edited visible row that no longer matches remains visible until spec/upstream reset.
```

- [ ] **Step 4: Run tests**

Run:

```bash
bun test packages/core/tests/view/FilterLayer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/view/FilterLayer.ts packages/core/src/index.ts packages/core/tests/view/FilterLayer.test.ts
git commit -m "feat(core): add filter view layer"
```

---

## Task 5: Engine 底层行 undo/redo

**Files:**
- Modify: `packages/core/src/engine/GridEngine.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`
- Modify: `packages/core/src/render/RenderFrame.ts`
- Test: `packages/core/tests/engine/DefaultGridEngine.undo.test.ts`
- Test: `packages/core/tests/engine/DefaultGridEngine.fill.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests that construct `FilterLayer -> SortLayer -> composed` manually, pass composed DS to `DefaultGridEngine`, then:

- edit view row 0, sort/filter changes, undo writes original underlying row
- paste/fill/clear store underlying row indices
- undo when `findViewRow` returns `-1` calls `updateCellByUnderlyingRow`

Use a spy mutable source:

```ts
import type { CellValue } from '../../src/data/Schema'

class RecordingDataSource extends InMemoryDataSource {
  writesByUnderlying: Array<{ row: number; fieldId: string; value: CellValue }> = []
  override updateCellByUnderlyingRow(row: number, fieldId: string, value: CellValue): void {
    this.writesByUnderlying.push({ row, fieldId, value })
    super.updateCellByUnderlyingRow(row, fieldId, value)
  }
}
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
bun test packages/core/tests/engine/DefaultGridEngine.undo.test.ts packages/core/tests/engine/DefaultGridEngine.fill.test.ts
```

Expected: FAIL because engine still stores view row indices.

- [ ] **Step 3: Implement engine changes**

In every command creation path (`commitCellEdit`, `commitPaste`, `commitFill`, `clearRange`) translate view row with `resolveUnderlyingRow(this.data, viewRow)`.

In undo/redo write application:

```ts
const viewRow = findViewRow(this.data, w.rowIndex)
if (viewRow === -1 && this.data.updateCellByUnderlyingRow) {
  this.data.updateCellByUnderlyingRow(w.rowIndex, w.fieldId, w.value)
} else if (viewRow !== -1) {
  this.data.updateCell(viewRow, w.fieldId, w.value)
} else {
  this.data.updateCell(w.rowIndex, w.fieldId, w.value)
}
```

Add engine helper for selection remap if needed by Grid integration:

```ts
remapSelectionByUnderlyingRows(oldResolveUnderlyingRow: (viewRow: number) => number): boolean
```

It returns `true` when both endpoints remap, `false` when selection is cleared.

- [ ] **Step 4: Run tests**

Run:

```bash
bun test packages/core/tests/engine/DefaultGridEngine.undo.test.ts packages/core/tests/engine/DefaultGridEngine.fill.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/engine/GridEngine.ts packages/core/src/engine/DefaultGridEngine.ts packages/core/src/render/RenderFrame.ts packages/core/tests/engine/DefaultGridEngine.undo.test.ts packages/core/tests/engine/DefaultGridEngine.fill.test.ts
git commit -m "feat(core): store undo writes by underlying row"
```

---

## Task 6: Grid pipeline assembly and public events

**Files:**
- Modify: `packages/web/src/Grid.ts`
- Modify: `packages/web/src/grid/GridController.ts`
- Modify: `packages/web/src/backends/Canvas2DBackend.ts`
- Modify: `packages/web/src/runtime/WebGridRuntime.ts`
- Test: `packages/web/tests/Grid.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests for:

- `grid.getSortLayer()` and `grid.getFilterLayer()` return stable layer instances
- `grid.on('sortChange', handler)` receives `{ spec }`
- `grid.on('filterChange', handler)` receives `{ spec }`
- `grid.setData(newSource)` clears sort/filter specs

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
bun test packages/web/tests/Grid.test.ts
```

Expected: FAIL because public APIs do not exist.

- [ ] **Step 3: Implement assembly**

Canvas2DBackend owns raw source, `FilterLayer`, `SortLayer`, and `ViewPipeline`. It passes `pipeline.getComposed()` into `DefaultGridEngine`, subscribes to pipeline changes, calls engine selection remap / clear, and refreshes runtime.

Expose:

```ts
grid.getSortLayer(): SortLayer
grid.getFilterLayer(): FilterLayer
grid.getViewPipeline(): ViewPipeline
grid.on('viewChange' | 'sortChange' | 'filterChange', handler): () => void
```

Keep `GridController` methods specific rather than exposing backend internals broadly.

- [ ] **Step 4: Run tests**

Run:

```bash
bun test packages/web/tests/Grid.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/Grid.ts packages/web/src/grid/GridController.ts packages/web/src/backends/Canvas2DBackend.ts packages/web/src/runtime/WebGridRuntime.ts packages/web/tests/Grid.test.ts
git commit -m "feat(web): assemble sort filter view pipeline"
```

---

## Task 6.5: View change preserves undo and remaps selection

**Why this task exists:** Task 6 intentionally used the existing `engine.setData()` path for pipeline changes to stay within its allowed files. That satisfies the public API assembly tests, but it clears the undo stack and selection on sort/filter changes. Phase 4.4 requires view changes to preserve undo/redo and remap selection by underlying row, so this follow-up must land before Task 7+ integration work relies on the pipeline.

**Files:**
- Modify: `packages/core/src/engine/GridEngine.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`
- Modify: `packages/web/src/runtime/WebGridRuntime.ts`
- Modify: `packages/web/src/backends/Canvas2DBackend.ts`
- Test: `packages/core/tests/engine/DefaultGridEngine.test.ts`
- Test: `packages/core/tests/engine/DefaultGridEngine.undo.test.ts`
- Test: `packages/web/tests/Grid.test.ts`

- [ ] **Step 1: Write failing tests**

Add core tests for a new engine path that swaps view data without clearing undo:

```ts
it('updates view data without clearing undo stack', () => {
  const raw = new InMemoryDataSource({ schema, rows })
  const engine = new DefaultGridEngine({ data: raw })
  engine.selectCell({ rowIndex: 0, colIndex: 0 })
  engine.beginCellEdit({ rowIndex: 0, colIndex: 0 })
  engine.updateCellEditDraft('edited')
  expect(engine.commitCellEdit()).toBe(true)
  expect(engine.canUndo()).toBe(true)

  const sort = new SortLayer()
  sort.setSpec({ fieldId: 'name', direction: 'desc' })
  engine.setViewData(sort.wrap(raw))

  expect(engine.canUndo()).toBe(true)
})
```

Add core tests for selection remap:

```ts
it('remaps selection by underlying row when view data changes', () => {
  const raw = new InMemoryDataSource({ schema, rows })
  const engine = new DefaultGridEngine({ data: raw })
  engine.selectCell({ rowIndex: 0, colIndex: 0 })
  const oldResolve = (viewRow: number) => viewRow

  const sort = new SortLayer()
  sort.setSpec({ fieldId: 'name', direction: 'desc' })
  engine.setViewData(sort.wrap(raw), { oldResolveUnderlyingRow: oldResolve })

  expect(engine.getSelection().activeCell?.rowIndex).toBe(/* row where underlying 0 moved */)
})
```

Add web tests:

- Write a cell, activate sort through `grid.getSortLayer().setSpec(...)`, then `grid.undo()` still reverts the original cell.
- Select a visible row, activate sort, and assert the selected underlying row remains selected at its new view row.
- Activate a filter that hides the selected row and assert selection is cleared.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
bun test packages/core/tests/engine/DefaultGridEngine.test.ts packages/core/tests/engine/DefaultGridEngine.undo.test.ts packages/web/tests/Grid.test.ts
```

Expected: FAIL because `setViewData` / selection remap path does not exist and Task 6 currently clears undo/selection.

- [ ] **Step 3: Implement narrow engine API**

Add to `GridEngine` and `DefaultGridEngine`:

```ts
interface SetViewDataOptions {
  readonly oldResolveUnderlyingRow?: (viewRow: number) => number
  readonly clearSelection?: boolean
}

setViewData(data: DataSource, options?: SetViewDataOptions): void
```

Behavior:

- Replace `this.data` and rebuild row/col axes / viewport sizing like `setData`.
- Do **not** clear `undoStack`.
- If `options.oldResolveUnderlyingRow` is provided, remap current selection endpoints:
  - Convert old anchor/active or selected range endpoints from old view row to underlying row.
  - Convert underlying row to new view row with `findViewRow(newData, underlyingRow)`.
  - If all required endpoints map, select the new range/cell with same columns.
  - If any required endpoint maps to `-1`, clear selection.
- If no resolver is provided and `clearSelection !== false`, clear selection.
- End any active edit before replacing data; commit if possible, otherwise cancel.

Keep existing `setData(data)` behavior unchanged for real raw data replacement: it still clears undo stack.

- [ ] **Step 4: Use setViewData on pipeline changes**

In `Canvas2DBackend` pipeline subscriber:

- Use the `oldResolveUnderlyingRow` passed by `ViewPipeline.subscribe`.
- Call a runtime/backend path that invokes `engine.setViewData(pipeline.getComposed(), { oldResolveUnderlyingRow })`.
- Keep renderer instance; call existing refresh/spacer path.
- Emit `viewChange` and layer-specific event after engine/view update.

`grid.setData(newSource)` should continue to call raw-data replacement and clear layer specs / undo stack as before.

- [ ] **Step 5: Run tests**

Run:

```bash
bun test packages/core/tests/engine/DefaultGridEngine.test.ts packages/core/tests/engine/DefaultGridEngine.undo.test.ts packages/web/tests/Grid.test.ts
bun run --filter @novasheet/core typecheck
bun run --filter @novasheet/web typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/engine/GridEngine.ts packages/core/src/engine/DefaultGridEngine.ts packages/web/src/runtime/WebGridRuntime.ts packages/web/src/backends/Canvas2DBackend.ts packages/core/tests/engine/DefaultGridEngine.test.ts packages/core/tests/engine/DefaultGridEngine.undo.test.ts packages/web/tests/Grid.test.ts
git commit -m "feat(web): preserve state across view changes"
```

---

## Task 7: Column header context menu

**Files:**
- Modify: `packages/core/src/interaction/ContextMenuModel.ts`
- Modify: `packages/web/src/runtime/WebGridRuntime.ts`
- Modify: `packages/web/src/backends/Canvas2DBackend.ts`
- Test: `packages/core/tests/interaction/ContextMenuModel.test.ts`
- Test: `packages/web/tests/runtime/WebGridRuntime.test.ts`

- [ ] **Step 1: Write failing tests**

Core assertions:

- cell menu remains cut/copy/paste
- column header menu combines sort and filter items
- `sort-none` is enabled only when current spec belongs to the column
- multiSelect disables `sort-asc` / `sort-desc`

Runtime assertions:

- right-click within header opens column header menu
- right-click in body still opens cell menu
- clicking `sort-asc`, `sort-desc`, `sort-none`, `filter-clear` calls the right layer method

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
bun test packages/core/tests/interaction/ContextMenuModel.test.ts packages/web/tests/runtime/WebGridRuntime.test.ts
```

Expected: FAIL because column header menu support is missing.

- [ ] **Step 3: Implement menu integration**

Extend `ContextMenuContext` into discriminated union:

```ts
export type ContextMenuTargetKind = 'cell' | 'columnHeader'
export type ContextMenuContext = CellMenuContext | ColumnHeaderMenuContext
export type ContextMenuAction =
  | 'cut' | 'copy' | 'paste'
  | 'sort-asc' | 'sort-desc' | 'sort-none'
  | 'filter-open' | 'filter-clear'
```

In runtime `handleHostContextMenu`, branch on `event.y < frame.theme.metrics.headerHeight`; use `colsAxis.positionToIndex(event.x + viewport.scrollX)` and guard out-of-range clicks.

`WebGridRuntime` needs narrow access to the already-owned `ViewPipeline`, `SortLayer`, and `FilterLayer`. Inject them from `Canvas2DBackend` during construction or immediately after runtime creation; do not move pipeline ownership out of the backend.

- [ ] **Step 4: Run tests**

Run:

```bash
bun test packages/core/tests/interaction/ContextMenuModel.test.ts packages/web/tests/runtime/WebGridRuntime.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/interaction/ContextMenuModel.ts packages/web/src/runtime/WebGridRuntime.ts packages/web/src/backends/Canvas2DBackend.ts packages/core/tests/interaction/ContextMenuModel.test.ts packages/web/tests/runtime/WebGridRuntime.test.ts
git commit -m "feat(web): add column header sort filter menu"
```

---

## Task 8: Header icons and theme tokens

**Files:**
- Modify: `packages/core/src/theme/Theme.ts`
- Modify: `packages/core/src/theme/denseGridTheme.ts`
- Modify: `packages/core/src/render/RenderFrame.ts`
- Modify: `packages/web-canvas2d/src/painters/HeaderPainter.ts`
- Modify: `packages/web-canvas2d/src/render/Canvas2DRenderer.ts`
- Test: `packages/core/tests/theme/denseGridTheme.test.ts`
- Test: `packages/web-canvas2d/tests/painters/HeaderPainter.test.ts`

- [ ] **Step 1: Write failing tests**

Assert theme has `icons.sortAsc`, `icons.sortDesc`, `icons.filter`.

In `HeaderPainter.test.ts`, use a fake `viewPipeline`:

```ts
const viewPipeline = {
  collectHeaderDecorations: (field: { id: string }) =>
    field.id === 'name' ? { sortIndicator: 'asc' as const, filterActive: true } : {},
}
```

Assert the recording context contains two `fill` operations for icon paths and that field text x/max width leaves room for icons.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
bun test packages/core/tests/theme/denseGridTheme.test.ts packages/web-canvas2d/tests/painters/HeaderPainter.test.ts
```

Expected: FAIL because icon tokens and painter support are missing.

- [ ] **Step 3: Implement painter**

Add icon tokens to `ThemeIcons`. In `HeaderPainter`, reserve `16px` per active icon plus padding from theme metrics; draw filter icon left of sort icon. Use existing `Path2D` path rendering helper style from `packages/web-canvas2d/src/paint/svg-path.ts`.

- [ ] **Step 4: Run tests**

Run:

```bash
bun test packages/core/tests/theme/denseGridTheme.test.ts packages/web-canvas2d/tests/painters/HeaderPainter.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/theme/Theme.ts packages/core/src/theme/denseGridTheme.ts packages/core/src/render/RenderFrame.ts packages/web-canvas2d/src/painters/HeaderPainter.ts packages/web-canvas2d/src/render/Canvas2DRenderer.ts packages/core/tests/theme/denseGridTheme.test.ts packages/web-canvas2d/tests/painters/HeaderPainter.test.ts
git commit -m "feat(canvas2d): render sort filter header icons"
```

---

## Task 9: FilterPopover DOM overlay

**Files:**
- Create: `packages/web/src/interaction/FilterPopover.ts`
- Create: `packages/web/tests/interaction/FilterPopover.test.ts`
- Modify: `packages/web/src/runtime/WebGridRuntime.ts`
- Modify: `packages/web/src/backends/Canvas2DBackend.ts`

- [ ] **Step 1: Write failing tests**

Test:

- text op requires non-empty value before Apply enables
- number-between enables when min or max is finite
- select-in hides when `field.options?.choices` is empty and defaults to `is-not-empty`
- Apply calls `onApply(op)`
- Clear calls `onApply(null)`
- Cancel / Escape / outside click calls `onCancel`

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
bun test packages/web/tests/interaction/FilterPopover.test.ts
```

Expected: FAIL because `FilterPopover` does not exist.

- [ ] **Step 3: Implement popover**

Follow `DomContextMenuLayer` style: create DOM root under container, attach/destroy explicitly, keep `isOpen()`, `open(anchor, props)`, `close()`. Runtime must:

- close context menu before opening popover
- hide fill handle / preview while open
- gate `handleHostKeyDown` when popover is open
- wire `filter-open` to popover and `filter-clear` to `FilterLayer.clear(field.id)`

- [ ] **Step 4: Run tests**

Run:

```bash
bun test packages/web/tests/interaction/FilterPopover.test.ts packages/web/tests/runtime/WebGridRuntime.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/interaction/FilterPopover.ts packages/web/src/runtime/WebGridRuntime.ts packages/web/src/backends/Canvas2DBackend.ts packages/web/tests/interaction/FilterPopover.test.ts packages/web/tests/runtime/WebGridRuntime.test.ts
git commit -m "feat(web): add filter popover"
```

---

## Task 10: Integration tests, Storybook, docs

**Files:**
- Create: `apps/storybook/src/stories/SortFilter.stories.ts`
- Modify: `README.md`
- Test: `packages/web/tests/Grid.test.ts`
- Test: `packages/web/tests/runtime/WebGridRuntime.test.ts`

- [ ] **Step 1: Write integration tests**

Add web tests for:

- column header right click -> sort asc -> row order changes and `sortChange` fires
- filter text contains -> row count changes and `filterChange` fires
- editing while sorted does not automatically resort
- editing while filtered does not automatically refilter
- selection follows same underlying row across sort
- undo writes filtered-out row through `updateCellByUnderlyingRow`

- [ ] **Step 2: Run integration tests to verify failure or catch gaps**

Run:

```bash
bun test packages/web/tests/Grid.test.ts packages/web/tests/runtime/WebGridRuntime.test.ts
```

Expected before final fixes: any missing UI/engine integration should fail with concrete assertion mismatch.

- [ ] **Step 3: Add Storybook story**

Create `apps/storybook/src/stories/SortFilter.stories.ts` with one grid containing text, number, date, singleSelect, multiSelect, checkbox columns and enough rows to exercise sort + filter manually.

- [ ] **Step 4: Update README**

Mark Phase 4.4 as complete in the phase list and mention sorting/filtering in the current capabilities paragraph.

- [ ] **Step 5: Run full verification**

Run:

```bash
bun test
bun run --filter '*' typecheck
bun run lint
bun run --filter @novasheet/core build
bun run --filter @novasheet/web-canvas2d build
bun run --filter @novasheet/web build
```

Expected: all commands PASS with 0 lint warnings.

- [ ] **Step 6: Commit**

```bash
git add apps/storybook/src/stories/SortFilter.stories.ts README.md packages/web/tests/Grid.test.ts packages/web/tests/runtime/WebGridRuntime.test.ts
git commit -m "feat(web): finish sort filter integration"
```

---

## Self-Review

Spec coverage:

- ViewLayer protocol, pipeline, change notification, resolver snapshot: Task 2.
- SortLayer wrapper, typed comparator, menu, header decoration: Task 3 and Task 7.
- FilterLayer typed ops, empty semantics, no refilter on rowsChanged: Task 4 and Task 9.
- DataSource coordinate protocol and mutable underlying writes: Task 1.
- Engine undo/redo by underlying row and selection remap: Task 5 and Task 6.
- Column header menu, HeaderPainter icons, FilterPopover: Tasks 7-9.
- Integration tests, Storybook, README: Task 10.

Placeholder scan:

- No `TBD`, bare `TODO`, or "implement later" markers.
- Each task has exact files, commands, expected results, and commit command.

Known risks to stop on:

- If `ViewPipeline` ownership is awkward inside `Canvas2DBackend` because renderer creation needs `frame.viewPipeline`, stop and update this plan before inventing a second pipeline owner.
- If existing `SelectionModel` cannot remap anchor/active without exposing a new method, stop and patch the plan with the exact public method before editing engine internals.
- If `RecordingContext2D` cannot observe `Path2D` contents for icons, assert `fill` call count and icon positions rather than SVG path internals.
