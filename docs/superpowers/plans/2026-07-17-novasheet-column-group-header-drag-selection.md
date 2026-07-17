# 分组表头连续拖选 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 spec `docs/superpowers/specs/2026-07-17-novasheet-column-group-header-drag-selection-design.md`，让同层分组表头支持横向连续拖选与 `Shift + 点击` 扩选，且 `interactions.reorder: false` 只关闭列换位、不关闭组头选择。

**Architecture:** 新建独立 `ColumnGroupHeaderDrag`，由 `DragCoordinator` 在叶列表头 Drag 之前派发。`InputController` 只负责把 `RenderFrame.columnGroupHeader` 转成 view 坐标命中结果；Drag 锁定 pointerdown 的 group level，并复用 `selectWholeColumnRange()` 写入现有单矩形 selection，Canvas 与 SelectionModel 不变。

**Tech Stack:** TypeScript strict、bun workspaces、`bun:test`、Core DOM runtime、MBD Markdown behavior scenarios。

## Global Constraints

- bun ≥ 1.2 only；禁止 npm/yarn/pnpm。
- 严格 TDD：每个实现任务必须先观察目标测试失败，再写最小实现并观察转绿。
- BDD 外环先行：先提交 L2 scenario，再落行为测试；不得为让测试通过而改变场景期望。
- `GridSelection` 保持单个连续 `selectedRange`；不实现 Ctrl/Cmd 非连续多选。
- pointerdown 后锁定起始 group `level`；move 阶段忽略 pointer `y`，只按 `x` 命中该层组。
- `reorder` 仅控制 column reorder；不得作为组头 Drag 的启用条件。
- Canvas/Theme/engine/schema group tree 不修改；命中只读 `RenderFrame.columnGroupHeader` 的 view 坐标。
- type-only import 必须使用 `import type`；遵守 `noUncheckedIndexedAccess`。
- 从仓库根目录执行测试；一 task 一提交，Conventional Commits 中文 subject。
- 当前工作区已有无关未提交改动；每次只 `git add` 本 task 明列文件，禁止 `git add -A`。
- spec 与现有代码或测试矛盾时 STOP+ASK，禁止静默改期望。

## File Map

| 文件 | 责任 |
| --- | --- |
| `packages/core/tests/acceptance/interaction/selection/scenarios/L2-grid-column-group-header-drag-selection.md` | 用户可观察的同层组头拖选契约 |
| `packages/core/src/dom/interaction/ColumnGroupHeaderHit.ts` | 组头 view 命中结果的共享窄类型 |
| `packages/core/src/dom/interaction/drag/ColumnGroupHeaderDrag.ts` | 组头选择手势状态机 |
| `packages/core/src/dom/runtime/controllers/InputController.ts` | pointer 坐标 → group cell 命中；pointerdown 路由 |
| `packages/core/src/dom/runtime/controllers/DragCoordinator.ts` | 构造、排序、驱动组头 Drag |
| `packages/core/src/dom/runtime/GridRuntime.ts` | 在 InputController 与 DragCoordinator 之间接命中 closure |
| 对应 `packages/core/tests/**` | 单元、runtime 和 L2 行为验证 |

---

### Task 1: 定稿 L2 行为场景并同步 manifest

**Files:**
- Create: `packages/core/tests/acceptance/interaction/selection/scenarios/L2-grid-column-group-header-drag-selection.md`
- Modify (generated): `packages/core/tests/acceptance/scenarios.manifest.json`
- Modify (generated): `packages/core/tests/acceptance/SCENARIOS.md`

**Interfaces:**
- Produces: scenario id `core.L2.grid-column-group-header-drag-selection`，Task 4 的行为测试 title 必须以前述 id 开头。

- [x] **Step 1: 写 scenario**

```md
---
id: core.L2.grid-column-group-header-drag-selection
layer: L2
summary: 同层分组表头支持连续拖选且不依赖列换位配置
tags: [grid, selection, column-groups, drag]
status: draft
---

## User Story

作为带多级列表头的 Grid 使用者，我希望从一个分组表头横向拖到同层另一个分组表头时，选中两组之间全部连续叶列，以便在关闭列换位的只读监控表中连续高亮多个业务列组。

## Given

- 一个 mounted Grid，schema 为无组指标列 + `堆1 → 簇1/簇2` + `堆2 → 簇1/簇2`
- 无组指标列通过 `frozen: { leftCols: 1 }` 冻结在左侧
- `interactions: { reorder: false }`
- 每列宽度 100，三行数据

## When

- pointerdown 第一层组头 `堆1`
- pointermove 横向到第一层组头 `堆2`，期间 pointer 的 y 移入叶头行
- pointerup

## Then

- 最终 `selectedRange` 覆盖全部数据行与 `堆1`、`堆2` 的四个叶列
- 无组指标列不在选区内
- 组头拖选不改变 schema 字段顺序
- `reorder: false` 不阻止上述连续选择
```

- [x] **Step 2: 校验并生成 manifest**

Run:

```bash
bun run --filter @zhiguang/novasheet-core lint:mbd
bun run --filter @zhiguang/novasheet-core manifest:mbd
```

Expected: `mbd validate` 报告全部 scenario ok；manifest/SCENARIOS 生成且包含新 id。

- [x] **Step 3: 检查生成差异**

Run:

```bash
rg -n "core.L2.grid-column-group-header-drag-selection" \
  packages/core/tests/acceptance/scenarios.manifest.json \
  packages/core/tests/acceptance/SCENARIOS.md
git diff --check -- packages/core/tests/acceptance
```

Expected: 三处均命中，`git diff --check` 无输出。

- [x] **Step 4: Commit**

```bash
git add packages/core/tests/acceptance/interaction/selection/scenarios/L2-grid-column-group-header-drag-selection.md \
  packages/core/tests/acceptance/scenarios.manifest.json \
  packages/core/tests/acceptance/SCENARIOS.md
git commit -m "test(core): 定义分组表头连续拖选场景"
```

---

### Task 2: 扩展组头命中契约

**Files:**
- Create: `packages/core/src/dom/interaction/ColumnGroupHeaderHit.ts`
- Modify: `packages/core/src/dom/runtime/controllers/InputController.ts`
- Test: `packages/core/tests/dom/runtime/controllers/InputController.column-groups.test.ts`

