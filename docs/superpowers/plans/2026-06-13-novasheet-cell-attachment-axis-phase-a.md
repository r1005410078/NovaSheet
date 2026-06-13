# Cell Attachment 数据轴（Phase A）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 core 加一条语义无关的 per-cell 附件数据轴 `CellAttachmentStore`，让扩展（首消费者 rich-text，在 Phase C）能把不属于 value 的私有数据挂在格上，并随 sort/fill/插删行正确跟随。

**Architecture:** 镜像 `RangeStyleStore` 的成熟模式——raw 行列键控、复用 `kernel/coords/remap` 的 `remapSpan*` 原语、作 `DefaultFormatState` 第三兄弟 store、snapshot/restore 供 undo、经 `FormatController` 写门面 + `FormatEventHandler` 结构 remap 接线。core 只存 opaque 数据 + 调注册的 codec，永不识别 `TextRun` 语义。

**Tech Stack:** TypeScript（strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`）、`bun:test`、MBD scenarios（`@novasheet/mbd`）。

**前置 spec:** [`docs/superpowers/specs/2026-06-13-novasheet-cell-kit-rich-text-design.md`](../specs/2026-06-13-novasheet-cell-kit-rich-text-design.md) §5（附件数据轴）。本 plan 只做 Phase A；Phase B（canvas2d styled-text）/ Phase C（cell-kit rich-text）各自后续成 plan。

**方法论:** BDD 外环 × TDD 内环（[`2026-06-10-novasheet-bdd-tdd-method-design.md`](../specs/2026-06-10-novasheet-bdd-tdd-method-design.md)）。Task 1 = 让外环行为测试存在并红（BDD gate 场景定稿）；其余 = TDD 内环。**plan-risk（须 STOP+ASK，勿静默选）:** 点 cell remap 的 off-by-one（insert 用 `>=at` 右移、delete 丢被删格、reorder 用 indexMap）必须与 `RangeStyleStore` 行为逐字一致——若测试期望与 `RangeStyleStore` 既有 remap 语义矛盾，先停。

---

## File Structure

| 文件 | 责任 | 动作 |
| --- | --- | --- |
| `packages/core/src/kernel/protocol/AttachmentTypes.ts` | `CellAttachmentCodec` / `CellAttachmentSnapshot` 协议类型 | Create |
| `packages/core/src/features/attachment/CellAttachmentStore.ts` | per-cell raw-key 附件存储 + 点 cell remap + snapshot/restore | Create |
| `packages/core/src/features/attachment/README.md` | 领域导航（对齐 format/README.md 风格） | Create |
| `packages/core/src/features/format/FormatState.ts` | 加 `attachmentStore` 第三兄弟 + restore/remap 委派面 | Modify |
| `packages/core/src/features/format/FormatEventHandler.ts` | 结构事件同时 remap 附件 | Modify |
| `packages/core/src/features/format/FormatController.ts` | 加 `setCellAttachment` 写门面（snapshot+pushUndo） | Modify |
| `packages/core/src/features/format/FormatUndoHandler.ts` | undo `attachmentBefore/After` restore 分支 | Modify |
| `packages/core/src/kernel/undo/...`（`UndoCommand` 定义处） | `format` undo command 加可选 attachment 快照字段 | Modify |
| `packages/core/src/engine/DefaultGridEngine.ts` | `setCellAttachment` + `getCellAttachment` + 注册 codec + undo 快照带上 attachment | Modify |
| `packages/core/src/Grid.ts` | `GridOptions.cellAttachments` + `Grid.setCellAttachment`/`getCellAttachment` 门面 | Modify |
| `packages/core/src/index.ts` | re-export `CellAttachmentCodec` 等公开类型 | Modify |
| `packages/core/tests/features/attachment/CellAttachmentStore.test.ts` | store 单元 TDD | Create |
| `packages/core/tests/acceptance/contract/plugin-api/scenarios/cell-attachment.md` 等 | BDD 场景（L0/L1/L2） | Create |
| `packages/core/tests/acceptance/contract/plugin-api/bdd.test.ts`（或就近 e2e/grid） | 场景执行 | Create/Modify |
| `packages/core/tests/acceptance/scenarios.manifest.json` | 机读清单加条目 | Modify |

> 注：`UndoCommand` 的确切定义文件由实现者 `grep -rn "kind: 'format'" packages/core/src` 定位（`FormatUndoHandler.ts` import 它）；本 plan 在 Task 5 给出修改形状。

---

## Task 1: BDD gate — 附件轴场景定稿（外环红）

**Files:**
- Create: `packages/core/tests/acceptance/contract/plugin-api/scenarios/cell-attachment-store.md`
- Create: `packages/core/tests/acceptance/contract/plugin-api/scenarios/cell-attachment-structural.md`
- Create: `packages/core/tests/acceptance/contract/plugin-api/bdd.test.ts`
- Modify: `packages/core/tests/acceptance/scenarios.manifest.json`

- [ ] **Step 1: 写场景 MD（外环契约）**

`cell-attachment-store.md`：

```markdown
---
id: core.L2.cell-attachment-store-set-get-undo
layer: L2
summary: 经 Grid 门面写/读 per-cell 附件并可撤销
tags: [grid, attachment, plugin-api, undo]
status: planned
---

