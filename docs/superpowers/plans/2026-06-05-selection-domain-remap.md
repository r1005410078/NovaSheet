# Selection Domain Remap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 `row/` 模板把 selection remap 从 `DefaultGridEngine` 正式迁入 `selection/` 领域，而不是停留在纯函数抽离。

**Architecture:** `selection/` 新增领域接口、默认状态聚合根、纯规则与事件处理器。`DefaultGridEngine` 只保留 composer 职责：创建 selection state、在少数需要 engine 快照的路径传入最小数据、记录 undo selection 快照、rebuild viewport。

**Tech Stack:** TypeScript strict、`bun:test`、现有 `SelectionModel`、`GridEventPipeline`、row/column domain events。

**Spec:** `docs/superpowers/specs/2026-06-05-selection-domain-remap-design.md`

---

## Current Gap

上一轮未提交改动只新增了 `SelectionRemap.ts` 纯函数并让 `DefaultGridEngine` 直接调用它。这不符合 `row/` 模板：

| 维度 | 当前状态 | 正确目标 |
| --- | --- | --- |
| 领域接口 | 无 | `SelectionState.ts` 定义富接口 + handler 窄接口 |
| 聚合根 | `DefaultGridEngine` 直接持有 `SelectionModel` | `DefaultSelectionState` 持有 `SelectionModel` |
| 纯规则 | `SelectionRemap.ts` 混合命名 | `SelectionRules.ts` 放纯算法 |
| event handler | 无 | `SelectionEventHandler` 响应 row/column 结构事件 |
| engine | 仍知道 remap 细节 | 只调用 selection 领域能力 |

执行本计划时，不要把上一轮错误中间态直接提交；应重塑为本计划的领域形状后再提交。

## File Map

| 文件 | 动作 | 职责 |
| --- | --- | --- |
| `packages/core/src/engine/selection/SelectionRules.ts` | Create/rename from `SelectionRemap.ts` | selection remap 纯算法 |
| `packages/core/src/engine/selection/SelectionState.ts` | Create | selection 领域接口，类似 `RowStructure.ts` |
| `packages/core/src/engine/selection/DefaultSelectionState.ts` | Create | selection 聚合根，内部持有 `SelectionModel` |
| `packages/core/src/engine/selection/SelectionEventHandler.ts` | Create | 响应 `GridDomainEvent`，调用 selection 聚合根 |
| `packages/core/src/engine/selection/SelectionRemap.ts` | Delete | 错误中间态名称，避免函数袋 |
| `packages/core/src/engine/DefaultGridEngine.ts` | Modify | 从 `SelectionModel` 直连改为 `DefaultSelectionState` |
| `packages/core/src/engine/selection/README.md` | Modify | 记录 selection 领域边界 |
| `packages/core/src/engine/README.md` | Modify | 第 4 项仅在完成后标 ✅ |
| `packages/core/tests/engine/selection/SelectionRules.test.ts` | Create/rename | 纯规则测试 |
| `packages/core/tests/engine/selection/DefaultSelectionState.test.ts` | Create | 聚合根测试 |
| `packages/core/tests/engine/selection/SelectionEventHandler.test.ts` | Create | event handler 测试 |
| `packages/core/tests/engine/DefaultGridEngine.*.test.ts` | Modify only if needed | facade 回归保持行为 |

## Task 1: Rename Pure Rules

**Files:**
- Rename: `packages/core/src/engine/selection/SelectionRemap.ts` -> `packages/core/src/engine/selection/SelectionRules.ts`
- Rename: `packages/core/tests/engine/selection/SelectionRemap.test.ts` -> `packages/core/tests/engine/selection/SelectionRules.test.ts`

- [ ] **Step 1: Rename files**

Run:

```bash
git mv packages/core/src/engine/selection/SelectionRemap.ts packages/core/src/engine/selection/SelectionRules.ts
git mv packages/core/tests/engine/selection/SelectionRemap.test.ts packages/core/tests/engine/selection/SelectionRules.test.ts
```

- [ ] **Step 2: Rename imports only**

In `packages/core/tests/engine/selection/SelectionRules.test.ts`, change import path to:

```ts
import {
  remapSelectionAfterViewRowsChanged,
  remapSelectionByRowIndexMap,
  remapSelectionByVisibleFieldIds,
} from '../../../src/engine/selection/SelectionRules'
```

