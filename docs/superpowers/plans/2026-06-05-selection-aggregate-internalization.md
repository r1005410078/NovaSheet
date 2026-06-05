# Selection Aggregate Internalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `DefaultSelectionState` 直接持有 selection 状态并接管旧 `SelectionModel` 状态机，删除 `interaction/SelectionModel.ts` 与 `interaction/SelectionNavigation.ts`。

**Architecture:** 先用 `SelectionTypes.ts` 固定 public type surface，再把 navigation 纯规则迁入 `engine/selection/`，最后把旧状态机方法内化到 `DefaultSelectionState`。`interaction/` 只保留非 selection 的交互工具；`DefaultGridEngine` 和 render/format/fill/merge 等模块只依赖 `engine/selection` 的类型与能力。

**Tech Stack:** TypeScript strict、`bun:test`、`bun` workspace、现有 `coords/remap.ts` 与 `engine/selection/SelectionRules.ts`。

**Spec:** `docs/superpowers/specs/2026-06-05-selection-aggregate-internalization-design.md`

---

## File Map

| 文件 | 动作 | 职责 |
| --- | --- | --- |
| `packages/core/src/engine/selection/SelectionTypes.ts` | Create | `CellAddress` / `CellRange` / `GridSelection` / `SelectCellOptions` 类型唯一来源 |
| `packages/core/src/engine/selection/SelectionNavigation.ts` | Create by move | 键盘 navigation 纯规则 |
| `packages/core/src/engine/selection/DefaultSelectionState.ts` | Modify | selection 聚合根，直接持有 `GridSelection` 与 remap 状态 |
| `packages/core/src/engine/selection/SelectionState.ts` | Modify | 聚合根接口改用本领域类型与 navigation intent |
| `packages/core/src/engine/selection/SelectionRules.ts` | Modify imports | remap 纯规则改用 `SelectionTypes` |
| `packages/core/src/interaction/SelectionModel.ts` | Delete | 旧中间状态机 |
| `packages/core/src/interaction/SelectionNavigation.ts` | Delete | 旧路径，迁入 selection 领域 |
| `packages/core/src/index.ts` | Modify | 删除 `SelectionModel` class export，保留 types/navigation exports |
| `packages/core/src/**` | Modify imports | 从 `interaction/SelectionModel` 切到 `engine/selection/SelectionTypes` |
| `packages/core/tests/engine/selection/*.test.ts` | Create/modify | 聚合根基础、remap、navigation 测试 |
| `packages/core/tests/interaction/Selection*.test.ts` | Delete/move | selection tests 不再放 interaction |
| `packages/core/src/engine/selection/README.md` | Modify | 记录 selection 聚合根终态 |
| `packages/core/src/engine/README.md` | Modify | 更新第 4 项说明 |

## Acceptance

| 检查 | 命令 | 期望 |
| --- | --- | --- |
| 源码无旧状态机 | `rg "SelectionModel" packages/core/src packages/web/src packages/web-canvas2d/src apps` | 无输出 |
| 源码无旧 selection interaction import | `rg "interaction/Selection" packages/core/src packages/web/src packages/web-canvas2d/src apps` | 无输出 |
| lint | `bun run lint` | 0 errors / 0 warnings |
| typecheck | `bun run --filter '*' typecheck` | PASS |
| tests | `bun test` | PASS |
| builds | `bun run --filter @novasheet/web build && bun run --filter @novasheet/web-canvas2d build && bun run --filter @novasheet/core build` | PASS |

## Task 1: Create SelectionTypes And Migrate Type Imports

**Files:**
- Create: `packages/core/src/engine/selection/SelectionTypes.ts`
- Modify: `packages/core/src/engine/selection/SelectionRules.ts`
- Modify: all `packages/core/src/**` and `packages/core/tests/**` type imports that currently reference `interaction/SelectionModel`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: Write the new type module**

Create `packages/core/src/engine/selection/SelectionTypes.ts`:

```ts
export interface CellAddress {
  readonly rowIndex: number
  readonly colIndex: number
}

export interface CellRange {
  readonly startRow: number
  readonly endRow: number
  readonly startCol: number
  readonly endCol: number
}

export interface GridSelection {
  readonly activeCell: CellAddress | null
  readonly anchorCell: CellAddress | null
  readonly extentCell: CellAddress | null
  readonly selectedRange: CellRange | null
}

export interface SelectCellOptions {
  readonly extend?: boolean
}
```