## User Story

作为单元格扩展作者，我希望经公开 `Grid.setCellAttachment` 把任意私有数据挂到某个 raw cell 上、能读回，并且写入可被 undo/redo，从而无需污染 core 也能承载非值数据。

## Given

- 一个 mounted Grid，注册了 namespace `demo` 的 codec
- 4 行 number 列数据

## When

- `grid.setCellAttachment('demo', 1, 0, { note: 'x' })`

## Then

- `grid.getCellAttachment('demo', 1, 0)` 返回 `{ note: 'x' }`
- `grid.undo()` 后该格附件为 `undefined`
- `grid.redo()` 后该格附件恢复 `{ note: 'x' }`
```

`cell-attachment-structural.md`：

```markdown
---
id: core.L1.cell-attachment-follows-row-insert
layer: L1
summary: 插入行后附件跟随 raw cell 下移
tags: [grid, attachment, structural, remap]
status: planned
---

## User Story

作为单元格扩展作者，当用户在附件所在行之前插入行时，我希望附件跟随它所属的 raw cell 一起下移，不错位、不丢失。

## Given

- 一个 mounted Grid，注册 namespace `demo`
- 在 raw cell (row=2,col=0) 设了附件 `{ note: 'y' }`

## When

- 在 row=0 前插入 1 行

## Then

- `grid.getCellAttachment('demo', 3, 0)` 返回 `{ note: 'y' }`
- `grid.getCellAttachment('demo', 2, 0)` 返回 `undefined`
```

- [ ] **Step 2: 加 manifest 条目**

把两条 scenario 的 `id`/`layer`/相对路径加进 `scenarios.manifest.json`（照该文件既有条目格式补；运行 `bun run --filter @novasheet/mbd mbd manifest` 可自动同步，再核对 diff）。

- [ ] **Step 3: 写外环行为测试（应红——API 未实现）**

`bdd.test.ts`：

```ts
import { describe, expect, it } from 'bun:test'
import { Grid, type CellAttachmentCodec } from '../../../../src'
import { createDenseData, mountRecordingGrid, withManualRaf } from '../../_helpers/fixtures'

const demoCodec: CellAttachmentCodec<{ note: string }> = {
  namespace: 'demo',
  serialize: (d) => JSON.stringify(d),
  deserialize: (t) => JSON.parse(t) as { note: string },
}

describe('Core acceptance cell-attachment', () => {
  it('core.L2.cell-attachment-store-set-get-undo round-trips and undoes', () => {
    withManualRaf((raf) => {
      const { grid } = mountRecordingGrid({ data: createDenseData(), cellAttachments: [demoCodec] }, raf)
      grid.setCellAttachment('demo', 1, 0, { note: 'x' })
      expect(grid.getCellAttachment('demo', 1, 0)).toEqual({ note: 'x' })
      grid.undo()
      expect(grid.getCellAttachment('demo', 1, 0)).toBeUndefined()
      grid.redo()
      expect(grid.getCellAttachment('demo', 1, 0)).toEqual({ note: 'x' })
      grid.destroy()
    })
  })

  it('core.L1.cell-attachment-follows-row-insert shifts with raw cell', () => {
    withManualRaf((raf) => {
      const { grid } = mountRecordingGrid({ data: createDenseData(), cellAttachments: [demoCodec] }, raf)
      grid.setCellAttachment('demo', 2, 0, { note: 'y' })
      grid.insertRows(0, 1)
      expect(grid.getCellAttachment('demo', 3, 0)).toEqual({ note: 'y' })
      expect(grid.getCellAttachment('demo', 2, 0)).toBeUndefined()
      grid.destroy()
    })
  })
})
```

> 实现者注：`mountRecordingGrid` 的确切签名以 `_helpers/fixtures.ts` 为准（Task 1 先 `grep -n "export function mountRecordingGrid" packages/core/tests/acceptance/_helpers/fixtures.ts` 对齐参数顺序与是否需 `backend`）。`insertRows` 的确切名以 `Grid.ts` 既有方法为准（`grep -n "insertRows\|insertRowsAt" packages/core/src/Grid.ts`）。

- [ ] **Step 4: 跑测试，确认红**

Run: `bun test packages/core/tests/acceptance/contract/plugin-api/bdd.test.ts`
Expected: FAIL（`CellAttachmentCodec` 未导出 / `setCellAttachment` is not a function）。

- [ ] **Step 5: Commit**

```bash
git add packages/core/tests/acceptance/contract/plugin-api packages/core/tests/acceptance/scenarios.manifest.json
git commit -m "test(attachment): BDD gate 附件轴场景定稿（外环红）

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `CellAttachmentStore`（镜像 RangeStyleStore）

