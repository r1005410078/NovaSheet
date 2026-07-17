# 冻结窗格选择语义 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 按 spec `docs/superpowers/specs/2026-07-17-novasheet-frozen-pane-selection-design.md`，让调用方以冻结窗格边界声明整行/整列选择语义（`GridOptions.selectionBehavior`），并支持表头角块 opt-in 全选。

**Architecture:** kernel 增加纯 resolver（region→intent），`SelectionDrag` 升级为 intent 锁轴状态机，配置经 `Grid → GridControllerImpl → GridRuntime → DragCoordinator` 下传；不进 engine/RenderFrame/渲染层。行/列/全选选区构造复用 `InputController.selectWhole*Range` 既有 helper。

**Tech Stack:** TypeScript strict（bun workspaces）、`bun:test`（非 vitest）、React 适配层 `@zhiguang/novasheet-react`。

**场景契约（外环文档已定稿于 `133c219`；行为测试仍由 Task 2/7 落地）：**
- `packages/core/tests/acceptance/interaction/selection/scenarios/L2-grid-frozen-pane-selection.md`
- `packages/core/tests/acceptance/interaction/selection/scenarios/L2-grid-header-corner-select-all.md`
- `packages/react/tests/excel/scenarios/L3a-frozen-pane-selection-prop.md`

## Global Constraints

- **bun (≥1.2) only**——绝不使用 npm/yarn/pnpm。
- 四门：`bun test`、`bun run --filter '*' typecheck`、`bun run lint`、core→canvas2d 顺序 build，全绿才算收口。
- `bun test` 必须从**仓库根目录**跑（根 `bunfig.toml` preload DOM/canvas stub；在包目录内跑会缺 `HTMLCanvasElement`）。
- TDD strict：红先行→实现→绿→commit；一 task 一 commit，Conventional Commits 中文 subject。
- 边界：`kernel/**` 不 import `dom/**`、不碰 DOM 全局；配置不得进入 `DefaultGridEngine`/`RenderFrame`/Canvas2DRenderer。
- type-only import 用 `import type`（verbatimModuleSyntax）；`noUncheckedIndexedAccess` 下索引访问需 guard。
- 分支：当前直接在 `main` 实施；发布分支已合并，避免重复分支和后续合并漂移。
- 本 plan 与 spec 冲突时 STOP+ASK，勿静默选边。

