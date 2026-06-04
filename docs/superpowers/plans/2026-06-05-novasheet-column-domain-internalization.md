# 列领域抽取与内化实现计划（建 DefaultColumnStructure，删 ColumnStructureContext）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把内联在 `DefaultGridEngine` 的列结构逻辑抽出为自持状态的聚合根 `DefaultColumnStructure`（自持 `rawColsAxis` + `hiddenColIds` + 列隐藏视图包装），严格对称已完成的 row 终态；删除死代码 `ColumnStructureContext`；行为等价。

**Architecture:** 列 operation 经命令处理器执行并 dispatch 列 domain event；format/merge 列 remap 走 `GridEventPipeline`（`FormatEventHandler` 扩列分支）；列宽 resize 直走聚合根（对称 row `commitRowResize`）；frozen（跨行+列）、selection remap、undo push、viewport rebuild 留在 `DefaultGridEngine` 门面方法编排。

**Tech Stack:** TypeScript（strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`）、bun workspaces、`bun test`。spec：`docs/superpowers/specs/2026-06-05-novasheet-column-domain-internalization-design.md`。row 模板参考：`packages/core/src/engine/row/`。

**执行者必读约束：**

- 从 `packages/core` 目录跑单测（bunfig preload 链在此解析）。全量 `bun test` 用仓库正常方式（顶层）。
- 这是「一次彻底」抽取，已与用户确认**接受过渡期 core 内部暂时不可编译**：Task 1–3 建新文件，`@novasheet/core` 全量 typecheck 在 Task 4 接线完成前会**红**。Task 1–3 只跑各自新增的单测文件；Task 4 末跑全量 typecheck + test。
- **行为等价是验收门槛**：所有现有 engine 列行为测试（insertCols/deleteCols/hideCols/unhideCols/moveCols、列宽、undo/redo、frozen 同步、setData/setViewData）必须保持绿，**不得改测试期望**。语义不符就 STOP 询问。
- **load-bearing 抽取规则**：多个聚合根方法是 `DefaultGridEngine` 现有方法体的 1:1 迁移。计划给出「源行范围 + 替换规则」，实现者**读真实源码**翻译，不要凭空重写。替换规则统一为：`this.rawColsAxis` → `this.rawColsAxis`（聚合根自有字段）、`this.hiddenColIds` → `this.hiddenColIds`（自有字段）、`this.rawData` → `this.rawData`（注入引用）、`this.resolveDefaultColWidth()` → `this.rawColsAxis.getDefaultSize()`；**删除**所有 `this.frozen.*` / `this.selection.*` / `this.undoStack.*` / `this.rebuildViewColsAxis()` / `this.coords.*` 行（这些留 engine 编排）。

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `packages/core/src/engine/column/ColumnOperation.ts` | Create | 列 operation 协议（5 个结构操作） |
| `packages/core/src/engine/column/ColumnEvent.ts` | Create | 列 domain event 协议 |
| `packages/core/src/engine/column/ColumnRules.ts` | Create | 纯规则：move 归一化、col index map、宽度快照、delete 归一化、hide/unhide 过滤 |
| `packages/core/src/engine/column/ColumnStructure.ts` | Rewrite | 删 `ColumnStructureContext`；定义富接口 `ColumnStructure` + 窄接口 `ColumnCommands` |
| `packages/core/src/engine/column/DefaultColumnStructure.ts` | Create | 聚合根实现 |
| `packages/core/src/engine/column/InsertColsCommandHandler.ts` 等 ×5 | Create | op 执行器 |
| `packages/core/src/engine/format/FormatEventHandler.ts` | Modify | 扩列事件分支 |
| `packages/core/src/engine/DefaultGridEngine.ts` | Modify | 删 `rawColsAxis`/`hiddenColIds` 字段，列门面瘦身，undo/redo 列分支接线 |
| `packages/core/src/engine/column/README.md` | Modify | 更新列领域职责 |
| 各 `packages/core/tests/engine/column/*.test.ts` | Create | 领域/规则/handler 单测 |

`VisibleColumnsDataSource`（当前是 `DefaultGridEngine.ts` 文件末尾的非导出 class）随本重构迁出为独立模块 `packages/core/src/data/VisibleColumnsDataSource.ts` 并导出，供聚合根使用（见 Task 2 Step 1）。

---

## Task 1：列 operation / event / rules

**Files:**
- Create: `packages/core/src/engine/column/ColumnOperation.ts`
- Create: `packages/core/src/engine/column/ColumnEvent.ts`
- Create: `packages/core/src/engine/column/ColumnRules.ts`
- Create (Test): `packages/core/tests/engine/column/ColumnRules.test.ts`

- [ ] **Step 1: 写 `ColumnOperation.ts`**

```typescript
/** 列领域 operation：描述外部希望 column 领域执行的意图。 */
export type ColumnOperation =
  | InsertColsOperation
  | DeleteColsOperation
  | HideColsOperation
  | UnhideColsOperation
  | MoveColsOperation

export interface InsertColsOperation {
  readonly kind: 'insertCols'
  readonly beforeFieldIndex: number
  readonly count: number
}

export interface DeleteColsOperation {
  readonly kind: 'deleteCols'
  readonly fieldIds: readonly string[]
}

export interface HideColsOperation {
  readonly kind: 'hideCols'
  readonly fieldIds: readonly string[]
}

export interface UnhideColsOperation {
  readonly kind: 'unhideCols'
  readonly fieldIds: readonly string[]
}

export interface MoveColsOperation {
  readonly kind: 'moveCols'
  readonly fieldIds: readonly string[]
  readonly beforeFieldId: string | null
}
```

- [ ] **Step 2: 写 `ColumnEvent.ts`（领域事件，命名对齐既有 `columns*` kind）**

> `event/GridDomainEvent.ts` 已有（当前未用、scaffold 的）`ColumnDomainEvent`，且 `FormatEventHandler` 的 switch 已有 `columnsInserted`/`columnsDeleted`/`columnsMoved`/`columnsHidden`/`columnsUnhidden` 分支（no-op）。本设计**复用这套 kind 名 + `indexMap`**（与 `rowsMoved.indexMap` 一致），把事件定义搬到领域目录（对称 `row/RowEvent.ts`），并在 Step 2b 让 `GridDomainEvent.ts` 改为 re-export。payload 按门面 undo + FormatEventHandler 需要**加厚**。

```typescript
import type { Field } from '../../data/Schema'
import type { RemovedFieldSnapshot } from '../../data/MutableDataSource'

/** 列领域事件：描述 column 领域已经完成的事实。 */
export type ColumnDomainEvent =
  | ColumnsInserted
  | ColumnsDeleted
  | ColumnsHidden
  | ColumnsUnhidden
  | ColumnsMoved

export interface ColumnsInserted {
  readonly kind: 'columnsInserted'
  readonly at: number
  readonly count: number
  readonly newFields: readonly Field[]
}

export interface ColumnsDeleted {
  readonly kind: 'columnsDeleted'
  readonly removedIndices: readonly number[]
  readonly snapshots: readonly RemovedFieldSnapshot[]
  readonly deletedWidths: readonly number[]
}

export interface ColumnsHidden {
  readonly kind: 'columnsHidden'
  readonly fieldIds: readonly string[]
}

export interface ColumnsUnhidden {
  readonly kind: 'columnsUnhidden'
  readonly fieldIds: readonly string[]
}

export interface ColumnsMoved {
  readonly kind: 'columnsMoved'
  readonly fieldIds: readonly string[]
  readonly beforeFieldId: string | null
  readonly inverseBeforeFieldId: string | null
  readonly indexMap: ReadonlyMap<number, number>
}
```

- [ ] **Step 2b: 让 `event/GridDomainEvent.ts` re-export 列事件（对称 row）**

把 `GridDomainEvent.ts` 中**内联定义**的 `ColumnsInserted`/`ColumnsDeleted`/`ColumnsMoved`/`ColumnsHidden`/`ColumnsUnhidden`（约 `13-51` 行）与 `ColumnDomainEvent` 删除，改为：

```typescript
export type {
  ColumnDomainEvent,
  ColumnsDeleted,
  ColumnsHidden,
  ColumnsInserted,
  ColumnsMoved,
  ColumnsUnhidden,
} from '../column/ColumnEvent'
```

保留 `GridDomainEvent = RowDomainEvent | ColumnDomainEvent`。注意：旧 `ColumnsDeleted` 是 `{fieldIds,indexMap}`、旧 `ColumnsMoved` 用 `indexMap`——新定义里 `ColumnsDeleted` 改为 `{removedIndices,snapshots,deletedWidths}`、`ColumnsMoved` 增 `inverseBeforeFieldId`。这些事件此前无人 dispatch（scaffold），改 payload 安全。改完跑 `bun test tests/engine/format` 与 `tests/engine/event`（若存在）确认 no-op 分支仍编译。

- [ ] **Step 3: 写 `ColumnRules.test.ts`（先看红）**

```typescript
import { describe, expect, it } from 'bun:test'
import {
  buildColIndexMap,
  captureRawColWidths,
  getNewlyHiddenCols,
  getNewlyVisibleCols,
  isContiguousFieldGroup,
  normalizeDeleteCols,
  normalizeMoveCols,
} from '../../../src/engine/column/ColumnRules'
import { ChunkedAxis } from '../../../src/layout/ChunkedAxis'
import type { Field } from '../../../src/data/Schema'

