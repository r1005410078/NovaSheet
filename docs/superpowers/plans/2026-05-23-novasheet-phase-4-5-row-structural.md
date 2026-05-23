# Phase 4.5 Row Structural Ops + Row Header Menu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 行 insert / delete / hide / unhide / 多行 resize + 行头右键菜单 + Sheets 式 hide 三角指示器，全部进 undo/redo；与 4.4 ViewPipeline 对称（HideRowsLayer 与 SortLayer / FilterLayer 同款）。

**Architecture:** `MutableDataSource` 加 optional `insertRows / deleteRows`；新增 `HideRowsLayer` 走 ViewPipeline；`DefaultGridEngine` 编排 DataSource + ChunkedAxis + Selection remap + UndoStack；行头右键菜单复用 4.0 ContextMenuLayer；hide 三角走 DOM `<handle-layer>` sibling（ADR §A.6）；行高弹层复用 4.4 FilterPopover portal 路径。

**Tech Stack:** TypeScript（strict + noUncheckedIndexedAccess + verbatimModuleSyntax）· `bun:test` · happy-dom · Canvas2D · 单仓 bun workspaces。

**Spec:** [docs/superpowers/specs/2026-05-23-novasheet-phase-4-5-row-structural.md](../specs/2026-05-23-novasheet-phase-4-5-row-structural.md)

---

## Type Reconciliation（spec 草稿 → 真实类型）

spec §5-§8 的部分类型是设计意图草稿，本 plan 按 repo 现有类型形状对齐：

| spec 用名 / 形状 | 真实代码（已 audit） |
| --- | --- |
| `RowsChangedReason { kind }` 联合体 | 扩 `DataSourceEvent` 联合（packages/core/src/data/DataSource.ts）：新增 `{ type: 'rowsInserted'; at; count }` 与 `{ type: 'rowsDeleted'; removed }` |
| `'rows-insert'` / `'rows-delete'` 等 UndoCommand kind（kebab） | camelCase 对齐既有：`insertRows` · `deleteRows` · `hideRows` · `unhideRows` · 新增 `resizeRowsMulti`（多行 resize 走新 variant，单行 drag 仍用 `resizeRow`） |
| `ViewLayer.kind` + `onChange` | 用既有 `ViewLayer { id, bindPipeline(notify), getSpec, setSpec, wrap, ... }`；HideRowsLayer.spec = `{ hidden: readonly number[] }`；通知走 `bindPipeline` 注入的 notifier |
| `SelectionSnapshot` | 直接用 `GridSelection`（packages/core/src/interaction/SelectionModel.ts） |
| `CollapsedGap.yPx` 由 engine 算 | engine `buildFrame` 阶段计算并写入 `RenderFrame.collapsedRowGaps` |

实施中若再发现 spec 与代码冲突，**STOP + ASK** 而不是默默选边（CLAUDE.md「Plan-bug catches」）。

---

## File Structure

**新增文件：**

| 文件 | 责任 |
| --- | --- |
| `packages/core/src/view/HideRowsLayer.ts` | ViewLayer 实现：管 hidden underlying row id 集合；wrap upstream 输出视图 DS；getCollapsedGaps |
| `packages/core/src/coords/remap.ts` | 纯函数：`remapRowIndexAfterInsert` / `remapRowIndexAfterDelete`；selection / fill / clipboard 共享 |
| `packages/web/src/overlay/RowHeightPopover.ts` | DOM 弹层：input + Enter / Esc / 失焦；提交走 `Grid.setRowHeights` |
| `packages/web/src/handle/HideToggleHandle.ts` | DOM `data-handle="hide-toggle"`：每 gap 一个透明命中区，click → `Grid.unhideRows(gap.hiddenIds)` |
| `apps/storybook/src/stories/RowStructural.stories.ts` | 3 个 story：default / with-view / prefilled-hidden |

**修改文件：**

| 文件 | 改动 |
| --- | --- |
| `packages/core/src/data/DataSource.ts` | 扩 `DataSourceEvent` 联合（+ `rowsInserted` / `rowsDeleted`） |
| `packages/core/src/data/MutableDataSource.ts` | 加 optional `insertRows` / `deleteRows`；保留 `updateCell` / `updateCellByUnderlyingRow` |
| `packages/core/src/data/InMemoryDataSource.ts` | 实现 `insertRows` / `deleteRows`；emit 新事件 + `rowCountChanged` |
| `packages/core/src/layout/ChunkedAxis.ts` | 加 `insertRange(beforeIndex, count, defaultSize)` / `deleteRange(removedSortedIndices)` |
| `packages/core/src/view/ViewPipeline.ts` | 不改 API；HideRowsLayer 走既有 `add` 路径 |
| `packages/core/src/undo/UndoCommand.ts` | 加 4 个 variant + `resizeRowsMulti` |
| `packages/core/src/undo/*` (apply/unapply 逻辑) | 新 variant 的 apply / unapply 实现 |
| `packages/core/src/engine/DefaultGridEngine.ts` | 加 `insertRows` / `deleteRows` / `hideRows` / `unhideRows` / `setRowHeights`；订阅 ViewPipeline + remap selection |
| `packages/core/src/interaction/SelectionModel.ts` | 加 `remapAfterRowsInserted(at, count)` / `remapAfterRowsDeleted(removed)` |
| `packages/core/src/render/RenderFrame.ts` | 加 `collapsedRowGaps: readonly CollapsedGap[]` 字段 |
| `packages/core/src/theme/denseGridTheme.ts` | 加 `icons.hideBoundaryUp` / `hideBoundaryDown` · `colors.hideIndicator` · `dimensions.hideTriangleOffset` / `hideTrianglePadX` |
| `packages/web-canvas2d/src/painters/HeaderRowPainter.ts` | 消费 `frame.collapsedRowGaps` 画三角 |
| `packages/web/src/Grid.ts` | 新增 facade 方法 + 事件（`onRowsInserted` / `onRowsDeleted` / `onHideChange`） |
| `packages/web/src/host/DomGridHost.ts` 或行头交互模块 | 行号列右键菜单 + 行选中（点击行号选整行） |
| `packages/web/src/runtime/WebGridRuntime.ts` | 装配 RowHeightPopover + HideToggleHandle |
| `README.md` | 已重写为唯一里程碑总表（pre-flight 提交）；4.5 完成后更新「最近交付 / 下一里程碑」一行 |
| `CLAUDE.md` | 已更新 Current state（pre-flight 提交）；4.5 完成后再次更新 |

**新增测试文件：**

| 文件 | 覆盖 |
| --- | --- |
| `packages/core/tests/view/HideRowsLayer.test.ts` | wrap / getRowCount / getCell / resolveUnderlyingRow / getCollapsedGaps；与 SortLayer + FilterLayer 组合；upstream 事件下 hidden 平移 |
| `packages/core/tests/data/InMemoryDataSource.insertDelete.test.ts` | insertRows / deleteRows 行为 + 事件 |
| `packages/core/tests/coords/remap.test.ts` | 四种位置（before / inside / at / after） + null 情况 |
| `packages/core/tests/layout/ChunkedAxis.mutations.test.ts` | insertRange / deleteRange 跨 chunk / 边界 |
| `packages/core/tests/undo/UndoStack.row-mutations.test.ts` | 4 个新 variant + resizeRowsMulti 的 apply / unapply 对称 |
| `packages/core/tests/engine/DefaultGridEngine.row-mutations.test.ts` | engine 端 5 类 mutation 串联：DS + axis + selection + undo + view pipeline |
| `packages/core/tests/interaction/SelectionModel.remap.test.ts` | remapAfter* 在 SelectionModel 上的行为 |
| `packages/web-canvas2d/tests/painters/HeaderRowPainter.hide.test.ts` | RecordingContext2D 三角 path / fill / 行号列窄于阈值时跳过 |
| `packages/web/tests/Grid.row-menu.test.ts` | 行头右键菜单 happy-dom；6 个菜单项；Sort 激活下 Insert 仍可点 |
| `packages/web/tests/overlay/RowHeightPopover.test.ts` | open / Enter 提交 / Esc 取消 / 失焦关闭 / 焦点恢复 |
| `packages/web/tests/handle/HideToggleHandle.test.ts` | gap handle 点击触发 `Grid.unhideRows` |
| `packages/web/tests/integration/Phase45.scenarios.test.ts` | E2E：插入 + undo 全还原；Sort 下 delete + view rebuild；Hide + Unhide via 三角 |

---

## Task 1: Pre-flight — 提交 spec + 跨文档对齐 + README 重写

**Files:**
- New: `docs/superpowers/specs/2026-05-23-novasheet-phase-4-5-row-structural.md`
- New: `docs/superpowers/plans/2026-05-23-novasheet-phase-4-5-row-structural.md`（本文件）
- Modify: `README.md`（整体重写：单一里程碑总表）
- Modify: `docs/superpowers/specs/2026-05-22-sort-filter-design.md`（4 处对齐 4.7 / Phase 5+）
- Modify: `docs/superpowers/specs/2026-05-17-context-menu-design.md`（6 处拆分到 4.4 / 4.5 / 4.6）
- Modify: `CLAUDE.md`（Current state 三段更新到 4.4 已交付 / 4.5 设计中 / 4.6 + 4.7 后续）

这些文件在 brainstorming 阶段已落到 working tree。本 task 把它们分 3 个 commit 提交，保持审计可读。

- [ ] **Step 1: 确认 working tree 状态**

Run:
```bash
git status -s
```

Expected：上述 7 个路径都显示 modified / new。

- [ ] **Step 2: 提交新 spec + 新 plan（本文档）**

```bash
git add docs/superpowers/specs/2026-05-23-novasheet-phase-4-5-row-structural.md \
        docs/superpowers/plans/2026-05-23-novasheet-phase-4-5-row-structural.md
git commit -m "docs(spec): 新增 Phase 4.5 行结构操作 + 行头菜单 spec 与实施 plan"
```

- [ ] **Step 3: 提交跨文档对齐改动**

```bash
git add docs/superpowers/specs/2026-05-22-sort-filter-design.md \
        docs/superpowers/specs/2026-05-17-context-menu-design.md \
        CLAUDE.md
git commit -m "docs(spec): 对齐 sort-filter / context-menu / CLAUDE.md 到 4.5/4.6/4.7 拆分"
```

- [ ] **Step 4: 提交 README 重写**

```bash
git add README.md
git commit -m "docs(repo): README 重构为唯一里程碑总表（消除 4 套重复 phase 表）"
```

- [ ] **Step 5: 验证三个 commit 已落**

Run:
```bash
git log --oneline -3
```

Expected：三条提交从最新到最旧为 README 重构、跨文档对齐、Phase 4.5 spec+plan。

---

## Task 2: 扩展 `DataSourceEvent` 联合 + `MutableDataSource` 接口

**Files:**
- Modify: `packages/core/src/data/DataSource.ts`
- Modify: `packages/core/src/data/MutableDataSource.ts`
- Test: 类型层修订；运行时无 failing test。用 `tsc --noEmit` 验 RED → GREEN（参考 4.4 spec §10.2 类型-only TDD 模式）

- [ ] **Step 1: 写"failing"——加 typecheck-only 探针**

Create `packages/core/tests/_probe-types-4-5.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import type { DataSourceEvent } from '../src/data/DataSource'
import type { MutableDataSource } from '../src/data/MutableDataSource'
import type { CellValue } from '../src/data/Schema'

describe('Phase 4.5 type probes', () => {
  it('DataSourceEvent 含 rowsInserted / rowsDeleted', () => {
    const inserted: DataSourceEvent = { type: 'rowsInserted', at: 0, count: 2 }
    const deleted: DataSourceEvent = { type: 'rowsDeleted', removed: [1, 2] }
    expect(inserted.type).toBe('rowsInserted')
    expect(deleted.type).toBe('rowsDeleted')
  })

  it('MutableDataSource 含 optional insertRows / deleteRows', () => {
    const ds: MutableDataSource = {
      getRowCount: () => 0,
      getSchema: () => ({ fields: [] }),
      getRows: () => [],
      getCell: () => undefined as unknown as CellValue,
      subscribe: () => () => {},
      updateCell: () => {},
      insertRows: (_at, count) => Array.from({ length: count }, (_, i) => _at + i),
      deleteRows: (_ids) => [],
    }
    expect(ds.insertRows?.(0, 1)).toEqual([0])
  })
})
```

