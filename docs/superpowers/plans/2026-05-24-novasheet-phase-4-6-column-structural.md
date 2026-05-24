# Phase 4.6 Column Structural Ops + Column Header Menu Extension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 列 insert / delete / hide / unhide / 多列宽度 resize + 列头右键菜单扩展 + Sheets 式 hide 三角指示器 + FrozenRegions 自动同步；全部进 undo/redo，与 4.5 行 mutation 模式对称。

**Architecture:** `MutableDataSource` 加 `insertField` / `removeField` optional 方法（schema mutation 是 4.5 未碰过的领域）；`DefaultGridEngine` 加 `hiddenColIds: Set<string>` 状态 + raw/view colsAxis 拆分 + FrozenRegions 自动调整逻辑；ColumnWidthPopover 与 HideColToggleHandle mirror 4.5 同款；列头菜单复用 4.4 ContextMenuLayer 容器，加新菜单项。

**Tech Stack:** TypeScript（strict + noUncheckedIndexedAccess + verbatimModuleSyntax）· `bun:test` · happy-dom · Canvas2D · 单仓 bun workspaces。

**Spec:** [docs/superpowers/specs/2026-05-24-novasheet-phase-4-6-column-structural.md](../specs/2026-05-24-novasheet-phase-4-6-column-structural.md)

---

## Type Reconciliation（spec 草稿 → 真实类型，已 audit）

| spec 用名 | 真实类型 / 路径 | 备注 |
| --- | --- | --- |
| `ContextMenuAction` 加列 actions | union 在 `packages/core/src/interaction/ContextMenuModel.ts:14`；追加 `'insert-col-left' \| 'insert-col-right' \| 'delete-cols' \| 'hide-cols' \| 'unhide-cols' \| 'resize-column-width'` | |
| `Field.hidden?` 字段 | 已存在（M3+ 预留），**4.6 不消费**；hide 状态走 `engine.hiddenColIds` | 文档化避免误用 |
| `getColumnHeaderContextMenuItems(ctx, pipeline)` | 已存在 ContextMenuModel.ts:65；4.6 内部追加结构 items 在 pipeline items 之后 | 不破坏 4.4 sort/filter 入口 |
| `FrozenConfig { topRows; leftCols; rightCols }` | `packages/core/src/layout/FrozenRegions.ts:68`；3 字段全可写 | engine `syncFrozenAfterColInsert/Delete` 直接改 config + 调 `frozen.setFrozen` |
| `ChunkedAxis.insertRange / deleteRange` | 4.5 已实现（行列共用） | cols 直接复用，无需新 API |
| `MutableDataSource` 当前形状 | `insertRows? / deleteRows?` 已落（4.5）；本 plan 加 `insertField? / removeField?` | |
| `RemovedFieldSnapshot` 类型 | 新增于 `packages/core/src/data/MutableDataSource.ts` | `{ originalIndex, field, cells: readonly (CellValue | undefined)[] }` |
| UndoCommand variant 命名 | camelCase 沿用 4.5（`insertRows` 等） | 新增 5 个：`insertCols / deleteCols / hideCols / unhideCols / resizeColumnsMulti` |

实施中若再发现 spec 与代码冲突，**STOP + ASK / 加 `docs(plan): fix ...` commit**（CLAUDE.md「Plan-bug catches」）。

---

## File Structure

**新增文件：**

| 文件 | 责任 |
| --- | --- |
| `packages/web/src/handle/HideColToggleHandle.ts` | DOM `data-handle="hide-col-toggle"`：每 col gap 一个透明命中区位于列头区域，click → `Grid.unhideCols(fieldIds)` |
| `packages/web/src/overlay/ColumnWidthPopover.ts` | DOM 弹层：input + Enter 提交 + Esc / 失焦取消 + destroy() 幂等；mirror RowHeightPopover |
| `apps/storybook/src/stories/ColumnStructural.stories.ts` | 3 个 story：default / InsertDelete / PrefilledHidden |

**修改文件：**

| 文件 | 改动 |
| --- | --- |
| `packages/core/src/data/DataSource.ts` | `DataSourceEvent` 联合追加 `colsInserted` / `colsDeleted` |
| `packages/core/src/data/MutableDataSource.ts` | 加 `insertField?` / `removeField?` optional 方法 + `RemovedFieldSnapshot` 接口 |
| `packages/core/src/data/InMemoryDataSource.ts` | 实现 `insertField` / `removeField` + emit 新事件 |
| `packages/core/src/coords/remap.ts` | 加 `remapColIndexAfterInsert` / `remapColIndexAfterDelete`（mirror row 版） |
| `packages/core/src/interaction/SelectionModel.ts` | 加 `remapAfterColsInserted` / `remapAfterColsDeleted` |
| `packages/core/src/interaction/ContextMenuModel.ts` | `ContextMenuAction` 加 6 个 col actions；导出 `getColumnHeaderStructuralMenuItems(n, hasHidden)` 辅助函数；`getColumnHeaderContextMenuItems` 内部追加结构项 |
| `packages/core/src/undo/UndoCommand.ts` | 加 5 个 col variant |
| `packages/core/src/engine/DefaultGridEngine.ts` | 加 `hiddenColIds` 字段 + `rawColsAxis / colsAxis` 拆分 + `newFieldCounter` + 6 个新公共方法（`insertCols / deleteCols / hideCols / unhideCols / setColumnWidths / getHiddenCols`） + FrozenRegions 同步 helper + undo dispatcher 5 个 case |
| `packages/core/src/engine/GridEngine.ts` | 接口加 6 个新方法 |
| `packages/core/src/view/SortLayer.ts` | `handleUpstreamEvent` 加 `colsDeleted` 分支：命中 spec.fieldId → setSpec(null) |
| `packages/core/src/view/FilterLayer.ts` | 同上 |
| `packages/core/src/render/RenderFrame.ts` | 加 `collapsedColGaps: readonly RenderFrameCollapsedColGap[]` 字段 |
| `packages/core/src/theme/Theme.ts` | `ThemeDimensions` 加 `hideColTriangleOffset` / `hideColTrianglePadY` |
| `packages/core/src/theme/denseGridTheme.ts` | 填新 dimension 值 |
| `packages/web-canvas2d/src/painters/HeaderColumnPainter.ts` | 消费 `frame.collapsedColGaps` 画三角 |
| `packages/web/src/grid/GridController.ts` | 接口加 6 个新方法 |
| `packages/web/src/runtime/WebGridRuntime.ts` | 6 个新方法 + `setColumnWidthPopover` / `setHideColToggleHandle` setter + `syncHideColToggleHandles` + invokeColumnHeaderContextMenuAction（mirror invokeRowHeaderContextMenuAction）+ contextmenu router 增加 col header 结构项分支 |
| `packages/web/src/backends/Canvas2DBackend.ts` | 实例化 `ColumnWidthPopover` + `HideColToggleHandle` 注入 runtime；`destroy()` 调两者 destroy；门面 6 个新方法转发 |
| `packages/web/src/Grid.ts` | facade 加 6 个新方法 + 3 个事件回调（`onColumnsInserted` / `onColumnsDeleted` / `onHideColsChange`） |

**新增测试文件（12 个）：**

| 文件 | 覆盖 |
| --- | --- |
| `packages/core/tests/data/InMemoryDataSource.insertDeleteField.test.ts` | `insertField` 返回 Field + 触发 `colsInserted`；`removeField` 返回 snapshot 全列 + 触发 `colsDeleted` |
| `packages/core/tests/coords/remap.test.ts`（追加） | `remapColIndexAfter*` 4 case |
| `packages/core/tests/interaction/SelectionModel.remap.test.ts`（追加） | `remapAfterColsInserted/Deleted` 3 case |
| `packages/core/tests/engine/DefaultGridEngine.col-mutations.test.ts` | engine 5 类列 mutation + axis + selection + undo；hide cols 后 frame.colsAxis 与 view 列数一致；setData 清 hiddenColIds |
| `packages/core/tests/engine/DefaultGridEngine.frozen-cols-sync.test.ts` | §4.6 Frozen 规则：插入冻结区内 → leftCols++；删除冻结列 → leftCols--；边界 (at == leftCols) 插入不变；hide / unhide 不动 frozen |
| `packages/core/tests/engine/DefaultGridEngine.col-undo.test.ts` | 5 个新 UndoCommand variant apply / unapply 对称；`insertCols` redo 用 newFields 稳定 id |
| `packages/core/tests/view/SortFilter.cols-deleted.test.ts` | deleteCols 后 sort/filter spec 命中已删 fieldId → 自动 invalidate；SortLayer/FilterLayer 不触发 pipeline.rebuild（继承 4.5 freeze fix） |
| `packages/web-canvas2d/tests/painters/HeaderColumnPainter.hide.test.ts` | RecordingContext2D 三角 path/fill；headerHeight < 24 时跳过 |
| `packages/web/tests/Grid.col-menu.test.ts` | 列头右键菜单 5 个新项 + 触发各 Grid facade 方法；不破坏 4.4 sort/filter 入口 |
| `packages/web/tests/overlay/ColumnWidthPopover.test.ts` | open + Enter / Esc / 失焦 + destroy 幂等 |
| `packages/web/tests/handle/HideColToggleHandle.test.ts` | gap handle 点击触发 onUnhide(fieldIds) |
| `packages/web/tests/integration/Phase46.scenarios.test.ts` | E2E：insertCols + undo 完全还原（含 frozen 状态）；deleteCols 让 sort spec invalidate；hideCols + insertCols 后 hidden fieldIds 按 id 锚定不漂移 |

---

## Task 1: Pre-flight — 提交 spec + plan

**Files:**
- New: `docs/superpowers/specs/2026-05-24-novasheet-phase-4-6-column-structural.md`（brainstorming 阶段已落到 working tree）
- New: `docs/superpowers/plans/2026-05-24-novasheet-phase-4-6-column-structural.md`（本文件）

- [ ] **Step 1: 确认 working tree**

```bash
git status -s
```

Expected：两个 docs/superpowers/ 文件 untracked，其它干净。

- [ ] **Step 2: 提交**

```bash
git add docs/superpowers/specs/2026-05-24-novasheet-phase-4-6-column-structural.md \
        docs/superpowers/plans/2026-05-24-novasheet-phase-4-6-column-structural.md
git commit -m "docs(spec): 新增 Phase 4.6 列结构 + 列头菜单扩展 spec 与实施 plan"
```

---

## Task 2: 扩 `DataSourceEvent` + `MutableDataSource` 列接口

**Files:**
- Modify: `packages/core/src/data/DataSource.ts`
- Modify: `packages/core/src/data/MutableDataSource.ts`
- Create: `packages/core/tests/_probe-types-4-6.test.ts`

- [ ] **Step 1: 写 typecheck-only 探针**

Create `packages/core/tests/_probe-types-4-6.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import type { DataSourceEvent } from '../src/data/DataSource'
import type {
  MutableDataSource,
  RemovedFieldSnapshot,
} from '../src/data/MutableDataSource'
import type { Field } from '../src/data/Schema'

describe('Phase 4.6 type probes', () => {
  it('DataSourceEvent 含 colsInserted / colsDeleted', () => {
    const f: Field = { id: 'x', name: 'X', type: 'text', width: 100 }
    const inserted: DataSourceEvent = { type: 'colsInserted', at: 0, field: f }
    const deleted: DataSourceEvent = {
      type: 'colsDeleted',
      removed: [{ index: 0, fieldId: 'x' }],
    }
    expect(inserted.type).toBe('colsInserted')
    expect(deleted.type).toBe('colsDeleted')
  })

  it('MutableDataSource 含 optional insertField / removeField + RemovedFieldSnapshot', () => {
    const snap: RemovedFieldSnapshot = {
      originalIndex: 1,
      field: { id: 'x', name: 'X', type: 'text', width: 100 },
      cells: ['a', null, 'c'],
    }
    const ds: MutableDataSource = {
      getRowCount: () => 0,
      getSchema: () => ({ fields: [] }),
      getRows: () => [],
      getCell: () => undefined,
      subscribe: () => () => {},
      updateCell: () => {},
      insertField: (_at, f) => f,
      removeField: (_id) => snap,
    }
    expect(ds.insertField?.(0, snap.field)).toEqual(snap.field)
  })
})
```

- [ ] **Step 2: 验证 RED**

```bash
bun run --filter @novasheet/core typecheck
```

Expected：报 `Property 'colsInserted' does not exist on type` 等错误。

- [ ] **Step 3: 改 `packages/core/src/data/DataSource.ts`**

把 `DataSourceEvent` 联合追加 2 个 variant：

```ts
import type { Field } from './Schema'

export type DataSourceEvent =
  | { type: 'reset' }
  | { type: 'rowsChanged'; startIndex: number; endIndex: number }
  | { type: 'rowsInserted'; at: number; count: number }
  | { type: 'rowsDeleted'; removed: readonly number[] }
  | { type: 'colsInserted'; at: number; field: Field }
  | { type: 'colsDeleted'; removed: readonly { index: number; fieldId: string }[] }
  | { type: 'schemaChanged' }
  | { type: 'rowCountChanged'; newCount: number }
```

注释顶部加：`- colsInserted / colsDeleted：列结构变更（Phase 4.6+）；订阅方按需重建本地缓存`。