- [x] **Step 2: Update internal type imports**

Replace type imports from `../interaction/SelectionModel`, `../../interaction/SelectionModel`, `./SelectionModel`, and `../../../src/interaction/SelectionModel` with the relative path to `engine/selection/SelectionTypes`.

Examples:

```ts
import type { CellRange } from '../engine/selection/SelectionTypes'
```

```ts
import type { CellAddress } from '../engine/selection/SelectionTypes'
```

```ts
import type { GridSelection } from '../../../src/engine/selection/SelectionTypes'
```

For files already under `packages/core/src/engine/selection/`, use:

```ts
import type { GridSelection } from './SelectionTypes'
```

- [x] **Step 3: Update public type exports**

In `packages/core/src/index.ts`, replace the selection type export with:

```ts
export type {
  CellAddress,
  CellRange,
  GridSelection,
  SelectCellOptions,
} from './engine/selection/SelectionTypes'
```

Keep this class export for this task only; it is removed in Task 4:

```ts
export { SelectionModel } from './interaction/SelectionModel'
```

- [x] **Step 4: Run type-focused checks**

Run:

```bash
bun run --filter @novasheet/core typecheck
bun test packages/core/tests/engine/selection packages/core/tests/interaction/SelectionModel.test.ts packages/core/tests/interaction/SelectionModel.remap.test.ts
```

Expected: PASS. This task only changes type ownership; runtime behavior is unchanged.

- [x] **Step 5: Commit**

```bash
git add packages/core/src packages/core/tests
git commit -m "refactor(core): 迁移 selection 类型到领域目录"
```

## Task 2: Move SelectionNavigation Into Engine Selection