**Files:**
- Create: `packages/core/src/kernel/protocol/AttachmentTypes.ts`
- Create: `packages/core/src/features/attachment/CellAttachmentStore.ts`
- Test: `packages/core/tests/features/attachment/CellAttachmentStore.test.ts`

- [ ] **Step 1: 写协议类型**

`AttachmentTypes.ts`：

```ts
/** 扩展注册的 per-cell 附件 namespace + 序列化器（clipboard / 持久化用）。core 不识别 T 的语义。 */
export interface CellAttachmentCodec<T> {
  readonly namespace: string
  serialize(data: T): string
  deserialize(text: string): T | undefined
}

/** 单个 raw cell 上的全部 namespace 附件（namespace → opaque data）。 */
export type CellAttachmentMap = ReadonlyMap<string, unknown>

/** 整个附件存储的可序列化快照（供 undo restore）。 */
export interface CellAttachmentEntry {
  readonly row: number
  readonly col: number
  readonly namespace: string
  readonly data: unknown
}
export type CellAttachmentSnapshot = readonly CellAttachmentEntry[]
```

- [ ] **Step 2: 写失败测试（store 单元）**

`CellAttachmentStore.test.ts`：

```ts
import { describe, expect, it } from 'bun:test'
import { CellAttachmentStore } from '../../../src/features/attachment/CellAttachmentStore'

describe('CellAttachmentStore', () => {
  it('set/get round-trips per namespace and cell', () => {
    const s = new CellAttachmentStore()
    s.set('demo', 2, 0, { note: 'y' })
    expect(s.get('demo', 2, 0)).toEqual({ note: 'y' })
    expect(s.get('demo', 2, 1)).toBeUndefined()
    expect(s.get('other', 2, 0)).toBeUndefined()
  })

  it('set undefined clears the entry', () => {
    const s = new CellAttachmentStore()
    s.set('demo', 1, 1, 5)
    s.set('demo', 1, 1, undefined)
    expect(s.get('demo', 1, 1)).toBeUndefined()
  })

  it('snapshot/restore preserves all entries', () => {
    const s = new CellAttachmentStore()
    s.set('demo', 1, 0, 'a')
    s.set('demo', 3, 2, 'b')
    const snap = s.snapshot()
    s.set('demo', 1, 0, 'changed')
    s.restore(snap)
    expect(s.get('demo', 1, 0)).toBe('a')
    expect(s.get('demo', 3, 2)).toBe('b')
  })

  it('remapAfterRowsInserted shifts rows >= at down (mirrors RangeStyleStore)', () => {
    const s = new CellAttachmentStore()
    s.set('demo', 2, 0, 'y')
    s.remapAfterRowsInserted(0, 1)
    expect(s.get('demo', 3, 0)).toBe('y')
    expect(s.get('demo', 2, 0)).toBeUndefined()
  })

  it('remapAfterRowsDeleted drops deleted cell and shifts survivors up', () => {
    const s = new CellAttachmentStore()
    s.set('demo', 1, 0, 'gone')
    s.set('demo', 3, 0, 'keep')
    s.remapAfterRowsDeleted([1])
    expect(s.get('demo', 1, 0)).toBeUndefined() // 'gone' deleted
    expect(s.get('demo', 2, 0)).toBe('keep')    // 3 -> 2
  })
})
```

