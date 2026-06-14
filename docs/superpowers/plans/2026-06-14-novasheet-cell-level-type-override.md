# Cell-Level Type Override Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 cell 级标量类型覆盖,让 `text/number/date/checkbox` 可按单元格覆盖列默认类型,并让 fill 跨列传播 value series + resolved type + valueFormat。

**Architecture:** 新增独立 `CellTypeStore`/`CellTypeController`/`CellTypeUndoHandler`,不把语义类型塞进 `FormatState`。`DefaultGridEngine` 持有 store 并在 `RenderFrame` 下发 `resolveCellType` 闭包;edit/display/paste/fill/sort/filter 通过注入 resolver 读 resolved type。BDD 外环场景已在 `packages/core/tests/acceptance/**/scenarios/` 定稿,实现期先写对应失败行为测试,再逐任务 TDD。

**Tech Stack:** TypeScript strict (`verbatimModuleSyntax`, `noUncheckedIndexedAccess`), bun workspace, `bun:test`, `@novasheet/mbd`, Canvas tests use existing helpers only.

**Spec:** `docs/superpowers/specs/2026-06-14-novasheet-cell-level-type-override-design.md`
**BDD Method:** `docs/superpowers/specs/2026-06-10-novasheet-bdd-tdd-method-design.md`
**Scenario Gate Commit:** `9e6f75e test(core): 新增单元格类型覆盖行为场景`

---

## File Map

| 文件 | 职责 | 动作 |
|---|---|---|
| `packages/core/src/features/cell-types/CellTypeStore.ts` | raw 稀疏 cell type override store + remap | 新建 |
| `packages/core/src/features/cell-types/CellTypeController.ts` | view API 写入门面 + undo 入栈 | 新建 |
| `packages/core/src/features/cell-types/CellTypeUndoHandler.ts` | `cellType` undo/redo restore | 新建 |
| `packages/core/src/features/cell-types/registerCellTypeUndo.ts` | undo handler 注册入口 | 新建 |
| `packages/core/src/features/cell-types/index.ts` | cell type 统一导出 | 改 |
| `packages/core/src/kernel/undo/UndoCommand.ts` | 新增 `cellType` command + fill/structural type snapshot 字段 | 改 |
| `packages/core/src/kernel/render/RenderFrame.ts` | 新增 `resolveCellType` frame 闭包 | 改 |
| `packages/core/src/engine/FrameAssembler.ts` | 构造 `resolveCellType`;默认 date pattern 改用 resolved type | 改 |
| `packages/core/src/engine/DefaultGridEngine.ts` | 持有 store/controller;API 委派;structural remap;undo 注册 | 改 |
| `packages/core/src/engine/GridEngine.ts` | engine interface 增加 cell type API | 改 |
| `packages/core/src/Grid.ts` | public facade 增加 cell type API | 改 |
| `packages/core/src/dom/runtime/GridController.ts` | runtime controller interface 增加 cell type API | 改 |
| `packages/core/src/dom/runtime/GridControllerImpl.ts` | API 转发到 runtime | 改 |
| `packages/core/src/dom/runtime/GridRuntime.ts` | custom editor/action 按 resolved type 查 registry | 改 |
| `packages/core/src/features/edit/EditController.ts` | built-in edit 按 resolved type parse/format | 改 |
| `packages/core/src/features/clipboard/ApplyPaste.ts` | paste 每目标格按 resolved type coerce | 改 |
| `packages/core/src/features/clipboard/PasteController.ts` | 注入 resolved type resolver | 改 |
| `packages/core/src/features/fill/FillStylePropagator.ts` | `tileFillType`;fill snapshots 扩展 | 改 |
| `packages/core/src/features/fill/FillController.ts` | `fill` undo command 携 type snapshots | 改 |
| `packages/core/src/features/fill/FillUndoHandler.ts` | undo/redo restore type store | 改 |
| `packages/core/src/features/view/SortLayer.ts` | mixed resolved type comparator | 改 |
| `packages/core/src/features/view/FilterLayer.ts` | Option A: 菜单按列默认,predicate 可读 resolved type | 改 |
| `packages/core/src/index.ts` | 导出 `CellTypeOverride`, `CellTypeStore` 等公开类型/API | 改 |
| `packages/core/tests/**` | BDD + TDD 红绿测试 | 改/新建 |
| `packages/core/tests/acceptance/**/scenarios/*.md` | 新场景 draft → implemented | 改 |
| `packages/core/tests/acceptance/scenarios.manifest.json`, `SCENARIOS.md` | mbd manifest | 生成 |

---

## Task 1: BDD 外环红测接线

**Files:**
- Modify: `packages/core/tests/acceptance/properties/inventory.test.ts`
- Modify: `packages/core/tests/acceptance/e2e/grid/bdd.test.ts`
- Modify: `packages/core/tests/acceptance/interaction/editing/bdd.test.ts`
- Modify: `packages/core/tests/acceptance/functional/data-ops/bdd.test.ts`
- Scenarios:
  - `packages/core/tests/acceptance/properties/scenarios/L0-cell-type-store-raw-remap.md`
  - `packages/core/tests/acceptance/e2e/grid/scenarios/L2-grid-cell-type-override-api.md`
  - `packages/core/tests/acceptance/interaction/editing/scenarios/L2-grid-fill-type-format-propagates.md`
  - `packages/core/tests/acceptance/e2e/grid/scenarios/L2-grid-cell-type-edit-display.md`
  - `packages/core/tests/acceptance/functional/data-ops/scenarios/L2-grid-cell-type-sort-mixed.md`
  - `packages/core/tests/acceptance/interaction/editing/scenarios/L2-grid-clipboard-paste-resolved-cell-type.md`

- [ ] **Step 1: 写失败行为测试**

Append the following tests to the matching existing `describe` blocks. Import `CellTypeStore` and `type CellTypeOverride` from `../../../../src` or `../../../src` according to the file depth once Task 2 exports them; before Task 2 this should fail at compile/import.

```ts
it('core.L0.cell-type-store-raw-remap stores, clears, restores, and remaps raw cell type overrides', () => {
  const store = new CellTypeStore()
  const fields = [
    { id: 'a', name: 'A', type: 'text', width: 80 },
    { id: 'b', name: 'B', type: 'number', width: 80 },
    { id: 'c', name: 'C', type: 'date', width: 80 },
  ] as const

  store.set({ startRow: 1, endRow: 1, startCol: 1, endCol: 1 }, 'date')
  store.set({ startRow: 2, endRow: 2, startCol: 2, endCol: 2 }, 'checkbox')
  expect(store.resolve(1, 1, fields[1])).toBe('date')
  expect(store.resolve(0, 1, fields[1])).toBe('number')

  const before = store.snapshot()
  store.clear({ startRow: 1, endRow: 1, startCol: 1, endCol: 1 })
  expect(store.resolve(1, 1, fields[1])).toBe('number')
  store.restore(before)
  expect(store.resolve(1, 1, fields[1])).toBe('date')

  store.remapAfterRowsInserted(1, 1)
  expect(store.resolve(2, 1, fields[1])).toBe('date')
  store.remapAfterColsDeleted([2])
  expect(store.get(3, 2)).toBeUndefined()
})
```

```ts
it('core.L2.grid-cell-type-override-api sets, clears, reads, and undoes view-coordinate cell type overrides', () => {
  const data = new InMemoryDataSource({
    schema: {
      fields: [
        { id: 'name', name: 'Name', type: 'text', width: 120 },
        { id: 'due', name: 'Due', type: 'date', width: 100 },
      ],
    },
    rows: [{ name: '45000', due: 45000 }],
  })
  const { container, grid } = mountRecordingGrid({ data })

  expect(grid.getCellType(0, 0)).toBe('text')
  expect(grid.setCellType(fillRange(0, 0, 0, 0), 'date')).toBe(true)
  expect(grid.getCellType(0, 0)).toBe('date')
  expect(grid.clearCellType(fillRange(0, 0, 0, 0))).toBe(true)
  expect(grid.getCellType(0, 0)).toBe('text')
  grid.undo()
  expect(grid.getCellType(0, 0)).toBe('date')
  grid.redo()
  expect(grid.getCellType(0, 0)).toBe('text')

  grid.destroy()
  document.body.removeChild(container)
})
```