**关键既有事实（implementer 必读，勿重复发明）：**
- `RenderRegion`（[FrozenRegions.ts](packages/core/src/kernel/geometry/FrozenRegions.ts)）：id ∈ `main|topLeft|topCenter|topRight|middleLeft|middleRight`，带 `rowBand`/`colBand`/`zIndex`。
- `hitTestCell(frame, point)` 现返回 `CellAddress | null`（[HitTest.ts](packages/core/src/kernel/interaction/HitTest.ts)）。
- `InputController.selectWholeRowRange(anchorRow, extentRow)` / `selectWholeColumnRange(anchorCol, extentCol)`（[InputController.ts:386-413](packages/core/src/dom/runtime/controllers/InputController.ts#L386-L413)）：row 的 activeCell 锚 col 0，column 锚 row 0；空表 guard（`rowCount <= 0` / `fields.length <= 0` return）已内建。
- pointer 优先级链（[InputController.ts:81](packages/core/src/dom/runtime/controllers/InputController.ts#L81) `handleHostPointerDown`）：cellAction → 列头菜单按钮 → 组头 → `tryStartDrag`（drags 数组 `[columnHeaderDrag, rowHeaderDrag, selectionDrag]`）。本 feature 只改 `SelectionDrag` 内部，链路顺序不动。
- 归一化模板：`GridInteractions.ts`（`resolveGridInteractions`）是 `resolveSelectionBehavior` 的同款先例。
- Shift 锚点先例：`ColumnHeaderDrag.tryStart`（[ColumnHeaderDrag.ts:73-86](packages/core/src/dom/interaction/drag/ColumnHeaderDrag.ts#L73-L86)）——shift 时取 `selection.anchorCell` 且要求现有选区已是整列。
- 主题度量：`denseGridTheme.metrics` = `rowHeight: 28`、`headerHeight: 32`。
- 测试 fixture：`mountRecordingGrid`/`getScrollHost`（`packages/core/tests/acceptance/_helpers/fixtures.ts`）、frozen frame 构造（`packages/core/tests/kernel/interaction/HitTest.test.ts` 的 `makeFrame`）、`makeMockGridEngine`（`packages/core/tests/helpers/mock-grid-engine.ts`）。

---

### Task 1: kernel 配置类型 + 归一化 + GridOptions 类型接线

**Files:**
- Create: `packages/core/src/kernel/interaction/SelectionBehavior.ts`
- Test: `packages/core/tests/kernel/interaction/SelectionBehavior.test.ts`
- Modify: `packages/core/src/Grid.ts`（`GridOptions` 加字段 + 传给 controller options）
- Modify: `packages/core/src/dom/runtime/GridControllerImpl.ts:165` 附近 options 类型 + `:259` 附近 relay
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts:151` 附近 `GridRuntimeOptions` 加字段（本 task 仅收下，不消费）
- Modify: `packages/core/src/index.ts`（导出两个配置类型）

**Interfaces:**
- Produces: `FrozenPaneSelectionBehavior`、`GridSelectionBehavior`、`ResolvedSelectionBehavior`、`resolveSelectionBehavior(input?: GridSelectionBehavior): ResolvedSelectionBehavior`；`GridOptions.selectionBehavior?: GridSelectionBehavior`。后续所有 task 依赖这些名字。

- [x] **Step 0: 写失败测试**

```ts
// packages/core/tests/kernel/interaction/SelectionBehavior.test.ts
import { describe, expect, it } from 'bun:test'
import { resolveSelectionBehavior } from '../../../src/kernel/interaction/SelectionBehavior'

describe('resolveSelectionBehavior', () => {
  it('缺省全部 region 为 cell、headerCorner 为 none', () => {
    const resolved = resolveSelectionBehavior()
    expect(resolved.regionIntents).toEqual({
      main: 'cell',
      middleLeft: 'cell',
      middleRight: 'cell',
      topCenter: 'cell',
      topLeft: 'cell',
      topRight: 'cell',
    })
    expect(resolved.headerCorner).toBe('none')
  })

  it('按 frozenPanes 键映射 region intent，未配置键保持 cell', () => {
    const resolved = resolveSelectionBehavior({
      frozenPanes: { left: 'row', top: 'column', topRight: 'column' },
      headerCorner: 'all',
    })
    expect(resolved.regionIntents.middleLeft).toBe('row')
    expect(resolved.regionIntents.topCenter).toBe('column')
    expect(resolved.regionIntents.topRight).toBe('column')
    expect(resolved.regionIntents.middleRight).toBe('cell')
    expect(resolved.regionIntents.topLeft).toBe('cell')
    expect(resolved.regionIntents.main).toBe('cell')
    expect(resolved.headerCorner).toBe('all')
  })
})
```

- [x] **Step 2: 跑测试确认红**

Run: `cd /Users/rongts/www/NovaSheet && bun test packages/core/tests/kernel/interaction/SelectionBehavior.test.ts`
Expected: FAIL（module 不存在）

- [x] **Step 3: 实现**

```ts
// packages/core/src/kernel/interaction/SelectionBehavior.ts
import type { RenderRegionId } from '../geometry/FrozenRegions'

/** 单个冻结数据窗格的选择意图。 */
export type FrozenPaneSelectionIntent = 'cell' | 'row' | 'column'

/** 冻结数据窗格的选择行为配置（spec §4）；缺省全部 cell。 */
export interface FrozenPaneSelectionBehavior {
  /** 左冻结数据窗格；缺省为 cell。 */
  readonly left?: 'cell' | 'row'
  /** 右冻结数据窗格；缺省为 cell。 */
  readonly right?: 'cell' | 'row'
  /** 顶部冻结数据窗格；缺省为 cell。 */
  readonly top?: 'cell' | 'column'
  /** 顶部 × 左冻结的真实数据交叉区；缺省为 cell。 */
  readonly topLeft?: 'cell' | 'row' | 'column'
  /** 顶部 × 右冻结的真实数据交叉区；缺省为 cell。 */
  readonly topRight?: 'cell' | 'row' | 'column'
}

/** Grid 选择语义配置（构造期，变更需 remount）。 */
export interface GridSelectionBehavior {
  readonly frozenPanes?: FrozenPaneSelectionBehavior
  /** 行头与列表头的非数据角块；缺省 none。 */
  readonly headerCorner?: 'none' | 'all'
}

/** 归一化结果：每个 RenderRegion 有确定 intent。 */
export interface ResolvedSelectionBehavior {
  readonly regionIntents: Readonly<Record<RenderRegionId, FrozenPaneSelectionIntent>>
  readonly headerCorner: 'none' | 'all'
}

/** 把可选 selectionBehavior 归一成全量 region→intent 表（同 resolveGridInteractions 模式）。 */
export function resolveSelectionBehavior(
  input?: GridSelectionBehavior,
): ResolvedSelectionBehavior {
  const panes = input?.frozenPanes
  return {
    regionIntents: {
      main: 'cell',
      middleLeft: panes?.left ?? 'cell',
      middleRight: panes?.right ?? 'cell',
      topCenter: panes?.top ?? 'cell',
      topLeft: panes?.topLeft ?? 'cell',
      topRight: panes?.topRight ?? 'cell',
    },
    headerCorner: input?.headerCorner ?? 'none',
  }
}
```

类型接线（行为不变，本 task 不消费）：

```ts
// Grid.ts — GridOptions 内（interactions 字段旁）加：
/** 冻结窗格与表头角块的选择语义（spec 2026-07-17）；构造期配置。 */
readonly selectionBehavior?: GridSelectionBehavior
// Grid 构造函数 GridControllerImpl options 对象内（interactions 行旁）加：
selectionBehavior: options.selectionBehavior,

// GridControllerImpl.ts — 第二参数 options 类型（interactions?: GridInteractions 旁）加：
selectionBehavior?: GridSelectionBehavior
// relay 处（interactions: gridOptions?.interactions 旁）加：
selectionBehavior: gridOptions?.selectionBehavior,

// GridRuntime.ts — GridRuntimeOptions（interactions?: GridInteractions 旁）加：
selectionBehavior?: GridSelectionBehavior

// index.ts 加：
export type {
  FrozenPaneSelectionBehavior,
  GridSelectionBehavior,
} from './kernel/interaction/SelectionBehavior'
```

各文件 `import type { GridSelectionBehavior } from ...`（core 内相对路径）。

- [x] **Step 4: 跑测试 + typecheck 确认绿**

Run: `bun test packages/core/tests/kernel/interaction/SelectionBehavior.test.ts && bun run --filter '*' typecheck`
Expected: PASS / 0 error

- [x] **Step 5: Commit**

```bash
git add packages/core/src packages/core/tests
git commit -m "feat(core): 新增 selectionBehavior 配置类型与归一化"
```

---

### Task 2: 外环行为测试落地并红（既有 L2 场景契约）

**Files:**
- Modify: `packages/core/tests/acceptance/_helpers/fixtures.ts`（`mountRecordingGrid` options 扩展）
- Modify: `packages/core/tests/acceptance/interaction/selection/bdd.test.ts`（新增三条 it：两条红灯行为 + 一条未配置回归对照）

**Interfaces:**
- Consumes: Task 1 的 `GridSelectionBehavior`（fixtures 签名用）。
- Produces: 两个红灯行为测试与一条未配置回归对照，title 以 `core.L2.grid-frozen-pane-selection` / `core.L2.grid-header-corner-select-all` 开头；Task 6 使红灯转绿。

**Plan-risk（STOP+ASK 点）：** 下方点击坐标由 `denseGridTheme.metrics`（headerHeight 32 / rowHeight 28）与 `mutableSchema` 列宽（100/80/100/100）推得。若实际命中行列与期望不符，先核对 region 几何再改坐标，**不得改场景期望的选区形状**。

- [x] **Step 1: 扩展 fixtures**

`mountRecordingGrid` 的 options 参数加三个字段并透传给 `new Grid`：

```ts
// fixtures.ts options 内加：
frozen?: Partial<FrozenConfig>
selectionBehavior?: GridSelectionBehavior
onSelectionChange?: (selection: GridSelection) => void
// new Grid(container, {...}) 内加：
frozen: options.frozen,
selectionBehavior: options.selectionBehavior,
onSelectionChange: options.onSelectionChange,
```

`import type { FrozenConfig, GridSelection, GridSelectionBehavior } from '../../../src'`（并入现有 import）。

- [x] **Step 2: 写三条行为测试（两条失败 + 一条回归对照）**

在 `bdd.test.ts` 外层 describe 内新增（`dispatchGridPointerDown` 从 e2e bdd.test.ts 复制为本文件局部 helper，或提升进 `_helpers/fixtures.ts` 供两处复用——提升时同步改 e2e 引用）：

```ts
it('core.L2.grid-frozen-pane-selection selects row/column/cell by frozen pane config', () => {
  const changes: GridSelection[] = []
  const { container, grid } = mountRecordingGrid({
    data: createMutableData(),
    frozen: { leftCols: 1, topRows: 1 },
    selectionBehavior: {
      frozenPanes: { left: 'row', top: 'column', topLeft: 'cell' },
    },
    onSelectionChange: (selection) => changes.push(selection),
  })
  const scrollHost = getScrollHost(container)

  // 左冻结窗格（middleLeft）：row 1 → 整行
  dispatchGridPointerDown(scrollHost, { x: 50, y: 74 })
  expect(grid.getSelection().selectedRange).toEqual({ startRow: 1, endRow: 1, startCol: 0, endCol: 3 })
  expect(grid.getSelection().activeCell).toEqual({ rowIndex: 1, colIndex: 0 })

  // 顶部冻结窗格（topCenter）：col 1 → 整列
  dispatchGridPointerDown(scrollHost, { x: 150, y: 46 })
  expect(grid.getSelection().selectedRange).toEqual({ startRow: 0, endRow: 2, startCol: 1, endCol: 1 })
  expect(grid.getSelection().activeCell).toEqual({ rowIndex: 0, colIndex: 1 })

  // 交叉数据区（topLeft）：cell (0,0)
  dispatchGridPointerDown(scrollHost, { x: 50, y: 46 })
  expect(grid.getSelection().selectedRange).toEqual({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 })

  expect(changes.length).toBeGreaterThanOrEqual(3)

  grid.destroy()
  document.body.removeChild(container)
})

it('core.L2.grid-frozen-pane-selection keeps plain cell selection when behavior omitted', () => {
  const { container, grid } = mountRecordingGrid({
    data: createMutableData(),
    frozen: { leftCols: 1, topRows: 1 },
  })
  const scrollHost = getScrollHost(container)

  dispatchGridPointerDown(scrollHost, { x: 50, y: 74 })
  expect(grid.getSelection().selectedRange).toEqual({ startRow: 1, endRow: 1, startCol: 0, endCol: 0 })

  grid.destroy()
  document.body.removeChild(container)
})

it('core.L2.grid-header-corner-select-all selects everything only when opted in', () => {
  const optIn = mountRecordingGrid({
    data: createMutableData(),
    excelHeaders: true,
    selectionBehavior: { headerCorner: 'all' },
  })
  dispatchGridPointerDown(getScrollHost(optIn.container), { x: 8, y: 8 })
  expect(optIn.grid.getSelection().selectedRange).toEqual({ startRow: 0, endRow: 2, startCol: 0, endCol: 3 })
  optIn.grid.destroy()
  document.body.removeChild(optIn.container)

  const control = mountRecordingGrid({ data: createMutableData(), excelHeaders: true })
  dispatchGridPointerDown(getScrollHost(control.container), { x: 8, y: 8 })
  expect(control.grid.getSelection().selectedRange).toBeNull()
  control.grid.destroy()
  document.body.removeChild(control.container)
})
```

- [x] **Step 3: 跑测试确认红（外环红）**

Run: `bun test packages/core/tests/acceptance/interaction/selection/bdd.test.ts`
Expected: 行/列/交叉区用例与 header corner 用例 FAIL（配置未消费，点击仍是单格选择；corner 期望全选实得 `null`）；未配置对照 PASS。

- [x] **Step 4: Commit（外环红灯入库）**

```bash
git add packages/core/tests/acceptance
git commit -m "test(bdd): 冻结窗格选择 L2 行为测试红灯"
```

---

### Task 3: HitTest 伴随 API `hitTestCellWithRegion`

**Files:**
- Modify: `packages/core/src/kernel/interaction/HitTest.ts`
- Test: `packages/core/tests/kernel/interaction/HitTest.test.ts`（追加用例）

**Interfaces:**
- Produces: `interface CellRegionHit { readonly cell: CellAddress; readonly region: RenderRegion }`、`hitTestCellWithRegion(frame: RenderFrame, point: HitTestPoint): CellRegionHit | null`。`hitTestCell` 语义不变（变薄 wrapper）。Task 4 消费。

- [x] **Step 1: 写失败测试**（HitTest.test.ts 追加；`makeFrame` 已有 frozen `{topRows:1,leftCols:1,rightCols:1}` + scroll (100,56)，行高 28、表头 32、3 列宽 100）

```ts
import { hitTestCellWithRegion } from '../../../src/kernel/interaction/HitTest'

describe('hitTestCellWithRegion — 命中同时返回 RenderRegion', () => {
  it('返回冻结与滚动区域的 region id，miss 返回 null', () => {
    const frame = makeFrame()

    expect(hitTestCellWithRegion(frame, { x: 20, y: 72 })).toMatchObject({
      cell: { rowIndex: 2, colIndex: 0 },
      region: { id: 'middleLeft' },
    })
    expect(hitTestCellWithRegion(frame, { x: 220, y: 72 })).toMatchObject({
      cell: { rowIndex: 2, colIndex: 2 },
      region: { id: 'main' },
    })
    expect(hitTestCellWithRegion(frame, { x: 20, y: 40 })).toMatchObject({
      region: { id: 'topLeft' },
    })
    expect(hitTestCellWithRegion(frame, { x: 120, y: 16 })).toBeNull()
  })
})
```

（`x:20,y:40` 若未命中 `topLeft`，按 `makeFrame` 的 viewport 快照核对 region rect 后调整坐标，勿改期望 region。）

- [x] **Step 2: 跑测试确认红**

Run: `bun test packages/core/tests/kernel/interaction/HitTest.test.ts`
Expected: FAIL（`hitTestCellWithRegion` 未导出）

- [x] **Step 3: 实现**——把现有循环体改为返回 `{ cell, region }`：

```ts
export interface CellRegionHit {
  readonly cell: CellAddress
  readonly region: RenderRegion
}

/** hitTestCell 的伴随 API：命中时同时返回所在 RenderRegion（选择意图解析用）。 */
export function hitTestCellWithRegion(
  frame: RenderFrame,
  point: HitTestPoint,
): CellRegionHit | null {
  const regions = [...frame.viewport.regions].sort((a, b) => b.zIndex - a.zIndex)

  for (const region of regions) {
    if (!contains(region, point)) continue
    if (region.rowRange[1] < region.rowRange[0] || region.colRange[1] < region.colRange[0]) {
      continue
    }

    const logicalY = region.scrollOffsetY + point.y - region.rect.y
    const logicalX = region.scrollOffsetX + point.x - region.rect.x
    const rowIndex = frame.rowsAxis.positionToIndex(logicalY)
    const colIndex = frame.colsAxis.positionToIndex(logicalX)

    if (
      rowIndex >= region.rowRange[0] &&
      rowIndex <= region.rowRange[1] &&
      colIndex >= region.colRange[0] &&
      colIndex <= region.colRange[1]
    ) {
      return { cell: { rowIndex, colIndex }, region }
    }
  }

  return null
}

export function hitTestCell(frame: RenderFrame, point: HitTestPoint): CellAddress | null {
  return hitTestCellWithRegion(frame, point)?.cell ?? null
}
```

（`import type { RenderRegion }` 已在文件头。原 `hitTestCell` 的 TSDoc 保留在 `hitTestCellWithRegion` 上。）

- [x] **Step 4: 跑 kernel interaction 全部测试确认绿**

Run: `bun test packages/core/tests/kernel/interaction/`
Expected: PASS（含既有 hitTestCell 用例）

- [x] **Step 5: Commit**

```bash
git add packages/core/src/kernel/interaction/HitTest.ts packages/core/tests/kernel/interaction/HitTest.test.ts
git commit -m "feat(core): hitTestCell 增加返回 RenderRegion 的伴随 API"
```

---

### Task 4: 纯 resolver `resolveSelectionIntent`

**Files:**
- Create: `packages/core/src/kernel/interaction/SelectionIntent.ts`
- Test: `packages/core/tests/kernel/interaction/SelectionIntent.test.ts`

**Interfaces:**
- Consumes: Task 1 `ResolvedSelectionBehavior`、Task 3 `hitTestCellWithRegion`。
- Produces:

```ts
export type SelectionIntent =
  | { readonly kind: 'cell'; readonly cell: CellAddress }
  | { readonly kind: 'row'; readonly rowIndex: number }
  | { readonly kind: 'column'; readonly colIndex: number }
  | { readonly kind: 'all' }
  | { readonly kind: 'none' }

export function resolveSelectionIntent(
  frame: RenderFrame,
  point: HitTestPoint,
  behavior: ResolvedSelectionBehavior,
): SelectionIntent | null
```

返回 `null` = 不消费（非 corner 表头带/空白区，交回既有链路）；`none` 仅来自 corner + `headerCorner:'none'`（spec §5.1 封闭求值域）。

- [x] **Step 1: 写失败测试**——fixture 复制 `HitTest.test.ts` 的 `makeFrame` 模式，但 **corner 用例需 `viewport.setRowHeaderWidth(48)`**（`Viewport.setRowHeaderWidth` 已存在）：

```ts
// packages/core/tests/kernel/interaction/SelectionIntent.test.ts
import { describe, expect, it } from 'bun:test'
import {
  ChunkedAxis,
  FrozenRegions,
  InMemoryDataSource,
  Viewport,
  denseGridTheme,
  type RenderFrame,
  type Schema,
} from '../../../src'
import { resolveSelectionIntent } from '../../../src/kernel/interaction/SelectionIntent'
import { resolveSelectionBehavior } from '../../../src/kernel/interaction/SelectionBehavior'

const SCHEMA: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 100 },
    { id: 'age', name: 'Age', type: 'number', width: 100 },
    { id: 'role', name: 'Role', type: 'text', width: 100 },
  ],
}