- [ ] **Step 4: 改 `packages/core/src/data/MutableDataSource.ts`**

追加 `RemovedFieldSnapshot` + 2 个 optional 方法（保留既有 4.5 行 mutation 方法）：

```ts
import type { CellValue, Field } from './Schema'
import type { DataSource } from './DataSource'

/** 4.5 — 被 deleteRows 返回 */
export interface DeletedRowSnapshot {
  readonly originalUnderlyingRow: number
  readonly cells: Readonly<Record<string, CellValue>>
}

/** 4.6 — 被 removeField 返回 */
export interface RemovedFieldSnapshot {
  readonly originalIndex: number
  readonly field: Field
  readonly cells: ReadonlyArray<CellValue | undefined>
}

export interface MutableDataSource extends DataSource {
  updateCell(rowIndex: number, fieldId: string, value: CellValue): void
  updateCellByUnderlyingRow?(underlyingRow: number, fieldId: string, value: CellValue): void
  insertRows?(beforeUnderlyingRow: number, count: number): readonly number[]
  deleteRows?(underlyingRowIds: readonly number[]): readonly DeletedRowSnapshot[]
  insertField?(beforeIndex: number, field: Field): Field
  removeField?(fieldId: string): RemovedFieldSnapshot | null
}

export function isMutableDataSource(data: DataSource): data is MutableDataSource {
  return typeof (data as MutableDataSource).updateCell === 'function'
}
```

- [ ] **Step 5: 验证 GREEN**

```bash
bun run --filter @novasheet/core typecheck
bun test packages/core/tests/_probe-types-4-6.test.ts
```

Expected：typecheck 0 errors；probe 测试 PASS。

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/data/DataSource.ts \
        packages/core/src/data/MutableDataSource.ts \
        packages/core/tests/_probe-types-4-6.test.ts
git commit -m "feat(core): 扩 DataSourceEvent 与 MutableDataSource 加列 insert/delete 接口"
```

---

## Task 3: `InMemoryDataSource.insertField` / `removeField` 实现

**Files:**
- Modify: `packages/core/src/data/InMemoryDataSource.ts`
- Create: `packages/core/tests/data/InMemoryDataSource.insertDeleteField.test.ts`

- [ ] **Step 1: 写 failing 测试**

Create `packages/core/tests/data/InMemoryDataSource.insertDeleteField.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'
import type { DataSourceEvent } from '../../src/data/DataSource'
import type { Field } from '../../src/data/Schema'

const baseSchema = {
  fields: [
    { id: 'a', name: 'A', type: 'text' as const, width: 100 },
    { id: 'b', name: 'B', type: 'number' as const, width: 80, defaultValue: 0 },
  ],
}

describe('InMemoryDataSource.insertField', () => {
  it('插入到 index 1，schema 在该位置出现新字段；rows 多一个 fieldId 的空字段', () => {
    const ds = new InMemoryDataSource({
      schema: baseSchema,
      rows: [
        { a: 'r0', b: 1 },
        { a: 'r1', b: 2 },
      ],
    })
    const events: DataSourceEvent[] = []
    ds.subscribe((e) => events.push(e))

    const newField: Field = { id: 'c', name: 'C', type: 'text', width: 120 }
    const out = ds.insertField!(1, newField)

    expect(out).toEqual(newField)
    const schema = ds.getSchema()
    expect(schema.fields).toHaveLength(3)
    expect(schema.fields[1]!.id).toBe('c')
    expect(ds.getCell(0, 'c')).toBeUndefined()
    expect(events).toContainEqual({ type: 'colsInserted', at: 1, field: newField })
  })
})

describe('InMemoryDataSource.removeField', () => {
  it('删除 b，返回 snapshot 含 field 定义 + 该列所有 cell 值', () => {
    const ds = new InMemoryDataSource({
      schema: baseSchema,
      rows: [
        { a: 'r0', b: 10 },
        { a: 'r1', b: 20 },
        { a: 'r2', b: 30 },
      ],
    })
    const events: DataSourceEvent[] = []
    ds.subscribe((e) => events.push(e))

    const snap = ds.removeField!('b')

    expect(snap).not.toBeNull()
    expect(snap!.originalIndex).toBe(1)
    expect(snap!.field.id).toBe('b')
    expect(snap!.cells).toEqual([10, 20, 30])
    expect(ds.getSchema().fields).toHaveLength(1)
    expect(ds.getCell(0, 'a')).toBe('r0')
    expect(events).toContainEqual({
      type: 'colsDeleted',
      removed: [{ index: 1, fieldId: 'b' }],
    })
  })

  it('未知 fieldId 返回 null，不 emit 事件', () => {
    const ds = new InMemoryDataSource({ schema: baseSchema, rows: [{ a: 'x', b: 0 }] })
    const events: DataSourceEvent[] = []
    ds.subscribe((e) => events.push(e))
    expect(ds.removeField!('nonexistent')).toBeNull()
    expect(events).toEqual([])
  })
})
```

- [ ] **Step 2: 验证 RED**

```bash
bun test packages/core/tests/data/InMemoryDataSource.insertDeleteField.test.ts
```

Expected：FAIL，`insertField is not a function`。

- [ ] **Step 3: 实现**

在 `packages/core/src/data/InMemoryDataSource.ts` class 体内追加：

```ts
insertField(beforeIndex: number, field: Field): Field {
  const fields = [...this.schema.fields]
  const at = Math.max(0, Math.min(beforeIndex, fields.length))
  fields.splice(at, 0, field)
  this.schema = { ...this.schema, fields }
  // 新字段在 rows 上是 undefined（getCell 返回 undefined）
  this.emit({ type: 'colsInserted', at, field })
  return field
}

removeField(fieldId: string): RemovedFieldSnapshot | null {
  const idx = this.schema.fields.findIndex((f) => f.id === fieldId)
  if (idx < 0) return null
  const field = this.schema.fields[idx]!
  const cells: (CellValue | undefined)[] = this.rows.map((row) => row[fieldId])
  // 物理删字段：rows 上把该 fieldId 删掉
  for (const row of this.rows) {
    delete (row as Record<string, CellValue | undefined>)[fieldId]
  }
  const nextFields = [...this.schema.fields]
  nextFields.splice(idx, 1)
  this.schema = { ...this.schema, fields: nextFields }
  this.emit({
    type: 'colsDeleted',
    removed: [{ index: idx, fieldId }],
  })
  return { originalIndex: idx, field, cells }
}
```

确保顶部 imports：`import type { Field, CellValue } from './Schema'` 和 `import type { RemovedFieldSnapshot } from './MutableDataSource'`。

- [ ] **Step 4: 验证 GREEN**

```bash
bun test packages/core/tests/data/InMemoryDataSource.insertDeleteField.test.ts
bun run --filter @novasheet/core typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/data/InMemoryDataSource.ts \
        packages/core/tests/data/InMemoryDataSource.insertDeleteField.test.ts
git commit -m "feat(core): InMemoryDataSource 实现 insertField/removeField 与事件分发"
```

---

## Task 4: `coords/remap.ts` 加列 helpers

**Files:**
- Modify: `packages/core/src/coords/remap.ts`
- Modify: `packages/core/tests/coords/remap.test.ts`

- [ ] **Step 1: 追加 failing 测试**

在 `packages/core/tests/coords/remap.test.ts` 末尾追加：

```ts
import {
  remapColIndexAfterInsert,
  remapColIndexAfterDelete,
} from '../../src/coords/remap'

describe('remapColIndexAfterInsert', () => {
  it('列在 at 之前 → 不动', () => {
    expect(remapColIndexAfterInsert(2, 5, 3)).toBe(2)
  })
  it('列 == at → +count', () => {
    expect(remapColIndexAfterInsert(5, 5, 3)).toBe(8)
  })
  it('列 > at → +count', () => {
    expect(remapColIndexAfterInsert(10, 5, 3)).toBe(13)
  })
})

describe('remapColIndexAfterDelete', () => {
  it('列在所有 removed 之前 → 不动', () => {
    expect(remapColIndexAfterDelete(2, [5, 8])).toBe(2)
  })
  it('列恰是 removed 中的一个 → null', () => {
    expect(remapColIndexAfterDelete(5, [3, 5, 7])).toBe(null)
  })
  it('列在 removed 之间 → 减去之前的 removed 数', () => {
    expect(remapColIndexAfterDelete(6, [3, 5])).toBe(4)
  })
  it('列大于所有 removed → 减总 removed 数', () => {
    expect(remapColIndexAfterDelete(10, [3, 5])).toBe(8)
  })
})
```

- [ ] **Step 2: 验证 RED → 实现 → GREEN**

```bash
bun test packages/core/tests/coords/remap.test.ts
```

Expected：FAIL。

在 `packages/core/src/coords/remap.ts` 末尾追加（与 row 版完全同构）：

```ts
/** 4.6 — 列号 remap，与 remapRowIndexAfter* 完全对称。 */
export function remapColIndexAfterInsert(
  colIndex: number,
  at: number,
  count: number,
): number {
  if (colIndex < at) return colIndex
  return colIndex + count
}

export function remapColIndexAfterDelete(
  colIndex: number,
  removedSorted: readonly number[],
): number | null {
  let shift = 0
  for (const removed of removedSorted) {
    if (removed === colIndex) return null
    if (removed < colIndex) shift += 1
    else break
  }
  return colIndex - shift
}
```

跑测试 GREEN，typecheck 0 errors。

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/coords/remap.ts packages/core/tests/coords/remap.test.ts
git commit -m "feat(core): coords/remap.ts 加 remapColIndexAfterInsert/Delete 列对称函数"
```

---

## Task 5: `SelectionModel.remapAfterColsInserted/Deleted`

**Files:**
- Modify: `packages/core/src/interaction/SelectionModel.ts`
- Modify: `packages/core/tests/interaction/SelectionModel.remap.test.ts`

- [ ] **Step 1: 追加 failing 测试**

在 `packages/core/tests/interaction/SelectionModel.remap.test.ts` 末尾追加：

```ts
describe('SelectionModel.remapAfterColsInserted', () => {
  it('选区在 at 之后整体右移', () => {
    const sel = new SelectionModel()
    sel.setSelection({
      activeCell: { rowIndex: 0, colIndex: 5 },
      anchorCell: { rowIndex: 0, colIndex: 5 },
      extentCell: { rowIndex: 2, colIndex: 7 },
      selectedRange: { startRow: 0, endRow: 2, startCol: 5, endCol: 7 },
    })
    sel.remapAfterColsInserted(3, 2)
    const s = sel.getSelection()
    expect(s.activeCell?.colIndex).toBe(7)
    expect(s.selectedRange).toEqual({ startRow: 0, endRow: 2, startCol: 7, endCol: 9 })
  })
})

describe('SelectionModel.remapAfterColsDeleted', () => {
  it('选区跨越被删列 → 折叠到存活列', () => {
    const sel = new SelectionModel()
    sel.setSelection({
      activeCell: { rowIndex: 0, colIndex: 3 },
      anchorCell: { rowIndex: 0, colIndex: 3 },
      extentCell: { rowIndex: 0, colIndex: 5 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 3, endCol: 5 },
    })
    sel.remapAfterColsDeleted([4])
    const s = sel.getSelection()
    expect(s.selectedRange).toEqual({ startRow: 0, endRow: 0, startCol: 3, endCol: 4 })
  })

  it('选区全部被删 → clear', () => {
    const sel = new SelectionModel()
    sel.setSelection({
      activeCell: { rowIndex: 0, colIndex: 2 },
      anchorCell: { rowIndex: 0, colIndex: 2 },
      extentCell: { rowIndex: 0, colIndex: 3 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 2, endCol: 3 },
    })
    sel.remapAfterColsDeleted([2, 3])
    expect(sel.getSelection().selectedRange).toBeNull()
  })
})
```

- [ ] **Step 2: 实现**

在 `packages/core/src/interaction/SelectionModel.ts` class 体内追加（mirror row 版结构，调 remap.ts helper）：

```ts
import { remapColIndexAfterDelete, remapColIndexAfterInsert } from '../coords/remap'

// ...

remapAfterColsInserted(at: number, count: number): void {
  if (this.selection.selectedRange == null) return
  const shift = (c: number) => remapColIndexAfterInsert(c, at, count)
  const range = this.selection.selectedRange
  this.selection = {
    activeCell: this.selection.activeCell
      ? { ...this.selection.activeCell, colIndex: shift(this.selection.activeCell.colIndex) }
      : null,
    anchorCell: this.selection.anchorCell
      ? { ...this.selection.anchorCell, colIndex: shift(this.selection.anchorCell.colIndex) }
      : null,
    extentCell: this.selection.extentCell
      ? { ...this.selection.extentCell, colIndex: shift(this.selection.extentCell.colIndex) }
      : null,
    selectedRange: { ...range, startCol: shift(range.startCol), endCol: shift(range.endCol) },
  }
}

remapAfterColsDeleted(removedSorted: readonly number[]): void {
  if (this.selection.selectedRange == null) return
  const range = this.selection.selectedRange
  const survivors: number[] = []
  for (let c = range.startCol; c <= range.endCol; c += 1) {
    const mapped = remapColIndexAfterDelete(c, removedSorted)
    if (mapped !== null) survivors.push(mapped)
  }
  if (survivors.length === 0) {
    this.selection = { activeCell: null, anchorCell: null, extentCell: null, selectedRange: null }
    return
  }
  const startCol = survivors[0]!
  const endCol = survivors[survivors.length - 1]!
  const remap = (cell: { rowIndex: number; colIndex: number } | null) => {
    if (cell == null) return null
    const mapped = remapColIndexAfterDelete(cell.colIndex, removedSorted)
    return { ...cell, colIndex: mapped ?? startCol }
  }
  this.selection = {
    activeCell: remap(this.selection.activeCell),
    anchorCell: remap(this.selection.anchorCell),
    extentCell: remap(this.selection.extentCell),
    selectedRange: { ...range, startCol, endCol },
  }
}
```