```ts
it('core.L2.grid-fill-type-format-propagates carries value series, resolved type, and valueFormat', () => {
  const serial = dateToSerial(new Date(Date.UTC(2025, 0, 1)))
  const engine = new DefaultGridEngine({
    data: new InMemoryDataSource({
      schema: {
        fields: [
          { id: 'a', name: 'A', type: 'date', width: 100 },
          { id: 'b', name: 'B', type: 'text', width: 100 },
        ],
      },
      rows: [
        { a: serial, b: null },
        { a: serial + 1, b: null },
        { a: null, b: 'stale' },
      ],
    }),
  })
  engine.setValueFormat(fillRange(0, 1, 0, 0), { kind: 'date', pattern: 'YYYY/MM/DD' })
  engine.setCellType(fillRange(2, 2, 1, 1), 'text')
  engine.setValueFormat(fillRange(2, 2, 1, 1), { kind: 'number' })

  engine.commitFill(fillRange(0, 1, 0, 0), fillRange(0, 1, 1, 1), 'right')

  expect(engine.getData().getCell(0, 'b')).toBe(serial)
  expect(engine.getData().getCell(1, 'b')).toBe(serial + 1)
  expect(engine.getCellType(0, 1)).toBe('date')
  expect(engine.getViewCellFormat(0, 1)?.valueFormat).toEqual({ kind: 'date', pattern: 'YYYY/MM/DD' })
  engine.undo()
  expect(engine.getCellType(0, 1)).toBe('text')
  engine.redo()
  expect(engine.getCellType(1, 1)).toBe('date')
})
```

```ts
it('core.L2.grid-cell-type-edit-display uses resolved type for default date display and edit parsing', () => {
  const serial = dateToSerial(new Date(Date.UTC(2025, 0, 15)))
  const engine = new DefaultGridEngine({
    data: new InMemoryDataSource({
      schema: { fields: [{ id: 'v', name: 'V', type: 'text', width: 100 }] },
      rows: [{ v: serial }],
    }),
  })

  engine.setCellType(fillRange(0, 0, 0, 0), 'date')
  const frame = engine.getFrame()
  const field = frame.data.getSchema().fields[0]!
  expect(frame.resolveCellType?.(0, 0, field)).toBe('date')
  expect(frame.formatCell?.(0, 0, field, serial)).toBe('2025-01-15')

  expect(engine.beginCellEdit({ rowIndex: 0, colIndex: 0 })).toBe(true)
  engine.updateCellEditDraft('2025-01-16')
  expect(engine.commitCellEdit()).toBe(true)
  expect(engine.getData().getCell(0, 'v')).toBe(dateToSerial(new Date(Date.UTC(2025, 0, 16))))
})
```

```ts
it('core.L2.grid-cell-type-sort-mixed orders number/date before text before boolean before empty', () => {
  const data = new InMemoryDataSource({
    schema: { fields: [{ id: 'v', name: 'V', type: 'text', width: 100 }] },
    rows: [{ v: 'z' }, { v: 2 }, { v: true }, { v: null }, { v: 1 }],
  })
  const engine = new DefaultGridEngine({ data })
  engine.setCellType(fillRange(1, 1, 0, 0), 'number')
  engine.setCellType(fillRange(2, 2, 0, 0), 'checkbox')
  engine.setCellType(fillRange(4, 4, 0, 0), 'date')
  const sort = new SortLayer({
    resolveCellType: (row, field) => engine.resolveRawCellTypeForField(row, field),
  })
  sort.setSpec({ fieldId: 'v', direction: 'asc' })
  const sorted = sort.wrap(data)
  expect(Array.from({ length: sorted.getRowCount() }, (_, row) => sorted.getCell(row, 'v'))).toEqual([
    1,
    2,
    'z',
    true,
    null,
  ])
})
```

```ts
it('core.L2.grid-clipboard-paste-resolved-cell-type coerces by target resolved type without propagating source type', async () => {
  const data = new InMemoryDataSource({
    schema: {
      fields: [
        { id: 'a', name: 'A', type: 'text', width: 100 },
        { id: 'b', name: 'B', type: 'text', width: 100 },
      ],
    },
    rows: [{ a: null, b: null }],
  })
  const skipped: PasteSkippedCell[] = []
  const stub = createClipboardStub('2025-01-15\tnot-a-number')
  stub.install()
  const { container, grid } = mountRecordingGrid({
    data,
    onPasteSkipped: (cells) => skipped.push(...cells),
  })

  grid.setCellType(fillRange(0, 0, 0, 0), 'date')
  grid.setCellType(fillRange(0, 0, 1, 1), 'number')
  grid.setSelection({ kind: 'cell', active: { rowIndex: 0, colIndex: 0 }, range: fillRange(0, 0, 0, 1) })
  expect(await grid.paste()).toBe(true)

  expect(data.getCell(0, 'a')).toBe(dateToSerial(new Date(Date.UTC(2025, 0, 15))))
  expect(data.getCell(0, 'b')).toBeNull()
  expect(skipped).toEqual([{ rowIndex: 0, fieldId: 'b', reason: 'type' }])
  expect(grid.getCellType(0, 0)).toBe('date')
  expect(grid.getCellType(0, 1)).toBe('number')

  grid.destroy()
  document.body.removeChild(container)
})
```

- [ ] **Step 2: 跑行为测试确认失败**

Run:

```bash
bun test packages/core/tests/acceptance/properties/inventory.test.ts packages/core/tests/acceptance/e2e/grid/bdd.test.ts packages/core/tests/acceptance/interaction/editing/bdd.test.ts packages/core/tests/acceptance/functional/data-ops/bdd.test.ts
```

Expected: FAIL. Acceptable first failure: missing `CellTypeStore`, missing `setCellType`, missing `resolveCellType`, missing `resolveRawCellTypeForField`, or TypeScript compile errors for the new API.

- [ ] **Step 3: commit red BDD tests**

```bash
git add packages/core/tests/acceptance/properties/inventory.test.ts packages/core/tests/acceptance/e2e/grid/bdd.test.ts packages/core/tests/acceptance/interaction/editing/bdd.test.ts packages/core/tests/acceptance/functional/data-ops/bdd.test.ts
git commit -m "test(core): 新增单元格类型覆盖外环红测"
```

---

## Task 2: CellTypeStore core

**Files:**
- Create: `packages/core/src/features/cell-types/CellTypeStore.ts`
- Modify: `packages/core/src/features/cell-types/index.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/features/cell-types/CellTypeStore.test.ts`

- [ ] **Step 1: 写失败单测**

