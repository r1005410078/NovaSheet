# Format/Merge 抽离为 DefaultFormatState 聚合根 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development（推荐）或
> superpowers:executing-plans 逐任务执行。步骤用 `- [ ]` 复选框跟踪。

**Goal:** 实现 Engine 重构第 7 步——`DefaultFormatState` 聚合根自持 format/merge store 与结构 remap 面，
`FormatController`/`FormatEventHandler`/`DefaultGridEngine` 委派收口，纯重构零行为变化。

**Architecture:** 对称 `DefaultLayoutState`：聚合根持有 store + 暴露 remap/restore/只读解析；
`FormatController` 保留写入门面编排；engine 删 `formatStore`/`mergeStore` 字段，改持 `formatState`。

**Tech Stack:** TypeScript（strict + verbatimModuleSyntax + noUncheckedIndexedAccess）、bun test、
现有 `RangeStyleStore`/`MergeStore`/`FormatController`（`@novasheet/core`）。

- Spec：`docs/superpowers/specs/2026-06-06-novasheet-format-state-aggregate-design.md`
- 分支：`refactor-default-grid-engine-decomposition`（不新建分支）

---

## 工具链（NON-NEGOTIABLE）

- 包管理/运行：`bun`（≥1.2）。**禁用** npm/yarn/pnpm。
- 单文件测试：`bun test packages/core/tests/features/format/<file>.test.ts`。
- 全量回归：`bun test`（当前基线 **1028 pass / 0 fail**，不得回归）。
- Typecheck：`bun run --filter '*' typecheck`。
- Lint：`bun run lint`（0 warning）。
- 测试导入：`import { describe, expect, it } from 'bun:test'`。
- Commit：Conventional Commit 英文前缀 + 中文 subject/正文；**一 task 一 commit**。

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `packages/core/src/features/format/FormatState.ts`（**重写**） | `FormatState` 接口 + `DefaultFormatState` 实现；删 `FormatStateContext`。 |
| `packages/core/tests/features/format/DefaultFormatState.test.ts`（**新建**） | 聚合根隔离单测。 |
| `packages/core/src/features/format/FormatController.ts`（修改） | 构造改为 `(formatState, ctx)`；方法体不变。 |
| `packages/core/src/features/format/FormatEventHandler.ts`（修改） | 构造接受 `FormatState`（或 `Pick` remap 面）。 |
| `packages/core/tests/features/format/FormatController.test.ts` 等（修改） | 注入 `DefaultFormatState`。 |
| `packages/core/src/engine/DefaultGridEngine.ts`（修改） | 删 2 字段；~55 处改 `formatState`；pipeline/undo/fill/frame 改 store 来源。 |
| `packages/core/src/features/format/README.md`（修改） | 文档 `FormatState` + 路径修正。 |
| `packages/core/src/engine/README.md`（修改） | 第 7 步标 ✅。 |
| `packages/core/src/ARCHITECTURE.md`（修改） | 第 7 步标 ✅。 |

---

## Task 1：`DefaultFormatState` 聚合根（TDD）

**Files:**
- Rewrite: `packages/core/src/features/format/FormatState.ts`
- Create: `packages/core/tests/features/format/DefaultFormatState.test.ts`

- [ ] **Step 1：写失败单测**

```typescript
import { describe, expect, it } from 'bun:test'
import { DefaultFormatState } from '../../../src/features/format/FormatState'
import { asRawRange } from '../../../src/kernel/coords/coordinates'

describe('DefaultFormatState', () => {
  it('starts with empty stores', () => {
    const state = new DefaultFormatState()
    expect(state.resolveCellFormat(0, 0)).toBeUndefined()
    expect(state.getMergeRegionAt(0, 0)).toBeNull()
  })

  it('restoreFormat round-trips through formatStore', () => {
    const state = new DefaultFormatState()
    state.formatStore.apply(asRawRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }), {
      fillColor: '#abc',
    })
    const snap = state.formatStore.snapshot()
    state.restoreFormat([])
    expect(state.resolveCellFormat(0, 0)).toBeUndefined()
    state.restoreFormat(snap)
    expect(state.resolveCellFormat(0, 0)?.fillColor).toBe('#abc')
  })

  it('remapFormatAfterRowsDeleted sorts rowIds before delegating', () => {
    const state = new DefaultFormatState()
    state.formatStore.apply(asRawRange({ startRow: 1, endRow: 1, startCol: 0, endCol: 0 }), {
      fillColor: '#x',
    })
    state.remapFormatAfterRowsDeleted([2, 0])
    expect(state.resolveCellFormat(0, 0)?.fillColor).toBe('#x')
    expect(state.resolveCellFormat(1, 0)).toBeUndefined()
  })
})
```