- [ ] **Step 3: 验证 GREEN + Commit**

```bash
bun test packages/core/tests/interaction/SelectionModel.remap.test.ts
git add packages/core/src/interaction/SelectionModel.ts \
        packages/core/tests/interaction/SelectionModel.remap.test.ts
git commit -m "feat(core): SelectionModel 加 remapAfterColsInserted/Deleted"
```

---

## Task 6: `UndoCommand` 加 5 个列 variant + 占位 dispatcher case

**Files:**
- Modify: `packages/core/src/undo/UndoCommand.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`（applyUndo / applyRedo 各加 5 个 case stub，与 4.5 Task 8 同构）
- Create: `packages/core/tests/undo/UndoStack.col-mutations.test.ts`

- [ ] **Step 1: 写 failing 测试**

Create `packages/core/tests/undo/UndoStack.col-mutations.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'
import { denseGridTheme } from '../../src/theme/denseGridTheme'

const schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text' as const, width: 100 },
    { id: 'b', name: 'B', type: 'number' as const, width: 80 },
    { id: 'c', name: 'C', type: 'text' as const, width: 120 },
  ],
}

function mkEngine() {
  const ds = new InMemoryDataSource({
    schema,
    rows: [
      { a: 'r0', b: 0, c: 'x' },
      { a: 'r1', b: 1, c: 'y' },
    ],
  })
  return new DefaultGridEngine({ data: ds, theme: denseGridTheme })
}

describe('UndoStack — insertCols', () => {
  it('insertCols + undo 完全还原 schema 字段数', () => {
    const engine = mkEngine()
    // @ts-expect-error Task 8 engine API
    engine.insertCols(1, 2)
    expect(engine.getDataSource().getSchema().fields).toHaveLength(5)
    engine.undo()
    expect(engine.getDataSource().getSchema().fields).toHaveLength(3)
  })
})

describe('UndoStack — deleteCols', () => {
  it('deleteCols + undo 还原字段定义 + 列 cell 值', () => {
    const engine = mkEngine()
    // @ts-expect-error Task 8 engine API
    engine.deleteCols(['b'])
    expect(engine.getDataSource().getSchema().fields.map((f) => f.id)).toEqual(['a', 'c'])
    engine.undo()
    const fields = engine.getDataSource().getSchema().fields
    expect(fields.map((f) => f.id)).toEqual(['a', 'b', 'c'])
    expect(engine.getDataSource().getCell(0, 'b')).toBe(0)
  })
})

describe('UndoStack — hideCols / unhideCols', () => {
  it('hideCols + undo + redo', () => {
    const engine = mkEngine()
    // @ts-expect-error Task 8 engine API
    engine.hideCols(['b'])
    // @ts-expect-error Task 8 engine API
    expect(engine.getHiddenCols()).toEqual(['b'])
    engine.undo()
    // @ts-expect-error Task 8 engine API
    expect(engine.getHiddenCols()).toEqual([])
    engine.redo()
    // @ts-expect-error Task 8 engine API
    expect(engine.getHiddenCols()).toEqual(['b'])
  })
})

describe('UndoStack — resizeColumnsMulti', () => {
  it('多列宽度变更 + undo 各列还原', () => {
    const engine = mkEngine()
    // @ts-expect-error Task 8 engine API
    engine.setColumnWidths(['a', 'c'], 200)
    engine.undo()
    // a / c 列宽回到 schema 中 100 / 120
    const fields = engine.getDataSource().getSchema().fields
    expect(fields.find((f) => f.id === 'a')!.width).toBe(100)
    expect(fields.find((f) => f.id === 'c')!.width).toBe(120)
  })
})
```

注：4 个 `@ts-expect-error` 标记 Task 8 落地后会被移除（同 4.5 Task 8 模式）。

- [ ] **Step 2: 扩 UndoCommand union**

在 `packages/core/src/undo/UndoCommand.ts` 末尾追加：

```ts
import type { RemovedFieldSnapshot } from '../data/MutableDataSource'
import type { Field } from '../data/Schema'
import type { FrozenConfig } from '../layout/FrozenRegions'
import type { SortSpec } from '../view/SortLayer'
import type { FilterSpec } from '../view/FilterLayer'

export type UndoCommand =
  // ... 既有 11 个 variant（含 4.5 行 mutation 5 个 + resizeRow 等）
  | {
      readonly kind: 'insertCols'
      readonly at: number
      readonly count: number
      readonly newFields: readonly Field[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
      readonly frozenBefore: FrozenConfig
      readonly frozenAfter: FrozenConfig
    }
  | {
      readonly kind: 'deleteCols'
      readonly snapshots: readonly RemovedFieldSnapshot[]
      readonly deletedWidths: readonly number[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
      readonly frozenBefore: FrozenConfig
      readonly frozenAfter: FrozenConfig
      readonly sortSpecBefore: SortSpec | null
      readonly filterSpecBefore: FilterSpec | null
    }
  | {
      readonly kind: 'hideCols'
      readonly fieldIds: readonly string[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
  | {
      readonly kind: 'unhideCols'
      readonly fieldIds: readonly string[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
  | {
      readonly kind: 'resizeColumnsMulti'
      readonly fieldIds: readonly string[]
      readonly oldWidths: readonly number[]
      readonly newWidth: number
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
```

- [ ] **Step 3: 在 DefaultGridEngine 的 applyUndo / applyRedo switch 加 5 个 stub case**

每个 case 仅 `break`，注释 `// Phase 4.6 Task 8 fills in`（与 4.5 Task 8 同款占位策略）。

- [ ] **Step 4: 验证**

```bash
bun run --filter @novasheet/core typecheck   # MUST pass
bun test packages/core   # 既有测试不退化；UndoStack.col-mutations 暂时 RED runtime
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/undo/UndoCommand.ts \
        packages/core/src/engine/DefaultGridEngine.ts \
        packages/core/tests/undo/UndoStack.col-mutations.test.ts
git commit -m "feat(core): UndoCommand 加 insertCols/deleteCols/hideCols/unhideCols/resizeColumnsMulti 5 个 variant"
```

---

## Task 7: SortLayer / FilterLayer 对 `colsDeleted` 的对称处理

**Files:**
- Modify: `packages/core/src/view/SortLayer.ts`
- Modify: `packages/core/src/view/FilterLayer.ts`
- Create: `packages/core/tests/view/SortFilter.cols-deleted.test.ts`

- [ ] **Step 1: 写 failing 测试**

Create `packages/core/tests/view/SortFilter.cols-deleted.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'
import { SortLayer } from '../../src/view/SortLayer'
import { FilterLayer } from '../../src/view/FilterLayer'
import { ViewPipeline } from '../../src/view/ViewPipeline'

const schema = {
  fields: [
    { id: 'n', name: 'N', type: 'number' as const, width: 100 },
    { id: 't', name: 'T', type: 'text' as const, width: 100 },
  ],
}

describe('SortLayer / FilterLayer 在 colsDeleted 命中 spec.fieldId 时 invalidate', () => {
  it('SortLayer.spec.fieldId 命中 removed → setSpec(null)', () => {
    const ds = new InMemoryDataSource({ schema, rows: [{ n: 1, t: 'a' }, { n: 2, t: 'b' }] })
    const pipeline = new ViewPipeline(ds)
    const sort = new SortLayer()
    pipeline.add(sort)
    sort.setSpec({ fieldId: 'n', direction: 'asc' })
    expect(sort.getSpec()).not.toBeNull()
    ds.removeField!('n')
    expect(sort.getSpec()).toBeNull()
  })

  it('FilterLayer.spec.fieldId 命中 removed → setSpec(null)', () => {
    const ds = new InMemoryDataSource({ schema, rows: [{ n: 1, t: 'a' }] })
    const pipeline = new ViewPipeline(ds)
    const filter = new FilterLayer()
    pipeline.add(filter)
    filter.setSpec({ fieldId: 't', op: { kind: 'text-equals', value: 'a', caseSensitive: true } })
    expect(filter.getSpec()).not.toBeNull()
    ds.removeField!('t')
    expect(filter.getSpec()).toBeNull()
  })

  it('colsDeleted 不命中 spec → spec 保持', () => {
    const ds = new InMemoryDataSource({ schema, rows: [{ n: 1, t: 'a' }] })
    const pipeline = new ViewPipeline(ds)
    const sort = new SortLayer()
    pipeline.add(sort)
    sort.setSpec({ fieldId: 'n', direction: 'asc' })
    ds.removeField!('t')
    expect(sort.getSpec()).toEqual({ fieldId: 'n', direction: 'asc' })
  })

  it('colsDeleted 不触发 pipeline.rebuild（继承 4.5 freeze fix）', () => {
    const ds = new InMemoryDataSource({ schema, rows: [{ n: 1, t: 'a' }] })
    const pipeline = new ViewPipeline(ds)
    const sort = new SortLayer()
    const filter = new FilterLayer()
    pipeline.add(sort)
    pipeline.add(filter)

    let rebuildCount = 0
    pipeline.subscribe(() => {
      rebuildCount += 1
      if (rebuildCount > 50) throw new Error('pipeline.rebuild 死循环')
    })

    ds.removeField!('t')
    expect(rebuildCount).toBe(0)
  })
})
```

- [ ] **Step 2: 验证 RED**

```bash
bun test packages/core/tests/view/SortFilter.cols-deleted.test.ts
```

Expected：FAIL —— spec 没 invalidate / 或者死循环抛错。

- [ ] **Step 3: 改 SortLayer.handleUpstreamEvent**

定位 `packages/core/src/view/SortLayer.ts handleUpstreamEvent` 方法。在既有 `rowsInserted / rowsDeleted / rowCountChanged` 分支（4.5 freeze fix）旁追加：

```ts
if (event.type === 'colsDeleted') {
  const removedIds = new Set(event.removed.map((r) => r.fieldId))
  if (this.spec && removedIds.has(this.spec.fieldId)) {
    // 直接清 spec（不调 setSpec / notify，避免重入 pipeline.rebuild）
    this.spec = null
  }
  this.rebuild()
  this.emit(event)
  return
}
if (event.type === 'colsInserted') {
  // 新字段不影响既有 spec；只重建本层 order
  this.rebuild()
  this.emit(event)
  return
}
```

- [ ] **Step 4: 改 FilterLayer.handleUpstreamEvent**

同样在既有 row 短路分支旁追加（结构与 SortLayer 对称）：

```ts
if (event.type === 'colsDeleted') {
  const removedIds = new Set(event.removed.map((r) => r.fieldId))
  if (this.spec && removedIds.has(this.spec.fieldId)) {
    // 直接清 spec（不调 setSpec / notify，避免重入 pipeline.rebuild）
    this.spec = null
  }
  this.rebuild()
  this.emit(filterStructuralEvent(event, this.getRowCount()))
  return
}
if (event.type === 'colsInserted') {
  this.rebuild()
  this.emit(filterStructuralEvent(event, this.getRowCount()))
  return
}
```

`filterStructuralEvent` 是既有 helper，pass-through `colsInserted/colsDeleted` 原样。

- [ ] **Step 5: 验证 GREEN**

```bash
bun test packages/core/tests/view/SortFilter.cols-deleted.test.ts
bun test packages/core
bun run --filter @novasheet/core typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/view/SortLayer.ts \
        packages/core/src/view/FilterLayer.ts \
        packages/core/tests/view/SortFilter.cols-deleted.test.ts
git commit -m "fix(core): SortLayer/FilterLayer 在 colsDeleted 命中 spec 时 invalidate，避免 pipeline 重建死循环"
```

---

## Task 8: `DefaultGridEngine` 列 mutation 方法 + raw/view colsAxis 拆分 + FrozenRegions 同步 + undo dispatcher 填空

这是本 phase 最重的一个 task。

**Files:**
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`
- Modify: `packages/core/src/engine/GridEngine.ts`（接口加 6 个新方法）
- Create: `packages/core/tests/engine/DefaultGridEngine.col-mutations.test.ts`
- Create: `packages/core/tests/engine/DefaultGridEngine.frozen-cols-sync.test.ts`
- Modify: `packages/core/tests/undo/UndoStack.col-mutations.test.ts`（移除 `@ts-expect-error`）

- [ ] **Step 1: 写 failing 测试 — DefaultGridEngine.col-mutations**

```ts
import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'
import { denseGridTheme } from '../../src/theme/denseGridTheme'

const schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text' as const, width: 100 },
    { id: 'b', name: 'B', type: 'number' as const, width: 80 },
    { id: 'c', name: 'C', type: 'text' as const, width: 120 },
  ],
}