Create `packages/core/tests/features/cell-types/CellTypeStore.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { CellTypeStore, normalizeFieldType } from '../../../src/features/cell-types'
import type { Field } from '../../../src/kernel/data/Schema'

const fields = {
  text: { id: 't', name: 'T', type: 'text', width: 80 },
  number: { id: 'n', name: 'N', type: 'number', width: 80 },
  date: { id: 'd', name: 'D', type: 'date', width: 80 },
  checkbox: { id: 'c', name: 'C', type: 'checkbox', width: 80 },
  url: { id: 'u', name: 'U', type: 'url', width: 80 },
  select: { id: 's', name: 'S', type: 'singleSelect', width: 80 },
  custom: { id: 'x', name: 'X', type: 'rating', width: 80 },
} satisfies Record<string, Field>

describe('CellTypeStore', () => {
  it('normalizes field defaults into scalar resolved types', () => {
    expect(normalizeFieldType(fields.text.type)).toBe('text')
    expect(normalizeFieldType(fields.number.type)).toBe('number')
    expect(normalizeFieldType(fields.date.type)).toBe('date')
    expect(normalizeFieldType(fields.checkbox.type)).toBe('checkbox')
    expect(normalizeFieldType(fields.url.type)).toBe('text')
    expect(normalizeFieldType(fields.select.type)).toBe('text')
    expect(normalizeFieldType(fields.custom.type)).toBe('text')
  })

  it('sets, clears, resolves, snapshots, and restores raw overrides', () => {
    const store = new CellTypeStore()
    store.set({ startRow: 1, endRow: 2, startCol: 1, endCol: 1 }, 'date')
    expect(store.get(1, 1)).toBe('date')
    expect(store.resolve(1, 1, fields.number)).toBe('date')
    expect(store.resolve(0, 1, fields.number)).toBe('number')

    const snap = store.snapshot()
    store.clear({ startRow: 1, endRow: 1, startCol: 1, endCol: 1 })
    expect(store.resolve(1, 1, fields.number)).toBe('number')
    expect(store.resolve(2, 1, fields.number)).toBe('date')
    store.restore(snap)
    expect(store.resolve(1, 1, fields.number)).toBe('date')
  })

  it('remaps rows and columns after insert/delete/move', () => {
    const store = new CellTypeStore()
    store.set({ startRow: 1, endRow: 1, startCol: 1, endCol: 1 }, 'date')
    store.set({ startRow: 3, endRow: 3, startCol: 2, endCol: 2 }, 'checkbox')
    store.remapAfterRowsInserted(1, 2)
    expect(store.get(3, 1)).toBe('date')
    expect(store.get(5, 2)).toBe('checkbox')
    store.remapAfterColsDeleted([2])
    expect(store.get(5, 2)).toBeUndefined()
    store.remapByRowIndexMap(new Map([[3, 0]]))
    expect(store.get(0, 1)).toBe('date')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run:

```bash
bun test packages/core/tests/features/cell-types/CellTypeStore.test.ts
```

Expected: FAIL with missing module/export.

- [ ] **Step 3: 实现 store**

Create `packages/core/src/features/cell-types/CellTypeStore.ts`:

```ts
import type { RawRange } from '../../kernel/coords/coordinates'
import type { Field, FieldType } from '../../kernel/data/Schema'
import { remapSpanAfterDelete, remapSpanAfterInsert, remapSpanByIndexMap } from '../../kernel/coords/remap'

export type CellTypeOverride = 'text' | 'number' | 'date' | 'checkbox'

export interface CellTypeEntry {
  readonly rowIndex: number
  readonly colIndex: number
  readonly type: CellTypeOverride
}

export type CellTypeSnapshot = readonly CellTypeEntry[]

export function normalizeFieldType(type: FieldType): CellTypeOverride {
  switch (type) {
    case 'number':
      return 'number'
    case 'date':
      return 'date'
    case 'checkbox':
      return 'checkbox'
    default:
      return 'text'
  }
}

export class CellTypeStore {
  private readonly cells = new Map<string, CellTypeOverride>()

  set(range: RawRange, type: CellTypeOverride): void {
    for (let row = range.startRow; row <= range.endRow; row += 1) {
      for (let col = range.startCol; col <= range.endCol; col += 1) {
        this.cells.set(key(row, col), type)
      }
    }
  }

  clear(range: RawRange): void {
    for (let row = range.startRow; row <= range.endRow; row += 1) {
      for (let col = range.startCol; col <= range.endCol; col += 1) {
        this.cells.delete(key(row, col))
      }
    }
  }

  get(rowIndex: number, colIndex: number): CellTypeOverride | undefined {
    return this.cells.get(key(rowIndex, colIndex))
  }

  resolve(rowIndex: number, colIndex: number, field: Field): CellTypeOverride {
    return this.get(rowIndex, colIndex) ?? normalizeFieldType(field.type)
  }

  snapshot(): CellTypeSnapshot {
    return [...this.cells.entries()]
      .map(([k, type]) => {
        const [row, col] = k.split(':').map(Number)
        return { rowIndex: row!, colIndex: col!, type }
      })
      .sort((a, b) => a.rowIndex - b.rowIndex || a.colIndex - b.colIndex)
  }

  restore(snapshot: CellTypeSnapshot): void {
    this.cells.clear()
    for (const entry of snapshot) this.cells.set(key(entry.rowIndex, entry.colIndex), entry.type)
  }

  remapAfterRowsInserted(at: number, count: number): void {
    if (count <= 0) return
    this.remap((row, col, type) => ({
      rowIndex: row >= at ? row + count : row,
      colIndex: col,
      type,
    }))
  }

  remapAfterRowsDeleted(removedSorted: readonly number[]): void {
    if (removedSorted.length === 0) return
    const removed = new Set(removedSorted)
    this.remap((row, col, type) => {
      if (removed.has(row)) return null
      const before = removedSorted.filter((candidate) => candidate < row).length
      return { rowIndex: row - before, colIndex: col, type }
    })
  }

  remapAfterColsInserted(at: number, count: number): void {
    if (count <= 0) return
    this.remap((row, col, type) => ({
      rowIndex: row,
      colIndex: col >= at ? col + count : col,
      type,
    }))
  }

  remapAfterColsDeleted(removedSorted: readonly number[]): void {
    if (removedSorted.length === 0) return
    const removed = new Set(removedSorted)
    this.remap((row, col, type) => {
      if (removed.has(col)) return null
      const before = removedSorted.filter((candidate) => candidate < col).length
      return { rowIndex: row, colIndex: col - before, type }
    })
  }

  remapByRowIndexMap(indexMap: ReadonlyMap<number, number>): void {
    this.remap((row, col, type) => {
      const next = indexMap.get(row)
      return next == null ? null : { rowIndex: next, colIndex: col, type }
    })
  }

  remapByColIndexMap(indexMap: ReadonlyMap<number, number>): void {
    this.remap((row, col, type) => {
      const next = indexMap.get(col)
      return next == null ? null : { rowIndex: row, colIndex: next, type }
    })
  }

  private remap(
    fn: (row: number, col: number, type: CellTypeOverride) => CellTypeEntry | null,
  ): void {
    const next = new Map<string, CellTypeOverride>()
    for (const [k, type] of this.cells) {
      const [row, col] = k.split(':').map(Number)
      const entry = fn(row!, col!, type)
      if (entry) next.set(key(entry.rowIndex, entry.colIndex), entry.type)
    }
    this.cells.clear()
    for (const [k, type] of next) this.cells.set(k, type)
  }
}

function key(rowIndex: number, colIndex: number): string {
  return `${rowIndex}:${colIndex}`
}
```

Remove unused remap imports if lint reports them; they are listed to remind implementers that range remap helpers exist, but this store maps cells one by one.

Update `packages/core/src/features/cell-types/index.ts`:

```ts
export {
  CellTypeStore,
  normalizeFieldType,
  type CellTypeEntry,
  type CellTypeOverride,
  type CellTypeSnapshot,
} from './CellTypeStore'
export * from './CellTypes'
```

Update `packages/core/src/index.ts` exports:

```ts
export {
  CellTypeStore,
  getCellTypeDefinition,
  normalizeFieldType,
  SKIP_CELL_VALUE,
} from './features/cell-types'
export type {
  CellActionContext,
  CellFilterOperator,
  CellParseResult,
  CellTypeContext,
  CellTypeDefinition,
  CellTypeEntry,
  CellTypeOverride,
  CellTypeRegistry,
  CellTypeSnapshot,
} from './features/cell-types'
```

- [ ] **Step 4: 跑测试确认通过**

Run:

```bash
bun test packages/core/tests/features/cell-types/CellTypeStore.test.ts packages/core/tests/acceptance/properties/inventory.test.ts
```

Expected: `CellTypeStore.test.ts` PASS; acceptance properties still may fail from Task 1 imports only if exports are miswired.

- [ ] **Step 5: commit**

```bash
git add packages/core/src/features/cell-types/CellTypeStore.ts packages/core/src/features/cell-types/index.ts packages/core/src/index.ts packages/core/tests/features/cell-types/CellTypeStore.test.ts packages/core/tests/acceptance/properties/inventory.test.ts
git commit -m "feat(core): 新增 CellTypeStore 标量类型覆盖存储"
```

---

## Task 3: CellTypeController + undo + public engine API

**Files:**
- Create: `packages/core/src/features/cell-types/CellTypeController.ts`
- Create: `packages/core/src/features/cell-types/CellTypeUndoHandler.ts`
- Create: `packages/core/src/features/cell-types/registerCellTypeUndo.ts`
- Modify: `packages/core/src/kernel/undo/UndoCommand.ts`
- Modify: `packages/core/src/engine/GridEngine.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`
- Modify: `packages/core/src/Grid.ts`
- Modify: `packages/core/src/dom/runtime/GridController.ts`
- Modify: `packages/core/src/dom/runtime/GridControllerImpl.ts`
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts`
- Test: `packages/core/tests/features/cell-types/CellTypeController.test.ts`
- Test: `packages/core/tests/engine/DefaultGridEngine.cell-types.test.ts`