- [ ] **Step 2：跑单测确认 FAIL**

```bash
cd /Users/rongts/NovaSheet
bun test packages/core/tests/features/format/DefaultFormatState.test.ts
```

Expected: FAIL — `DefaultFormatState` not exported / not defined。

- [ ] **Step 3：实现 `FormatState` + `DefaultFormatState`**

重写 `FormatState.ts`（删 `FormatStateContext`）：

```typescript
import type { CellFormat, FormatLayer } from './CellFormat'
import { RangeStyleStore } from './RangeStyleStore'
import type { MergeRegion, MergeStore } from '../merge/MergeStore'
import { MergeStore as MergeStoreImpl } from '../merge/MergeStore'

export interface FormatState {
  readonly formatStore: RangeStyleStore
  readonly mergeStore: MergeStore
  resolveCellFormat(rowIndex: number, colIndex: number): CellFormat | undefined
  getMergeRegionAt(rowIndex: number, colIndex: number): MergeRegion | null
  restoreFormat(layers: readonly FormatLayer[]): void
  restoreMerge(regions: readonly MergeRegion[]): void
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

export class DefaultFormatState implements FormatState {
  readonly formatStore = new RangeStyleStore()
  readonly mergeStore = new MergeStoreImpl()

  resolveCellFormat(rowIndex: number, colIndex: number): CellFormat | undefined {
    return this.formatStore.resolveCell(rowIndex, colIndex)
  }

  getMergeRegionAt(rowIndex: number, colIndex: number): MergeRegion | null {
    return this.mergeStore.getRegionAt(rowIndex, colIndex)
  }

  restoreFormat(layers: readonly FormatLayer[]): void {
    this.formatStore.restore(layers)
  }

  restoreMerge(regions: readonly MergeRegion[]): void {
    this.mergeStore.restore(regions)
  }

  remapFormatRows(indexMap: ReadonlyMap<number, number>): void {
    this.formatStore.remapByRowIndexMap(indexMap)
  }

  remapMergeRows(indexMap: ReadonlyMap<number, number>): void {
    this.mergeStore.remapByRowIndexMap(indexMap)
  }

  remapFormatAfterRowsInserted(at: number, count: number): void {
    this.formatStore.remapAfterRowsInserted(at, count)
  }

  remapMergeAfterRowsInserted(at: number, count: number): void {
    this.mergeStore.remapAfterRowsInserted(at, count)
  }

  remapFormatAfterRowsDeleted(rowIds: readonly number[]): void {
    this.formatStore.remapAfterRowsDeleted([...rowIds].sort((a, b) => a - b))
  }

  remapMergeAfterRowsDeleted(rowIds: readonly number[]): void {
    this.mergeStore.remapAfterRowsDeleted([...rowIds].sort((a, b) => a - b))
  }

  remapFormatCols(indexMap: ReadonlyMap<number, number>): void {
    this.formatStore.remapByColIndexMap(indexMap)
  }

  remapMergeCols(indexMap: ReadonlyMap<number, number>): void {
    this.mergeStore.remapByColIndexMap(indexMap)
  }

  remapFormatAfterColsInserted(at: number, count: number): void {
    this.formatStore.remapAfterColsInserted(at, count)
  }

  remapMergeAfterColsInserted(at: number, count: number): void {
    this.mergeStore.remapAfterColsInserted(at, count)
  }

  remapFormatAfterColsDeleted(colIndices: readonly number[]): void {
    this.formatStore.remapAfterColsDeleted([...colIndices].sort((a, b) => a - b))
  }

  remapMergeAfterColsDeleted(colIndices: readonly number[]): void {
    this.mergeStore.remapAfterColsDeleted([...colIndices].sort((a, b) => a - b))
  }
}
```