- [ ] **Step 3: 跑测试确认红**

Run: `bun test packages/core/tests/features/attachment/CellAttachmentStore.test.ts`
Expected: FAIL（模块不存在）。

- [ ] **Step 4: 实现 store**

`CellAttachmentStore.ts`（点 cell 复用 `remapSpan*` 原语，逐字对齐 `RangeStyleStore` 的 insert/delete/reorder 语义）：

```ts
import {
  remapSpanAfterDelete,
  remapSpanAfterInsert,
  remapSpanByIndexMap,
} from '../../kernel/coords/remap'
import type { CellAttachmentSnapshot } from '../../kernel/protocol/AttachmentTypes'

/** per-cell raw-key 附件存储。语义无关：core 不解释 data。键控与 remap 与 RangeStyleStore 一致。 */
export class CellAttachmentStore {
  /** rawRow -> rawCol -> namespace -> data */
  private cells = new Map<number, Map<number, Map<string, unknown>>>()

  get<T>(namespace: string, rawRow: number, rawCol: number): T | undefined {
    return this.cells.get(rawRow)?.get(rawCol)?.get(namespace) as T | undefined
  }

  set<T>(namespace: string, rawRow: number, rawCol: number, data: T | undefined): void {
    if (data === undefined) {
      const ns = this.cells.get(rawRow)?.get(rawCol)
      ns?.delete(namespace)
      return
    }
    let row = this.cells.get(rawRow)
    if (!row) { row = new Map(); this.cells.set(rawRow, row) }
    let col = row.get(rawCol)
    if (!col) { col = new Map(); row.set(rawCol, col) }
    col.set(namespace, data)
  }

  snapshot(): CellAttachmentSnapshot {
    const out: { row: number; col: number; namespace: string; data: unknown }[] = []
    for (const [row, cols] of this.cells)
      for (const [col, ns] of cols)
        for (const [namespace, data] of ns) out.push({ row, col, namespace, data })
    return out
  }

  restore(snap: CellAttachmentSnapshot): void {
    this.cells = new Map()
    for (const e of snap) this.set(e.namespace, e.row, e.col, e.data)
  }

  getEntryCount(): number {
    let n = 0
    for (const cols of this.cells.values()) for (const ns of cols.values()) n += ns.size
    return n
  }

  remapAfterRowsInserted(at: number, count: number): void {
    if (count <= 0) return
    this.remapRows((r) => remapSpanAfterInsert({ start: r, end: r }, at, count)!.start)
  }
  remapAfterRowsDeleted(removedSorted: readonly number[]): void {
    if (removedSorted.length === 0) return
    this.remapRows((r) => remapSpanAfterDelete({ start: r, end: r }, removedSorted)?.start ?? null)
  }
  remapByRowIndexMap(indexMap: ReadonlyMap<number, number>): void {
    this.remapRows((r) => remapSpanByIndexMap({ start: r, end: r }, indexMap)?.start ?? null)
  }
  remapAfterColsInserted(at: number, count: number): void {
    if (count <= 0) return
    this.remapCols((c) => remapSpanAfterInsert({ start: c, end: c }, at, count)!.start)
  }
  remapAfterColsDeleted(removedSorted: readonly number[]): void {
    if (removedSorted.length === 0) return
    this.remapCols((c) => remapSpanAfterDelete({ start: c, end: c }, removedSorted)?.start ?? null)
  }
  remapByColIndexMap(indexMap: ReadonlyMap<number, number>): void {
    this.remapCols((c) => remapSpanByIndexMap({ start: c, end: c }, indexMap)?.start ?? null)
  }

  /** 重建外层（row）键；返回 null 的 cell 丢弃（被删行）。 */
  private remapRows(map: (row: number) => number | null): void {
    const snap = this.snapshot()
    this.cells = new Map()
    for (const e of snap) {
      const row = map(e.row)
      if (row !== null) this.set(e.namespace, row, e.col, e.data)
    }
  }
  private remapCols(map: (col: number) => number | null): void {
    const snap = this.snapshot()
    this.cells = new Map()
    for (const e of snap) {
      const col = map(e.col)
      if (col !== null) this.set(e.namespace, e.row, col, e.data)
    }
  }
}
```