function fields(ids: string[]): Field[] {
  return ids.map((id) => ({ id, name: id, type: 'text', width: 80 }))
}

describe('ColumnRules', () => {
  it('normalizeMoveCols returns plan for a contiguous group', () => {
    const plan = normalizeMoveCols(fields(['a', 'b', 'c', 'd']), ['b', 'c'], null)
    expect(plan).not.toBeNull()
    expect(plan?.fieldIds).toEqual(['b', 'c'])
    expect(plan?.beforeFieldId).toBeNull()
    expect(plan?.inverseBeforeFieldId).toBe('d')
  })

  it('normalizeMoveCols rejects non-contiguous / no-op / into-self', () => {
    expect(normalizeMoveCols(fields(['a', 'b', 'c']), ['a', 'c'], null)).toBeNull()
    expect(normalizeMoveCols(fields(['a', 'b', 'c']), ['a'], 'b')).toBeNull() // no-op
    expect(normalizeMoveCols(fields(['a', 'b', 'c']), ['a', 'b'], 'a')).toBeNull()
  })

  it('isContiguousFieldGroup', () => {
    expect(isContiguousFieldGroup(fields(['a', 'b', 'c']), ['a', 'b'])).toBe(true)
    expect(isContiguousFieldGroup(fields(['a', 'b', 'c']), ['a', 'c'])).toBe(false)
  })

  it('buildColIndexMap pairs old→new raw indices by fieldId', () => {
    const before = ['a', 'b', 'c']
    const after = fields(['b', 'c', 'a'])
    const map = buildColIndexMap(before, after)
    expect(map.get(0)).toBe(2) // a: 0→2
    expect(map.get(1)).toBe(0) // b: 1→0
    expect(map.get(2)).toBe(1) // c: 2→1
  })

  it('captureRawColWidths snapshots width per fieldId', () => {
    const axis = new ChunkedAxis({ count: 3, defaultSize: 80 })
    axis.setSize(1, 120)
    const widths = captureRawColWidths(fields(['a', 'b', 'c']), axis)
    expect(widths.get('a')).toBe(80)
    expect(widths.get('b')).toBe(120)
  })

  it('normalizeDeleteCols sorts hits by raw index and drops unknown ids', () => {
    const result = normalizeDeleteCols(fields(['a', 'b', 'c']), ['c', 'a', 'zzz'])
    expect(result).toEqual([
      { id: 'a', idx: 0 },
      { id: 'c', idx: 2 },
    ])
    expect(normalizeDeleteCols(fields(['a']), ['zzz'])).toEqual([])
  })

  it('getNewlyHiddenCols / getNewlyVisibleCols filter against current hidden set', () => {
    const known = fields(['a', 'b', 'c'])
    expect(getNewlyHiddenCols(known, ['a', 'b'], new Set(['a']))).toEqual(['b'])
    expect(getNewlyHiddenCols(known, ['zzz'], new Set())).toEqual([]) // unknown dropped
    expect(getNewlyVisibleCols(['a', 'b'], new Set(['a']))).toEqual(['a'])
  })
})
```

- [ ] **Step 4: 跑测试看红**

Run（从 `packages/core`）：`bun test tests/engine/column/ColumnRules.test.ts`
Expected: FAIL（模块/函数不存在）。

- [ ] **Step 5: 写 `ColumnRules.ts`**

抽取 `DefaultGridEngine.ts` 的私有 helper 为纯函数（读真实源码迁移，把 `this.rawData.getSchema().fields` 改为入参 `fields`，`this.rawColsAxis` 改为入参 `axis`）：

- `normalizeMoveCols(fields, fieldIds, beforeFieldId)` ← 源 `DefaultGridEngine.ts:1656-1694`，返回类型 `ColumnMovePlan | null`（见下）。内部依赖 `isContiguousFieldGroup` 与 `sameStringOrder`（`sameStringOrder` 在 `DefaultGridEngine.ts` 末尾的模块级函数，复制为本文件私有函数）。
- `isContiguousFieldGroup(fields, fieldIds)` ← 源 `1705-1716`。
- `buildColIndexMap(rawFieldIdsBefore, fieldsAfter)` ← 源 `1722-1734`（把 `this.rawData.getSchema().fields` 改为入参 `fieldsAfter`）。
- `captureRawColWidths(fields, axis)` ← 源 `1696-1703`。
- `normalizeDeleteCols(fields, fieldIds)`：返回 `{ id, idx }[]`，按 `idx` 升序、过滤未知 id —— 抽自 `deleteCols` 的 `removed` 计算（源 `629-636`，去掉 `width` 字段，width 由聚合根另取）。
- `getNewlyHiddenCols(fields, fieldIds, hidden)`：抽自 `hideCols` 的 `newlyHidden`（源 `681-682`），`known` 由 `fields` 推出。
- `getNewlyVisibleCols(fieldIds, hidden)`：抽自 `unhideCols`（源 `698`）。

文件结构：

```typescript
import type { ChunkedAxis } from '../../layout/ChunkedAxis'
import type { Field } from '../../data/Schema'

/** 列移动归一化后的计划。 */
export interface ColumnMovePlan {
  readonly fieldIds: readonly string[]
  readonly beforeFieldId: string | null
  readonly inverseBeforeFieldId: string | null
}

export function normalizeMoveCols(
  fields: readonly Field[],
  fieldIds: readonly string[],
  beforeFieldId: string | null,
): ColumnMovePlan | null {
  /* 迁移自 DefaultGridEngine.normalizeMoveCols（1656-1694），fields 改为入参 */
}

export function isContiguousFieldGroup(
  fields: readonly Field[],
  fieldIds: readonly string[],
): boolean {
  /* 迁移自 1705-1716 */
}

export function buildColIndexMap(
  rawFieldIdsBefore: readonly string[],
  fieldsAfter: readonly Field[],
): ReadonlyMap<number, number> {
  /* 迁移自 1722-1734，fieldsAfter 改为入参 */
}

export function captureRawColWidths(
  fields: readonly Field[],
  axis: ChunkedAxis,
): Map<string, number> {
  /* 迁移自 1696-1703 */
}

export function normalizeDeleteCols(
  fields: readonly Field[],
  fieldIds: readonly string[],
): readonly { readonly id: string; readonly idx: number }[] {
  const result = fieldIds
    .map((id) => {
      const idx = fields.findIndex((field) => field.id === id)
      return idx >= 0 ? { id, idx } : null
    })
    .filter((item): item is { id: string; idx: number } => item !== null)
    .sort((a, b) => a.idx - b.idx)
  return result
}

export function getNewlyHiddenCols(
  fields: readonly Field[],
  fieldIds: readonly string[],
  hidden: ReadonlySet<string>,
): string[] {
  const known = new Set(fields.map((field) => field.id))
  return fieldIds.filter((id) => known.has(id) && !hidden.has(id))
}

export function getNewlyVisibleCols(
  fieldIds: readonly string[],
  hidden: ReadonlySet<string>,
): string[] {
  return fieldIds.filter((id) => hidden.has(id))
}