- [ ] **Step 4：单测 PASS**

```bash
bun test packages/core/tests/features/format/DefaultFormatState.test.ts
```

- [ ] **Step 5：commit**

```bash
git add packages/core/src/features/format/FormatState.ts \
        packages/core/tests/features/format/DefaultFormatState.test.ts
git commit -m "$(cat <<'EOF'
feat(core): 新增 DefaultFormatState 聚合根(format/merge store + remap 面)

自持 RangeStyleStore/MergeStore，暴露 restore 与结构 remap 委托；
删除未接线的 FormatStateContext 骨架。
EOF
)"
```

---

## Task 2：`FormatController` 改依赖 `FormatState`

**Files:**
- Modify: `packages/core/src/features/format/FormatController.ts`
- Modify: `packages/core/tests/features/format/FormatController.test.ts`

- [ ] **Step 1：改构造签名**

```typescript
import type { FormatState } from './FormatState'

export class FormatController {
  constructor(
    private readonly formatState: FormatState,
    private readonly ctx: FormatControllerContext,
  ) {}

  // 方法体内 this.formatStore → this.formatState.formatStore
  // this.mergeStore → this.formatState.mergeStore
}
```

删除独立 `formatStore`/`mergeStore` 构造参数；**五个 mutation 方法 + commitFormatChange 逻辑一字不改**。

- [ ] **Step 2：更新 FormatController.test.ts**

测试 helper 中：

```typescript
const formatState = new DefaultFormatState()
const controller = new FormatController(formatState, ctx)
```

- [ ] **Step 3：验证**

```bash
bun test packages/core/tests/features/format/FormatController.test.ts
bun run --filter @novasheet/core typecheck
```

- [ ] **Step 4：commit**

```bash
git commit -m "$(cat <<'EOF'
refactor(core): FormatController 改依赖 FormatState 聚合根

构造注入 DefaultFormatState，mutation 编排语义不变。
EOF
)"
```

---

## Task 3：`FormatEventHandler` + engine 接线

**Files:**
- Modify: `packages/core/src/features/format/FormatEventHandler.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`
- Modify: `packages/core/tests/features/format/FormatEventHandler*.test.ts`（若构造签名变）

- [ ] **Step 1：`FormatEventHandler` 接受 `FormatState`**

```typescript
import type { FormatState } from './FormatState'

export class FormatEventHandler implements GridDomainEventHandler {
  constructor(private readonly state: FormatState) {}

  handle(event: GridDomainEvent): void {
    switch (event.kind) {
      case 'rowsInserted':
        this.state.remapFormatAfterRowsInserted(event.at, event.count)
        this.state.remapMergeAfterRowsInserted(event.at, event.count)
        return
      // … 其余 case 把 this.context → this.state，逻辑不变
    }
  }
}
```

`FormatEventHandlerContext` 接口可删或保留为 `type FormatEventHandlerContext = Pick<FormatState, ...>` 供文档；**handler 不再要 12-lambda context**。

- [ ] **Step 2：`DefaultGridEngine` 收口**

替换：

```typescript
// 删：
private readonly formatStore = new RangeStyleStore()
private readonly mergeStore = new MergeStore()

// 增：
private readonly formatState = new DefaultFormatState()
```

全局替换（仅 `DefaultGridEngine.ts`）：
- `this.formatStore` → `this.formatState.formatStore`
- `this.mergeStore` → `this.formatState.mergeStore`

特殊委派：
- `getCellFormat` → `return this.formatState.resolveCellFormat(rowIndex, colIndex)`
- `getMergeRegion` → `return this.formatState.getMergeRegionAt(rowIndex, colIndex)`
- `registerFormatUndo` / 结构 undo 的 `restoreFormat`/`restoreMerge` → `this.formatState.restoreFormat` / `restoreMerge`
- `new FormatController(this.formatState, { ... })`
- `new FormatEventHandler(this.formatState)`
- `resolveViewMergeRegion(this.formatState.mergeStore, ...)`
- `VisibleFormatResolver` / `FillStylePropagator` 仍传 `formatState.formatStore` + `formatState.mergeStore`