> plan-risk：`remapSpanAfterInsert` 对单点 span 必回非 null（插入不删格），故 `!`；delete/reorder 可能删格故 `?? null`。若实测某点 cell remap 结果与同输入下 `RangeStyleStore` 的 layer remap 不一致，**STOP+ASK**。

- [ ] **Step 5: 跑测试确认绿**

Run: `bun test packages/core/tests/features/attachment/CellAttachmentStore.test.ts`
Expected: PASS（5 个用例全绿）。

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/kernel/protocol/AttachmentTypes.ts packages/core/src/features/attachment/CellAttachmentStore.ts packages/core/tests/features/attachment/CellAttachmentStore.test.ts
git commit -m "feat(attachment): CellAttachmentStore 镜像 RangeStyleStore 的 raw-key + remap

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 把 attachmentStore 接进 `FormatState` + 结构 remap

**Files:**
- Modify: `packages/core/src/features/format/FormatState.ts`
- Modify: `packages/core/src/features/format/FormatEventHandler.ts`
- Create: `packages/core/src/features/attachment/README.md`
- Test: `packages/core/tests/features/format/FormatEventHandler.test.ts`（加附件 remap 用例）

- [ ] **Step 1: 写失败测试**

在 `FormatEventHandler.test.ts` 加：构造 `DefaultFormatState`，在其 `attachmentStore` set 一格附件，触发 handler 的「插入行」事件，断言附件下移。（参照该文件既有 format remap 用例的事件触发方式。）

- [ ] **Step 2: 跑测试确认红**

Run: `bun test packages/core/tests/features/format/FormatEventHandler.test.ts`
Expected: FAIL（`formatState.attachmentStore` 不存在 / handler 未 remap 附件）。

- [ ] **Step 3: 扩 `FormatState`**

在 `FormatState` interface 与 `DefaultFormatState` 加：

```ts
// interface FormatState 增：
readonly attachmentStore: CellAttachmentStore
restoreAttachments(snap: CellAttachmentSnapshot): void
remapAttachmentRows(indexMap: ReadonlyMap<number, number>): void
remapAttachmentAfterRowsInserted(at: number, count: number): void
remapAttachmentAfterRowsDeleted(rowIds: readonly number[]): void
remapAttachmentCols(indexMap: ReadonlyMap<number, number>): void
remapAttachmentAfterColsInserted(at: number, count: number): void
remapAttachmentAfterColsDeleted(colIndices: readonly number[]): void
```

`DefaultFormatState` 增 `readonly attachmentStore = new CellAttachmentStore()` 与对应委派（与 `remapFormat*` 逐一并列，sort 同款 `[...ids].sort((a,b)=>a-b)`）。import `CellAttachmentStore` 与 `CellAttachmentSnapshot`。

- [ ] **Step 4: 在 `FormatEventHandler` 同步 remap 附件**

`FormatEventHandler` 现有每个结构事件分支（rows inserted/deleted/reorder、cols inserted/deleted/reorder）里，紧挨 `remapFormat*` 调用补一行对应 `remapAttachment*`（附件与 format 同生命周期、同事件、同顺序）。

- [ ] **Step 5: 跑测试确认绿**

Run: `bun test packages/core/tests/features/format/FormatEventHandler.test.ts`
Expected: PASS。

- [ ] **Step 6: 写 README + Commit**

`features/attachment/README.md`：一段说明（语义无关 per-cell 存储、raw-key、复用 format remap、codec 由 GridOptions 注册、首消费者 rich-text 在 cell-kit）。