- [ ] **Step 1: 写失败测试**

Create `packages/core/tests/features/cell-types/CellTypeController.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { CellTypeController, CellTypeStore } from '../../../src/features/cell-types'
import type { UndoCommand } from '../../../src/kernel/undo/UndoCommand'

const range = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }
const selection = { kind: 'cell', active: { rowIndex: 0, colIndex: 0 }, range } as const

describe('CellTypeController', () => {
  it('translates view range, writes store, and pushes undo', () => {
    const store = new CellTypeStore()
    const undo: UndoCommand[] = []
    const controller = new CellTypeController(store, {
      translateRange: (r) => ({ startRow: r.startRow + 1, endRow: r.endRow + 1, startCol: r.startCol, endCol: r.endCol }),
      pushUndo: (command) => undo.push(command),
      getSelection: () => selection,
    })
    expect(controller.setCellType(range, 'date')).toBe(true)
    expect(store.get(1, 0)).toBe('date')
    expect(undo[0]?.kind).toBe('cellType')
    expect(controller.clearCellType(range)).toBe(true)
    expect(store.get(1, 0)).toBeUndefined()
  })

  it('returns false for non-contiguous translated ranges', () => {
    const store = new CellTypeStore()
    const undo: UndoCommand[] = []
    const controller = new CellTypeController(store, {
      translateRange: () => null,
      pushUndo: (command) => undo.push(command),
      getSelection: () => selection,
    })
    expect(controller.setCellType(range, 'date')).toBe(false)
    expect(undo).toHaveLength(0)
  })
})
```

Create `packages/core/tests/engine/DefaultGridEngine.cell-types.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine, InMemoryDataSource } from '../../src'

const schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text' as const, width: 100 },
    { id: 'b', name: 'B', type: 'number' as const, width: 100 },
  ],
}
const cell = { startRow: 0, endRow: 0, startCol: 0, endCol: 0 }

describe('DefaultGridEngine cell type API', () => {
  it('sets, clears, gets, undoes, and redoes resolved cell type', () => {
    const engine = new DefaultGridEngine({
      data: new InMemoryDataSource({ schema, rows: [{ a: 'x', b: 1 }] }),
    })
    expect(engine.getCellType(0, 0)).toBe('text')
    expect(engine.setCellType(cell, 'date')).toBe(true)
    expect(engine.getCellType(0, 0)).toBe('date')
    expect(engine.clearCellType(cell)).toBe(true)
    expect(engine.getCellType(0, 0)).toBe('text')
    engine.undo()
    expect(engine.getCellType(0, 0)).toBe('date')
    engine.redo()
    expect(engine.getCellType(0, 0)).toBe('text')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
bun test packages/core/tests/features/cell-types/CellTypeController.test.ts packages/core/tests/engine/DefaultGridEngine.cell-types.test.ts
```

Expected: FAIL with missing `CellTypeController` / engine methods / undo command kind.

- [ ] **Step 3: 实现 controller 和 undo**

`CellTypeController.ts`:

```ts
import type { RawRange } from '../../kernel/coords/coordinates'
import type { CellRange, GridSelection } from '../../kernel/coords/SelectionTypes'
import type { UndoCommand } from '../../kernel/undo/UndoCommand'
import type { CellTypeOverride, CellTypeSnapshot, CellTypeStore } from './CellTypeStore'

export interface CellTypeControllerContext {
  translateRange(range: CellRange): RawRange | null
  pushUndo(command: UndoCommand): void
  getSelection(): GridSelection
}

export class CellTypeController {
  constructor(
    private readonly store: CellTypeStore,
    private readonly ctx: CellTypeControllerContext,
  ) {}

  setCellType(range: CellRange, type: CellTypeOverride): boolean {
    const rawRange = this.ctx.translateRange(range)
    if (!rawRange) return false
    const selectionBefore = this.ctx.getSelection()
    const before = this.store.snapshot()
    this.store.set(rawRange, type)
    return this.commit(before, selectionBefore)
  }

  clearCellType(range: CellRange): boolean {
    const rawRange = this.ctx.translateRange(range)
    if (!rawRange) return false
    const selectionBefore = this.ctx.getSelection()
    const before = this.store.snapshot()
    this.store.clear(rawRange)
    return this.commit(before, selectionBefore)
  }

  private commit(before: CellTypeSnapshot, selectionBefore: GridSelection): boolean {
    const after = this.store.snapshot()
    if (sameSnapshot(before, after)) return false
    this.ctx.pushUndo({
      kind: 'cellType',
      before,
      after,
      selectionBefore,
      selectionAfter: this.ctx.getSelection(),
    })
    return true
  }
}

function sameSnapshot(left: CellTypeSnapshot, right: CellTypeSnapshot): boolean {
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i]!
    const b = right[i]!
    if (a.rowIndex !== b.rowIndex || a.colIndex !== b.colIndex || a.type !== b.type) return false
  }
  return true
}
```

`CellTypeUndoHandler.ts`:

```ts
import type { GridSelection } from '../../kernel/coords/SelectionTypes'
import type { UndoCommand } from '../../kernel/undo/UndoCommand'
import type { UndoHandler } from '../../kernel/undo/UndoHandler'
import type { CellTypeSnapshot } from './CellTypeStore'

export interface CellTypeUndoContext {
  restoreCellTypes(snapshot: CellTypeSnapshot): void
  restoreSelection(selection: GridSelection): void
}

export class CellTypeUndoHandler implements UndoHandler {
  readonly domain = 'cellType'

  constructor(private readonly ctx: CellTypeUndoContext) {}

  handles(kind: UndoCommand['kind']): boolean {
    return kind === 'cellType'
  }

  applyUndo(command: UndoCommand): void {
    if (command.kind !== 'cellType') return
    this.ctx.restoreCellTypes(command.before)
    this.ctx.restoreSelection(command.selectionBefore)
  }

  applyRedo(command: UndoCommand): void {
    if (command.kind !== 'cellType') return
    this.ctx.restoreCellTypes(command.after)
    this.ctx.restoreSelection(command.selectionAfter)
  }
}
```

`registerCellTypeUndo.ts`:

```ts
import type { UndoRegistry } from '../../kernel/undo/UndoRegistry'
import { CellTypeUndoHandler, type CellTypeUndoContext } from './CellTypeUndoHandler'

export function registerCellTypeUndo(registry: UndoRegistry, ctx: CellTypeUndoContext): void {
  registry.register(new CellTypeUndoHandler(ctx))
}
```

Extend `UndoCommand` with the `cellType` union branch from the spec.

Wire `DefaultGridEngine`:

```ts
private readonly cellTypeStore = new CellTypeStore()
private readonly cellTypeController = new CellTypeController(this.cellTypeStore, {
  translateRange: (range) => this.coords.viewRangeToRaw(range),
  pushUndo: (command) => this.undoStack.push(command),
  getSelection: () => this.selection.getSelection(),
})

setCellType(range: CellRange, type: CellTypeOverride): boolean {
  this.finishActiveEdit()
  return this.cellTypeController.setCellType(range, type)
}

clearCellType(range: CellRange): boolean {
  this.finishActiveEdit()
  return this.cellTypeController.clearCellType(range)
}

getCellType(rowIndex: number, colIndex: number): CellTypeOverride {
  const field = this.data.getSchema().fields[colIndex]
  if (!field) return 'text'
  const rawRow = this.coords.viewRowToRaw(rowIndex)
  const rawCol = this.coords.viewColToRaw(colIndex)
  if (rawCol < 0) return 'text'
  return this.cellTypeStore.resolve(rawRow, rawCol, field)
}
```