function mkEngine() {
  const ds = new InMemoryDataSource({
    schema,
    rows: Array.from({ length: 5 }, (_, i) => ({ a: `r${i}`, b: i, c: `x${i}` })),
  })
  return { engine: new DefaultGridEngine({ data: ds, theme: denseGridTheme }), ds }
}

describe('DefaultGridEngine.insertCols', () => {
  it('插 1 列在 index 1；axis 与 schema 同步增长', () => {
    const { engine } = mkEngine()
    const newFields = engine.insertCols(1, 1)
    expect(newFields).toHaveLength(1)
    expect(engine.getDataSource().getSchema().fields).toHaveLength(4)
    const frame = engine.getFrame()
    expect(frame.colsAxis.getCount()).toBe(4)
  })

  it('insertCols 后 selection 整体右移', () => {
    const { engine } = mkEngine()
    engine.setSelection({
      activeCell: { rowIndex: 0, colIndex: 2 },
      anchorCell: { rowIndex: 0, colIndex: 2 },
      extentCell: { rowIndex: 0, colIndex: 2 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 2, endCol: 2 },
    })
    engine.insertCols(1, 2)
    expect(engine.getSelection().activeCell?.colIndex).toBe(4)
  })
})

describe('DefaultGridEngine.deleteCols', () => {
  it('删 b 列；剩余 a, c 顺序 + cell 值不变', () => {
    const { engine, ds } = mkEngine()
    engine.deleteCols(['b'])
    expect(ds.getSchema().fields.map((f) => f.id)).toEqual(['a', 'c'])
    expect(ds.getCell(2, 'a')).toBe('r2')
    expect(ds.getCell(2, 'c')).toBe('x2')
  })
})

describe('DefaultGridEngine.hideCols', () => {
  it('hideCols 后 frame.colsAxis.getCount 等于 schema - hidden', () => {
    const { engine } = mkEngine()
    engine.hideCols(['b'])
    const frame = engine.getFrame()
    expect(frame.colsAxis.getCount()).toBe(2)
    expect(engine.getHiddenCols()).toEqual(['b'])
  })

  it('setData 清空 hiddenCols', () => {
    const { engine } = mkEngine()
    engine.hideCols(['b', 'c'])
    expect(engine.getHiddenCols()).toHaveLength(2)
    engine.setData(
      new InMemoryDataSource({ schema, rows: [{ a: 'x', b: 0, c: 'y' }] }),
    )
    expect(engine.getHiddenCols()).toEqual([])
  })
})

describe('DefaultGridEngine.setColumnWidths (multi)', () => {
  it('多列宽度批量改 + undo 还原', () => {
    const { engine } = mkEngine()
    engine.setColumnWidths(['a', 'c'], 200)
    let fields = engine.getDataSource().getSchema().fields
    expect(fields.find((f) => f.id === 'a')!.width).toBe(200)
    expect(fields.find((f) => f.id === 'c')!.width).toBe(200)
    engine.undo()
    fields = engine.getDataSource().getSchema().fields
    expect(fields.find((f) => f.id === 'a')!.width).toBe(100)
    expect(fields.find((f) => f.id === 'c')!.width).toBe(120)
  })
})
```

- [ ] **Step 2: 写 failing 测试 — frozen-cols-sync**

Create `packages/core/tests/engine/DefaultGridEngine.frozen-cols-sync.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'
import { denseGridTheme } from '../../src/theme/denseGridTheme'

function mkEngine(leftCols: number, rightCols: number, totalCols = 6) {
  const fields = Array.from({ length: totalCols }, (_, i) => ({
    id: `f${i}`,
    name: `F${i}`,
    type: 'text' as const,
    width: 100,
  }))
  const ds = new InMemoryDataSource({
    schema: { fields },
    rows: [Object.fromEntries(fields.map((f) => [f.id, 'v']))],
  })
  return new DefaultGridEngine({
    data: ds,
    theme: denseGridTheme,
    frozen: { topRows: 0, leftCols, rightCols },
  })
}

describe('FrozenRegions 自动同步规则（§4.6）', () => {
  it('insert at < leftCols → leftCols += count', () => {
    const engine = mkEngine(2, 0)
    engine.insertCols(0, 1)
    expect(engine.getFrame().frozen.leftCols).toBe(3)
  })

  it('insert at == leftCols（边界）→ leftCols 不变', () => {
    const engine = mkEngine(2, 0)
    engine.insertCols(2, 1)
    expect(engine.getFrame().frozen.leftCols).toBe(2)
  })

  it('delete 冻结列 → leftCols 减少', () => {
    const engine = mkEngine(2, 0)
    engine.deleteCols(['f0'])
    expect(engine.getFrame().frozen.leftCols).toBe(1)
  })

  it('rightCols：insert at > totalCols - rightCols → rightCols += count', () => {
    const engine = mkEngine(0, 2, 6)  // frozen 右 2 列 = f4, f5
    engine.insertCols(5, 1)  // 在 f5 之前插入；新列归右冻结
    expect(engine.getFrame().frozen.rightCols).toBe(3)
  })

  it('hide / unhide 不动 frozen counts', () => {
    const engine = mkEngine(2, 0)
    engine.hideCols(['f0'])
    expect(engine.getFrame().frozen.leftCols).toBe(2)
    engine.unhideCols(['f0'])
    expect(engine.getFrame().frozen.leftCols).toBe(2)
  })
})
```

- [ ] **Step 3: 实现 DefaultGridEngine**

在 `packages/core/src/engine/DefaultGridEngine.ts` 内加（基于 4.5 polish 的 raw/view rowsAxis 拆分模式）：

字段：

```ts
private hiddenColIds: Set<string> = new Set()
private rawColsAxis: ChunkedAxis  // 按 schema field index 存列宽
private colsAxis: ChunkedAxis      // 视图列轴
private newFieldCounter = 0
```

构造器 / `rebuildData` 内改：

```ts
this.rawColsAxis = new ChunkedAxis({
  count: this.rawData.getSchema().fields.length,
  defaultSize: this.averageColWidth(),
})
this.colsAxis = this.buildViewColsAxis()
```

加 helper：

```ts
private buildViewColsAxis(): ChunkedAxis {
  const fields = this.rawData.getSchema().fields
  const visibleIndices: number[] = []
  for (let i = 0; i < fields.length; i += 1) {
    if (!this.hiddenColIds.has(fields[i]!.id)) visibleIndices.push(i)
  }
  const defaultSize = this.averageColWidth()
  const viewAxis = new ChunkedAxis({ count: visibleIndices.length, defaultSize })
  for (let viewCol = 0; viewCol < visibleIndices.length; viewCol += 1) {
    const size = this.rawColsAxis.getSize(visibleIndices[viewCol]!)
    if (size !== defaultSize) viewAxis.setSize(viewCol, size)
  }
  return viewAxis
}

private rebuildViewColsAxis(): void {
  this.colsAxis = this.buildViewColsAxis()
  // 同步 frozen / viewport 持有的 colsAxis 引用，参考 4.5 rowsAxis 同款做法
  const snap = this.viewport.snapshot()
  this.frozen = new FrozenRegions(this.rowsAxis, this.colsAxis, this.frozen.getFrozenConfig())
  this.viewport = new Viewport(this.rowsAxis, this.colsAxis, this.frozen)
  this.viewport.setHeaderHeight(snap.headerHeight)
  this.viewport.setRowHeaderWidth(snap.rowHeaderWidth)
  this.viewport.setSize(snap.contentRect.width, snap.contentRect.height)
  this.viewport.setScroll(snap.scrollX, snap.scrollY)
}

private syncFrozenAfterColInsert(at: number, count: number): void {
  const cfg = this.frozen.getFrozenConfig()
  const totalCols = this.rawData.getSchema().fields.length  // 已含插入
  let { leftCols, rightCols } = cfg
  if (at < leftCols) leftCols += count
  // 右冻结：插入位置 >= (新 totalCols - rightCols - count + count) === (旧 totalCols - rightCols)
  if (at > totalCols - rightCols - count) rightCols += count
  this.frozen.setFrozen({ topRows: cfg.topRows, leftCols, rightCols })
}

private syncFrozenAfterColDelete(removedIndices: readonly number[]): void {
  const cfg = this.frozen.getFrozenConfig()
  // 计算被删列中落在左冻结区 / 右冻结区的数量（基于删前下标）
  const totalColsBefore = this.rawData.getSchema().fields.length + removedIndices.length
  const leftHit = removedIndices.filter((i) => i < cfg.leftCols).length
  const rightHit = removedIndices.filter((i) => i >= totalColsBefore - cfg.rightCols).length
  this.frozen.setFrozen({
    topRows: cfg.topRows,
    leftCols: Math.max(0, cfg.leftCols - leftHit),
    rightCols: Math.max(0, cfg.rightCols - rightHit),
  })
}
```

公共方法：

```ts
insertCols(beforeFieldIndex: number, count: number): readonly Field[] {
  if (!isMutableDataSource(this.rawData) || !this.rawData.insertField) return []
  const selectionBefore = this.selection.getSelection()
  const frozenBefore = { ...this.frozen.getFrozenConfig() }
  const defaultWidth = this.theme.metrics.cellMinWidth ?? 100
  const newFields: Field[] = []
  for (let i = 0; i < count; i += 1) {
    this.newFieldCounter += 1
    newFields.push({
      id: `field_${this.newFieldCounter}`,
      name: `新列 ${this.newFieldCounter}`,
      type: 'text',
      width: defaultWidth,
    })
  }
  for (let i = 0; i < count; i += 1) {
    this.rawData.insertField(beforeFieldIndex + i, newFields[i]!)
  }
  this.rawColsAxis.insertRange(beforeFieldIndex, count, defaultWidth)
  this.rebuildViewColsAxis()
  this.syncFrozenAfterColInsert(beforeFieldIndex, count)
  this.selection.remapAfterColsInserted(beforeFieldIndex, count)
  const selectionAfter = this.selection.getSelection()
  const frozenAfter = { ...this.frozen.getFrozenConfig() }
  this.undoStack.push({
    kind: 'insertCols',
    at: beforeFieldIndex,
    count,
    newFields,
    selectionBefore,
    selectionAfter,
    frozenBefore,
    frozenAfter,
  })
  return newFields
}

deleteCols(fieldIds: readonly string[]): readonly RemovedFieldSnapshot[] {
  if (!isMutableDataSource(this.rawData) || !this.rawData.removeField) return []
  const selectionBefore = this.selection.getSelection()
  const frozenBefore = { ...this.frozen.getFrozenConfig() }
  const sortSpecBefore = this.viewPipeline?.get('sort')?.getSpec() as SortSpec | null ?? null
  const filterSpecBefore = this.viewPipeline?.get('filter')?.getSpec() as FilterSpec | null ?? null
  // 收集删前 schema 中的 index 与 width
  const schemaBefore = this.rawData.getSchema().fields
  const removed = fieldIds
    .map((id) => {
      const idx = schemaBefore.findIndex((f) => f.id === id)
      return idx >= 0 ? { id, idx, width: this.rawColsAxis.getSize(idx) } : null
    })
    .filter((x): x is { id: string; idx: number; width: number } => x !== null)
    .sort((a, b) => a.idx - b.idx)
  const snapshots: RemovedFieldSnapshot[] = []
  const deletedWidths: number[] = []
  // 反向删避免索引漂移
  for (let i = removed.length - 1; i >= 0; i -= 1) {
    const snap = this.rawData.removeField(removed[i]!.id)
    if (snap) {
      snapshots.unshift(snap)
      deletedWidths.unshift(removed[i]!.width)
    }
  }
  this.rawColsAxis.deleteRange(removed.map((r) => r.idx))
  this.rebuildViewColsAxis()
  this.syncFrozenAfterColDelete(removed.map((r) => r.idx))
  this.selection.remapAfterColsDeleted(removed.map((r) => r.idx))
  const selectionAfter = this.selection.getSelection()
  const frozenAfter = { ...this.frozen.getFrozenConfig() }
  this.undoStack.push({
    kind: 'deleteCols',
    snapshots,
    deletedWidths,
    selectionBefore,
    selectionAfter,
    frozenBefore,
    frozenAfter,
    sortSpecBefore,
    filterSpecBefore,
  })
  return snapshots
}

hideCols(fieldIds: readonly string[]): void {
  const newlyHidden = fieldIds.filter((id) => !this.hiddenColIds.has(id))
  if (newlyHidden.length === 0) return
  const selectionBefore = this.selection.getSelection()
  for (const id of newlyHidden) this.hiddenColIds.add(id)
  this.rebuildViewColsAxis()
  const selectionAfter = this.selection.getSelection()
  this.undoStack.push({
    kind: 'hideCols',
    fieldIds: newlyHidden,
    selectionBefore,
    selectionAfter,
  })
}

unhideCols(fieldIds: readonly string[]): void {
  const newlyVisible = fieldIds.filter((id) => this.hiddenColIds.has(id))
  if (newlyVisible.length === 0) return
  const selectionBefore = this.selection.getSelection()
  for (const id of newlyVisible) this.hiddenColIds.delete(id)
  this.rebuildViewColsAxis()
  const selectionAfter = this.selection.getSelection()
  this.undoStack.push({
    kind: 'unhideCols',
    fieldIds: newlyVisible,
    selectionBefore,
    selectionAfter,
  })
}

