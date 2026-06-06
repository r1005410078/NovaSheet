# Engine Composer 第二阶段 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development（推荐）或
> superpowers:executing-plans 逐 task 执行。步骤用 `- [ ]` 复选框跟踪。

**Goal:** 收口 `DefaultGridEngine` composer 编排——结构 mutation 复合 undo 协调器 + edit/paste/fill 写入门面 +
可选 `FrameAssembler`；纯重构零行为变化。

**Architecture:** 跨域编排留 `engine/`（`StructuralMutationCoordinator`、`FrameAssembler`）；单域写入门面放
`features/*`（对称 `FormatController`）。engine 方法保留 guard 与 `finishActiveEdit()`，成功路径 delegate。

**Tech Stack:** TypeScript（strict + verbatimModuleSyntax + noUncheckedIndexedAccess）、bun test、`@novasheet/core`。

- Spec：`docs/superpowers/specs/2026-06-07-novasheet-engine-composer-phase-2-design.md`
- 分支：`refactor-default-grid-engine-decomposition`（不新建分支；**暂不合 `main`**）

---

## 工具链（NON-NEGOTIABLE）

- 包管理/运行：`bun`（≥1.2）。**禁用** npm/yarn/pnpm。
- 单文件测试：`bun test packages/core/tests/engine/<file>.test.ts` 等。
- 全量回归：`bun test`（基线 **1031 pass / 0 fail**，不得回归）。
- Typecheck：`bun run --filter '*' typecheck`。
- Lint：`bun run lint`（0 warning）。
- 测试导入：`import { describe, expect, it, mock, spyOn } from 'bun:test'`。
- Commit：Conventional Commit 英文前缀 + 中文 subject/正文；**一 task 一 commit**。

---

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `packages/core/src/engine/StructuralMutationCoordinator.ts`（**新建**） | 结构 command 执行后 rebuild + 复合 undo 入栈 |
| `packages/core/tests/engine/StructuralMutationCoordinator.test.ts`（**新建**） | 协调器隔离单测 |
| `packages/core/src/engine/DefaultGridEngine.ts`（修改） | Task 1–4 委派；行数应显著下降 |
| `packages/core/src/features/edit/EditController.ts`（**新建**） | edit/clearRange 写入门面 |
| `packages/core/tests/features/edit/EditController.test.ts`（**新建**） | |
| `packages/core/src/features/clipboard/PasteController.ts`（**新建**） | paste commit 编排 |
| `packages/core/tests/features/clipboard/PasteController.test.ts`（**新建**） | |
| `packages/core/src/features/fill/FillController.ts`（**新建**） | fill commit 编排 |
| `packages/core/tests/features/fill/FillController.test.ts`（**新建**） | |
| `packages/core/src/engine/FrameAssembler.ts`（**新建**，Task 4） | `assembleRenderFrame` 纯函数 |
| `packages/core/tests/engine/FrameAssembler.test.ts`（**新建**） | |
| `engine/README.md`、`features/*/README.md`（Task 5） | Composer Phase 2 进度 + 写入门面说明 |

---

## Task 1：Slice 2-A — `StructuralMutationCoordinator`

**Files:**
- Create: `packages/core/src/engine/StructuralMutationCoordinator.ts`
- Create: `packages/core/tests/engine/StructuralMutationCoordinator.test.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`

### 1.1 行为对照表（implementer 必对，禁止 silent 改序）

| Engine 方法 | execute | beforeExecute | afterExecute | rebuild | format/merge | frozen undo | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `insertRows` | insertRowsCommand | — | — | rows | ✅ | — | |
| `deleteRows` | deleteRowsCommand | — | — | rows | ✅ | — | |
| `moveRows` | moveRowsCommand | — | — | rows | ✅ | — | guard 留 engine |
| `hideRows` | hideRowsCommand | — | — | rows | — | — | |
| `unhideRows` | unhideRowsCommand | — | — | rows | — | — | |
| `insertCols` | insertColsCommand | — | `remapFrozenAfterColInsert(at,count,oldTotal)` | cols | ✅ | ✅ | `oldTotal = fields.length - event.count` **after** execute |
| `deleteCols` | deleteColsCommand | 捕获 `totalColsBefore` | `remapFrozenAfterColDelete(removed, totalColsBefore)` | cols | ✅ | ✅ | |
| `moveCols` | moveColsCommand | `captureVisibleFieldIdsBefore(...)` | — | cols | ✅ | — | **无** frozen undo；guard 留 engine |
| `hideCols` | hideColsCommand | — | — | cols | — | — | |
| `unhideCols` | unhideColsCommand | — | — | cols | — | — | |