**Interfaces:**
- Produces:
  - `ColumnGroupHeaderHit`
  - `InputController.hitTestGroupHeader(event: WebPointerEvent): ColumnGroupHeaderHit | null`
  - `InputController.hitTestGroupHeaderAtLevel(event: WebPointerEvent, level: number): ColumnGroupHeaderHit | null`
- Consumes: `RenderFrameColumnGroupHeader.rows[level]` 的 view 闭区间。

- [x] **Step 1: 把现有 hit 测试改成完整契约，并新增锁层命中测试**

把现有 `返回该组 groupId` 期望改为：

```ts
expect(ctl.hitTestGroupHeader({ x: 150, y: 10, shiftKey: false })).toEqual({
  groupId: 's1',
  level: 0,
  startViewCol: 1,
  endViewCol: 2,
})
```

新增：

```ts
it('锁定 level 后忽略 pointer y，仍按 x 返回该层组区间', () => {
  const { ctl } = makeCtl(makeGroupedFrame())
  expect(ctl.hitTestGroupHeaderAtLevel({ x: 150, y: 200, shiftKey: false }, 0)).toEqual({
    groupId: 's1',
    level: 0,
    startViewCol: 1,
    endViewCol: 2,
  })
})

it('锁定 level 越界或 x 落在同层无组空隙时返回 null', () => {
  const { ctl } = makeCtl(makeGroupedFrame())
  expect(ctl.hitTestGroupHeaderAtLevel({ x: 50, y: 200, shiftKey: false }, 0)).toBeNull()
  expect(ctl.hitTestGroupHeaderAtLevel({ x: 150, y: 200, shiftKey: false }, 1)).toBeNull()
})

it('锁定 level 后横向越界钳到该层首组或末组', () => {
  const { ctl } = makeCtl(makeGroupedFrame())
  expect(ctl.hitTestGroupHeaderAtLevel({ x: -10, y: 200, shiftKey: false }, 0)?.groupId)
    .toBe('s1')
  expect(ctl.hitTestGroupHeaderAtLevel({ x: 350, y: 200, shiftKey: false }, 0)?.groupId)
    .toBe('s1')
})
```

- [x] **Step 2: 跑测试确认红**

Run: `bun test packages/core/tests/dom/runtime/controllers/InputController.column-groups.test.ts`

Expected: FAIL；旧返回值缺 `level/startViewCol/endViewCol`，且 `hitTestGroupHeaderAtLevel` 不存在。

- [x] **Step 3: 新增共享类型**

```ts
// packages/core/src/dom/interaction/ColumnGroupHeaderHit.ts
/** RenderFrame 中一个可见分组表头 cell 的 view 坐标命中结果。 */
export interface ColumnGroupHeaderHit {
  readonly groupId: string
  readonly level: number
  readonly startViewCol: number
  readonly endViewCol: number
}
```

- [x] **Step 4: 重构 InputController 命中实现**

在 `InputController.ts` import 该 type，并把现有方法改为：

```ts
hitTestGroupHeader(event: WebPointerEvent): ColumnGroupHeaderHit | null {
  const frame = this.deps.engine.getFrame()
  const columnGroupHeader = frame.columnGroupHeader
  if (!columnGroupHeader) return null
  const headerHeight = frame.viewport.headerHeight ?? frame.theme.metrics.headerHeight
  if (event.y < 0 || event.y >= headerHeight) return null
  const rowHeaderWidth = frame.viewport.rowHeaderWidth ?? 0
  const scrollX = frame.viewport.scrollX ?? 0
  const logicalX = event.x - rowHeaderWidth + scrollX
  const totalSize = this.deps.getColsTotalSizeForFrame(frame)
  if (event.x < rowHeaderWidth || logicalX < 0 || logicalX >= totalSize) return null
  const level = Math.floor(event.y / frame.theme.metrics.groupHeaderRowHeight)
  if (level < 0 || level >= columnGroupHeader.depth) return null
  return this.hitTestGroupHeaderAtLevel(event, level)
}

hitTestGroupHeaderAtLevel(
  event: WebPointerEvent,
  level: number,
): ColumnGroupHeaderHit | null {
  const frame = this.deps.engine.getFrame()
  const columnGroupHeader = frame.columnGroupHeader
  const row = columnGroupHeader?.rows[level]
  if (!row) return null
  const rowHeaderWidth = frame.viewport.rowHeaderWidth ?? 0
  const scrollX = frame.viewport.scrollX ?? 0
  const logicalX = event.x - rowHeaderWidth + scrollX
  const totalSize = this.deps.getColsTotalSizeForFrame(frame)
  if (row.length === 0) return null
  if (logicalX < 0) return this.toColumnGroupHeaderHit(row[0]!, level)
  if (logicalX >= totalSize) return this.toColumnGroupHeaderHit(row[row.length - 1]!, level)
  const colIndex = frame.colsAxis.positionToIndex(logicalX)
  const cell = row.find((candidate) =>
    colIndex >= candidate.startViewCol && colIndex <= candidate.endViewCol
  )
  return cell ? this.toColumnGroupHeaderHit(cell, level) : null
}
```

增加 private helper，参数 cell 类型用 `RenderFrameGroupHeaderCell`：

```ts
private toColumnGroupHeaderHit(
  cell: RenderFrameGroupHeaderCell,
  level: number,
): ColumnGroupHeaderHit {
  return {
    groupId: cell.groupId,
    level,
    startViewCol: cell.startViewCol,
    endViewCol: cell.endViewCol,
  }
}
```

从 `../../../kernel/render/RenderFrame` 以 `import type` 引入
`RenderFrameGroupHeaderCell`。

此 task 不改变 `handleHostPointerDown()` 的旧短路行为。

- [x] **Step 5: 跑测试和 typecheck 确认绿**

Run:

```bash
bun test packages/core/tests/dom/runtime/controllers/InputController.column-groups.test.ts
bun run --filter @zhiguang/novasheet-core typecheck
```

Expected: PASS / 0 error。

- [x] **Step 6: Commit**