function makeFrame(options: { rowHeaderWidth?: number } = {}): RenderFrame {
  const data = new InMemoryDataSource({
    schema: SCHEMA,
    rows: [
      { name: 'Alice', age: 30, role: 'Engineer' },
      { name: 'Bob', age: 25, role: 'Designer' },
      { name: 'Carol', age: 40, role: 'PM' },
      { name: 'Dave', age: 35, role: 'QA' },
    ],
  })
  const rowsAxis = new ChunkedAxis({
    count: data.getRowCount(),
    defaultSize: denseGridTheme.metrics.rowHeight,
  })
  const colsAxis = new ChunkedAxis({ count: SCHEMA.fields.length, defaultSize: 100 })
  const frozen = new FrozenRegions(rowsAxis, colsAxis, { topRows: 1, leftCols: 1, rightCols: 1 })
  const viewport = new Viewport(rowsAxis, colsAxis, frozen)
  viewport.setHeaderHeight(denseGridTheme.metrics.headerHeight)
  if (options.rowHeaderWidth !== undefined) viewport.setRowHeaderWidth(options.rowHeaderWidth)
  viewport.setSize(300, 144)
  viewport.setScroll(0, 0)
  return {
    data,
    theme: denseGridTheme,
    rowsAxis,
    colsAxis,
    viewport: viewport.snapshot(),
    collapsedRowGaps: [],
    collapsedColGaps: [],
  }
}