**本 task 不迁移**（非 command 模板，~30 行，YAGNI）：`setRowHeights`、`setColumnWidths` — 仍留 engine。

### 1.2 协调器 API（Step 3 实现目标）

```typescript
import type { GridSelection } from '../features/selection/SelectionTypes'
import type { FormatLayer } from '../features/format/CellFormat'
import type { MergeRegion } from '../features/merge/MergeStore'
import type { FrozenConfig } from '../kernel/geometry/FrozenRegions'
import type { UndoCommand } from '../kernel/undo/UndoCommand'

export interface StructuralMutationContext {
  getSelection(): GridSelection
  pushUndo(command: UndoCommand): void
  rebuildRows(): void
  rebuildCols(): void
  snapshotFormatMerge(): {
    formatBefore: readonly FormatLayer[]
    mergeBefore: readonly MergeRegion[]
  }
  snapshotFormatMergeAfter(): {
    formatAfter: readonly FormatLayer[]
    mergeAfter: readonly MergeRegion[]
  }
  getFrozenConfig(): FrozenConfig
}

export interface SelectionPair {
  selectionBefore: GridSelection
  selectionAfter: GridSelection
}

export interface RunCommandStructuralParams<TEvent> {
  execute: () => TEvent | null
  rebuild: 'rows' | 'cols'
  beforeExecute?: () => void
  afterExecute?: (event: TEvent) => void
  withFormatMerge?: boolean
  withFrozen?: boolean
  buildUndo: (
    event: TEvent,
    sel: SelectionPair,
    extras?: {
      formatBefore?: readonly FormatLayer[]
      formatAfter?: readonly FormatLayer[]
      mergeBefore?: readonly MergeRegion[]
      mergeAfter?: readonly MergeRegion[]
      frozenBefore?: FrozenConfig
      frozenAfter?: FrozenConfig
    },
  ) => UndoCommand
}

export class StructuralMutationCoordinator {
  constructor(private readonly ctx: StructuralMutationContext) {}

  runCommandStructural<TEvent>(params: RunCommandStructuralParams<TEvent>): TEvent | null {
    const selectionBefore = this.ctx.getSelection()
    const frozenBefore = params.withFrozen ? this.ctx.getFrozenConfig() : undefined
    const fmt = params.withFormatMerge ? this.ctx.snapshotFormatMerge() : undefined
    params.beforeExecute?.()
    const event = params.execute()
    if (event === null) return null
    params.afterExecute?.(event)
    if (params.rebuild === 'rows') this.ctx.rebuildRows()
    else this.ctx.rebuildCols()
    const selectionAfter = this.ctx.getSelection()
    const fmtAfter = params.withFormatMerge ? this.ctx.snapshotFormatMergeAfter() : undefined
    const frozenAfter = params.withFrozen ? this.ctx.getFrozenConfig() : undefined
    this.ctx.pushUndo(
      params.buildUndo(
        event,
        { selectionBefore, selectionAfter },
        {
          formatBefore: fmt?.formatBefore,
          formatAfter: fmtAfter?.formatAfter,
          mergeBefore: fmt?.mergeBefore,
          mergeAfter: fmtAfter?.mergeAfter,
          frozenBefore,
          frozenAfter,
        },
      ),
    )
    return event
  }
}
```

### 1.3 Steps

- [ ] **Step 1：写失败单测**

`packages/core/tests/engine/StructuralMutationCoordinator.test.ts`：