Register undo in constructor:

```ts
registerCellTypeUndo(this.undoRegistry, {
  restoreCellTypes: (snapshot) => this.cellTypeStore.restore(snapshot),
  restoreSelection: (selection) => this.selectionController.setSelection(selection),
})
```

Add equivalent methods to `GridEngine`, `Grid`, `GridController`, `GridControllerImpl`, and `GridRuntime`, following `setValueFormat` patterns.

- [ ] **Step 4: 跑测试确认通过**

```bash
bun test packages/core/tests/features/cell-types/CellTypeController.test.ts packages/core/tests/engine/DefaultGridEngine.cell-types.test.ts packages/core/tests/acceptance/e2e/grid/bdd.test.ts
```

Expected: new controller/engine tests PASS; BDD may still fail on frame/edit/fill/paste/sort tests.

- [ ] **Step 5: commit**

```bash
git add packages/core/src/features/cell-types packages/core/src/kernel/undo/UndoCommand.ts packages/core/src/engine/GridEngine.ts packages/core/src/engine/DefaultGridEngine.ts packages/core/src/Grid.ts packages/core/src/dom/runtime/GridController.ts packages/core/src/dom/runtime/GridControllerImpl.ts packages/core/src/dom/runtime/GridRuntime.ts packages/core/tests/features/cell-types/CellTypeController.test.ts packages/core/tests/engine/DefaultGridEngine.cell-types.test.ts
git commit -m "feat(core): 新增单元格类型覆盖 API 与撤销"
```

---

## Task 4: RenderFrame resolver + default date display

**Files:**
- Modify: `packages/core/src/kernel/render/RenderFrame.ts`
- Modify: `packages/core/src/engine/FrameAssembler.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`
- Test: `packages/core/tests/engine/FrameAssembler.test.ts`
- Test: `packages/core/tests/engine/DefaultGridEngine.cell-types.test.ts`

- [ ] **Step 1: 写失败测试**

Add to `DefaultGridEngine.cell-types.test.ts`:

```ts
it('frame resolveCellType and formatCell use resolved type for default date pattern', () => {
  const serial = dateToSerial(new Date(Date.UTC(2025, 0, 15)))
  const engine = new DefaultGridEngine({
    data: new InMemoryDataSource({
      schema: { fields: [{ id: 'a', name: 'A', type: 'text', width: 100 }] },
      rows: [{ a: serial }],
    }),
  })
  engine.setCellType({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, 'date')
  const frame = engine.getFrame()
  const field = frame.data.getSchema().fields[0]!
  expect(frame.resolveCellType?.(0, 0, field)).toBe('date')
  expect(frame.formatCell?.(0, 0, field, serial)).toBe('2025-01-15')
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
bun test packages/core/tests/engine/DefaultGridEngine.cell-types.test.ts
```

Expected: FAIL because `resolveCellType` missing or `formatCell` uses column `field.type`.

- [ ] **Step 3: 实现 frame resolver**

In `RenderFrame.ts` add:

```ts
import type { CellTypeOverride } from '../../features/cell-types'

resolveCellType?: (rowIndex: number, colIndex: number, field: Field) => CellTypeOverride
```

In `FrameAssembler.ts`:

```ts
const DEFAULT_DATE_FORMAT: ValueFormat = { kind: 'date', pattern: 'YYYY-MM-DD' }

export function buildFormatCell(
  cellFormats: readonly ResolvedCellFormat[],
  formatters: Readonly<Record<string, CellFormatter>>,
  locale: string,
  resolveCellType: (rowIndex: number, colIndex: number, field: Field) => CellTypeOverride,
): (rowIndex: number, colIndex: number, field: Field, value: CellValue) => string | undefined {
  // keep existing cellMap logic
  return (rowIndex, colIndex, field, value) => {
    const cellFormat = cellMap.get(`${rowIndex}:${colIndex}`)
    const format = cellFormat ?? field.format ?? (resolveCellType(rowIndex, colIndex, field) === 'date' ? DEFAULT_DATE_FORMAT : undefined)
    return format ? formatValue(value, format, { field, locale }, formatters) : undefined
  }
}
```

In `assembleFrame`, build resolver:

```ts
const resolveCellType = (viewRow: number, viewCol: number, field: Field): CellTypeOverride => {
  const rawRow = input.viewRowToRaw(viewRow)
  const rawCol = input.viewColToRaw(viewCol)
  return rawCol < 0 ? normalizeFieldType(field.type) : input.resolveRawCellType(rawRow, rawCol, field)
}
const formatCell = buildFormatCell(cellFormats, input.formatters, input.locale, resolveCellType)
```

Extend `FrameAssemblerInput` with:

```ts
resolveRawCellType(rowIndex: number, colIndex: number, field: Field): CellTypeOverride
```

Pass from `DefaultGridEngine.getFrame`:

```ts
resolveRawCellType: (row, col, field) => this.cellTypeStore.resolve(row, col, field),
```

- [ ] **Step 4: 跑测试确认通过**

```bash
bun test packages/core/tests/engine/FrameAssembler.test.ts packages/core/tests/engine/DefaultGridEngine.cell-types.test.ts packages/core/tests/acceptance/e2e/grid/bdd.test.ts
```

Expected: frame/default date tests PASS.

- [ ] **Step 5: commit**

```bash
git add packages/core/src/kernel/render/RenderFrame.ts packages/core/src/engine/FrameAssembler.ts packages/core/src/engine/DefaultGridEngine.ts packages/core/tests/engine/FrameAssembler.test.ts packages/core/tests/engine/DefaultGridEngine.cell-types.test.ts
git commit -m "feat(core): 在渲染帧中解析单元格类型"
```

---

## Task 5: edit/runtime registry resolved type