- [ ] **Step 2: 验证 RED（类型）**

Run:
```bash
bun run --filter @novasheet/core typecheck
```

Expected：报 `Property 'rowsInserted' does not exist on type` 等错误。

- [ ] **Step 3: 改 `packages/core/src/data/DataSource.ts`**

把 `DataSourceEvent` 联合改为：

```ts
export type DataSourceEvent =
  | { type: 'reset' }
  | { type: 'rowsChanged'; startIndex: number; endIndex: number }
  | { type: 'rowsInserted'; at: number; count: number }
  | { type: 'rowsDeleted'; removed: readonly number[] }
  | { type: 'schemaChanged' }
  | { type: 'rowCountChanged'; newCount: number }
```

注释顶部加：`- rowsInserted / rowsDeleted：行结构变更（Phase 4.5+）；订阅方按需重建本地缓存`。

- [ ] **Step 4: 改 `packages/core/src/data/MutableDataSource.ts`**

替换内容：

```ts
import type { CellValue, Row } from './Schema'
import type { DataSource } from './DataSource'

/** 被 `deleteRows` 返回，供 undo 还原 */
export interface DeletedRowSnapshot {
  readonly originalUnderlyingRow: number
  readonly cells: Readonly<Record<string, CellValue>>
}

/** 支持同步写单元格的数据源（`InMemoryDataSource` 等）。 */
export interface MutableDataSource extends DataSource {
  updateCell(rowIndex: number, fieldId: string, value: CellValue): void
  updateCellByUnderlyingRow?(underlyingRow: number, fieldId: string, value: CellValue): void

  /**
   * 在 underlying rowId 位置之前插入 count 行空白行。
   * 返回新插入行的 underlying rowId 列表（升序）。
   * 同步触发 `rowsInserted` + `rowCountChanged` 事件。
   */
  insertRows?(beforeUnderlyingRow: number, count: number): readonly number[]

  /**
   * 删除给定 underlying rowId 集合（升序、去重）。
   * 返回被删行快照（含 schema 外 extra 字段），供 undo 还原。
   * 同步触发 `rowsDeleted` + `rowCountChanged`。
   */
  deleteRows?(underlyingRowIds: readonly number[]): readonly DeletedRowSnapshot[]
}

export function isMutableDataSource(data: DataSource): data is MutableDataSource {
  return typeof (data as MutableDataSource).updateCell === 'function'
}
```

- [ ] **Step 5: 验证 GREEN**

Run:
```bash
bun run --filter @novasheet/core typecheck
bun test packages/core/tests/_probe-types-4-5.test.ts
```

Expected：typecheck 0 errors；探针测试 PASS。

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/data/DataSource.ts packages/core/src/data/MutableDataSource.ts \
        packages/core/tests/_probe-types-4-5.test.ts
git commit -m "feat(core): 扩 DataSourceEvent 与 MutableDataSource 加行 insert/delete 接口"
```

---

## Task 3: `InMemoryDataSource.insertRows` / `deleteRows` 实现

**Files:**
- Modify: `packages/core/src/data/InMemoryDataSource.ts`
- Create: `packages/core/tests/data/InMemoryDataSource.insertDelete.test.ts`

- [ ] **Step 1: 写 failing 测试**

Create `packages/core/tests/data/InMemoryDataSource.insertDelete.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'
import type { DataSourceEvent } from '../../src/data/DataSource'

const schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text' as const },
    { id: 'b', name: 'B', type: 'number' as const, defaultValue: 0 },
  ],
}

describe('InMemoryDataSource.insertRows', () => {
  it('插入 2 行到 index 1，返回 [1, 2]，新行字段按 defaultValue', () => {
    const ds = new InMemoryDataSource({
      schema,
      rows: [{ a: 'r0', b: 10 }, { a: 'r1', b: 20 }],
    })
    const events: DataSourceEvent[] = []
    ds.subscribe((e) => events.push(e))

    const newIds = ds.insertRows!(1, 2)

    expect(newIds).toEqual([1, 2])
    expect(ds.getRowCount()).toBe(4)
    expect(ds.getCell(1, 'a')).toBeUndefined()
    expect(ds.getCell(1, 'b')).toBe(0)
    expect(ds.getCell(3, 'a')).toBe('r1')
    expect(events).toContainEqual({ type: 'rowsInserted', at: 1, count: 2 })
    expect(events).toContainEqual({ type: 'rowCountChanged', newCount: 4 })
  })

  it('插入到 rowCount（尾部）等价于 push', () => {
    const ds = new InMemoryDataSource({ schema, rows: [{ a: 'r0', b: 1 }] })
    ds.insertRows!(ds.getRowCount(), 1)
    expect(ds.getRowCount()).toBe(2)
  })
})

describe('InMemoryDataSource.deleteRows', () => {
  it('删除 [0, 2]，返回 snapshot 含全字段，剩余行紧缩', () => {
    const ds = new InMemoryDataSource({
      schema,
      rows: [{ a: 'r0', b: 10 }, { a: 'r1', b: 20 }, { a: 'r2', b: 30 }],
    })
    const events: DataSourceEvent[] = []
    ds.subscribe((e) => events.push(e))

    const snapshots = ds.deleteRows!([0, 2])

    expect(snapshots).toHaveLength(2)
    expect(snapshots[0]).toEqual({ originalUnderlyingRow: 0, cells: { a: 'r0', b: 10 } })
    expect(snapshots[1]).toEqual({ originalUnderlyingRow: 2, cells: { a: 'r2', b: 30 } })
    expect(ds.getRowCount()).toBe(1)
    expect(ds.getCell(0, 'a')).toBe('r1')
    expect(events).toContainEqual({ type: 'rowsDeleted', removed: [0, 2] })
    expect(events).toContainEqual({ type: 'rowCountChanged', newCount: 1 })
  })

  it('未升序入参 debug-mode throws；release 信任', () => {
    const ds = new InMemoryDataSource({
      schema,
      rows: [{ a: 'r0', b: 0 }, { a: 'r1', b: 0 }],
    })
    expect(() => ds.deleteRows!([1, 0])).toThrow(/ascending/i)
  })
})
```

- [ ] **Step 2: 验证 RED**

Run:
```bash
bun test packages/core/tests/data/InMemoryDataSource.insertDelete.test.ts
```

Expected：FAIL，`insertRows is not a function` 或类似。

- [ ] **Step 3: 实现 `insertRows` 与 `deleteRows`**

在 `packages/core/src/data/InMemoryDataSource.ts` 内 class 体加：

```ts
insertRows(beforeUnderlyingRow: number, count: number): readonly number[] {
  if (count <= 0) return []
  const at = Math.max(0, Math.min(beforeUnderlyingRow, this.rows.length))
  const blank: Row[] = Array.from({ length: count }, () => this.makeDefaultRow())
  this.rows.splice(at, 0, ...blank)
  const newIds = Array.from({ length: count }, (_, i) => at + i)
  this.emit({ type: 'rowsInserted', at, count })
  this.emit({ type: 'rowCountChanged', newCount: this.rows.length })
  return newIds
}

deleteRows(underlyingRowIds: readonly number[]): readonly DeletedRowSnapshot[] {
  for (let i = 1; i < underlyingRowIds.length; i += 1) {
    if (underlyingRowIds[i]! <= underlyingRowIds[i - 1]!) {
      throw new Error('InMemoryDataSource.deleteRows: rowIds must be ascending and unique')
    }
  }
  const snapshots: DeletedRowSnapshot[] = []
  for (const id of underlyingRowIds) {
    const row = this.rows[id]
    if (row == null) continue
    snapshots.push({ originalUnderlyingRow: id, cells: { ...row } })
  }
  // 从大到小删，保持索引稳定
  for (let i = underlyingRowIds.length - 1; i >= 0; i -= 1) {
    this.rows.splice(underlyingRowIds[i]!, 1)
  }
  this.emit({ type: 'rowsDeleted', removed: underlyingRowIds })
  this.emit({ type: 'rowCountChanged', newCount: this.rows.length })
  return snapshots
}

private makeDefaultRow(): Row {
  const out: Record<string, CellValue> = {}
  for (const field of this.schema.fields) {
    if (field.defaultValue !== undefined) out[field.id] = field.defaultValue
  }
  return out as Row
}
```

确保 `import type { DeletedRowSnapshot } from './MutableDataSource'` 与 `CellValue` / `Row` 已导入。

- [ ] **Step 4: 验证 GREEN**

Run:
```bash
bun test packages/core/tests/data/InMemoryDataSource.insertDelete.test.ts
bun run --filter @novasheet/core typecheck
```

Expected：测试全 PASS；typecheck 0 errors。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/data/InMemoryDataSource.ts \
        packages/core/tests/data/InMemoryDataSource.insertDelete.test.ts
git commit -m "feat(core): InMemoryDataSource 实现 insertRows/deleteRows 与事件分发"
```

---

## Task 4: `coords/remap.ts` 纯函数

**Files:**
- Create: `packages/core/src/coords/remap.ts`
- Create: `packages/core/tests/coords/remap.test.ts`
- Modify: `packages/core/src/index.ts`（如有顶层 barrel；否则 skip）

- [ ] **Step 1: 写 failing 测试**

Create `packages/core/tests/coords/remap.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import {
  remapRowIndexAfterInsert,
  remapRowIndexAfterDelete,
} from '../../src/coords/remap'

describe('remapRowIndexAfterInsert', () => {
  it('行在 at 之前 → 不动', () => {
    expect(remapRowIndexAfterInsert(2, 5, 3)).toBe(2)
  })
  it('行 == at → 向后挪 count（被插行顶到下面）', () => {
    expect(remapRowIndexAfterInsert(5, 5, 3)).toBe(8)
  })
  it('行 > at → +count', () => {
    expect(remapRowIndexAfterInsert(10, 5, 3)).toBe(13)
  })
})

describe('remapRowIndexAfterDelete', () => {
  it('行在所有 removed 之前 → 不动', () => {
    expect(remapRowIndexAfterDelete(2, [5, 8])).toBe(2)
  })
  it('行恰是 removed 中的一个 → null', () => {
    expect(remapRowIndexAfterDelete(5, [3, 5, 7])).toBe(null)
  })
  it('行在 removed 之间 → 减去之前的 removed 数', () => {
    expect(remapRowIndexAfterDelete(6, [3, 5])).toBe(4)
  })
  it('行大于所有 removed → 减总 removed 数', () => {
    expect(remapRowIndexAfterDelete(10, [3, 5])).toBe(8)
  })
})
```

- [ ] **Step 2: 验证 RED**

Run:
```bash
bun test packages/core/tests/coords/remap.test.ts
```

Expected：FAIL，`Cannot find module`。

- [ ] **Step 3: 写实现**

Create `packages/core/src/coords/remap.ts`:

```ts
/**
 * 行号 remap：行结构变更后，把 underlying rowIndex 平移到新位置。
 * Selection / FillRange / Clipboard 共享同一组函数，保证行为统一。
 * Phase 4.5 实现，对应 spec §7.3。
 */

export function remapRowIndexAfterInsert(
  rowIndex: number,
  at: number,
  count: number,
): number {
  if (rowIndex < at) return rowIndex
  return rowIndex + count
}

export function remapRowIndexAfterDelete(
  rowIndex: number,
  removedSorted: readonly number[],
): number | null {
  let shift = 0
  for (const removed of removedSorted) {
    if (removed === rowIndex) return null
    if (removed < rowIndex) shift += 1
    else break
  }
  return rowIndex - shift
}
```

- [ ] **Step 4: 验证 GREEN**

Run:
```bash
bun test packages/core/tests/coords/remap.test.ts
bun run --filter @novasheet/core typecheck
```