```bash
git add packages/core/src/features/format/FormatState.ts packages/core/src/features/format/FormatEventHandler.ts packages/core/src/features/attachment/README.md packages/core/tests/features/format/FormatEventHandler.test.ts
git commit -m "feat(attachment): attachmentStore 接入 FormatState 并随结构事件 remap

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: undo — 写门面 `setCellAttachment` + restore 分支

**Files:**
- Modify: `packages/core/src/features/format/FormatController.ts`
- Modify: `packages/core/src/features/format/FormatUndoHandler.ts`
- Modify: `UndoCommand` 定义文件（`grep -rn "kind: 'format'" packages/core/src` 定位）
- Test: `packages/core/tests/features/format/FormatUndoHandler.test.ts`

- [ ] **Step 1: 写失败测试**

在 `FormatUndoHandler.test.ts` 加：构造 controller，`setCellAttachment('demo', r, c, data)`，断言 `attachmentStore.get` 命中；执行 undo command → 附件清空；redo → 恢复。（参照该文件 format undo 用例。）

- [ ] **Step 2: 跑测试确认红**

Run: `bun test packages/core/tests/features/format/FormatUndoHandler.test.ts`
Expected: FAIL。

- [ ] **Step 3: 扩 `UndoCommand` 的 format 分支**

`format` undo command 加可选附件快照字段（与 `formatBefore/After` 并列）：

```ts
// kind: 'format' 的 command 形状增（保持 optional 向后兼容现有 format undo 条目）：
readonly attachmentBefore?: CellAttachmentSnapshot
readonly attachmentAfter?: CellAttachmentSnapshot
```

- [ ] **Step 4: 写门面 + restore**

`FormatController` 加（对齐既有 `setFillColor` 的 snapshot+pushUndo 形状，但用 raw row/col 点写，不经 `translateRange`——附件 API 直接吃 raw 坐标）：

```ts
setCellAttachment<T>(namespace: string, rawRow: number, rawCol: number, data: T | undefined): boolean {
  const before = this.formatState.attachmentStore.snapshot()
  this.formatState.attachmentStore.set(namespace, rawRow, rawCol, data)
  const after = this.formatState.attachmentStore.snapshot()
  this.ctx.pushUndo({ kind: 'format', formatBefore: before2 /* 见下 */ })
  return true
}
```

> 实现细节：`format` undo command 必须带 `formatBefore/After`（现有字段，必填）。`setCellAttachment` 不动 formatStore，故 `formatBefore = formatAfter = this.formatState.formatStore.snapshot()`（同一快照），并填 `attachmentBefore/After`。`FormatUndoHandler` 的 undo/redo 分支在 restore format 后追加：`if (cmd.attachmentBefore) ctx.restoreAttachments(cmd.attachmentBefore)`（redo 用 `attachmentAfter`）。`FormatUndoContext` 加 `restoreAttachments` 回调，由 `DefaultGridEngine` 注入 `this.formatState.restoreAttachments`。

- [ ] **Step 5: 跑测试确认绿**

Run: `bun test packages/core/tests/features/format/FormatUndoHandler.test.ts`
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/features/format packages/core/src/kernel/undo packages/core/tests/features/format/FormatUndoHandler.test.ts
git commit -m "feat(attachment): setCellAttachment 写门面 + format undo 附件快照分支

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: engine + Grid 门面 + GridOptions 注册

**Files:**
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`
- Modify: `packages/core/src/Grid.ts`
- Modify: `packages/core/src/index.ts`
- Test: 由 Task 1 的 `bdd.test.ts` 覆盖（本 Task 末转绿）

- [ ] **Step 1: engine 接线**

`DefaultGridEngine`：
- 构造期接收并保存 `cellAttachments?: readonly CellAttachmentCodec<unknown>[]`，建 `Map<namespace, codec>`（codec 注册表，供后续 clipboard/序列化；Phase A 仅存不用）。
- 加 `setCellAttachment(namespace, rawRow, rawCol, data)` → 转发 `this.formatController.setCellAttachment(...)` + invalidate（对齐既有 `setFillColor` at line 867 的 invalidate 形状）。
- 加 `getCellAttachment(namespace, rawRow, rawCol)` → `this.formatState.attachmentStore.get(...)`。
- `FormatUndoContext` 注入处补 `restoreAttachments: (snap) => this.formatState.restoreAttachments(snap)`。

- [ ] **Step 2: `GridControllerImpl` 透传**

`GridControllerImpl`（DOM runtime delegate）加 `setCellAttachment`/`getCellAttachment` 透传到 engine（对齐既有 `setFillColor` 透传）。`GridController` 接口加这两个方法签名。

- [ ] **Step 3: Grid 门面 + GridOptions**

`Grid.ts`：
- `GridOptions` 加 `cellAttachments?: readonly CellAttachmentCodec<unknown>[]`，构造期并入 `engineOptions`（紧挨 `cellTypes` 那行）。
- 门面方法：

```ts
/** 给 raw cell 写扩展私有附件（namespace 由 cellAttachments 注册）；data=undefined 清除。 */
setCellAttachment<T>(namespace: string, rawRow: number, rawCol: number, data: T | undefined): boolean {
  return this.delegate.setCellAttachment(namespace, rawRow, rawCol, data)
}
/** 读 raw cell 的扩展附件；无则 undefined。 */
getCellAttachment<T>(namespace: string, rawRow: number, rawCol: number): T | undefined {
  return this.delegate.getCellAttachment(namespace, rawRow, rawCol)
}
```