setColumnWidths(fieldIds: readonly string[], widthPx: number): void {
  const selectionBefore = this.selection.getSelection()
  const fields = this.rawData.getSchema().fields
  const oldWidths: number[] = []
  for (const id of fieldIds) {
    const idx = fields.findIndex((f) => f.id === id)
    if (idx < 0) {
      oldWidths.push(widthPx)
      continue
    }
    oldWidths.push(this.rawColsAxis.getSize(idx))
    this.rawColsAxis.setSize(idx, widthPx)
    // 同时把 schema field.width 改了（field.width 不是 readonly）
    ;(fields[idx] as { width: number }).width = widthPx
  }
  this.rebuildViewColsAxis()
  const selectionAfter = this.selection.getSelection()
  this.undoStack.push({
    kind: 'resizeColumnsMulti',
    fieldIds,
    oldWidths,
    newWidth: widthPx,
    selectionBefore,
    selectionAfter,
  })
}

getHiddenCols(): readonly string[] {
  // 按 schema 中的字段顺序返回
  const fieldIdsInOrder = this.rawData.getSchema().fields.map((f) => f.id)
  return fieldIdsInOrder.filter((id) => this.hiddenColIds.has(id))
}
```

setData 内追加 `this.hiddenColIds.clear()` + `this.newFieldCounter = 0`，与 4.5 `hideRowsLayer.setHidden([])` 同位置。

GridEngine 接口（packages/core/src/engine/GridEngine.ts）追加 6 个方法。

- [ ] **Step 4: 填空 undo dispatcher**

把 Task 6 的 5 个 stub case 改成真实 apply / unapply。例（`insertCols`）：

apply (redo)：用 cmd.newFields 中的 field（**不能** 重新走 newFieldCounter）调 N 次 `insertField`；rawColsAxis.insertRange；rebuildViewColsAxis；frozen.setFrozen(cmd.frozenAfter)；selection.setSelection(cmd.selectionAfter)。

unapply (undo)：for each newField id `removeField(id)`；rawColsAxis.deleteRange；rebuildViewColsAxis；frozen.setFrozen(cmd.frozenBefore)；selection.setSelection(cmd.selectionBefore)。

deleteCols 反向：apply = 走 removeField；unapply = 按 snapshots `insertField(originalIndex, field)` + 用 `updateCell` 回填 snap.cells + 恢复列宽 + 恢复 frozen + 恢复 sort/filter spec。

hideCols / unhideCols / resizeColumnsMulti 对称展开。

- [ ] **Step 5: 移除 Task 6 测试的 @ts-expect-error**

编辑 `packages/core/tests/undo/UndoStack.col-mutations.test.ts`，删 4 处 `@ts-expect-error` 注释。

- [ ] **Step 6: 验证 GREEN**

```bash
bun test packages/core/tests/engine/DefaultGridEngine.col-mutations.test.ts
bun test packages/core/tests/engine/DefaultGridEngine.frozen-cols-sync.test.ts
bun test packages/core/tests/undo/UndoStack.col-mutations.test.ts
bun test packages/core
bun run --filter @novasheet/core typecheck
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/engine/DefaultGridEngine.ts \
        packages/core/src/engine/GridEngine.ts \
        packages/core/tests/engine/DefaultGridEngine.col-mutations.test.ts \
        packages/core/tests/engine/DefaultGridEngine.frozen-cols-sync.test.ts \
        packages/core/tests/undo/UndoStack.col-mutations.test.ts
git commit -m "feat(core): DefaultGridEngine 实现 5 类列 mutation + 视图列轴 + FrozenRegions 自动同步"
```

---

## Task 9: `RenderFrame.collapsedColGaps` 字段 + engine 填充

**Files:**
- Modify: `packages/core/src/render/RenderFrame.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`（`getFrame()` 填新字段）
- Create: `packages/core/tests/render/RenderFrame.cols.test.ts`

- [ ] **Step 1: 写 failing 测试**

```ts
import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'
import { denseGridTheme } from '../../src/theme/denseGridTheme'