describe('resolveSelectionIntent — region → 选择意图', () => {
  const behavior = resolveSelectionBehavior({
    frozenPanes: { left: 'row', right: 'row', top: 'column', topLeft: 'cell', topRight: 'column' },
  })

  it('middleLeft→row、topCenter→column、topLeft 按独立配置、main→cell', () => {
    const frame = makeFrame()
    // 坐标基于 headerHeight 32 / rowHeight 28 / 列宽 100 / 无 rowHeader：
    // topLeft rect y∈[32,60) x∈[0,100)；middleLeft y≥60 x∈[0,100)；topCenter y∈[32,60) x≥100
    expect(resolveSelectionIntent(frame, { x: 50, y: 74 }, behavior)).toEqual({ kind: 'row', rowIndex: 1 })
    expect(resolveSelectionIntent(frame, { x: 150, y: 46 }, behavior)).toEqual({ kind: 'column', colIndex: 1 })
    expect(resolveSelectionIntent(frame, { x: 50, y: 46 }, behavior)).toEqual({
      kind: 'cell',
      cell: { rowIndex: 0, colIndex: 0 },
    })
    expect(resolveSelectionIntent(frame, { x: 150, y: 74 }, behavior)).toEqual({
      kind: 'cell',
      cell: { rowIndex: 1, colIndex: 1 },
    })
  })

  it('缺省 behavior 下所有数据 region 均为 cell', () => {
    const frame = makeFrame()
    expect(resolveSelectionIntent(frame, { x: 50, y: 74 }, resolveSelectionBehavior())).toEqual({
      kind: 'cell',
      cell: { rowIndex: 1, colIndex: 0 },
    })
  })

  it('表头带与空白区返回 null（不消费）', () => {
    const frame = makeFrame()
    expect(resolveSelectionIntent(frame, { x: 150, y: 16 }, behavior)).toBeNull()
  })

  it('corner：all 配置返回 all，none 配置返回 none，无 rowHeader 时不判 corner', () => {
    const withHeader = makeFrame({ rowHeaderWidth: 48 })
    expect(
      resolveSelectionIntent(withHeader, { x: 8, y: 8 }, resolveSelectionBehavior({ headerCorner: 'all' })),
    ).toEqual({ kind: 'all' })
    expect(
      resolveSelectionIntent(withHeader, { x: 8, y: 8 }, resolveSelectionBehavior()),
    ).toEqual({ kind: 'none' })
    const noHeader = makeFrame()
    expect(
      resolveSelectionIntent(noHeader, { x: 8, y: 8 }, resolveSelectionBehavior({ headerCorner: 'all' })),
    ).toBeNull()
  })
})
```

- [x] **Step 2: 跑测试确认红**

Run: `bun test packages/core/tests/kernel/interaction/SelectionIntent.test.ts`
Expected: FAIL（module 不存在）

- [x] **Step 3: 实现**

```ts
// packages/core/src/kernel/interaction/SelectionIntent.ts
import type { RenderFrame } from '../render/RenderFrame'
import type { CellAddress } from '../coords/SelectionTypes'
import { hitTestCellWithRegion, type HitTestPoint } from './HitTest'
import type { ResolvedSelectionBehavior } from './SelectionBehavior'