function sameStringOrder(a: readonly string[], b: readonly string[]): boolean {
  /* 复制自 DefaultGridEngine.ts 末尾的 sameStringOrder 模块级函数 */
}
```

- [ ] **Step 6: 跑测试看绿**

Run（从 `packages/core`）：`bun test tests/engine/column/ColumnRules.test.ts`
Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/engine/column/ColumnOperation.ts \
        packages/core/src/engine/column/ColumnEvent.ts \
        packages/core/src/engine/event/GridDomainEvent.ts \
        packages/core/src/engine/column/ColumnRules.ts \
        packages/core/tests/engine/column/ColumnRules.test.ts
git commit -m "feat(core): 新增列领域 operation/event/rules 协议

抽取 column move 归一化、col index map、列宽快照、delete 归一化、
hide/unhide 过滤为纯规则,供后续 DefaultColumnStructure 聚合根使用。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2：`DefaultColumnStructure` 聚合根 + 接口

**Files:**
- Create: `packages/core/src/data/VisibleColumnsDataSource.ts`（从 `DefaultGridEngine.ts` 迁出并导出）
- Rewrite: `packages/core/src/engine/column/ColumnStructure.ts`（删 `ColumnStructureContext`）
- Create: `packages/core/src/engine/column/DefaultColumnStructure.ts`
- Create (Test): `packages/core/tests/engine/column/DefaultColumnStructure.test.ts`

- [ ] **Step 1: 迁出 `VisibleColumnsDataSource` 为独立导出模块**

把 `DefaultGridEngine.ts` 末尾的 `class VisibleColumnsDataSource`（约 `1880` 行起到文件结尾）整体剪切到新文件 `packages/core/src/data/VisibleColumnsDataSource.ts`，加 `export`，补齐它用到的 import（`DataSource`/`MutableDataSource`/`Row`/`Field`/`Schema` 等，从 `./DataSource`、`./MutableDataSource`、`./Schema` 引入；`isMutableDataSource` 从 `./MutableDataSource`）。`DefaultGridEngine.ts` 改为 `import { VisibleColumnsDataSource } from '../data/VisibleColumnsDataSource'`（暂时仍被 `wrapViewData` 使用；Task 4 再改归属）。

构造签名保持不变：`new VisibleColumnsDataSource(upstream, () => ReadonlySet<string>)`。

验证（从 `packages/core`）：`bun test tests/engine` 中现有列相关用例仍可编译运行（此步不改行为）。

- [ ] **Step 2: 重写 `ColumnStructure.ts`（删 context，定义富接口 + 窄接口）**

整体替换为：

```typescript
import type { ChunkedAxis } from '../../layout/ChunkedAxis'
import type { DataSource } from '../../data/DataSource'
import type { Field } from '../../data/Schema'
import type { RemovedFieldSnapshot } from '../../data/MutableDataSource'
import type { RenderFrameCollapsedColGap } from '../../render/RenderFrame'
import type {
  ColumnsDeleted,
  ColumnsHidden,
  ColumnsInserted,
  ColumnsMoved,
  ColumnsUnhidden,
} from './ColumnEvent'
import type {
  DeleteColsOperation,
  HideColsOperation,
  InsertColsOperation,
  MoveColsOperation,
  UnhideColsOperation,
} from './ColumnOperation'

/** 列领域命令面：命令处理器只需要的正向变迁方法子集。 */
export interface ColumnCommands {
  insertCols(operation: InsertColsOperation): ColumnsInserted | null
  deleteCols(operation: DeleteColsOperation): ColumnsDeleted | null
  hideCols(operation: HideColsOperation): ColumnsHidden | null
  unhideCols(operation: UnhideColsOperation): ColumnsUnhidden | null
  moveCols(operation: MoveColsOperation): ColumnsMoved | null
}

/**
 * 列结构领域接口（聚合根）：自持列宽轴与隐藏列集，执行正向结构变迁、列宽读写、
 * 派生视图列轴/列隐藏视图源，并提供 undo/redo 用的逆变迁。
 */
export interface ColumnStructure extends ColumnCommands {
  rebuild(rawData: DataSource, resolveDefaultColWidth: () => number): void
  clearHidden(): void
  /** setData 语义：重置新列自增计数器（newFieldCounter 是列域 concern）。 */
  resetNewFieldCounter(): void

  getColWidth(rawColIndex: number): number
  getDefaultColWidth(): number
  setColWidth(rawColIndex: number, width: number): void
  setColWidthById(fieldId: string, width: number): void
  setColWidthsMulti(fieldIds: readonly string[], width: number): void

  getViewColsAxis(): ChunkedAxis
  getColViewData(rowViewData: DataSource): DataSource
  getHiddenCols(): readonly string[]
  isColHidden(fieldId: string): boolean
  getRawColumnIndex(fieldId: string): number
  getCollapsedColGaps(): readonly Omit<RenderFrameCollapsedColGap, 'xPx'>[]

  /** insert 的 redo：在 at 处插入 fields（按给定宽度）。 */
  insertFieldsAt(at: number, fields: readonly Field[], widths: readonly number[]): void
  /** insert 的 undo / delete 的 redo：按 fieldId 删除字段并收缩列宽轴。 */
  removeFieldsByIds(fieldIds: readonly string[]): void
  /** delete 的 undo：按原位置回插字段、列宽并恢复 cell。 */
  reinsertDeletedCols(
    snapshots: readonly RemovedFieldSnapshot[],
    widths: readonly number[],
  ): void
  addHidden(fieldIds: readonly string[]): void
  removeHidden(fieldIds: readonly string[]): void
}
```

- [ ] **Step 3: 写 `DefaultColumnStructure.test.ts`（先看红）**

```typescript
import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../../src/data/InMemoryDataSource'
import { DefaultColumnStructure } from '../../../src/engine/column/DefaultColumnStructure'
import type { DataSource } from '../../../src/data/DataSource'

const DEFAULT_WIDTH = 80

function makeData(fieldIds: string[]): InMemoryDataSource {
  return new InMemoryDataSource({
    schema: { fields: fieldIds.map((id) => ({ id, name: id, type: 'text', width: DEFAULT_WIDTH })) },
    rows: [{ ...Object.fromEntries(fieldIds.map((id) => [id, `${id}0`])) }],
  })
}

function makeCols(data: DataSource): DefaultColumnStructure {
  return new DefaultColumnStructure(data, () => DEFAULT_WIDTH)
}