```bash
git add packages/core/src/dom/interaction/ColumnGroupHeaderHit.ts \
  packages/core/src/dom/runtime/controllers/InputController.ts \
  packages/core/tests/dom/runtime/controllers/InputController.column-groups.test.ts
git commit -m "refactor(core): 扩展分组表头命中契约"
```

---

### Task 3: 以单测驱动 `ColumnGroupHeaderDrag`

**Files:**
- Create: `packages/core/src/dom/interaction/drag/ColumnGroupHeaderDrag.ts`
- Create: `packages/core/tests/dom/interaction/drag/ColumnGroupHeaderDrag.test.ts`

**Interfaces:**
- Consumes: Task 2 的 `ColumnGroupHeaderHit`。
- Produces: `ColumnGroupHeaderDrag implements Drag` 与 `ColumnGroupHeaderDragDeps`。

- [x] **Step 1: 写失败测试 fixture 和核心用例**

测试文件使用 `bun:test` 的 `mock`，构造两个同层组：`s1=[1,2]`、`s2=[3,4]`。完整 helper：

```ts
const s1 = { groupId: 's1', level: 0, startViewCol: 1, endViewCol: 2 }
const s2 = { groupId: 's2', level: 0, startViewCol: 3, endViewCol: 4 }

function makeDrag(options: {
  selection?: GridSelection
  isWholeColumnSelection?: (range: CellRange) => boolean
  blocked?: boolean
  hitTestGroupHeader?: (event: WebPointerEvent) => ColumnGroupHeaderHit | null
} = {}) {
  const selectWholeColumnRange = mock((_anchor: number, _extent: number) => {})
  const requestAutoScroll = mock((_event: WebPointerEvent) => {})
  const stopAutoScroll = mock(() => {})
  const engine = makeMockGridEngine(options.selection ? { selection: options.selection } : {})
  const drag = new ColumnGroupHeaderDrag({
    engine,
    refresh: mock(() => {}),
    requestAutoScroll,
    stopAutoScroll,
    isBlocked: () => options.blocked ?? false,
    hitTestGroupHeader: options.hitTestGroupHeader ?? ((event) => event.x < 300 ? s1 : s2),
    hitTestGroupHeaderAtLevel: (event, level) =>
      level === 0 ? (event.x < 300 ? s1 : s2) : null,
    isWholeColumnSelection: options.isWholeColumnSelection ?? (() => false),
    selectWholeColumnRange,
  })
  return { drag, selectWholeColumnRange, requestAutoScroll, stopAutoScroll }
}
```

用例：

```ts
it('pointerdown 选中起始组，move 锁层并扩展到目标组', () => {
  const { drag, selectWholeColumnRange } = makeDrag()
  expect(drag.tryStart({ x: 150, y: 10, shiftKey: false, button: 0 })).toBe(true)
  expect(selectWholeColumnRange).toHaveBeenLastCalledWith(1, 2)
  expect(drag.active).toBe(true)

  drag.move({ x: 350, y: 200, shiftKey: false })
  expect(selectWholeColumnRange).toHaveBeenLastCalledWith(1, 4)
})

it('从右向左拖选时使用起始组右边界与目标组左边界', () => {
  const { drag, selectWholeColumnRange } = makeDrag()
  drag.tryStart({ x: 350, y: 10, shiftKey: false, button: 0 })
  drag.move({ x: 150, y: 200, shiftKey: false })
  expect(selectWholeColumnRange).toHaveBeenLastCalledWith(4, 1)
})

it('Shift 点击沿既有整列 anchor 扩展到目标组远端', () => {
  const selection = {
    activeCell: { rowIndex: 0, colIndex: 1 },
    anchorCell: { rowIndex: 0, colIndex: 1 },
    extentCell: { rowIndex: 2, colIndex: 2 },
    selectedRange: { startRow: 0, endRow: 2, startCol: 1, endCol: 2 },
  }
  const shifted = makeDrag({ selection, isWholeColumnSelection: () => true })
  shifted.drag.tryStart({ x: 350, y: 10, shiftKey: true, button: 0 })
  expect(shifted.selectWholeColumnRange).toHaveBeenLastCalledWith(1, 4)
})
```

补齐生命周期用例：

```ts
it('blocked 或未命中时不消费 pointerdown', () => {
  expect(makeDrag({ blocked: true }).drag.tryStart({
    x: 150, y: 10, shiftKey: false, button: 0,
  })).toBe(false)
  expect(makeDrag({ hitTestGroupHeader: () => null }).drag.tryStart({
    x: 150, y: 10, shiftKey: false, button: 0,
  })).toBe(false)
})

it('move 请求自动滚动，reevaluate 重算目标，commit/cancel 停止滚动', () => {
  const first = makeDrag()
  first.drag.tryStart({ x: 150, y: 10, shiftKey: false, button: 0 })
  first.drag.move({ x: 350, y: 200, shiftKey: false })
  expect(first.requestAutoScroll).toHaveBeenCalledTimes(1)
  first.drag.reevaluate({ x: 150, y: 240, shiftKey: false })
  expect(first.selectWholeColumnRange).toHaveBeenLastCalledWith(1, 2)
  first.drag.commit()
  expect(first.stopAutoScroll).toHaveBeenCalledTimes(1)

  const second = makeDrag()
  second.drag.tryStart({ x: 150, y: 10, shiftKey: false, button: 0 })
  second.drag.cancel()
  expect(second.stopAutoScroll).toHaveBeenCalledTimes(1)
})
```

测试 import 必须完整包含：`ColumnGroupHeaderDrag`、`ColumnGroupHeaderHit`、
`CellRange`、`GridSelection`、`WebPointerEvent`、`makeMockGridEngine` 以及
`describe/expect/it/mock`。

- [x] **Step 2: 跑测试确认红**

Run: `bun test packages/core/tests/dom/interaction/drag/ColumnGroupHeaderDrag.test.ts`

Expected: FAIL（module 不存在）。

- [x] **Step 3: 实现最小 Drag 状态机**

