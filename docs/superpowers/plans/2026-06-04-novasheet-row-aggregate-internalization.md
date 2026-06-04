# RowAggregate 内化实现计划（消去 RowStructureContext）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 row 域状态（`rawRowsAxis` + `HideRowsLayer`）所有权迁入聚合根 `DefaultRowStructure`，删除 9 方法的 `RowStructureContext`，使聚合根成为自持状态的富模型；行为等价。

**Architecture:** 聚合根自持 `rawRowsAxis`（行高轴）与 `HideRowsLayer`（隐藏集 + 视图包装），对外暴露派生读（`getViewRowsAxis`/`getRowViewData`/`getHiddenRows`/`getCollapsedGaps`）、正向结构操作、行高读写、以及 undo/redo 用的逆变迁方法。仅保留两项注入依赖：raw `MutableDataSource` 引用 + `resolveDefaultRowHeight: () => number`。`DefaultGridEngine` 删除三个行相关字段，全部改读聚合根；frozen/viewport 组装、列隐藏、format/merge/selection 编排仍留 engine。

**Tech Stack:** TypeScript（strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`）、bun workspaces、`bun test`。spec：`docs/superpowers/specs/2026-06-04-novasheet-row-aggregate-internalization-design.md`。

**重要约束（执行者必读）：**

- 这是「一次彻底」重构，已与用户确认**接受过渡期 core 内部暂时不可编译**。Task 1 完成后 `@novasheet/core` 的 `typecheck` 会**红**（engine 仍引用已删除的 context 形态），直到 Task 2 结束才恢复全绿。因此 **Task 1 只跑聚合根单测文件**（`bun test packages/core/tests/engine/row/DefaultRowStructure.test.ts`），**不要**在 Task 1 跑全量 typecheck。Task 2 结束跑全量 typecheck + test。
- 行为等价是验收门槛：engine 行为级测试（hide/unhide、insert/delete、moveRows、setRowHeight、undo/redo、setData/setViewData 重建）必须保持绿。
- 若发现某处行为与本计划描述不符（尤其 undo/redo 的 format/merge/selection 编排顺序、`setViewData` 不清隐藏），**STOP 并询问**，不要静默改语义。

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `packages/core/src/engine/row/RowStructure.ts` | Modify | 删除 `RowStructureContext`；`RowStructure` 接口扩为富契约 |
| `packages/core/src/engine/row/DefaultRowStructure.ts` | Rewrite | 自持 `rawRowsAxis` + `HideRowsLayer`，实现富接口 |
| `packages/core/tests/engine/row/DefaultRowStructure.test.ts` | Rewrite | 新构造签名 `(rawData, resolveDefaultRowHeight)` 的单测 |
| `packages/core/src/engine/DefaultGridEngine.ts` | Modify | 删 `rawRowsAxis`/`hideRowsLayer`/`rowViewData` 字段，改读聚合根；rewire undo/redo 行分支 |
| `packages/core/src/engine/row/README.md` | Modify | 更新边界描述（context 已删除） |

不新增文件。`RowOperation.ts` / `RowEvent.ts` / `RowRules.ts` / `*CommandHandler.ts` **不改**（command handler 只依赖 `RowStructure` 接口的正向方法，签名不变）。

---

## Task 1：富 `RowStructure` 接口 + 自持状态的 `DefaultRowStructure`

**Files:**
- Modify: `packages/core/src/engine/row/RowStructure.ts`
- Rewrite: `packages/core/src/engine/row/DefaultRowStructure.ts`
- Rewrite (Test): `packages/core/tests/engine/row/DefaultRowStructure.test.ts`

- [ ] **Step 1: 重写单测（先看红）**

把 `packages/core/tests/engine/row/DefaultRowStructure.test.ts` 整体替换为：

```typescript
import { describe, expect, it } from 'bun:test'
import { InMemoryDataSource } from '../../../src/data/InMemoryDataSource'
import { DefaultRowStructure } from '../../../src/engine/row/DefaultRowStructure'
import type { DataSource } from '../../../src/data/DataSource'
import type { Row } from '../../../src/data/Schema'

const DEFAULT_HEIGHT = 24

function makeData(names: string[]): InMemoryDataSource {
  return new InMemoryDataSource({
    schema: { fields: [{ id: 'name', name: 'Name', type: 'text', width: 80 }] },
    rows: names.map((name) => ({ name })),
  })
}

function makeRows(data: DataSource): DefaultRowStructure {
  return new DefaultRowStructure(data, () => DEFAULT_HEIGHT)
}