describe('DefaultColumnStructure（自持状态）', () => {
  it('inserts columns and expands the raw col axis', () => {
    const data = makeData(['a', 'b'])
    const cols = makeCols(data)
    const event = cols.insertCols({ kind: 'insertCols', beforeFieldIndex: 1, count: 2 })
    expect(event?.kind).toBe('columnsInserted')
    expect(event?.at).toBe(1)
    expect(event?.count).toBe(2)
    expect(data.getSchema().fields.length).toBe(4)
    expect(cols.getViewColsAxis().getCount()).toBe(4)
  })

  it('deletes columns, captures removedIndices / widths / snapshots', () => {
    const data = makeData(['a', 'b', 'c'])
    const cols = makeCols(data)
    cols.setColWidthById('b', 120)
    const event = cols.deleteCols({ kind: 'deleteCols', fieldIds: ['b'] })
    expect(event?.removedIndices).toEqual([1])
    expect(event?.deletedWidths).toEqual([120])
    expect(event?.snapshots.length).toBe(1)
    expect(data.getSchema().fields.map((f) => f.id)).toEqual(['a', 'c'])
  })

  it('hides / unhides only effective field ids, reflected in view data + axis', () => {
    const data = makeData(['a', 'b', 'c'])
    const cols = makeCols(data)
    expect(cols.hideCols({ kind: 'hideCols', fieldIds: ['b', 'zzz'] })).toEqual({
      kind: 'columnsHidden',
      fieldIds: ['b'],
    })
    expect(cols.getHiddenCols()).toEqual(['b'])
    expect(cols.isColHidden('b')).toBe(true)
    expect(cols.getViewColsAxis().getCount()).toBe(2)
    expect(cols.getColViewData(data).getSchema().fields.map((f) => f.id)).toEqual(['a', 'c'])
    expect(cols.unhideCols({ kind: 'unhideCols', fieldIds: ['b'] })?.fieldIds).toEqual(['b'])
    expect(cols.getHiddenCols()).toEqual([])
  })

  it('moves columns, anchoring widths and producing a colIndexMap', () => {
    const data = makeData(['a', 'b', 'c', 'd'])
    const cols = makeCols(data)
    cols.setColWidthById('b', 120)
    const event = cols.moveCols({ kind: 'moveCols', fieldIds: ['b', 'c'], beforeFieldId: null })
    expect(event?.kind).toBe('columnsMoved')
    expect(data.getSchema().fields.map((f) => f.id)).toEqual(['a', 'd', 'b', 'c'])
    // b 现在在 raw index 2，宽度仍 120
    expect(cols.getColWidth(2)).toBe(120)
    expect(event?.indexMap.get(1)).toBe(2) // b: 1→2
  })

  it('returns null for invalid move / non-mutable source', () => {
    const data = makeData(['a', 'b', 'c'])
    const cols = makeCols(data)
    expect(cols.moveCols({ kind: 'moveCols', fieldIds: ['a', 'c'], beforeFieldId: null })).toBeNull()
    const immutable: DataSource = {
      getRowCount: () => 1,
      getSchema: () => ({ fields: [{ id: 'a', name: 'a', type: 'text', width: 80 }] }),
      getRows: () => [],
      getCell: () => undefined,
      subscribe: () => () => undefined,
    }
    const cols2 = new DefaultColumnStructure(immutable, () => DEFAULT_WIDTH)
    expect(cols2.insertCols({ kind: 'insertCols', beforeFieldIndex: 0, count: 1 })).toBeNull()
  })

  it('getCollapsedColGaps reports hidden runs', () => {
    const data = makeData(['a', 'b', 'c', 'd'])
    const cols = makeCols(data)
    cols.addHidden(['b', 'c'])
    expect(cols.getCollapsedColGaps()).toEqual([
      { atViewCol: 0, hiddenCount: 2, hiddenFieldIds: ['b', 'c'] },
    ])
    // 注：getCollapsedColGaps 产出不含 xPx（Omit<…,'xPx'>），由 engine getFrame 补 xPx
  })

  it('reinsertDeletedCols restores fields, widths and cells (delete undo)', () => {
    const data = makeData(['a', 'b', 'c'])
    const cols = makeCols(data)
    cols.setColWidthById('b', 120)
    const event = cols.deleteCols({ kind: 'deleteCols', fieldIds: ['b'] })!
    cols.reinsertDeletedCols(event.snapshots, event.deletedWidths)
    expect(data.getSchema().fields.map((f) => f.id)).toEqual(['a', 'b', 'c'])
    expect(cols.getColWidth(1)).toBe(120)
  })

  it('rebuild rebinds data source and reseeds the axis; clearHidden empties hidden', () => {
    const cols = makeCols(makeData(['a', 'b']))
    cols.addHidden(['a'])
    cols.clearHidden()
    expect(cols.getHiddenCols()).toEqual([])
    const next = makeData(['x', 'y', 'z'])
    cols.rebuild(next, () => DEFAULT_WIDTH)
    expect(cols.getViewColsAxis().getCount()).toBe(3)
  })
})
```

- [ ] **Step 4: 跑测试看红**

Run（从 `packages/core`）：`bun test tests/engine/column/DefaultColumnStructure.test.ts`
Expected: FAIL（`DefaultColumnStructure` 不存在）。

- [ ] **Step 5: 写 `DefaultColumnStructure.ts`**

字段与生命周期（自有 `rawColsAxis` + `hiddenColIds`；definite-assignment 经 `rebuild` 赋值，见 CLAUDE.md）：

```typescript
import { ChunkedAxis } from '../../layout/ChunkedAxis'
import { VisibleColumnsDataSource } from '../../data/VisibleColumnsDataSource'
import { isMutableDataSource } from '../../data/MutableDataSource'
import {
  buildColIndexMap,
  captureRawColWidths,
  getNewlyHiddenCols,
  getNewlyVisibleCols,
  normalizeDeleteCols,
  normalizeMoveCols,
} from './ColumnRules'
import type { ChunkedAxis as ChunkedAxisType } from '../../layout/ChunkedAxis'
import type { DataSource } from '../../data/DataSource'
import type { Field } from '../../data/Schema'
import type { MutableDataSource, RemovedFieldSnapshot } from '../../data/MutableDataSource'
import type { RenderFrameCollapsedColGap } from '../../render/RenderFrame'
import type { ColsDeleted, ColsHidden, ColsInserted, ColsMoved, ColsUnhidden } from './ColumnEvent'
import type {
  DeleteColsOperation, HideColsOperation, InsertColsOperation,
  MoveColsOperation, UnhideColsOperation,
} from './ColumnOperation'
import type { ColumnStructure } from './ColumnStructure'

export class DefaultColumnStructure implements ColumnStructure {
  private rawData!: DataSource
  private rawColsAxis!: ChunkedAxisType
  private hiddenColIds: Set<string> = new Set()

  constructor(rawData: DataSource, resolveDefaultColWidth: () => number) {
    this.rebuild(rawData, resolveDefaultColWidth)
  }

  rebuild(rawData: DataSource, resolveDefaultColWidth: () => number): void {
    this.rawData = rawData
    this.rawColsAxis = new ChunkedAxis({
      count: rawData.getSchema().fields.length,
      defaultSize: resolveDefaultColWidth(),
    })
    // 从 field.width 回填非默认列宽（对应 engine.applyFieldWidths）
    const fields = rawData.getSchema().fields
    const def = this.rawColsAxis.getDefaultSize()
    for (let i = 0; i < fields.length; i += 1) {
      if (fields[i]!.width !== def) this.rawColsAxis.setSize(i, fields[i]!.width)
    }
  }

  clearHidden(): void {
    this.hiddenColIds.clear()
  }

  private get mutable(): MutableDataSource | null {
    return isMutableDataSource(this.rawData) ? this.rawData : null
  }

  private get fields(): readonly Field[] {
    return this.rawData.getSchema().fields
  }
  // ... 见下方各方法
}
```

正向 op（迁移自 engine，**去掉** frozen/selection/undo/format/merge/rebuildView 行，只留 raw 列状态变迁 + 返回 event）：

- `insertCols(op)`：源 `DefaultGridEngine.insertCols`（`580-624`）的「建 field + `insertField` + `rawColsAxis.insertRange`」部分。`newFieldCounter` 不属于列域状态 → **新字段 id 生成留 engine**。因此聚合根 `insertCols` 改为接收已建好的 fields？为避免把 `newFieldCounter` 塞进聚合根，约定：`InsertColsOperation` 只带 `beforeFieldIndex` + `count`，聚合根内部用 `mutable.insertField` 生成的字段——但当前 engine 自己造 field（带自增 id/name）。**决策**：把 field 生成（id/name/width）迁入聚合根，自增计数器作为聚合根私有 `newFieldCounter`（它是列域 concern）。`rebuild` 时**不**重置 `newFieldCounter`（与现状一致：engine 的 `newFieldCounter` 仅在 `setData` 重置，见 Task 4 Step 4）。实现：

```typescript
  private newFieldCounter = 0

  insertCols(op: InsertColsOperation): ColsInserted | null {
    const mutable = this.mutable
    if (op.count <= 0 || !mutable?.insertField) return null
    const at = Math.max(0, Math.min(op.beforeFieldIndex, this.fields.length))
    const defaultWidth = this.rawColsAxis.getDefaultSize()
    const newFields: Field[] = []
    for (let i = 0; i < op.count; i += 1) {
      this.newFieldCounter += 1
      newFields.push({
        id: `field_${this.newFieldCounter}`,
        name: `新列 ${this.newFieldCounter}`,
        type: 'text',
        width: defaultWidth,
      })
    }
    for (let i = 0; i < newFields.length; i += 1) mutable.insertField(at + i, newFields[i]!)
    this.rawColsAxis.insertRange(at, newFields.length, defaultWidth)
    return { kind: 'columnsInserted', at, count: newFields.length, newFields }
  }