Expected：8 个 case 全 PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/coords/remap.ts packages/core/tests/coords/remap.test.ts
git commit -m "feat(core): 新增 coords/remap.ts 行号 remap 纯函数"
```

---

## Task 5: `ChunkedAxis.insertRange` / `deleteRange`

**Files:**
- Modify: `packages/core/src/layout/ChunkedAxis.ts`
- Create: `packages/core/tests/layout/ChunkedAxis.mutations.test.ts`

- [ ] **Step 1: 读现有 ChunkedAxis 接口**

Run:
```bash
grep -n "^  \(public \|private \)*[a-z]" packages/core/src/layout/ChunkedAxis.ts | head -30
```

记录 `sizes` / `chunkPrefixSum` / `rebuild` / `getSize` / `setSize` 的可见性，后续实现走既有路径。

- [ ] **Step 2: 写 failing 测试**

Create `packages/core/tests/layout/ChunkedAxis.mutations.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { ChunkedAxis } from '../../src/layout/ChunkedAxis'

const DEFAULT_SIZE = 20

function fresh(count: number): ChunkedAxis {
  return new ChunkedAxis({ count, defaultSize: DEFAULT_SIZE })
}

describe('ChunkedAxis.insertRange', () => {
  it('在中段插 3 行，总数 +3，新行尺寸 = defaultSize', () => {
    const axis = fresh(10)
    axis.insertRange(5, 3, DEFAULT_SIZE)
    expect(axis.getCount()).toBe(13)
    expect(axis.getSize(5)).toBe(DEFAULT_SIZE)
    expect(axis.indexToPosition(13)).toBe(13 * DEFAULT_SIZE)
  })

  it('在已 setSize 的行之后插入，前段尺寸保留', () => {
    const axis = fresh(10)
    axis.setSize(3, 50)
    axis.insertRange(7, 2, DEFAULT_SIZE)
    expect(axis.getSize(3)).toBe(50)
    expect(axis.getCount()).toBe(12)
  })

  it('跨 chunk 边界（CHUNK_SIZE=1024）插入', () => {
    const axis = new ChunkedAxis({ count: 2050, defaultSize: DEFAULT_SIZE })
    axis.insertRange(1023, 4, DEFAULT_SIZE)
    expect(axis.getCount()).toBe(2054)
    expect(axis.getSize(1023)).toBe(DEFAULT_SIZE)
    expect(axis.indexToPosition(2054)).toBe(2054 * DEFAULT_SIZE)
  })
})

describe('ChunkedAxis.deleteRange', () => {
  it('删 [3, 5] 总数 -2', () => {
    const axis = fresh(10)
    axis.setSize(3, 50)
    axis.setSize(5, 60)
    axis.deleteRange([3, 5])
    expect(axis.getCount()).toBe(8)
    // 原索引 4 → 新索引 3，原索引 6 → 新索引 4
    expect(axis.getSize(3)).toBe(DEFAULT_SIZE) // 原 4
  })

  it('删尾部行，总数收缩', () => {
    const axis = fresh(10)
    axis.deleteRange([9])
    expect(axis.getCount()).toBe(9)
  })
})
```

- [ ] **Step 3: 验证 RED**

Run:
```bash
bun test packages/core/tests/layout/ChunkedAxis.mutations.test.ts
```

Expected：FAIL，`insertRange is not a function`。

- [ ] **Step 4: 实现**

在 `packages/core/src/layout/ChunkedAxis.ts` 内 class 体加：

> **Plan-bug fix (2026-05-24):** ChunkedAxis 内部没有扁平的 `sizes: Float64Array`，而是
> `chunks: Chunk[]` 分块结构（每块最多 CHUNK_SIZE=1024 项）。原始伪代码基于不存在的扁平数组，
> 已替换为正确实现：先把所有 chunk 展平成逐项尺寸数组，做插入/删除操作后再重设 count，
> 然后调用 `rebuild()` 重建 chunks / chunkPrefixSum。

```ts
/** 把当前 chunks 展平成每项尺寸的 number[] —— insertRange/deleteRange 共用辅助。 */
private flattenSizes(): number[] {
  const result: number[] = new Array(this.count)
  for (let i = 0; i < this.count; i++) {
    const chunkIdx = i >>> 10
    const offset = i & 1023
    const chunk = this.chunks[chunkIdx]!
    result[i] = chunk.sizes === null ? this.defaultSize : chunk.sizes[offset]!
  }
  return result
}

insertRange(beforeIndex: number, count: number, defaultSize: number): void {
  if (count <= 0) return
  const at = Math.max(0, Math.min(beforeIndex, this.count))
  const flat = this.flattenSizes()
  const inserted = Array.from({ length: count }, () => defaultSize)
  flat.splice(at, 0, ...inserted)
  this.count += count
  // 用展平后的尺寸数组重建 chunk 结构：先 rebuild 建好空 chunk 骨架，再按项 setSize。
  // 简化：直接重设 defaultSize 相同的项不需要 setSize；只对偏离 defaultSize 的项调用。
  this.rebuild()
  for (let i = 0; i < flat.length; i++) {
    if (flat[i] !== this.defaultSize) this.setSize(i, flat[i]!)
  }
}

deleteRange(removedSortedIndices: readonly number[]): void {
  if (removedSortedIndices.length === 0) return
  const flat = this.flattenSizes()
  const removeSet = new Set(removedSortedIndices)
  const next = flat.filter((_, i) => !removeSet.has(i))
  this.count = next.length
  this.rebuild()
  for (let i = 0; i < next.length; i++) {
    if (next[i] !== this.defaultSize) this.setSize(i, next[i]!)
  }
}
```

> **注意**：`rebuild()` 是 `private` 方法，在同一 class 内直接调用没有障碍。
> `count` 字段在同一 class 内直接赋值，不需要改可见性。

- [ ] **Step 5: 验证 GREEN**

Run:
```bash
bun test packages/core/tests/layout/ChunkedAxis.mutations.test.ts
bun test packages/core/tests/layout/  # 跑全部 layout 测试，防回归
```

Expected：全部 PASS；既有 ChunkedAxis tests 不退化。

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/layout/ChunkedAxis.ts \
        packages/core/tests/layout/ChunkedAxis.mutations.test.ts
git commit -m "feat(core): ChunkedAxis 加 insertRange/deleteRange mutation 方法"
```

---

## Task 6: `HideRowsLayer` ViewLayer 实现

**Files:**
- Create: `packages/core/src/view/HideRowsLayer.ts`
- Create: `packages/core/tests/view/HideRowsLayer.test.ts`
- Modify: `packages/core/src/index.ts`（导出 HideRowsLayer / `CollapsedGap` 类型）

- [ ] **Step 1: 写 failing 测试**

Create `packages/core/tests/view/HideRowsLayer.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { HideRowsLayer, type CollapsedGap } from '../../src/view/HideRowsLayer'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'

const schema = { fields: [{ id: 'a', name: 'A', type: 'text' as const }] }

function mk(rowCount: number): InMemoryDataSource {
  return new InMemoryDataSource({
    schema,
    rows: Array.from({ length: rowCount }, (_, i) => ({ a: `r${i}` })),
  })
}

describe('HideRowsLayer.wrap', () => {
  it('未隐藏任何行 → composed === upstream（identity）', () => {
    const ds = mk(5)
    const layer = new HideRowsLayer()
    const composed = layer.wrap(ds)
    expect(composed.getRowCount()).toBe(5)
    expect(composed.getCell(2, 'a')).toBe('r2')
  })

  it('隐藏 {1, 2} → composed 跳过这些 underlying', () => {
    const ds = mk(5)
    const layer = new HideRowsLayer()
    layer.setHidden([1, 2])
    const composed = layer.wrap(ds)
    expect(composed.getRowCount()).toBe(3)
    expect(composed.getCell(0, 'a')).toBe('r0')
    expect(composed.getCell(1, 'a')).toBe('r3')
    expect(composed.resolveUnderlyingRow?.(1)).toBe(3)
  })
})

describe('HideRowsLayer.getCollapsedGaps', () => {
  it('underlying [0..9]，hidden = {3,4,5} → gap at viewRow 2, count 3', () => {
    const ds = mk(10)
    const layer = new HideRowsLayer()
    layer.setHidden([3, 4, 5])
    layer.wrap(ds)
    const gaps = layer.getCollapsedGaps()
    expect(gaps).toEqual<CollapsedGap[]>([{ atViewRow: 2, hiddenCount: 3, hiddenIds: [3, 4, 5] }])
  })

  it('两个不相邻 hidden 区间各成一 gap', () => {
    const ds = mk(10)
    const layer = new HideRowsLayer()
    layer.setHidden([1, 4, 5])
    layer.wrap(ds)
    const gaps = layer.getCollapsedGaps()
    expect(gaps).toHaveLength(2)
    expect(gaps[0]!.hiddenIds).toEqual([1])
    expect(gaps[1]!.hiddenIds).toEqual([4, 5])
  })
})

describe('HideRowsLayer 响应 upstream 事件', () => {
  it('upstream rowsInserted → hidden underlying id 整体平移', () => {
    const ds = mk(5)
    const layer = new HideRowsLayer()
    layer.setHidden([2, 3])
    layer.wrap(ds)
    ds.insertRows!(0, 2) // 在头部插 2 行 → hidden 平移到 [4,5]
    expect(layer.getHiddenUnderlyingRows()).toEqual(new Set([4, 5]))
  })

  it('upstream rowsDeleted → hidden 集合剔除 + 紧缩', () => {
    const ds = mk(10)
    const layer = new HideRowsLayer()
    layer.setHidden([2, 3, 7])
    layer.wrap(ds)
    ds.deleteRows!([3]) // 3 被删；2 不动；7 → 6
    expect(layer.getHiddenUnderlyingRows()).toEqual(new Set([2, 6]))
  })
})

describe('HideRowsLayer.bindPipeline 通知', () => {
  it('setHidden 后通知 listener with spec-changed', () => {
    const layer = new HideRowsLayer()
    const events: { layerId: string; reason: string }[] = []
    layer.bindPipeline((change) => events.push({ layerId: change.layerId, reason: change.reason }))
    layer.setHidden([1, 2])
    expect(events).toContainEqual({ layerId: 'hide-rows', reason: 'spec-changed' })
  })
})
```

- [ ] **Step 2: 验证 RED**

Run:
```bash
bun test packages/core/tests/view/HideRowsLayer.test.ts
```

Expected：FAIL，`Cannot find module`。

- [ ] **Step 3: 实现 HideRowsLayer**

Create `packages/core/src/view/HideRowsLayer.ts`:

```ts
import type { DataSource, DataSourceEvent } from '../data/DataSource'
import type { Row } from '../data/Schema'
import type { ViewLayer, ViewLayerChange } from './ViewLayer'

export interface CollapsedGap {
  readonly atViewRow: number
  readonly hiddenCount: number
  readonly hiddenIds: readonly number[]
}

interface HideRowsSpec {
  readonly hidden: readonly number[]
}

/**
 * Phase 4.5：把指定 underlying 行从视图中隐藏。
 * 与 SortLayer / FilterLayer 同款 ViewLayer 协议；在 ViewPipeline 中
 * 推荐放在 Sort → Filter → **Hide** 顺序末端（spec §5.3）。
 */
export class HideRowsLayer implements ViewLayer<HideRowsSpec> {
  readonly id = 'hide-rows'

  private hiddenUnderlyingRows = new Set<number>()
  private visibleRows: number[] = []
  private upstream: DataSource | null = null
  private unsubscribe: (() => void) | null = null
  private notify: ((change: ViewLayerChange) => void) | null = null

  bindPipeline(notify: (change: ViewLayerChange) => void): void {
    this.notify = notify
  }

  getSpec(): HideRowsSpec {
    return { hidden: Array.from(this.hiddenUnderlyingRows).sort((a, b) => a - b) }
  }

  setSpec(spec: HideRowsSpec): boolean {
    const next = new Set(spec.hidden)
    if (sameSet(this.hiddenUnderlyingRows, next)) return false
    this.hiddenUnderlyingRows = next
    this.rebuildVisible()
    this.notify?.({ layerId: this.id, reason: 'spec-changed' })
    return true
  }

  setHidden(underlyingRowIds: readonly number[]): boolean {
    return this.setSpec({ hidden: underlyingRowIds })
  }

  addHidden(underlyingRowIds: readonly number[]): boolean {
    const next = new Set(this.hiddenUnderlyingRows)
    for (const id of underlyingRowIds) next.add(id)
    return this.setSpec({ hidden: Array.from(next) })
  }

  removeHidden(underlyingRowIds: readonly number[]): boolean {
    const next = new Set(this.hiddenUnderlyingRows)
    for (const id of underlyingRowIds) next.delete(id)
    return this.setSpec({ hidden: Array.from(next) })
  }

  getHiddenUnderlyingRows(): ReadonlySet<number> {
    return this.hiddenUnderlyingRows
  }

  getCollapsedGaps(): readonly CollapsedGap[] {
    if (this.hiddenUnderlyingRows.size === 0) return []
    const hiddenSorted = Array.from(this.hiddenUnderlyingRows).sort((a, b) => a - b)
    const gaps: CollapsedGap[] = []
    let run: number[] = []
    for (const id of hiddenSorted) {
      if (run.length === 0 || id === run[run.length - 1]! + 1) {
        run.push(id)
      } else {
        gaps.push(this.makeGap(run))
        run = [id]
      }
    }
    if (run.length > 0) gaps.push(this.makeGap(run))
    return gaps
  }

  wrap(upstream: DataSource): DataSource {
    this.unsubscribe?.()
    this.upstream = upstream
    this.unsubscribe = upstream.subscribe((event) => this.onUpstreamEvent(event))
    this.rebuildVisible()
    const layer = this
    return {
      getRowCount: () => layer.visibleRows.length,
      getSchema: () => upstream.getSchema(),
      getRows: (start, end) =>
        upstream.getRows(layer.visibleRows[start]!, layer.visibleRows[end]!) as Row[],
      getCell: (rowIndex, fieldId) => upstream.getCell(layer.visibleRows[rowIndex]!, fieldId),
      subscribe: (listener) => upstream.subscribe(listener),
      resolveUnderlyingRow: (viewRow) => {
        const upstreamRow = layer.visibleRows[viewRow]
        if (upstreamRow == null) return viewRow
        return upstream.resolveUnderlyingRow?.(upstreamRow) ?? upstreamRow
      },
      findViewRow: (underlyingRow) => {
        const upstreamView = upstream.findViewRow?.(underlyingRow) ?? underlyingRow
        const idx = layer.visibleRows.indexOf(upstreamView)
        return idx >= 0 ? idx : -1
      },
    }
  }

  private onUpstreamEvent(event: DataSourceEvent): void {
    let changed = false
    switch (event.type) {
      case 'rowsInserted': {
        const shifted = new Set<number>()
        for (const id of this.hiddenUnderlyingRows) {
          shifted.add(id >= event.at ? id + event.count : id)
        }
        this.hiddenUnderlyingRows = shifted
        changed = true
        break
      }
      case 'rowsDeleted': {
        const removed = new Set(event.removed)
        const sortedRemoved = [...event.removed]
        const shifted = new Set<number>()
        for (const id of this.hiddenUnderlyingRows) {
          if (removed.has(id)) continue
          let shift = 0
          for (const r of sortedRemoved) if (r < id) shift += 1
          shifted.add(id - shift)
        }
        this.hiddenUnderlyingRows = shifted
        changed = true
        break
      }
      case 'reset':
        this.hiddenUnderlyingRows.clear()
        changed = true
        break
      default:
        break
    }
    if (changed) {
      this.rebuildVisible()
      this.notify?.({ layerId: this.id, reason: event.type === 'reset' ? 'upstream-reset' : 'spec-changed' })
    }
  }

  private rebuildVisible(): void {
    const upstream = this.upstream
    if (upstream == null) {
      this.visibleRows = []
      return
    }
    const total = upstream.getRowCount()
    const next: number[] = []
    for (let i = 0; i < total; i += 1) {
      if (!this.hiddenUnderlyingRows.has(i)) next.push(i)
    }
    this.visibleRows = next
  }

  private makeGap(run: number[]): CollapsedGap {
    const first = run[0]!
    // 找上邻 visible underlying，即 first - 1 走 visibleRows 的 indexOf
    const upperUnderlying = first - 1
    const atViewRow = upperUnderlying < 0 ? -1 : this.visibleRows.indexOf(upperUnderlying)
    return { atViewRow, hiddenCount: run.length, hiddenIds: run.slice() }
  }
}

function sameSet(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}
```

- [ ] **Step 4: 验证 GREEN**

Run:
```bash
bun test packages/core/tests/view/HideRowsLayer.test.ts
bun run --filter @novasheet/core typecheck
```

Expected：全 PASS。

- [ ] **Step 5: 导出到 core barrel（如有）**

```bash
grep -n "from './view" packages/core/src/index.ts
```

若有 view barrel 行，加 `export { HideRowsLayer, type CollapsedGap } from './view/HideRowsLayer'`。

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/view/HideRowsLayer.ts \
        packages/core/tests/view/HideRowsLayer.test.ts \
        packages/core/src/index.ts
git commit -m "feat(core): 新增 HideRowsLayer 实现 Phase 4.5 行隐藏视图层"
```

---

## Task 7: HideRowsLayer 与 SortLayer / FilterLayer 组合

**Files:**
- Modify: `packages/core/tests/view/HideRowsLayer.test.ts`（加一个组合测试）

- [ ] **Step 1: 加 failing 测试**

向 `packages/core/tests/view/HideRowsLayer.test.ts` 末尾追加：

```ts
import { SortLayer } from '../../src/view/SortLayer'
import { FilterLayer } from '../../src/view/FilterLayer'
import { ViewPipeline } from '../../src/view/ViewPipeline'

describe('HideRowsLayer 与 Sort/Filter 组合', () => {
  it('Sort desc + Hide underlying {0,1} → view 看不到这两行', () => {
    const ds = new InMemoryDataSource({
      schema: { fields: [{ id: 'n', name: 'N', type: 'number' as const }] },
      rows: [{ n: 1 }, { n: 2 }, { n: 3 }, { n: 4 }],
    })
    const pipeline = new ViewPipeline(ds)
    const sort = new SortLayer()
    sort.setSpec({ fieldId: 'n', direction: 'desc' })
    const hide = new HideRowsLayer()
    hide.setHidden([0, 1]) // underlying n=1, n=2
    pipeline.add(sort)
    pipeline.add(hide)

    const composed = pipeline.getComposed()
    expect(composed.getRowCount()).toBe(2)
    expect(composed.getCell(0, 'n')).toBe(4)
    expect(composed.getCell(1, 'n')).toBe(3)
  })
})
```

- [ ] **Step 2: 验证 RED → GREEN**

Run:
```bash
bun test packages/core/tests/view/HideRowsLayer.test.ts
```

Expected：组合测试初次跑可能 FAIL（SortLayer 实际 API 与 spec 草稿对不上）或 PASS。**若 SortLayer 接口与上面调用不符（例如 setSpec 签名不一样），STOP + ASK** ——不要默默改用法。

实现侧通常不需改 HideRowsLayer，因为已通过 wrap 协议组合。若需要小修，仅限测试调用方调整以匹配真实 SortLayer / FilterLayer 接口。

- [ ] **Step 3: Commit**

```bash
git add packages/core/tests/view/HideRowsLayer.test.ts
git commit -m "test(core): HideRowsLayer 与 Sort/Filter 在 ViewPipeline 中组合验证"
```

---

## Task 8: `UndoCommand` 加 4 新 variant + `resizeRowsMulti`

**Files:**
- Modify: `packages/core/src/undo/UndoCommand.ts`
- Modify: 对应 apply / unapply 的 dispatch 文件（通常在 `packages/core/src/undo/UndoStack.ts` 或 `engine/undo*.ts`）
- Create: `packages/core/tests/undo/UndoStack.row-mutations.test.ts`

- [ ] **Step 1: 先看 apply / unapply 当前位置**

Run:
```bash
grep -rn "kind: 'editCell'\|kind: 'resizeRow'" packages/core/src/ | head -10
```

记录 dispatcher 文件，后续 5 个 variant 都在同处加 case。

- [ ] **Step 2: 写 failing 测试**

Create `packages/core/tests/undo/UndoStack.row-mutations.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'
import { denseGridTheme } from '../../src/theme/denseGridTheme'

const schema = { fields: [{ id: 'a', name: 'A', type: 'text' as const }] }

function mkEngine(rowCount: number) {
  const ds = new InMemoryDataSource({
    schema,
    rows: Array.from({ length: rowCount }, (_, i) => ({ a: `r${i}` })),
  })
  return new DefaultGridEngine({ data: ds, theme: denseGridTheme })
}

describe('UndoStack — insertRows', () => {
  it('apply 后行数 +N，undo 后还原；redo 等价于第一次 apply', () => {
    const engine = mkEngine(3)
    engine.insertRows(1, 2)
    expect(engine.getDataSource().getRowCount()).toBe(5)
    engine.undo()
    expect(engine.getDataSource().getRowCount()).toBe(3)
    engine.redo()
    expect(engine.getDataSource().getRowCount()).toBe(5)
  })
})

describe('UndoStack — deleteRows', () => {
  it('undo 后行内容（含 schema 外字段）完全还原', () => {
    const engine = mkEngine(3)
    engine.deleteRows([1])
    engine.undo()
    expect(engine.getDataSource().getCell(1, 'a')).toBe('r1')
  })
})

describe('UndoStack — hideRows / unhideRows', () => {
  it('hideRows → undo → unhide 集合一致', () => {
    const engine = mkEngine(5)
    engine.hideRows([2, 3])
    engine.undo()
    expect(engine.getHiddenRows()).toEqual([])
    engine.redo()
    expect(engine.getHiddenRows().sort((a, b) => a - b)).toEqual([2, 3])
  })
})

describe('UndoStack — resizeRowsMulti', () => {
  it('多行高度变更 + undo 各行还原原始高度', () => {
    const engine = mkEngine(3)
    engine.setRowHeights([0, 2], 60)
    engine.undo()
    expect(engine.getRowHeight(0)).toBe(engine.getDefaultRowHeight())
    expect(engine.getRowHeight(2)).toBe(engine.getDefaultRowHeight())
  })
})
```

注：`getDataSource() / getHiddenRows() / getRowHeight() / getDefaultRowHeight()` 是 engine 端公共 getter；后续 Task 11 落地。当前任务只关心 UndoCommand 联合体类型 + apply 注册位置。**若 DefaultGridEngine 的 getter 命名不同，STOP + ASK。**

- [ ] **Step 3: 验证 RED**

Run:
```bash
bun test packages/core/tests/undo/UndoStack.row-mutations.test.ts
```

Expected：FAIL — engine 方法不存在。

- [ ] **Step 4: 扩 `UndoCommand` 联合**

在 `packages/core/src/undo/UndoCommand.ts` 末尾追加 5 个 variant：

```ts
import type { DeletedRowSnapshot } from '../data/MutableDataSource'
import type { GridSelection } from '../interaction/SelectionModel'