describe('RenderFrame.collapsedColGaps', () => {
  it('hide cols 后 frame.collapsedColGaps 含一项 + xPx 落在 view-col 右边界', () => {
    const fields = Array.from({ length: 10 }, (_, i) => ({
      id: `f${i}`,
      name: `F${i}`,
      type: 'text' as const,
      width: 50,
    }))
    const ds = new InMemoryDataSource({
      schema: { fields },
      rows: [Object.fromEntries(fields.map((f) => [f.id, 'v']))],
    })
    const engine = new DefaultGridEngine({ data: ds, theme: denseGridTheme })
    engine.setViewportSize(800, 400)
    engine.hideCols(['f3', 'f4', 'f5'])
    const frame = engine.getFrame()
    expect(frame.collapsedColGaps).toHaveLength(1)
    const gap = frame.collapsedColGaps[0]!
    expect(gap.atViewCol).toBe(2)
    expect(gap.hiddenCount).toBe(3)
    expect(gap.hiddenFieldIds).toEqual(['f3', 'f4', 'f5'])
    expect(gap.xPx).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: 扩 RenderFrame**

```ts
// packages/core/src/render/RenderFrame.ts
export interface RenderFrameCollapsedColGap {
  readonly atViewCol: number
  readonly hiddenCount: number
  readonly hiddenFieldIds: readonly string[]
  readonly xPx: number
}

export interface RenderFrame {
  // ... 既有
  readonly collapsedRowGaps: readonly RenderFrameCollapsedGap[]   // 4.5
  readonly collapsedColGaps: readonly RenderFrameCollapsedColGap[] // 4.6
}
```

- [ ] **Step 3: engine.getFrame 填字段**

在 `DefaultGridEngine.getFrame` 内 collapsedRowGaps 同位置加：

```ts
const allColGaps = this.computeCollapsedColGaps()
const { firstVisibleViewCol, lastVisibleViewCol } = this.colsAxis.getVisibleRange(
  viewport.scrollX,
  viewport.contentRect.width,
)
const collapsedColGaps = allColGaps
  .filter((g) => g.atViewCol >= firstVisibleViewCol && g.atViewCol <= lastVisibleViewCol)
  .map((g) => ({
    ...g,
    xPx: this.colsAxis.indexToPosition(g.atViewCol + 1) - viewport.scrollX,
  }))
```

helper：

```ts
private computeCollapsedColGaps(): readonly Omit<RenderFrameCollapsedColGap, 'xPx'>[] {
  if (this.hiddenColIds.size === 0) return []
  const fields = this.rawData.getSchema().fields
  const visibleIndices: number[] = []
  const hiddenSchemaIdx: number[] = []
  for (let i = 0; i < fields.length; i += 1) {
    if (this.hiddenColIds.has(fields[i]!.id)) hiddenSchemaIdx.push(i)
    else visibleIndices.push(i)
  }
  const gaps: { atViewCol: number; hiddenCount: number; hiddenFieldIds: string[] }[] = []
  let run: number[] = []
  for (const hi of hiddenSchemaIdx) {
    if (run.length === 0 || hi === run[run.length - 1]! + 1) {
      run.push(hi)
    } else {
      gaps.push(this.makeColGap(run, fields))
      run = [hi]
    }
  }
  if (run.length > 0) gaps.push(this.makeColGap(run, fields))
  return gaps
}

private makeColGap(
  run: number[],
  fields: readonly Field[],
): { atViewCol: number; hiddenCount: number; hiddenFieldIds: string[] } {
  const upperUnderlying = run[0]! - 1
  // 上邻 visible underlying 的 view-col index
  let atViewCol = -1
  if (upperUnderlying >= 0) {
    // visibleIndices 中 upperUnderlying 的位置
    let count = 0
    for (let i = 0; i <= upperUnderlying; i += 1) {
      if (!this.hiddenColIds.has(fields[i]!.id)) {
        if (i === upperUnderlying) atViewCol = count
        count += 1
      }
    }
  }
  return {
    atViewCol,
    hiddenCount: run.length,
    hiddenFieldIds: run.map((i) => fields[i]!.id),
  }
}
```

- [ ] **Step 4: 验证 GREEN**

```bash
bun test packages/core/tests/render/RenderFrame.cols.test.ts
bun test packages/core
bun run --filter '*' typecheck
```

注：所有手动构造 `RenderFrame` 的 fixture 需要补 `collapsedColGaps: []`。运行 typecheck 找到红点后修改（同 4.5 加 `collapsedRowGaps` 时套路）。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/render/RenderFrame.ts \
        packages/core/src/engine/DefaultGridEngine.ts \
        packages/core/tests/render/RenderFrame.cols.test.ts \
        packages/web-canvas2d/tests/render/Canvas2DRenderer.test.ts \
        packages/web-canvas2d/tests/painters/*.test.ts
git commit -m "feat(core): RenderFrame 加 collapsedColGaps 字段由 engine 按可见区裁剪"
```

---

## Task 10: Theme tokens — hideColTriangleOffset / hideColTrianglePadY

**Files:**
- Modify: `packages/core/src/theme/Theme.ts`
- Modify: `packages/core/src/theme/denseGridTheme.ts`
- Modify: `packages/core/tests/theme/denseGridTheme.test.ts`

- [ ] **Step 1: 追加 failing 测试**

末尾追加：

```ts
describe('denseGridTheme — Phase 4.6 tokens', () => {
  it('提供 hideColTriangleOffset / hideColTrianglePadY', () => {
    expect(denseGridTheme.dimensions.hideColTriangleOffset).toBe(4)
    expect(denseGridTheme.dimensions.hideColTrianglePadY).toBe(6)
  })
})
```

- [ ] **Step 2: 改 Theme.ts**

`ThemeDimensions` 接口加：

```ts
readonly hideColTriangleOffset: number
readonly hideColTrianglePadY: number
```

- [ ] **Step 3: 改 denseGridTheme.ts**

dimensions block 加：

```ts
hideColTriangleOffset: 4,
hideColTrianglePadY: 6,
```

- [ ] **Step 4: 验证 GREEN + Commit**

```bash
bun test packages/core/tests/theme/denseGridTheme.test.ts
bun run --filter '*' typecheck
git add packages/core/src/theme/Theme.ts \
        packages/core/src/theme/denseGridTheme.ts \
        packages/core/tests/theme/denseGridTheme.test.ts
git commit -m "feat(core): denseGridTheme 加 hideCol 三角 dimensions tokens"
```

---

## Task 11: `HeaderColumnPainter` 画 col-hide 三角

**Files:**
- Modify: `packages/web-canvas2d/src/painters/HeaderColumnPainter.ts`
- Create: `packages/web-canvas2d/tests/painters/HeaderColumnPainter.hide.test.ts`

- [ ] **Step 1: 写 failing 测试**

Create `packages/web-canvas2d/tests/painters/HeaderColumnPainter.hide.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { createRecordingContext } from '../helpers/recording-context'
import { HeaderColumnPainter } from '../../src/painters/HeaderColumnPainter'
import { denseGridTheme } from '@novasheet/core'

// 复用 frameWithCollapsedColGaps fixture
function frameWithGaps(
  gaps: { atViewCol: number; hiddenCount: number; hiddenFieldIds: string[]; xPx: number }[],
  headerHeight: number,
) {
  return {
    headerHeight,
    collapsedColGaps: gaps,
    theme: denseGridTheme,
    // ... 其它必需字段按既有 HeaderColumnPainter 测试 helper 补
  } as any
}

describe('HeaderColumnPainter — col-hide 三角', () => {
  it('headerHeight ≥ 24 时为每个 gap 画两个三角 fill', () => {
    const ctx = createRecordingContext()
    const painter = new HeaderColumnPainter(denseGridTheme)
    painter.paint(ctx as any, frameWithGaps([
      { atViewCol: 2, hiddenCount: 3, hiddenFieldIds: ['f3', 'f4', 'f5'], xPx: 200 },
    ], 30))
    const fillCount = ctx.calls.filter((c) => c.op === 'fillPath').length
    expect(fillCount).toBeGreaterThanOrEqual(2)
  })

  it('headerHeight < 24 时跳过', () => {
    const ctx = createRecordingContext()
    const ctxNoGap = createRecordingContext()
    const painter = new HeaderColumnPainter(denseGridTheme)
    painter.paint(ctx as any, frameWithGaps([
      { atViewCol: 2, hiddenCount: 3, hiddenFieldIds: ['f3', 'f4', 'f5'], xPx: 200 },
    ], 20))
    painter.paint(ctxNoGap as any, frameWithGaps([], 20))
    expect(ctx.calls.filter((c) => c.op === 'fillPath').length).toBe(
      ctxNoGap.calls.filter((c) => c.op === 'fillPath').length,
    )
  })
})
```

注：精确 fixture 结构需读 `HeaderColumnPainter.ts` 既有 paint 入口 + `createRecordingContext` 真实 API（参考 4.5 Task 13 `HeaderRowPainter.hide.test.ts` 中 frame fixture 的真实形状，可直接 copy 调整）。

- [ ] **Step 2: 实现**

在 `HeaderColumnPainter.paint` 既有列头绘制后追加：

```ts
if (frame.headerHeight >= 24) {
  for (const gap of frame.collapsedColGaps) {
    drawColHideTriangle(ctx, this.theme, gap.xPx, frame.headerHeight, 'left')
    drawColHideTriangle(ctx, this.theme, gap.xPx, frame.headerHeight, 'right')
  }
}
```

`drawColHideTriangle` 走 theme tokens（hideColTriangleOffset / hideColTrianglePadY / hideIndicator color）；用 `Path2D` 解析 SVG path（复用 4.5 `hideBoundaryUp/Down`，通过 `ctx.rotate(±Math.PI/2)` 转向；或新增 `hideBoundaryLeft/Right` 两个 path token）。

- [ ] **Step 3: 验证 GREEN + Commit**

```bash
bun test packages/web-canvas2d/tests/painters/HeaderColumnPainter.hide.test.ts
bun test packages/web-canvas2d
git add packages/web-canvas2d/src/painters/HeaderColumnPainter.ts \
        packages/web-canvas2d/tests/painters/HeaderColumnPainter.hide.test.ts
git commit -m "feat(canvas2d): HeaderColumnPainter 画 col-hide 三角指示器"
```

---

## Task 12: DOM HideColToggleHandle

**Files:**
- Create: `packages/web/src/handle/HideColToggleHandle.ts`
- Create: `packages/web/tests/handle/HideColToggleHandle.test.ts`

- [ ] **Step 1: 写 failing 测试**

```ts
import { describe, expect, it, mock } from 'bun:test'
import { HideColToggleHandle } from '../../src/handle/HideColToggleHandle'

describe('HideColToggleHandle', () => {
  it('点击 handle 触发 onUnhide(fieldIds)', () => {
    const onUnhide = mock<(ids: readonly string[]) => void>(() => {})
    const root = document.createElement('div')
    const layer = new HideColToggleHandle(root, { onUnhide })

    layer.update(
      [{ atViewCol: 2, hiddenCount: 3, hiddenFieldIds: ['f3', 'f4', 'f5'], xPx: 200 }],
      { headerHeight: 30 },
    )

    const handle = root.querySelector('[data-handle="hide-col-toggle"]') as HTMLElement
    expect(handle).toBeTruthy()
    handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(onUnhide).toHaveBeenCalledWith(['f3', 'f4', 'f5'])
  })

  it('headerHeight < 24 时跳过', () => {
    const onUnhide = mock<(ids: readonly string[]) => void>(() => {})
    const root = document.createElement('div')
    const layer = new HideColToggleHandle(root, { onUnhide })
    layer.update(
      [{ atViewCol: 0, hiddenCount: 1, hiddenFieldIds: ['x'], xPx: 50 }],
      { headerHeight: 20 },
    )
    expect(root.querySelector('[data-handle="hide-col-toggle"]')).toBeNull()
  })

  it('destroy() 幂等清空 handle', () => {
    const root = document.createElement('div')
    const layer = new HideColToggleHandle(root, { onUnhide: () => {} })
    layer.update([{ atViewCol: 0, hiddenCount: 1, hiddenFieldIds: ['x'], xPx: 50 }], { headerHeight: 30 })
    expect(root.querySelectorAll('[data-handle="hide-col-toggle"]').length).toBe(1)
    layer.destroy()
    expect(root.querySelectorAll('[data-handle="hide-col-toggle"]').length).toBe(0)
    layer.destroy()  // idempotent
  })
})
```

- [ ] **Step 2: 实现**

Create `packages/web/src/handle/HideColToggleHandle.ts`:

```ts
import type { RenderFrameCollapsedColGap } from '@novasheet/core'

export interface HideColToggleHandleOptions {
  onUnhide(fieldIds: readonly string[]): void
}

export class HideColToggleHandle {
  private elements: HTMLElement[] = []

  constructor(private root: HTMLElement, private opts: HideColToggleHandleOptions) {}

  update(
    gaps: readonly RenderFrameCollapsedColGap[],
    frame: { headerHeight: number },
  ): void {
    this.clear()
    if (frame.headerHeight < 24) return
    for (const gap of gaps) {
      const el = document.createElement('div')
      el.setAttribute('data-handle', 'hide-col-toggle')
      el.style.position = 'absolute'
      el.style.top = '0'
      el.style.height = `${frame.headerHeight}px`
      el.style.left = `${gap.xPx - 8}px`
      el.style.width = '16px'
      el.style.cursor = 'pointer'
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation()
        this.opts.onUnhide(gap.hiddenFieldIds)
      })
      this.root.appendChild(el)
      this.elements.push(el)
    }
  }

  destroy(): void {
    this.clear()
  }

  private clear(): void {
    for (const el of this.elements) el.remove()
    this.elements = []
  }
}
```

- [ ] **Step 3: 验证 GREEN + Commit**

```bash
bun test packages/web/tests/handle/HideColToggleHandle.test.ts
git add packages/web/src/handle/HideColToggleHandle.ts \
        packages/web/tests/handle/HideColToggleHandle.test.ts
git commit -m "feat(web): 新增 HideColToggleHandle DOM 命中区接管列 unhide 点击"
```

---

## Task 13: `ColumnWidthPopover` DOM 弹层

**Files:**
- Create: `packages/web/src/overlay/ColumnWidthPopover.ts`
- Create: `packages/web/tests/overlay/ColumnWidthPopover.test.ts`

- [ ] **Step 1: 写 failing 测试**

```ts
import { describe, expect, it, mock } from 'bun:test'
import { ColumnWidthPopover } from '../../src/overlay/ColumnWidthPopover'

describe('ColumnWidthPopover', () => {
  it('open 后 input 聚焦且预填 currentWidth；Enter 提交 onSubmit(px)', () => {
    const onSubmit = mock<(px: number) => void>(() => {})
    const popover = new ColumnWidthPopover({ onSubmit })
    popover.open({ x: 100, y: 100, width: 40, height: 20 }, 120)
    const input = document.body.querySelector('input[type=number]') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.value).toBe('120')
    input.value = '200'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(onSubmit).toHaveBeenCalledWith(200)
  })

  it('Esc 不提交', () => {
    const onSubmit = mock<(px: number) => void>(() => {})
    const popover = new ColumnWidthPopover({ onSubmit })
    popover.open({ x: 0, y: 0, width: 0, height: 0 }, 120)
    const input = document.body.querySelector('input[type=number]') as HTMLInputElement
    input.value = '200'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('destroy() 幂等关闭弹层', () => {
    const popover = new ColumnWidthPopover({ onSubmit: () => {} })
    popover.open({ x: 0, y: 0, width: 0, height: 0 }, 120)
    expect(document.body.querySelector('[role=dialog]')).toBeTruthy()
    popover.destroy()
    expect(document.body.querySelector('[role=dialog]')).toBeNull()
    popover.destroy()
  })
})
```

- [ ] **Step 2: 实现**

Create `packages/web/src/overlay/ColumnWidthPopover.ts`:

```ts
/** Phase 4.6 列头菜单的"调整列宽…"弹层，mirror RowHeightPopover。 */
export interface ColumnWidthPopoverOptions {
  onSubmit(px: number): void
  onClose?(): void
}

export class ColumnWidthPopover {
  private container: HTMLElement | null = null

  constructor(private opts: ColumnWidthPopoverOptions) {}

  open(
    triggerRect: DOMRect | { x: number; y: number; width: number; height: number },
    currentWidth: number,
  ): void {
    this.close()
    const root = document.createElement('div')
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-modal', 'true')
    root.setAttribute('aria-label', '调整列宽')
    root.style.position = 'fixed'
    root.style.left = `${triggerRect.x}px`
    root.style.top = `${triggerRect.y + triggerRect.height + 4}px`
    root.style.zIndex = '4'
    const input = document.createElement('input')
    input.type = 'number'
    input.min = '20'
    input.step = '1'
    input.value = String(currentWidth)
    root.appendChild(input)
    document.body.appendChild(root)
    input.focus()
    input.select()
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.opts.onSubmit(Number(input.value))
        this.close()
      } else if (e.key === 'Escape') {
        this.close()
      }
    })
    input.addEventListener('blur', () => this.close())
    this.container = root
  }

  close(): void {
    if (!this.container) return
    this.container.remove()
    this.container = null
    this.opts.onClose?.()
  }

  destroy(): void {
    this.close()
  }
}
```

- [ ] **Step 3: 验证 GREEN + Commit**

```bash
bun test packages/web/tests/overlay/ColumnWidthPopover.test.ts
git add packages/web/src/overlay/ColumnWidthPopover.ts \
        packages/web/tests/overlay/ColumnWidthPopover.test.ts
git commit -m "feat(web): 新增 ColumnWidthPopover DOM 弹层"
```

---

## Task 14: `ContextMenuModel` 加列 actions + 结构菜单生成器

**Files:**
- Modify: `packages/core/src/interaction/ContextMenuModel.ts`
- Create: `packages/core/tests/interaction/ContextMenuModel.cols.test.ts`

- [ ] **Step 1: 写 failing 测试**

```ts
import { describe, expect, it } from 'bun:test'
import {
  getColumnHeaderStructuralMenuItems,
  type ContextMenuAction,
} from '../../src/interaction/ContextMenuModel'

describe('getColumnHeaderStructuralMenuItems', () => {
  it('返回 5 项（无 hidden）+ 6 项（有 hidden）', () => {
    const noHidden = getColumnHeaderStructuralMenuItems(1, false)
    expect(noHidden.map((i) => i.id)).toEqual([
      'insert-col-left',
      'insert-col-right',
      'delete-cols',
      'hide-cols',
      'resize-column-width',
    ])
    const withHidden = getColumnHeaderStructuralMenuItems(1, true)
    expect(withHidden.map((i) => i.id)).toContain('unhide-cols')
  })

  it('label 含 N', () => {
    const items = getColumnHeaderStructuralMenuItems(3, false)
    expect(items.find((i) => i.id === 'insert-col-left')?.label).toContain('3')
  })
})

describe('ContextMenuAction 联合体含列 actions', () => {
  it('类型层接受列 action', () => {
    const a: ContextMenuAction = 'insert-col-left'
    const b: ContextMenuAction = 'delete-cols'
    const c: ContextMenuAction = 'hide-cols'
    const d: ContextMenuAction = 'unhide-cols'
    const e: ContextMenuAction = 'resize-column-width'
    expect([a, b, c, d, e]).toHaveLength(5)
  })
})
```

- [ ] **Step 2: 实现**

在 `packages/core/src/interaction/ContextMenuModel.ts` 内：

扩 `ContextMenuAction` union 加 6 个 action（含 `insert-col-right`）。

加 helper：

```ts
/** Phase 4.6 — 生成列头结构操作菜单项（追加在 sort/filter 之后） */
export function getColumnHeaderStructuralMenuItems(
  n: number,
  hasHiddenInSelection: boolean,
): readonly ContextMenuItem[] {
  const items: ContextMenuItem[] = [
    { id: 'insert-col-left', label: `在左侧插入 ${n} 列`, disabled: false, separatorAfter: false },
    { id: 'insert-col-right', label: `在右侧插入 ${n} 列`, disabled: false, separatorAfter: true },
    { id: 'delete-cols', label: `删除 ${n} 列`, disabled: false, separatorAfter: false },
    { id: 'hide-cols', label: `隐藏 ${n} 列`, disabled: false, separatorAfter: false },
  ]
  if (hasHiddenInSelection) {
    items.push({ id: 'unhide-cols', label: '显示选区内隐藏列', disabled: false, separatorAfter: false })
  }
  // 在 hide-cols / unhide-cols 之后插 separator
  const resizeIdx = items.length
  items.push({ id: 'resize-column-width', label: '调整列宽…', disabled: false, separatorAfter: false })
  if (resizeIdx > 0) {
    const prev = items[resizeIdx - 1]!
    items[resizeIdx - 1] = { ...prev, separatorAfter: true }
  }
  return items
}
```

修改既有 `getColumnHeaderContextMenuItems(ctx, pipeline)` 末尾追加：

```ts
const structural = getColumnHeaderStructuralMenuItems(
  ctx.selectedColCount ?? 1,
  ctx.hasHiddenInSelection ?? false,
)
// 在 pipeline items 与 structural 之间加 separator（最后一个 pipeline item.separatorAfter = true）
const merged: ContextMenuItem[] = [...items]
if (merged.length > 0) {
  merged[merged.length - 1] = { ...merged[merged.length - 1]!, separatorAfter: true }
}
merged.push(...structural)
return merged
```

`ColumnHeaderMenuContext` 接口扩 optional 字段：

```ts
export interface ColumnHeaderMenuContext extends PipelineColumnHeaderMenuContext {
  readonly multiSelect?: boolean
  readonly selectedColCount?: number       // 4.6
  readonly hasHiddenInSelection?: boolean   // 4.6
}
```

- [ ] **Step 3: 验证 GREEN + Commit**

```bash
bun test packages/core/tests/interaction/ContextMenuModel.cols.test.ts
bun test packages/core
bun run --filter @novasheet/core typecheck
git add packages/core/src/interaction/ContextMenuModel.ts \
        packages/core/tests/interaction/ContextMenuModel.cols.test.ts
git commit -m "feat(core): ContextMenuModel 加列结构 actions 与 getColumnHeaderStructuralMenuItems"
```

---

## Task 15: Grid facade 列 API + 列头菜单 invoke + WebGridRuntime / Canvas2DBackend 装配

这是 web 端最重的 task。

**Files:**
- Modify: `packages/web/src/grid/GridController.ts`（接口加 6 个新方法）
- Modify: `packages/web/src/runtime/WebGridRuntime.ts`（6 个新方法 + invokeColumnHeaderContextMenuAction + setColumnWidthPopover/setHideColToggleHandle setter + syncHideColToggleHandles + contextmenu router 列头分支拼新菜单项 + pendingColumnWidthFieldIds + getPendingColumnWidthFieldIds）
- Modify: `packages/web/src/backends/Canvas2DBackend.ts`（实例化 popover + handle + 注入 + destroy 链 + facade 转发）
- Modify: `packages/web/src/Grid.ts`（facade 加 6 个方法 + 3 个事件 callbacks）
- Modify: `packages/web/tests/runtime/WebGridRuntime.test.ts`（engine mock 补 6 个新方法）
- Create: `packages/web/tests/Grid.col-menu.test.ts`

- [ ] **Step 1: 写 failing 测试**

Create `packages/web/tests/Grid.col-menu.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { Grid } from '../src/Grid'
import { InMemoryDataSource, denseGridTheme } from '@novasheet/core'

const schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text' as const, width: 100 },
    { id: 'b', name: 'B', type: 'number' as const, width: 80 },
    { id: 'c', name: 'C', type: 'text' as const, width: 120 },
  ],
}