```typescript
import { describe, expect, it } from 'bun:test'
import { StructuralMutationCoordinator } from '../../src/engine/StructuralMutationCoordinator'
import type { StructuralMutationContext } from '../../src/engine/StructuralMutationCoordinator'
import type { GridSelection } from '../../src/features/selection/SelectionTypes'

const EMPTY: GridSelection = {
  activeCell: null,
  anchorCell: null,
  extentCell: null,
  selectedRange: null,
}

function makeCtx(overrides: Partial<StructuralMutationContext> = {}): {
  ctx: StructuralMutationContext
  pushed: unknown[]
  rebuilt: string[]
} {
  const pushed: unknown[] = []
  const rebuilt: string[] = []
  const ctx: StructuralMutationContext = {
    getSelection: () => EMPTY,
    pushUndo: (c) => pushed.push(c),
    rebuildRows: () => rebuilt.push('rows'),
    rebuildCols: () => rebuilt.push('cols'),
    snapshotFormatMerge: () => ({ formatBefore: [], mergeBefore: [] }),
    snapshotFormatMergeAfter: () => ({ formatAfter: [], mergeAfter: [] }),
    getFrozenConfig: () => ({ topRows: 0, leftCols: 0, rightCols: 0 }),
    ...overrides,
  }
  return { ctx, pushed, rebuilt }
}

describe('StructuralMutationCoordinator', () => {
  it('execute 返回 null 时不 rebuild、不入栈', () => {
    const { ctx, pushed, rebuilt } = makeCtx()
    const coord = new StructuralMutationCoordinator(ctx)
    const result = coord.runCommandStructural({
      execute: () => null,
      rebuild: 'rows',
      buildUndo: () => ({ kind: 'hideRows', underlyingRowIds: [], selectionBefore: EMPTY, selectionAfter: EMPTY }),
    })
    expect(result).toBeNull()
    expect(rebuilt).toEqual([])
    expect(pushed).toHaveLength(0)
  })

  it('withFormatMerge 时 before/after 快照传入 buildUndo', () => {
    const { ctx, pushed } = makeCtx({
      snapshotFormatMerge: () => ({ formatBefore: [{ order: 0 } as never], mergeBefore: [] }),
      snapshotFormatMergeAfter: () => ({ formatAfter: [{ order: 1 } as never], mergeAfter: [] }),
    })
    const coord = new StructuralMutationCoordinator(ctx)
    coord.runCommandStructural({
      execute: () => ({ at: 1, count: 1, newRowIds: [1] }),
      rebuild: 'rows',
      withFormatMerge: true,
      buildUndo: (_e, sel, ex) => ({
        kind: 'insertRows',
        at: 1,
        count: 1,
        newIds: [1],
        selectionBefore: sel.selectionBefore,
        selectionAfter: sel.selectionAfter,
        formatBefore: ex!.formatBefore!,
        formatAfter: ex!.formatAfter!,
        mergeBefore: ex!.mergeBefore!,
        mergeAfter: ex!.mergeAfter!,
      }),
    })
    expect(pushed).toHaveLength(1)
    expect((pushed[0] as { formatBefore: unknown[] }).formatBefore).toHaveLength(1)
    expect((pushed[0] as { formatAfter: unknown[] }).formatAfter).toHaveLength(1)
  })

  it('afterExecute 在 rebuild 之前调用', () => {
    const order: string[] = []
    const { ctx } = makeCtx({
      rebuildRows: () => order.push('rebuild'),
    })
    const coord = new StructuralMutationCoordinator(ctx)
    coord.runCommandStructural({
      execute: () => ({ ok: true }),
      rebuild: 'rows',
      afterExecute: () => order.push('afterExecute'),
      buildUndo: () => ({ kind: 'hideRows', underlyingRowIds: [], selectionBefore: EMPTY, selectionAfter: EMPTY }),
    })
    expect(order).toEqual(['afterExecute', 'rebuild'])
  })
})
```

- [ ] **Step 2：跑单测确认 FAIL**

```bash
cd /Users/rongts/NovaSheet
bun test packages/core/tests/engine/StructuralMutationCoordinator.test.ts
```

Expected: FAIL — module not found。

- [ ] **Step 3：实现 `StructuralMutationCoordinator.ts`**（见 §1.2 API）