```ts
import type { CellRange } from '../../../kernel/coords/SelectionTypes'
import type { GridSelectionAccess } from '../../../engine/GridEngine'
import type { ColumnGroupHeaderHit } from '../ColumnGroupHeaderHit'
import type { WebPointerEvent } from '../../host/Host'
import type { AutoScrollAxis, Drag } from './Drag'

type ColumnGroupHeaderDragEngine = Pick<GridSelectionAccess, 'getSelection'>

export interface ColumnGroupHeaderDragDeps {
  readonly engine: ColumnGroupHeaderDragEngine
  refresh(): void
  requestAutoScroll(pointer: WebPointerEvent): void
  stopAutoScroll(): void
  isBlocked(): boolean
  hitTestGroupHeader(event: WebPointerEvent): ColumnGroupHeaderHit | null
  hitTestGroupHeaderAtLevel(event: WebPointerEvent, level: number): ColumnGroupHeaderHit | null
  isWholeColumnSelection(range: CellRange): boolean
  selectWholeColumnRange(anchorCol: number, extentCol: number): void
}

interface GroupSelectState {
  readonly level: number
  readonly anchorStartCol: number
  readonly anchorEndCol: number
}

export class ColumnGroupHeaderDrag implements Drag {
  readonly autoScrollAxis: AutoScrollAxis = 'horizontal'
  private state: GroupSelectState | null = null

  constructor(private readonly deps: ColumnGroupHeaderDragDeps) {}

  get active(): boolean {
    return this.state !== null
  }

  tryStart(event: WebPointerEvent): boolean {
    if (this.deps.isBlocked()) return false
    const hit = this.deps.hitTestGroupHeader(event)
    if (!hit) return false
    const selection = this.deps.engine.getSelection()
    const range = selection.selectedRange
    const existingAnchor =
      event.shiftKey && range && this.deps.isWholeColumnSelection(range)
        ? selection.anchorCell?.colIndex
        : undefined
    this.state = existingAnchor === undefined
      ? { level: hit.level, anchorStartCol: hit.startViewCol, anchorEndCol: hit.endViewCol }
      : { level: hit.level, anchorStartCol: existingAnchor, anchorEndCol: existingAnchor }
    this.selectThrough(hit)
    this.deps.refresh()
    return true
  }

  move(event: WebPointerEvent): boolean {
    const state = this.state
    if (!state) return false
    this.deps.requestAutoScroll(event)
    const hit = this.deps.hitTestGroupHeaderAtLevel(event, state.level)
    if (hit) {
      this.selectThrough(hit)
      this.deps.refresh()
    }
    return true
  }

  reevaluate(pointer: WebPointerEvent): void {
    this.move(pointer)
  }

  commit(): void {
    this.finish()
  }

  cancel(): void {
    this.finish()
  }

  private selectThrough(hit: ColumnGroupHeaderHit): void {
    const state = this.state
    if (!state) return
    if (hit.endViewCol < state.anchorStartCol) {
      this.deps.selectWholeColumnRange(state.anchorEndCol, hit.startViewCol)
      return
    }
    this.deps.selectWholeColumnRange(state.anchorStartCol, hit.endViewCol)
  }

  private finish(): void {
    this.state = null
    this.deps.stopAutoScroll()
  }
}
```

- [x] **Step 4: 跑目标测试确认绿**

Run: `bun test packages/core/tests/dom/interaction/drag/ColumnGroupHeaderDrag.test.ts`

Expected: 全部 PASS。

- [x] **Step 5: 跑相邻 Drag 回归和 typecheck**

Run:

```bash
bun test packages/core/tests/dom/interaction/drag \
  packages/core/tests/dom/runtime/GridRuntime.col-reorder.test.ts
bun run --filter @zhiguang/novasheet-core typecheck
```

Expected: PASS / 0 error。

- [x] **Step 6: Commit**

```bash
git add packages/core/src/dom/interaction/drag/ColumnGroupHeaderDrag.ts \
  packages/core/tests/dom/interaction/drag/ColumnGroupHeaderDrag.test.ts
git commit -m "feat(core): 新增分组表头选择拖拽"
```

---

### Task 4: 接入 runtime 并让 L2 行为测试转绿

**Files:**
- Modify: `packages/core/src/dom/runtime/controllers/DragCoordinator.ts`
- Modify: `packages/core/src/dom/runtime/controllers/InputController.ts`
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts`
- Modify: `packages/core/tests/dom/runtime/controllers/DragCoordinator.test.ts`
- Modify: `packages/core/tests/dom/runtime/controllers/InputController.column-groups.test.ts`
- Modify: `packages/core/tests/acceptance/interaction/selection/bdd.test.ts`

**Interfaces:**
- Consumes: Task 2 的两个 group hit 方法；Task 3 的 `ColumnGroupHeaderDrag`。
- Produces: mounted `Grid` 的真实 pointerdown/move/up 组头连续拖选行为。

**Plan-risk（STOP+ASK）：** 行为测试坐标基于 `groupHeaderRowHeight=28`、leaf header `32`、列宽 `100`。若命中不符，先打印/检查 frame header 几何，不得把期望退化为叶列表头拖选。

- [x] **Step 1: 先写 L2 行为测试并观察红**

在 `bdd.test.ts` 增加 pointer move helper：

```ts
function dispatchGridPointerMove(target: HTMLElement, point: { x: number; y: number }): void {
  target.dispatchEvent(new MouseEvent('pointermove', {
    bubbles: true,
    cancelable: true,
    clientX: point.x,
    clientY: point.y,
    button: 0,
  }))
}
```

增加 grouped data fixture 和行为测试：

```ts
function createGroupedSelectionData(): InMemoryDataSource {
  return new InMemoryDataSource({
    schema: {
      fields: [
        { id: 'metric', name: '点号名称', type: 'text', width: 100 },
        { id: 's1c1', name: '簇1', type: 'number', width: 100 },
        { id: 's1c2', name: '簇2', type: 'number', width: 100 },
        { id: 's2c1', name: '簇1', type: 'number', width: 100 },
        { id: 's2c2', name: '簇2', type: 'number', width: 100 },
      ],
      columnGroups: [
        { fieldId: 'metric' },
        { id: 's1', label: '堆1', children: [{ fieldId: 's1c1' }, { fieldId: 's1c2' }] },
        { id: 's2', label: '堆2', children: [{ fieldId: 's2c1' }, { fieldId: 's2c2' }] },
      ],
    },
    rows: Array.from({ length: 3 }, (_, row) => ({
      metric: `m${row}`,
      s1c1: row,
      s1c2: row,
      s2c1: row,
      s2c2: row,
    })),
  })
}