In `packages/core/src/engine/DefaultGridEngine.ts`, temporarily change import path to:

```ts
import {
  remapSelectionAfterViewRowsChanged,
  remapSelectionByRowIndexMap,
  remapSelectionByVisibleFieldIds,
} from './selection/SelectionRules'
```

- [ ] **Step 3: Run focused rule tests**

Run:

```bash
bun test packages/core/tests/engine/selection/SelectionRules.test.ts
```

Expected: PASS. This task is a rename baseline; no behavior change.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/engine/selection/SelectionRules.ts packages/core/tests/engine/selection/SelectionRules.test.ts packages/core/src/engine/DefaultGridEngine.ts
git commit -m "refactor(core): 重命名 selection remap 纯规则"
```

## Task 2: Add SelectionState Aggregate

**Files:**
- Create: `packages/core/src/engine/selection/SelectionState.ts`
- Create: `packages/core/src/engine/selection/DefaultSelectionState.ts`
- Create: `packages/core/tests/engine/selection/DefaultSelectionState.test.ts`

- [ ] **Step 1: Write failing aggregate tests**

Create `packages/core/tests/engine/selection/DefaultSelectionState.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { DefaultSelectionState } from '../../../src/engine/selection/DefaultSelectionState'
import type { GridSelection } from '../../../src/interaction/SelectionModel'

describe('DefaultSelectionState', () => {
  it('wraps basic selection model operations', () => {
    const selection = new DefaultSelectionState()

    selection.selectCell({ rowIndex: 1, colIndex: 2 })

    expect(selection.getSelection().selectedRange).toEqual({
      startRow: 1,
      endRow: 1,
      startCol: 2,
      endCol: 2,
    })
  })

  it('restores moved row selections by row index map', () => {
    const selection = new DefaultSelectionState()
    selection.setSelection({
      activeCell: { rowIndex: 1, colIndex: 0 },
      anchorCell: { rowIndex: 1, colIndex: 0 },
      extentCell: { rowIndex: 2, colIndex: 0 },
      selectedRange: { startRow: 1, endRow: 2, startCol: 0, endCol: 0 },
    })

    selection.restoreByRowIndexMap(new Map([[1, 2], [2, 3]]))

    expect(selection.getSelection().selectedRange).toEqual({
      startRow: 2,
      endRow: 3,
      startCol: 0,
      endCol: 0,
    })
  })

  it('captures visible field ids before column move and restores by current ids', () => {
    const selection = new DefaultSelectionState()
    selection.setSelection({
      activeCell: { rowIndex: 0, colIndex: 1 },
      anchorCell: { rowIndex: 0, colIndex: 1 },
      extentCell: { rowIndex: 0, colIndex: 2 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 1, endCol: 2 },
    })

    selection.captureVisibleFieldIdsBefore(['a', 'b', 'c', 'd'])
    selection.restoreByCapturedVisibleFieldIds(['a', 'd', 'b', 'c'])

    expect(selection.getSelection().selectedRange).toEqual({
      startRow: 0,
      endRow: 0,
      startCol: 2,
      endCol: 3,
    })
  })

  it('clears invalid incomplete selections through the same contract as SelectionModel', () => {
    const selection = new DefaultSelectionState()
    const empty: GridSelection = {
      activeCell: null,
      anchorCell: null,
      extentCell: null,
      selectedRange: null,
    }

    selection.setSelection(empty)

    expect(selection.getSelection()).toEqual(empty)
  })
})
```

- [ ] **Step 2: Verify red**

Run:

```bash
bun test packages/core/tests/engine/selection/DefaultSelectionState.test.ts
```

Expected: FAIL with module/export not found for `DefaultSelectionState`.

- [ ] **Step 3: Add `SelectionState.ts`**

Create `packages/core/src/engine/selection/SelectionState.ts`:

```ts
import type {
  CellAddress,
  CellRange,
  GridSelection,
  SelectCellOptions,
} from '../../interaction/SelectionModel'
import type { GridIndexBounds, SelectionNavigationIntent } from '../../interaction/SelectionNavigation'

/** Selection handler 需要的最小写入面。 */
export interface SelectionCommands {
  remapAfterRowsInserted(at: number, count: number): void
  remapAfterRowsDeleted(rowIds: readonly number[]): void
  remapAfterColsInserted(at: number, count: number): void
  remapAfterColsDeleted(colIndices: readonly number[]): void
  restoreByRowIndexMap(indexMap: ReadonlyMap<number, number>): void
  captureVisibleFieldIdsBefore(fieldIds: readonly string[]): void
  restoreByCapturedVisibleFieldIds(currentFieldIds: readonly string[]): void
}