- [ ] **Step 4：单测 PASS**

```bash
bun test packages/core/tests/engine/StructuralMutationCoordinator.test.ts
```

- [ ] **Step 5：接线 `DefaultGridEngine`**

新增字段：

```typescript
private readonly structural = new StructuralMutationCoordinator({
  getSelection: () => this.selection.getSelection(),
  pushUndo: (c) => this.undoStack.push(c),
  rebuildRows: () => this.layout.rebuildRows(this.rowStructure.getViewRowsAxis()),
  rebuildCols: () => this.layout.rebuildCols(this.columnStructure.getViewColsAxis()),
  snapshotFormatMerge: () => ({
    formatBefore: this.formatState.formatStore.snapshot(),
    mergeBefore: this.formatState.mergeStore.snapshot(),
  }),
  snapshotFormatMergeAfter: () => ({
    formatAfter: this.formatState.formatStore.snapshot(),
    mergeAfter: this.formatState.mergeStore.snapshot(),
  }),
  getFrozenConfig: () => this.layout.getFrozenConfig(),
})
```

将 §1.1 表中 9 个方法改为 `this.structural.runCommandStructural(...)`；`insertRows` 示例：

```typescript
insertRows(beforeUnderlyingRow: number, count: number): readonly number[] {
  const event = this.structural.runCommandStructural({
    execute: () =>
      this.insertRowsCommand.execute({ kind: 'insertRows', at: beforeUnderlyingRow, count }),
    rebuild: 'rows',
    withFormatMerge: true,
    buildUndo: (event, sel, ex) => ({
      kind: 'insertRows',
      at: event.at,
      count: event.count,
      newIds: event.newRowIds,
      selectionBefore: sel.selectionBefore,
      selectionAfter: sel.selectionAfter,
      formatBefore: ex!.formatBefore!,
      formatAfter: ex!.formatAfter!,
      mergeBefore: ex!.mergeBefore!,
      mergeAfter: ex!.mergeAfter!,
    }),
  })
  return event?.newRowIds ?? []
}
```

`insertCols` 的 `afterExecute`：

```typescript
afterExecute: (event) =>
  this.layout.remapFrozenAfterColInsert(
    event.at,
    event.count,
    this.rawData.getSchema().fields.length - event.count,
  ),
```

`deleteCols` 的 `beforeExecute` + `afterExecute` 用闭包变量 `totalColsBefore`（见 §1.1）。

`moveCols` 的 `beforeExecute`：

```typescript
beforeExecute: () =>
  this.selectionController.captureVisibleFieldIdsBefore(
    this.data.getSchema().fields.map((f) => f.id),
  ),
```

- [ ] **Step 6：grep 门**

```bash
grep -n 'formatBefore = this.formatState' packages/core/src/engine/DefaultGridEngine.ts
# 期望：空（format 快照仅经 structural / fill 等剩余路径）
```

若 fill 仍保留 formatBefore 则允许 fill 路径命中；**结构 9 方法内不得再手写 selectionBefore+formatBefore 块**。

- [ ] **Step 7：全量验证**

```bash
bun test packages/core/tests/engine/DefaultGridEngine.format-merge-structural.test.ts
bun test packages/core/tests/engine/DefaultGridEngine.format-merge-structural-undo.test.ts
bun test
bun run --filter '*' typecheck
bun run lint
```

- [ ] **Step 8：commit**

```bash
git add packages/core/src/engine/StructuralMutationCoordinator.ts \
        packages/core/tests/engine/StructuralMutationCoordinator.test.ts \
        packages/core/src/engine/DefaultGridEngine.ts
git commit -m "$(cat <<'EOF'
refactor(core): 新增 StructuralMutationCoordinator 收口结构 mutation undo

行/列 insert/delete/move/hide/unhide 经协调器 execute→rebuild→push；
frozen/format/merge 快照时序与现 engine 一致。
EOF
)"
```

**STOP 点：** 若接线后 structural 测试 FAIL 且 diff 显示 frozen remap 时序或 undo payload 字段与现 engine 不一致 → **STOP+ASK**，先修 plan 对照表再改代码。