/** pointer 起点解析出的唯一选择意图（spec §5.1/§6.1）。 */
export type SelectionIntent =
  | { readonly kind: 'cell'; readonly cell: CellAddress }
  | { readonly kind: 'row'; readonly rowIndex: number }
  | { readonly kind: 'column'; readonly colIndex: number }
  | { readonly kind: 'all' }
  | { readonly kind: 'none' }

/**
 * 求值域封闭：仅 header corner 命中与数据 region 命中产出 intent；
 * 其余（表头带、空白）返回 null 交回既有 pointer 链路。
 * corner rect = rowHeaderWidth × viewport.headerHeight（总高，含列组表头层）。
 */
export function resolveSelectionIntent(
  frame: RenderFrame,
  point: HitTestPoint,
  behavior: ResolvedSelectionBehavior,
): SelectionIntent | null {
  const headerHeight = frame.viewport.headerHeight ?? frame.theme.metrics.headerHeight
  const rowHeaderWidth = frame.viewport.rowHeaderWidth ?? 0
  if (
    rowHeaderWidth > 0 &&
    headerHeight > 0 &&
    point.x >= 0 &&
    point.x < rowHeaderWidth &&
    point.y >= 0 &&
    point.y < headerHeight
  ) {
    return behavior.headerCorner === 'all' ? { kind: 'all' } : { kind: 'none' }
  }

  const hit = hitTestCellWithRegion(frame, point)
  if (hit === null) return null

  const intent = behavior.regionIntents[hit.region.id]
  if (intent === 'row') return { kind: 'row', rowIndex: hit.cell.rowIndex }
  if (intent === 'column') return { kind: 'column', colIndex: hit.cell.colIndex }
  return { kind: 'cell', cell: hit.cell }
}
```

- [x] **Step 4: 跑测试确认绿**

Run: `bun test packages/core/tests/kernel/interaction/`
Expected: PASS

- [x] **Step 5: Commit**

```bash
git add packages/core/src/kernel/interaction packages/core/tests/kernel/interaction
git commit -m "feat(core): 冻结窗格选择意图纯 resolver"
```

---

### Task 5: `SelectionDrag` intent 锁轴状态机

**Files:**
- Modify: `packages/core/src/dom/interaction/drag/SelectionDrag.ts`
- Test: `packages/core/tests/dom/interaction/drag/SelectionDrag.test.ts`（既有用例补新 deps + 新用例）

**Interfaces:**
- Consumes: Task 4 `resolveSelectionIntent`、Task 1 `ResolvedSelectionBehavior`。
- Produces: 扩展后的 `SelectionDragDeps`（Task 6 的 DragCoordinator 按此注入）：

```ts
type SelectionDragEngine = GridFrameReader & Pick<GridSelectionAccess, 'selectCell' | 'getSelection'>