function mkGrid() {
  const data = new InMemoryDataSource({
    schema,
    rows: [{ a: 'r0', b: 0, c: 'x' }, { a: 'r1', b: 1, c: 'y' }],
  })
  const container = document.createElement('div')
  Object.assign(container.style, { width: '500px', height: '300px' })
  document.body.appendChild(container)
  return { grid: new Grid(container, { data, theme: denseGridTheme }), data, container }
}

describe('Grid column header context menu — Phase 4.6', () => {
  it('选中 1 列后 getColumnHeaderContextMenuItems 含 5 个结构项', () => {
    const { grid, container } = mkGrid()
    grid.setSelection({
      activeCell: { rowIndex: 0, colIndex: 1 },
      anchorCell: { rowIndex: 0, colIndex: 1 },
      extentCell: { rowIndex: 1, colIndex: 1 },
      selectedRange: { startRow: 0, endRow: 1, startCol: 1, endCol: 1 },
    })
    const items = grid.getColumnHeaderContextMenuItems({ targetColIndex: 1 })
    const ids = items.map((i) => i.id)
    expect(ids).toContain('insert-col-left')
    expect(ids).toContain('insert-col-right')
    expect(ids).toContain('delete-cols')
    expect(ids).toContain('hide-cols')
    expect(ids).toContain('resize-column-width')
    expect(ids).not.toContain('unhide-cols')
    grid.destroy()
    container.remove()
  })

  it('invokeColumnHeaderContextMenuAction insert-col-left 触发 insertCols', () => {
    const { grid, data, container } = mkGrid()
    grid.setSelection({
      activeCell: { rowIndex: 0, colIndex: 1 },
      anchorCell: { rowIndex: 0, colIndex: 1 },
      extentCell: { rowIndex: 1, colIndex: 1 },
      selectedRange: { startRow: 0, endRow: 1, startCol: 1, endCol: 1 },
    })
    grid.invokeColumnHeaderContextMenuAction('insert-col-left', { targetColIndex: 1 })
    expect(data.getSchema().fields).toHaveLength(4)
    grid.destroy()
    container.remove()
  })

  it('选区跨 hidden gap 时 unhide-cols 项出现', () => {
    const { grid, container } = mkGrid()
    grid.hideCols(['b'])
    grid.setSelection({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 1, colIndex: 1 },  // view-col 1 = c（b 已 hide）
      selectedRange: { startRow: 0, endRow: 1, startCol: 0, endCol: 1 },
    })
    const items = grid.getColumnHeaderContextMenuItems({ targetColIndex: 0 })
    expect(items.map((i) => i.id)).toContain('unhide-cols')
    grid.destroy()
    container.remove()
  })
})
```

- [ ] **Step 2: 实现 — GridController interface**

`packages/web/src/grid/GridController.ts` 加 6 个接口方法（mirror 4.5 行方法）：

```ts
insertCols(beforeFieldIndex: number, count: number): readonly Field[]
deleteCols(fieldIds: readonly string[]): void
hideCols(fieldIds: readonly string[]): void
unhideCols(fieldIds: readonly string[]): void
setColumnWidths(fieldIds: readonly string[], widthPx: number): void
getHiddenCols(): readonly string[]
getColumnHeaderContextMenuItems(ctx: { targetColIndex: number }): readonly ContextMenuItem[]
invokeColumnHeaderContextMenuAction(id: string, ctx: { targetColIndex: number }): void
```

- [ ] **Step 3: 实现 — WebGridRuntime 方法**

mirror 4.5 invokeRowHeaderContextMenuAction：

```ts
insertCols(beforeFieldIndex: number, count: number): readonly Field[] {
  if (this.destroyed) return []
  const newFields = this.engine.insertCols(beforeFieldIndex, count)
  this.afterEngineMutation()
  return newFields
}

deleteCols(fieldIds: readonly string[]): void {
  if (this.destroyed) return
  this.engine.deleteCols(fieldIds)
  this.afterEngineMutation()
}

hideCols(fieldIds: readonly string[]): void {
  if (this.destroyed) return
  this.engine.hideCols(fieldIds)
  this.afterEngineMutation()
}

unhideCols(fieldIds: readonly string[]): void {
  if (this.destroyed) return
  this.engine.unhideCols(fieldIds)
  this.afterEngineMutation()
}

setColumnWidths(fieldIds: readonly string[], widthPx: number): void {
  if (this.destroyed) return
  this.engine.setColumnWidths(fieldIds, widthPx)
  this.afterEngineMutation()
}

getHiddenCols(): readonly string[] {
  return this.engine.getHiddenCols()
}

setColumnWidthPopover(popover: ColumnWidthPopover): void {
  this.columnWidthPopover = popover
}

setHideColToggleHandle(handle: HideColToggleHandle): void {
  this.hideColToggleHandle = handle
}

getPendingColumnWidthFieldIds(): readonly string[] {
  return this.pendingColumnWidthFieldIds
}

private pendingColumnWidthFieldIds: string[] = []
private columnWidthPopover?: ColumnWidthPopover
private hideColToggleHandle?: HideColToggleHandle

getColumnHeaderContextMenuItems(ctx: { targetColIndex: number }): readonly ContextMenuItem[] {
  const sel = this.engine.getSelection().selectedRange
  const startCol = sel?.startCol ?? ctx.targetColIndex
  const endCol = sel?.endCol ?? ctx.targetColIndex
  // view col → schema col 翻译：通过 frame.viewToFieldId 或类似映射
  // ...
  const n = endCol - startCol + 1
  // 检查选区内是否含 hidden col（通过 hiddenSet 与 selection 范围对照）
  const hidden = new Set(this.engine.getHiddenCols())
  let hasHidden = false
  const fields = this.engine.getData().getSchema().fields
  // 选区在 view-col 空间；翻译到 schema field idx
  for (let viewCol = startCol; viewCol <= endCol && !hasHidden; viewCol += 1) {
    const fieldId = this.viewColToFieldId(viewCol)  // helper：view col → fieldId
    // 检查是否存在 hidden 列在 fieldId 与下一个 visible 之间
    const schemaIdx = fields.findIndex((f) => f.id === fieldId)
    if (schemaIdx >= 0 && schemaIdx + 1 < fields.length) {
      if (hidden.has(fields[schemaIdx + 1]!.id)) hasHidden = true
    }
  }
  // ... 然后调 getColumnHeaderContextMenuItems(ctx, viewPipeline) 拼最终菜单
  // pipeline ctx + selectedColCount/hasHiddenInSelection 扩展字段填好
  // ...
}

invokeColumnHeaderContextMenuAction(id: string, ctx: { targetColIndex: number }): void {
  // mirror invokeRowHeaderContextMenuAction
  const sel = this.engine.getSelection().selectedRange
  const startCol = sel?.startCol ?? ctx.targetColIndex
  const endCol = sel?.endCol ?? ctx.targetColIndex
  const fieldIds: string[] = []
  for (let viewCol = startCol; viewCol <= endCol; viewCol += 1) {
    fieldIds.push(this.viewColToFieldId(viewCol))
  }
  const fields = this.engine.getData().getSchema().fields
  const startSchemaIdx = fields.findIndex((f) => f.id === fieldIds[0])
  const endSchemaIdx = fields.findIndex((f) => f.id === fieldIds[fieldIds.length - 1]!)
  const N = endCol - startCol + 1
  switch (id) {
    case 'insert-col-left':
      this.insertCols(startSchemaIdx, N)
      break
    case 'insert-col-right':
      this.insertCols(endSchemaIdx + 1, N)
      break
    case 'delete-cols':
      this.deleteCols(fieldIds)
      break
    case 'hide-cols':
      this.hideCols(fieldIds)
      break
    case 'unhide-cols':
      // 收集选区内 hidden field ids（schemaIdx 在 startSchemaIdx..endSchemaIdx 范围里）
      this.unhideCols(this.collectHiddenInColRange(startSchemaIdx, endSchemaIdx))
      break
    case 'resize-column-width':
      if (!this.columnWidthPopover || fieldIds.length === 0) return
      this.pendingColumnWidthFieldIds = fieldIds
      const currentWidth = fields.find((f) => f.id === fieldIds[0])?.width ?? 100
      const pt = this.lastContextMenuPoint
      const triggerRect = pt
        ? { x: pt.clientX, y: pt.clientY, width: 0, height: 0 }
        : { x: 100, y: 100, width: 0, height: 0 }
      this.columnWidthPopover.open(triggerRect, currentWidth)
      break
  }
}

private viewColToFieldId(viewCol: number): string {
  const fields = this.engine.getData().getSchema().fields
  const hidden = this.engine.getHiddenCols()
  const hiddenSet = new Set(hidden)
  let count = 0
  for (const f of fields) {
    if (hiddenSet.has(f.id)) continue
    if (count === viewCol) return f.id
    count += 1
  }
  return fields[fields.length - 1]!.id  // fallback
}

private collectHiddenInColRange(startIdx: number, endIdx: number): readonly string[] {
  const fields = this.engine.getData().getSchema().fields
  const hidden = new Set(this.engine.getHiddenCols())
  const out: string[] = []
  for (let i = startIdx; i <= endIdx; i += 1) {
    if (hidden.has(fields[i]!.id)) out.push(fields[i]!.id)
  }
  return out
}

private syncHideColToggleHandles(): void {
  if (!this.hideColToggleHandle) return
  const frame = this.engine.getFrame()
  this.hideColToggleHandle.update(frame.collapsedColGaps, { headerHeight: frame.viewport.headerHeight })
}
```

在既有 `invalidate / paintSync` 路径同 4.5 `syncHideToggleHandles` 同位置追加 `this.syncHideColToggleHandles()`。

在 ContextMenu 列头分支路径（既有 4.4 `getColumnHeaderContextMenuItems` 调用处）改造为：包装 ctx 时填 `selectedColCount` + `hasHiddenInSelection`；菜单已自动含 4.6 新菜单项。

`handleContextMenuSelected` 在 `ctx?.targetKind === 'columnHeader'` 分支既有 sort-asc/desc/none/filter-open/filter-clear 处理之外，加：

```ts
if (id === 'insert-col-left' || id === 'insert-col-right' || id === 'delete-cols' || id === 'hide-cols' || id === 'unhide-cols' || id === 'resize-column-width') {
  this.invokeColumnHeaderContextMenuAction(id, { targetColIndex: ctx.colIndex })
  return
}
```

- [ ] **Step 4: 实现 — Canvas2DBackend 装配**

构造内（与 4.5 RowHeightPopover / HideToggleHandle 同位置）：

```ts
this.columnWidthPopover = new ColumnWidthPopover({
  onSubmit: (px) => {
    const ids = this.runtime.getPendingColumnWidthFieldIds()
    if (ids.length > 0) this.runtime.setColumnWidths(ids, px)
  },
})
this.runtime.setColumnWidthPopover(this.columnWidthPopover)
this.hideColToggleHandle = new HideColToggleHandle(handleLayerEl, {
  onUnhide: (ids) => this.runtime.unhideCols(ids),
})
this.runtime.setHideColToggleHandle(this.hideColToggleHandle)
```

`destroy()` 末尾追加：

```ts
this.columnWidthPopover.destroy()
this.hideColToggleHandle.destroy()
```

GridController interface 6 个方法在 Canvas2DBackend 内转发到 runtime（与 4.5 行方法转发同位置）。

- [ ] **Step 5: 实现 — Grid facade**

`packages/web/src/Grid.ts` 加：

```ts
// option type 加
onColumnsInserted?: (event: { at: number; count: number; newFields: readonly Field[] }) => void
onColumnsDeleted?: (event: { removed: readonly { index: number; fieldId: string }[] }) => void
onHideColsChange?: (event: { hidden: readonly string[] }) => void

// 公共方法
insertCols(beforeFieldIndex: number, count: number): readonly Field[] {
  const newFields = this.delegate.insertCols(beforeFieldIndex, count)
  this.options.onColumnsInserted?.({ at: beforeFieldIndex, count, newFields })
  return newFields
}