export type UndoCommand =
  // … 既有 6 个 variant
  | {
      readonly kind: 'insertRows'
      readonly at: number
      readonly count: number
      readonly newIds: readonly number[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
  | {
      readonly kind: 'deleteRows'
      readonly snapshots: readonly DeletedRowSnapshot[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
  | {
      readonly kind: 'hideRows'
      readonly underlyingRowIds: readonly number[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
  | {
      readonly kind: 'unhideRows'
      readonly underlyingRowIds: readonly number[]
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
  | {
      readonly kind: 'resizeRowsMulti'
      readonly rowIds: readonly number[]
      readonly oldHeights: readonly number[]
      readonly newHeight: number
      readonly selectionBefore: GridSelection
      readonly selectionAfter: GridSelection
    }
```

- [ ] **Step 5: 注册 dispatcher**

在 dispatcher（Task 8 Step 1 找到的文件）的 `applyCommand` / `unapplyCommand` 内加 5 个新 case。每个 case 调 engine 端等价方法但 **不再 push 命令**（避免无限循环）：

伪代码：

```ts
case 'insertRows':
  engine._insertRowsRaw(cmd.at, cmd.count) // raw = 不 push undo
  engine.setSelection(cmd.selectionAfter)
  break
// ...
```

注：`_insertRowsRaw` 等命名按 repo 既有 fill / paste 命令惯例匹配。**若 repo 使用其它惯例（例如直接 `engine.engineInternals.insertRows`），按已有风格调整。**

- [ ] **Step 6: 验证 GREEN（部分）**

`bun run --filter @novasheet/core typecheck` PASS（联合体完整）。runtime test 需 Task 11 engine API 完成后再 GREEN。

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/undo/UndoCommand.ts \
        packages/core/src/undo/*.ts \
        packages/core/tests/undo/UndoStack.row-mutations.test.ts
git commit -m "feat(core): UndoCommand 加 insertRows/deleteRows/hideRows/unhideRows/resizeRowsMulti 5 个 variant"
```

---

## Task 9: `SelectionModel` 加 `remapAfter*`

**Files:**
- Modify: `packages/core/src/interaction/SelectionModel.ts`
- Create: `packages/core/tests/interaction/SelectionModel.remap.test.ts`

- [ ] **Step 1: 写 failing 测试**

Create `packages/core/tests/interaction/SelectionModel.remap.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { SelectionModel } from '../../src/interaction/SelectionModel'

describe('SelectionModel.remapAfterRowsInserted', () => {
  it('选区在 at 之后整体下移', () => {
    const sel = new SelectionModel()
    sel.setSelection({
      activeCell: { rowIndex: 5, colIndex: 0 },
      anchorCell: { rowIndex: 5, colIndex: 0 },
      extentCell: { rowIndex: 7, colIndex: 1 },
      selectedRange: { startRow: 5, endRow: 7, startCol: 0, endCol: 1 },
    })
    sel.remapAfterRowsInserted(3, 2)
    const s = sel.getSelection()
    expect(s.activeCell?.rowIndex).toBe(7)
    expect(s.selectedRange).toEqual({ startRow: 7, endRow: 9, startCol: 0, endCol: 1 })
  })
})

describe('SelectionModel.remapAfterRowsDeleted', () => {
  it('选区跨越被删行 → 折叠到首个存活行', () => {
    const sel = new SelectionModel()
    sel.setSelection({
      activeCell: { rowIndex: 3, colIndex: 0 },
      anchorCell: { rowIndex: 3, colIndex: 0 },
      extentCell: { rowIndex: 5, colIndex: 0 },
      selectedRange: { startRow: 3, endRow: 5, startCol: 0, endCol: 0 },
    })
    sel.remapAfterRowsDeleted([4])
    const s = sel.getSelection()
    expect(s.selectedRange).toEqual({ startRow: 3, endRow: 4, startCol: 0, endCol: 0 })
  })

  it('选区全部被删 → clear', () => {
    const sel = new SelectionModel()
    sel.setSelection({
      activeCell: { rowIndex: 2, colIndex: 0 },
      anchorCell: { rowIndex: 2, colIndex: 0 },
      extentCell: { rowIndex: 3, colIndex: 0 },
      selectedRange: { startRow: 2, endRow: 3, startCol: 0, endCol: 0 },
    })
    sel.remapAfterRowsDeleted([2, 3])
    expect(sel.getSelection().selectedRange).toBeNull()
  })
})
```

- [ ] **Step 2: 验证 RED → GREEN**

Run:
```bash
bun test packages/core/tests/interaction/SelectionModel.remap.test.ts
```

Expected：FAIL。

- [ ] **Step 3: 实现**

在 `packages/core/src/interaction/SelectionModel.ts` SelectionModel class 内加：

```ts
remapAfterRowsInserted(at: number, count: number): void {
  if (this.selection.selectedRange == null) return
  const shift = (r: number) => (r < at ? r : r + count)
  const range = this.selection.selectedRange
  this.selection = {
    activeCell: this.selection.activeCell
      ? { ...this.selection.activeCell, rowIndex: shift(this.selection.activeCell.rowIndex) }
      : null,
    anchorCell: this.selection.anchorCell
      ? { ...this.selection.anchorCell, rowIndex: shift(this.selection.anchorCell.rowIndex) }
      : null,
    extentCell: this.selection.extentCell
      ? { ...this.selection.extentCell, rowIndex: shift(this.selection.extentCell.rowIndex) }
      : null,
    selectedRange: { ...range, startRow: shift(range.startRow), endRow: shift(range.endRow) },
  }
}

remapAfterRowsDeleted(removedSorted: readonly number[]): void {
  if (this.selection.selectedRange == null) return
  const removed = new Set(removedSorted)
  const shift = (r: number): number => {
    let count = 0
    for (const x of removedSorted) {
      if (x < r) count += 1
      else break
    }
    return r - count
  }
  const range = this.selection.selectedRange
  // 整 range 都在 removed 集合内 → clear
  let allInRemoved = true
  for (let r = range.startRow; r <= range.endRow; r += 1) {
    if (!removed.has(r)) {
      allInRemoved = false
      break
    }
  }
  if (allInRemoved) {
    this.selection = { activeCell: null, anchorCell: null, extentCell: null, selectedRange: null }
    return
  }
  // 否则折叠到首个存活
  const survivors: number[] = []
  for (let r = range.startRow; r <= range.endRow; r += 1) if (!removed.has(r)) survivors.push(r)
  const startRow = shift(survivors[0]!)
  const endRow = shift(survivors[survivors.length - 1]!)
  const remap = (cell: { rowIndex: number; colIndex: number } | null) => {
    if (cell == null) return null
    if (removed.has(cell.rowIndex)) return { ...cell, rowIndex: startRow }
    return { ...cell, rowIndex: shift(cell.rowIndex) }
  }
  this.selection = {
    activeCell: remap(this.selection.activeCell),
    anchorCell: remap(this.selection.anchorCell),
    extentCell: remap(this.selection.extentCell),
    selectedRange: { ...range, startRow, endRow },
  }
}
```

- [ ] **Step 4: 验证 GREEN**

Run:
```bash
bun test packages/core/tests/interaction/SelectionModel.remap.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/interaction/SelectionModel.ts \
        packages/core/tests/interaction/SelectionModel.remap.test.ts
git commit -m "feat(core): SelectionModel 加 remapAfterRowsInserted/Deleted"
```

---

## Task 10: `DefaultGridEngine` 接入 `HideRowsLayer` + 公开 hide / unhide / setRowHeights API

**Files:**
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`
- Modify: `packages/core/tests/engine/*.test.ts`（加 row-mutations 测试，或新建）

- [ ] **Step 1: 写 failing 测试**

Create `packages/core/tests/engine/DefaultGridEngine.row-mutations.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'
import { denseGridTheme } from '../../src/theme/denseGridTheme'

function mkEngine(rowCount: number) {
  const ds = new InMemoryDataSource({
    schema: { fields: [{ id: 'a', name: 'A', type: 'text' as const }] },
    rows: Array.from({ length: rowCount }, (_, i) => ({ a: `r${i}` })),
  })
  return { engine: new DefaultGridEngine({ data: ds, theme: denseGridTheme }), ds }
}

describe('DefaultGridEngine.hideRows / unhideRows', () => {
  it('hideRows 后 composed DataSource 行数减少', () => {
    const { engine } = mkEngine(5)
    engine.hideRows([1, 2])
    expect(engine.getDataSource().getRowCount()).toBe(3)
    expect(engine.getHiddenRows().sort((a, b) => a - b)).toEqual([1, 2])
  })

  it('unhideRows 把行还原', () => {
    const { engine } = mkEngine(5)
    engine.hideRows([1, 2])
    engine.unhideRows([1])
    expect(engine.getDataSource().getRowCount()).toBe(4)
    expect(engine.getHiddenRows()).toEqual([2])
  })
})

describe('DefaultGridEngine.insertRows / deleteRows', () => {
  it('insertRows 后 selection 整体下移', () => {
    const { engine } = mkEngine(5)
    engine.setSelection({
      activeCell: { rowIndex: 3, colIndex: 0 },
      anchorCell: { rowIndex: 3, colIndex: 0 },
      extentCell: { rowIndex: 3, colIndex: 0 },
      selectedRange: { startRow: 3, endRow: 3, startCol: 0, endCol: 0 },
    })
    engine.insertRows(1, 2)
    expect(engine.getSelection().activeCell?.rowIndex).toBe(5)
  })
})

describe('DefaultGridEngine.setRowHeights (multi-row)', () => {
  it('setRowHeights 批量改高，可 undo', () => {
    const { engine } = mkEngine(5)
    const original = engine.getRowHeight(0)
    engine.setRowHeights([0, 2, 4], 60)
    expect(engine.getRowHeight(0)).toBe(60)
    expect(engine.getRowHeight(2)).toBe(60)
    expect(engine.getRowHeight(4)).toBe(60)
    engine.undo()
    expect(engine.getRowHeight(0)).toBe(original)
  })
})
```

- [ ] **Step 2: 验证 RED**

Run:
```bash
bun test packages/core/tests/engine/DefaultGridEngine.row-mutations.test.ts
```

Expected：FAIL — `hideRows is not a function` 等。

- [ ] **Step 3: 在 DefaultGridEngine 内组装 HideRowsLayer + 实现 5 个方法**

读现有构造与 ViewPipeline 初始化路径（`grep -n "new ViewPipeline" packages/core/src/engine/DefaultGridEngine.ts`），在 pipeline 创建后追加：

```ts
this.hideRowsLayer = new HideRowsLayer()
this.viewPipeline.add(this.hideRowsLayer)
```

5 个方法实现（伪代码大纲，引用 Task 4-9 既有工具）：

```ts
insertRows(beforeUnderlyingRow: number, count: number): readonly number[] {
  const ds = this.getMutableData()
  if (!ds?.insertRows) throw new Error('DataSource does not support insertRows')
  const before = this.selection.getSelection()
  const newIds = ds.insertRows(beforeUnderlyingRow, count)
  this.axisRow.insertRange(beforeUnderlyingRow, count, this.theme.dimensions.rowHeight)
  this.selection.remapAfterRowsInserted(beforeUnderlyingRow, count)
  const after = this.selection.getSelection()
  this.undoStack.push({ kind: 'insertRows', at: beforeUnderlyingRow, count, newIds, selectionBefore: before, selectionAfter: after })
  this.invalidate()
  return newIds
}

deleteRows(underlyingRowIds: readonly number[]): readonly DeletedRowSnapshot[] {
  const ds = this.getMutableData()
  if (!ds?.deleteRows) throw new Error('DataSource does not support deleteRows')
  const before = this.selection.getSelection()
  const snapshots = ds.deleteRows(underlyingRowIds)
  this.axisRow.deleteRange(underlyingRowIds)
  this.selection.remapAfterRowsDeleted(underlyingRowIds)
  const after = this.selection.getSelection()
  this.undoStack.push({ kind: 'deleteRows', snapshots, selectionBefore: before, selectionAfter: after })
  this.invalidate()
  return snapshots
}

hideRows(underlyingRowIds: readonly number[]): void {
  const before = this.selection.getSelection()
  const newlyHidden = underlyingRowIds.filter((id) => !this.hideRowsLayer.getHiddenUnderlyingRows().has(id))
  if (newlyHidden.length === 0) return
  this.hideRowsLayer.addHidden(newlyHidden)
  const after = this.selection.getSelection()
  this.undoStack.push({ kind: 'hideRows', underlyingRowIds: newlyHidden, selectionBefore: before, selectionAfter: after })
  this.invalidate()
}

unhideRows(underlyingRowIds: readonly number[]): void {
  const before = this.selection.getSelection()
  const newlyVisible = underlyingRowIds.filter((id) => this.hideRowsLayer.getHiddenUnderlyingRows().has(id))
  if (newlyVisible.length === 0) return
  this.hideRowsLayer.removeHidden(newlyVisible)
  const after = this.selection.getSelection()
  this.undoStack.push({ kind: 'unhideRows', underlyingRowIds: newlyVisible, selectionBefore: before, selectionAfter: after })
  this.invalidate()
}

setRowHeights(underlyingRowIds: readonly number[], heightPx: number): void {
  const before = this.selection.getSelection()
  const oldHeights = underlyingRowIds.map((id) => this.axisRow.getSize(id))
  for (const id of underlyingRowIds) this.axisRow.setSize(id, heightPx)
  const after = this.selection.getSelection()
  this.undoStack.push({ kind: 'resizeRowsMulti', rowIds: underlyingRowIds, oldHeights, newHeight: heightPx, selectionBefore: before, selectionAfter: after })
  this.invalidate()
}

getHiddenRows(): readonly number[] {
  return Array.from(this.hideRowsLayer.getHiddenUnderlyingRows()).sort((a, b) => a - b)
}
```

`getMutableData()` 走既有路径（`packages/core/src/data/MutableDataSource.ts:isMutableDataSource`）。**若 `axisRow.getSize` 命名不同（例如 `getSize(i)` vs `sizeOf(i)`），按真实 API 调整。**

- [ ] **Step 4: 注册 5 个 UndoCommand 的 unapply / apply 在 dispatcher**

按 Task 8 Step 5 找到的 dispatcher，加 5 个 case：

```ts
case 'insertRows':
  // redo
  this.dataSource.insertRows!(cmd.at, cmd.count)
  this.axisRow.insertRange(cmd.at, cmd.count, this.theme.dimensions.rowHeight)
  this.selection.setSelection(cmd.selectionAfter)
  break
// unapply 把 cmd 反向：删 [cmd.at .. cmd.at+cmd.count-1]
case 'deleteRows':
  // redo
  this.dataSource.deleteRows!(cmd.snapshots.map((s) => s.originalUnderlyingRow))
  this.axisRow.deleteRange(cmd.snapshots.map((s) => s.originalUnderlyingRow))
  this.selection.setSelection(cmd.selectionAfter)
  break
// unapply 用 snapshots 回填
case 'hideRows':
  this.hideRowsLayer.addHidden(cmd.underlyingRowIds)
  this.selection.setSelection(cmd.selectionAfter)
  break
case 'unhideRows':
  this.hideRowsLayer.removeHidden(cmd.underlyingRowIds)
  this.selection.setSelection(cmd.selectionAfter)
  break
case 'resizeRowsMulti':
  for (const id of cmd.rowIds) this.axisRow.setSize(id, cmd.newHeight)
  this.selection.setSelection(cmd.selectionAfter)
  break
```

unapply 镜像：insertRows ↔ delete[at..at+count-1]；delete ↔ insert + 回填 snapshots；hide ↔ unhide；resize ↔ 逐行还原 oldHeights[i]。

- [ ] **Step 5: 验证 GREEN**

Run:
```bash
bun test packages/core/tests/engine/DefaultGridEngine.row-mutations.test.ts
bun test packages/core/tests/undo/UndoStack.row-mutations.test.ts
bun run --filter @novasheet/core typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/engine/DefaultGridEngine.ts \
        packages/core/src/undo/*.ts \
        packages/core/tests/engine/DefaultGridEngine.row-mutations.test.ts
git commit -m "feat(core): DefaultGridEngine 接入 HideRowsLayer 并实现 5 类行 mutation + undo"
```

---

## Task 11: `RenderFrame.collapsedRowGaps` 字段 + engine 填充

**Files:**
- Modify: `packages/core/src/render/RenderFrame.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`（buildFrame 填字段）

- [ ] **Step 1: 写 typecheck-only 探针**

把测试加在 Task 10 测试文件末尾，或新建 `packages/core/tests/render/RenderFrame.test.ts`：

```ts
import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'
import { denseGridTheme } from '../../src/theme/denseGridTheme'

describe('RenderFrame.collapsedRowGaps', () => {
  it('hide 行后 frame.collapsedRowGaps 含一项 + yPx 落在 view-row 下边界', () => {
    const ds = new InMemoryDataSource({
      schema: { fields: [{ id: 'a', name: 'A', type: 'text' as const }] },
      rows: Array.from({ length: 10 }, (_, i) => ({ a: `r${i}` })),
    })
    const engine = new DefaultGridEngine({ data: ds, theme: denseGridTheme })
    engine.setViewport({ width: 200, height: 400, scrollLeft: 0, scrollTop: 0 })
    engine.hideRows([3, 4, 5])
    const frame = engine.getFrame()
    expect(frame.collapsedRowGaps).toHaveLength(1)
    const gap = frame.collapsedRowGaps[0]!
    expect(gap.atViewRow).toBe(2)
    expect(gap.hiddenCount).toBe(3)
    expect(gap.yPx).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: 验证 RED**

`bun test packages/core/tests/render/RenderFrame.test.ts` → FAIL。

- [ ] **Step 3: 扩 RenderFrame**

在 `packages/core/src/render/RenderFrame.ts`：

```ts
export interface CollapsedGap {
  readonly atViewRow: number
  readonly hiddenCount: number
  readonly hiddenIds: readonly number[]
  readonly yPx: number
}

export interface RenderFrame {
  // ... 既有字段
  readonly collapsedRowGaps: readonly CollapsedGap[]
}
```

- [ ] **Step 4: engine.buildFrame 填字段**

在 `DefaultGridEngine` 构建 frame 的方法内，从 `hideRowsLayer.getCollapsedGaps()` 取，按 `firstVisibleViewRow` / `lastVisibleViewRow` 裁剪可见区，并算 `yPx`：

```ts
const visibleGaps = this.hideRowsLayer.getCollapsedGaps().filter(
  (g) => g.atViewRow >= firstVisibleViewRow && g.atViewRow <= lastVisibleViewRow,
).map((g) => ({
  ...g,
  yPx: this.axisRow.indexToPosition(g.atViewRow + 1) - this.viewport.scrollTop,
}))
// ... frame.collapsedRowGaps = visibleGaps
```

注意：`atViewRow + 1` 对应 view-row 的下边界（行高 prefix sum 在 i+1 位置就是 i 行的下边界）。

- [ ] **Step 5: 验证 GREEN**

`bun test packages/core/tests/render/RenderFrame.test.ts`

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/render/RenderFrame.ts \
        packages/core/src/engine/DefaultGridEngine.ts \
        packages/core/tests/render/RenderFrame.test.ts
git commit -m "feat(core): RenderFrame 加 collapsedRowGaps 字段由 engine 按可见区裁剪"
```

---

## Task 12: Theme tokens (icons + colors + dimensions)

**Files:**
- Modify: `packages/core/src/theme/denseGridTheme.ts`
- Modify: 对应的 `Theme` interface 文件（若 hideBoundary* / hideIndicator / hideTriangleOffset 字段需在 Theme 接口声明）

- [ ] **Step 1: 写 failing 测试**

Add `packages/core/tests/theme/denseGridTheme.test.ts` 或 append 既有 theme 测试：

```ts
import { describe, expect, it } from 'bun:test'
import { denseGridTheme } from '../../src/theme/denseGridTheme'

describe('denseGridTheme — Phase 4.5 tokens', () => {
  it('提供 hideBoundary icons', () => {
    expect(typeof denseGridTheme.icons.hideBoundaryUp).toBe('string')
    expect(typeof denseGridTheme.icons.hideBoundaryDown).toBe('string')
  })
  it('提供 hideIndicator 颜色', () => {
    expect(typeof denseGridTheme.colors.hideIndicator).toBe('string')
  })
  it('提供 hideTriangleOffset / hideTrianglePadX', () => {
    expect(denseGridTheme.dimensions.hideTriangleOffset).toBe(4)
    expect(denseGridTheme.dimensions.hideTrianglePadX).toBe(6)
  })
})
```

- [ ] **Step 2: 验证 RED → GREEN**

加 token：

```ts
icons: {
  // ... 既有
  hideBoundaryUp: 'M0 6 L4 0 L8 6 Z',
  hideBoundaryDown: 'M0 0 L4 6 L8 0 Z',
},
colors: {
  // ... 既有
  hideIndicator: '#6b7280',
},
dimensions: {
  // ... 既有
  hideTriangleOffset: 4,
  hideTrianglePadX: 6,
},
```

同步在 Theme 接口加字段。

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/theme/denseGridTheme.ts packages/core/src/theme/*.ts \
        packages/core/tests/theme/denseGridTheme.test.ts
git commit -m "feat(core): denseGridTheme 加 hideBoundary icons/color/dimensions tokens"
```

---

## Task 13: `HeaderRowPainter` 画三角

**Files:**
- Modify: `packages/web-canvas2d/src/painters/HeaderRowPainter.ts`
- Create: `packages/web-canvas2d/tests/painters/HeaderRowPainter.hide.test.ts`

- [ ] **Step 1: 写 failing 测试**

Create `packages/web-canvas2d/tests/painters/HeaderRowPainter.hide.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { RecordingContext2D } from '../helpers/recording-context'
import { HeaderRowPainter } from '../../src/painters/HeaderRowPainter'
import { denseGridTheme } from '@novasheet/core'

function frameWithGaps(gaps: { atViewRow: number; hiddenCount: number; hiddenIds: number[]; yPx: number }[], rowHeaderWidth: number) {
  return {
    // 最小 frame 形状，按既有 HeaderRowPainter 期望补
    rowHeaderWidth,
    collapsedRowGaps: gaps,
    theme: denseGridTheme,
    // ... 其它必需字段；参照既有 painter 测试 helper
  } as any
}

describe('HeaderRowPainter — 三角 hide indicator', () => {
  it('rowHeaderWidth ≥ 24 时为每个 gap 画两个三角 fill', () => {
    const ctx = new RecordingContext2D()
    const painter = new HeaderRowPainter()
    painter.paint(ctx as any, frameWithGaps([{ atViewRow: 2, hiddenCount: 3, hiddenIds: [3, 4, 5], yPx: 60 }], 30))
    const fillCount = ctx.calls.filter((c) => c.op === 'fill').length
    // 至少 2 个 fill（两个三角）；具体>= 因 painter 可能调用其它 fill
    expect(fillCount).toBeGreaterThanOrEqual(2)
  })

  it('rowHeaderWidth < 24 时跳过三角', () => {
    const ctx = new RecordingContext2D()
    const painter = new HeaderRowPainter()
    painter.paint(ctx as any, frameWithGaps([{ atViewRow: 2, hiddenCount: 3, hiddenIds: [3, 4, 5], yPx: 60 }], 20))
    // 与不画三角时的 fill count 相同：通过比较有 gap vs 无 gap 时的 fill 数
    const ctxNoGap = new RecordingContext2D()
    painter.paint(ctxNoGap as any, frameWithGaps([], 20))
    expect(ctx.calls.filter((c) => c.op === 'fill').length).toBe(
      ctxNoGap.calls.filter((c) => c.op === 'fill').length,
    )
  })
})
```

- [ ] **Step 2: 实现三角绘制**

在 HeaderRowPainter 的 paint 末尾加：

```ts
if (frame.rowHeaderWidth >= 24) {
  for (const gap of frame.collapsedRowGaps) {
    drawHideTriangle(ctx, frame, gap.yPx, 'up')
    drawHideTriangle(ctx, frame, gap.yPx, 'down')
  }
}
```

`drawHideTriangle` 走 theme tokens（icons.hideBoundaryUp / Down, colors.hideIndicator, dimensions.hideTriangleOffset / hideTrianglePadX）；用 Path2D 解析 SVG path 描点后 fill。

- [ ] **Step 3: 验证 GREEN**

```bash
bun test packages/web-canvas2d/tests/painters/HeaderRowPainter.hide.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add packages/web-canvas2d/src/painters/HeaderRowPainter.ts \
        packages/web-canvas2d/tests/painters/HeaderRowPainter.hide.test.ts
git commit -m "feat(canvas2d): HeaderRowPainter 画 hide 三角指示器"
```

---

## Task 14: DOM hide-toggle handle（点击 unhide）

**Files:**
- Create: `packages/web/src/handle/HideToggleHandle.ts`
- Create: `packages/web/tests/handle/HideToggleHandle.test.ts`
- Modify: `packages/web/src/host/DomGridHost.ts`（注入 handle layer）或既有 handle-layer 管理点

- [ ] **Step 1: 写 failing 测试**

Create `packages/web/tests/handle/HideToggleHandle.test.ts`:

```ts
import { describe, expect, it, mock } from 'bun:test'
import { HideToggleHandle } from '../../src/handle/HideToggleHandle'

describe('HideToggleHandle', () => {
  it('点击 handle 触发 onUnhide(hiddenIds)', () => {
    const onUnhide = mock<(ids: readonly number[]) => void>(() => {})
    const root = document.createElement('div')
    const layer = new HideToggleHandle(root, { onUnhide })

    layer.update([{ atViewRow: 2, hiddenCount: 3, hiddenIds: [3, 4, 5], yPx: 60 }], { rowHeaderWidth: 30 })

    const handle = root.querySelector('[data-handle="hide-toggle"]') as HTMLElement
    expect(handle).toBeTruthy()
    handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(onUnhide).toHaveBeenCalledWith([3, 4, 5])
  })
})
```

- [ ] **Step 2: 实现**

Create `packages/web/src/handle/HideToggleHandle.ts`:

```ts
import type { CollapsedGap } from '@novasheet/core'

export interface HideToggleHandleOptions {
  onUnhide(hiddenIds: readonly number[]): void
}

export class HideToggleHandle {
  private elements: HTMLElement[] = []

  constructor(private root: HTMLElement, private opts: HideToggleHandleOptions) {}

  update(gaps: readonly CollapsedGap[], frame: { rowHeaderWidth: number }): void {
    this.clear()
    if (frame.rowHeaderWidth < 24) return
    for (const gap of gaps) {
      const el = document.createElement('div')
      el.setAttribute('data-handle', 'hide-toggle')
      el.style.position = 'absolute'
      el.style.left = '0'
      el.style.width = `${frame.rowHeaderWidth}px`
      el.style.top = `${gap.yPx - 8}px`
      el.style.height = '16px'
      el.style.cursor = 'pointer'
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation()
        this.opts.onUnhide(gap.hiddenIds)
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

- [ ] **Step 3: 在 DomGridHost / WebGridRuntime 装配**

在 web runtime 装配点处实例化 `HideToggleHandle`，每帧 `frame.collapsedRowGaps` 变化时调 `update`；`onUnhide` 直接调 `Grid.unhideRows(ids)`。

- [ ] **Step 4: 验证 GREEN**

```bash
bun test packages/web/tests/handle/HideToggleHandle.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/handle/HideToggleHandle.ts \
        packages/web/src/host/DomGridHost.ts \
        packages/web/src/runtime/WebGridRuntime.ts \
        packages/web/tests/handle/HideToggleHandle.test.ts
git commit -m "feat(web): 新增 HideToggleHandle DOM 命中区接管 unhide 点击"
```

---

## Task 15: Row header 右键菜单 + Grid facade 公共方法 + 事件

**Files:**
- Modify: `packages/web/src/Grid.ts`（暴露 `insertRows / deleteRows / hideRows / unhideRows / setRowHeights` 与 onRowsInserted / onRowsDeleted / onHideChange / 扩 onRowResize）
- Modify: 现有 ContextMenu 触发模块（grep `getCellContextMenuItems` 找到）：加 row-header target kind
- Create: `packages/web/tests/Grid.row-menu.test.ts`

- [ ] **Step 1: 写 failing 测试（菜单层）**

Create `packages/web/tests/Grid.row-menu.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { Grid } from '../src/Grid'
import { InMemoryDataSource, denseGridTheme } from '@novasheet/core'

describe('Grid row header context menu', () => {
  it('右键行号显示 Insert above / Insert below / Delete / Hide / Resize 5 项（无 hidden gap 时 Unhide 隐藏）', () => {
    const ds = new InMemoryDataSource({
      schema: { fields: [{ id: 'a', name: 'A', type: 'text' as const }] },
      rows: [{ a: 'r0' }, { a: 'r1' }, { a: 'r2' }],
    })
    const container = document.createElement('div')
    Object.assign(container.style, { width: '300px', height: '200px' })
    document.body.appendChild(container)
    const grid = new Grid(container, { data: ds, theme: denseGridTheme })

    // 模拟选中第 2 行
    grid.setSelection({
      activeCell: { rowIndex: 1, colIndex: 0 },
      anchorCell: { rowIndex: 1, colIndex: 0 },
      extentCell: { rowIndex: 1, colIndex: 0 },
      selectedRange: { startRow: 1, endRow: 1, startCol: 0, endCol: 0 },
    })

    const items = grid.getRowHeaderContextMenuItems({ targetRowIndex: 1 })
    const ids = items.map((i) => i.id)
    expect(ids).toContain('insert-above')
    expect(ids).toContain('insert-below')
    expect(ids).toContain('delete-rows')
    expect(ids).toContain('hide-rows')
    expect(ids).toContain('resize-row-height')
    expect(ids).not.toContain('unhide-rows')
    grid.destroy()
  })

  it('选区跨 hidden gap 时 Unhide rows in selection 出现', () => {
    const ds = new InMemoryDataSource({
      schema: { fields: [{ id: 'a', name: 'A', type: 'text' as const }] },
      rows: Array.from({ length: 5 }, (_, i) => ({ a: `r${i}` })),
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const grid = new Grid(container, { data: ds, theme: denseGridTheme })
    grid.hideRows([2])
    grid.setSelection({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 3, colIndex: 0 },
      selectedRange: { startRow: 0, endRow: 3, startCol: 0, endCol: 0 },
    })
    const items = grid.getRowHeaderContextMenuItems({ targetRowIndex: 0 })
    expect(items.map((i) => i.id)).toContain('unhide-rows')
    grid.destroy()
  })

  it('点击 Insert above 触发 Grid.insertRows', () => {
    const ds = new InMemoryDataSource({
      schema: { fields: [{ id: 'a', name: 'A', type: 'text' as const }] },
      rows: [{ a: 'r0' }, { a: 'r1' }],
    })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const grid = new Grid(container, { data: ds, theme: denseGridTheme })
    grid.setSelection({
      activeCell: { rowIndex: 1, colIndex: 0 },
      anchorCell: { rowIndex: 1, colIndex: 0 },
      extentCell: { rowIndex: 1, colIndex: 0 },
      selectedRange: { startRow: 1, endRow: 1, startCol: 0, endCol: 0 },
    })
    grid.invokeRowHeaderContextMenuAction('insert-above', { targetRowIndex: 1 })
    expect(ds.getRowCount()).toBe(3)
    grid.destroy()
  })
})
```

- [ ] **Step 2: 实现**

`Grid.ts` 加 5 个 public 方法 + 3 个事件回调：

```ts
insertRows(beforeUnderlyingRow: number, count: number): readonly number[] {
  const newIds = this.engine.insertRows(beforeUnderlyingRow, count)
  this.options.onRowsInserted?.({ at: beforeUnderlyingRow, count, newIds })
  return newIds
}
deleteRows(underlyingRowIds: readonly number[]) {
  const snapshots = this.engine.deleteRows(underlyingRowIds)
  this.options.onRowsDeleted?.({ removed: snapshots })
  return snapshots
}
hideRows(ids: readonly number[]) { this.engine.hideRows(ids); this.options.onHideChange?.({ hidden: this.engine.getHiddenRows() }) }
unhideRows(ids: readonly number[]) { this.engine.unhideRows(ids); this.options.onHideChange?.({ hidden: this.engine.getHiddenRows() }) }
setRowHeights(ids: readonly number[], h: number) { this.engine.setRowHeights(ids, h) }
getHiddenRows() { return this.engine.getHiddenRows() }
```

Menu items 生成（参考 4.4 既有 column-header 菜单结构）：

```ts
getRowHeaderContextMenuItems({ targetRowIndex }: { targetRowIndex: number }): RowHeaderMenuItem[] {
  const sel = this.engine.getSelection().selectedRange
  const N = sel ? (sel.endRow - sel.startRow + 1) : 1
  const items: RowHeaderMenuItem[] = [
    { id: 'insert-above', label: `在上方插入 ${N} 行` },
    { id: 'insert-below', label: `在下方插入 ${N} 行` },
    { id: 'sep1', separator: true },
    { id: 'delete-rows', label: `删除 ${N} 行` },
    { id: 'hide-rows', label: `隐藏 ${N} 行` },
  ]
  if (this.hasHiddenInSelection()) {
    items.push({ id: 'unhide-rows', label: '显示选区内隐藏行' })
  }
  items.push({ id: 'sep2', separator: true })
  items.push({ id: 'resize-row-height', label: '调整行高…' })
  return items
}

invokeRowHeaderContextMenuAction(id: string, ctx: { targetRowIndex: number }): void {
  const range = this.engine.getSelection().selectedRange
  const startRow = range?.startRow ?? ctx.targetRowIndex
  const endRow = range?.endRow ?? ctx.targetRowIndex
  const N = endRow - startRow + 1
  const ids: number[] = []
  for (let r = startRow; r <= endRow; r += 1) ids.push(this.engine.resolveUnderlyingRow(r))
  switch (id) {
    case 'insert-above': this.insertRows(this.engine.resolveUnderlyingRow(startRow), N); break
    case 'insert-below': this.insertRows(this.engine.resolveUnderlyingRow(endRow) + 1, N); break
    case 'delete-rows': this.deleteRows(sortAscUnique(ids)); break
    case 'hide-rows': this.hideRows(sortAscUnique(ids)); break
    case 'unhide-rows': this.unhideRows(this.collectHiddenInSelection()); break
    case 'resize-row-height': this.openRowHeightPopover(ids); break
  }
}
```

Contextmenu 事件路由：在行号列右键 → 选中整行 → 弹菜单。复用 4.0 ContextMenuLayer。

- [ ] **Step 3: 验证 GREEN**

```bash
bun test packages/web/tests/Grid.row-menu.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/Grid.ts \
        packages/web/src/host/DomGridHost.ts \
        packages/web/src/interaction/RowHeaderInteraction.ts \
        packages/web/tests/Grid.row-menu.test.ts
git commit -m "feat(web): 行头右键菜单与 Grid facade 行结构 API"
```

---

## Task 16: `RowHeightPopover` DOM 弹层

**Files:**
- Create: `packages/web/src/overlay/RowHeightPopover.ts`
- Create: `packages/web/tests/overlay/RowHeightPopover.test.ts`

- [ ] **Step 1: 写 failing 测试**

Create `packages/web/tests/overlay/RowHeightPopover.test.ts`:

```ts
import { describe, expect, it, mock } from 'bun:test'
import { RowHeightPopover } from '../../src/overlay/RowHeightPopover'

describe('RowHeightPopover', () => {
  it('open 后 input 聚焦且预填 currentHeight；Enter 提交 onSubmit(px)', () => {
    const onSubmit = mock<(px: number) => void>(() => {})
    const popover = new RowHeightPopover({ onSubmit })
    popover.open({ x: 100, y: 100, width: 40, height: 20 }, 30)

    const input = document.body.querySelector('input[type=number]') as HTMLInputElement
    expect(input).toBeTruthy()
    expect(input.value).toBe('30')
    input.value = '60'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
    expect(onSubmit).toHaveBeenCalledWith(60)
  })

  it('Esc 不提交', () => {
    const onSubmit = mock<(px: number) => void>(() => {})
    const popover = new RowHeightPopover({ onSubmit })
    popover.open({ x: 0, y: 0, width: 40, height: 20 }, 30)
    const input = document.body.querySelector('input[type=number]') as HTMLInputElement
    input.value = '60'
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 实现**

```ts
export interface RowHeightPopoverOptions {
  onSubmit(px: number): void
  onClose?(): void
}

export class RowHeightPopover {
  private container: HTMLElement | null = null
  constructor(private opts: RowHeightPopoverOptions) {}
  open(triggerRect: DOMRect | { x: number; y: number; width: number; height: number }, currentHeight: number): void {
    this.close()
    const root = document.createElement('div')
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-modal', 'true')
    root.setAttribute('aria-label', '调整行高')
    root.style.position = 'fixed'
    root.style.left = `${triggerRect.x}px`
    root.style.top = `${triggerRect.y + triggerRect.height + 4}px`
    root.style.zIndex = '4'
    const input = document.createElement('input')
    input.type = 'number'
    input.min = '20'
    input.step = '1'
    input.value = String(currentHeight)
    root.appendChild(input)
    document.body.appendChild(root)
    input.focus()
    input.select()
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { this.opts.onSubmit(Number(input.value)); this.close() }
      else if (e.key === 'Escape') this.close()
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
}
```

- [ ] **Step 3: 验证 GREEN + Commit**

```bash
bun test packages/web/tests/overlay/RowHeightPopover.test.ts
git add packages/web/src/overlay/RowHeightPopover.ts \
        packages/web/tests/overlay/RowHeightPopover.test.ts
git commit -m "feat(web): 新增 RowHeightPopover DOM 弹层"
```

---

## Task 17: Storybook RowStructural stories

**Files:**
- Create: `apps/storybook/src/stories/RowStructural.stories.ts`

- [ ] **Step 1: 写 stories**

Create `apps/storybook/src/stories/RowStructural.stories.ts`:

```ts
import type { Meta, StoryObj } from '@storybook/html-vite'
import { Grid, denseGridTheme, InMemoryDataSource } from '@novasheet/web'

const meta: Meta = { title: '表格/行结构操作（Phase 4.5）' }
export default meta

const baseSchema = {
  fields: [
    { id: 'name', name: '姓名', type: 'text' as const, width: 120 },
    { id: 'team', name: '团队', type: 'text' as const, width: 120 },
    { id: 'revenue', name: '营收', type: 'number' as const, width: 120 },
    { id: 'date', name: '入职日期', type: 'date' as const, width: 120 },
    { id: 'active', name: '在职', type: 'checkbox' as const, width: 80 },
  ],
}

function mkRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    name: `员工 ${i}`, team: ['Platform', 'Data', 'Design'][i % 3], revenue: i * 1000,
    date: new Date(2024, 0, 1 + i).toISOString(), active: i % 2 === 0,
  }))
}

function mountGrid(args: { preconfigure?(grid: Grid): void }) {
  const container = document.createElement('div')
  Object.assign(container.style, { width: '800px', height: '500px' })
  const data = new InMemoryDataSource({ schema: baseSchema, rows: mkRows(200) })
  const grid = new Grid(container, { data, theme: denseGridTheme })
  args.preconfigure?.(grid)
  return container
}

export const Default: StoryObj = { render: () => mountGrid({}) }
export const WithSortFilter: StoryObj = {
  render: () => mountGrid({
    preconfigure: (grid) => {
      grid.setSortSpec({ fieldId: 'revenue', direction: 'desc' })
      grid.setFilterSpec({ fieldId: 'team', op: { kind: 'equals', value: 'Platform' } })
    },
  }),
}
export const PrefilledHidden: StoryObj = {
  render: () => mountGrid({ preconfigure: (grid) => grid.hideRows([5, 6, 7, 12, 13]) }),
}
```

- [ ] **Step 2: 启动 storybook 确认 3 个 story 渲染（CI 不跑）**

Run:
```bash
bun run storybook
# 浏览器查看 表格/行结构操作（Phase 4.5）下 3 个 story
```

- [ ] **Step 3: Commit**

```bash
git add apps/storybook/src/stories/RowStructural.stories.ts
git commit -m "feat(storybook): 新增行结构操作 Phase 4.5 story（含 sort/filter 与 hidden 区间）"
```

---

## Task 18: Integration test Phase45.scenarios.test.ts

**Files:**
- Create: `packages/web/tests/integration/Phase45.scenarios.test.ts`

- [ ] **Step 1: 写 E2E 场景测试**

Create `packages/web/tests/integration/Phase45.scenarios.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { Grid } from '../../src/Grid'
import { InMemoryDataSource, denseGridTheme } from '@novasheet/core'

const schema = { fields: [{ id: 'a', name: 'A', type: 'text' as const }] }

function mkGrid(rowCount: number) {
  const data = new InMemoryDataSource({
    schema, rows: Array.from({ length: rowCount }, (_, i) => ({ a: `r${i}` })),
  })
  const container = document.createElement('div')
  Object.assign(container.style, { width: '300px', height: '300px' })
  document.body.appendChild(container)
  const grid = new Grid(container, { data, theme: denseGridTheme })
  return { grid, data, container }
}

describe('Phase 4.5 E2E', () => {
  it('Insert above + undo 完全还原', () => {
    const { grid, data, container } = mkGrid(5)
    grid.setSelection({ activeCell: { rowIndex: 2, colIndex: 0 }, anchorCell: { rowIndex: 2, colIndex: 0 }, extentCell: { rowIndex: 2, colIndex: 0 }, selectedRange: { startRow: 2, endRow: 2, startCol: 0, endCol: 0 } })
    grid.insertRows(2, 1)
    expect(data.getRowCount()).toBe(6)
    grid.undo()
    expect(data.getRowCount()).toBe(5)
    expect(grid.getSelection().activeCell?.rowIndex).toBe(2)
    grid.destroy()
    container.remove()
  })

  it('Sort 激活下 delete 触发 view 自动 rebuild', () => {
    const { grid, data, container } = mkGrid(5)
    grid.setSortSpec({ fieldId: 'a', direction: 'desc' })
    grid.deleteRows([0])
    expect(data.getRowCount()).toBe(4)
    grid.destroy()
    container.remove()
  })

  it('Hide + Unhide via 三角 handle', () => {
    const { grid, container } = mkGrid(10)
    grid.hideRows([3, 4])
    const handle = container.querySelector('[data-handle="hide-toggle"]') as HTMLElement
    expect(handle).toBeTruthy()
    handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    expect(grid.getHiddenRows()).toEqual([])
    grid.destroy()
    container.remove()
  })
})
```

- [ ] **Step 2: 验证 GREEN**

```bash
bun test packages/web/tests/integration/Phase45.scenarios.test.ts
```

- [ ] **Step 3: Commit**

```bash
git add packages/web/tests/integration/Phase45.scenarios.test.ts
git commit -m "test(web): Phase 4.5 端到端场景（insert/undo · sort+delete · 三角 unhide）"
```

---

## Task 19: 全量验证 + README 收尾

**Files:**
- Modify: `README.md`（把 Phase 4.5 状态 🚧 设计中 → ✅；当前状态段「最近交付」改为 Phase 4.5；「下一里程碑」改为 Phase 4.6）
- Modify: `CLAUDE.md`（Last shipped → 4.5；Next milestone → 4.6；Phase 4 status 行更新）

- [ ] **Step 1: 全量验证（CI 等价）**

Run:
```bash
bun test
bun run --filter '*' typecheck
bun run lint
bun run --filter @novasheet/core build
bun run --filter @novasheet/web-canvas2d build
bun run --filter @novasheet/web build
```

Expected：全部 PASS，0 lint warnings / errors。

- [ ] **Step 2: 改 README 状态**

在「## 当前状态」段：

```diff
- 最近交付：**Phase 4.4 排序 / 筛选**。下一里程碑：**Phase 4.5 行结构 + 行头菜单**（设计中）。
+ 最近交付：**Phase 4.5 行结构 + 行头菜单**。下一里程碑：**Phase 4.6 列结构 + 列头菜单扩展**。
```

在里程碑总表把 4.5 行的「🚧 设计中」改为「✅」。

- [ ] **Step 3: 改 CLAUDE.md**

把 Current state 三段同步更新：Last shipped → Phase 4.5；Next milestone → Phase 4.6；Phase 4 status → 4.5 已落地，4.6/4.7 后续。

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs(repo): Phase 4.5 标记为已落地；下一里程碑改为 Phase 4.6"
```

- [ ] **Step 5: 最后再跑一次 build / test，确认状态**

```bash
bun test && bun run --filter '*' typecheck && bun run lint
```

Expected：全部 PASS。

---

## Self-Review

**Spec 覆盖：**

- §2 行头菜单 6 项 + 多选 N → Task 15
- §4 触发与 selection 交互 → Task 15
- §4.4 Hide 三角 indicator → Task 11（frame 字段）+ Task 12（theme）+ Task 13（painter）+ Task 14（DOM handle）
- §4.5 Resize 弹层 → Task 16
- §5 HideRowsLayer → Task 6 + Task 7
- §6 MutableDataSource / RowsChangedReason / InMemoryDataSource → Task 2 + Task 3
- §7 Engine API + remap + ChunkedAxis → Task 4 + Task 5 + Task 9 + Task 10
- §8 UndoCommand 4 + 1 variant → Task 8 + Task 10 中的 dispatcher
- §9 Renderer / Painter / Theme / DOM handle / Popover → Task 11 + Task 12 + Task 13 + Task 14 + Task 16
- §10 测试 11 文件 + Storybook 3 story → 落在各任务 + Task 17 + Task 18
- §11 ADR / OOS / 跨文档对齐 → Task 1（pre-flight 跨文档对齐已落到 working tree）
- §12 Invariants → 各任务实现 + Task 18 E2E 验证
- §13 Open Questions → 各任务实现按 spec 临时决定执行

**Placeholder scan：** 无 TBD / TODO / "implement later"。每个 step 含具体代码 / 命令 / 期望输出。

**Type consistency 抽查：**
- `MutableDataSource.insertRows / deleteRows` 在 Task 2 / 3 / 6 / 10 一致；返回类型 `readonly number[]` / `readonly DeletedRowSnapshot[]`。
- `DataSourceEvent` 新增 `{ type: 'rowsInserted'; at; count }` / `{ type: 'rowsDeleted'; removed }` 在 Task 2 / 3 / 6 / 10 一致使用。
- `UndoCommand.kind` 全部 camelCase：`insertRows` / `deleteRows` / `hideRows` / `unhideRows` / `resizeRowsMulti`，在 Task 8 / 10 dispatcher 一致。
- `HideRowsLayer.id = 'hide-rows'` 在 Task 6 / 7 / 10 一致。
- `GridSelection` 而非 `SelectionSnapshot`，在 Task 8 / 9 / 10 一致。
- `CollapsedGap.atViewRow / hiddenCount / hiddenIds / yPx` 在 Task 6 / 11 / 13 / 14 一致。

**Known plan-risk 区域（实现期需要警惕）：**

1. **HideRowsLayer.wrap 内对 upstream.subscribe**：每次 `wrap` 调用都会绑新 subscription——确保旧 unsubscribe 触发；Task 6 实现有 `this.unsubscribe?.()`，但 ViewPipeline 多次 rebuild 时仍需观察。
2. **HideRowsLayer 在 ViewPipeline 中的位置**：spec §5.3 要求 Sort → Filter → Hide 顺序。`viewPipeline.add` 是 push 到末尾——`DefaultGridEngine` 必须在 SortLayer / FilterLayer 之后 add HideRowsLayer。
3. **ChunkedAxis.insertRange / deleteRange 的 `sizes` 私有性**：Task 5 假设 `sizes` 与 `count` 可在 class 内访问；若 repo 把 `sizes` 标了 readonly Float64Array，必须改为重建数组而不是 in-place。
4. **Undo dispatcher 的 `engine.dataSource.deleteRows!` 在 view 包装下**：如果 `engine.dataSource` 实际是 ViewPipeline 末端的 composed DS，需要走 `engine.getUnderlyingMutable()` 之类的途径，而不是 composed。Task 10 已用 `getMutableData()`，实现时务必让它指向真实 underlying。
5. **`axisRow.setSize` vs `axisRow.setRowHeight`**：repo 既有命名待 Task 10 Step 3 确认；不一致时按真实 API 调用。