export interface SelectionDragDeps {
  readonly engine: SelectionDragEngine
  refresh(): void
  requestAutoScroll(pointer: WebPointerEvent): void
  stopAutoScroll(): void
  syncFillHandle(): void
  isBlocked(): boolean
  getSelectionBehavior(): ResolvedSelectionBehavior
  selectWholeRowRange(anchorRow: number, extentRow: number): void
  selectWholeColumnRange(anchorCol: number, extentCol: number): void
  selectAllCells(): void
  isWholeRowSelection(range: CellRange): boolean
  isWholeColumnSelection(range: CellRange): boolean
}
```

- [x] **Step 1: 更新既有测试的 deps 构造**——`SelectionDrag.test.ts` 现有用例的 `new SelectionDrag({...})` 补：

```ts
getSelectionBehavior: () => resolveSelectionBehavior(),
selectWholeRowRange: mock((_a: number, _b: number) => {}),
selectWholeColumnRange: mock((_a: number, _b: number) => {}),
selectAllCells: mock(() => {}),
isWholeRowSelection: () => false,
isWholeColumnSelection: () => false,
```

（`import { resolveSelectionBehavior } from '../../../../src/kernel/interaction/SelectionBehavior'`。）

- [x] **Step 2: 写失败的新用例**——frame 用 `makeMockGridEngine({ frame })`，frame 沿用 Task 4 测试的 `makeFrame()`（提为本文件局部 helper；mock engine 其余能力由 `makeMockGridEngine` 提供，`overrides` 注入 `getFrame: () => frame`）：

```ts
it('left row 配置下 pointerdown 选整行，drag 锁 row 轴', () => {
  const frame = makeFrame()
  const engine = makeMockGridEngine({ overrides: { getFrame: () => frame } })
  const selectWholeRowRange = mock((_a: number, _b: number) => {})
  const drag = new SelectionDrag({
    ...baseDeps(engine),
    getSelectionBehavior: () =>
      resolveSelectionBehavior({ frozenPanes: { left: 'row' } }),
    selectWholeRowRange,
  })

  // middleLeft (x:50,y:74) → row 1
  expect(drag.tryStart({ x: 50, y: 74, shiftKey: false, button: 0 })).toBe(true)
  expect(selectWholeRowRange).toHaveBeenLastCalledWith(1, 1)

  // 拖到 main 区 row 2（x:150,y:102）：仍走 row 轴，anchor 不变
  drag.move({ x: 150, y: 102, shiftKey: false })
  expect(selectWholeRowRange).toHaveBeenLastCalledWith(1, 2)
  expect(engine.selectCell).not.toHaveBeenCalled()
  drag.commit()
})

it('top column 配置下 shift+click 从既有整列锚扩选', () => {
  const frame = makeFrame()
  const engine = makeMockGridEngine({
    selection: {
      activeCell: { rowIndex: 0, colIndex: 0 },
      anchorCell: { rowIndex: 0, colIndex: 0 },
      extentCell: { rowIndex: 3, colIndex: 0 },
      selectedRange: { startRow: 0, endRow: 3, startCol: 0, endCol: 0 },
    },
    overrides: { getFrame: () => frame },
  })
  const selectWholeColumnRange = mock((_a: number, _b: number) => {})
  const drag = new SelectionDrag({
    ...baseDeps(engine),
    getSelectionBehavior: () =>
      resolveSelectionBehavior({ frozenPanes: { top: 'column' } }),
    selectWholeColumnRange,
    isWholeColumnSelection: () => true,
  })

  // topCenter (x:150,y:46) → col 1，anchor 取现有 anchorCell.colIndex = 0
  expect(drag.tryStart({ x: 150, y: 46, shiftKey: true, button: 0 })).toBe(true)
  expect(selectWholeColumnRange).toHaveBeenLastCalledWith(0, 1)
  drag.commit()
})

it('corner all 配置 pointerdown 全选且不进入拖拽', () => {
  const frame = makeFrame({ rowHeaderWidth: 48 })
  const engine = makeMockGridEngine({ overrides: { getFrame: () => frame } })
  const selectAllCells = mock(() => {})
  const drag = new SelectionDrag({
    ...baseDeps(engine),
    getSelectionBehavior: () => resolveSelectionBehavior({ headerCorner: 'all' }),
    selectAllCells,
  })

  expect(drag.tryStart({ x: 8, y: 8, shiftKey: false, button: 0 })).toBe(true)
  expect(selectAllCells).toHaveBeenCalledTimes(1)
  expect(drag.move({ x: 100, y: 100, shiftKey: false })).toBe(false)
})

it('corner none 配置 pointerdown 不消费（现状 no-op）', () => {
  const frame = makeFrame({ rowHeaderWidth: 48 })
  const engine = makeMockGridEngine({ overrides: { getFrame: () => frame } })
  const drag = new SelectionDrag({ ...baseDeps(engine) })
  expect(drag.tryStart({ x: 8, y: 8, shiftKey: false, button: 0 })).toBe(false)
})
```

`baseDeps(engine)` 为本文件 helper，返回 Step 1 的全量缺省 deps。

- [x] **Step 3: 跑测试确认红**

Run: `bun test packages/core/tests/dom/interaction/drag/SelectionDrag.test.ts`
Expected: 新用例 FAIL（deps 字段不存在 / 仍走 selectCell）

- [x] **Step 4: 实现状态机**

```ts
// SelectionDrag.ts 重写核心（imports 按需补）：
import { hitTestCell } from '../../../kernel/interaction/HitTest'
import { resolveSelectionIntent } from '../../../kernel/interaction/SelectionIntent'
import type { ResolvedSelectionBehavior } from '../../../kernel/interaction/SelectionBehavior'
import type { CellRange } from '../../../kernel/coords/SelectionTypes'

interface SelectionState {
  dragging: boolean
  /** tryStart 固化的轴；drag 全程不切换（spec §5.3）。 */
  intent: 'cell' | 'row' | 'column'
  anchorRow: number
  anchorCol: number
}

tryStart(event: WebPointerEvent): boolean {
  if (this.deps.isBlocked()) return false
  const frame = this.deps.engine.getFrame()
  const intent = resolveSelectionIntent(frame, event, this.deps.getSelectionBehavior())
  if (intent === null || intent.kind === 'none') return false

  if (intent.kind === 'all') {
    this.deps.selectAllCells()
    this.deps.refresh()
    return true // 消费点击但不进入拖拽（spec §5.3：all 不启动拖拽）
  }

  if (intent.kind === 'row') {
    const anchorRow = event.shiftKey ? (this.wholeRowAnchor() ?? intent.rowIndex) : intent.rowIndex
    this.deps.selectWholeRowRange(anchorRow, intent.rowIndex)
    this.state = { dragging: false, intent: 'row', anchorRow, anchorCol: 0 }
  } else if (intent.kind === 'column') {
    const anchorCol = event.shiftKey ? (this.wholeColAnchor() ?? intent.colIndex) : intent.colIndex
    this.deps.selectWholeColumnRange(anchorCol, intent.colIndex)
    this.state = { dragging: false, intent: 'column', anchorRow: 0, anchorCol }
  } else {
    if (event.shiftKey) this.deps.engine.selectCell(intent.cell, { extend: true })
    else this.deps.engine.selectCell(intent.cell)
    this.state = { dragging: false, intent: 'cell', anchorRow: intent.cell.rowIndex, anchorCol: intent.cell.colIndex }
  }
  this.deps.refresh()
  return true
}

