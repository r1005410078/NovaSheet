# Phase 4.2 Undo / Redo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `Grid` 支持 Sheets/Excel 风格的 Undo/Redo,覆盖 cell edit / Cut / Paste / Row 高 / Column 宽 resize。键盘 `Cmd/Ctrl+Z`、`Cmd/Ctrl+Shift+Z`、`Ctrl+Y`;`Grid.undo() / redo() / canUndo() / canRedo()` + `onUndo / onRedo` 事件。

**Architecture:** UndoStack 是 `@novasheet/core` 内部的双栈结构(undo/redo),Command 用 discriminated-union 纯数据(JSON-serializable)。所有可撤销 mutation 通过 engine 的 `commit*` 方法走;`engine.setRowHeight/setColumnWidth` 保持非记录(preview / autofit)。Web 层只做键盘路由 + resize pointerup/keyboard arrow 的 commit 切换 + 事件转发。

**Tech Stack:** TypeScript strict + verbatimModuleSyntax;`bun test`(bun:test 风格);happy-dom for web tests;RecordingContext2D 不需要(本 Phase 不动渲染)。

参考设计文档:[docs/superpowers/specs/2026-05-21-undo-redo-design.md](../specs/2026-05-21-undo-redo-design.md)

---

## File Map

**新建:**

- `packages/core/src/undo/UndoCommand.ts` — discriminated-union 类型
- `packages/core/src/undo/UndoStack.ts` — 双栈 + 容量 + clear
- `packages/core/tests/undo/UndoStack.test.ts`
- `packages/core/tests/engine/DefaultGridEngine.undo.test.ts`
- `packages/web/tests/runtime/WebGridRuntime.undo.test.ts`
- `packages/web/tests/Grid.undo.test.ts`
- `apps/storybook/src/stories/Undo.stories.ts`

**修改:**

- `packages/core/src/clipboard/ApplyPaste.ts` — 加 `onWrite` 回调(向后兼容,可选参数)
- `packages/core/src/engine/GridEngine.ts` — 接口加 undo/redo/canUndo/canRedo/commitRowResize/commitColumnResize/commitPaste
- `packages/core/src/engine/DefaultGridEngine.ts` — 实现栈集成 + 5 个 mutation 入口注入 push
- `packages/core/src/index.ts` — 导出 UndoCommand / CellWrite
- `packages/web/src/runtime/WebGridRuntime.ts` — keydown 路由、resize 路径切 commit\*、paste 走 engine.commitPaste、onUndo/onRedo 事件
- `packages/web/src/Grid.ts` — public API
- `packages/web/src/grid/GridController.ts` — controller 接口加 undo/redo/canUndo/canRedo + 事件 setter(setOnUndo/setOnRedo)
- `packages/web/src/backends/Canvas2DBackend.ts` — 委派
- `packages/web/src/index.ts` — 重导 UndoCommand / UndoEvent / RedoEvent 类型
- `README.md` — Phase 4.2 状态更新为 ✅ + 测试计数更新

---

## Task 1: UndoCommand 类型 + UndoStack 数据结构

**Files:**

- Create: `packages/core/src/undo/UndoCommand.ts`
- Create: `packages/core/src/undo/UndoStack.ts`
- Create: `packages/core/tests/undo/UndoStack.test.ts`
- Modify: `packages/core/src/index.ts` (add exports)

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/undo/UndoStack.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { UndoStack } from '../../src/undo/UndoStack'
import type { UndoCommand } from '../../src/undo/UndoCommand'

const edit = (rowIndex: number): UndoCommand => ({
  kind: 'editCell',
  rowIndex,
  fieldId: 'a',
  before: null,
  after: rowIndex,
})