it('core.L2.grid-column-group-header-drag-selection locks group level and selects contiguous groups', () => {
  const data = createGroupedSelectionData()
  const { container, grid } = mountRecordingGrid({
    data,
    frozen: { leftCols: 1 },
    interactions: { reorder: false },
  })
  const scrollHost = container.querySelector<HTMLElement>('[data-novasheet-scroll-host]')
  if (scrollHost === null) throw new Error('expected Grid scroll host')

  dispatchGridPointerDown(scrollHost, { x: 150, y: 10 })
  dispatchGridPointerMove(scrollHost, { x: 350, y: 45 })
  dispatchGridPointerUp(scrollHost)

  expect(grid.getSelection().selectedRange).toEqual({
    startRow: 0,
    endRow: 2,
    startCol: 1,
    endCol: 4,
  })
  expect(data.getSchema().fields.map((field) => field.id)).toEqual([
    'metric', 's1c1', 's1c2', 's2c1', 's2c2',
  ])
  grid.destroy()
  document.body.removeChild(container)
})
```

`mountRecordingGrid` 当前未透传 `interactions`。在 fixture 的 options 类型增加：

```ts
interactions?: GridInteractions
```

并在 `new Grid(container, {...})` 增加：

```ts
interactions: options.interactions,
```

从 `../../../src` 以 `import type` 引入 `GridInteractions`。

Run: `bun test packages/core/tests/acceptance/interaction/selection/bdd.test.ts`

Expected: FAIL；pointerdown 只选择 `s1=[1,2]`，move 后仍未扩展到 col 4。

- [x] **Step 2: 写 InputController 路由失败测试**

把旧测试改为：

```ts
it('组头 pointerdown 交给 DragCoordinator，不再直接 selectColumnGroup', () => {
  const { ctl, deps } = makeCtl(makeGroupedFrame())
  ctl.handleHostPointerDown({ x: 150, y: 10, shiftKey: false, button: 0 })
  expect(deps.tryStartDrag).toHaveBeenCalled()
  expect(deps.engine.selectColumnGroup).not.toHaveBeenCalled()
})
```

菜单按钮优先级测试保留，并增加 `expect(deps.tryStartDrag).not.toHaveBeenCalled()`。

Run: `bun test packages/core/tests/dom/runtime/controllers/InputController.column-groups.test.ts`

Expected: FAIL；当前仍直接 `selectColumnGroup()` 并 return。

- [x] **Step 3: 接入 DragCoordinator**

`DragCoordinatorDeps` 增加：

```ts
hitTestGroupHeader(event: WebPointerEvent): ColumnGroupHeaderHit | null
hitTestGroupHeaderAtLevel(event: WebPointerEvent, level: number): ColumnGroupHeaderHit | null
```

构造 `ColumnGroupHeaderDrag`：

```ts
this.columnGroupHeaderDrag = new ColumnGroupHeaderDrag({
  engine: this.deps.engine,
  refresh: () => this.deps.refresh(),
  requestAutoScroll: (pointer) => this.requestDragAutoScroll(pointer),
  stopAutoScroll: () => this.stopDragAutoScroll(),
  isBlocked: () => this.isDragBlocked(),
  hitTestGroupHeader: (event) => this.deps.hitTestGroupHeader(event),
  hitTestGroupHeaderAtLevel: (event, level) =>
    this.deps.hitTestGroupHeaderAtLevel(event, level),
  isWholeColumnSelection: (range) => this.deps.isWholeColumnSelection(range),
  selectWholeColumnRange: (anchor, extent) => this.deps.selectWholeColumnRange(anchor, extent),
})
this.drags = [
  this.columnGroupHeaderDrag,
  this.columnHeaderDrag,
  this.rowHeaderDrag,
  this.selectionDrag,
]
```

新增 private field，并 import `ColumnGroupHeaderDrag`、`ColumnGroupHeaderHit`。不要把
`allowReorder` 传入组头 Drag。

- [x] **Step 4: 接入 GridRuntime closure**

在 `new DragCoordinator({...})` 加：

```ts
hitTestGroupHeader: (event) => this.input.hitTestGroupHeader(event),
hitTestGroupHeaderAtLevel: (event, level) =>
  this.input.hitTestGroupHeaderAtLevel(event, level),
```

closure 构造时不执行，因此与当前 `this.drag` 先于 `this.input` 赋值的顺序兼容。

- [x] **Step 5: 移除 InputController 组头短路**

删除 `handleHostPointerDown()` 中以下分支：

```ts
const groupHit = this.hitTestGroupHeader(event)
if (groupHit) {
  this.deps.engine.selectColumnGroup(groupHit.groupId)
  this.deps.refresh()
  return
}
```

保留菜单按钮分支，然后统一执行 `this.deps.tryStartDrag(event)`。

- [x] **Step 6: 更新 DragCoordinator fixture 并验证目标测试转绿**

`makeCoordinator()` deps 增加：

```ts
hitTestGroupHeader: () => null,
hitTestGroupHeaderAtLevel: () => null,
```

Run:

```bash
bun test packages/core/tests/dom/runtime/controllers/InputController.column-groups.test.ts \
  packages/core/tests/dom/runtime/controllers/DragCoordinator.test.ts \
  packages/core/tests/dom/interaction/drag/ColumnGroupHeaderDrag.test.ts \
  packages/core/tests/acceptance/interaction/selection/bdd.test.ts
```

Expected: 全部 PASS，L2 行为选区为 rows 0..2 / cols 1..4。

- [x] **Step 7: 跑列表头与组头回归**

Run:

```bash
bun test packages/core/tests/dom/runtime/GridRuntime.col-reorder.test.ts \
  packages/core/tests/dom/runtime/controllers/InputController.column-groups.test.ts \
  packages/core/tests/engine/DefaultGridEngine.column-groups.test.ts \
  packages/core/tests/acceptance/functional/column-groups/column-groups-bdd.test.ts