```

> 注意：engine 的 `newFieldCounter` 字段在 Task 4 删除（迁入聚合根）。`setData` 改为调 `columnStructure.resetNewFieldCounter()`。接口已在 Step 2 含 `resetNewFieldCounter(): void`；实现为 `resetNewFieldCounter(): void { this.newFieldCounter = 0 }`。`rebuild` **不**重置 `newFieldCounter`（与现状 `rebuildData` 不碰 `newFieldCounter` 一致）。

- `deleteCols(op)`：源 `626-677` 的 raw 部分。用 `normalizeDeleteCols(this.fields, op.fieldIds)` 得 `{id,idx}[]`；`deletedWidths` = 各 idx 的 `rawColsAxis.getSize(idx)`；逆序 `mutable.removeField(id)` 收集 `snapshots`；`removedIndices` = idx 升序；`rawColsAxis.deleteRange(removedIndices)`；`for id of op.fieldIds: this.hiddenColIds.delete(id)`。返回 `{ kind:'columnsDeleted', removedIndices, snapshots, deletedWidths }`。无 mutable/removeField 或空 → `null`。

- `hideCols(op)`：`getNewlyHiddenCols(this.fields, op.fieldIds, this.hiddenColIds)`；空 → null；`for id: this.hiddenColIds.add(id)`；返回 `{kind:'columnsHidden', fieldIds: newly}`。

- `unhideCols(op)`：`getNewlyVisibleCols(op.fieldIds, this.hiddenColIds)`；空 → null；`delete`；返回 `{kind:'columnsUnhidden', fieldIds: newly}`。

- `moveCols(op)`：源 `752-787` 的 raw 部分。`mutable?.moveFields` 不存在 → null；`plan = normalizeMoveCols(this.fields, op.fieldIds, op.beforeFieldId)`，null → null；`rawFieldIdsBefore = this.fields.map(f=>f.id)`；`widthById = captureRawColWidths(this.fields, this.rawColsAxis)`；`mutable.moveFields(plan.fieldIds, plan.beforeFieldId)`；`indexMap = buildColIndexMap(rawFieldIdsBefore, this.fields)`；`this.rebuildRawColsAxisFromWidths(widthById)`（私有，见下）。返回 `{ kind:'columnsMoved', fieldIds: plan.fieldIds, beforeFieldId: plan.beforeFieldId, inverseBeforeFieldId: plan.inverseBeforeFieldId, indexMap }`。

私有 `rebuildRawColsAxisFromWidths(widthById)` ← 源 `1736-1746`（替换规则：`this.rawData.getSchema().fields` → `this.fields`，其余照搬，含 `field.width = width` 写回）。

列宽方法：

```typescript
  getColWidth(rawColIndex: number): number { return this.rawColsAxis.getSize(rawColIndex) }
  getDefaultColWidth(): number { return this.rawColsAxis.getDefaultSize() }
  setColWidth(rawColIndex: number, width: number): void {
    this.rawColsAxis.setSize(rawColIndex, width)
    const field = this.fields[rawColIndex]
    if (field) field.width = width
  }
  setColWidthById(fieldId: string, width: number): void {
    const idx = this.getRawColumnIndex(fieldId)
    if (idx >= 0) this.setColWidth(idx, width)
  }
  setColWidthsMulti(fieldIds: readonly string[], width: number): void {
    for (const id of fieldIds) this.setColWidthById(id, width)
  }
  setDefaultColWidth?(/* 不需要：列宽默认值随 rebuild 注入，无独立 setter */): void {}
```

> 删掉上面占位的 `setDefaultColWidth`（接口里也不要它——列没有 theme 驱动的默认宽变更入口，区别于 row 的 `setDefaultRowHeight`）。**确认接口 `ColumnStructure` 不含 `setDefaultColWidth`。**

派生读：

- `getViewColsAxis()` ← 源 `buildViewColsAxis`（`1558-1572`），`this.hiddenColIds`/`this.rawColsAxis`/`this.rawData` 用自有字段。
- `getColViewData(rowViewData)`：`return new VisibleColumnsDataSource(rowViewData, () => this.hiddenColIds)`。
- `getHiddenCols()`：`return this.fields.map(f=>f.id).filter(id=>this.hiddenColIds.has(id))`（源 `739-744`）。
- `isColHidden(fieldId)`：`return this.hiddenColIds.has(fieldId)`。
- `getRawColumnIndex(fieldId)`：`return this.fields.findIndex(f=>f.id===fieldId)`。
- `getCollapsedColGaps()` ← 源 `computeCollapsedColGaps`（`1589-1609`）+ `makeColGap`（`1611-1630`，作为私有方法一并迁入），自有字段替换。

逆变迁（只动 raw 列状态；frozen/selection 留 engine）：

- `insertFieldsAt(at, fields, widths)` ← 源 `applyInsertCols`（`1346-1358`）去掉 `frozen.setFrozen`/`rebuildViewColsAxis`/`selection`：`for i: mutable.insertField(at+i, fields[i])`；`rawColsAxis.insertRange(at, fields.length, getDefaultColWidth())`；`for i: rawColsAxis.setSize(at+i, fields[i].width)`。（widths 参数用于 delete-undo 复用，见下；insert-redo 直接用 `fields[i].width`，可忽略 widths——但为统一签名保留，insert-redo 传 `newFields.map(f=>f.width)`。）
- `removeFieldsByIds(fieldIds)` ← 源 `unapplyInsertCols`（`1360-1374`）/`applyDeleteCols`（`1376-1390`）的 raw 部分：`removed = fieldIds.map(getRawColumnIndex).filter(>=0).sort()`；逆序 `mutable.removeField(id)` + `this.hiddenColIds.delete(id)`；`rawColsAxis.deleteRange(removed)`。
- `reinsertDeletedCols(snapshots, widths)` ← 源 `unapplyDeleteCols`（`1392-1409`）去掉 `frozen`/`rebuildView`/`selection`：按 `originalIndex` 升序，`width = widths[snapshots.indexOf(snap)] ?? snap.field.width`，`restoredField = {...snap.field, width}`，`mutable.insertField(originalIndex, restoredField)`，`rawColsAxis.insertRange(originalIndex,1,width)` + `setSize`，恢复 `snap.cells` 各行 `mutable.updateCell(rowIndex, snap.field.id, value)`。
- `addHidden(fieldIds)`：`for id: this.hiddenColIds.add(id)`。
- `removeHidden(fieldIds)`：`for id: this.hiddenColIds.delete(id)`。

- [ ] **Step 6: 跑测试看绿**

Run（从 `packages/core`）：`bun test tests/engine/column/DefaultColumnStructure.test.ts`
Expected: PASS。

- [ ] **Step 7: lint 看三个新文件干净**

Run: `bun run lint`
Expected: 0 errors / 0 warnings。（不要跑全量 typecheck——engine 尚未接线，会红。）

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/data/VisibleColumnsDataSource.ts \
        packages/core/src/engine/column/ColumnStructure.ts \
        packages/core/src/engine/column/DefaultColumnStructure.ts \
        packages/core/tests/engine/column/DefaultColumnStructure.test.ts \
        packages/core/src/engine/DefaultGridEngine.ts
git commit -m "feat(core): 新增 DefaultColumnStructure 聚合根,自持列宽轴与隐藏列集

迁出 VisibleColumnsDataSource 为独立导出模块;删除死代码 ColumnStructureContext,
ColumnStructure 改为富接口 + ColumnCommands 窄接口。engine 接线在后续提交。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> 注：本提交含 `DefaultGridEngine.ts`（仅 Step 1 的 import 改动），此刻 engine 仍按旧方式持有 `rawColsAxis`/`hiddenColIds`，全量 typecheck 仍因尚未接线而红——属预期过渡态。

---

## Task 3：列命令处理器 + `FormatEventHandler` 扩列分支

**Files:**
- Create: `packages/core/src/engine/column/InsertColsCommandHandler.ts`、`DeleteColsCommandHandler.ts`、`HideColsCommandHandler.ts`、`UnhideColsCommandHandler.ts`、`MoveColsCommandHandler.ts`
- Modify: `packages/core/src/engine/format/FormatEventHandler.ts`
- Create (Test): `packages/core/tests/engine/column/ColumnCommandHandlers.test.ts`、`packages/core/tests/engine/format/FormatEventHandler.cols.test.ts`

- [ ] **Step 1: 写 5 个命令处理器（对称 row 的 `*RowsCommandHandler`）**

每个文件结构相同，只换 op/event/方法名。`MoveColsCommandHandler.ts`：

```typescript
import type { GridEventPipeline } from '../event/GridEventPipeline'
import type { ColumnCommands } from './ColumnStructure'
import type { ColumnsMoved } from './ColumnEvent'
import type { MoveColsOperation } from './ColumnOperation'

/** 执行 moveCols operation，并把 column 领域产出的事件交给内部事件管线。 */
export class MoveColsCommandHandler {
  constructor(
    private readonly cols: ColumnCommands,
    private readonly events: Pick<GridEventPipeline, 'dispatch'>,
  ) {}