删 `DefaultGridEngine` 顶部的 `RangeStyleStore`/`MergeStore` import（若不再直接使用类构造）。

- [ ] **Step 3：grep 门**

```bash
grep -n 'private readonly formatStore\|private readonly mergeStore' \
  packages/core/src/engine/DefaultGridEngine.ts
# 期望：空
```

- [ ] **Step 4：全量验证**

```bash
bun test
bun run --filter '*' typecheck
bun run lint
```

重点回归：

```bash
bun test packages/core/tests/engine/DefaultGridEngine.format-merge-structural.test.ts
bun test packages/core/tests/engine/DefaultGridEngine.format-merge-structural-undo.test.ts
bun test packages/core/tests/features/format/
```

- [ ] **Step 5：commit**

```bash
git commit -m "$(cat <<'EOF'
refactor(core): engine 委派 DefaultFormatState，FormatEventHandler 收口 remap

删除 DefaultGridEngine 内 formatStore/mergeStore 字段；事件管线与 undo restore
经 formatState 统一访问 store。
EOF
)"
```

---

## Task 4：文档 + ARCHITECTURE 收尾

**Files:**
- Modify: `packages/core/src/features/format/README.md`
- Modify: `packages/core/src/engine/README.md`
- Modify: `packages/core/src/ARCHITECTURE.md`

- [ ] **Step 1：更新 format README**

- 增加 `FormatState.ts` / `DefaultFormatState` 说明（store 主人 + remap 面）。
- 修正 `VisibleFormatResolver`/`FillStylePropagator` 路径为 `features/format/`、`features/fill/`。
- 「仍留在 DefaultGridEngine」列表删 `getCellFormat`/`getMergeRegion`（改委派聚合根）。

- [ ] **Step 2：engine README 第 7 步 ✅**

```markdown
| 7 | 抽离 format/merge 协调 | ✅ | `DefaultFormatState` 自持 store + remap；`FormatController`/`FormatEventHandler`/engine 委派。 |
```

- [ ] **Step 3：ARCHITECTURE.md**

- 「Engine 第 7 步」行标 ✅。
- 「仍待行为收口」段落删除或改为「已完成」。

- [ ] **Step 4：commit**

```bash
git commit -m "$(cat <<'EOF'
docs(core): FormatState 聚合收口文档与 engine 第 7 步标完成

更新 format README、engine/README、ARCHITECTURE.md。
EOF
)"
```

---

## 范围外（本 plan 不做）

- `FormatEventHandlerContext` 在其它包的 re-export（无）。
- 把结构 undo 的 `formatBefore`/`mergeBefore` 快照逻辑迁入聚合根（仍留 engine 编排，只改 store 访问路径）。
- Phase 5-C 数字格式（独立 milestone）。

---

## 最终验收

- [ ] `DefaultGridEngine` 无 `formatStore`/`mergeStore` 私有字段
- [ ] `FormatStateContext` 已删除
- [ ] `bun test` → 1028 pass / 0 fail
- [ ] `bun run --filter '*' typecheck` + `bun run lint` 全绿
- [ ] `engine/README.md` 第 7 步 ✅

---

## 自检（plan self-review）

- **Spec 覆盖**：聚合根 / FormatController / FormatEventHandler / engine 委派 / 测试 / 文档 → Task 1–4 全覆盖。
- **占位符扫描**：无 TBD；delete 排序规则已写死。
- **类型一致**：`FormatState` remap 方法与现 `FormatEventHandlerContext` 同形；`FormatController` 仍用 `formatState.formatStore`。
- **STOP 点**：若 `DefaultFormatState.test.ts` 第 3 个测试与 store 实际 delete 语义不符，**STOP+ASK**，勿 silent 改期望。

---

## 执行方式

Plan 已保存。两种执行选项：

1. **Subagent-Driven（推荐）** — 每 Task 派独立 subagent，Task 间 review
2. **Inline Execution** — 本会话按 Task 1→4 连续执行，Task 3 后 checkpoint

选哪种？