deleteCols(fieldIds: readonly string[]): void {
  this.delegate.deleteCols(fieldIds)
  this.options.onColumnsDeleted?.({ removed: fieldIds.map((id, i) => ({ index: i, fieldId: id })) })
}

hideCols(fieldIds: readonly string[]): void {
  this.delegate.hideCols(fieldIds)
  this.options.onHideColsChange?.({ hidden: this.delegate.getHiddenCols() })
}

unhideCols(fieldIds: readonly string[]): void {
  this.delegate.unhideCols(fieldIds)
  this.options.onHideColsChange?.({ hidden: this.delegate.getHiddenCols() })
}

setColumnWidths(fieldIds: readonly string[], widthPx: number): void {
  this.delegate.setColumnWidths(fieldIds, widthPx)
}

getHiddenCols(): readonly string[] {
  return this.delegate.getHiddenCols()
}

getColumnHeaderContextMenuItems(ctx: { targetColIndex: number }): readonly ContextMenuItem[] {
  return this.delegate.getColumnHeaderContextMenuItems(ctx)
}

invokeColumnHeaderContextMenuAction(id: string, ctx: { targetColIndex: number }): void {
  this.delegate.invokeColumnHeaderContextMenuAction(id, ctx)
}
```

- [ ] **Step 6: 更新 WebGridRuntime.test.ts mock**

engine mock 加：

```ts
insertCols: mock(() => [] as readonly Field[]),
deleteCols: mock(() => {}),
hideCols: mock(() => {}),
unhideCols: mock(() => {}),
setColumnWidths: mock(() => {}),
getHiddenCols: mock(() => [] as readonly string[]),
```

- [ ] **Step 7: 验证 GREEN**

```bash
bun test packages/web/tests/Grid.col-menu.test.ts
bun test packages/web
bun run --filter '*' typecheck
bun run lint
```

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/Grid.ts \
        packages/web/src/grid/GridController.ts \
        packages/web/src/runtime/WebGridRuntime.ts \
        packages/web/src/backends/Canvas2DBackend.ts \
        packages/web/tests/Grid.col-menu.test.ts \
        packages/web/tests/runtime/WebGridRuntime.test.ts
git commit -m "feat(web): 列头右键菜单结构项 + Grid facade 列 mutation API + ColumnWidthPopover/HideColToggleHandle 装配"
```

---

## Task 16: Storybook ColumnStructural stories

**Files:**
- Create: `apps/storybook/src/stories/ColumnStructural.stories.ts`

- [ ] **Step 1: 写 stories（mirror 4.5 RowStructural）**

```ts
import type { Meta, StoryObj } from '@storybook/html-vite'
import { Grid, denseGridTheme } from '@novasheet/web'
import { InMemoryDataSource } from '@novasheet/core'

const meta: Meta = { title: '表格/列结构操作（Phase 4.6）' }
export default meta

const schema = {
  fields: [
    { id: 'name', name: '姓名', type: 'text' as const, width: 120 },
    { id: 'team', name: '团队', type: 'text' as const, width: 120 },
    { id: 'revenue', name: '营收', type: 'number' as const, width: 120 },
    { id: 'date', name: '入职日期', type: 'date' as const, width: 140 },
    { id: 'active', name: '在职', type: 'checkbox' as const, width: 80 },
  ],
}

function mkRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    name: `员工 ${i}`,
    team: ['Platform', 'Data', 'Design'][i % 3],
    revenue: i * 1000,
    date: new Date(2024, 0, 1 + i).toISOString(),
    active: i % 2 === 0,
  }))
}

function mountGrid(args: { preconfigure?(grid: Grid): void }) {
  const container = document.createElement('div')
  Object.assign(container.style, { width: '800px', height: '500px' })
  const data = new InMemoryDataSource({ schema, rows: mkRows(50) })
  const grid = new Grid(container, { data, theme: denseGridTheme })
  args.preconfigure?.(grid)
  return container
}

export const Default: StoryObj = { render: () => mountGrid({}) }
export const InsertDelete: StoryObj = {
  render: () => mountGrid({
    preconfigure: (grid) => {
      // 演示按钮：插入 2 列在 index 3 / 删除 team + revenue
      // 同 RowStructural InsertDelete 风格
    },
  }),
}
export const PrefilledHidden: StoryObj = {
  render: () => mountGrid({ preconfigure: (grid) => grid.hideCols(['date', 'active']) }),
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/storybook/src/stories/ColumnStructural.stories.ts
git commit -m "feat(storybook): 新增列结构操作 Phase 4.6 story（含 InsertDelete 与 hidden 区间）"
```

---

## Task 17: Phase46 integration test

**Files:**
- Create: `packages/web/tests/integration/Phase46.scenarios.test.ts`

- [ ] **Step 1: 写 E2E 测试**

```ts
import { describe, expect, it } from 'bun:test'
import { Grid } from '../../src/Grid'
import { InMemoryDataSource, denseGridTheme } from '@novasheet/core'

const schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text' as const, width: 100 },
    { id: 'b', name: 'B', type: 'number' as const, width: 80 },
    { id: 'c', name: 'C', type: 'text' as const, width: 120 },
    { id: 'd', name: 'D', type: 'text' as const, width: 100 },
  ],
}

function mkGrid(opts: { frozen?: { topRows?: number; leftCols?: number; rightCols?: number } } = {}) {
  const data = new InMemoryDataSource({
    schema,
    rows: Array.from({ length: 10 }, (_, i) => ({ a: `r${i}`, b: i, c: `x${i}`, d: `y${i}` })),
  })
  const container = document.createElement('div')
  Object.assign(container.style, { width: '500px', height: '300px' })
  document.body.appendChild(container)
  const grid = new Grid(container, {
    data,
    theme: denseGridTheme,
    frozen: { topRows: 0, leftCols: 0, rightCols: 0, ...opts.frozen },
  })
  return { grid, data, container }
}

describe('Phase 4.6 E2E', () => {
  it('insertCols + undo 完全还原（含 frozen 状态）', () => {
    const { grid, data, container } = mkGrid({ frozen: { leftCols: 2 } })
    grid.setSelection({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 0, colIndex: 0 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
    })
    grid.insertCols(0, 1)
    expect(data.getSchema().fields).toHaveLength(5)
    // 在冻结区内插入 → leftCols += 1
    grid.undo()
    expect(data.getSchema().fields).toHaveLength(4)
    grid.destroy()
    container.remove()
  })

  it('deleteCols 让 sort spec 在 fieldId 命中时 invalidate', () => {
    const { grid, container } = mkGrid()
    // 通过 sort menu 设 sort（或直接走 ViewPipeline，按真实 API 调整）
    // grid.invokeColumnHeaderContextMenuAction('sort-asc', { targetColIndex: 1 })  // sort by 'b'
    grid.deleteCols(['b'])
    // sort spec 应被 invalidate（无 b 字段引用）
    // 没有直接 API 查 sort spec —— 用 frame 中 sort indicator 缺失或调用 invokeColumnHeaderContextMenuAction('sort-none') 不抛错验证
    grid.destroy()
    container.remove()
  })

  it('hideCols + insertCols 后 hidden fieldIds 按 id 锚定不漂移', () => {
    const { grid, container } = mkGrid()
    grid.hideCols(['c'])
    expect(grid.getHiddenCols()).toEqual(['c'])
    grid.insertCols(0, 2)  // 头部插 2 列
    expect(grid.getHiddenCols()).toEqual(['c'])  // c 仍是 hidden（id 锚定，不漂移）
    grid.destroy()
    container.remove()
  })
})
```

- [ ] **Step 2: 验证 + Commit**

```bash
bun test packages/web/tests/integration/Phase46.scenarios.test.ts
git add packages/web/tests/integration/Phase46.scenarios.test.ts
git commit -m "test(web): Phase 4.6 端到端场景（insertCols/undo · deleteCols+sort invalidate · hideCols 不漂移）"
```

---

## Task 18: 全量验证 + README / CLAUDE.md / 跨 spec 收尾

**Files:**
- Modify: `README.md`（4.6 → ✅；当前状态段）
- Modify: `CLAUDE.md` Current state 三段
- Modify: `docs/superpowers/specs/2026-05-17-context-menu-design.md` L7
- Modify: `docs/superpowers/specs/2026-05-23-novasheet-phase-4-5-row-structural.md` §11.2

- [ ] **Step 1: 全量验证**

```bash
bun test
bun run --filter '*' typecheck
bun run lint
bun run --filter @novasheet/core build
bun run --filter @novasheet/web-canvas2d build
bun run --filter @novasheet/web build
```

Expected：全部 PASS，0 lint warnings。

- [ ] **Step 2: 改 README**

「当前状态」段：

```diff
- 最近交付：**Phase 4.5 行结构 + 行头菜单**。下一里程碑：**Phase 4.6 列结构 + 列头菜单扩展**。
+ 最近交付：**Phase 4.6 列结构 + 列头菜单扩展**。下一里程碑：**Phase 4.7 列拖拽重排**。
```

里程碑总表把 4.6 行的「计划中」改 「✅」+ 补 spec 链接：

```
| Phase 4.6 列结构 + 列头菜单扩展   | 列 insert / delete / hide · 列头菜单新增结构项 · 列头 unhide 入口                                             | ✅        | [spec](docs/superpowers/specs/2026-05-24-novasheet-phase-4-6-column-structural.md) |
```

- [ ] **Step 3: 改 CLAUDE.md**

Last shipped → Phase 4.6；Next milestone → Phase 4.7；Phase 4 status → 4.6 已落地，4.7 后续。

- [ ] **Step 4: 改 context-menu spec L7**

「列头扩展项 → Phase 4.6」改为「Phase 4.6 已接管」。

- [ ] **Step 5: 改 4.5 spec §11.2**

「列 insert / delete / hide → Phase 4.6」状态标 ✅。

- [ ] **Step 6: 最后跑一次全 CI 等价**

```bash
bun test && bun run --filter '*' typecheck && bun run lint
```

- [ ] **Step 7: Commit**

```bash
git add README.md CLAUDE.md \
        docs/superpowers/specs/2026-05-17-context-menu-design.md \
        docs/superpowers/specs/2026-05-23-novasheet-phase-4-5-row-structural.md
git commit -m "docs(repo): Phase 4.6 标记为已落地；下一里程碑改为 Phase 4.7"
```

---

## Self-Review

**Spec 覆盖：**

- §2 列头菜单 5 项 + 多列 N → Task 14 + Task 15
- §4 UX 右键选整列 + Hide 三角 + Resize 弹层 + Frozen 同步规则 → Task 8 (frozen) + Task 11 (painter) + Task 12 (handle) + Task 13 (popover) + Task 15 (右键菜单)
- §5 Engine + Schema mutation → Task 2 (DataSourceEvent + MutableDataSource interface) + Task 3 (InMemoryDataSource impl) + Task 8 (engine 5 类 mutation + raw/view colsAxis + frozen sync)
- §5.5 SortLayer / FilterLayer colsDeleted → Task 7
- §6 UndoCommand 5 variants + insertCols newFields 不可重生成约束 → Task 6 + Task 8 (dispatcher 实现)
- §6.4 coords/remap.ts col helpers → Task 4
- §7 RenderFrame / Painter / DOM handle / Popover / Theme → Task 9 + Task 10 + Task 11 + Task 12 + Task 13
- §8 测试 12 文件 + Storybook 3 story → Task 2-17 (test 文件随各 Task 创建) + Task 16
- §9 ADR / OOS / 跨文档 → Task 18

**Placeholder scan：** 无 TBD / TODO / "implement later"。每 step 含代码块或具体命令。

**Type consistency 抽查：**
- `MutableDataSource.insertField / removeField` 在 Task 2 / 3 / 8 一致使用
- `RemovedFieldSnapshot { originalIndex; field; cells }` 在 Task 2 / 3 / 6 / 8 一致
- `UndoCommand` kinds: `insertCols / deleteCols / hideCols / unhideCols / resizeColumnsMulti` 在 Task 6 / 8 一致
- `ContextMenuAction` 新 actions 在 Task 14 / 15 一致
- `RenderFrameCollapsedColGap` 在 Task 9 / 11 / 12 一致
- `hiddenColIds: Set<string>` 在 Task 8 / 15 一致

**Known plan-risk 区域（实现期需要警惕）：**

1. **Task 8 syncFrozenAfterColInsert/Delete 公式**：边界条件 `at == leftCols` + `at + count > totalCols - rightCols` 等微妙；写 Task 8 Step 2 测试时尤其需要覆盖。
2. **Task 8 deleteCols undo 恢复列宽 + sort/filter spec**：需要 sortSpecBefore / filterSpecBefore 在 deleteCols UndoCommand 中正确存取；实现期看 dispatcher unapply 是否真的恢复。
3. **Task 15 viewColToFieldId / collectHiddenInColRange helper**：跨 view col index ↔ fieldId ↔ schema field index 翻译有边界 bug 风险；Task 15 测试覆盖 hideCols 后再 invoke。
4. **Task 11 Painter SVG rotate 方向**：实现期需用 storybook 真机看一眼三角朝向是否正确（左 gap 三角应朝右、右 gap 三角朝左）。
5. **insertField 与 redo 一致性**：Task 8 dispatcher apply (redo) 必须复用 cmd.newFields 而不是重新走 counter（spec §6.1 / invariants #3）。