  execute(operation: MoveColsOperation): ColumnsMoved | null {
    const event = this.cols.moveCols(operation)
    if (!event) return null
    this.events.dispatch(event)
    return event
  }
}
```

其余 4 个同构：
- `InsertColsCommandHandler` → `cols.insertCols` / `ColumnsInserted` / `InsertColsOperation`
- `DeleteColsCommandHandler` → `cols.deleteCols` / `ColumnsDeleted` / `DeleteColsOperation`
- `HideColsCommandHandler` → `cols.hideCols` / `ColumnsHidden` / `HideColsOperation`
- `UnhideColsCommandHandler` → `cols.unhideCols` / `ColumnsUnhidden` / `UnhideColsOperation`

- [ ] **Step 2: 扩 `FormatEventHandler` 列分支**

把 `FormatEventHandlerContext` 增列写入面，并填实 switch 里现有的 `columnsInserted`/`columnsDeleted`/`columnsMoved` no-op 分支（`columnsHidden`/`columnsUnhidden` 仍 no-op——隐藏不改 raw 坐标，format/merge 按 raw 键控）：

```typescript
export interface FormatEventHandlerContext {
  remapFormatRows(indexMap: ReadonlyMap<number, number>): void
  remapMergeRows(indexMap: ReadonlyMap<number, number>): void
  remapFormatAfterRowsInserted(at: number, count: number): void
  remapMergeAfterRowsInserted(at: number, count: number): void
  remapFormatAfterRowsDeleted(rowIds: readonly number[]): void
  remapMergeAfterRowsDeleted(rowIds: readonly number[]): void
  remapFormatCols(indexMap: ReadonlyMap<number, number>): void
  remapMergeCols(indexMap: ReadonlyMap<number, number>): void
  remapFormatAfterColsInserted(at: number, count: number): void
  remapMergeAfterColsInserted(at: number, count: number): void
  remapFormatAfterColsDeleted(colIndices: readonly number[]): void
  remapMergeAfterColsDeleted(colIndices: readonly number[]): void
}
```

switch 分支替换：

```typescript
      case 'columnsInserted':
        this.context.remapFormatAfterColsInserted(event.at, event.count)
        this.context.remapMergeAfterColsInserted(event.at, event.count)
        return
      case 'columnsDeleted':
        this.context.remapFormatAfterColsDeleted(event.removedIndices)
        this.context.remapMergeAfterColsDeleted(event.removedIndices)
        return
      case 'columnsMoved':
        this.context.remapFormatCols(event.indexMap)
        this.context.remapMergeCols(event.indexMap)
        return
      case 'columnsHidden':
      case 'columnsUnhidden':
        return
```

（store 侧方法已存在：`formatStore.remapAfterColsInserted/remapAfterColsDeleted/remapByColIndexMap`，`mergeStore` 同名；engine 构造 `FormatEventHandler` 时把这些回调接上——见 Task 4。）

- [ ] **Step 3: 写命令处理器单测（先红后绿）**

`ColumnCommandHandlers.test.ts`（对称 `RowCommandHandlers.test.ts`）：mock `ColumnCommands`，验证 execute 在有 event 时 dispatch、无 event（null）时不 dispatch：

```typescript
import { describe, expect, it } from 'bun:test'
import { InsertColsCommandHandler } from '../../../src/engine/column/InsertColsCommandHandler'
import { MoveColsCommandHandler } from '../../../src/engine/column/MoveColsCommandHandler'
import type { ColumnDomainEvent } from '../../../src/engine/column/ColumnEvent'
import type { ColumnCommands } from '../../../src/engine/column/ColumnStructure'

function makeCols(overrides: Partial<ColumnCommands>): ColumnCommands {
  return {
    insertCols: () => null,
    deleteCols: () => null,
    hideCols: () => null,
    unhideCols: () => null,
    moveCols: () => null,
    ...overrides,
  }
}

describe('Column command handlers', () => {
  it('dispatches the event returned by the column structure', () => {
    const dispatched: ColumnDomainEvent[] = []
    const events = { dispatch: (e: ColumnDomainEvent) => dispatched.push(e) }
    const cols = makeCols({
      insertCols: () => ({ kind: 'columnsInserted', at: 1, count: 1, newFields: [] }),
    })
    const event = new InsertColsCommandHandler(cols, events).execute({
      kind: 'insertCols', beforeFieldIndex: 1, count: 1,
    })
    expect(event?.kind).toBe('columnsInserted')
    expect(dispatched.length).toBe(1)
  })

  it('does not dispatch when the structure returns null', () => {
    const dispatched: ColumnDomainEvent[] = []
    const events = { dispatch: (e: ColumnDomainEvent) => dispatched.push(e) }
    new MoveColsCommandHandler(makeCols({}), events).execute({
      kind: 'moveCols', fieldIds: ['a'], beforeFieldId: null,
    })
    expect(dispatched.length).toBe(0)
  })
})
```

`FormatEventHandler.cols.test.ts`：mock `FormatEventHandlerContext`，dispatch 各列事件，断言对应 remap 被调用、`columnsHidden/Unhidden` 不调用。

Run（从 `packages/core`）：`bun test tests/engine/column/ColumnCommandHandlers.test.ts tests/engine/format/FormatEventHandler.cols.test.ts`
先红 → 实现后绿。

- [ ] **Step 4: lint + commit**

```bash
bun run lint
git add packages/core/src/engine/column/InsertColsCommandHandler.ts \
        packages/core/src/engine/column/DeleteColsCommandHandler.ts \
        packages/core/src/engine/column/HideColsCommandHandler.ts \
        packages/core/src/engine/column/UnhideColsCommandHandler.ts \
        packages/core/src/engine/column/MoveColsCommandHandler.ts \
        packages/core/src/engine/format/FormatEventHandler.ts \
        packages/core/tests/engine/column/ColumnCommandHandlers.test.ts \
        packages/core/tests/engine/format/FormatEventHandler.cols.test.ts
git commit -m "feat(core): 列命令处理器 + FormatEventHandler 扩列事件分支

列 operation 经命令处理器 dispatch 列事件入管线;FormatEventHandler 填实
columnsInserted/Deleted/Moved 的 format/merge remap(hidden 不改 raw 坐标,no-op)。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> 仍处过渡红窗（engine 未接线）。

---

## Task 4：`DefaultGridEngine` 接线到列聚合根（关闭红窗，原子提交）