bun run --filter @zhiguang/novasheet-core typecheck
```

Expected: PASS / 0 error。

- [x] **Step 8: Commit**

```bash
git add packages/core/src/dom/runtime/controllers/DragCoordinator.ts \
  packages/core/src/dom/runtime/controllers/InputController.ts \
  packages/core/src/dom/runtime/GridRuntime.ts \
  packages/core/tests/dom/runtime/controllers/DragCoordinator.test.ts \
  packages/core/tests/dom/runtime/controllers/InputController.column-groups.test.ts \
  packages/core/tests/acceptance/interaction/selection/bdd.test.ts \
  packages/core/tests/acceptance/_helpers/fixtures.ts
git commit -m "feat(core): 支持分组表头连续拖选"
```

仅当 fixture 实际修改时才暂存 `fixtures.ts`。

---

### Task 5: 全量验证、spec 对照与交付

**Files:**
- Modify: `docs/superpowers/plans/2026-07-17-novasheet-column-group-header-drag-selection.md`（完成项勾选）

**Interfaces:**
- Consumes: Task 1–4 全部交付物。
- Produces: 可合并、无未解释回归的验证证据。

- [x] **Step 1: 对照 spec 自审**

逐项确认：同层正反向拖选、纵向偏移锁层、Shift 扩选、`reorder: false`、单击组头、叶头拖选、无 SelectionModel/Canvas/SCADA 改动。

- [x] **Step 2: 运行四项门禁**

```bash
bun run lint
bun run --filter '*' typecheck
bun test
bun run --filter @zhiguang/novasheet-core build && \
  bun run --filter @zhiguang/novasheet-canvas2d build && \
  bun run --filter @zhiguang/novasheet-react build && \
  bun run --filter @zhiguang/novasheet-cell-kit build
```

Expected:

- lint：0 error / 0 warning，scenario coverage 不下降。
- typecheck：所有 workspace exit 0。
- test：0 fail。
- build：core → canvas2d → react → cell-kit 全部 exit 0。

- [x] **Step 3: 检查工作区范围**

```bash
git diff --check
git status --short
git log --oneline -5
```

Expected: 无空白错误；所有剩余未提交文件都能明确归属，既有用户改动未被覆盖。

- [x] **Step 4: 更新 plan 勾选并提交**

```bash
git add docs/superpowers/plans/2026-07-17-novasheet-column-group-header-drag-selection.md
git commit -m "docs(plan): 完成分组表头连续拖选计划"
```

---

### Task 6: 修正冻结区分组表头命中并补齐手势清理回归

**Files:**
- Modify: `packages/core/src/dom/runtime/controllers/InputController.ts`
- Modify: `packages/core/tests/dom/runtime/controllers/InputController.column-groups.test.ts`
- Modify: `packages/core/tests/dom/interaction/drag/ColumnGroupHeaderDrag.test.ts`
- Modify: `packages/core/tests/dom/runtime/controllers/DragCoordinator.test.ts`

**Interfaces:**
- Consumes:
  - `RenderFrame.viewport.regions: RenderRegion[]`
  - `RenderRegion.rect.x/rect.width`、`RenderRegion.scrollOffsetX` 与
    `RenderRegion.colRange: [number, number]`
  - Task 2 已交付的
    `InputController.hitTestGroupHeader(event: WebPointerEvent): ColumnGroupHeaderHit | null`
  - Task 2 已交付的
    `InputController.hitTestGroupHeaderAtLevel(event: WebPointerEvent, level: number): ColumnGroupHeaderHit | null`
  - Task 3 已交付的 `ColumnGroupHeaderDrag`：目标组未命中时保持上一次有效选区。
- Produces:
  - 上述两个 public hit 方法的签名不变；内部改为按 `RenderRegion` 水平 segment 将 pointer
    canvas `x` 转为 view column。
  - `hitTestGroupHeaderAtLevel()` 仅在 `event.x < 0` 或
    `event.x >= frame.viewport.contentRect.width` 时钳到该层首组/末组；pointer 位于 viewport
    内的行头 gutter、冻结无组列或 region 空隙时返回 `null`。
  - `DragCoordinator.cancelActiveDrag()` 与 `destroy()` 后，后续 pointermove 不再修改 selection，
    且 `DRAG_AUTO_SCROLL_KEY` 无待执行 scheduler task。

- [x] **Step 1: 写冻结区命中的失败测试**

在 `InputController.column-groups.test.ts` 新增 `makeFrozenGroupedFrame()`。保留
`makeGroupedFrame()` 的 3 列 group tree，并只替换 viewport，使 col0 冻结、center 已滚动 100px：

```ts
function makeFrozenGroupedFrame(): RenderFrame {
  const frame = makeGroupedFrame()
  return {
    ...frame,
    viewport: {
      ...frame.viewport,
      contentRect: { width: 300, height: 300 },
      scrollX: 100,
      regions: [
        {
          id: 'main',
          rowBand: 'middle',
          colBand: 'center',
          rowRange: [0, 4],
          colRange: [2, 2],
          rect: { x: 100, y: TOTAL_HEADER_HEIGHT, width: 200, height: 240 },
          scrollOffsetX: 200,
          scrollOffsetY: 0,
          zIndex: 10,
        },
        {
          id: 'middleLeft',
          rowBand: 'middle',
          colBand: 'left',
          rowRange: [0, 4],
          colRange: [0, 0],
          rect: { x: 0, y: TOTAL_HEADER_HEIGHT, width: 100, height: 240 },
          scrollOffsetX: 0,
          scrollOffsetY: 0,
          zIndex: 20,
        },
      ],
    },
  }
}
```

新增用例：

```ts
it('leftCols > 0 且 scrollX > 0 时冻结无组列不误命中 center 组', () => {
  const { ctl } = makeCtl(makeFrozenGroupedFrame())
  expect(ctl.hitTestGroupHeader({ x: 50, y: 10, shiftKey: false })).toBeNull()
  expect(
    ctl.hitTestGroupHeaderAtLevel({ x: 50, y: 200, shiftKey: false }, 0),
  ).toBeNull()
})

it('按 center region 的 scrollOffsetX 命中滚动后的可见组列', () => {
  const { ctl } = makeCtl(makeFrozenGroupedFrame())
  expect(ctl.hitTestGroupHeader({ x: 150, y: 10, shiftKey: false })).toEqual({
    groupId: 's1',
    level: 0,
    startViewCol: 1,
    endViewCol: 2,
  })
})