**Files:**
- Modify: `packages/core/src/features/edit/EditController.ts`
- Modify: `packages/core/src/features/edit/CellEditModel.ts` if field type is stored there
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts`
- Modify: `packages/core/src/dom/interaction/CellEditorContract.ts` if extra resolved type is needed
- Test: `packages/core/tests/features/edit/EditController.test.ts`
- Test: `packages/core/tests/dom/runtime/GridRuntime.test.ts`
- Test: `packages/core/tests/acceptance/e2e/grid/bdd.test.ts`

- [ ] **Step 1: 写失败测试**

Add an `EditController` test that provides a context resolver returning `date` for a text column and verifies draft/parse:

```ts
it('uses resolved type instead of field.type for built-in edit parse and format', () => {
  const serial = dateToSerial(new Date(Date.UTC(2025, 0, 15)))
  const data = new InMemoryDataSource({
    schema: { fields: [{ id: 'v', name: 'V', type: 'text', width: 100 }] },
    rows: [{ v: serial }],
  })
  const engine = new DefaultGridEngine({ data })
  engine.setCellType({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }, 'date')
  expect(engine.beginCellEdit({ rowIndex: 0, colIndex: 0 })).toBe(true)
  expect(engine.getCellEditSession()?.draft).toBe('2025-01-15')
  engine.updateCellEditDraft('2025-01-16')
  expect(engine.commitCellEdit()).toBe(true)
  expect(data.getCell(0, 'v')).toBe(dateToSerial(new Date(Date.UTC(2025, 0, 16))))
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
bun test packages/core/tests/engine/DefaultGridEngine.cell-types.test.ts packages/core/tests/dom/runtime/GridRuntime.test.ts
```

Expected: FAIL because edit still uses `field.type`.

- [ ] **Step 3: 实现 edit resolver**

Extend `EditControllerContext`:

```ts
resolveCellType(cell: CellAddress, field: Field): FieldType
```

In `beginCellEdit`:

```ts
const resolvedType = this.ctx.resolveCellType(editCell, field)
const resolvedField = { ...field, type: resolvedType }
if (!isEditableFieldTypeWithTypes(resolvedField, this.cellTypes())) return false
...
this.model.begin(editCell, field.id, resolvedType, formatCellForEditWithTypes(value, resolvedField, this.cellTypes(), this.locale()))
```

In `commit`:

```ts
const resolvedType = this.ctx.resolveCellType(session.cell, field)
const parsed = parseCellEditInputWithTypes(session.draft, { ...field, type: resolvedType }, this.cellTypes(), this.locale())
```

In `GridRuntime` custom editor/action, resolve type from frame:

```ts
const resolvedType = frame.resolveCellType?.(cell.rowIndex, cell.colIndex, field) ?? field.type
const resolvedField = { ...field, type: resolvedType }
const editor = this.cellEditors[resolvedField.type]
const definition = this.cellTypes[resolvedField.type]
```

Pass `resolvedField` to editor/action context, but commit with original `field.id`.

- [ ] **Step 4: 跑测试确认通过**

```bash
bun test packages/core/tests/engine/DefaultGridEngine.cell-types.test.ts packages/core/tests/dom/runtime/GridRuntime.test.ts packages/core/tests/acceptance/e2e/grid/bdd.test.ts
```

Expected: edit/display BDD PASS.

- [ ] **Step 5: commit**

```bash
git add packages/core/src/features/edit packages/core/src/dom/runtime/GridRuntime.ts packages/core/src/dom/interaction/CellEditorContract.ts packages/core/tests/engine/DefaultGridEngine.cell-types.test.ts packages/core/tests/dom/runtime/GridRuntime.test.ts packages/core/tests/acceptance/e2e/grid/bdd.test.ts
git commit -m "feat(core): 编辑器按 resolved cell type 工作"
```

---

## Task 6: paste target resolved type

**Files:**
- Modify: `packages/core/src/features/clipboard/ApplyPaste.ts`
- Modify: `packages/core/src/features/clipboard/PasteController.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`
- Test: `packages/core/tests/features/clipboard/ApplyPaste.test.ts`
- Test: `packages/core/tests/acceptance/interaction/editing/bdd.test.ts`

- [ ] **Step 1: 写失败测试**

Add to `ApplyPaste.test.ts`:

```ts
it('coerces each pasted cell by target resolved type resolver', () => {
  const schema = {
    fields: [
      { id: 'a', name: 'A', type: 'text', width: 100 },
      { id: 'b', name: 'B', type: 'text', width: 100 },
    ],
  }
  const data = makeMutable(schema, [{ a: null, b: null }])
  const skipped: PasteSkippedCell[] = []
  applyPaste(
    { cells: [['2025-01-15', 'bad']], sourceFieldIds: [], typed: false },
    { startRow: 0, endRow: 0, startCol: 0, endCol: 1, tile: { rows: 1, cols: 1 } },
    schema,
    ['a', 'b'],
    data,
    (cells) => skipped.push(...cells),
    undefined,
    (row, col) => (col === 0 ? 'date' : 'number'),
  )
  expect(data.getCell(0, 'a')).toBe(dateToSerial(new Date(Date.UTC(2025, 0, 15))))
  expect(data.getCell(0, 'b')).toBeNull()
  expect(skipped).toEqual([{ rowIndex: 0, fieldId: 'b', reason: 'type' }])
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
bun test packages/core/tests/features/clipboard/ApplyPaste.test.ts packages/core/tests/acceptance/interaction/editing/bdd.test.ts
```

Expected: FAIL because `applyPaste` lacks resolver argument.

- [ ] **Step 3: 实现 paste resolver**

In `ApplyPaste.ts`:

```ts
import type { CellTypeOverride } from '../cell-types'

export type PasteResolvedTypeResolver = (rowIndex: number, colIndex: number, fieldId: string) => CellTypeOverride
```

Change `applyPaste` signature to accept optional resolver after `onWrite`:

```ts
resolveTargetType?: PasteResolvedTypeResolver
```

Inside loop:

```ts
const field = schema.fields.find((candidate) => candidate.id === fieldId)
const type = resolveTargetType?.(r, c, fieldId) ?? fieldTypeById.get(fieldId)
const coerced = coerceForType(rawValue, type)
```

In `PasteControllerContext` add:

```ts
resolveCellType(rowIndex: number, colIndex: number, fieldId: string): CellTypeOverride
```

Pass into `applyPaste`.

In `DefaultGridEngine` paste controller context:

```ts
resolveCellType: (row, col, fieldId) => {
  const field = this.data.getSchema().fields.find((candidate) => candidate.id === fieldId)
  return field ? this.getCellType(row, col) : 'text'
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
bun test packages/core/tests/features/clipboard/ApplyPaste.test.ts packages/core/tests/acceptance/interaction/editing/bdd.test.ts
```

Expected: paste resolved type BDD PASS.

- [ ] **Step 5: commit**

```bash
git add packages/core/src/features/clipboard/ApplyPaste.ts packages/core/src/features/clipboard/PasteController.ts packages/core/src/engine/DefaultGridEngine.ts packages/core/tests/features/clipboard/ApplyPaste.test.ts packages/core/tests/acceptance/interaction/editing/bdd.test.ts
git commit -m "feat(core): paste 按目标 resolved cell type 强转"
```

---

## Task 7: fill type propagation + undo

**Files:**
- Modify: `packages/core/src/features/fill/FillStylePropagator.ts`
- Modify: `packages/core/src/features/fill/FillController.ts`
- Modify: `packages/core/src/features/fill/FillUndoHandler.ts`
- Modify: `packages/core/src/kernel/undo/UndoCommand.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`
- Test: `packages/core/tests/engine/DefaultGridEngine.fill-types.test.ts`
- Test: `packages/core/tests/acceptance/interaction/editing/bdd.test.ts`

- [ ] **Step 1: 写失败测试**

Create `packages/core/tests/engine/DefaultGridEngine.fill-types.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine, InMemoryDataSource, dateToSerial } from '../../src'

const cell = (row: number, col: number) => ({ startRow: row, endRow: row, startCol: col, endCol: col })

describe('DefaultGridEngine.commitFill cell type propagation', () => {
  it('propagates source resolved type and valueFormat across columns with undo redo', () => {
    const serial = dateToSerial(new Date(Date.UTC(2025, 0, 1)))
    const engine = new DefaultGridEngine({
      data: new InMemoryDataSource({
        schema: {
          fields: [
            { id: 'a', name: 'A', type: 'date', width: 100 },
            { id: 'b', name: 'B', type: 'text', width: 100 },
          ],
        },
        rows: [{ a: serial, b: null }, { a: serial + 1, b: null }],
      }),
    })
    engine.setValueFormat({ startRow: 0, endRow: 1, startCol: 0, endCol: 0 }, { kind: 'date', pattern: 'YYYY/MM/DD' })
    expect(engine.commitFill({ startRow: 0, endRow: 1, startCol: 0, endCol: 0 }, { startRow: 0, endRow: 1, startCol: 1, endCol: 1 }, 'right')).not.toBeNull()
    expect(engine.getCellType(0, 1)).toBe('date')
    expect(engine.getViewCellFormat(0, 1)?.valueFormat).toEqual({ kind: 'date', pattern: 'YYYY/MM/DD' })
    engine.undo()
    expect(engine.getCellType(0, 1)).toBe('text')
    engine.redo()
    expect(engine.getCellType(1, 1)).toBe('date')
  })

  it('clears stale target override when source resolved type equals target column default', () => {
    const engine = new DefaultGridEngine({
      data: new InMemoryDataSource({
        schema: {
          fields: [
            { id: 'a', name: 'A', type: 'number', width: 100 },
            { id: 'b', name: 'B', type: 'number', width: 100 },
          ],
        },
        rows: [{ a: 1, b: null }],
      }),
    })
    engine.setCellType(cell(0, 1), 'date')
    engine.commitFill(cell(0, 0), cell(0, 1), 'right')
    expect(engine.getCellType(0, 1)).toBe('number')
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
bun test packages/core/tests/engine/DefaultGridEngine.fill-types.test.ts packages/core/tests/acceptance/interaction/editing/bdd.test.ts
```

Expected: FAIL because fill does not propagate type snapshots.

- [ ] **Step 3: 实现 fill type propagation**

Extend `FillStyleSnapshots`:

```ts
cellTypeBefore?: CellTypeSnapshot
cellTypeAfter?: CellTypeSnapshot
```

Inject into `FillStylePropagator` constructor:

```ts
private readonly cellTypeStore: CellTypeStore,
private readonly resolveRawCellType: (rowIndex: number, colIndex: number) => CellTypeOverride,
private readonly fieldAtRawCol: (rawCol: number) => Field | undefined,
```

In `propagateFillStyles`:

```ts
const cellTypeBefore = this.cellTypeStore.snapshot()
this.tileFillType(rawSource, rawFill, direction)
return { ..., cellTypeBefore, cellTypeAfter: this.cellTypeStore.snapshot() }
```

Implement `tileFillType`:

```ts
private tileFillType(rawSource: RawRange, rawFill: RawRange, direction: FillDirection): void {
  this.cellTypeStore.clear(rawFill)
  const sRows = rawSource.endRow - rawSource.startRow + 1
  const sCols = rawSource.endCol - rawSource.startCol + 1
  const vertical = direction === 'down' || direction === 'up'
  for (let row = rawFill.startRow; row <= rawFill.endRow; row += 1) {
    for (let col = rawFill.startCol; col <= rawFill.endCol; col += 1) {
      const srcRow = vertical ? rawSource.startRow + positiveModulo(row - rawSource.startRow, sRows) : row
      const srcCol = vertical ? col : rawSource.startCol + positiveModulo(col - rawSource.startCol, sCols)
      const srcType = this.resolveRawCellType(srcRow, srcCol)
      const targetField = this.fieldAtRawCol(col)
      const targetDefault = targetField ? normalizeFieldType(targetField.type) : 'text'
      if (srcType !== targetDefault) {
        this.cellTypeStore.set(asRawRange({ startRow: row, endRow: row, startCol: col, endCol: col }), srcType)
      }
    }
  }
}
```

Extend `UndoCommand` `fill` with optional `cellTypeBefore/After`. Extend `FillUndoHandler` context with `restoreCellTypes`, and restore around format/merge/attachment for undo/redo when snapshots exist.

- [ ] **Step 4: 跑测试确认通过**

```bash
bun test packages/core/tests/engine/DefaultGridEngine.fill-types.test.ts packages/core/tests/engine/DefaultGridEngine.fill-styles.test.ts packages/core/tests/acceptance/interaction/editing/bdd.test.ts
```

Expected: fill type tests PASS; existing fill style tests stay PASS.

- [ ] **Step 5: commit**

```bash
git add packages/core/src/features/fill packages/core/src/kernel/undo/UndoCommand.ts packages/core/src/engine/DefaultGridEngine.ts packages/core/tests/engine/DefaultGridEngine.fill-types.test.ts packages/core/tests/acceptance/interaction/editing/bdd.test.ts
git commit -m "feat(core): fill 传播 resolved cell type"
```

---

## Task 8: sort/filter resolved type

**Files:**
- Modify: `packages/core/src/features/view/SortLayer.ts`
- Modify: `packages/core/src/features/view/FilterLayer.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts` if layer constructors are created there
- Test: `packages/core/tests/features/view/SortLayer.test.ts`
- Test: `packages/core/tests/features/view/FilterLayer.test.ts`
- Test: `packages/core/tests/acceptance/functional/data-ops/bdd.test.ts`

- [ ] **Step 1: 写失败测试**

Add to `SortLayer.test.ts`:

```ts
it('sorts mixed resolved types with fixed rank and empty last', () => {
  const rows = [{ v: 'z' }, { v: 2 }, { v: true }, { v: null }, { v: 1 }]
  const layer = new SortLayer({
    resolveCellType: (row) => (row === 1 ? 'number' : row === 2 ? 'checkbox' : row === 4 ? 'date' : 'text'),
  })
  layer.setSpec({ fieldId: 'v', direction: 'asc' })
  const sorted = layer.wrap(makeSource(rows, { fields: [{ id: 'v', name: 'V', type: 'text', width: 80 }] }))
  expect(Array.from({ length: sorted.getRowCount() }, (_, row) => sorted.getCell(row, 'v'))).toEqual([1, 2, 'z', true, null])
  layer.setSpec({ fieldId: 'v', direction: 'desc' })
  const desc = layer.wrap(makeSource(rows, { fields: [{ id: 'v', name: 'V', type: 'text', width: 80 }] }))
  expect(Array.from({ length: desc.getRowCount() }, (_, row) => desc.getCell(row, 'v'))).toEqual([true, 'z', 2, 1, null])
})
```

Adjust helper signature to accept schema if needed.

- [ ] **Step 2: 跑测试确认失败**

```bash
bun test packages/core/tests/features/view/SortLayer.test.ts packages/core/tests/features/view/FilterLayer.test.ts packages/core/tests/acceptance/functional/data-ops/bdd.test.ts
```

Expected: FAIL because `SortLayer` lacks resolver constructor and comparator still uses field type only.

- [ ] **Step 3: 实现 SortLayer resolver**

Add options:

```ts
export interface SortLayerOptions {
  resolveCellType?: (rowIndex: number, field: Field) => CellTypeOverride
}
constructor(private readonly options: SortLayerOptions = {}) {}
```

In comparator:

```ts
const leftType = this.options.resolveCellType?.(leftRow, field) ?? normalizeFieldType(field.type)
const rightType = this.options.resolveCellType?.(rightRow, field) ?? normalizeFieldType(field.type)
const result = compareByResolvedType(leftValue, rightValue, leftType, rightType, spec.direction)
```

Comparator contract:

```ts
const rank = (value, type) => invalidOrEmpty(value, type) ? 3 : type === 'number' || type === 'date' ? 0 : type === 'text' ? 1 : 2
```

For desc, multiply non-empty rank comparison and same-rank value comparison by `-1`; keep empty rank last.

FilterLayer: add options resolver but keep `isCompatibleFilterOp(field, op)` unchanged. For `is-empty` use actual value; for number/date/checkbox predicates use resolved type only when it matches relevant scalar type; otherwise value fails predicate.

- [ ] **Step 4: 跑测试确认通过**

```bash
bun test packages/core/tests/features/view/SortLayer.test.ts packages/core/tests/features/view/FilterLayer.test.ts packages/core/tests/acceptance/functional/data-ops/bdd.test.ts
```

Expected: mixed sort BDD PASS.

- [ ] **Step 5: commit**

```bash
git add packages/core/src/features/view/SortLayer.ts packages/core/src/features/view/FilterLayer.ts packages/core/src/engine/DefaultGridEngine.ts packages/core/tests/features/view/SortLayer.test.ts packages/core/tests/features/view/FilterLayer.test.ts packages/core/tests/acceptance/functional/data-ops/bdd.test.ts
git commit -m "feat(core): sort/filter 使用 resolved cell type"
```

---

## Task 9: structural remap + structural undo snapshots

**Files:**
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`
- Modify: `packages/core/src/features/format/FormatEventHandler.ts` only if a generic event handler split is needed
- Modify: `packages/core/src/features/row/*Undo*.ts`
- Modify: `packages/core/src/features/column/*Undo*.ts`
- Modify: `packages/core/src/kernel/undo/UndoCommand.ts`
- Test: `packages/core/tests/engine/DefaultGridEngine.cell-types.test.ts`
- Test: `packages/core/tests/engine/DefaultGridEngine.format-merge-structural.test.ts`
- Test: `packages/core/tests/engine/DefaultGridEngine.format-merge-structural-undo.test.ts`

- [ ] **Step 1: 写失败测试**

Add to `DefaultGridEngine.cell-types.test.ts`:

```ts
it('remaps cell type overrides after row and column insert/delete/move with undo', () => {
  const engine = new DefaultGridEngine({
    data: new InMemoryDataSource({
      schema: {
        fields: [
          { id: 'a', name: 'A', type: 'text', width: 80 },
          { id: 'b', name: 'B', type: 'number', width: 80 },
        ],
      },
      rows: [{ a: 'r0', b: 1 }, { a: 'r1', b: 2 }],
    }),
  })
  engine.setCellType({ startRow: 1, endRow: 1, startCol: 1, endCol: 1 }, 'date')
  engine.insertRows(1, 1)
  expect(engine.getCellType(2, 1)).toBe('date')
  engine.undo()
  expect(engine.getCellType(1, 1)).toBe('date')
  engine.insertCols(1, 1)
  expect(engine.getCellType(1, 2)).toBe('date')
  engine.undo()
  expect(engine.getCellType(1, 1)).toBe('date')
})
```

- [ ] **Step 2: 跑测试确认失败**

```bash
bun test packages/core/tests/engine/DefaultGridEngine.cell-types.test.ts packages/core/tests/engine/DefaultGridEngine.format-merge-structural-undo.test.ts
```

Expected: FAIL because type store does not remap/restore in structural commands.

- [ ] **Step 3: 实现 structural snapshot/remap**

Add methods on engine or small state wrapper:

```ts
private snapshotCellTypes(): CellTypeSnapshot {
  return this.cellTypeStore.snapshot()
}

private restoreCellTypes(snapshot: CellTypeSnapshot): void {
  this.cellTypeStore.restore(snapshot)
}
```

Hook into event pipeline or structural coordinator after existing format/merge remaps:

```ts
case 'rowsInserted': this.cellTypeStore.remapAfterRowsInserted(event.at, event.count)
case 'rowsDeleted': this.cellTypeStore.remapAfterRowsDeleted([...event.rowIds].sort((a, b) => a - b))
case 'rowsMoved': this.cellTypeStore.remapByRowIndexMap(event.indexMap)
case 'columnsInserted': this.cellTypeStore.remapAfterColsInserted(event.at, event.count)
case 'columnsDeleted': this.cellTypeStore.remapAfterColsDeleted([...event.removedIndices].sort((a, b) => a - b))
case 'columnsMoved': this.cellTypeStore.remapByColIndexMap(event.indexMap)
```

Extend structural undo commands with `cellTypeBefore` / `cellTypeAfter`. Include snapshots alongside format/merge in structural coordinator contexts. Extend row/column undo handlers to call `restoreCellTypes` with before/after snapshots.

- [ ] **Step 4: 跑测试确认通过**

```bash
bun test packages/core/tests/engine/DefaultGridEngine.cell-types.test.ts packages/core/tests/engine/DefaultGridEngine.format-merge-structural.test.ts packages/core/tests/engine/DefaultGridEngine.format-merge-structural-undo.test.ts
```

Expected: structural type remap PASS; existing format/merge structural tests remain PASS.

- [ ] **Step 5: commit**

```bash
git add packages/core/src/engine/DefaultGridEngine.ts packages/core/src/features/row packages/core/src/features/column packages/core/src/kernel/undo/UndoCommand.ts packages/core/tests/engine/DefaultGridEngine.cell-types.test.ts packages/core/tests/engine/DefaultGridEngine.format-merge-structural.test.ts packages/core/tests/engine/DefaultGridEngine.format-merge-structural-undo.test.ts
git commit -m "feat(core): 结构变更同步重映射单元格类型覆盖"
```

---

## Task 10: BDD green + manifests + public inventory

**Files:**
- Modify: all six new scenario `.md` files, `status: draft` → `status: implemented`
- Modify: `packages/core/tests/acceptance/scenarios.manifest.json`
- Modify: `packages/core/tests/acceptance/SCENARIOS.md`
- Modify: `packages/core/tests/acceptance/contract/plugin-api/__goldens__/core.type.public-api-inventory.golden.txt`
- Test: acceptance suites from Task 1

- [ ] **Step 1: 确认外环行为测试全绿**

Run:

```bash
bun test packages/core/tests/acceptance/properties/inventory.test.ts packages/core/tests/acceptance/e2e/grid/bdd.test.ts packages/core/tests/acceptance/interaction/editing/bdd.test.ts packages/core/tests/acceptance/functional/data-ops/bdd.test.ts
```

Expected: PASS; all six new scenario IDs have matching passing tests.

- [ ] **Step 2: 更新 scenario 状态与 manifest**

Change the six scenario frontmatter fields:

```yaml
status: implemented
```

Run:

```bash
bun run --filter @novasheet/mbd mbd validate --config ../../packages/core/mbd.config.ts
bun run --filter @novasheet/mbd mbd manifest --config ../../packages/core/mbd.config.ts
```

Expected: `mbd validate: 81 scenario(s) ok`; manifest and SCENARIOS regenerated.

- [ ] **Step 3: 更新 public API inventory golden**

Run:

```bash
bun test packages/core/tests/acceptance/contract/plugin-api/bdd.test.ts
```

Expected: if golden fails because new public exports are present, update `packages/core/tests/acceptance/contract/plugin-api/__goldens__/core.type.public-api-inventory.golden.txt` to include:

```text
CellTypeEntry
CellTypeOverride
CellTypeSnapshot
CellTypeStore
normalizeFieldType
```

Then rerun the same test and expect PASS.

- [ ] **Step 4: scenario coverage**

Run:

```bash
bun run --filter @novasheet/react lint:scenario-coverage
```

Expected: PASS; no missing/orphan scenario IDs.

- [ ] **Step 5: commit**

```bash
git add packages/core/tests/acceptance packages/core/tests/acceptance/contract/plugin-api/__goldens__/core.type.public-api-inventory.golden.txt
git commit -m "test(core): 单元格类型覆盖行为场景转绿"
```

---

## Task 11: full verification and build order

**Files:**
- No source edits expected unless verification reveals real failures.

- [ ] **Step 1: lint**

```bash
bun run lint
```

Expected: 0 errors / 0 warnings.

- [ ] **Step 2: typecheck**

```bash
bun run --filter '*' typecheck
```

Expected: PASS.

- [ ] **Step 3: tests**

```bash
bun test
```

Expected: PASS.

- [ ] **Step 4: ordered builds**

```bash
bun run --filter @novasheet/web build && bun run --filter @novasheet/canvas2d build && bun run --filter @novasheet/core build
```

Expected: PASS.

- [ ] **Step 5: final commit if verification-only fixes were needed**

If verification required any code/test/doc fix, inspect the exact changed files first:

```bash
git status --short
git add packages/core/src packages/core/tests packages/core/tests/acceptance packages/canvas2d/src packages/canvas2d/tests packages/react/src packages/react/tests docs/superpowers/plans/2026-06-14-novasheet-cell-level-type-override.md
git commit -m "fix(core): 修正单元格类型覆盖收尾问题"
```

Only include paths that actually changed for the verification fix. If no files changed, do not create an empty commit.

---

## Self-Review Checklist

- Spec coverage:
  - `CellTypeStore`/remap covered by Task 2 and Task 9.
  - API/undo covered by Task 3.
  - `RenderFrame.resolveCellType` and default date display covered by Task 4.
  - edit/runtime registry covered by Task 5.
  - paste target resolved type covered by Task 6.
  - fill parity covered by Task 7.
  - sort/filter covered by Task 8.
  - BDD status/manifest/gates covered by Task 10 and Task 11.
- Plan risk:
  - `source/fill view→raw 非连续` must keep existing conservative no-op for propagation.
  - `setCellType` must not coerce or clear values.
  - `paste` must not propagate source type.
  - `singleSelect`/`multiSelect`/`url`/custom type must not expand this spec.
  - Date display default must use resolved type, not raw `field.type`.
- Worker prompt requirements:
  - Every subagent must read this plan, the Spec file, BDD method spec, and the scenario paths for its task.
  - If a test expectation conflicts with spec or Google parity scope, STOP+ASK; do not silently pick.