**Files:**
- Move: `packages/core/src/interaction/SelectionNavigation.ts` -> `packages/core/src/engine/selection/SelectionNavigation.ts`
- Move: `packages/core/tests/interaction/SelectionNavigation.test.ts` -> `packages/core/tests/engine/selection/SelectionNavigation.test.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`
- Modify: `packages/core/src/engine/selection/DefaultSelectionState.ts`
- Modify: `packages/core/src/engine/selection/SelectionState.ts`
- Modify: `packages/core/src/interaction/SelectionModel.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: Move source and test files**

Run:

```bash
git mv packages/core/src/interaction/SelectionNavigation.ts packages/core/src/engine/selection/SelectionNavigation.ts
git mv packages/core/tests/interaction/SelectionNavigation.test.ts packages/core/tests/engine/selection/SelectionNavigation.test.ts
```

- [x] **Step 2: Update navigation imports**

In `packages/core/src/engine/selection/SelectionNavigation.ts`, use:

```ts
import type { CellAddress, GridSelection, SelectCellOptions } from './SelectionTypes'
```

In `packages/core/src/engine/DefaultGridEngine.ts`, use:

```ts
import { parseSelectionNavigationKey } from './selection/SelectionNavigation'
```

In `packages/core/src/engine/selection/DefaultSelectionState.ts` and `SelectionState.ts`, use:

```ts
import type {
  GridIndexBounds,
  SelectionNavigationIntent,
} from './SelectionNavigation'
```

In `packages/core/src/interaction/SelectionModel.ts`, keep the old model in place but import navigation from the new domain path:

```ts
import type {
  GridIndexBounds,
  SelectionNavigationIntent,
} from '../engine/selection/SelectionNavigation'
import { applySelectionNavigation } from '../engine/selection/SelectionNavigation'
```

In `packages/core/src/index.ts`, export navigation from the new path:

```ts
export {
  applySelectionNavigation,
  parseSelectionNavigationKey,
} from './engine/selection/SelectionNavigation'
export type {
  GridIndexBounds,
  SelectionNavigationIntent,
  SelectionNavigationTarget,
} from './engine/selection/SelectionNavigation'
```

- [x] **Step 3: Update navigation tests but keep old model target**

In `packages/core/tests/engine/selection/SelectionNavigation.test.ts`, imports should be:

```ts
import { describe, expect, it } from 'bun:test'
import {
  applySelectionNavigation,
  parseSelectionNavigationKey,
  type GridIndexBounds,
} from '../../../src/engine/selection/SelectionNavigation'
import { SelectionModel } from '../../../src/interaction/SelectionModel'
```

Keep `SelectionModel` in this task so the file move is isolated from state-machine deletion.

- [x] **Step 4: Run focused tests**

Run:

```bash
bun test packages/core/tests/engine/selection/SelectionNavigation.test.ts
bun run --filter @novasheet/core typecheck
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/core/src packages/core/tests
git commit -m "refactor(core): 迁移 selection navigation 到领域目录"
```

## Task 3: Internalize SelectionModel State Into DefaultSelectionState

**Files:**
- Modify: `packages/core/src/engine/selection/DefaultSelectionState.ts`
- Modify: `packages/core/tests/engine/selection/DefaultSelectionState.test.ts`
- Create: `packages/core/tests/engine/selection/DefaultSelectionState.remap.test.ts`
- Modify: `packages/core/tests/engine/selection/SelectionNavigation.test.ts`

- [x] **Step 1: Rename legacy behavior tests to aggregate tests**

Run:

```bash
git mv packages/core/tests/interaction/SelectionModel.remap.test.ts packages/core/tests/engine/selection/DefaultSelectionState.remap.test.ts
```

Update `DefaultSelectionState.remap.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { DefaultSelectionState } from '../../../src/engine/selection/DefaultSelectionState'
```

Replace `new SelectionModel()` with:

```ts
new DefaultSelectionState()
```

Change describe labels from `SelectionModel...` to `DefaultSelectionState...`.

- [x] **Step 2: Extend basic aggregate tests**

Add the legacy basic selection tests from `packages/core/tests/interaction/SelectionModel.test.ts` into `packages/core/tests/engine/selection/DefaultSelectionState.test.ts`, targeting `DefaultSelectionState`.

Use the updated error prefix:

```ts
expect(() =>
  selection.setSelection({
    activeCell: null,
    anchorCell: null,
    extentCell: null,
    selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
  }),
).toThrow('DefaultSelectionState.setSelection')
```

- [x] **Step 3: Update navigation test target**

In `packages/core/tests/engine/selection/SelectionNavigation.test.ts`, replace:

```ts
import { SelectionModel } from '../../../src/interaction/SelectionModel'
```

with:

```ts
import { DefaultSelectionState } from '../../../src/engine/selection/DefaultSelectionState'
```

Replace every `new SelectionModel()` with `new DefaultSelectionState()`.

Change describe label:

```ts
describe('DefaultSelectionState.navigate — Phase 3.3', () => {
```

- [x] **Step 4: Verify red if implementation has not changed**

Run:

```bash
bun test packages/core/tests/engine/selection/DefaultSelectionState.test.ts packages/core/tests/engine/selection/DefaultSelectionState.remap.test.ts packages/core/tests/engine/selection/SelectionNavigation.test.ts
```

Expected: FAIL because `DefaultSelectionState.setSelection` still throws `SelectionModel.setSelection`, or because direct state ownership is not yet implemented. If everything passes before implementation, stop and inspect whether tests still instantiate or depend on `SelectionModel`.

- [x] **Step 5: Replace wrapper implementation with direct aggregate state**

In `packages/core/src/engine/selection/DefaultSelectionState.ts`, remove:

```ts
import { SelectionModel } from '../../interaction/SelectionModel'
```

and add:

```ts
import {
  remapColIndexAfterDelete,
  remapColIndexAfterInsert,
  remapRowIndexAfterDelete,
  remapRowIndexAfterInsert,
} from '../../coords/remap'
import { applySelectionNavigation } from './SelectionNavigation'
```

Use local empty state and normalize helper:

```ts
const EMPTY_SELECTION: GridSelection = {
  activeCell: null,
  anchorCell: null,
  extentCell: null,
  selectedRange: null,
}

function normalizeRange(anchor: CellAddress, extent: CellAddress): CellRange {
  return {
    startRow: Math.min(anchor.rowIndex, extent.rowIndex),
    endRow: Math.max(anchor.rowIndex, extent.rowIndex),
    startCol: Math.min(anchor.colIndex, extent.colIndex),
    endCol: Math.max(anchor.colIndex, extent.colIndex),
  }
}
```

The class must directly own state:

```ts
export class DefaultSelectionState implements SelectionState {
  private selection: GridSelection = EMPTY_SELECTION
  private visibleFieldIdsBefore: readonly string[] | null = null

  getSelection(): GridSelection {
    return this.selection
  }
}
```

Move the old `SelectionModel` method bodies into this class. Every old `this.model.getSelection()` call becomes `this.getSelection()`, every old `this.model.setSelection(next)` call becomes `this.setSelection(next)`, and direct selection writes assign `this.selection = next`. Error messages must use:

```ts
throw new Error('DefaultSelectionState.setSelection: empty selection cannot include a range')
throw new Error('DefaultSelectionState.setSelection: non-empty selection requires all endpoints')
throw new Error('DefaultSelectionState.setSelection: selectedRange must match anchor and extent')
```

Update the restore methods to call the aggregate directly:

```ts
restoreByRowIndexMap(indexMap: ReadonlyMap<number, number>): void {
  this.setSelection(remapSelectionByRowIndexMap(this.getSelection(), indexMap))
}

restoreByCapturedVisibleFieldIds(currentFieldIds: readonly string[]): void {
  if (!this.visibleFieldIdsBefore) return
  this.setSelection(
    remapSelectionByVisibleFieldIds(
      this.getSelection(),
      this.visibleFieldIdsBefore,
      currentFieldIds,
    ),
  )
  this.visibleFieldIdsBefore = null
}

remapAfterViewRowsChanged(context: {
  oldViewRowToRaw(viewRow: number): number
  rawRowToView(rawRow: number): number
}): void {
  this.setSelection(remapSelectionAfterViewRowsChanged(this.getSelection(), context))
}
```

- [x] **Step 6: Run focused aggregate tests**

Run:

```bash
bun test packages/core/tests/engine/selection/DefaultSelectionState.test.ts packages/core/tests/engine/selection/DefaultSelectionState.remap.test.ts packages/core/tests/engine/selection/SelectionNavigation.test.ts packages/core/tests/engine/selection/SelectionEventHandler.test.ts
bun run --filter @novasheet/core typecheck
```

Expected: PASS.

- [x] **Step 7: Commit**

```bash
git add packages/core/src/engine/selection packages/core/tests/engine/selection packages/core/tests/interaction
git commit -m "feat(core): 让 selection 聚合根接管状态机"
```

## Task 4: Delete Legacy SelectionModel And Finish Import Migration

**Files:**
- Delete: `packages/core/src/interaction/SelectionModel.ts`
- Delete: `packages/core/tests/interaction/SelectionModel.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: any remaining source/test imports from `interaction/SelectionModel` or `interaction/SelectionNavigation`

- [x] **Step 1: Delete old files**

Run:

```bash
git rm packages/core/src/interaction/SelectionModel.ts
git rm packages/core/tests/interaction/SelectionModel.test.ts
```

- [x] **Step 2: Remove public class export**

In `packages/core/src/index.ts`, remove:

```ts
export { SelectionModel } from './interaction/SelectionModel'
```

Ensure the public exports are exactly from the new domain files:

```ts
export type {
  CellAddress,
  CellRange,
  GridSelection,
  SelectCellOptions,
} from './engine/selection/SelectionTypes'
export {
  applySelectionNavigation,
  parseSelectionNavigationKey,
} from './engine/selection/SelectionNavigation'
export type {
  GridIndexBounds,
  SelectionNavigationIntent,
  SelectionNavigationTarget,
} from './engine/selection/SelectionNavigation'
```

- [x] **Step 3: Prove no old selection imports remain**

Run:

```bash
rg "SelectionModel" packages/core/src packages/web/src packages/web-canvas2d/src apps --glob '!**/README.md'
rg "interaction/Selection" packages/core/src packages/web/src packages/web-canvas2d/src apps --glob '!**/README.md'
```

Expected: both commands print no matches in code/app files. README and spec/plan text is updated in Task 5.
If code matches remain, update them to `engine/selection/SelectionTypes` or `engine/selection/SelectionNavigation`, or delete the legacy file/export when the match is the old `SelectionModel` class.

- [x] **Step 4: Run core checks**

Run:

```bash
bun test packages/core/tests/engine/selection
bun run --filter @novasheet/core typecheck
```

Expected: PASS.

- [x] **Step 5: Commit**

```bash
git add packages/core/src packages/core/tests
git commit -m "refactor(core): 删除 selection 旧交互状态机"
```

## Task 5: Update Selection Documentation

**Files:**
- Modify: `packages/core/src/engine/selection/README.md`
- Modify: `packages/core/src/engine/README.md`
- Modify: `docs/superpowers/specs/2026-06-05-selection-aggregate-internalization-design.md`
- Modify: `docs/superpowers/plans/2026-06-05-selection-aggregate-internalization.md`

- [x] **Step 1: Update selection README**

In `packages/core/src/engine/selection/README.md`, state:

```md
# selection

Selection 领域负责选区状态机、键盘导航、结构变化后的 selection remap。

- `SelectionTypes.ts`：selection 公共类型。
- `DefaultSelectionState.ts`：selection 聚合根，直接持有 `GridSelection`。
- `SelectionNavigation.ts`：键盘导航纯规则。
- `SelectionRules.ts`：结构变化后的 selection remap 纯规则。
- `SelectionState.ts`：聚合根富接口 + event handler 窄接口。
- `SelectionEventHandler.ts`：响应 row/column 领域事件。
```

- [x] **Step 2: Update engine README milestone row**

In `packages/core/src/engine/README.md`, update item 4 to mention:

```md
已删除旧 `interaction/SelectionModel` / `interaction/SelectionNavigation`，`DefaultSelectionState` 直接持有 `GridSelection` 并接管基础选择、键盘导航、结构 remap 状态机。
```

- [x] **Step 3: Mark spec/plan status**

In the spec, change status from:

```md
- 状态：设计已确认，待 writing-plans
```

to:

```md
- 状态：已实施
```

In this plan, keep completed checkboxes accurate for tasks already run.

- [x] **Step 4: Run docs-sensitive grep**

Run:

```bash
rg "SelectionModel|interaction/Selection" packages/core/src/engine/README.md packages/core/src/engine/selection/README.md docs/superpowers/specs/2026-06-05-selection-aggregate-internalization-design.md
```

Expected: docs may mention deleted legacy paths only as historical notes, not as current architecture.

- [x] **Step 5: Commit**

```bash
git add packages/core/src/engine/README.md packages/core/src/engine/selection/README.md docs/superpowers/specs/2026-06-05-selection-aggregate-internalization-design.md docs/superpowers/plans/2026-06-05-selection-aggregate-internalization.md
git commit -m "docs(core): 更新 selection 聚合根终态说明"
```

## Task 6: Full Verification

**Files:**
- No source edits expected unless verification finds a defect.

- [x] **Step 1: Run lint**

Run:

```bash
bun run lint
```

Expected: 0 errors / 0 warnings.

- [x] **Step 2: Run typecheck**

Run:

```bash
bun run --filter '*' typecheck
```

Expected: PASS.

- [x] **Step 3: Run tests**

Run:

```bash
bun test
```

Expected: PASS.

- [x] **Step 4: Run ordered builds**

Run:

```bash
bun run --filter @novasheet/web build && bun run --filter @novasheet/web-canvas2d build && bun run --filter @novasheet/core build
```

Expected: PASS.

- [x] **Step 5: Commit verification fixes only if needed**

If verification required code or docs fixes:

```bash
git add <fixed-files>
git commit -m "fix(core): 修正 selection 聚合根内化验证问题"
```

If no files changed, do not create an empty commit.

## Self-Review

| 检查项 | 结果 |
| --- | --- |
| Spec coverage | 覆盖类型迁移、navigation 迁移、聚合根内化、删除旧状态机、public export、docs、四项 gate。 |
| Placeholder scan | 无 `TBD` / `TODO` / “类似 Task N” / 未定义函数名。 |
| Type consistency | `SelectionTypes`、`SelectionNavigation`、`DefaultSelectionState` 的 import/export 路径在各任务中一致。 |
| Scope check | 只处理 selection；不迁移 edit/hit test/context menu，不进入 undo replay。 |
| API ambiguity | 明确删除 `SelectionModel` class export，保留 selection types 与 navigation functions。 |