it('锁层拖选进入 viewport 内冻结段时返回 null，只有真正越界才钳位', () => {
  const { ctl } = makeCtl(makeFrozenGroupedFrame())
  expect(
    ctl.hitTestGroupHeaderAtLevel({ x: 50, y: 200, shiftKey: false }, 0),
  ).toBeNull()
  expect(
    ctl.hitTestGroupHeaderAtLevel({ x: -1, y: 200, shiftKey: false }, 0)?.groupId,
  ).toBe('s1')
  expect(
    ctl.hitTestGroupHeaderAtLevel({ x: 300, y: 200, shiftKey: false }, 0)?.groupId,
  ).toBe('s1')
})
```

同时把原“横向越界钳位”测试的右侧坐标由 `350` 改为
`frame.viewport.contentRect.width`，明确边界是 viewport 而非列总宽。

- [x] **Step 2: 跑冻结区目标测试确认红**

Run:

```bash
bun test packages/core/tests/dom/runtime/controllers/InputController.column-groups.test.ts
```

Expected: FAIL；冻结段 `x=50` 被旧公式
`event.x - rowHeaderWidth + scrollX` 算成逻辑列 1 并误命中 `s1`。

- [x] **Step 3: 以最小 region 公式修正两个 group hit 方法**

在 `InputController.ts` 从 `../../../kernel/geometry/FrozenRegions` type-only import
`RenderRegion`，新增两个 private helper；不修改 `ColumnGroupHeaderHit`、group tree、selection 或
Canvas 契约：

```ts
private hitTestGroupHeaderViewCol(
  frame: RuntimeRenderFrame,
  x: number,
): number | null {
  const region = this.findHorizontalHeaderRegion(frame, x)
  if (!region) return null
  const logicalX = region.scrollOffsetX + x - region.rect.x
  const colIndex = frame.colsAxis.positionToIndex(logicalX)
  if (colIndex < region.colRange[0] || colIndex > region.colRange[1]) return null
  return colIndex
}

private findHorizontalHeaderRegion(
  frame: RuntimeRenderFrame,
  x: number,
): RenderRegion | null {
  return [...frame.viewport.regions]
    .filter((region) => region.rowBand === 'middle')
    .sort((a, b) => b.zIndex - a.zIndex)
    .find((region) => x >= region.rect.x && x < region.rect.x + region.rect.width) ?? null
}
```

`hitTestGroupHeader()` 保留 y/level 校验，并在取 level 后改为直接调用共享的 private cell helper，
避免再委托会执行越界钳位的 `hitTestGroupHeaderAtLevel()`：

```ts
const colIndex = this.hitTestGroupHeaderViewCol(frame, event.x)
if (colIndex === null) return null
return this.findGroupHeaderHitAtColumn(columnGroupHeader.rows[level], level, colIndex)
```

`hitTestGroupHeaderAtLevel()` 的最小选择行为：

```ts
if (row.length === 0) return null
if (event.x < 0) return this.toColumnGroupHeaderHit(row[0]!, level)
if (event.x >= frame.viewport.contentRect.width) {
  return this.toColumnGroupHeaderHit(row[row.length - 1]!, level)
}
const colIndex = this.hitTestGroupHeaderViewCol(frame, event.x)
if (colIndex === null) return null
return this.findGroupHeaderHitAtColumn(row, level, colIndex)
```

共享 cell helper 使用现有 `RenderFrameGroupHeaderCell` 类型，不引入新的 public interface：

```ts
private findGroupHeaderHitAtColumn(
  row: readonly RenderFrameGroupHeaderCell[] | undefined,
  level: number,
  colIndex: number,
): ColumnGroupHeaderHit | null {
  const cell = row?.find(
    (candidate) =>
      colIndex >= candidate.startViewCol && colIndex <= candidate.endViewCol,
  )
  return cell ? this.toColumnGroupHeaderHit(cell, level) : null
}
```

区域公式固定为：

```text
logicalX = region.scrollOffsetX + event.x - region.rect.x
```

并必须在 `positionToIndex(logicalX)` 后校验 `colIndex ∈ region.colRange`。不得回退到全局
`scrollX`/`rowHeaderWidth` 公式；pointer 在 viewport 内但未命中 region 时保持 `null`，使组拖选
进入冻结无组列后保持上一次有效 selection。

- [x] **Step 4: 跑冻结区命中测试与 typecheck 确认绿**

Run:

```bash
bun test packages/core/tests/dom/runtime/controllers/InputController.column-groups.test.ts
bun run --filter @zhiguang/novasheet-core typecheck
```

Expected: PASS / 0 error；冻结无组列返回 `null`，center 仍返回 `s1`，viewport 外仍钳首/末组。

- [x] **Step 5: 写 Shift 右到左与 cancel/destroy 清理回归测试**

在 `ColumnGroupHeaderDrag.test.ts` 的 `makeDrag()` options 增加：

```ts
hitTestGroupHeaderAtLevel?: (
  event: WebPointerEvent,
  level: number,
) => ColumnGroupHeaderHit | null
```

并把 deps 中固定的 `hitTestGroupHeaderAtLevel` 改为：

```ts
hitTestGroupHeaderAtLevel: options.hitTestGroupHeaderAtLevel ?? ((event, level) =>
  level === 0 ? (event.x < 300 ? s1 : s2) : null),
```

增加组拖选进入冻结无组段时保持 selection 的具体回归，以及右侧 anchor 向左扩选：

```ts
it('move 进入冻结无组段未命中时保持 pointerdown 已建立的选区', () => {
  const frozen = makeDrag({ hitTestGroupHeaderAtLevel: () => null })
  frozen.drag.tryStart({ x: 150, y: 10, shiftKey: false, button: 0 })
  expect(frozen.selectWholeColumnRange).toHaveBeenCalledTimes(1)
  frozen.drag.move({ x: 50, y: 200, shiftKey: false })
  expect(frozen.selectWholeColumnRange).toHaveBeenCalledTimes(1)
  expect(frozen.selectWholeColumnRange).toHaveBeenLastCalledWith(1, 2)
})