describe('DefaultRowStructure（自持状态）', () => {
  it('inserts rows, expands raw row heights, returns rowsInserted event', () => {
    const data = makeData(['A', 'B'])
    const rows = makeRows(data)
    rows.setRowHeight(1, 40)

    const event = rows.insertRows({ kind: 'insertRows', at: 1, count: 2 })

    expect(event).toEqual({ kind: 'rowsInserted', at: 1, count: 2, newRowIds: [1, 2] })
    expect(data.getRowCount()).toBe(4)
    expect(rows.getRowHeight(1)).toBe(DEFAULT_HEIGHT)
    expect(rows.getRowHeight(3)).toBe(40)
  })

  it('reports the actual clamped insertion position', () => {
    const rows = makeRows(makeData(['A', 'B']))
    const event = rows.insertRows({ kind: 'insertRows', at: 999, count: 1 })
    expect(event?.at).toBe(2)
    expect(event?.newRowIds).toEqual([2])
  })

  it('returns null for non-positive insert count', () => {
    const rows = makeRows(makeData(['A', 'B']))
    expect(rows.insertRows({ kind: 'insertRows', at: 0, count: 0 })).toBeNull()
  })

  it('deletes rows, captures deleted heights and snapshots', () => {
    const data = makeData(['A', 'B', 'C'])
    const rows = makeRows(data)
    rows.setRowHeight(1, 40)

    const event = rows.deleteRows({ kind: 'deleteRows', rowIds: [1] })

    expect(event?.kind).toBe('rowsDeleted')
    expect(event?.rowIds).toEqual([1])
    expect(event?.deletedHeights).toEqual([40])
    expect(event?.snapshots).toEqual([{ originalUnderlyingRow: 1, cells: { name: 'B' } }])
    expect((data.getRows(0, 1) as Row[]).map((r) => r.name)).toEqual(['A', 'C'])
  })

  it('rejects invalid delete row ids before mutating', () => {
    const data = makeData(['A', 'B', 'C'])
    const rows = makeRows(data)
    expect(rows.deleteRows({ kind: 'deleteRows', rowIds: [-1] })).toBeNull()
    expect(rows.deleteRows({ kind: 'deleteRows', rowIds: [3] })).toBeNull()
    expect(rows.deleteRows({ kind: 'deleteRows', rowIds: [1, 1] })).toBeNull()
    expect((data.getRows(0, 2) as Row[]).map((r) => r.name)).toEqual(['A', 'B', 'C'])
  })

  it('hides and unhides only effective row ids, reflected in hidden + view data', () => {
    const data = makeData(['A', 'B', 'C', 'D'])
    const rows = makeRows(data)
    rows.addHidden([1])

    expect(rows.hideRows({ kind: 'hideRows', rowIds: [1, 2, 3] })).toEqual({
      kind: 'rowsHidden',
      rowIds: [2, 3],
    })
    expect(rows.getHiddenRows()).toEqual([1, 2, 3])
    expect(rows.getRowViewData().getRowCount()).toBe(1)

    expect(rows.unhideRows({ kind: 'unhideRows', rowIds: [0, 2] })).toEqual({
      kind: 'rowsUnhidden',
      rowIds: [2],
    })
    expect(rows.getHiddenRows()).toEqual([1, 3])
    expect(rows.getRowViewData().getRowCount()).toBe(2)
  })

  it('moves rows, remaps row heights and hidden rows', () => {
    const data = makeData(['A', 'B', 'C', 'D'])
    const rows = makeRows(data)
    rows.setRowHeight(1, 40)
    rows.setRowHeight(2, 48)
    rows.addHidden([3])

    const event = rows.moveRows({ kind: 'moveRows', rowIds: [1, 2], beforeRowId: null })

    expect(event?.kind).toBe('rowsMoved')
    expect((data.getRows(0, 3) as Row[]).map((r) => r.name)).toEqual(['A', 'D', 'B', 'C'])
    expect(rows.getRowHeight(1)).toBe(DEFAULT_HEIGHT)
    expect(rows.getRowHeight(2)).toBe(40)
    expect(rows.getRowHeight(3)).toBe(48)
    expect(rows.getHiddenRows()).toEqual([1])
  })

  it('returns null for invalid row move operations', () => {
    const data = makeData(['A', 'B', 'C'])
    const rows = makeRows(data)
    expect(rows.moveRows({ kind: 'moveRows', rowIds: [1, 2], beforeRowId: 2 })).toBeNull()
    expect((data.getRows(0, 2) as Row[]).map((r) => r.name)).toEqual(['A', 'B', 'C'])
  })

  it('returns null and leaves state untouched when data source is not mutable', () => {
    const immutable: DataSource = {
      getRowCount: () => 3,
      getSchema: () => ({ fields: [{ id: 'name', name: 'Name', type: 'text', width: 80 }] }),
      getRows: () => [],
      getCell: () => undefined,
      subscribe: () => () => undefined,
    }
    const rows = new DefaultRowStructure(immutable, () => DEFAULT_HEIGHT)
    expect(rows.moveRows({ kind: 'moveRows', rowIds: [0], beforeRowId: null })).toBeNull()
    expect(rows.insertRows({ kind: 'insertRows', at: 0, count: 1 })).toBeNull()
    expect(rows.deleteRows({ kind: 'deleteRows', rowIds: [0] })).toBeNull()
  })

  it('getViewRowsAxis derives view axis from raw heights and hidden rows', () => {
    const data = makeData(['A', 'B', 'C'])
    const rows = makeRows(data)
    rows.setRowHeight(0, 30)
    rows.setRowHeight(2, 50)
    rows.addHidden([1])

    const axis = rows.getViewRowsAxis()
    expect(axis.getCount()).toBe(2)
    expect(axis.getSize(0)).toBe(30) // 视图行0 = raw 0
    expect(axis.getSize(1)).toBe(50) // 视图行1 = raw 2（raw1 隐藏）
  })

  it('getCollapsedGaps reports hidden runs', () => {
    const rows = makeRows(makeData(['A', 'B', 'C', 'D']))
    rows.addHidden([1, 2])
    const gaps = rows.getCollapsedGaps()
    expect(gaps).toEqual([{ atViewRow: 0, hiddenCount: 2, hiddenIds: [1, 2] }])
  })

  it('reinsertDeletedRows restores rows, cells and heights (delete undo)', () => {
    const data = makeData(['A', 'B', 'C'])
    const rows = makeRows(data)
    rows.setRowHeight(1, 40)
    const event = rows.deleteRows({ kind: 'deleteRows', rowIds: [1] })!

    rows.reinsertDeletedRows(event.snapshots, event.deletedHeights)

    expect((data.getRows(0, 2) as Row[]).map((r) => r.name)).toEqual(['A', 'B', 'C'])
    expect(rows.getRowHeight(1)).toBe(40)
  })

  it('insertBlankRows + deleteRowsByIds are inverse-safe (insert undo/redo)', () => {
    const data = makeData(['A', 'B'])
    const rows = makeRows(data)
    rows.insertBlankRows(1, 2)
    expect(data.getRowCount()).toBe(4)
    rows.deleteRowsByIds([1, 2])
    expect(data.getRowCount()).toBe(2)
    expect((data.getRows(0, 1) as Row[]).map((r) => r.name)).toEqual(['A', 'B'])
  })

  it('rebuild rebinds data source and resets raw row axis', () => {
    const rows = makeRows(makeData(['A', 'B']))
    rows.setRowHeight(0, 99)
    const next = makeData(['X', 'Y', 'Z'])
    rows.rebuild(next, () => DEFAULT_HEIGHT)
    expect(rows.getRowViewData().getRowCount()).toBe(3)
    expect(rows.getRowHeight(0)).toBe(DEFAULT_HEIGHT)
  })

  it('clearHidden empties the hidden set', () => {
    const rows = makeRows(makeData(['A', 'B', 'C']))
    rows.addHidden([1])
    rows.clearHidden()
    expect(rows.getHiddenRows()).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试看红**

Run: `bun test packages/core/tests/engine/row/DefaultRowStructure.test.ts`
Expected: FAIL（构造签名不匹配 / 方法不存在）。

- [ ] **Step 3: 重写 `RowStructure` 接口，删除 `RowStructureContext`**

把 `packages/core/src/engine/row/RowStructure.ts` 整体替换为：

```typescript
import type { ChunkedAxis } from '../../layout/ChunkedAxis'
import type { DataSource } from '../../data/DataSource'
import type { DeletedRowSnapshot } from '../../data/MutableDataSource'
import type { CollapsedGap } from '../../view/HideRowsLayer'
import type { RowsDeleted, RowsHidden, RowsInserted, RowsMoved, RowsUnhidden } from './RowEvent'
import type {
  DeleteRowsOperation,
  HideRowsOperation,
  InsertRowsOperation,
  MoveRowsOperation,
  UnhideRowsOperation,
} from './RowOperation'

/**
 * 行结构领域接口（聚合根）：自持行高轴与隐藏层，执行正向结构变迁、行高读写、
 * 派生视图行轴/视图数据源，并提供 undo/redo 用的逆变迁。
 */
export interface RowStructure {
  /** 重绑 raw 数据源与默认行高解析，重建行高轴并重置视图包装（隐藏集保留，由 clearHidden 单独清空）。 */
  rebuild(rawData: DataSource, resolveDefaultRowHeight: () => number): void
  /** 清空隐藏集（setData 语义）。 */
  clearHidden(): void

  insertRows(operation: InsertRowsOperation): RowsInserted | null
  deleteRows(operation: DeleteRowsOperation): RowsDeleted | null
  hideRows(operation: HideRowsOperation): RowsHidden | null
  unhideRows(operation: UnhideRowsOperation): RowsUnhidden | null
  moveRows(operation: MoveRowsOperation): RowsMoved | null

  getRowHeight(underlyingRow: number): number
  setRowHeight(underlyingRow: number, height: number): void
  setRowHeightsMulti(underlyingRows: readonly number[], height: number): void
  setDefaultRowHeight(height: number): void

  /** 从行高轴按可见行顺序派生的视图行轴。 */
  getViewRowsAxis(): ChunkedAxis
  /** 行隐藏后的视图数据源（engine 在其上再叠列隐藏）。 */
  getRowViewData(): DataSource
  /** 升序去重的隐藏 underlying 行 id。 */
  getHiddenRows(): readonly number[]
  getCollapsedGaps(): readonly CollapsedGap[]

  /** insert 的 redo：插入 count 行空白行并扩展行高轴。 */
  insertBlankRows(at: number, count: number): void
  /** insert 的 undo / delete 的 redo：按 underlying id 删除并收缩行高轴。 */
  deleteRowsByIds(underlyingRowIds: readonly number[]): void
  /** delete 的 undo：按原位置回插并恢复 cell 与行高。 */
  reinsertDeletedRows(
    snapshots: readonly DeletedRowSnapshot[],
    heights: readonly number[],
  ): void
  addHidden(underlyingRowIds: readonly number[]): void
  removeHidden(underlyingRowIds: readonly number[]): void
}
```

- [ ] **Step 4: 重写 `DefaultRowStructure`**

把 `packages/core/src/engine/row/DefaultRowStructure.ts` 整体替换为：

```typescript
import { ChunkedAxis } from '../../layout/ChunkedAxis'
import { HideRowsLayer } from '../../view/HideRowsLayer'
import { isMutableDataSource } from '../../data/MutableDataSource'
import type { CollapsedGap } from '../../view/HideRowsLayer'
import type { DataSource } from '../../data/DataSource'
import type { DeletedRowSnapshot, MutableDataSource } from '../../data/MutableDataSource'
import type { RowsDeleted, RowsHidden, RowsInserted, RowsMoved, RowsUnhidden } from './RowEvent'
import type {
  DeleteRowsOperation,
  HideRowsOperation,
  InsertRowsOperation,
  MoveRowsOperation,
  UnhideRowsOperation,
} from './RowOperation'
import {
  buildRawRowsAxisFromHeights,
  captureRowHeights,
  getNewlyHiddenRows,
  getNewlyVisibleRows,
  normalizeDeleteRows,
  normalizeMoveRows,
  remapRowsByIndexMap,
  reorderByIndexMap,
} from './RowRules'
import type { RowStructure } from './RowStructure'

/** 默认行结构领域实现（聚合根）；自持行高轴与隐藏层。 */
export class DefaultRowStructure implements RowStructure {
  // 经 rebuild() 在构造期赋值（见 CLAUDE.md：构造器调用的 helper 内赋值可用 definite-assignment）。
  private rawData!: DataSource
  private resolveDefaultRowHeight!: () => number
  private rawRowsAxis!: ChunkedAxis
  private rowViewData!: DataSource
  private readonly hideLayer = new HideRowsLayer()

  constructor(rawData: DataSource, resolveDefaultRowHeight: () => number) {
    this.rebuild(rawData, resolveDefaultRowHeight)
  }

  rebuild(rawData: DataSource, resolveDefaultRowHeight: () => number): void {
    this.rawData = rawData
    this.resolveDefaultRowHeight = resolveDefaultRowHeight
    this.rawRowsAxis = new ChunkedAxis({
      count: rawData.getRowCount(),
      defaultSize: resolveDefaultRowHeight(),
    })
    this.rowViewData = this.hideLayer.wrap(rawData)
  }

  clearHidden(): void {
    this.hideLayer.setHidden([])
  }

  private get mutable(): MutableDataSource | null {
    return isMutableDataSource(this.rawData) ? this.rawData : null
  }

  insertRows(operation: InsertRowsOperation): RowsInserted | null {
    if (operation.count <= 0) return null
    const newRowIds = this.mutable?.insertRows?.(operation.at, operation.count) ?? []
    if (newRowIds.length === 0) return null
    const at = newRowIds[0]!
    this.rawRowsAxis.insertRange(at, operation.count, this.resolveDefaultRowHeight())
    return { kind: 'rowsInserted', at, count: operation.count, newRowIds }
  }

  deleteRows(operation: DeleteRowsOperation): RowsDeleted | null {
    const rowIds = normalizeDeleteRows(this.rawData.getRowCount(), operation.rowIds)
    if (!rowIds) return null
    const deletedHeights = rowIds.map((id) => this.rawRowsAxis.getSize(id))
    const snapshots = this.mutable?.deleteRows?.(rowIds) ?? []
    if (snapshots.length === 0) return null
    this.rawRowsAxis.deleteRange(rowIds)
    return { kind: 'rowsDeleted', rowIds, snapshots, deletedHeights }
  }

  hideRows(operation: HideRowsOperation): RowsHidden | null {
    const newlyHidden = getNewlyHiddenRows(operation.rowIds, this.hideLayer.getHiddenUnderlyingRows())
    if (newlyHidden.length === 0) return null
    this.hideLayer.addHidden(newlyHidden)
    return { kind: 'rowsHidden', rowIds: newlyHidden }
  }

  unhideRows(operation: UnhideRowsOperation): RowsUnhidden | null {
    const newlyVisible = getNewlyVisibleRows(operation.rowIds, this.hideLayer.getHiddenUnderlyingRows())
    if (newlyVisible.length === 0) return null
    this.hideLayer.removeHidden(newlyVisible)
    return { kind: 'rowsUnhidden', rowIds: newlyVisible }
  }

  moveRows(operation: MoveRowsOperation): RowsMoved | null {
    const mutable = this.mutable
    if (!mutable?.moveRows) return null
    const plan = normalizeMoveRows(this.rawData.getRowCount(), operation.rowIds, operation.beforeRowId)
    if (!plan) return null

    const heightsBefore = captureRowHeights(this.rawRowsAxis)
    mutable.moveRows(plan.rowIds, plan.beforeRowId)
    this.rawRowsAxis = buildRawRowsAxisFromHeights(
      reorderByIndexMap(heightsBefore, plan.indexMap),
      this.resolveDefaultRowHeight(),
    )
    this.hideLayer.setHidden(remapRowsByIndexMap(this.getHiddenRows(), plan.indexMap))

    return {
      kind: 'rowsMoved',
      rowIds: plan.rowIds,
      beforeRowId: plan.beforeRowId,
      inverseRowIds: plan.inverseRowIds,
      inverseBeforeRowId: plan.inverseBeforeRowId,
      indexMap: plan.indexMap,
    }
  }

  getRowHeight(underlyingRow: number): number {
    return this.rawRowsAxis.getSize(underlyingRow)
  }

  setRowHeight(underlyingRow: number, height: number): void {
    this.rawRowsAxis.setSize(underlyingRow, height)
  }

  setRowHeightsMulti(underlyingRows: readonly number[], height: number): void {
    for (const id of underlyingRows) this.rawRowsAxis.setSize(id, height)
  }

  setDefaultRowHeight(height: number): void {
    this.rawRowsAxis.setDefaultSize(height)
  }

  getViewRowsAxis(): ChunkedAxis {
    const visibleRows = this.hideLayer.getVisibleRows()
    const defaultSize = this.resolveDefaultRowHeight()
    const viewAxis = new ChunkedAxis({ count: visibleRows.length, defaultSize })
    for (let viewRow = 0; viewRow < visibleRows.length; viewRow += 1) {
      const underlyingRow = visibleRows[viewRow]!
      const size = this.rawRowsAxis.getSize(underlyingRow)
      if (size !== defaultSize) viewAxis.setSize(viewRow, size)
    }
    return viewAxis
  }

  getRowViewData(): DataSource {
    return this.rowViewData
  }

  getHiddenRows(): readonly number[] {
    return Array.from(this.hideLayer.getHiddenUnderlyingRows()).sort((a, b) => a - b)
  }

  getCollapsedGaps(): readonly CollapsedGap[] {
    return this.hideLayer.getCollapsedGaps()
  }

  insertBlankRows(at: number, count: number): void {
    this.mutable?.insertRows?.(at, count)
    this.rawRowsAxis.insertRange(at, count, this.resolveDefaultRowHeight())
  }

  deleteRowsByIds(underlyingRowIds: readonly number[]): void {
    this.mutable?.deleteRows?.(underlyingRowIds)
    this.rawRowsAxis.deleteRange(underlyingRowIds)
  }

  reinsertDeletedRows(
    snapshots: readonly DeletedRowSnapshot[],
    heights: readonly number[],
  ): void {
    const mutable = this.mutable
    if (!mutable?.insertRows) return
    // 按 originalUnderlyingRow 升序回插（与 heights 升序对齐）；从末尾向前以保持索引有效。
    const sorted = [...snapshots].sort(
      (a, b) => a.originalUnderlyingRow - b.originalUnderlyingRow,
    )
    for (let i = sorted.length - 1; i >= 0; i -= 1) {
      const snap = sorted[i]!
      mutable.insertRows(snap.originalUnderlyingRow, 1)
      this.rawRowsAxis.insertRange(
        snap.originalUnderlyingRow,
        1,
        heights[i] ?? this.resolveDefaultRowHeight(),
      )
      for (const field of this.rawData.getSchema().fields) {
        const val = snap.cells[field.id]
        if (val === undefined) continue
        if (mutable.updateCellByUnderlyingRow) {
          mutable.updateCellByUnderlyingRow(snap.originalUnderlyingRow, field.id, val)
        } else {
          mutable.updateCell(snap.originalUnderlyingRow, field.id, val)
        }
      }
    }
  }

  addHidden(underlyingRowIds: readonly number[]): void {
    this.hideLayer.addHidden(underlyingRowIds)
  }

  removeHidden(underlyingRowIds: readonly number[]): void {
    this.hideLayer.removeHidden(underlyingRowIds)
  }
}
```

- [ ] **Step 5: 跑聚合根单测看绿**

Run: `bun test packages/core/tests/engine/row/DefaultRowStructure.test.ts`
Expected: PASS（全部用例绿）。

> 注意：此刻**不要**跑全量 typecheck —— `DefaultGridEngine` 仍按旧 context 形态构造 `DefaultRowStructure`，会编译失败，这是 Task 2 修复的过渡红窗，已与用户确认接受。

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/engine/row/RowStructure.ts \
        packages/core/src/engine/row/DefaultRowStructure.ts \
        packages/core/tests/engine/row/DefaultRowStructure.test.ts
git commit -m "refactor(core): RowStructure 聚合根自持行高轴与隐藏层

删除 RowStructureContext,DefaultRowStructure 改为 (rawData, resolveDefaultRowHeight)
构造,自持 rawRowsAxis + HideRowsLayer,新增派生读与 undo/redo 逆变迁方法。
engine 接线在下一提交修复(过渡期 core typecheck 暂红,已确认)。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2：`DefaultGridEngine` 接线到聚合根（关闭红窗）

**Files:**
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`

> 本任务是原子单元：删除 `rawRowsAxis` / `hideRowsLayer` / `rowViewData` 三字段会一次性打断所有引用，必须在同一提交内全部 rewire 完。各 Step 是有序的局部替换；只在 Step 末（Step 13）跑全量 typecheck + test。

- [ ] **Step 1: 删除三个行字段，命令处理器改为构造期赋值**

删除字段声明 `private rowViewData: DataSource`、`private readonly hideRowsLayer = new HideRowsLayer()`、`private rawRowsAxis: ChunkedAxis`（连同其 TSDoc）。

删除整段 `rowStructure` 字段初始化器（即 `private readonly rowStructure = new DefaultRowStructure({ ... })`，含全部 9 个 context arrow）。

把 5 个命令处理器字段从「带初始化器」改为「仅声明」：

```typescript
  private readonly rowStructure: DefaultRowStructure
  private readonly moveRowsCommand: MoveRowsCommandHandler
  private readonly insertRowsCommand: InsertRowsCommandHandler
  private readonly deleteRowsCommand: DeleteRowsCommandHandler
  private readonly hideRowsCommand: HideRowsCommandHandler
  private readonly unhideRowsCommand: UnhideRowsCommandHandler
```

- [ ] **Step 2: 在构造函数里创建聚合根与命令处理器**

在构造函数中 `this.explicitDefaultRowHeight = options.defaultRowHeight` 之后、`this.rowViewData = ...` 之前，插入：

```typescript
    this.rowStructure = new DefaultRowStructure(this.rawData, () => this.resolveDefaultRowHeight())
    this.moveRowsCommand = new MoveRowsCommandHandler(this.rowStructure, this.eventPipeline)
    this.insertRowsCommand = new InsertRowsCommandHandler(this.rowStructure, this.eventPipeline)
    this.deleteRowsCommand = new DeleteRowsCommandHandler(this.rowStructure, this.eventPipeline)
    this.hideRowsCommand = new HideRowsCommandHandler(this.rowStructure, this.eventPipeline)
    this.unhideRowsCommand = new UnhideRowsCommandHandler(this.rowStructure, this.eventPipeline)
```

然后把原构造函数中的：

```typescript
    this.rowViewData = this.hideRowsLayer.wrap(this.rawData)
    this.data = this.wrapViewData(this.rowViewData)
    this.rawRowsAxis = new ChunkedAxis({
      count: this.rawData.getRowCount(),
      defaultSize: this.resolveDefaultRowHeight(),
    })
    this.rowsAxis = this.buildViewRowsAxis()
```

替换为：

```typescript
    this.data = this.wrapViewData(this.rowStructure.getRowViewData())
    this.rowsAxis = this.rowStructure.getViewRowsAxis()
```

- [ ] **Step 3: `setData` 改用 `clearHidden`**

把 `setData` 中的 `this.hideRowsLayer.setHidden([])` 改为 `this.rowStructure.clearHidden()`。

- [ ] **Step 4: `rebuildData` 改用聚合根**

把 `rebuildData` 中的：

```typescript
    this.rawData = data
    this.rowViewData = this.hideRowsLayer.wrap(this.rawData)
    this.data = this.wrapViewData(this.rowViewData)
    this.rawRowsAxis = new ChunkedAxis({
      count: this.rawData.getRowCount(),
      defaultSize: this.resolveDefaultRowHeight(),
    })
    this.rowsAxis = this.buildViewRowsAxis()
```

替换为：

```typescript
    this.rawData = data
    this.rowStructure.rebuild(this.rawData, () => this.resolveDefaultRowHeight())
    this.data = this.wrapViewData(this.rowStructure.getRowViewData())
    this.rowsAxis = this.rowStructure.getViewRowsAxis()
```

> 注意：`setViewData`（sort/filter 换视图数据时）也走 `rebuildData` 且**不**清隐藏——`rebuild` 不清隐藏，`HideRowsLayer.wrap` 会对新 upstream 重算 visibleRows 但保留 hidden 集，语义与现状一致。

- [ ] **Step 5: `setTheme` 默认行高同步**

把 `setTheme` 中的 `this.rawRowsAxis.setDefaultSize(theme.metrics.rowHeight)` 改为 `this.rowStructure.setDefaultRowHeight(theme.metrics.rowHeight)`。

- [ ] **Step 6: `getRowHeight` / 单行 setRowHeight 委托**

- 把 `getRowHeight` 体内的 `return this.rawRowsAxis.getSize(rowIndex)` 改为 `return this.rowStructure.getRowHeight(rowIndex)`。
- 把设置单行行高处的 `this.rawRowsAxis.setSize(rowIndex, height)` 改为 `this.rowStructure.setRowHeight(rowIndex, height)`（约 line 270）。
- 把另一处单行行高写入 `this.rawRowsAxis.setSize(rowIndex, newHeight)` 改为 `this.rowStructure.setRowHeight(rowIndex, newHeight)`（约 line 866）。

- [ ] **Step 7: 多行行高 setRowHeightsMulti 委托**

把多行设高处的：

```typescript
    const oldHeights = rowIds.map((id) => this.rawRowsAxis.getSize(id))
    for (const id of rowIds) this.rawRowsAxis.setSize(id, h)
```

替换为：

```typescript
    const oldHeights = rowIds.map((id) => this.rowStructure.getRowHeight(id))
    this.rowStructure.setRowHeightsMulti(rowIds, h)
```

（`oldHeights` 仍供 `resizeRowsMulti` undo 命令使用，保留。）

- [ ] **Step 8: `getHiddenRows` / `getCollapsedGaps` 委托**

- 把 `getHiddenRows` 体内的 `return Array.from(this.hideRowsLayer.getHiddenUnderlyingRows()).sort((a, b) => a - b)` 改为 `return this.rowStructure.getHiddenRows()`。
- 把 `getFrame` 中的 `const allGaps = this.hideRowsLayer.getCollapsedGaps()` 改为 `const allGaps = this.rowStructure.getCollapsedGaps()`。

- [ ] **Step 9: 删除 `buildViewRowsAxis`，`rebuildViewAxis` 读聚合根**

删除私有方法 `buildViewRowsAxis()`（整段）。把 `rebuildViewAxis()` 体内的 `this.rowsAxis = this.buildViewRowsAxis()` 改为 `this.rowsAxis = this.rowStructure.getViewRowsAxis()`。

- [ ] **Step 10: rewire undo 行分支（`applyUndo`）**

逐分支替换（行状态变迁交聚合根；`formatStore/mergeStore.restore`、`selection.setSelection`、`rebuildViewAxis` 保持不变）：

- `case 'resizeRow'`: `this.rawRowsAxis.setSize(cmd.rowIndex, cmd.before)` → `this.rowStructure.setRowHeight(cmd.rowIndex, cmd.before)`
- `case 'insertRows'`: 把
  ```typescript
        const idsToRemove = Array.from({ length: cmd.count }, (_, i) => cmd.at + i)
        this.rawData.deleteRows(idsToRemove)
        this.rawRowsAxis.deleteRange(idsToRemove)
  ```
  替换为
  ```typescript
        const idsToRemove = Array.from({ length: cmd.count }, (_, i) => cmd.at + i)
        this.rowStructure.deleteRowsByIds(idsToRemove)
  ```
  （保留外层 `if (!isMutableDataSource(this.rawData) || !this.rawData.deleteRows) return` 守卫。）
- `case 'deleteRows'`: 把整段「sorted 回插循环」（`const sorted = [...cmd.snapshots]...` 到循环结束）替换为
  ```typescript
        this.rowStructure.reinsertDeletedRows(cmd.snapshots, cmd.deletedHeights)
  ```
  （保留 `if (!isMutableDataSource(this.rawData) || !this.rawData.insertRows) return` 守卫；其后的 `rebuildViewAxis` / `formatStore.restore` / `mergeStore.restore` / `selection.setSelection` 保持不变。）
- `case 'hideRows'`: `this.hideRowsLayer.removeHidden(cmd.underlyingRowIds)` → `this.rowStructure.removeHidden(cmd.underlyingRowIds)`
- `case 'unhideRows'`: `this.hideRowsLayer.addHidden(cmd.underlyingRowIds)` → `this.rowStructure.addHidden(cmd.underlyingRowIds)`
- `case 'resizeRowsMulti'`: 把
  ```typescript
        for (let i = 0; i < cmd.rowIds.length; i += 1) {
          this.rawRowsAxis.setSize(
            cmd.rowIds[i]!,
            cmd.oldHeights[i] ?? this.resolveDefaultRowHeight(),
          )
        }
  ```
  替换为
  ```typescript
        for (let i = 0; i < cmd.rowIds.length; i += 1) {
          this.rowStructure.setRowHeight(
            cmd.rowIds[i]!,
            cmd.oldHeights[i] ?? this.resolveDefaultRowHeight(),
          )
        }
  ```
- `case 'moveRows'`: 不变（`applyMoveRowsCommand` 已走 `moveRowsCommand` → 聚合根）。

- [ ] **Step 11: rewire redo 行分支（`applyRedo`）**

- `case 'resizeRow'`: `this.rawRowsAxis.setSize(cmd.rowIndex, cmd.after)` → `this.rowStructure.setRowHeight(cmd.rowIndex, cmd.after)`；同分支 `this.rowsAxis = this.buildViewRowsAxis()` → `this.rowsAxis = this.rowStructure.getViewRowsAxis()`。
- `case 'insertRows'`: 把
  ```typescript
        this.rawData.insertRows(cmd.at, cmd.count)
        this.rawRowsAxis.insertRange(cmd.at, cmd.count, this.resolveDefaultRowHeight())
        this.rowsAxis = this.buildViewRowsAxis()
  ```
  替换为
  ```typescript
        this.rowStructure.insertBlankRows(cmd.at, cmd.count)
        this.rowsAxis = this.rowStructure.getViewRowsAxis()
  ```
  （保留 `if (!isMutableDataSource(this.rawData) || !this.rawData.insertRows) return` 守卫。）
- `case 'deleteRows'`: 把
  ```typescript
        this.rawData.deleteRows(ids)
        this.rawRowsAxis.deleteRange(ids)
        this.rowsAxis = this.buildViewRowsAxis()
  ```
  替换为
  ```typescript
        this.rowStructure.deleteRowsByIds(ids)
        this.rowsAxis = this.rowStructure.getViewRowsAxis()
  ```
  （保留 `if (!isMutableDataSource(this.rawData) || !this.rawData.deleteRows) return` 守卫；`ids` 计算保持不变。）
- `case 'hideRows'`: `this.hideRowsLayer.addHidden(cmd.underlyingRowIds)` → `this.rowStructure.addHidden(cmd.underlyingRowIds)`；`this.rowsAxis = this.buildViewRowsAxis()` → `this.rowsAxis = this.rowStructure.getViewRowsAxis()`。
- `case 'unhideRows'`: `this.hideRowsLayer.removeHidden(cmd.underlyingRowIds)` → `this.rowStructure.removeHidden(cmd.underlyingRowIds)`；`this.rowsAxis = this.buildViewRowsAxis()` → `this.rowsAxis = this.rowStructure.getViewRowsAxis()`。
- `case 'resizeRowsMulti'`: 把
  ```typescript
        for (const id of cmd.rowIds) this.rawRowsAxis.setSize(id, cmd.newHeight)
        this.rowsAxis = this.buildViewRowsAxis()
  ```
  替换为
  ```typescript
        this.rowStructure.setRowHeightsMulti(cmd.rowIds, cmd.newHeight)
        this.rowsAxis = this.rowStructure.getViewRowsAxis()
  ```
- `case 'moveRows'`: 不变。

- [ ] **Step 12: 清理未使用的 import**

删除 `import { HideRowsLayer } from '../../view/HideRowsLayer'`（若 engine 不再直接引用该类）。确认 `ChunkedAxis`、`isMutableDataSource` 仍被列轴/列操作使用而保留。`DefaultRowStructure` 的 import 保留。

- [ ] **Step 13: 全量 typecheck + test 看绿**

Run: `bun run --filter '*' typecheck`
Expected: PASS（0 错误）。

Run: `bun test`
Expected: PASS（全部包测试绿，含 `DefaultGridEngine` 行为级用例：hide/unhide、insert/delete、moveRows、setRowHeight、undo/redo、setData/setViewData）。

> 若某 engine 行为测试失败，逐一对照 Step 10/11 的分支映射，确认 format/merge/selection/rebuildViewAxis 编排未被改动。语义不符时 STOP 询问，勿改测试期望。

- [ ] **Step 14: Commit**

```bash
git add packages/core/src/engine/DefaultGridEngine.ts
git commit -m "refactor(core): DefaultGridEngine 接线到 RowStructure 聚合根

删除 rawRowsAxis/hideRowsLayer/rowViewData 字段,行状态读写与 undo/redo
逆变迁全部委托聚合根;frozen/viewport 组装、列隐藏、format/merge/selection
编排仍留 engine。恢复全量 typecheck + test 绿。

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3：文档与最终回归

**Files:**
- Modify: `packages/core/src/engine/row/README.md`

- [ ] **Step 1: 更新 row/README.md 边界描述**

把 `RowStructure.ts` 与「边界」小节中关于 `RowStructureContext` 的描述更新为：`RowStructure.ts` 现为富领域接口；`DefaultRowStructure` 自持 `rawRowsAxis` 与 `HideRowsLayer`，经构造/`rebuild` 注入 raw `MutableDataSource` 引用与 `resolveDefaultRowHeight`；不再有 `RowStructureContext`。删除「`RowStructureContext` 只暴露最小端口」那条，替换为「聚合根仅依赖 raw 数据源与默认行高解析两项；frozen/viewport/列隐藏/format/merge/selection 仍由 `DefaultGridEngine` 编排」。

- [ ] **Step 2: 四项全绿验证**

```bash
bun run lint && bun run --filter '*' typecheck && bun test && \
bun run --filter @novasheet/web build && \
bun run --filter @novasheet/web-canvas2d build && \
bun run --filter @novasheet/core build
```
Expected: 全部 PASS（lint 0 errors/0 warnings；typecheck 0；test 全绿；build 成功）。

- [ ] **Step 3: Commit**

```bash
git add packages/core/src/engine/row/README.md
git commit -m "docs(core): 更新 row 领域 README,移除 RowStructureContext 描述

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-review 笔记（计划编写后自检）

- **Spec 覆盖**：所有权迁移（Task 1 状态字段 + Task 2 删字段）、富接口（Task 1 接口）、注入依赖收敛为 2 项（Task 1 构造）、undo 逆变迁内化（Task 1 方法 + Task 2 Step 10/11）、派生读（Task 1）、`setData`/`setViewData` 隐藏语义（Task 2 Step 3/4 注记）、测试策略（Task 1 单测重写 + Task 2 Step 13 回归）、README（Task 3）——均有对应任务。
- **类型一致性**：接口方法名与实现、与 engine 调用点一致（`getViewRowsAxis`/`getRowViewData`/`getHiddenRows`/`getCollapsedGaps`/`setRowHeight`/`setRowHeightsMulti`/`setDefaultRowHeight`/`insertBlankRows`/`deleteRowsByIds`/`reinsertDeletedRows`/`addHidden`/`removeHidden`/`rebuild`/`clearHidden`）。`CollapsedGap` 从 `view/HideRowsLayer` 导入（已是 export）。
- **过渡红窗**：已在头部约束与 Task 1 Step 5 显式标注，Task 2 原子提交关闭——与用户「接受暂时不可用」一致。
```