/** 选区领域聚合根接口：封装 SelectionModel 与结构变化后的恢复规则。 */
export interface SelectionState extends SelectionCommands {
  getSelection(): GridSelection
  setSelection(selection: GridSelection): void
  selectCell(cell: CellAddress, options?: SelectCellOptions): void
  clear(): void
  setSelectedRange(range: CellRange): void
  navigate(intent: SelectionNavigationIntent, bounds: GridIndexBounds): CellAddress | null
  remapAfterViewRowsChanged(context: {
    oldViewRowToRaw(viewRow: number): number
    rawRowToView(rawRow: number): number
  }): void
}
```

- [ ] **Step 4: Add `DefaultSelectionState.ts`**

Create `packages/core/src/engine/selection/DefaultSelectionState.ts`:

```ts
import { SelectionModel } from '../../interaction/SelectionModel'
import type {
  CellAddress,
  CellRange,
  GridSelection,
  SelectCellOptions,
} from '../../interaction/SelectionModel'
import type { GridIndexBounds, SelectionNavigationIntent } from '../../interaction/SelectionNavigation'
import {
  remapSelectionAfterViewRowsChanged,
  remapSelectionByRowIndexMap,
  remapSelectionByVisibleFieldIds,
} from './SelectionRules'
import type { SelectionState } from './SelectionState'

/** 默认 selection 聚合根；内部持有 SelectionModel，向 engine 暴露领域能力。 */
export class DefaultSelectionState implements SelectionState {
  private readonly model = new SelectionModel()
  private visibleFieldIdsBefore: readonly string[] | null = null

  getSelection(): GridSelection {
    return this.model.getSelection()
  }

  setSelection(selection: GridSelection): void {
    this.model.setSelection(selection)
  }

  selectCell(cell: CellAddress, options?: SelectCellOptions): void {
    this.model.selectCell(cell, options)
  }

  clear(): void {
    this.model.clear()
  }

  setSelectedRange(range: CellRange): void {
    this.model.setSelectedRange(range)
  }

  navigate(intent: SelectionNavigationIntent, bounds: GridIndexBounds): CellAddress | null {
    return this.model.navigate(intent, bounds)
  }

  remapAfterRowsInserted(at: number, count: number): void {
    this.model.remapAfterRowsInserted(at, count)
  }

  remapAfterRowsDeleted(rowIds: readonly number[]): void {
    this.model.remapAfterRowsDeleted(rowIds)
  }

  remapAfterColsInserted(at: number, count: number): void {
    this.model.remapAfterColsInserted(at, count)
  }

  remapAfterColsDeleted(colIndices: readonly number[]): void {
    this.model.remapAfterColsDeleted(colIndices)
  }

  restoreByRowIndexMap(indexMap: ReadonlyMap<number, number>): void {
    this.model.setSelection(remapSelectionByRowIndexMap(this.model.getSelection(), indexMap))
  }

  captureVisibleFieldIdsBefore(fieldIds: readonly string[]): void {
    this.visibleFieldIdsBefore = [...fieldIds]
  }