- [ ] **Step 4: re-export 公开类型**

`index.ts` re-export `CellAttachmentCodec`（及 `CellAttachmentSnapshot` 若 undo 公开需要）。

- [ ] **Step 5: 跑外环 + 全量确认绿**

Run: `bun test packages/core/tests/acceptance/contract/plugin-api/bdd.test.ts`
Expected: PASS（Task 1 两条场景转绿）。

- [ ] **Step 6: 把场景 status 改 implemented + Commit**

两条 scenario MD frontmatter `status: planned` → `implemented`；`mbd validate` 通过。

```bash
git add packages/core/src packages/core/tests/acceptance
git commit -m "feat(attachment): Grid.setCellAttachment/getCellAttachment 门面 + GridOptions 注册，外环转绿

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: 渲染读取契约 — frame 暴露附件解析器

**Files:**
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`（`getFrame` 路径）
- Modify: render frame 契约类型（`grep -rn "interface RenderFrame" packages/core/src`）
- Test: `packages/core/tests/engine/...`（frame 携带 attachment 解析）

> 目的：Phase B 的 canvas2d renderer 要能按 **view** 坐标读附件（内部 view→raw）。Phase A 只开 core 侧契约，不画。

- [ ] **Step 1: 写失败测试**

测 `engine.getFrame()` 暴露 `getAttachment(namespace, viewRow, viewCol)`（或在 frame 上挂 resolver），对已 set 的 raw cell 经 view 坐标读回。先确认 frame 契约现有形状再定挂点。

- [ ] **Step 2: 跑测试确认红** → Run 对应 test，Expected FAIL。

- [ ] **Step 3: 实现**

engine 暴露 `getAttachment(namespace, viewRow, viewCol)`：view→raw 经既有 `coords`（参照 `resolveViewMergeRegion` 用 `this.coords` 的 view→raw 方式），再 `attachmentStore.get`。挂到 frame 契约或 controller 读口，供 backend 消费（Phase B 用）。

- [ ] **Step 4: 跑测试确认绿** → Expected PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src packages/core/tests/engine
git commit -m "feat(attachment): frame 暴露 view 坐标附件解析器，供后端渲染读取

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: 全量 gates

- [ ] **Step 1: 四门全绿**

```bash
bun test
bun run --filter '*' typecheck
bun run lint
bun run --filter @novasheet/core build && bun run --filter @novasheet/canvas2d build
```

Expected: 全过（含 `lint:architecture` kernel 边界、`lint:scenario-coverage` 不退化）。

- [ ] **Step 2: dogfood/边界自检**

确认 core 无 rich-text/typography 痕迹：`grep -rn "TextRun\|fontWeight\|strikethrough" packages/core/src` 应为空（Phase A 不引入 rich-text 语义）。

- [ ] **Step 3: 里程碑收尾**

dispatch code-reviewer（即便全绿，CLAUDE.md 要求）。

---

## Self-Review（plan 对 spec §5）

- spec §5.1 `CellAttachmentStore`/`CellAttachmentCodec` 契约 → Task 2。✓
- spec §5.2 raw-key + remap（结构/fill/clipboard/undo）→ Task 2（store remap）、Task 3（事件 remap）、Task 4（undo）。**fill 携带 + clipboard codec** 留 Phase A 后续小批或 Phase C 接 rich-text 时落（本 plan 仅建 codec 注册表，未接 fill/clipboard 平铺）——已在 Task 5 Step 1 注明「仅存不用」。**若需 fill/clipboard 进 Phase A，告知后补 Task 8/9。**
- spec §5.3 渲染读取通道（paint-params accessor）→ Task 6（core 侧契约；canvas2d 消费在 Phase B）。✓
- spec §5.4 `Grid.setCellAttachment` 写门面 → Task 5。✓
- 类型一致性：`CellAttachmentCodec`/`CellAttachmentSnapshot`/`setCellAttachment`/`getCellAttachment`/`restoreAttachments`/`remapAttachment*` 跨 Task 命名统一。✓
- 一处有意收窄：API 吃 **raw** 坐标（非 view）。rich-text 编辑器提交时已知 raw cell；与 `setFillColor` 吃 view range 不同，故不经 `translateRange`。如评审认为应提供 view 重载，Phase C 接编辑器时再加。