move(event: WebPointerEvent): boolean {
  if (!this.state) return false
  this.state.dragging = true
  const hit = hitTestCell(this.deps.engine.getFrame(), event)
  if (hit) {
    if (this.state.intent === 'row') this.deps.selectWholeRowRange(this.state.anchorRow, hit.rowIndex)
    else if (this.state.intent === 'column') this.deps.selectWholeColumnRange(this.state.anchorCol, hit.colIndex)
    else this.deps.engine.selectCell(hit, { extend: true })
    this.deps.refresh()
  }
  this.deps.requestAutoScroll(event)
  return true
}

/** shift 扩选锚：现有选区已是整行/整列时沿用 anchorCell（同 ColumnHeaderDrag 惯例）。 */
private wholeRowAnchor(): number | undefined {
  const selection = this.deps.engine.getSelection()
  const range = selection.selectedRange
  return range && this.deps.isWholeRowSelection(range) ? selection.anchorCell?.rowIndex : undefined
}

private wholeColAnchor(): number | undefined {
  const selection = this.deps.engine.getSelection()
  const range = selection.selectedRange
  return range && this.deps.isWholeColumnSelection(range) ? selection.anchorCell?.colIndex : undefined
}
```

`commit()`/`cancel()`/`reevaluate()`/`active` 保持现状。

- [x] **Step 5: 跑 drag 域全部测试确认绿**

Run: `bun test packages/core/tests/dom/interaction/drag/`
Expected: PASS（含既有用例）

- [x] **Step 6: Commit**

```bash
git add packages/core/src/dom/interaction/drag/SelectionDrag.ts packages/core/tests/dom/interaction/drag/SelectionDrag.test.ts
git commit -m "feat(core): SelectionDrag 升级为 intent 锁轴状态机"
```

---

### Task 6: runtime 接线，外环 L2 转绿

**Files:**
- Modify: `packages/core/src/dom/runtime/controllers/InputController.ts`（加 `selectAllCells`）
- Modify: `packages/core/src/dom/runtime/controllers/DragCoordinator.ts`（deps + SelectionDrag 注入）
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts`（归一化 + 下传）
- Test: `packages/core/tests/dom/runtime/controllers/InputController.test.ts`（如无该文件则在既有 InputController 测试处追加）

**Interfaces:**
- Consumes: Task 1 `resolveSelectionBehavior`、Task 5 的 `SelectionDragDeps`。
- Produces: `InputController.selectAllCells(): void`；`DragCoordinatorDeps` 新增 `getSelectionBehavior(): ResolvedSelectionBehavior` 与 `selectAllCells(): void`。

- [x] **Step 1: 写 `selectAllCells` 失败单测**（放进现有 InputController 测试文件；断言 `engine.setSelection` 收到全表范围，空表 no-op）

```ts
it('selectAllCells 写入全表选区，空表 no-op', () => {
  // 沿用该文件现有 InputController 构造 helper；engine 为 makeMockGridEngine(rowCount 3, colCount 2)
  input.selectAllCells()
  expect(engine.setSelection).toHaveBeenCalledWith({
    activeCell: { rowIndex: 0, colIndex: 0 },
    anchorCell: { rowIndex: 0, colIndex: 0 },
    extentCell: { rowIndex: 2, colIndex: 1 },
    selectedRange: { startRow: 0, endRow: 2, startCol: 0, endCol: 1 },
  })
})
```

- [x] **Step 2: 跑确认红**，然后实现（`selectWholeRowRange` 旁）：

```ts
/** 供 DragCoordinator deps 反向消费（header corner 全选）。 */
selectAllCells(): void {
  const frame = this.deps.engine.getFrame()
  const rowCount = frame.data.getRowCount()
  const colCount = frame.data.getSchema().fields.length
  if (rowCount <= 0 || colCount <= 0) return
  this.deps.engine.setSelection({
    activeCell: { rowIndex: 0, colIndex: 0 },
    anchorCell: { rowIndex: 0, colIndex: 0 },
    extentCell: { rowIndex: rowCount - 1, colIndex: colCount - 1 },
    selectedRange: { startRow: 0, endRow: rowCount - 1, startCol: 0, endCol: colCount - 1 },
  })
}
```

- [x] **Step 3: DragCoordinator 接线**——`DragCoordinatorDeps`（`selectWholeRowRange` 旁）加：

```ts
getSelectionBehavior(): ResolvedSelectionBehavior
selectAllCells(): void
```

`new SelectionDrag({...})` 构造处补：

```ts
getSelectionBehavior: () => this.deps.getSelectionBehavior(),
selectWholeRowRange: (anchor, extent) => this.deps.selectWholeRowRange(anchor, extent),
selectWholeColumnRange: (anchor, extent) => this.deps.selectWholeColumnRange(anchor, extent),
selectAllCells: () => this.deps.selectAllCells(),
isWholeRowSelection: (range) => this.deps.isWholeRowSelection(range),
isWholeColumnSelection: (range) => this.deps.isWholeColumnSelection(range),
```

- [x] **Step 4: GridRuntime 接线**——字段（`interactions` 旁）与构造：

```ts
/** 构造期归一化的选择语义；不进 engine/frame（spec §6.2）。 */
private readonly selectionBehavior: ResolvedSelectionBehavior
// 构造函数（resolveGridInteractions 行旁）：
this.selectionBehavior = resolveSelectionBehavior(opts.selectionBehavior)
// DragCoordinator deps（selectWholeRowRange 行旁）：
getSelectionBehavior: () => this.selectionBehavior,
selectAllCells: () => this.input.selectAllCells(),
```

（deps 均为 lambda，`this.input` 晚绑定与既有 443-449 行一致。）

- [x] **Step 5: 跑外环 L2 + 全量 core 测试确认绿**

Run: `bun test packages/core/tests/acceptance/interaction/selection/bdd.test.ts && bun test packages/core && bun run --filter '*' typecheck`
Expected: Task 2 的红灯全部转绿；core 全量 PASS；typecheck 0 error。若 L2 坐标命中偏差，回 Task 2 的 plan-risk 说明处理。

- [x] **Step 6: Commit**