it('Shift 从右侧整列 anchor 向左组扩选时使用目标组左边界', () => {
  const selection = {
    activeCell: { rowIndex: 0, colIndex: 4 },
    anchorCell: { rowIndex: 0, colIndex: 4 },
    extentCell: { rowIndex: 2, colIndex: 3 },
    selectedRange: { startRow: 0, endRow: 2, startCol: 3, endCol: 4 },
  }
  const shifted = makeDrag({ selection, isWholeColumnSelection: () => true })
  shifted.drag.tryStart({ x: 150, y: 10, shiftKey: true, button: 0 })
  expect(shifted.selectWholeColumnRange).toHaveBeenLastCalledWith(4, 1)
})
```

在 `DragCoordinator.test.ts` 将 `makeCoordinator()` 扩展为接收
`options: { groupHit?: ColumnGroupHeaderHit } = {}`，并以真实可观察 fake scheduler 替换立即执行
fixture：

```ts
const pending = new Map<string, () => void>()
const cancel = mock((key: string) => { pending.delete(key) })
const selectWholeColumnRange = mock((_anchor: number, _extent: number) => {})
// deps 片段
scheduler: {
  schedule: (key: string, callback: () => void) => { pending.set(key, callback) },
  cancel,
},
hitTestGroupHeader: () => options.groupHit ?? null,
hitTestGroupHeaderAtLevel: () => options.groupHit ?? null,
selectWholeColumnRange,
```

helper 返回 `{ drag, cancel, pending, selectWholeColumnRange }`，并新增：

```ts
it('cancelActiveDrag 后 pointermove 不再选择且清除 auto-scroll task', () => {
  const groupHit = { groupId: 's1', level: 0, startViewCol: 1, endViewCol: 2 }
  const { drag, pending, selectWholeColumnRange } = makeCoordinator({ groupHit })
  expect(drag.tryStartDrag({ x: 150, y: 10, shiftKey: false, button: 0 })).toBe(true)
  drag.moveActiveDrag({ x: 399, y: 10, shiftKey: false })
  expect(pending.size).toBe(1)
  expect(drag.cancelActiveDrag()).toBe(true)
  const callsAfterCancel = selectWholeColumnRange.mock.calls.length
  expect(pending.size).toBe(0)
  expect(drag.moveActiveDrag({ x: 350, y: 10, shiftKey: false })).toBe(false)
  expect(selectWholeColumnRange).toHaveBeenCalledTimes(callsAfterCancel)
})

it('destroy 取消活跃组拖选并清除 auto-scroll task，且保持幂等', () => {
  const groupHit = { groupId: 's1', level: 0, startViewCol: 1, endViewCol: 2 }
  const { drag, pending, selectWholeColumnRange } = makeCoordinator({ groupHit })
  drag.tryStartDrag({ x: 150, y: 10, shiftKey: false, button: 0 })
  drag.moveActiveDrag({ x: 399, y: 10, shiftKey: false })
  expect(pending.size).toBe(1)
  drag.destroy()
  drag.destroy()
  const callsAfterDestroy = selectWholeColumnRange.mock.calls.length
  expect(pending.size).toBe(0)
  expect(drag.moveActiveDrag({ x: 350, y: 10, shiftKey: false })).toBe(false)
  expect(selectWholeColumnRange).toHaveBeenCalledTimes(callsAfterDestroy)
})
```

`DragCoordinator.test.ts` 以 `import type` 引入 `ColumnGroupHeaderHit`。现有 destroy 幂等测试继续
保留；若因 fake scheduler 改造不再累计 cancel 调用次数，只把断言收紧为两次 `destroy()` 不抛且
`pending.size === 0`，不得删除幂等覆盖。

- [x] **Step 6: 跑新增回归测试**

Run:

```bash
bun test packages/core/tests/dom/interaction/drag/ColumnGroupHeaderDrag.test.ts \
  packages/core/tests/dom/runtime/controllers/DragCoordinator.test.ts \
  packages/core/tests/dom/runtime/controllers/InputController.test.ts
```

Expected: 全部 PASS；右到左 Shift 选择调用为 `(4, 1)`，cancel/destroy 后 selection 调用数不再
增加且 `pending.size === 0`，现有 Escape → `cancelActiveDrag()` 路由测试仍绿。

- [x] **Step 7: 跑冻结选择、组头与拖拽 focused 回归**

Run:

```bash
bun test packages/core/tests/dom/runtime/controllers/InputController.column-groups.test.ts \
  packages/core/tests/dom/interaction/drag/ColumnGroupHeaderDrag.test.ts \
  packages/core/tests/dom/runtime/controllers/DragCoordinator.test.ts \
  packages/core/tests/dom/runtime/GridRuntime.col-reorder.test.ts \
  packages/core/tests/acceptance/interaction/selection/bdd.test.ts \
  packages/core/tests/acceptance/functional/column-groups/column-groups-bdd.test.ts
```

Expected: 全部 PASS；既有组头正反拖选、冻结列、`reorder: false`、列换位和 column group 行为无
回归。

- [x] **Step 8: 运行四项全量门禁**

Run:

```bash
bun run lint
bun run --filter '*' typecheck
bun test
bun run --filter @zhiguang/novasheet-core build && \
  bun run --filter @zhiguang/novasheet-canvas2d build
```

Expected: lint 0 error / 0 warning；所有 workspace typecheck exit 0；test 0 fail；build 严格按
core → canvas2d 顺序全部 exit 0。

- [x] **Step 9: 检查范围并提交实现修正**

Run:

```bash
git diff --check
git status --short
```

Expected: 无空白错误；只暂存本 Task 的 4 个 code/test 文件，不改 spec 或 Task 1–5 已完成历史。

```bash
git add packages/core/src/dom/runtime/controllers/InputController.ts \
  packages/core/tests/dom/runtime/controllers/InputController.column-groups.test.ts \
  packages/core/tests/dom/interaction/drag/ColumnGroupHeaderDrag.test.ts \
  packages/core/tests/dom/runtime/controllers/DragCoordinator.test.ts
git commit -m "fix(core): 修正分组表头冻结区命中与拖拽清理"
```