---

## Task 2：Slice 2-B — `EditController`

**Files:**
- Create: `packages/core/src/features/edit/EditController.ts`
- Create: `packages/core/tests/features/edit/EditController.test.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`

- [ ] **Step 1：写失败单测**（merge anchor、commit 入栈 raw row、clearRange view range + raw before）

```typescript
import { describe, expect, it } from 'bun:test'
import { EditController } from '../../../src/features/edit/EditController'
import type { EditControllerContext } from '../../../src/features/edit/EditController'
import { CellEditModel } from '../../../src/features/edit/CellEditModel'
import type { CellAddress } from '../../../src/features/selection/SelectionTypes'

function makeCtx(overrides: Partial<EditControllerContext> = {}): {
  ctx: EditControllerContext
  pushed: unknown[]
} {
  const pushed: unknown[] = []
  const ctx: EditControllerContext = {
    getData: () => ({
      getSchema: () => ({ fields: [{ id: 'a', name: 'A', type: 'text', width: 100 }] }),
      getRowCount: () => 1,
      getCell: () => 'old',
      updateCell: () => {},
    }) as EditControllerContext['getData'] extends () => infer R ? R : never,
    isMutable: () => true,
    resolveEditCell: (c) => c,
    viewRowToRaw: (r) => r,
    rawRowToView: (r) => r,
    pushUndo: (c) => pushed.push(c),
    ...overrides,
  }
  return { ctx, pushed }
}

describe('EditController', () => {
  it('commit 成功入栈 editCell，rowIndex 为 raw', () => {
    const { ctx, pushed } = makeCtx({ viewRowToRaw: () => 99 })
    const model = new CellEditModel()
    const ec = new EditController(model, ctx)
    const cell: CellAddress = { rowIndex: 0, colIndex: 0 }
    expect(ec.beginCellEdit(cell)).toBe(true)
    ec.updateDraft('new')
    expect(ec.commit()).toBe(true)
    expect(pushed[0]).toMatchObject({ kind: 'editCell', rowIndex: 99, after: 'new' })
  })
})
```

- [ ] **Step 2：FAIL 确认** → **Step 3：实现 `EditController`**（从 engine 剪切 `beginCellEdit`/`commitCellEdit`/`clearRange` 等逻辑）

`getSession()` 暴露给 engine `getFrame`：

```typescript
getSession() {
  return this.model.getSession()
}
```

- [ ] **Step 4：单测 PASS + engine 委派**

```typescript
private readonly editController = new EditController(new CellEditModel(), { ... })
// 删 cellEdit 字段；getFrame 用 this.editController.getSession()
beginCellEdit(cell) { return this.editController.beginCellEdit(cell) }
```

- [ ] **Step 5：全量验证 + commit**

```bash
git commit -m "$(cat <<'EOF'
refactor(core): 新增 EditController 写入门面

edit/clearRange 编排从 DefaultGridEngine 迁入 features/edit；undo 坐标语义不变。
EOF
)"
```

---

## Task 3：Slice 2-C — `PasteController` + `FillController`

**Files:**
- Create: `packages/core/src/features/clipboard/PasteController.ts`
- Create: `packages/core/tests/features/clipboard/PasteController.test.ts`
- Create: `packages/core/src/features/fill/FillController.ts`
- Create: `packages/core/tests/features/fill/FillController.test.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`

- [ ] **Step 1：`PasteController` 失败单测** — merge 冲突时 `onSkipped` 调用、无 pushUndo

- [ ] **Step 2：实现 `PasteController`** — 整体迁移现 `commitPaste`（~55 行）

- [ ] **Step 3：`FillController` 失败单测** — 空 writes 返回 null；成功 push fill undo + 调 `propagateFillStyles`

- [ ] **Step 4：实现 `FillController`** — 迁移现 `commitFill`；context 注入：

```typescript
propagateFillStyles: (s, f, d) => this.fillStyles.propagateFillStyles(s, f, d),
selectRange: (r) => this.selectionController.setSelectedRange(r),
```

- [ ] **Step 5：engine 委派 + 回归**