```bash
git add packages/core/src packages/core/tests
git commit -m "feat(core): selectionBehavior 贯通 runtime，冻结窗格行列选择生效"
```

---

### Task 7: React 转发 + L3a 行为测试

**Files:**
- Modify: `packages/react/src/features/grid/NovaSheetGrid.ts`（destructure + 转发）
- Modify: `packages/react/src/features/grid/useNovaSheetGrid.ts`（destructure + 进 `new Grid` options）
- Modify: `packages/react/tests/excel/NovaExcel.test.ts`（`it.todo` 转真实测试）

**Interfaces:**
- Consumes: core 已导出的 `GridSelectionBehavior`（类型经 `NovaSheetGridProps extends Omit<GridOptions, 'backend'>` 自动获得，无需改 `types.ts`）。
- Produces: `selectionBehavior` prop 端到端生效；DOM 无泄漏。

- [x] **Step 1: 把 `it.todo('excel.L3a.frozen-pane-selection-prop ...')` 改为真实失败测试**——渲染 `NovaSheetGrid`（mount 模式参考同文件 `excel.L3a.custom-row-header-field` 的 canvas stub/raf 处理与 `tests/excel/helpers.ts`）：

```ts
it('excel.L3a.frozen-pane-selection-prop forwards selectionBehavior without leaking DOM attribute', async () => {
  // 渲染 NovaSheetGrid：data 用 createDenseData()，frozen: { leftCols: 1 }，
  // selectionBehavior: { frozenPanes: { left: 'row' } }，excelHeaders 不传（rowHeaderWidth 0）
  // ref: React.createRef<NovaSheetGridRef>()
  // mount 后：
  const host = container.querySelector<HTMLElement>('[data-novasheet-scroll-host]')!
  // denseGridTheme：headerHeight 32，rowHeight 28 → (50, 46) 命中冻结左列 row 0
  host.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 50, clientY: 46, button: 0 }))

  const grid = ref.current!.grid
  const range = grid.getSelection().selectedRange
  const colCount = /* createDenseData().getSchema().fields.length，mount 前取好 */ fieldCount
  expect(range).toEqual({ startRow: 0, endRow: 0, startCol: 0, endCol: colCount - 1 })

  const gridEl = container.querySelector('[data-novasheet-react-grid]')!
  expect(gridEl.hasAttribute('selectionbehavior')).toBe(false)
})
```

- [x] **Step 2: 跑确认红**

Run: `bun test packages/react/tests/excel/NovaExcel.test.ts`
Expected: 该用例 FAIL——prop 未转发时落到 `...domProps`，可能出现 attribute 泄漏或选区仍为单格。

- [x] **Step 3: 实现转发**——两处 destructure 各加一行 `selectionBehavior,`：`NovaSheetGrid.ts` 的 props 解构（`frozen,` 旁）与 `useNovaSheetGrid` 调用对象（`frozen,` 旁）；`useNovaSheetGrid.ts` 的参数解构（`frozen,` 旁）与 `new Grid` options 对象（`frozen,` 行旁加 `selectionBehavior,`）。

- [x] **Step 4: 跑 react 全量 + coverage 确认绿**

Run: `bun test packages/react && bun run --filter @zhiguang/novasheet-react lint:scenario-coverage`
Expected: PASS；coverage 35/35。

- [x] **Step 5: Commit**

```bash
git add packages/react
git commit -m "feat(react): NovaSheetGrid 转发 selectionBehavior 并补 L3a 行为测试"
```

---

### Task 8: 收口——场景状态、四门、审查

**Files:**
- Modify: 三个场景 MD 的 frontmatter `status: draft` → `status: implemented`
- Modify: 两包 manifest（由 `manifest:mbd` 重生成）

- [x] **Step 1: 场景状态翻转 + manifest 重生成**

三个场景 MD frontmatter 改 `status: implemented`，然后：

```bash
cd packages/core && bun run lint:mbd && bun run manifest:mbd
cd ../react && bun run lint:mbd && bun run manifest:mbd
```

- [x] **Step 2: 四门全跑（根目录）**

```bash
bun test
bun run --filter '*' typecheck
bun run lint
bun run --filter @zhiguang/novasheet-core build && bun run --filter @zhiguang/novasheet-canvas2d build
bun run --filter @zhiguang/novasheet-react build && bun run --filter @zhiguang/novasheet-cell-kit build
```

Expected: 全绿（`lint` 含 architecture/boundary/mbd/scenario-coverage）。

- [x] **Step 3: Commit**

```bash
git add packages/core/tests/acceptance packages/react/tests/excel
git commit -m "test(bdd): 冻结窗格选择场景转 implemented 并重生成 manifest"
```

- [x] **Step 4: dispatch code-reviewer**（CLAUDE.md：里程碑收尾必审，即便四门全绿）——审查当前 `main` 的冻结窗格选择提交，重点：架构不变量 3（selection 写门面）、9（kernel 边界）、SelectionDrag 状态机轴锁、坐标语义（view）。审查通过后走 superpowers:finishing-a-development-branch。

---

## Self-Review 记录

- **Spec 覆盖**：§4 API（Task 1）、§5.1 求值域/corner（Task 4）、§5.2 优先级（不动链路，Task 5 只改 SelectionDrag 内部）、§5.3 手势+锁轴（Task 5）、§5.4 activeCell/编辑/键盘（复用 `selectWhole*Range` 即继承行头基准；编辑与键盘零改动=不回归，由 Task 2 对照用例与全量测试罩）、§6 架构（Task 5/6/7）、§7 边界（空表 guard 复用 + Task 4 corner/未冻结用例）、§8 场景（Task 2/7/8）、§9 兼容（Task 2 未配置对照 + corner 对照）。
- **类型一致性**：`selectAllCells`（InputController/DragCoordinatorDeps/SelectionDragDeps 同名）；`getSelectionBehavior(): ResolvedSelectionBehavior` 贯通 Task 5/6；`resolveSelectionIntent(frame, point, behavior)` 签名 Task 4 定义、Task 5 消费。
- **已知风险**：L2/单测点击坐标依赖 region 几何推导，已在 Task 2/3 标注 STOP+ASK 修坐标不修期望；React mount 细节授权 implementer 参考既有 helper 模式（属既有代码引用，非 placeholder）。