  restoreByCapturedVisibleFieldIds(currentFieldIds: readonly string[]): void {
    if (!this.visibleFieldIdsBefore) return
    this.model.setSelection(
      remapSelectionByVisibleFieldIds(
        this.model.getSelection(),
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
    this.model.setSelection(remapSelectionAfterViewRowsChanged(this.model.getSelection(), context))
  }
}
```

- [ ] **Step 5: Verify green**

Run:

```bash
bun test packages/core/tests/engine/selection/DefaultSelectionState.test.ts packages/core/tests/engine/selection/SelectionRules.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/engine/selection/SelectionState.ts packages/core/src/engine/selection/DefaultSelectionState.ts packages/core/tests/engine/selection/DefaultSelectionState.test.ts
git commit -m "feat(core): 新增 selection 领域聚合根"
```

## Task 3: Add SelectionEventHandler

**Files:**
- Create: `packages/core/src/engine/selection/SelectionEventHandler.ts`
- Create: `packages/core/tests/engine/selection/SelectionEventHandler.test.ts`

- [ ] **Step 1: Write failing handler tests**

Create `packages/core/tests/engine/selection/SelectionEventHandler.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { SelectionEventHandler } from '../../../src/engine/selection/SelectionEventHandler'
import type { SelectionCommands } from '../../../src/engine/selection/SelectionState'

function makeCommands(calls: string[]): SelectionCommands {
  return {
    remapAfterRowsInserted: (at, count) => calls.push(`rows-inserted:${at}:${count}`),
    remapAfterRowsDeleted: (rowIds) => calls.push(`rows-deleted:${rowIds.join(',')}`),
    remapAfterColsInserted: (at, count) => calls.push(`cols-inserted:${at}:${count}`),
    remapAfterColsDeleted: (colIndices) => calls.push(`cols-deleted:${colIndices.join(',')}`),
    restoreByRowIndexMap: (indexMap) => calls.push(`rows-moved:${indexMap.size}`),
    captureVisibleFieldIdsBefore: (fieldIds) => calls.push(`capture:${fieldIds.join(',')}`),
    restoreByCapturedVisibleFieldIds: (fieldIds) => calls.push(`cols-moved:${fieldIds.join(',')}`),
  }
}

describe('SelectionEventHandler', () => {
  it('remaps selection for row structural events', () => {
    const calls: string[] = []
    const handler = new SelectionEventHandler(makeCommands(calls), {
      getVisibleFieldIds: () => ['a', 'b'],
    })

    handler.handle({ kind: 'rowsInserted', at: 1, count: 2, newRowIds: [1, 2] })
    handler.handle({ kind: 'rowsDeleted', rowIds: [3], snapshots: [], deletedHeights: [] })
    handler.handle({ kind: 'rowsMoved', rowIds: [1], beforeRowId: null, inverseRowIds: [2], inverseBeforeRowId: 1, indexMap: new Map([[1, 2]]) })

    expect(calls).toEqual(['rows-inserted:1:2', 'rows-deleted:3', 'rows-moved:1'])
  })

  it('remaps selection for column insert/delete and column move using current visible ids', () => {
    const calls: string[] = []
    const handler = new SelectionEventHandler(makeCommands(calls), {
      getVisibleFieldIds: () => ['a', 'd', 'b', 'c'],
    })

    handler.handle({ kind: 'columnsInserted', at: 1, count: 1, newFields: [] })
    handler.handle({ kind: 'columnsDeleted', removedIndices: [2], snapshots: [], deletedWidths: [] })
    handler.handle({ kind: 'columnsMoved', fieldIds: ['b', 'c'], beforeFieldId: null, inverseBeforeFieldId: 'd', indexMap: new Map() })

    expect(calls).toEqual(['cols-inserted:1:1', 'cols-deleted:2', 'cols-moved:a,d,b,c'])
  })

  it('ignores hide and unhide events because view selection remap is preserved for now', () => {
    const calls: string[] = []
    const handler = new SelectionEventHandler(makeCommands(calls), {
      getVisibleFieldIds: () => [],
    })

    handler.handle({ kind: 'rowsHidden', rowIds: [1] })
    handler.handle({ kind: 'rowsUnhidden', rowIds: [1] })
    handler.handle({ kind: 'columnsHidden', fieldIds: ['a'] })
    handler.handle({ kind: 'columnsUnhidden', fieldIds: ['a'] })

    expect(calls).toEqual([])
  })
})
```

- [ ] **Step 2: Verify red**

Run:

```bash
bun test packages/core/tests/engine/selection/SelectionEventHandler.test.ts
```

Expected: FAIL with module/export not found for `SelectionEventHandler`.

- [ ] **Step 3: Implement handler**

Create `packages/core/src/engine/selection/SelectionEventHandler.ts`:

```ts
import type { GridDomainEvent } from '../event/GridDomainEvent'
import type { GridDomainEventHandler } from '../event/GridEventPipeline'
import type { SelectionCommands } from './SelectionState'

export interface SelectionEventHandlerContext {
  getVisibleFieldIds(): readonly string[]
}

/** Selection 领域响应结构事件；不 dispatch 新事件。 */
export class SelectionEventHandler implements GridDomainEventHandler {
  constructor(
    private readonly selection: SelectionCommands,
    private readonly context: SelectionEventHandlerContext,
  ) {}

  handle(event: GridDomainEvent): void {
    switch (event.kind) {
      case 'rowsInserted':
        this.selection.remapAfterRowsInserted(event.at, event.count)
        return
      case 'rowsDeleted':
        this.selection.remapAfterRowsDeleted(event.rowIds)
        return
      case 'rowsMoved':
        this.selection.restoreByRowIndexMap(event.indexMap)
        return
      case 'columnsInserted':
        this.selection.remapAfterColsInserted(event.at, event.count)
        return
      case 'columnsDeleted':
        this.selection.remapAfterColsDeleted(event.removedIndices)
        return
      case 'columnsMoved':
        this.selection.restoreByCapturedVisibleFieldIds(this.context.getVisibleFieldIds())
        return
      case 'rowsHidden':
      case 'rowsUnhidden':
      case 'columnsHidden':
      case 'columnsUnhidden':
        return
    }
  }
}
```

- [ ] **Step 4: Verify green**

Run:

```bash
bun test packages/core/tests/engine/selection/SelectionEventHandler.test.ts packages/core/tests/engine/event/GridEventPipeline.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/engine/selection/SelectionEventHandler.ts packages/core/tests/engine/selection/SelectionEventHandler.test.ts
git commit -m "feat(core): 接入 selection 结构事件处理器"
```

## Task 4: Wire DefaultGridEngine to SelectionState

**Files:**
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`
- Test: existing engine regression tests

- [ ] **Step 1: Write/confirm failing engine boundary test**

Add to `packages/core/tests/engine/DefaultGridEngine.col-reorder.test.ts`:

```ts
  it('keeps a moved column selection anchored when a hidden column exists', () => {
    const engine = makeEngine()
    engine.hideCols(['a'])
    engine.setSelection({
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 0, colIndex: 1 },
      selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 1 },
    })

    engine.moveCols(['b', 'c'], null)

    expect(engine.getSelection().selectedRange).toEqual({
      startRow: 0,
      endRow: 0,
      startCol: 1,
      endCol: 2,
    })
  })
```

- [ ] **Step 2: Verify red if current behavior is not already covered**

Run:

```bash
bun test packages/core/tests/engine/DefaultGridEngine.col-reorder.test.ts
```

Expected: PASS or FAIL are both informative. If PASS, keep the test as regression. If FAIL, implement next step to restore fieldId anchoring.

- [ ] **Step 3: Replace `SelectionModel` with `DefaultSelectionState`**

In `packages/core/src/engine/DefaultGridEngine.ts`:

```ts
import { DefaultSelectionState } from './selection/DefaultSelectionState'
import { SelectionEventHandler } from './selection/SelectionEventHandler'
```

Remove direct import of `SelectionModel` and `SelectionRules` functions from engine. Keep type imports from `SelectionModel`:

```ts
import type {
  CellAddress,
  CellRange,
  GridSelection,
  SelectCellOptions,
} from '../interaction/SelectionModel'
```

Change field:

```ts
private readonly selection = new DefaultSelectionState()
```

Add `SelectionEventHandler` before `FormatEventHandler` in `eventPipeline`:

```ts
private readonly eventPipeline = new GridEventPipeline([
  new SelectionEventHandler(this.selection, {
    getVisibleFieldIds: () => this.data.getSchema().fields.map((field) => field.id),
  }),
  new FormatEventHandler({
    // existing context unchanged
  }),
])
```

- [ ] **Step 4: Remove duplicate post-command selection remap calls**

In structural mutation methods, remove these direct calls because `SelectionEventHandler` now handles them during command dispatch:

```ts
this.selection.remapAfterRowsInserted(event.at, event.count)
this.selection.remapAfterRowsDeleted(event.rowIds)
this.selection.restoreByRowIndexMap(event.indexMap)
this.selection.remapAfterColsInserted(event.at, event.count)
this.selection.remapAfterColsDeleted(event.removedIndices)
this.selection.restoreByCapturedVisibleFieldIds(...)
```

Keep `selectionBefore` / `selectionAfter` snapshots exactly where they are.

- [ ] **Step 5: Preserve column move fieldId anchoring**

Before `moveColsCommand.execute`, capture the visible ids:

```ts
this.selection.captureVisibleFieldIdsBefore(this.data.getSchema().fields.map((field) => field.id))
```

Do not pass full engine or column structure into selection.

- [ ] **Step 6: Keep `setViewData` explicit**

For `setViewData(...oldResolveUnderlyingRow)`, use the aggregate method:

```ts
this.selection.remapAfterViewRowsChanged({
  oldViewRowToRaw: options.oldResolveUnderlyingRow,
  rawRowToView: (rawRow) => this.coords.rawRowToView(rawRow),
})
```

This path is not a row/column domain event, so it stays as explicit engine orchestration.

- [ ] **Step 7: Run focused engine tests**

Run:

```bash
bun test packages/core/tests/engine/DefaultGridEngine.test.ts packages/core/tests/engine/DefaultGridEngine.row-reorder.test.ts packages/core/tests/engine/DefaultGridEngine.col-reorder.test.ts packages/core/tests/engine/DefaultGridEngine.row-mutations.test.ts packages/core/tests/engine/DefaultGridEngine.col-mutations.test.ts packages/core/tests/undo/UndoStack.row-reorder.test.ts packages/core/tests/undo/UndoStack.col-reorder.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/engine/DefaultGridEngine.ts packages/core/tests/engine/DefaultGridEngine.col-reorder.test.ts
git commit -m "refactor(core): 让 engine 通过 selection 领域恢复选区"
```

## Task 5: Update Docs and Delete Wrong Intermediate Name

**Files:**
- Delete: `packages/core/src/engine/selection/SelectionRemap.ts` if still present
- Modify: `packages/core/src/engine/selection/README.md`
- Modify: `packages/core/src/engine/README.md`

- [ ] **Step 1: Update selection README**

`packages/core/src/engine/selection/README.md` should state:

```md
# Selection

负责 engine 空间里的选区状态与结构变化后的恢复规则：

- 封装 `SelectionModel`，向 engine 暴露 `SelectionState` 领域接口。
- 响应 row/column 结构事件，恢复 selection。
- `SelectionRules.ts` 只放纯 remap 算法。
- `DefaultGridEngine` 只负责传入 view/raw 映射函数或 visible fieldId 快照。
```

- [ ] **Step 2: Update engine README**

Set row 4 to ✅ only after Tasks 1-4 pass:

```md
| 4 | 抽离 selection remap | ✅ | 已按 row 模板建立 `SelectionState` 聚合根、`SelectionRules` 纯算法与 `SelectionEventHandler`；engine 仅保留 composer / undo snapshot / view-row 映射注入职责（2026-06-05）。 |
```

Next candidate remains:

```md
下一步候选：接线 undo replay（第 5 步，收缩 `DefaultGridEngine.applyUndo/applyRedo` 体积）。
```

- [ ] **Step 3: Run docs-neutral focused tests**

Run:

```bash
bun test packages/core/tests/engine/selection packages/core/tests/engine/DefaultGridEngine.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/engine/selection/README.md packages/core/src/engine/README.md
git commit -m "docs(core): 更新 selection 领域迁移进度"
```

## Task 6: Full Verification

**Files:** no edits.

- [ ] **Step 1: Run lint**

```bash
bun run lint
```

Expected: exit 0, oxlint 0 errors / 0 warnings.

- [ ] **Step 2: Run typecheck**

```bash
bun run --filter '*' typecheck
```

Expected: all workspaces exit 0.

- [ ] **Step 3: Run tests**

```bash
bun test
```

Expected: all tests pass.

- [ ] **Step 4: Run builds in required order**

```bash
bun run --filter @novasheet/web build && bun run --filter @novasheet/web-canvas2d build && bun run --filter @novasheet/core build
```

Expected: all three builds exit 0.

- [ ] **Step 5: Final status check**

```bash
git status --short
```

Expected: clean except intentional untracked/modified files if the user asked not to commit. If commits were made per task, status should be clean.

## Self-Review

| Check | Result |
| --- | --- |
| Spec coverage | 覆盖第 4 项：selection rules、领域聚合根、event handler、engine composer 接线、docs。 |
| Placeholder scan | 无 TBD/TODO/“类似上一步”；每个 task 有路径、命令、期望。 |
| Type consistency | `SelectionCommands` 被 `SelectionEventHandler` 使用；`SelectionState` 被 `DefaultSelectionState` 实现；engine 只依赖 aggregate。 |
| Known risk | `columnsMoved` 需要 `visibleFieldIdsBefore` 快照；计划用 `captureVisibleFieldIdsBefore` 明确处理，不扩展 column event。 |
| Scope guard | 不进入 undo 第 5 项；undo replay 仍留给下一计划。 |