```bash
bun test packages/core/tests/engine/DefaultGridEngine.fill-styles.test.ts
bun test
```

- [ ] **Step 6：commit**

```bash
git commit -m "$(cat <<'EOF'
refactor(core): 新增 PasteController 与 FillController 写入门面

commitPaste/commitFill 编排下沉 features；merge 守卫与 fill 选区联动不变。
EOF
)"
```

---

## Task 4：Slice 2-D — `FrameAssembler`（可选）

**Files:**
- Create: `packages/core/src/engine/FrameAssembler.ts`
- Create: `packages/core/tests/engine/FrameAssembler.test.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`

- [ ] **Step 1：从现 `getFrame` 提取 `assembleRenderFrame`** — 逻辑 1:1 剪切，无行为变化

- [ ] **Step 2：单测** — mock layout/structure，断言 `collapsedRowGaps[0].yPx` 计算

- [ ] **Step 3：`getFrame()` 一行 delegate + 全量 `bun test`**

- [ ] **Step 4：commit**

```bash
git commit -m "$(cat <<'EOF'
refactor(core): 提取 FrameAssembler 纯函数装配 RenderFrame

getFrame 委派 assembleRenderFrame，可见区 gap/format 逻辑不变。
EOF
)"
```

**可跳过：** 若前 3 task 已满足行数目标，Task 4 可延后；跳过须在 PR/会话说明。

---

## Task 5：文档收尾

**Files:**
- Modify: `packages/core/src/engine/README.md`
- Create: `packages/core/src/features/edit/README.md`
- Create: `packages/core/src/features/clipboard/README.md`
- Create: `packages/core/src/features/fill/README.md`
- Modify: `CLAUDE.md`（Composer Phase 2 完成摘要）

- [ ] **Step 1：`engine/README.md` 增表**

```markdown
| Composer 2-A | StructuralMutationCoordinator | ✅ | 结构 command undo 模板 |
| Composer 2-B | EditController | ✅ | … |
| Composer 2-C | Paste/FillController | ✅ | … |
| Composer 2-D | FrameAssembler | ✅/⬜ | … |
```

删 stale「ColumnStructureContext 中间态」句。

- [ ] **Step 2：三份 feature README**（各 ≤15 行：写入门面 + engine 委派关系）

- [ ] **Step 3：commit**

```bash
git commit -m "$(cat <<'EOF'
docs(core): Engine Composer 第二阶段文档收尾

更新 engine/README、edit/clipboard/fill README 与 CLAUDE 进度。
EOF
)"
```

---

## 范围外（本 plan 不做）

- `setRowHeights` / `setColumnWidths` 迁入协调器（非 command 模板，留 engine）。
- `UndoCommand` union 按域拆文件。
- `getFillMergeSnap` 迁 fill 域（可后续小 PR）。
- 合并 `main`（用户暂搁置）。

---

## 最终验收

- [ ] `DefaultGridEngine.ts` 行数较 1118 显著下降（目标 ~650–750，含 Task 4）
- [ ] 结构 9 方法无重复 `selectionBefore + formatBefore` 块
- [ ] `bun test` → 1031+ pass / 0 fail
- [ ] typecheck + lint 全绿
- [ ] `grep 'ColumnStructureContext' packages/core/src/engine/README.md` → 空

---

## 自检（plan self-review）

| 检查 | 结果 |
| --- | --- |
| Spec §3 四 slice | Task 1–4 一一对应；Task 5 = §11 文档 |
| §1.1 对照表 | 覆盖 insert/delete/move/hide/unhide row/col；frozen/moveCols 特例 explicit |
| setRowHeights 范围 | 明确范围外，防 scope creep |
| Placeholder | 无 TBD；Edit/Paste 单测给最小可运行示例 |
| STOP | Task 1 Step 8 前 characterization 回归 |

---

## 执行方式

Plan 已保存。两种执行选项：

1. **Subagent-Driven（推荐）** — 每 Task 派独立 subagent，Task 间 review
2. **Inline Execution** — 本会话 Task 1→5 连续执行，Task 1 后 checkpoint

选哪种？