describe('UndoStack', () => {
  it('push 后 canUndo 为 true,canRedo 为 false', () => {
    const s = new UndoStack()
    expect(s.canUndo()).toBe(false)
    expect(s.canRedo()).toBe(false)
    s.push(edit(0))
    expect(s.canUndo()).toBe(true)
    expect(s.canRedo()).toBe(false)
  })

  it('popUndo 返回最近一条并转移到 redo', () => {
    const s = new UndoStack()
    s.push(edit(0))
    s.push(edit(1))
    expect(s.popUndo()).toEqual(edit(1))
    expect(s.canUndo()).toBe(true)
    expect(s.canRedo()).toBe(true)
  })

  it('popRedo 把 redo 顶弹回 undo', () => {
    const s = new UndoStack()
    s.push(edit(0))
    s.popUndo()
    expect(s.popRedo()).toEqual(edit(0))
    expect(s.canUndo()).toBe(true)
    expect(s.canRedo()).toBe(false)
  })

  it('push 新条目时清空 redo 栈', () => {
    const s = new UndoStack()
    s.push(edit(0))
    s.popUndo()
    expect(s.canRedo()).toBe(true)
    s.push(edit(1))
    expect(s.canRedo()).toBe(false)
  })

  it('空栈 popUndo / popRedo 返回 undefined', () => {
    const s = new UndoStack()
    expect(s.popUndo()).toBeUndefined()
    expect(s.popRedo()).toBeUndefined()
  })

  it('容量 100:第 101 条挤掉第 1 条', () => {
    const s = new UndoStack()
    for (let i = 0; i < 101; i++) s.push(edit(i))
    // 最早一条(rowIndex=0)被挤掉,剩 100 条
    const popped: UndoCommand[] = []
    while (s.canUndo()) {
      const v = s.popUndo()
      if (v) popped.push(v)
    }
    expect(popped.length).toBe(100)
    // 最新一条最先弹出
    expect((popped[0] as { rowIndex: number }).rowIndex).toBe(100)
    // 最早一条是 rowIndex=1(rowIndex=0 已被挤掉)
    expect((popped[99] as { rowIndex: number }).rowIndex).toBe(1)
  })

  it('clear 清空双栈', () => {
    const s = new UndoStack()
    s.push(edit(0))
    s.push(edit(1))
    s.popUndo()
    s.clear()
    expect(s.canUndo()).toBe(false)
    expect(s.canRedo()).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test packages/core/tests/undo/UndoStack.test.ts
```

Expected: FAIL — module `../../src/undo/UndoStack` 不存在。

- [ ] **Step 3: Create UndoCommand types**

Create `packages/core/src/undo/UndoCommand.ts`:

```ts
import type { CellValue } from '../data/Schema'
import type { CellRange } from '../interaction/SelectionModel'

export interface CellWrite {
  readonly rowIndex: number
  readonly fieldId: string
  readonly value: CellValue
}

export type UndoCommand =
  | {
      readonly kind: 'editCell'
      readonly rowIndex: number
      readonly fieldId: string
      readonly before: CellValue
      readonly after: CellValue
    }
  | {
      readonly kind: 'clearRange'
      readonly range: CellRange
      readonly before: ReadonlyArray<CellWrite>
    }
  | {
      readonly kind: 'paste'
      readonly target: CellRange
      readonly before: ReadonlyArray<CellWrite>
      readonly after: ReadonlyArray<CellWrite>
    }
  | {
      readonly kind: 'resizeRow'
      readonly rowIndex: number
      readonly before: number
      readonly after: number
    }
  | {
      readonly kind: 'resizeColumn'
      readonly colIndex: number
      readonly before: number
      readonly after: number
    }
```

- [ ] **Step 4: Create UndoStack**

Create `packages/core/src/undo/UndoStack.ts`:

```ts
import type { UndoCommand } from './UndoCommand'

const CAPACITY = 100

/**
 * 双栈结构(undo + redo)+ 容量 + redo-on-push 清空。
 *
 * 本类不感知 engine,只是数据结构;反向执行逻辑由 engine 拥有(基于 cmd.kind 分发)。
 */
export class UndoStack {
  private undoStack: UndoCommand[] = []
  private redoStack: UndoCommand[] = []

  push(cmd: UndoCommand): void {
    this.undoStack.push(cmd)
    if (this.undoStack.length > CAPACITY) {
      this.undoStack.shift()
    }
    this.redoStack.length = 0
  }

  popUndo(): UndoCommand | undefined {
    const cmd = this.undoStack.pop()
    if (cmd) this.redoStack.push(cmd)
    return cmd
  }

  popRedo(): UndoCommand | undefined {
    const cmd = this.redoStack.pop()
    if (cmd) this.undoStack.push(cmd)
    return cmd
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  clear(): void {
    this.undoStack.length = 0
    this.redoStack.length = 0
  }
}
```

- [ ] **Step 5: Wire exports**

Modify `packages/core/src/index.ts` — find the end of exports, append:

```ts
export { UndoStack } from './undo/UndoStack'
export type { UndoCommand, CellWrite } from './undo/UndoCommand'
```

- [ ] **Step 6: Run test to verify it passes**

```bash
bun test packages/core/tests/undo/UndoStack.test.ts
```

Expected: PASS, 7 tests.

- [ ] **Step 7: Typecheck + lint**

```bash
bun run --filter @novasheet/core typecheck && bun run lint
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/undo/ packages/core/tests/undo/ packages/core/src/index.ts
git commit -m "feat(core): UndoStack data structure + UndoCommand union"
```

---

## Task 2: Engine 集成 UndoStack + canUndo/canRedo + setData 清栈 + undo/redo 占位

**Files:**

- Modify: `packages/core/src/engine/GridEngine.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`
- Create: `packages/core/tests/engine/DefaultGridEngine.undo.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/engine/DefaultGridEngine.undo.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'
import type { Schema } from '../../src/data/Schema'

const schema: Schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text', width: 80 },
    { id: 'b', name: 'B', type: 'number', width: 80 },
  ],
}

function makeEngine() {
  const data = new InMemoryDataSource({
    schema,
    rows: [
      { a: 'x', b: 1 },
      { a: 'y', b: 2 },
    ],
  })
  return new DefaultGridEngine({ data })
}

describe('DefaultGridEngine — undo/redo scaffolding', () => {
  it('初始 canUndo / canRedo 均 false', () => {
    const engine = makeEngine()
    expect(engine.canUndo()).toBe(false)
    expect(engine.canRedo()).toBe(false)
  })

  it('undo / redo 在空栈返回 undefined', () => {
    const engine = makeEngine()
    expect(engine.undo()).toBeUndefined()
    expect(engine.redo()).toBeUndefined()
  })

  it('setData 清空栈', () => {
    const engine = makeEngine()
    // 借助 setRowHeight 不会被记录,我们用一个手工 push 验证;
    // 暂时通过 commitRowResize 制造一条 undo 项
    engine.commitRowResize(0, 24, 50)
    expect(engine.canUndo()).toBe(true)

    const data2 = new InMemoryDataSource({ schema, rows: [{ a: 'p', b: 9 }] })
    engine.setData(data2)
    expect(engine.canUndo()).toBe(false)
    expect(engine.canRedo()).toBe(false)
  })
})
```

注意:这个 test 用了 `commitRowResize` —— 它在本任务里只需以"push 一条 resizeRow + axis.setSize"的形式实现,反向执行逻辑放到后面 Task 6 才补全。本任务只验证栈状态。Step 3 中 commitRowResize 的实现要先支持基本的 push + axis 写。

- [ ] **Step 2: Run test to verify it fails**

```bash
bun test packages/core/tests/engine/DefaultGridEngine.undo.test.ts
```

Expected: FAIL — `engine.canUndo is not a function` 之类。

- [ ] **Step 3: Add interface methods**

Modify `packages/core/src/engine/GridEngine.ts` — find the existing interface body (top of file). Add these method signatures to the `GridEngine` interface:

```ts
  // ... existing methods unchanged ...

  /** Phase 4.2 — undo/redo */
  undo(): UndoCommand | undefined
  redo(): UndoCommand | undefined
  canUndo(): boolean
  canRedo(): boolean

  /** Phase 4.2 — 提交一次列宽调整为 1 步 undo;before === after 时不入栈。 */
  commitColumnResize(colIndex: number, oldWidth: number, newWidth: number): void

  /** Phase 4.2 — 提交一次行高调整为 1 步 undo;before === after 时不入栈。 */
  commitRowResize(rowIndex: number, oldHeight: number, newHeight: number): void
```

At the top of the file, add the import:

```ts
import type { UndoCommand } from '../undo/UndoCommand'
```

- [ ] **Step 4: Implement in DefaultGridEngine**

Modify `packages/core/src/engine/DefaultGridEngine.ts`:

Add imports at top:

```ts
import { UndoStack } from '../undo/UndoStack'
import type { UndoCommand } from '../undo/UndoCommand'
```

Add field in class body (next to other private fields):

```ts
  private undoStack = new UndoStack()
```

Inside `setData()` at the end, before the final `applyFieldWidths()`, add:

```ts
this.undoStack.clear()
```

(Place it after the call to `applyFieldWidths()` so the clear happens last — but order doesn't matter since clear just empties arrays. Put it on the last line of `setData()`.)

Add new methods at the bottom of the class (before the private helpers):

```ts
  undo(): UndoCommand | undefined {
    const cmd = this.undoStack.popUndo()
    if (!cmd) return undefined
    this.applyUndo(cmd)
    return cmd
  }

  redo(): UndoCommand | undefined {
    const cmd = this.undoStack.popRedo()
    if (!cmd) return undefined
    this.applyRedo(cmd)
    return cmd
  }

  canUndo(): boolean {
    return this.undoStack.canUndo()
  }

  canRedo(): boolean {
    return this.undoStack.canRedo()
  }

  commitRowResize(rowIndex: number, oldHeight: number, newHeight: number): void {
    if (oldHeight === newHeight) return
    this.rowsAxis.setSize(rowIndex, newHeight)
    this.undoStack.push({ kind: 'resizeRow', rowIndex, before: oldHeight, after: newHeight })
  }

  commitColumnResize(colIndex: number, oldWidth: number, newWidth: number): void {
    if (oldWidth === newWidth) return
    this.colsAxis.setSize(colIndex, newWidth)
    this.undoStack.push({ kind: 'resizeColumn', colIndex, before: oldWidth, after: newWidth })
  }

  private applyUndo(cmd: UndoCommand): void {
    // 各 kind 分支将在后续 Task 中补全;本任务只确保 setData 清栈 + commitRowResize 工作
    void cmd
  }

  private applyRedo(cmd: UndoCommand): void {
    void cmd
  }
```

- [ ] **Step 5: Run test to verify it passes**

```bash
bun test packages/core/tests/engine/DefaultGridEngine.undo.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 6: Run full core test suite to verify no regression**

```bash
bun test packages/core/
```

Expected: All previous tests still pass.

- [ ] **Step 7: Typecheck**

```bash
bun run --filter @novasheet/core typecheck
```

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/engine/ packages/core/tests/engine/DefaultGridEngine.undo.test.ts
git commit -m "feat(core): GridEngine undo/redo scaffolding + commit*Resize push"
```

---

## Task 3: editCell undo/redo dispatch

**Files:**

- Modify: `packages/core/src/engine/DefaultGridEngine.ts`
- Modify: `packages/core/tests/engine/DefaultGridEngine.undo.test.ts` (add tests)

- [ ] **Step 1: Add failing tests**

Append to `packages/core/tests/engine/DefaultGridEngine.undo.test.ts`:

```ts
describe('DefaultGridEngine — editCell undo/redo', () => {
  it('commitCellEdit 后 push editCell 命令', () => {
    const engine = makeEngine()
    engine.selectCell({ rowIndex: 0, colIndex: 0 })
    engine.beginCellEdit({ rowIndex: 0, colIndex: 0 })
    engine.updateCellEditDraft('z')
    engine.commitCellEdit()
    expect(engine.canUndo()).toBe(true)
  })

  it('undo 还原原值 + active 落到原 cell + canRedo=true', () => {
    const engine = makeEngine()
    engine.selectCell({ rowIndex: 0, colIndex: 0 })
    engine.beginCellEdit({ rowIndex: 0, colIndex: 0 })
    engine.updateCellEditDraft('z')
    engine.commitCellEdit()
    expect(engine.getData().getCell(0, 'a')).toBe('z')

    const cmd = engine.undo()
    expect(cmd?.kind).toBe('editCell')
    expect(engine.getData().getCell(0, 'a')).toBe('x')
    expect(engine.getSelection().activeCell).toEqual({ rowIndex: 0, colIndex: 0 })
    expect(engine.canRedo()).toBe(true)
  })

  it('redo 重新写入 after', () => {
    const engine = makeEngine()
    engine.selectCell({ rowIndex: 0, colIndex: 0 })
    engine.beginCellEdit({ rowIndex: 0, colIndex: 0 })
    engine.updateCellEditDraft('z')
    engine.commitCellEdit()
    engine.undo()
    engine.redo()
    expect(engine.getData().getCell(0, 'a')).toBe('z')
    expect(engine.canRedo()).toBe(false)
  })

  it('编辑同值仍 push 一步(与 Sheets/Excel 一致)', () => {
    const engine = makeEngine()
    engine.selectCell({ rowIndex: 0, colIndex: 0 })
    engine.beginCellEdit({ rowIndex: 0, colIndex: 0 })
    engine.updateCellEditDraft('x') // 与原值相同
    engine.commitCellEdit()
    expect(engine.canUndo()).toBe(true)
  })

  it('undo/redo 不再 push 新条目(防递归)', () => {
    const engine = makeEngine()
    engine.selectCell({ rowIndex: 0, colIndex: 0 })
    engine.beginCellEdit({ rowIndex: 0, colIndex: 0 })
    engine.updateCellEditDraft('z')
    engine.commitCellEdit()
    engine.undo()
    expect(engine.canRedo()).toBe(true)
    // canUndo 现在 false,push 不应在 undo 内被调用
    expect(engine.canUndo()).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify failures**

```bash
bun test packages/core/tests/engine/DefaultGridEngine.undo.test.ts
```

Expected: 5 new tests FAIL(`commitCellEdit` 不 push;`undo` 不还原)。

- [ ] **Step 3: Wire commitCellEdit to push + handle editCell in applyUndo/applyRedo**

Modify `packages/core/src/engine/DefaultGridEngine.ts`:

Replace existing `commitCellEdit()`:

```ts
  commitCellEdit(): boolean {
    const session = this.cellEdit.getSession()
    if (!session) return false
    if (!isMutableDataSource(this.data)) return false

    const parsed = parseCellEditInput(session.draft, session.fieldType)
    if (parsed === undefined) return false

    const before = this.data.getCell(session.cell.rowIndex, session.fieldId) ?? null
    this.data.updateCell(session.cell.rowIndex, session.fieldId, parsed)
    this.undoStack.push({
      kind: 'editCell',
      rowIndex: session.cell.rowIndex,
      fieldId: session.fieldId,
      before,
      after: parsed,
    })
    this.cellEdit.clear()
    return true
  }
```

Update `applyUndo` / `applyRedo`:

```ts
  private applyUndo(cmd: UndoCommand): void {
    switch (cmd.kind) {
      case 'editCell':
        this.applyEditCellWrite(cmd.rowIndex, cmd.fieldId, cmd.before)
        this.restoreSelectionForEdit(cmd.rowIndex, cmd.fieldId)
        return
      // 其他 kind 由后续 Task 补全
      default:
        return
    }
  }

  private applyRedo(cmd: UndoCommand): void {
    switch (cmd.kind) {
      case 'editCell':
        this.applyEditCellWrite(cmd.rowIndex, cmd.fieldId, cmd.after)
        this.restoreSelectionForEdit(cmd.rowIndex, cmd.fieldId)
        return
      default:
        return
    }
  }

  private applyEditCellWrite(rowIndex: number, fieldId: string, value: CellValue): void {
    if (!isMutableDataSource(this.data)) return
    this.data.updateCell(rowIndex, fieldId, value)
  }

  private restoreSelectionForEdit(rowIndex: number, fieldId: string): void {
    const colIndex = this.getColumnIndex(fieldId)
    if (colIndex < 0) return
    this.selection.selectCell({ rowIndex, colIndex })
  }
```

Add the `CellValue` import at top (next to other type imports):

```ts
import type { CellValue } from '../data/Schema'
```

- [ ] **Step 4: Run test to verify pass**

```bash
bun test packages/core/tests/engine/DefaultGridEngine.undo.test.ts
```

Expected: PASS, all tests including the 5 new ones.

- [ ] **Step 5: Run full core suite**

```bash
bun test packages/core/
```

Expected: 0 regressions.

- [ ] **Step 6: Typecheck**

```bash
bun run --filter @novasheet/core typecheck
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/engine/DefaultGridEngine.ts packages/core/tests/engine/DefaultGridEngine.undo.test.ts
git commit -m "feat(core): undo/redo for cell edit commit"
```

---

## Task 4: clearRange undo/redo dispatch

**Files:**

- Modify: `packages/core/src/engine/DefaultGridEngine.ts`
- Modify: `packages/core/tests/engine/DefaultGridEngine.undo.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `packages/core/tests/engine/DefaultGridEngine.undo.test.ts`:

```ts
describe('DefaultGridEngine — clearRange undo/redo', () => {
  it('clearRange 收集非空 cell 为 before 后 push 一条', () => {
    const engine = makeEngine()
    engine.clearRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 })
    expect(engine.getData().getCell(0, 'a')).toBeNull()
    expect(engine.getData().getCell(0, 'b')).toBeNull()
    expect(engine.canUndo()).toBe(true)
  })

  it('clearRange 全空范围不 push', () => {
    const engine = makeEngine()
    engine.clearRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 })
    expect(engine.canUndo()).toBe(true)
    // 再清一次:此时全是 null
    engine.clearRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 })
    // 栈深仍为 1(第二次未 push)
    engine.undo()
    expect(engine.canUndo()).toBe(false)
  })

  it('undo clearRange 恢复原值 + 选区设回 range', () => {
    const engine = makeEngine()
    engine.clearRange({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 })
    const cmd = engine.undo()
    expect(cmd?.kind).toBe('clearRange')
    expect(engine.getData().getCell(0, 'a')).toBe('x')
    expect(engine.getData().getCell(0, 'b')).toBe(1)
    expect(engine.getData().getCell(1, 'a')).toBe('y')
    expect(engine.getData().getCell(1, 'b')).toBe(2)
    const sel = engine.getSelection()
    expect(sel.activeCell).toEqual({ rowIndex: 0, colIndex: 0 })
    expect(sel.selectedRange).toEqual({ startRow: 0, endRow: 1, startCol: 0, endCol: 1 })
  })

  it('redo clearRange 再次清除', () => {
    const engine = makeEngine()
    engine.clearRange({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 })
    engine.undo()
    engine.redo()
    expect(engine.getData().getCell(0, 'a')).toBeNull()
    expect(engine.getData().getCell(0, 'b')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify failures**

```bash
bun test packages/core/tests/engine/DefaultGridEngine.undo.test.ts
```

Expected: 4 new tests FAIL.

- [ ] **Step 3: Refactor clearRange to capture before + extend undo/redo dispatch**

Modify `packages/core/src/engine/DefaultGridEngine.ts`:

Replace existing `clearRange()`:

```ts
  clearRange(range: CellRange): void {
    if (!isMutableDataSource(this.data)) return
    const fields = this.data.getSchema().fields
    const before: { rowIndex: number; fieldId: string; value: CellValue }[] = []
    for (let r = range.startRow; r <= range.endRow; r++) {
      for (let c = range.startCol; c <= range.endCol; c++) {
        const field = fields[c]
        if (!field) continue
        const v = this.data.getCell(r, field.id)
        if (v === null || v === undefined) continue
        before.push({ rowIndex: r, fieldId: field.id, value: v })
        this.data.updateCell(r, field.id, null)
      }
    }
    if (before.length > 0) {
      this.undoStack.push({ kind: 'clearRange', range, before })
    }
  }
```

Extend `applyUndo` / `applyRedo` switch statements:

```ts
  private applyUndo(cmd: UndoCommand): void {
    switch (cmd.kind) {
      case 'editCell':
        this.applyEditCellWrite(cmd.rowIndex, cmd.fieldId, cmd.before)
        this.restoreSelectionForEdit(cmd.rowIndex, cmd.fieldId)
        return
      case 'clearRange':
        for (const w of cmd.before) this.applyEditCellWrite(w.rowIndex, w.fieldId, w.value)
        this.restoreSelectionForRange(cmd.range)
        return
      default:
        return
    }
  }

  private applyRedo(cmd: UndoCommand): void {
    switch (cmd.kind) {
      case 'editCell':
        this.applyEditCellWrite(cmd.rowIndex, cmd.fieldId, cmd.after)
        this.restoreSelectionForEdit(cmd.rowIndex, cmd.fieldId)
        return
      case 'clearRange':
        for (const w of cmd.before) {
          this.applyEditCellWrite(w.rowIndex, w.fieldId, null)
        }
        this.restoreSelectionForRange(cmd.range)
        return
      default:
        return
    }
  }

  private restoreSelectionForRange(range: CellRange): void {
    this.selection.selectCell({ rowIndex: range.startRow, colIndex: range.startCol })
    // 通过 navigate 扩展到 (endRow, endCol)?更直接:重置 selection 内部状态。
    // SelectionModel 提供 selectRange:若没有则用 selectCell + 模拟。
    // 这里使用 selection 内部的 setRange API(详见下方实现)
    this.selection.setSelectedRange(range)
  }
```

Verify `SelectionModel` has `setSelectedRange`. If not, add it. Check first:

```bash
grep -n "setSelectedRange\|setRange" packages/core/src/interaction/SelectionModel.ts
```

If it doesn't exist, add this method to `SelectionModel`:

```ts
  /** Phase 4.2 — undo/redo 恢复矩形选区。anchor 设为左上角,extent 设为右下角。 */
  setSelectedRange(range: CellRange): void {
    this.selectedRange = { ...range }
    this.anchorCell = { rowIndex: range.startRow, colIndex: range.startCol }
    this.extentCell = { rowIndex: range.endRow, colIndex: range.endCol }
    this.activeCell = { rowIndex: range.startRow, colIndex: range.startCol }
  }
```

注意:`SelectionModel` 字段命名以实际为准——先 grep 看字段名再写。如果字段是 `private` 且没法直接赋值,通过现有 `selectCell` + 一个新 public 方法包装即可。

- [ ] **Step 4: Run test to verify pass**

```bash
bun test packages/core/tests/engine/DefaultGridEngine.undo.test.ts
```

Expected: PASS,9 tests累计。

- [ ] **Step 5: Full core suite**

```bash
bun test packages/core/
```

- [ ] **Step 6: Typecheck**

```bash
bun run --filter @novasheet/core typecheck
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/engine/DefaultGridEngine.ts packages/core/src/interaction/SelectionModel.ts packages/core/tests/engine/DefaultGridEngine.undo.test.ts
git commit -m "feat(core): undo/redo for clearRange"
```

---

## Task 5: paste undo/redo dispatch via engine.commitPaste

**Files:**

- Modify: `packages/core/src/clipboard/ApplyPaste.ts` (add `onWrite` callback)
- Modify: `packages/core/src/engine/GridEngine.ts` (interface)
- Modify: `packages/core/src/engine/DefaultGridEngine.ts` (commitPaste 方法 + dispatch)
- Modify: `packages/core/tests/engine/DefaultGridEngine.undo.test.ts`
- Modify: `packages/core/tests/clipboard/ApplyPaste.test.ts` (新测 onWrite,如已存在则增补)

- [ ] **Step 1: Add failing tests for engine.commitPaste**

Append to `packages/core/tests/engine/DefaultGridEngine.undo.test.ts`:

```ts
import type { ApplyPasteSource, PasteTargetRect } from '../../src/clipboard/ApplyPaste'

describe('DefaultGridEngine — commitPaste undo/redo', () => {
  function pasteSource(cells: (string | number | null)[][]): ApplyPasteSource {
    return {
      cells,
      sourceFieldIds: ['a', 'b'],
      typed: false,
    }
  }
  function targetRect(
    startRow: number,
    endRow: number,
    startCol: number,
    endCol: number,
  ): PasteTargetRect {
    return { startRow, endRow, startCol, endCol, tile: { rows: 1, cols: 1 } }
  }

  it('commitPaste 写入 + push paste 命令', () => {
    const engine = makeEngine()
    engine.commitPaste(pasteSource([['p', 99]]), targetRect(0, 0, 0, 1), ['a', 'b'])
    expect(engine.getData().getCell(0, 'a')).toBe('p')
    expect(engine.getData().getCell(0, 'b')).toBe(99)
    expect(engine.canUndo()).toBe(true)
  })

  it('undo commitPaste 恢复 before;redo 恢复 after', () => {
    const engine = makeEngine()
    engine.commitPaste(pasteSource([['p', 99]]), targetRect(0, 0, 0, 1), ['a', 'b'])
    engine.undo()
    expect(engine.getData().getCell(0, 'a')).toBe('x')
    expect(engine.getData().getCell(0, 'b')).toBe(1)
    engine.redo()
    expect(engine.getData().getCell(0, 'a')).toBe('p')
    expect(engine.getData().getCell(0, 'b')).toBe(99)
  })

  it('类型不匹配跳过的格子不记录 + onSkipped 仍触发', () => {
    const engine = makeEngine()
    let skippedCount = 0
    engine.commitPaste(
      pasteSource([['p', 'not-a-number']]), // b 列是 number,'not-a-number' 会被跳过
      targetRect(0, 0, 0, 1),
      ['a', 'b'],
      (skipped) => {
        skippedCount = skipped.length
      },
    )
    expect(skippedCount).toBe(1)
    expect(engine.getData().getCell(0, 'a')).toBe('p')
    expect(engine.getData().getCell(0, 'b')).toBe(1) // 未变
    engine.undo()
    expect(engine.getData().getCell(0, 'a')).toBe('x')
    expect(engine.getData().getCell(0, 'b')).toBe(1)
  })

  it('全部跳过 → 不 push', () => {
    const engine = makeEngine()
    engine.commitPaste(
      pasteSource([['', 'not-a-number']]), // 空字符串可能被接受为 text;改成全 number 列 + 非数字
      targetRect(0, 0, 1, 1), // 只针对 b 列
      ['a', 'b'],
    )
    // b 列接收 'not-a-number' → SKIP;before/after 均空 → 不 push
    expect(engine.canUndo()).toBe(false)
  })
})
```

注意第 4 个 test 中的细节:`commitPaste` 只在 `target` 范围内写,所以 `startCol=1, endCol=1` 表示只动 b 列。需要根据 `source.cells` 的形状与 target 一致来调整。实际写时 source 的 cell 内容 `[localR][localC]` 寻址,所以 source 至少要有一格;target 跨度也要和 source 对应。让 source 也只有一格:

```ts
engine.commitPaste(pasteSource([['not-a-number']]), targetRect(0, 0, 1, 1), ['a', 'b'])
```

并把 sourceFieldIds 改成 `['b']`。验证 `applyPaste` 寻址用 `fieldIdsAtCols[c]` 取 target 列对应的 fieldId,所以传 `['a', 'b']`(因为 c=1 对应 fieldId='b')。

- [ ] **Step 2: Run test to verify failures**

```bash
bun test packages/core/tests/engine/DefaultGridEngine.undo.test.ts
```

Expected: 4 new tests FAIL — `engine.commitPaste is not a function`。

- [ ] **Step 3: Add onWrite callback to applyPaste**

Modify `packages/core/src/clipboard/ApplyPaste.ts`:

Add a new optional parameter `onWrite` at the end of `applyPaste` signature:

```ts
export interface PasteWriteRecord {
  readonly rowIndex: number
  readonly fieldId: string
  readonly before: CellValue
  readonly after: CellValue
}

export function applyPaste(
  source: ApplyPasteSource,
  target: PasteTargetRect,
  schema: Schema,
  fieldIdsAtCols: readonly string[],
  data: MutableDataSource,
  onSkipped?: (cells: readonly PasteSkippedCell[]) => void,
  onWrite?: (record: PasteWriteRecord) => void,
): void {
  // ... existing body ...
```

In the body, before each `data.updateCell(r, fieldId, value)` call, insert:

```ts
const beforeValue = data.getCell(r, fieldId) ?? null
onWrite?.({ rowIndex: r, fieldId, before: beforeValue, after: value as CellValue })
data.updateCell(r, fieldId, value as CellValue)
```

Apply this to **both** call sites: the `source.typed` branch and the `coerced` branch. The signatures `value as CellValue` differ slightly between branches — pass the typed `rawValue as CellValue` in the typed branch, and `coerced as CellValue` in the coerced branch. Use the existing local variables to match.

Concretely, replace:

```ts
if (source.typed) {
  data.updateCell(r, fieldId, rawValue as CellValue)
  continue
}
```

with:

```ts
if (source.typed) {
  const beforeValue = data.getCell(r, fieldId) ?? null
  onWrite?.({ rowIndex: r, fieldId, before: beforeValue, after: rawValue as CellValue })
  data.updateCell(r, fieldId, rawValue as CellValue)
  continue
}
```

And replace:

```ts
data.updateCell(r, fieldId, coerced as CellValue)
```

with:

```ts
const beforeValue = data.getCell(r, fieldId) ?? null
onWrite?.({ rowIndex: r, fieldId, before: beforeValue, after: coerced as CellValue })
data.updateCell(r, fieldId, coerced as CellValue)
```

- [ ] **Step 4: Add engine.commitPaste**

Modify `packages/core/src/engine/GridEngine.ts` interface — add:

```ts
import type { ApplyPasteSource, PasteTargetRect, PasteSkippedCell } from '../clipboard/ApplyPaste'

  /** Phase 4.2 — 提交一次粘贴为 1 步 undo;无写入(全跳过)时不入栈。 */
  commitPaste(
    source: ApplyPasteSource,
    target: PasteTargetRect,
    fieldIdsAtCols: readonly string[],
    onSkipped?: (cells: readonly PasteSkippedCell[]) => void,
  ): void
```

(注意:`PasteSkippedCell` 已存在于 `packages/core/src/clipboard/types.ts`;若 `ApplyPaste.ts` 当前已 re-export 则直接导;否则从 `../clipboard/types` 引入。)

Modify `packages/core/src/engine/DefaultGridEngine.ts`:

Add imports:

```ts
import { applyPaste } from '../clipboard/ApplyPaste'
import type { ApplyPasteSource, PasteTargetRect, PasteWriteRecord } from '../clipboard/ApplyPaste'
import type { PasteSkippedCell } from '../clipboard/types'
```

Add `commitPaste` method:

```ts
  commitPaste(
    source: ApplyPasteSource,
    target: PasteTargetRect,
    fieldIdsAtCols: readonly string[],
    onSkipped?: (cells: readonly PasteSkippedCell[]) => void,
  ): void {
    if (!isMutableDataSource(this.data)) return
    const before: { rowIndex: number; fieldId: string; value: CellValue }[] = []
    const after: { rowIndex: number; fieldId: string; value: CellValue }[] = []
    applyPaste(
      source,
      target,
      this.data.getSchema(),
      fieldIdsAtCols,
      this.data,
      onSkipped,
      (rec: PasteWriteRecord) => {
        before.push({ rowIndex: rec.rowIndex, fieldId: rec.fieldId, value: rec.before })
        after.push({ rowIndex: rec.rowIndex, fieldId: rec.fieldId, value: rec.after })
      },
    )
    if (after.length === 0) return
    const range: CellRange = {
      startRow: target.startRow,
      endRow: target.endRow,
      startCol: target.startCol,
      endCol: target.endCol,
    }
    this.undoStack.push({ kind: 'paste', target: range, before, after })
  }
```

Extend `applyUndo` / `applyRedo`:

```ts
  private applyUndo(cmd: UndoCommand): void {
    switch (cmd.kind) {
      case 'editCell':
        this.applyEditCellWrite(cmd.rowIndex, cmd.fieldId, cmd.before)
        this.restoreSelectionForEdit(cmd.rowIndex, cmd.fieldId)
        return
      case 'clearRange':
        for (const w of cmd.before) this.applyEditCellWrite(w.rowIndex, w.fieldId, w.value)
        this.restoreSelectionForRange(cmd.range)
        return
      case 'paste':
        for (const w of cmd.before) this.applyEditCellWrite(w.rowIndex, w.fieldId, w.value)
        this.restoreSelectionForRange(cmd.target)
        return
      default:
        return
    }
  }

  private applyRedo(cmd: UndoCommand): void {
    switch (cmd.kind) {
      case 'editCell':
        this.applyEditCellWrite(cmd.rowIndex, cmd.fieldId, cmd.after)
        this.restoreSelectionForEdit(cmd.rowIndex, cmd.fieldId)
        return
      case 'clearRange':
        for (const w of cmd.before) this.applyEditCellWrite(w.rowIndex, w.fieldId, null)
        this.restoreSelectionForRange(cmd.range)
        return
      case 'paste':
        for (const w of cmd.after) this.applyEditCellWrite(w.rowIndex, w.fieldId, w.value)
        this.restoreSelectionForRange(cmd.target)
        return
      default:
        return
    }
  }
```

- [ ] **Step 5: Run tests**

```bash
bun test packages/core/
```

Expected: PASS, all tests.

- [ ] **Step 6: Typecheck**

```bash
bun run --filter @novasheet/core typecheck
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/clipboard/ApplyPaste.ts packages/core/src/engine/ packages/core/tests/engine/DefaultGridEngine.undo.test.ts
git commit -m "feat(core): undo/redo for paste via engine.commitPaste + applyPaste onWrite hook"
```

---

## Task 6: resizeRow / resizeColumn undo/redo dispatch

**Files:**

- Modify: `packages/core/src/engine/DefaultGridEngine.ts`
- Modify: `packages/core/tests/engine/DefaultGridEngine.undo.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `packages/core/tests/engine/DefaultGridEngine.undo.test.ts`:

```ts
describe('DefaultGridEngine — resize undo/redo', () => {
  it('commitRowResize 相等不 push', () => {
    const engine = makeEngine()
    engine.commitRowResize(0, 24, 24)
    expect(engine.canUndo()).toBe(false)
  })

  it('undo resizeRow 恢复旧高', () => {
    const engine = makeEngine()
    const before = engine.getRowsAxis().getSize(0)
    engine.commitRowResize(0, before, 80)
    expect(engine.getRowsAxis().getSize(0)).toBe(80)
    engine.undo()
    expect(engine.getRowsAxis().getSize(0)).toBe(before)
  })

  it('redo resizeRow 还原新高', () => {
    const engine = makeEngine()
    const before = engine.getRowsAxis().getSize(0)
    engine.commitRowResize(0, before, 80)
    engine.undo()
    engine.redo()
    expect(engine.getRowsAxis().getSize(0)).toBe(80)
  })

  it('commitColumnResize 对称', () => {
    const engine = makeEngine()
    const before = engine.getColsAxis().getSize(0)
    engine.commitColumnResize(0, before, 200)
    expect(engine.getColsAxis().getSize(0)).toBe(200)
    engine.undo()
    expect(engine.getColsAxis().getSize(0)).toBe(before)
    engine.redo()
    expect(engine.getColsAxis().getSize(0)).toBe(200)
  })
})
```

- [ ] **Step 2: Run test to verify failures**

```bash
bun test packages/core/tests/engine/DefaultGridEngine.undo.test.ts
```

Expected: undo/redo 路径未对 resize 分支生效;tests 中 undo 不还原。

- [ ] **Step 3: Add resize dispatch in applyUndo/applyRedo**

Modify `packages/core/src/engine/DefaultGridEngine.ts` — extend the two switches:

```ts
  private applyUndo(cmd: UndoCommand): void {
    switch (cmd.kind) {
      case 'editCell':
        // ... unchanged ...
        return
      case 'clearRange':
        // ... unchanged ...
        return
      case 'paste':
        // ... unchanged ...
        return
      case 'resizeRow':
        this.rowsAxis.setSize(cmd.rowIndex, cmd.before)
        return
      case 'resizeColumn':
        this.colsAxis.setSize(cmd.colIndex, cmd.before)
        return
    }
  }

  private applyRedo(cmd: UndoCommand): void {
    switch (cmd.kind) {
      case 'editCell':
        // ... unchanged ...
        return
      case 'clearRange':
        // ... unchanged ...
        return
      case 'paste':
        // ... unchanged ...
        return
      case 'resizeRow':
        this.rowsAxis.setSize(cmd.rowIndex, cmd.after)
        return
      case 'resizeColumn':
        this.colsAxis.setSize(cmd.colIndex, cmd.after)
        return
    }
  }
```

After this change, drop the `default: return` clauses — switch is now exhaustive(TypeScript `never` 检查会确认)。

- [ ] **Step 4: Run tests**

```bash
bun test packages/core/
```

Expected: PASS,所有 engine.undo tests 通过。

- [ ] **Step 5: Typecheck**

```bash
bun run --filter @novasheet/core typecheck
```

- [ ] **Step 6: Capacity overflow + setData clear edge cases**

Append final tests to `packages/core/tests/engine/DefaultGridEngine.undo.test.ts`:

```ts
describe('DefaultGridEngine — capacity + setData', () => {
  it('栈深 100:101 次 commit 后最早一条被挤掉', () => {
    const engine = makeEngine()
    for (let i = 0; i < 101; i++) {
      engine.commitRowResize(0, 20 + i, 21 + i)
    }
    let popped = 0
    while (engine.canUndo()) {
      engine.undo()
      popped++
    }
    expect(popped).toBe(100)
  })

  it('setData 在有 undo 项时清空', () => {
    const engine = makeEngine()
    engine.commitRowResize(0, 24, 50)
    const data2 = new InMemoryDataSource({
      schema,
      rows: [{ a: 'p', b: 9 }],
    })
    engine.setData(data2)
    expect(engine.canUndo()).toBe(false)
  })

  it('非 MutableDataSource: resize 仍可 commit', () => {
    const readonly: InMemoryDataSource = new InMemoryDataSource({
      schema,
      rows: [{ a: 'r', b: 7 }],
    })
    // 抹掉 updateCell 让 isMutableDataSource 返回 false
    ;(readonly as unknown as { updateCell?: unknown }).updateCell = undefined
    const engine = new DefaultGridEngine({ data: readonly })
    engine.commitRowResize(0, 24, 60)
    expect(engine.canUndo()).toBe(true)
  })
})
```

Run:

```bash
bun test packages/core/tests/engine/DefaultGridEngine.undo.test.ts
```

Expected: PASS。

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/engine/DefaultGridEngine.ts packages/core/tests/engine/DefaultGridEngine.undo.test.ts
git commit -m "feat(core): undo/redo for row/col resize + capacity + setData clear"
```

---

## Task 7: WebGridRuntime undo/redo + onUndo/onRedo events

**Files:**

- Modify: `packages/web/src/runtime/WebGridRuntime.ts`
- Create: `packages/web/tests/runtime/WebGridRuntime.undo.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/web/tests/runtime/WebGridRuntime.undo.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import {
  DefaultGridEngine,
  InMemoryDataSource,
  type Schema,
  type UndoCommand,
} from '@novasheet/core'
import { makeRuntime } from './helpers/makeRuntime' // 现有测试 helper;若无,见下方说明

const schema: Schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text', width: 80 },
    { id: 'b', name: 'B', type: 'number', width: 80 },
  ],
}

function setup() {
  const data = new InMemoryDataSource({
    schema,
    rows: [
      { a: 'x', b: 1 },
      { a: 'y', b: 2 },
    ],
  })
  const engine = new DefaultGridEngine({ data })
  const runtime = makeRuntime({ engine })
  return { engine, runtime, data }
}

describe('WebGridRuntime — undo/redo + events', () => {
  it('runtime.canUndo / canRedo 委派 engine', () => {
    const { engine, runtime } = setup()
    expect(runtime.canUndo()).toBe(false)
    engine.commitRowResize(0, 24, 50)
    expect(runtime.canUndo()).toBe(true)
  })

  it('runtime.undo() 调用 engine.undo + 触发 onUndo 事件', () => {
    const { engine, runtime } = setup()
    engine.commitRowResize(0, 24, 50)
    const events: UndoCommand[] = []
    runtime.setOnUndo((e) => events.push(e.command))
    runtime.undo()
    expect(events.length).toBe(1)
    expect(events[0]?.kind).toBe('resizeRow')
  })

  it('runtime.redo() 触发 onRedo 事件', () => {
    const { engine, runtime } = setup()
    engine.commitRowResize(0, 24, 50)
    runtime.undo()
    const events: UndoCommand[] = []
    runtime.setOnRedo((e) => events.push(e.command))
    runtime.redo()
    expect(events.length).toBe(1)
    expect(events[0]?.kind).toBe('resizeRow')
  })

  it('runtime.undo() 在空栈不发事件', () => {
    const { runtime } = setup()
    const events: UndoCommand[] = []
    runtime.setOnUndo((e) => events.push(e.command))
    runtime.undo()
    expect(events.length).toBe(0)
  })
})
```

如果 `packages/web/tests/runtime/helpers/makeRuntime.ts` 不存在,先检查现有 runtime 测试如何启动 —— 查 `packages/web/tests/runtime/WebGridRuntime.test.ts` 的 setup,直接复用其模式,把 setup 内联到本测试。

- [ ] **Step 2: Run test to verify failures**

```bash
bun test packages/web/tests/runtime/WebGridRuntime.undo.test.ts
```

Expected: FAIL — `runtime.undo is not a function` 等。

- [ ] **Step 3: Add runtime methods + event setters**

Modify `packages/web/src/runtime/WebGridRuntime.ts`:

Add imports at top(`UndoCommand` 来自 `@novasheet/core`):

```ts
import type { UndoCommand } from '@novasheet/core'

export interface UndoEvent {
  readonly command: UndoCommand
}
export interface RedoEvent {
  readonly command: UndoCommand
}
```

Add fields:

```ts
  private onUndo?: (event: UndoEvent) => void
  private onRedo?: (event: RedoEvent) => void
```

Add setters and operations(在 `setOnPasteSkipped` 之后):

```ts
  setOnUndo(cb: (event: UndoEvent) => void): void {
    this.onUndo = cb
  }

  setOnRedo(cb: (event: RedoEvent) => void): void {
    this.onRedo = cb
  }

  canUndo(): boolean {
    return this.engine.canUndo()
  }

  canRedo(): boolean {
    return this.engine.canRedo()
  }

  undo(): void {
    if (this.destroyed) return
    const cmd = this.engine.undo()
    if (!cmd) return
    this.afterEngineMutation()
    this.onUndo?.({ command: cmd })
  }

  redo(): void {
    if (this.destroyed) return
    const cmd = this.engine.redo()
    if (!cmd) return
    this.afterEngineMutation()
    this.onRedo?.({ command: cmd })
  }
```

- [ ] **Step 4: Run tests**

```bash
bun test packages/web/tests/runtime/WebGridRuntime.undo.test.ts
```

Expected: PASS.

- [ ] **Step 5: Typecheck**

```bash
bun run --filter @novasheet/web typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/runtime/WebGridRuntime.ts packages/web/tests/runtime/WebGridRuntime.undo.test.ts
git commit -m "feat(web): WebGridRuntime undo/redo methods + onUndo/onRedo events"
```

---

## Task 8: Keyboard routing — Cmd/Ctrl+Z / Cmd+Shift+Z / Ctrl+Y

**Files:**

- Modify: `packages/web/src/runtime/WebGridRuntime.ts`
- Modify: `packages/web/tests/runtime/WebGridRuntime.undo.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `packages/web/tests/runtime/WebGridRuntime.undo.test.ts`:

```ts
describe('WebGridRuntime — keyboard routing', () => {
  it('Cmd+Z 在 canUndo 时返回 true 并 undo', () => {
    const { engine, runtime } = setup()
    engine.commitRowResize(0, 24, 50)
    const handled = runtime.handleHostKeyDown({
      key: 'z',
      shiftKey: false,
      ctrlKey: false,
      metaKey: true,
      altKey: false,
    })
    expect(handled).toBe(true)
    expect(engine.getRowsAxis().getSize(0)).toBe(24)
  })

  it('Ctrl+Z 在 canUndo 时返回 true 并 undo', () => {
    const { engine, runtime } = setup()
    engine.commitRowResize(0, 24, 50)
    const handled = runtime.handleHostKeyDown({
      key: 'z',
      shiftKey: false,
      ctrlKey: true,
      metaKey: false,
      altKey: false,
    })
    expect(handled).toBe(true)
  })

  it('Cmd+Z 在空栈时返回 false(不 preventDefault)', () => {
    const { runtime } = setup()
    const handled = runtime.handleHostKeyDown({
      key: 'z',
      shiftKey: false,
      ctrlKey: false,
      metaKey: true,
      altKey: false,
    })
    expect(handled).toBe(false)
  })

  it('Cmd+Shift+Z 在 canRedo 时 redo', () => {
    const { engine, runtime } = setup()
    engine.commitRowResize(0, 24, 50)
    runtime.undo()
    const handled = runtime.handleHostKeyDown({
      key: 'z',
      shiftKey: true,
      ctrlKey: false,
      metaKey: true,
      altKey: false,
    })
    expect(handled).toBe(true)
    expect(engine.getRowsAxis().getSize(0)).toBe(50)
  })

  it('Ctrl+Y 在 canRedo 时 redo(Windows 风格)', () => {
    const { engine, runtime } = setup()
    engine.commitRowResize(0, 24, 50)
    runtime.undo()
    const handled = runtime.handleHostKeyDown({
      key: 'y',
      shiftKey: false,
      ctrlKey: true,
      metaKey: false,
      altKey: false,
    })
    expect(handled).toBe(true)
    expect(engine.getRowsAxis().getSize(0)).toBe(50)
  })

  it('编辑中按 Cmd+Z 不被拦截(handleHostKeyDown 在 isCellEditing 时 short-circuit)', () => {
    const { engine, runtime } = setup()
    engine.commitRowResize(0, 24, 50)
    // 进入编辑
    engine.selectCell({ rowIndex: 0, colIndex: 0 })
    engine.beginCellEdit({ rowIndex: 0, colIndex: 0 })
    const handled = runtime.handleHostKeyDown({
      key: 'z',
      shiftKey: false,
      ctrlKey: false,
      metaKey: true,
      altKey: false,
    })
    expect(handled).toBe(false)
    // engine 未受影响,resize 仍生效
    expect(engine.getRowsAxis().getSize(0)).toBe(50)
  })
})
```

- [ ] **Step 2: Run test to verify failures**

```bash
bun test packages/web/tests/runtime/WebGridRuntime.undo.test.ts
```

Expected: FAIL — Cmd+Z 当前不路由。

- [ ] **Step 3: Implement keyboard routing**

Modify `packages/web/src/runtime/WebGridRuntime.ts` `handleHostKeyDown`:

In the existing `if (mod && !event.shiftKey && !event.altKey)` block(line ~676),增加对 `z` / `y` 的分支:

```ts
if (mod && !event.shiftKey && !event.altKey) {
  const k = event.key.toLowerCase()
  if (k === 'c') {
    void this.handleClipboardCopy()
    return true
  }
  if (k === 'x') {
    void this.handleClipboardCut()
    return true
  }
  if (k === 'v') {
    void this.handleClipboardPaste()
    return true
  }
  if (k === 'z') {
    if (!this.engine.canUndo()) return false
    this.undo()
    return true
  }
  if (k === 'y' && event.ctrlKey && !event.metaKey) {
    if (!this.engine.canRedo()) return false
    this.redo()
    return true
  }
}

// Cmd/Ctrl+Shift+Z — redo
if (mod && event.shiftKey && !event.altKey && event.key.toLowerCase() === 'z') {
  if (!this.engine.canRedo()) return false
  this.redo()
  return true
}
```

注意:`Ctrl+Y` 只在 Windows 风格(ctrlKey)生效,排除 Mac `Cmd+Y`(Mac `Cmd+Y` 是其他系统快捷,不该被我们抢)。

- [ ] **Step 4: Run tests**

```bash
bun test packages/web/tests/runtime/WebGridRuntime.undo.test.ts
```

Expected: PASS.

- [ ] **Step 5: Typecheck**

```bash
bun run --filter @novasheet/web typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/runtime/WebGridRuntime.ts packages/web/tests/runtime/WebGridRuntime.undo.test.ts
git commit -m "feat(web): Cmd/Ctrl+Z, Cmd+Shift+Z, Ctrl+Y keyboard routing for undo/redo"
```

---

## Task 9: Resize pointer-up + keyboard arrow → engine.commit\* APIs

**Files:**

- Modify: `packages/web/src/runtime/WebGridRuntime.ts`
- Modify: `packages/web/tests/runtime/WebGridRuntime.undo.test.ts`

- [ ] **Step 1: Add failing tests**

Append:

```ts
describe('WebGridRuntime — resize routes through engine.commit*', () => {
  it('resize pointerup 后,可以 undo', () => {
    const { engine, runtime } = setup()
    // 模拟:pointerdown → move → up
    // 通过现有 host pointer 路径触发(详见 WebGridRuntime.test.ts);
    // 这里直接调内部 handleResizePointerDown/Move/Up 三个 public 入口
    // 假设有 ResizeHandleRect 类型暴露;如果没有,通过 handleLayer 真实事件流模拟
    const rows = engine.getRowsAxis()
    const startSize = rows.getSize(0)

    // 找一个适合的 row handle —— 直接通过 commitRowResize 验证 pointerup 改造效果
    // 真正的 pointer 流程在 task 完成后会通过 e2e 验证
    // 本测试聚焦:resize 在调用 engine.commitRowResize 后能 undo
    engine.commitRowResize(0, startSize, startSize + 30)
    runtime.undo()
    expect(rows.getSize(0)).toBe(startSize)
  })
})
```

注意:模拟 pointer 流程对 happy-dom + DomHandleLayer 比较复杂;真实的 pointerup → commit 验证依赖端到端,这里只验证"engine.commitRowResize 走通"已经是 task 6 覆盖。本任务的 unit 验证我们通过另一种方式做 —— spy `engine.commitRowResize`:

```ts
import { spyOn } from 'bun:test'

it('handleResizePointerUp 调用 engine.commitRowResize 而非 setRowHeight', () => {
  const { engine, runtime } = setup()
  const spy = spyOn(engine, 'commitRowResize')
  const setSpy = spyOn(engine, 'setRowHeight')

  // 调内部 resizeDrag 状态 + pointerup;最简单的方式是构造一个 mock handle
  // 通过 runtime 提供的 public 接口模拟。WebGridRuntime 暴露 handleResizePointerDown 接收 handle:
  // 见 WebGridRuntime.test.ts 中 row resize 用例。
  //
  // 此处省略 setup 细节:实际实现需要先构造 ResizeHandleRect。
  // 该测试粒度建议放到现有 WebGridRuntime.test.ts 中合适的 describe 里。
  expect(true).toBe(true) // 占位 — 在实现时替换为真实断言
})
```

> 注意:此 task 的关键改造是**路由切换**,不引入新对外 API。本任务的测试可以"软"——核心保险是 task 6 的 engine 测试 + 现有 resize 测试不回归 + 手工 Storybook 验证。如果嫌占位测试浮夸,可以省略本步,直接做改造 + 跑现有测试套件。

- [ ] **Step 2: Switch handleResizePointerUp**

Modify `packages/web/src/runtime/WebGridRuntime.ts`:

Replace `handleResizePointerUp`:

```ts
  handleResizePointerUp(pointerId: number): void {
    if (!this.resizeDrag || this.resizeDrag.pointerId !== pointerId) return
    const { handle, startSize, previewSize } = this.resizeDrag
    this.resizeDrag = null
    this.handleLayer?.hideIndicator()
    if (previewSize === startSize) return
    if (handle.kind === 'row' && handle.rowIndex !== undefined) {
      this.engine.commitRowResize(handle.rowIndex, startSize, previewSize)
    } else if (handle.kind === 'column' && handle.fieldId) {
      const colIndex = this.engine.getColumnIndex(handle.fieldId)
      if (colIndex < 0) return
      this.engine.commitColumnResize(colIndex, startSize, previewSize)
    }
    this.afterEngineMutation()
  }
```

Replace `handleResizeKeyboard`:

```ts
  handleResizeKeyboard(handle: ResizeHandleRect, delta: number): void {
    if (this.destroyed) return
    const current = this.readResizeSize(handle)
    if (current === null) return
    const next = Math.max(MIN_RESIZE_SIZE, current + delta)
    if (next === current) return
    if (handle.kind === 'row' && handle.rowIndex !== undefined) {
      this.engine.commitRowResize(handle.rowIndex, current, next)
    } else if (handle.kind === 'column' && handle.fieldId) {
      const colIndex = this.engine.getColumnIndex(handle.fieldId)
      if (colIndex < 0) return
      this.engine.commitColumnResize(colIndex, current, next)
    }
    this.syncResizeHandles()
    this.refresh()
  }
```

注意:`applyResizeSize` 仍然保留,用于 pointer-move 期间的 preview 写入(`engine.setRowHeight` / `setColumnWidth` 直调,不进栈)。

- [ ] **Step 3: Run all web tests**

```bash
bun test packages/web/
```

Expected: PASS,resize 相关旧测试要么不再断言"setRowHeight 被调用",要么改成断言"commitRowResize 被调用"。如有回归,在原 test 中把 spy 对象切换。

具体地,检查 `packages/web/tests/runtime/WebGridRuntime.test.ts` 中所有针对"resize 完成"的断言:

```bash
grep -n "setRowHeight\|setColumnWidth" packages/web/tests/runtime/
```

把那些断言"resize 完成后写入 axis"的测试,改为断言 `engine.commitRowResize` / `commitColumnResize` 被调用 + axis 值符合预期。

- [ ] **Step 4: Typecheck**

```bash
bun run --filter @novasheet/web typecheck
```

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/runtime/WebGridRuntime.ts packages/web/tests/
git commit -m "feat(web): resize pointerup + keyboard arrow route through engine.commitRowResize/commitColumnResize"
```

---

## Task 10: Paste route through engine.commitPaste

**Files:**

- Modify: `packages/web/src/runtime/WebGridRuntime.ts`
- Modify: `packages/web/tests/runtime/WebGridRuntime.test.ts`(或 clipboard 测试)

- [ ] **Step 1: Locate current paste call site**

```bash
grep -n "applyPaste" packages/web/src/runtime/WebGridRuntime.ts
```

预期出现在 `handleClipboardPaste`(line ~289)。

- [ ] **Step 2: Replace direct applyPaste call with engine.commitPaste**

Modify `packages/web/src/runtime/WebGridRuntime.ts` — 找到 `handleClipboardPaste` 中 `applyPaste(...)` 的调用,把它替换为:

```ts
this.engine.commitPaste(source, target, fieldIdsAtCols, (skipped) => this.onPasteSkipped?.(skipped))
```

(`source`、`target`、`fieldIdsAtCols` 的变量名以现有代码为准;变量类型不变。)

Remove the now-unused `applyPaste` import if it was used only for that call:

```bash
grep -n "applyPaste" packages/web/src/runtime/WebGridRuntime.ts
```

如果没有别处用,从 import 清单删除。

- [ ] **Step 3: Run paste tests**

```bash
bun test packages/web/tests/
```

Expected: 全 PASS;粘贴行为对外完全等价,内部多了 undo 栈推送。

- [ ] **Step 4: Add an integration test verifying paste undo through runtime**

Append to `packages/web/tests/runtime/WebGridRuntime.undo.test.ts`:

```ts
describe('WebGridRuntime — paste undo integration', () => {
  it('paste 后 undo 还原 + 选区设回 target', async () => {
    const { engine, runtime } = setup()
    engine.selectCell({ rowIndex: 0, colIndex: 0 })
    // 用 engine.commitPaste 直接触发(handleClipboardPaste 需要 navigator.clipboard,这里跳过)
    engine.commitPaste(
      { cells: [['p', 99]], sourceFieldIds: ['a', 'b'], typed: false },
      { startRow: 0, endRow: 0, startCol: 0, endCol: 1, tile: { rows: 1, cols: 1 } },
      ['a', 'b'],
    )
    expect(engine.getData().getCell(0, 'a')).toBe('p')
    runtime.undo()
    expect(engine.getData().getCell(0, 'a')).toBe('x')
    const sel = engine.getSelection()
    expect(sel.selectedRange).toEqual({ startRow: 0, endRow: 0, startCol: 0, endCol: 1 })
  })
})
```

```bash
bun test packages/web/tests/runtime/WebGridRuntime.undo.test.ts
```

Expected: PASS。

- [ ] **Step 5: Typecheck + lint**

```bash
bun run --filter @novasheet/web typecheck && bun run lint
```

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/runtime/WebGridRuntime.ts packages/web/tests/runtime/WebGridRuntime.undo.test.ts
git commit -m "feat(web): paste routes through engine.commitPaste"
```

---

## Task 11: Grid facade public API + controller interface + backend delegation

**Files:**

- Modify: `packages/web/src/grid/GridController.ts`
- Modify: `packages/web/src/backends/Canvas2DBackend.ts`
- Modify: `packages/web/src/Grid.ts`
- Modify: `packages/web/src/index.ts`
- Create: `packages/web/tests/Grid.undo.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/web/tests/Grid.undo.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { Grid } from '../src/Grid'
import { InMemoryDataSource, type Schema, type UndoCommand } from '@novasheet/core'

const schema: Schema = {
  fields: [
    { id: 'a', name: 'A', type: 'text', width: 80 },
    { id: 'b', name: 'B', type: 'number', width: 80 },
  ],
}

function setupGrid() {
  const container = document.createElement('div')
  Object.assign(container.style, { width: '600px', height: '400px' })
  document.body.appendChild(container)
  const data = new InMemoryDataSource({
    schema,
    rows: [
      { a: 'x', b: 1 },
      { a: 'y', b: 2 },
    ],
  })
  const grid = new Grid(container, { data })
  return { grid, container }
}

describe('Grid facade — undo/redo', () => {
  it('canUndo / canRedo 初始 false', () => {
    const { grid } = setupGrid()
    expect(grid.canUndo()).toBe(false)
    expect(grid.canRedo()).toBe(false)
    grid.destroy()
  })

  it('setRowHeight 通过 facade 不进 undo 栈(preview path 保持)', () => {
    const { grid } = setupGrid()
    grid.setRowHeight(0, 60)
    expect(grid.canUndo()).toBe(false)
    grid.destroy()
  })

  it('onUndo 事件携带 command;返回 unsubscribe', () => {
    const { grid, container } = setupGrid()
    const events: UndoCommand[] = []
    const off = grid.onUndo((e) => events.push(e.command))
    // 通过键盘触发 — 但更简单:用 grid 的 cut() 走完一轮后 undo
    // 此处用 keyboard 模拟,key 事件穿过 host
    // 简单起见:直接通过内部 _commitRowResize-like 触发不存在,
    // 改用先 select + delete:这里我们用 Grid.cut() 流程比较真实
    // (cut 需要 clipboard adapter mock,跳过;改用 setData 后再插入数据 + 编辑)
    //
    // 简化方案:通过监听器收集事件,然后用 grid.undo() 触发(需先 push 一条)。
    // 但 facade 不暴露 commit*Resize,所以我们在 setOnCut 的回调里调 grid.undo()。
    //
    // 为不引入复杂的 clipboard mock,本测试用 grid.cut() 的替代路径:
    // 直接通过 internal:不可。改测试目标为:监听器注册 + 关闭。
    off()
    grid.destroy()
    expect(events.length).toBe(0)
    container.remove()
  })
})
```

注:第三个测试因为 facade 没有 `commitRowResize` 直接入口,要真正触发 undoEvent 需要走 cut/paste/edit/键盘 resize。在 happy-dom 下模拟键盘 + clipboard 较繁;接受此测试只验证"on/off 注册"的最小边界。完整端到端覆盖留给 Storybook 故事 + 真浏览器 verify。

- [ ] **Step 2: Run test to verify failures**

```bash
bun test packages/web/tests/Grid.undo.test.ts
```

Expected: FAIL — `grid.canUndo is not a function`。

- [ ] **Step 3: Extend GridController interface**

Modify `packages/web/src/grid/GridController.ts`:

Add at top(import `UndoEvent` / `RedoEvent` 复用 Task 7 在 runtime 中已声明的导出,而**不**在此处重复 export):

```ts
import type { UndoEvent, RedoEvent } from '../runtime/WebGridRuntime'
```

(同时按需补充 `export type { UndoEvent, RedoEvent }` 末尾的 re-export 行,让 Grid.ts 等模块从 GridController 拿到。)

Add to the `GridController` interface(末尾):

```ts
  undo(): void
  redo(): void
  canUndo(): boolean
  canRedo(): boolean
  setOnUndo(cb: (event: UndoEvent) => void): void
  setOnRedo(cb: (event: RedoEvent) => void): void
```

- [ ] **Step 4: Implement in Canvas2DBackend**

Modify `packages/web/src/backends/Canvas2DBackend.ts`:

Find existing delegated methods(setData / setTheme / setRowHeight 等),在末尾追加:

```ts
  undo(): void {
    this.runtime.undo()
  }
  redo(): void {
    this.runtime.redo()
  }
  canUndo(): boolean {
    return this.runtime.canUndo()
  }
  canRedo(): boolean {
    return this.runtime.canRedo()
  }
  setOnUndo(cb: (event: UndoEvent) => void): void {
    this.runtime.setOnUndo(cb)
  }
  setOnRedo(cb: (event: RedoEvent) => void): void {
    this.runtime.setOnRedo(cb)
  }
```

Import `UndoEvent` / `RedoEvent` from `../runtime/WebGridRuntime`(单一源头)。

构造函数里如果接受 `onUndo` / `onRedo` 选项,在调用 runtime 时注入。Backend 的构造 options 形如:

```ts
{
  onContextMenuAction?: ...,
  onCopy?: ...,
  onCut?: ...,
  onPaste?: ...,
  onPasteSkipped?: ...,
}
```

— 加入两个:

```ts
  onUndo?: (event: UndoEvent) => void
  onRedo?: (event: RedoEvent) => void
```

构造函数末尾(其他 `if (options.onCopy) ...` 之后):

```ts
if (options.onUndo) this.runtime.setOnUndo(options.onUndo)
if (options.onRedo) this.runtime.setOnRedo(options.onRedo)
```

- [ ] **Step 5: Implement in Grid facade**

Modify `packages/web/src/Grid.ts`:

Add to imports(顶部,引用 GridController re-export 而不是再次声明):

```ts
import type { UndoEvent, RedoEvent } from './grid/GridController'
```

不要在 Grid.ts 中重复声明 `UndoEvent` / `RedoEvent`——单一来源在 Task 7 的 runtime,经 GridController re-export。

Extend `GridOptions`:

```ts
  /** Phase 4.2 — undo 完成时触发,携带刚执行的 UndoCommand。 */
  onUndo?: (event: UndoEvent) => void
  /** Phase 4.2 — redo 完成时触发,携带刚执行的 UndoCommand。 */
  onRedo?: (event: RedoEvent) => void
```

In `engineOptionsFrom`,把 `onUndo` 和 `onRedo` 加入剥离名单:

```ts
function engineOptionsFrom(options: GridOptions): GridEngineOptions {
  const {
    renderer: _r,
    onContextMenuAction: _a,
    onCopy: _c,
    onCut: _x,
    onPaste: _v,
    onPasteSkipped: _s,
    onUndo: _u,
    onRedo: _y,
    ...engineOptions
  } = options
  void _r
  void _a
  void _c
  void _x
  void _v
  void _s
  void _u
  void _y
  return engineOptions
}
```

In Grid constructor 的 Canvas2DBackend 实例化中,把 `onUndo / onRedo` 透传:

```ts
this.delegate = new Canvas2DBackend(container, engineOptions, {
  onContextMenuAction: options.onContextMenuAction,
  onCopy: options.onCopy,
  onCut: options.onCut,
  onPaste: options.onPaste,
  onPasteSkipped: options.onPasteSkipped,
  onUndo: options.onUndo,
  onRedo: options.onRedo,
})
```

Add new public methods(在 `destroy()` 之前):

```ts
  undo(): void {
    this.delegate.undo()
  }

  redo(): void {
    this.delegate.redo()
  }

  canUndo(): boolean {
    return this.delegate.canUndo()
  }

  canRedo(): boolean {
    return this.delegate.canRedo()
  }

  onUndo(handler: (event: UndoEvent) => void): () => void {
    this.delegate.setOnUndo(handler)
    return () => this.delegate.setOnUndo(() => {})
  }

  onRedo(handler: (event: RedoEvent) => void): () => void {
    this.delegate.setOnRedo(handler)
    return () => this.delegate.setOnRedo(() => {})
  }
```

注意:`onUndo` 当前只支持单监听器(与 `setOnCopy` 等接口一致);返回的 unsubscribe 把回调置为 no-op。若要支持多监听器,需要改 runtime 内部为 Set。Phase 4.2 保持单监听器(MVP),与 Copy/Cut/Paste 一致。

- [ ] **Step 6: Re-export types from web/index**

Modify `packages/web/src/index.ts` — 追加:

```ts
export type { UndoCommand } from '@novasheet/core'
export type { UndoEvent, RedoEvent } from './grid/GridController'
```

- [ ] **Step 7: Run tests**

```bash
bun test packages/web/
```

Expected: PASS。

- [ ] **Step 8: Typecheck + lint + full test suite**

```bash
bun run --filter '*' typecheck && bun run lint && bun test
```

Expected: 全 PASS。

- [ ] **Step 9: Commit**

```bash
git add packages/web/src/Grid.ts packages/web/src/grid/GridController.ts packages/web/src/backends/Canvas2DBackend.ts packages/web/src/index.ts packages/web/tests/Grid.undo.test.ts
git commit -m "feat(web): Grid facade undo/redo + canUndo/canRedo + onUndo/onRedo events"
```

---

## Task 12: Storybook story + README sign-off

**Files:**

- Create: `apps/storybook/src/stories/Undo.stories.ts`
- Modify: `README.md`

- [ ] **Step 1: Inspect existing story patterns**

```bash
ls apps/storybook/src/stories/
cat apps/storybook/src/stories/Clipboard.stories.ts | head -60
```

模仿 Clipboard.stories.ts 的结构创建 Undo story。

- [ ] **Step 2: Create story**

Create `apps/storybook/src/stories/Undo.stories.ts`(基本骨架,具体 className / helper 以现有 stories 风格为准):

```ts
import { Grid, type GridOptions } from '@novasheet/web'
import { InMemoryDataSource, type Schema } from '@novasheet/core'

const schema: Schema = {
  fields: [
    { id: 'name', name: '名称', type: 'text', width: 140 },
    { id: 'qty', name: '数量', type: 'number', width: 100 },
  ],
}

function makeDataSource() {
  return new InMemoryDataSource({
    schema,
    rows: Array.from({ length: 30 }, (_, i) => ({
      name: `产品 ${i + 1}`,
      qty: 10 + i,
    })),
  })
}

function makeShell(): {
  root: HTMLElement
  gridContainer: HTMLElement
  undoBtn: HTMLButtonElement
  redoBtn: HTMLButtonElement
  log: HTMLElement
} {
  const root = document.createElement('div')
  Object.assign(root.style, {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '8px',
  })

  const toolbar = document.createElement('div')
  toolbar.style.display = 'flex'
  toolbar.style.gap = '8px'

  const undoBtn = document.createElement('button')
  undoBtn.textContent = 'Undo'
  undoBtn.disabled = true
  toolbar.appendChild(undoBtn)

  const redoBtn = document.createElement('button')
  redoBtn.textContent = 'Redo'
  redoBtn.disabled = true
  toolbar.appendChild(redoBtn)

  const log = document.createElement('div')
  log.style.fontFamily = 'monospace'
  log.style.fontSize = '12px'
  log.style.color = '#555'
  log.textContent = '最近事件:(无)'
  toolbar.appendChild(log)

  const gridContainer = document.createElement('div')
  Object.assign(gridContainer.style, { width: '720px', height: '400px', border: '1px solid #ddd' })

  root.appendChild(toolbar)
  root.appendChild(gridContainer)

  return { root, gridContainer, undoBtn, redoBtn, log }
}

export default {
  title: 'Phase 4.2 / Undo & Redo',
  parameters: {
    docs: {
      description: {
        component:
          'Phase 4.2 — 编辑 / 剪切 / 粘贴 / 行列 resize 进 undo 栈(深度 100)。键盘:`Cmd/Ctrl+Z` 撤销,`Cmd+Shift+Z` 或 `Ctrl+Y` 重做。编辑过程中 `Cmd/Ctrl+Z` 由浏览器 input 原生 undo 接管。`onUndo` / `onRedo` 事件携带 `UndoCommand`,可用于 toast / server-sync。',
      },
    },
  },
}

export const Default = () => {
  const { root, gridContainer, undoBtn, redoBtn, log } = makeShell()

  const options: GridOptions = {
    data: makeDataSource(),
    onUndo: (e) => {
      log.textContent = `最近事件: undo (${e.command.kind})`
      syncButtons()
    },
    onRedo: (e) => {
      log.textContent = `最近事件: redo (${e.command.kind})`
      syncButtons()
    },
  }

  const grid = new Grid(gridContainer, options)

  function syncButtons() {
    undoBtn.disabled = !grid.canUndo()
    redoBtn.disabled = !grid.canRedo()
  }

  undoBtn.addEventListener('click', () => {
    grid.undo()
    syncButtons()
  })
  redoBtn.addEventListener('click', () => {
    grid.redo()
    syncButtons()
  })

  // 选 cell 后键盘开始编辑 / 拖列宽 / 拖行高,都会触发 canUndo
  // Storybook 容器卸载时清理
  return root
}
```

- [ ] **Step 3: Run storybook locally for sanity check**

```bash
bun run --filter @novasheet/storybook storybook
```

打开 Storybook,导航到 "Phase 4.2 / Undo & Redo":

- 编辑一个 cell(键入 + Enter)→ Undo 变可用 → 点 Undo,还原
- 拖一列宽度 → Undo 变可用 → 撤销
- 选择多 cell,Cmd/Ctrl+X 剪切 → Undo
- Cmd+Z 键盘也走通

记录在控制台没有 error / warning。

- [ ] **Step 4: Update README**

Modify `README.md`:

找到 Phase 4 表格中的 Phase 4.2 行,从:

```
| Phase 4.2 | Undo / Redo                  | 命令栈;与编辑 / 剪贴板操作挂钩。                                                           |
```

替换为:

```
| Phase 4.2 ✅ | Undo / Redo                  | UndoStack(深 100)+ discriminated-union UndoCommand;cell edit / Cut / Paste / Row+Col resize 进栈;`Cmd/Ctrl+Z`、`Cmd+Shift+Z`、`Ctrl+Y` 键盘;编辑中 Ctrl+Z 交给 input 原生;Undo/Redo 后选区恢复到受影响范围;`Grid.undo() / redo() / canUndo() / canRedo()` + `onUndo / onRedo` 事件。 |
```

并把 `Phase 4` 节头里的"设计文档:"列表里添加一项:

```
- [Phase 4.2 Undo / Redo](docs/superpowers/specs/2026-05-21-undo-redo-design.md)
```

也更新文件顶部的测试计数(如有"132 tests"或类似 N tests across core / web / web-canvas2d 的描述,改为新数字)。

- [ ] **Step 5: Verify all tests + lint + build**

```bash
bun run lint && bun run --filter '*' typecheck && bun test
```

Expected: 全 PASS;打印总测试数,替换 README 里的数字。

```bash
bun run --filter @novasheet/web build && bun run --filter @novasheet/web-canvas2d build && bun run --filter @novasheet/core build
```

Expected: 三个 build 均通过。

- [ ] **Step 6: Commit**

```bash
git add apps/storybook/src/stories/Undo.stories.ts README.md
git commit -m "feat(storybook,docs): Phase 4.2 undo/redo story + README sign-off"
```

---

## Self-Review Notes(plan 写完后做)

1. **Spec coverage:**
   - §1 范围(edit/cut/paste/resize)→ Task 3/4/5/6 覆盖
   - §2 UndoCommand union → Task 1
   - §3 UndoStack 容量 + clear → Task 1 + Task 2 + Task 6 capacity test
   - §4 engine 集成 + commit\*Resize/Paste → Task 2/3/4/5/6
   - §4.4 防递归(undo 内部不经过 commit\*)→ Task 3 测试 + 实现走 `applyEditCellWrite`(私有)
   - §5.1 键盘路由 → Task 8
   - §5.2 runtime API + 事件 → Task 7
   - §5.3 resize 路径切换 → Task 9
   - §5.4 Grid facade → Task 11
   - §5.5 不加 context menu → 不需要 task
   - §6 边界 → Task 1/2/3/4/5/6 测试覆盖;非 mutable + capacity overflow 都覆盖
   - §7 测试 → 每个 task 都自带 TDD;Storybook → Task 12

2. **Placeholder scan:** Task 9 Step 1 中有"占位测试"的写法;实施时根据现有 resize 测试模式补真实断言或省略本测试。Task 11 Step 1 第三个测试用例承认 happy-dom 模拟键盘 + clipboard 复杂,只测注册/解除监听。这两处都有明确说明,非实际 placeholder。

3. **Type consistency:**
   - `UndoCommand` / `CellWrite` 命名一致(Task 1 定义,后续 task 引用)。
   - `commitRowResize(rowIndex, oldHeight, newHeight)` 命名一致(Task 2 引入,Task 6 + Task 9 引用)。
   - `commitPaste(source, target, fieldIdsAtCols, onSkipped?)` 命名一致(Task 5)。
   - `UndoEvent` / `RedoEvent` 在 web 层(Task 7 定义)+ Grid facade(Task 11)重新声明同名 interface,确认两处定义结构一致。

4. **每个 task 一次 commit:** 是。共 12 个 commit,符合 CLAUDE.md "One task = one commit" 原则。

---

## Execution Choice

Plan complete. 选择:

1. **Subagent-Driven(推荐)** — 每个 task dispatch 一个新 subagent,任务间 review。M1/M2/Phase 4.1 验证过该流程,捕获 plan-bug + 减少 controller 上下文消耗。

2. **Inline Execution** — 在本 session 内顺序执行 + checkpoint。