**Files:**
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`

> 原子单元：删 `rawColsAxis`/`hiddenColIds`/`newFieldCounter` 字段会一次性打断所有引用。各 Step 有序局部替换；只在最后的全量验证 Step 跑全量 typecheck + test。
> **统一替换基调**：列门面方法瘦成「快照 → `xColsCommand.execute(op)` → frozen 同步 + `rebuildViewColsAxis()` + selection remap + `undoStack.push`」；format/merge remap 由 command.execute 经管线完成（**删除门面里内联的 `formatStore/mergeStore.remap*Cols*` 调用**）。undo/redo 列分支：raw 列状态变迁调聚合根逆变迁；`frozen.setFrozen`/`selection.setSelection`/`formatStore.restore`/`mergeStore.restore`/`rebuildViewColsAxis()` 保留。

- [ ] **Step 1: 字段与构造**

- 删字段 `private rawColsAxis: ChunkedAxis`、`private hiddenColIds = new Set<string>()`、`private newFieldCounter = 0`（及相关 TSDoc）。
- 加字段（声明，构造期赋值）：`private readonly columnStructure: DefaultColumnStructure` + 5 个 `private readonly xColsCommand: XColsCommandHandler`。
- 构造函数：在 `this.rowStructure = ...` 之后插入
  ```typescript
  this.columnStructure = new DefaultColumnStructure(this.rawData, () => this.averageColWidth())
  this.insertColsCommand = new InsertColsCommandHandler(this.columnStructure, this.eventPipeline)
  this.deleteColsCommand = new DeleteColsCommandHandler(this.columnStructure, this.eventPipeline)
  this.hideColsCommand = new HideColsCommandHandler(this.columnStructure, this.eventPipeline)
  this.unhideColsCommand = new UnhideColsCommandHandler(this.columnStructure, this.eventPipeline)
  this.moveColsCommand = new MoveColsCommandHandler(this.columnStructure, this.eventPipeline)
  ```
- `FormatEventHandler` 构造（`eventPipeline` 字段初始化器里）补列回调：
  ```typescript
  remapFormatAfterColsInserted: (at, count) => this.formatStore.remapAfterColsInserted(at, count),
  remapMergeAfterColsInserted: (at, count) => this.mergeStore.remapAfterColsInserted(at, count),
  remapFormatAfterColsDeleted: (idx) => this.formatStore.remapAfterColsDeleted([...idx].sort((a, b) => a - b)),
  remapMergeAfterColsDeleted: (idx) => this.mergeStore.remapAfterColsDeleted([...idx].sort((a, b) => a - b)),
  remapFormatCols: (m) => this.formatStore.remapByColIndexMap(m),
  remapMergeCols: (m) => this.mergeStore.remapByColIndexMap(m),
  ```
  > `eventPipeline` 是字段初始化器、`columnStructure` 在构造体赋值——回调是 lazy arrow，引用 `this.formatStore`/`this.mergeStore`（字段初始化器，先于构造体）即可，不依赖 `columnStructure`，无时序问题。但 5 个 command handler 依赖 `columnStructure`，必须在构造体内、`columnStructure` 之后构造（已如上）。
- 构造/`rebuildData` 中：删 `this.rawColsAxis = new ChunkedAxis({...averageColWidth})`、`this.colsAxis = this.buildViewColsAxis()`、`this.applyFieldWidths()`、`this.data = this.wrapViewData(...)` 等列相关行，替换为：
  ```typescript
  this.columnStructure.rebuild(this.rawData, () => this.averageColWidth())
  this.data = this.columnStructure.getColViewData(this.rowStructure.getRowViewData())
  this.colsAxis = this.columnStructure.getViewColsAxis()
  ```
  （`rebuild` 已含 `applyFieldWidths` 的从 `field.width` 回填逻辑，故 `applyFieldWidths()` 删除；`wrapViewData` 私有方法删除。）

- [ ] **Step 2: setData / coords / 派生读 委托**

- `setData`：`this.hiddenColIds.clear()` → `this.columnStructure.clearHidden()`；`this.newFieldCounter = 0` → `this.columnStructure.resetNewFieldCounter()`。
- `CoordinateSpace` 构造：`isColHidden: (id) => this.hiddenColIds.has(id)` → `isColHidden: (id) => this.columnStructure.isColHidden(id)`。
- `getFrame` 里 `this.computeCollapsedColGaps()` → `this.columnStructure.getCollapsedColGaps()`（保留 engine 给 gap 补 `xPx` 的后续逻辑）。
- `getHiddenCols()` → `return this.columnStructure.getHiddenCols()`。
- `getRawColumnIndex(fieldId)`：保留（仍由 `coords.fieldIdToRaw`），engine 内部多处用它；coords 不变。
- 删私有方法 `buildViewColsAxis`、`computeCollapsedColGaps`、`makeColGap`、`wrapViewData`、`applyFieldWidths`、`normalizeMoveCols`、`isContiguousFieldGroup`、`captureRawColWidths`、`buildColIndexMap`、`rebuildRawColsAxisFromWidths`、`resolveDefaultColWidth`、`setFieldWidth`（这些迁入聚合根/Rules）。`rebuildViewColsAxis` **保留**（改读聚合根，见 Step 3）；`averageColWidth` **保留**（注入用）；`syncFrozenAfterColInsert`/`syncFrozenAfterColDelete` **保留**（frozen 跨两轴）。`restoreSelectionByVisibleFieldIds` **保留**（selection）。

- [ ] **Step 3: `rebuildViewColsAxis` 读聚合根**

`rebuildViewColsAxis()` 体内 `this.colsAxis = this.buildViewColsAxis()` → `this.colsAxis = this.columnStructure.getViewColsAxis()`。其余（重建 frozen/viewport）不变。

- [ ] **Step 4: 列门面方法瘦身**

逐个改写（读真实源码）：

- `insertCols(beforeFieldIndex, count)`：删内部建 field/`insertField`/`rawColsAxis.insertRange` 与内联 `formatStore/mergeStore/selection.remapAfterColsInserted`。改为：快照 `selectionBefore/formatBefore/mergeBefore/frozenBefore` → `const event = this.insertColsCommand.execute({ kind:'insertCols', beforeFieldIndex, count })`；`if (!event) return []`；`this.syncFrozenAfterColInsert(event.at, event.count)`；`this.rebuildViewColsAxis()`；`this.selection.remapAfterColsInserted(event.at, event.count)`；`selectionAfter`/`frozenAfter` 快照；`this.undoStack.push({ kind:'insertCols', at: event.at, count: event.count, newFields: event.newFields, selectionBefore, selectionAfter, frozenBefore, frozenAfter, formatBefore, formatAfter: this.formatStore.snapshot(), mergeBefore, mergeAfter: this.mergeStore.snapshot() })`；`return event.newFields`。
- `deleteCols(fieldIds)`：改为快照 → `const event = this.deleteColsCommand.execute({ kind:'deleteCols', fieldIds })`；`if (!event) return []`；`this.syncFrozenAfterColDelete(event.removedIndices, <totalColsBefore>)`。**注意 totalColsBefore**：现状用 `schemaBefore.length`（删除前列数）。聚合根删完后 schema 已变，故门面需在 execute **前**取 `const totalColsBefore = this.rawData.getSchema().fields.length` 传给 syncFrozen。其余 `rebuildViewColsAxis` + `selection.remapAfterColsDeleted(event.removedIndices)` + undo push（`snapshots: event.snapshots, deletedWidths: event.deletedWidths`）+ `return event.snapshots`。
- `hideCols(fieldIds)`：快照 selectionBefore → `const event = this.hideColsCommand.execute({ kind:'hideCols', fieldIds })`；`if (!event) return`；`rebuildViewColsAxis` + selectionAfter + undo push(`fieldIds: event.fieldIds`)。
- `unhideCols(fieldIds)`：同构（`unhideColsCommand`）。
- `moveCols(fieldIds, beforeFieldId)`：`if (!isMutableDataSource(this.rawData) || !this.rawData.moveFields) return false`；`this.finishActiveEdit()`；快照 `selectionBefore/formatBefore/mergeBefore` + `const visibleFieldIdsBefore = this.data.getSchema().fields.map(f=>f.id)`；`const event = this.moveColsCommand.execute({ kind:'moveCols', fieldIds, beforeFieldId })`；`if (!event) return false`；`this.rebuildViewColsAxis()`；`this.restoreSelectionByVisibleFieldIds(selectionBefore, visibleFieldIdsBefore)`；undo push（`fieldIds: event.fieldIds, beforeFieldId: event.beforeFieldId, inverseBeforeFieldId: event.inverseBeforeFieldId`，format/merge before+after）；`return true`。
- `setColumnWidths(fieldIds, widthPx)`（resize 直走聚合根）：`oldWidths` = 各 id `this.columnStructure.getColWidth(this.getRawColumnIndex(id))`，过滤 `idx<0`；`this.columnStructure.setColWidthsMulti(changed, widthPx)`；空则 return；`rebuildViewColsAxis` + selection + undo push（不变）。
- `commitColumnResize(colIndex, oldWidth, newWidth)`：`rawColIndex = this.getRawColumnIndexForViewIndex(colIndex)`（保留，coords）；`if (rawColIndex<0) return`；`this.columnStructure.setColWidth(rawColIndex, newWidth)`（聚合根内已写 field.width，删门面里 `field.width = newWidth`）；`rebuildViewColsAxis` + undo push（不变）。
- `getFrozenConfig()`：不变（frozen 仍 engine）。

- [ ] **Step 5: undo（`applyUndo`）列分支**

替换 raw 列状态变迁，保留 frozen/selection/format-merge-restore/rebuildViewColsAxis：

- `resizeColumn`：`this.rawColsAxis.setSize(cmd.colIndex, cmd.before)` + 取 field + `field.width = cmd.before` → `this.columnStructure.setColWidth(cmd.colIndex, cmd.before)`（聚合根写 field.width）；保留 `rebuildViewColsAxis`。
- `insertCols`：`this.unapplyInsertCols(cmd)` → 改为 `this.columnStructure.removeFieldsByIds(cmd.newFields.map(f=>f.id))` + `this.frozen.setFrozen(cmd.frozenBefore)` + `this.rebuildViewColsAxis()` + `this.selection.setSelection(cmd.selectionBefore)`；保留其后 `formatStore.restore(cmd.formatBefore)` + `mergeStore.restore(cmd.mergeBefore)`。（删 `unapplyInsertCols` 私有方法。）
- `deleteCols`：`this.unapplyDeleteCols(cmd)` → `this.columnStructure.reinsertDeletedCols(cmd.snapshots, cmd.deletedWidths)` + `this.frozen.setFrozen(cmd.frozenBefore)` + `rebuildViewColsAxis` + `selection.setSelection(cmd.selectionBefore)`；保留 format/merge restore。（删 `unapplyDeleteCols`。）
- `hideCols`：`for id: this.hiddenColIds.delete(id)` → `this.columnStructure.removeHidden(cmd.fieldIds)`；保留 rebuildViewColsAxis + selection。
- `unhideCols`：`for id: this.hiddenColIds.add(id)` → `this.columnStructure.addHidden(cmd.fieldIds)`。
- `resizeColumnsMulti`：循环 `getRawColumnIndex + rawColsAxis.setSize(oldWidths) + setFieldWidth` → `for (let i=0;i<cmd.fieldIds.length;i++){ this.columnStructure.setColWidthById(cmd.fieldIds[i]!, cmd.oldWidths[i] ?? this.columnStructure.getDefaultColWidth()) }`；保留 rebuildViewColsAxis + selection。
- `moveCols`：`applyMoveColsCommand(cmd.inverseBeforeFieldId 路径)` —— 见 Step 7（`applyMoveColsCommand` 改写）。

- [ ] **Step 6: redo（`applyRedo`）列分支**

- `resizeColumn`：`rawColsAxis.setSize(cmd.colIndex, cmd.after)` + field.width → `this.columnStructure.setColWidth(cmd.colIndex, cmd.after)`；保留 rebuildViewColsAxis。
- `insertCols`：`this.applyInsertCols(cmd)` → `this.columnStructure.insertFieldsAt(cmd.at, cmd.newFields, cmd.newFields.map(f=>f.width))` + `this.frozen.setFrozen(cmd.frozenAfter)` + `rebuildViewColsAxis` + `selection.setSelection(cmd.selectionAfter)`；保留 format/merge restore。（删 `applyInsertCols`。）
- `deleteCols`：`this.applyDeleteCols(cmd)` → `this.columnStructure.removeFieldsByIds(cmd.snapshots.map(s=>s.field.id))` + `this.frozen.setFrozen(cmd.frozenAfter)` + `rebuildViewColsAxis` + `selection.setSelection(cmd.selectionAfter)`；保留 format/merge restore。（删 `applyDeleteCols`。）
- `hideCols`：`hiddenColIds.add` → `this.columnStructure.addHidden(cmd.fieldIds)`。
- `unhideCols`：`hiddenColIds.delete` → `this.columnStructure.removeHidden(cmd.fieldIds)`。
- `resizeColumnsMulti`：循环 → `for (const id of cmd.fieldIds) this.columnStructure.setColWidthById(id, cmd.newWidth)`；保留 rebuildViewColsAxis + selection。
- `moveCols`：见 Step 7。

- [ ] **Step 7: `applyMoveColsCommand` 改写**

`applyMoveColsCommand(fieldIds, beforeFieldId, selection)`（源 `1319-1332`）改为经 command + 聚合根：

```typescript
private applyMoveColsCommand(
  fieldIds: readonly string[],
  beforeFieldId: string | null,
  selection: GridSelection,
): void {
  if (!isMutableDataSource(this.rawData) || !this.rawData.moveFields) return
  const visibleFieldIdsBefore = this.data.getSchema().fields.map((f) => f.id)
  const event = this.moveColsCommand.execute({ kind: 'moveCols', fieldIds, beforeFieldId })
  if (!event) return
  this.rebuildViewColsAxis()
  this.restoreSelectionByVisibleFieldIds(selection, visibleFieldIdsBefore)
}
```

> 注意：原 `applyMoveColsCommand` 用 `this.selection.setSelection(selection)`（undo/redo 直接还原快照），而正向 `moveCols` 用 `restoreSelectionByVisibleFieldIds`。这里 undo/redo 路径**保持原状**——即仍用 `this.selection.setSelection(selection)`，**不要**改成 `restoreSelectionByVisibleFieldIds`。修正上面代码块为：
> ```typescript
>   const event = this.moveColsCommand.execute({ kind: 'moveCols', fieldIds, beforeFieldId })
>   if (!event) return
>   this.rebuildViewColsAxis()
>   this.selection.setSelection(selection)
> ```
> （删掉 visibleFieldIdsBefore 行。format/merge 由 command 经管线 remap；但 undo/redo 的 moveCols 分支随后还有 `formatStore.restore(cmd.formatBefore/After)` 覆盖——与现状一致：现状 `applyMoveColsCommand` 内 remapByColIndexMap 后，外层 moveCols undo 分支再 `formatStore.restore`。新流程 command 经管线 remap 后同样被外层 restore 覆盖，行为等价。）

- [ ] **Step 8: 清理 import + 残留引用**

删除不再使用的 import（如 `FrozenConfig` 若仅 ColumnStructureContext 用过——核对）；确认 `VisibleColumnsDataSource` 的 import 删除（已迁入聚合根，engine 不再直接用）；grep 确认 `this.rawColsAxis`、`this.hiddenColIds`、`this.newFieldCounter`、`this.buildViewColsAxis`、`this.wrapViewData`、`this.applyFieldWidths`、`this.computeCollapsedColGaps`、`this.applyInsertCols`、`this.unapplyInsertCols`、`this.applyDeleteCols`、`this.unapplyDeleteCols` 在 `DefaultGridEngine.ts` 中**零残留**。

- [ ] **Step 9: 全量验证**

- `bun run --filter '*' typecheck` → 0 错误。
- `bun test` → 全绿（尤其 engine 列行为测试：insertCols/deleteCols/hideCols/unhideCols/moveCols、列宽 resize、undo/redo、frozen 同步、setData/setViewData）。失败逐条对照 Step 4–7 映射；语义不符 STOP 询问，勿改测试期望。
- `bun run lint` → 0/0。

- [ ] **Step 10: commit**

```bash
git add packages/core/src/engine/DefaultGridEngine.ts
git commit -m "refactor(core): DefaultGridEngine 接线到 DefaultColumnStructure 聚合根

删除 rawColsAxis/hiddenColIds/newFieldCounter 字段,列门面瘦身为
快照→command.execute→frozen 同步+selection remap+undo;format/merge 列 remap
走 eventPipeline;undo/redo 列分支委托聚合根逆变迁。frozen(跨两轴)/selection/undo
编排保留。恢复全量 typecheck + test 绿。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5：文档与最终回归

**Files:**
- Modify: `packages/core/src/engine/column/README.md`、`packages/core/src/engine/README.md`

- [ ] **Step 1: 更新 `column/README.md`**

对照 `row/README.md` 结构改写：列领域现含 operation/event/rules/structure/命令处理器；`DefaultColumnStructure` 自持 `rawColsAxis` + `hiddenColIds` + 列隐藏视图包装；仅注入 raw `MutableDataSource` 引用 + `resolveDefaultColWidth`；frozen（跨两轴）/selection/undo/viewport 由 `DefaultGridEngine` 编排；已删除 `ColumnStructureContext`。

- [ ] **Step 2: 更新 `engine/README.md` 重构总进度**

把第 3 步 column 状态从 🟡 改为 ✅，说明：已建 `DefaultColumnStructure` 并内化 `rawColsAxis`+`hiddenColIds`，删 `ColumnStructureContext`（对称 row）。下一步候选改为「接线 undo replay（第 5 步）」或「selection remap 抽离（第 4 步）」。

- [ ] **Step 3: 四项全绿验证**

```bash
bun run lint && bun run --filter '*' typecheck && bun test && \
bun run --filter @novasheet/core build && \
bun run --filter @novasheet/web-canvas2d build && \
bun run --filter @novasheet/web build
```
Expected: 全 PASS。（build 顺序 core 先，产出 `.d.ts` 供 web 消费。）

- [ ] **Step 4: commit**

```bash
git add packages/core/src/engine/column/README.md packages/core/src/engine/README.md
git commit -m "docs(core): 更新列领域 README 与 engine 重构进度(第3步完成)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review 笔记

- **Spec 覆盖**：所有权迁移（Task 2 自持 + Task 4 删字段）、富接口+ColumnCommands（Task 2）、operation/event/rules（Task 1）、命令处理器+FormatEventHandler 列分支（Task 3）、列宽直走（Task 2 width 方法 + Task 4 Step 4）、frozen 留 engine（Task 4 syncFrozen 保留）、undo 逆变迁内化（Task 2 + Task 4 Step 5/6/7）、派生读（Task 2）、setData/setViewData 语义（Task 4 Step 1/2）、删死 context（Task 2 Step 2）、文档（Task 5）——均有对应任务。
- **命名一致**：列事件统一 `columns*` kind + `indexMap`，re-export 自 `column/ColumnEvent.ts`（Task 1 Step 2/2b）；接口 `ColumnStructure`/`ColumnCommands`/`DefaultColumnStructure`；方法名跨任务一致（`getColWidth`/`setColWidth`/`setColWidthById`/`setColWidthsMulti`/`getDefaultColWidth`/`getViewColsAxis`/`getColViewData`/`getHiddenCols`/`isColHidden`/`getRawColumnIndex`/`getCollapsedColGaps`/`insertFieldsAt`/`removeFieldsByIds`/`reinsertDeletedCols`/`addHidden`/`removeHidden`/`resetNewFieldCounter`）。
- **过渡红窗**：Task 1–3 建文件，Task 4 原子提交关闭——已在头部与各 Task 标注。
- **load-bearing 抽取**：normalizeMoveCols/buildColIndexMap/captureRawColWidths/rebuildRawColsAxisFromWidths/buildViewColsAxis/computeCollapsedColGaps/makeColGap/applyInsertCols/unapplyInsertCols/applyDeleteCols/unapplyDeleteCols 给出源行范围 + 替换规则，实现者读真实源码迁移。
