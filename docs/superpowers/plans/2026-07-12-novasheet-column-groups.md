# 列组表头（Column Groups）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Schema 声明式列组树 → engine 解析布局随 `getFrame()` 下发 → canvas2d 绘制多行组头；组头点击选整组；`getColumnGroups`/`selectGroup`/`scrollToGroup` 公开 API。

**Architecture:** 组树初始声明挂 `Schema.columnGroups`，运行时真相在 engine 自持的 `ColumnGroupStore`（features 新域 `column-groups/`，与 frozen/hidden/format 同模式：setData 重建、结构 mutation 由 engine 编排维护、undo 携带快照）。布局解析与派生高亮是纯函数，`getFrame()` 组装 `columnGroupHeader` 下发；`viewport.headerHeight` 语义升级为表头总高（最大横切回归面，Task 4 附逐消费点核对清单）。

**Tech Stack:** TypeScript strict（`noUncheckedIndexedAccess` + `verbatimModuleSyntax`）、bun workspaces、`bun:test`、`RecordingContext2D`（canvas2d 测试）。

**Spec:** `docs/superpowers/specs/2026-07-12-novasheet-column-groups-design.md`（§2 数据模型与校验、§3 渲染契约、§4 交互与派生高亮、§8 ADR）。
**BDD 场景（已定稿 status draft）:** `packages/core/tests/acceptance/functional/column-groups/scenarios/*.md`（7 条）——Task 10 转绿。

## Global Constraints

- **bun only**；测试 `bun test packages/core`（canvas2d task 用 `bun test packages/canvas2d`），typecheck `bun run --filter '*' typecheck`，lint `bun run lint`（含 `lint:architecture`）。三者全绿才 commit。
- **Commit:** Conventional Commits，中文 subject，英文 `type(scope)` 与 identifier。一 task 一 commit，never `--no-verify`。
- **坐标约定:** `columnGroupHeader` 全部 **view 坐标**（hidden 已剔除）；组树存储按 **fieldId** 引用（结构 remap 天然稳定）。
- **校验 fail loud:** 组树三条规则（连续性/叶序一致/引用完整+不重复+非空+id 唯一）违反时构造/`setData` **throw**；运行时 API 对不存在 groupId 返 `false`/no-op 不 throw。
- **`viewport.headerHeight` 语义升级为表头总高**（`depth × theme.metrics.groupHeaderRowHeight + leafHeaderHeight`）；新增 `viewport.leafHeaderHeight`。无组时二者相等、行为与现状逐字节一致（零成本路径）。
- **Theme 只新增一个 token：`metrics.groupHeaderRowHeight`**；组头颜色/字体全部复用现有 header 系 token，canvas2d 内零硬编码 px/color（不变量 #4）。
- **`GridSelection` 类型零改动**（spec ADR C）；组选中 = 整列 range，组头高亮按 ⊇ 规则派生。
- **渲染后端只吃 frame**（不变量 #1）：canvas2d 不 import 组树类型做解析，只消费 `columnGroupHeader`。
- **公开 API golden** (`packages/core/tests/acceptance/contract/plugin-api/__goldens__/core.type.public-api-inventory.golden.txt`) 在 Task 7 **预期有 diff**（新增 3 方法 + 类型导出），golden 更新是该 task 交付物的一部分，非事故。
- **STOP+ASK:** 现实现与本计划/spec 矛盾（headerHeight 消费点语义与核对清单判断不符、mock-grid-engine 能力不足、undo command JSON 契约测试冲突）时停下来问，禁静默选。

### 每 task 标准循环（下文各 task 的 Step 序列都实例化此循环）

1. 写新单元的失败测试（测试代码见各 task）
2. 运行确认 FAIL（模块/方法不存在或断言红）
3. 实现最小代码使测试过
4. `bun test packages/core`（或 canvas2d）全绿；typecheck + lint 全绿
5. Commit

---

## 文件结构总览

```text
packages/core/src/
  kernel/data/Schema.ts                     # +ColumnGroup/ColumnGroupChild 类型、Schema.columnGroups?
  features/column-groups/                   # 新域
    validateColumnGroups.ts                 # 校验纯函数（Task 1）
    ColumnGroupStore.ts                     # 运行时组树状态（Task 2）
    resolveColumnGroupLayout.ts             # 布局解析 + 派生高亮纯函数（Task 3）
  kernel/geometry/Viewport.ts               # +leafHeaderHeight（Task 4）
  kernel/theme/{Theme,denseGridTheme}.ts    # +groupHeaderRowHeight token（Task 4）
  features/layout/LayoutState.ts            # 总高计算写入（Task 4）
  kernel/render/RenderFrame.ts              # +columnGroupHeader 契约（Task 5）
  engine/DefaultGridEngine.ts               # store 初始化/getFrame 组装/selectColumnGroup（Task 5）
  kernel/undo/UndoCommand.ts                # insertCols/deleteCols/moveCols +columnGroups 快照（Task 6）
  features/column/{Insert,Delete,Move}ColsCommandHandler.ts  # 组树维护（Task 6）
  Grid.ts + dom/runtime/GridController(Impl).ts + dom/runtime/controllers/ViewportController.ts  # 公开 API（Task 7）
  dom/runtime/controllers/InputController.ts # hit-test 分层 + 组头点击（Task 9）
packages/canvas2d/src/painters/HeaderPainter.ts + render/Canvas2DRenderer.ts  # 组头绘制（Task 8）
packages/core/tests/acceptance/functional/column-groups/column-groups-bdd.test.ts  # BDD 转绿（Task 10）
apps/storybook/src/stories/ColumnGroups.stories.ts  # story（Task 10）
```

---

### Task 1: ColumnGroup 类型 + validateColumnGroups 校验纯函数

**Files:**

- Modify: `packages/core/src/kernel/data/Schema.ts`
- Create: `packages/core/src/features/column-groups/validateColumnGroups.ts`
- Test: `packages/core/tests/features/column-groups/validateColumnGroups.test.ts`

**Interfaces（Produces，后续全部 task 依赖）:**

```ts
// kernel/data/Schema.ts 追加
export type ColumnGroupChild = ColumnGroup | { readonly fieldId: string }
export interface ColumnGroup {
  readonly id: string
  readonly label: string
  readonly children: readonly ColumnGroupChild[]
}
export interface Schema {
  readonly fields: readonly Field[]
  /** 可选列组树。缺省 = 无组头，行为与现状完全一致。校验见 validateColumnGroups。 */
  readonly columnGroups?: readonly ColumnGroupChild[]
}

// features/column-groups/validateColumnGroups.ts
/** 违反 spec §2.2 三条规则时 throw Error（message 含规则名与违例 id/fieldId）。 */
export function validateColumnGroups(
  fields: readonly Field[],
  columnGroups: readonly ColumnGroupChild[],
): void
```

校验规则（spec §2.2，错误 message 前缀便于测试断言）：

- `[column-groups/contiguity]` 组的叶 fieldId 在 fields 中须占连续区间
- `[column-groups/leaf-order]` 组树深度优先叶序与 fields 顺序一致
- `[column-groups/reference]` fieldId 必须存在、至多归属一条叶路径、组 children 非空、组 id 全树唯一

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'bun:test'
import { validateColumnGroups } from '../../../src/features/column-groups/validateColumnGroups'
import type { ColumnGroupChild } from '../../../src/kernel/data/Schema'
import type { Field } from '../../../src/kernel/data/Schema'

const f = (id: string): Field => ({ id, name: id, type: 'text', width: 100 })
const fields = [f('m'), f('s1c1'), f('s1c2'), f('s2c1'), f('s2c2')]
const legal: ColumnGroupChild[] = [
  { fieldId: 'm' },
  { id: 's1', label: '堆1', children: [{ fieldId: 's1c1' }, { fieldId: 's1c2' }] },
  { id: 's2', label: '堆2', children: [{ fieldId: 's2c1' }, { fieldId: 's2c2' }] },
]

describe('validateColumnGroups', () => {
  it('合法混排（无组列 + 两组）通过', () => {
    expect(() => validateColumnGroups(fields, legal)).not.toThrow()
  })

  it('嵌套组（组含子组）通过', () => {
    const nested: ColumnGroupChild[] = [
      { fieldId: 'm' },
      {
        id: 'a',
        label: 'A相',
        children: [
          { id: 's1', label: '堆1', children: [{ fieldId: 's1c1' }, { fieldId: 's1c2' }] },
          { id: 's2', label: '堆2', children: [{ fieldId: 's2c1' }, { fieldId: 's2c2' }] },
        ],
      },
    ]
    expect(() => validateColumnGroups(fields, nested)).not.toThrow()
  })

  it('不连续引用 throw contiguity', () => {
    const bad: ColumnGroupChild[] = [
      { id: 's1', label: 'x', children: [{ fieldId: 's1c1' }, { fieldId: 's2c2' }] },
    ]
    expect(() => validateColumnGroups(fields, bad)).toThrow(/column-groups\/contiguity/)
  })

  it('叶序与 fields 顺序不一致 throw leaf-order', () => {
    const bad: ColumnGroupChild[] = [
      { id: 's1', label: 'x', children: [{ fieldId: 's1c2' }, { fieldId: 's1c1' }] },
    ]
    expect(() => validateColumnGroups(fields, bad)).toThrow(/column-groups\/leaf-order/)
  })

  it.each([
    ['引用不存在', [{ id: 'g', label: 'x', children: [{ fieldId: 'ghost' }] }]],
    [
      '重复归属',
      [
        { id: 'g1', label: 'x', children: [{ fieldId: 's1c1' }] },
        { id: 'g2', label: 'y', children: [{ fieldId: 's1c1' }] },
      ],
    ],
    ['空 children', [{ id: 'g', label: 'x', children: [] }]],
    [
      '重复组 id',
      [
        { id: 'g', label: 'x', children: [{ fieldId: 's1c1' }] },
        { id: 'g', label: 'y', children: [{ fieldId: 's1c2' }] },
      ],
    ],
  ] as const)('%s throw reference', (_name, bad) => {
    expect(() => validateColumnGroups(fields, bad as ColumnGroupChild[])).toThrow(
      /column-groups\/reference/,
    )
  })
})
```

- [ ] **Step 2: 运行确认失败** — `bun test packages/core/tests/features/column-groups/validateColumnGroups.test.ts`，期望 FAIL（cannot resolve module）。
- [ ] **Step 3: 实现** — Schema.ts 追加类型（`import type` 规约）；校验函数：深度优先收集叶 fieldId 与组 id，逐规则检查。实现要点：一次遍历同时收集（叶路径列表、组 id 集合），再用 `fields` 的 `id → index` map 检查每组叶 index 区间连续且整体叶序单调递增。
- [ ] **Step 4: 全量验证** — `bun test packages/core` + typecheck + lint 全绿。
- [ ] **Step 5: Commit** — `feat(core): 新增 ColumnGroup 类型与组树校验纯函数`

### Task 2: ColumnGroupStore 运行时组树状态

**Files:**

- Create: `packages/core/src/features/column-groups/ColumnGroupStore.ts`
- Test: `packages/core/tests/features/column-groups/ColumnGroupStore.test.ts`

**Interfaces:**

- Consumes: Task 1 的 `ColumnGroupChild`、`validateColumnGroups`
- Produces:

```ts
/** JSON 可往返的组树快照（undo command 携带用，勿放非纯数据）。 */
export interface ColumnGroupsSnapshot {
  readonly tree: readonly ColumnGroupChild[]
}
export class ColumnGroupStore {
  /** 构造即校验（throw 见 Task 1）。tree 为 undefined/空数组 = 无组。 */
  constructor(fields: readonly Field[], tree: readonly ColumnGroupChild[] | undefined)
  hasGroups(): boolean
  getTree(): readonly ColumnGroupChild[]
  /** 组层最大深度（叶不计）。无组返 0。 */
  getDepth(): number
  /** 组 id → 其下全部叶 fieldId（文档序）。不存在返 null。 */
  findGroupLeafFieldIds(groupId: string): readonly string[] | null
  /** insertCols 后调用：插入点两侧同组则新列归该组，否则不归组（spec §2.3）。 */
  applyInsertFields(
    atFieldIndex: number,
    newFieldIds: readonly string[],
    fieldsBefore: readonly Field[],
  ): void
  /** deleteCols 后调用：剔除引用，组叶子删空则级联移除。 */
  applyDeleteFields(fieldIds: readonly string[]): void
  /** moveCols 预检：全部移动列与目标位置同属一个组（或同为无组顶层）返 true。 */
  isMoveWithinSameGroup(
    fieldIds: readonly string[],
    beforeFieldId: string | null,
    fields: readonly Field[],
  ): boolean
  /** moveCols 成功后调用：按新 fields 序重排各组叶序。 */
  applyMoveFields(fieldsAfter: readonly Field[]): void
  snapshot(): ColumnGroupsSnapshot
  restore(snap: ColumnGroupsSnapshot): void
}
```

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'bun:test'
import { ColumnGroupStore } from '../../../src/features/column-groups/ColumnGroupStore'
import type { Field, ColumnGroupChild } from '../../../src/kernel/data/Schema'

const f = (id: string): Field => ({ id, name: id, type: 'text', width: 100 })
const fields = [f('m'), f('s1c1'), f('s1c2'), f('s2c1'), f('s2c2')]
const tree: ColumnGroupChild[] = [
  { fieldId: 'm' },
  { id: 's1', label: '堆1', children: [{ fieldId: 's1c1' }, { fieldId: 's1c2' }] },
  { id: 's2', label: '堆2', children: [{ fieldId: 's2c1' }, { fieldId: 's2c2' }] },
]

describe('ColumnGroupStore', () => {
  it('depth 与叶查找', () => {
    const store = new ColumnGroupStore(fields, tree)
    expect(store.getDepth()).toBe(1)
    expect(store.findGroupLeafFieldIds('s1')).toEqual(['s1c1', 's1c2'])
    expect(store.findGroupLeafFieldIds('ghost')).toBeNull()
  })

  it('insert 组内部归组、边界不归组', () => {
    const store = new ColumnGroupStore(fields, tree)
    // 在 s1c1 与 s1c2 之间（fields index 2）插入 → 归 s1
    store.applyInsertFields(2, ['new1'], fields)
    expect(store.findGroupLeafFieldIds('s1')).toEqual(['s1c1', 'new1', 's1c2'])
    // 在 s1 与 s2 边界（原 index 3，插入后 fields 变化，用当前 fields 快照传入）不归组
    const fields2 = [f('m'), f('s1c1'), f('new1'), f('s1c2'), f('s2c1'), f('s2c2')]
    store.applyInsertFields(4, ['new2'], fields2)
    expect(store.findGroupLeafFieldIds('s1')).toEqual(['s1c1', 'new1', 's1c2'])
    expect(store.findGroupLeafFieldIds('s2')).toEqual(['s2c1', 's2c2'])
    expect(store.getTree().some((n) => 'fieldId' in n && n.fieldId === 'new2')).toBe(true)
  })

  it('delete 级联移除空组，snapshot/restore 往返', () => {
    const store = new ColumnGroupStore(fields, tree)
    const before = store.snapshot()
    store.applyDeleteFields(['s1c1', 's1c2'])
    expect(store.findGroupLeafFieldIds('s1')).toBeNull()
    store.restore(before)
    expect(store.findGroupLeafFieldIds('s1')).toEqual(['s1c1', 's1c2'])
    expect(JSON.parse(JSON.stringify(before))).toEqual(before) // JSON 纯数据
  })

  it('move 预检：跨组 false、同组 true、无组顶层间 true', () => {
    const store = new ColumnGroupStore(fields, tree)
    expect(store.isMoveWithinSameGroup(['s1c2'], 's2c2', fields)).toBe(false)
    expect(store.isMoveWithinSameGroup(['s1c2'], 's1c1', fields)).toBe(true)
    expect(store.isMoveWithinSameGroup(['m'], null, fields)).toBe(true)
  })

  it('applyMoveFields 按新 fields 序重排组内叶序', () => {
    const store = new ColumnGroupStore(fields, tree)
    store.applyMoveFields([f('m'), f('s1c2'), f('s1c1'), f('s2c1'), f('s2c2')])
    expect(store.findGroupLeafFieldIds('s1')).toEqual(['s1c2', 's1c1'])
  })
})
```

- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 实现** — 内部持可变树副本；`applyInsertFields` 归组判定：`atFieldIndex` 的前一列与后一列（按 `fieldsBefore`）叶路径最深公共组即归属组（两侧不同组/任一无组 → 不归组）；嵌套时插入最深公共组。`isMoveWithinSameGroup`：`beforeFieldId` 非 null 时目标组 = 该 fieldId 的直接父组（或顶层/无组）；`beforeFieldId === null`（移到整表末尾，越过最后一列）视为**顶层/无组**边界（与 `applyInsertFields` 末尾插入不归组的边界规则镜像一致，**不是**取物理末列自身的父组）——移动列集合与目标组全部相同才 true。（Plan-bug 修正：原文"null = 末尾，取末列"与本 task 自身 Step 1 测试矛盾，见台账 Task 2 记录。）
- [ ] **Step 4: 全量验证**。
- [ ] **Step 5: Commit** — `feat(core): 新增 ColumnGroupStore——组树运行时状态与结构变更一致性`

### Task 3: 布局解析 + 派生高亮纯函数

**Files:**

- Create: `packages/core/src/features/column-groups/resolveColumnGroupLayout.ts`
- Test: `packages/core/tests/features/column-groups/resolveColumnGroupLayout.test.ts`

**Interfaces:**

- Consumes: Task 1 类型
- Produces:

```ts
export interface LayoutGroupCell {
  readonly groupId: string
  readonly label: string
  readonly startViewCol: number // 闭区间，view 坐标（可见列序）
  readonly endViewCol: number
}
export interface ColumnGroupLayout {
  readonly depth: number
  readonly rows: readonly (readonly LayoutGroupCell[])[] // rows[0] = 最顶层
  readonly leafTopRowByViewCol: readonly number[]
}
/** visibleFields = hidden 剔除后的有序字段（即 frame schema.fields）。无组或组全隐 → null。 */
export function resolveColumnGroupLayout(
  tree: readonly ColumnGroupChild[],
  visibleFields: readonly Field[],
): ColumnGroupLayout | null

/** 派生高亮：selectedRange 整列（0..rowCount-1）且列区间 ⊇ 组可见叶列区间 → 该组 id 入集。 */
export function deriveSelectedGroupIds(
  layout: ColumnGroupLayout,
  selectedRange: CellRange | null,
  rowCount: number,
): ReadonlySet<string>
```

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'bun:test'
import {
  resolveColumnGroupLayout,
  deriveSelectedGroupIds,
} from '../../../src/features/column-groups/resolveColumnGroupLayout'
import type { Field, ColumnGroupChild } from '../../../src/kernel/data/Schema'

const f = (id: string): Field => ({ id, name: id, type: 'text', width: 100 })
// 嵌套两层组：m 无组 | A相(堆X[aXc1,aXc2] 堆Y[aYc1]) | B相(堆Z[bZc1])
const tree: ColumnGroupChild[] = [
  { fieldId: 'm' },
  {
    id: 'a',
    label: 'A相',
    children: [
      { id: 'aX', label: '堆X', children: [{ fieldId: 'aXc1' }, { fieldId: 'aXc2' }] },
      { id: 'aY', label: '堆Y', children: [{ fieldId: 'aYc1' }] },
    ],
  },
  {
    id: 'b',
    label: 'B相',
    children: [{ id: 'bZ', label: '堆Z', children: [{ fieldId: 'bZc1' }] }],
  },
]
const allVisible = [f('m'), f('aXc1'), f('aXc2'), f('aYc1'), f('bZc1')]

describe('resolveColumnGroupLayout', () => {
  it('depth/rows 区间/leafTopRowByViewCol（spec §3.1 场景 frame-layout 的纯函数版）', () => {
    const layout = resolveColumnGroupLayout(tree, allVisible)!
    expect(layout.depth).toBe(2)
    expect(layout.rows[0]).toEqual([
      { groupId: 'a', label: 'A相', startViewCol: 1, endViewCol: 3 },
      { groupId: 'b', label: 'B相', startViewCol: 4, endViewCol: 4 },
    ])
    expect(layout.rows[1]).toEqual([
      { groupId: 'aX', label: '堆X', startViewCol: 1, endViewCol: 2 },
      { groupId: 'aY', label: '堆Y', startViewCol: 3, endViewCol: 3 },
      { groupId: 'bZ', label: '堆Z', startViewCol: 4, endViewCol: 4 },
    ])
    expect(layout.leafTopRowByViewCol).toEqual([0, 2, 2, 2, 2])
  })

  it('部分隐藏收缩、全隐组消失（不对称深度：b 只有一层子组时 bZ 叶头仍在 row1 之下）', () => {
    const layout = resolveColumnGroupLayout(tree, [f('m'), f('aXc1'), f('bZc1')])!
    expect(layout.rows[0]).toEqual([
      { groupId: 'a', label: 'A相', startViewCol: 1, endViewCol: 1 },
      { groupId: 'b', label: 'B相', startViewCol: 2, endViewCol: 2 },
    ])
    expect(layout.rows[1]).toEqual([
      { groupId: 'aX', label: '堆X', startViewCol: 1, endViewCol: 1 },
      { groupId: 'bZ', label: '堆Z', startViewCol: 2, endViewCol: 2 },
    ])
  })

  it('无组树 / 组全隐 返回 null', () => {
    expect(resolveColumnGroupLayout([], allVisible)).toBeNull()
    expect(resolveColumnGroupLayout(tree, [f('m')])).toBeNull() // 所有组叶全隐 → 仅无组列
  })
})

describe('deriveSelectedGroupIds', () => {
  const layout = resolveColumnGroupLayout(tree, allVisible)!
  it('整列且 ⊇：单组、多组、父组递归', () => {
    expect(
      deriveSelectedGroupIds(layout, { startRow: 0, endRow: 9, startCol: 1, endCol: 2 }, 10),
    ).toEqual(new Set(['aX']))
    expect(
      deriveSelectedGroupIds(layout, { startRow: 0, endRow: 9, startCol: 1, endCol: 3 }, 10),
    ).toEqual(new Set(['aX', 'aY', 'a']))
  })
  it('非整列 → 空集；null range → 空集', () => {
    expect(
      deriveSelectedGroupIds(layout, { startRow: 1, endRow: 9, startCol: 1, endCol: 2 }, 10).size,
    ).toBe(0)
    expect(deriveSelectedGroupIds(layout, null, 10).size).toBe(0)
  })
})
```

- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 实现** — 深度优先带层级遍历：先算全树组深度 `depth`；对每个组求其可见叶的 view 列区间（无可见叶 → 该组不产 cell）；`leafTopRowByViewCol[viewCol]` = 该列祖先组个数（无组列 = 0；注意**不对称分支**：叶头从其祖先组数行起画到表头底，不是从 depth 行）。`deriveSelectedGroupIds`：range 整列判定 + 对每个产出 cell 的组做区间 ⊇ 判断。
- [ ] **Step 4: 全量验证**。
- [ ] **Step 5: Commit** — `feat(core): 列组布局解析与选中派生纯函数（view 坐标/嵌套/隐藏收缩）`

### Task 4: 表头高度模型升级（headerHeight 语义 = 总高）

**Files:**

- Modify: `packages/core/src/kernel/geometry/Viewport.ts`、`packages/core/src/kernel/theme/Theme.ts`、`packages/core/src/kernel/theme/denseGridTheme.ts`、`packages/core/src/features/layout/LayoutState.ts`
- Test: `packages/core/tests/features/layout/LayoutState.header-height.test.ts`（新建）

**Interfaces:**

- Produces:

```ts
// Theme.metrics 追加
readonly groupHeaderRowHeight: number   // denseGridTheme 取 28

// ViewportSnapshot 追加
readonly leafHeaderHeight: number

// Viewport：setHeaderHeight(h) 保留（= 总高单值，无组路径）；新增
setHeaderHeights(total: number, leaf: number): void   // snapshot 分别下发两值

// LayoutStateInput 追加（闭包指向 engine 的 ColumnGroupStore，Task 5 接线）
readonly getGroupHeaderDepth: () => number

// DefaultLayoutState 内部：写入点统一走
private applyHeaderHeights(): void {
  const leaf = this.theme.metrics.headerHeight
  const depth = this.getGroupHeaderDepth()
  this.viewport.setHeaderHeights(depth * this.theme.metrics.groupHeaderRowHeight + leaf, leaf)
}
```

**写入点改造（[LayoutState.ts](packages/core/src/features/layout/LayoutState.ts) 全部三处）：** `initView` L89、`applyTheme` L105、`recreateViewportPreserving` L150（改为按 snapshot 的 `leafHeaderHeight` + 当前 depth 重算，**不能**直接搬旧 `snap.headerHeight`——列结构 mutation 可能改变 depth）。`setHeaderHeight(h)` 公开语义改为**设 leaf 高**后重算总高（更新 `GridEngine.setHeaderHeight` TSDoc）。

**消费点核对清单（90 处/20 文件，实施时逐文件核对并在 task 报告中逐行勾选；判断为"总高 OK"= 语义升级后无需改码）：**

| 文件                                                                   | 预判        | 依据                          |
| ---------------------------------------------------------------------- | ----------- | ----------------------------- |
| `kernel/geometry/Viewport.ts`                                          | 改          | 本 task 主体                  |
| `kernel/geometry/FrozenRegions.ts`                                     | 总高 OK     | 区域切分在表头之下            |
| `kernel/interaction/scrollCellIntoView.ts`                             | 总高 OK     | 内容区顶部偏移                |
| `kernel/interaction/HandleLayout.ts`                                   | 总高 OK     | 列 resize handle 挂表头底缘   |
| `features/layout/LayoutState.ts`                                       | 改          | 写入点                        |
| `engine/DefaultGridEngine.ts` / `engine/GridEngine.ts`                 | 改注释      | `setHeaderHeight` 语义 = leaf |
| `kernel/theme/Theme.ts` / `denseGridTheme.ts`                          | 改          | 新 token                      |
| `dom/runtime/GridRuntime.ts`                                           | 总高 OK     | spacer/编辑器定位用总高       |
| `dom/runtime/controllers/ViewportController.ts`                        | 总高 OK     | 滚动映射用总高                |
| `dom/runtime/controllers/InputController.ts`                           | Task 9 改   | 表头内 y 分层                 |
| `dom/runtime/controllers/ContextMenuController.ts`                     | Task 9 核对 | 列头菜单按钮 y 用叶头区       |
| `dom/interaction/DomHandleLayer.ts`、`dom/host/resize-handle-style.ts` | 总高 OK     | handle 层从表头底开始         |
| `dom/interaction/handle/HideColToggleHandle.ts`                        | 核对        | 指示器 y 若锚表头内须用叶头区 |
| `dom/interaction/drag/RowHeaderDrag.ts`                                | 总高 OK     | 行头区从表头底开始            |
| `canvas2d/painters/HeaderPainter.ts`                                   | Task 8 改   | 组行 + 叶行绘制               |
| `canvas2d/painters/RowHeaderPainter.ts`                                | 核对        | 左上角块高 = 总高             |
| `canvas2d/render/Canvas2DRenderer.ts`                                  | Task 8 改   | 表头段布局                    |

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'bun:test'
import { DefaultLayoutState } from '../../../src/features/layout/LayoutState'
import { denseGridTheme } from '../../../src/kernel/theme/denseGridTheme'
import { ChunkedAxis } from '../../../src/kernel/geometry/ChunkedAxis'

function makeLayout(depth: number) {
  const layout = new DefaultLayoutState({
    theme: denseGridTheme,
    explicitDefaultRowHeight: undefined,
    excelHeaders: false,
    frozenInput: undefined,
    getSchema: () => ({ fields: [{ id: 'a', name: 'a', type: 'text', width: 100 }] }),
    getGroupHeaderDepth: () => depth,
  })
  const rows = new ChunkedAxis()
  rows.setCount(10, 32)
  const cols = new ChunkedAxis()
  cols.setCount(1, 100)
  layout.initView(rows, cols)
  return layout
}

describe('LayoutState 表头总高', () => {
  it('无组：headerHeight === leafHeaderHeight === theme.metrics.headerHeight（零成本路径）', () => {
    const snap = makeLayout(0).getViewport().snapshot()
    expect(snap.headerHeight).toBe(denseGridTheme.metrics.headerHeight)
    expect(snap.leafHeaderHeight).toBe(denseGridTheme.metrics.headerHeight)
  })
  it('depth=2：总高 = 2×groupHeaderRowHeight + leaf', () => {
    const snap = makeLayout(2).getViewport().snapshot()
    expect(snap.headerHeight).toBe(
      2 * denseGridTheme.metrics.groupHeaderRowHeight + denseGridTheme.metrics.headerHeight,
    )
    expect(snap.leafHeaderHeight).toBe(denseGridTheme.metrics.headerHeight)
  })
})
```

（`ChunkedAxis` 构造/`setCount` 签名以现实现为准，测试里按需调整——只许改 stub 不许改实现。）

- [ ] **Step 2: 运行确认失败**（`getGroupHeaderDepth`/`leafHeaderHeight` 不存在，typecheck 红）。
- [ ] **Step 3: 实现**（见 Interfaces 与写入点改造）；`DefaultGridEngine` 构造 `DefaultLayoutState` 处先传 `getGroupHeaderDepth: () => 0` 占位（Task 5 换真闭包），保证本 task 独立绿。
- [ ] **Step 4: 全量验证** — 重点：现有全部测试零回归（无组路径二值相等）。核对清单逐文件过一遍，发现预判错误 STOP+ASK。
- [ ] **Step 5: Commit** — `feat(core): 表头高度模型升级——viewport.headerHeight 语义为总高 + leafHeaderHeight`

### Task 5: Engine 接线（store 初始化 / frame 组装 / selectColumnGroup）

**Files:**

- Modify: `packages/core/src/engine/DefaultGridEngine.ts`、`packages/core/src/engine/GridEngine.ts`、`packages/core/src/kernel/render/RenderFrame.ts`、`packages/core/src/kernel/render/assembleRenderFrame.ts`（组装函数实际所在文件以 `assembleRenderFrame` 定义处为准）、`packages/core/src/index.ts`（导出 `ColumnGroup`/`ColumnGroupChild` 类型）
- Test: `packages/core/tests/engine/DefaultGridEngine.column-groups.test.ts`

**Interfaces:**

- Consumes: Task 1–4 全部
- Produces:

```ts
// RenderFrame 追加
export interface RenderFrameGroupHeaderCell {
  readonly groupId: string
  readonly label: string
  readonly startViewCol: number
  readonly endViewCol: number
  readonly selected: boolean
}
export interface RenderFrameColumnGroupHeader {
  readonly depth: number
  readonly rows: readonly (readonly RenderFrameGroupHeaderCell[])[]
  readonly leafTopRowByViewCol: readonly number[]
}
// RenderFrame: columnGroupHeader?: RenderFrameColumnGroupHeader

// GridEngine 接口追加
getColumnGroups(): readonly ColumnGroupChild[]
/** 组可见叶列整列选中；不存在/全隐 → false 不动选区。 */
selectColumnGroup(groupId: string): boolean
```

**实现要点：**

- engine 构造与 `setData`：`this.columnGroups = new ColumnGroupStore(data.getSchema().fields, data.getSchema().columnGroups)`（构造抛错即 fail loud）；LayoutState 的 `getGroupHeaderDepth` 闭包换为 `() => this.columnGroups.getDepth()`（有组且可见时；depth 恒为树深，与隐藏无关——布局行数固定，全隐组只是该组不产 cell，见 spec §3.1 rows 语义。**注意**：`viewport.headerHeight` 总高用树深，不随隐藏抖动）。
- `getFrame()`：布局缓存（依赖 schema 版本 + hidden 集 + store 树版本，脏标记模式与 `frameFormat` 现有缓存同风格）→ `resolveColumnGroupLayout(tree, visibleFields)`；每帧仅 `deriveSelectedGroupIds`（O(组数)）合成 `selected` 后传 `assembleRenderFrame`。
- `selectColumnGroup`：`findGroupLeafFieldIds` → 过滤可见 → 映射 view 列区间 → `selectionController`/`setSelection` 写整列 range（`activeCell` = 首可见叶列 row 0，`anchorCell` 同，`extentCell` = 末可见叶列 row rowCount-1，与 `InputController.selectWholeColumnRange` 现有形态一致）。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine } from '../../src/engine/DefaultGridEngine'
import { InMemoryDataSource } from '../../src/kernel/data/InMemoryDataSource'
import { denseGridTheme } from '../../src/kernel/theme/denseGridTheme'

function makeEngine() {
  const data = new InMemoryDataSource({
    schema: {
      fields: [
        { id: 'm', name: 'm', type: 'text', width: 100 },
        { id: 's1c1', name: 's1c1', type: 'text', width: 100 },
        { id: 's1c2', name: 's1c2', type: 'text', width: 100 },
        { id: 's2c1', name: 's2c1', type: 'text', width: 100 },
      ],
      columnGroups: [
        { fieldId: 'm' },
        { id: 's1', label: '堆1', children: [{ fieldId: 's1c1' }, { fieldId: 's1c2' }] },
        { id: 's2', label: '堆2', children: [{ fieldId: 's2c1' }] },
      ],
    },
    rows: Array.from({ length: 5 }, () => ({ m: 'x', s1c1: 1, s1c2: 2, s2c1: 3 })),
  })
  const engine = new DefaultGridEngine({ data, theme: denseGridTheme })
  engine.setViewportSize(800, 600)
  return engine
}

describe('DefaultGridEngine column groups', () => {
  it('getFrame 下发 columnGroupHeader 且 viewport.headerHeight 为总高', () => {
    const frame = makeEngine().getFrame()
    const cg = frame.columnGroupHeader!
    expect(cg.depth).toBe(1)
    expect(cg.rows[0]).toEqual([
      { groupId: 's1', label: '堆1', startViewCol: 1, endViewCol: 2, selected: false },
      { groupId: 's2', label: '堆2', startViewCol: 3, endViewCol: 3, selected: false },
    ])
    expect(cg.leafTopRowByViewCol).toEqual([0, 1, 1, 1])
    expect(frame.viewport.headerHeight).toBe(
      denseGridTheme.metrics.groupHeaderRowHeight + denseGridTheme.metrics.headerHeight,
    )
    expect(frame.viewport.leafHeaderHeight).toBe(denseGridTheme.metrics.headerHeight)
  })

  it('selectColumnGroup 写整列 range 且 frame selected 派生', () => {
    const engine = makeEngine()
    expect(engine.selectColumnGroup('s1')).toBe(true)
    expect(engine.getSelection().selectedRange).toEqual({
      startRow: 0,
      endRow: 4,
      startCol: 1,
      endCol: 2,
    })
    const cg = engine.getFrame().columnGroupHeader!
    expect(cg.rows[0]![0]!.selected).toBe(true)
    expect(cg.rows[0]![1]!.selected).toBe(false)
    expect(engine.selectColumnGroup('ghost')).toBe(false)
  })

  it('非法组树 setData throw；无组 schema frame 无 columnGroupHeader', () => {
    const engine = makeEngine()
    expect(() =>
      engine.setData(
        new InMemoryDataSource({
          schema: {
            fields: [{ id: 'a', name: 'a', type: 'text', width: 100 }],
            columnGroups: [{ id: 'g', label: 'x', children: [{ fieldId: 'ghost' }] }],
          },
          rows: [],
        }),
      ),
    ).toThrow(/column-groups/)
  })
})
```

（`DefaultGridEngine` 构造参数形态以现实现为准补齐——只补测试侧，缺 `backend` 等 DOM 概念时本测试在 engine 层不涉及。）

- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 实现**（见要点）；`index.ts` 导出 `ColumnGroup`/`ColumnGroupChild`（type-only）。
- [ ] **Step 4: 全量验证** — 重点 `tests/acceptance/rendering/` golden 帧测试零回归（无组路径 frame 无新字段或字段为 undefined）。
- [ ] **Step 5: Commit** — `feat(core): engine 接线列组——store 初始化/frame 组装缓存/selectColumnGroup`

### Task 6: 结构 mutation 一致性 + undo 快照

**Files:**

- Modify: `packages/core/src/kernel/undo/UndoCommand.ts`（`insertCols`/`deleteCols`/`moveCols` 三变体追加 `columnGroupsBefore?: ColumnGroupsSnapshot`、`columnGroupsAfter?: ColumnGroupsSnapshot`）、`packages/core/src/features/column/InsertColsCommandHandler.ts`、`DeleteColsCommandHandler.ts`、`MoveColsCommandHandler.ts`、`ColumnStructureUndoHandler.ts`、`packages/core/src/engine/DefaultGridEngine.ts`（handler ctx 注入 store 回调）
- Test: `packages/core/tests/engine/DefaultGridEngine.column-groups-structural.test.ts`

**Interfaces:**

- Consumes: Task 2 `ColumnGroupStore`/`ColumnGroupsSnapshot`、Task 5 engine 接线
- Produces: undo command 三变体的可选快照字段（**可选**保证既有序列化命令 JSON 兼容；无组时字段缺省不写入）

**实现要点：**

- 三个 command handler 在 mutation 成功路径调用 store 的 `applyInsertFields`/`applyDeleteFields`/`applyMoveFields`，并在 command 里记录 before/after 快照（有组时）；`ColumnStructureUndoHandler` undo/redo 分支按快照 `restore`。
- `MoveColsCommandHandler`（或其 engine 调用点）在执行前调 `isMoveWithinSameGroup`，false 则整体 no-op 返 `false`（**先于**任何 fields 变更，与现有"moveCols 返 boolean"路径一致）。
- 快照进 undo 后布局缓存必须失效（复用 Task 5 脏标记）。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'bun:test'
// makeEngine 同 Task 5 fixture（复制到本文件，两组 s1[s1c1,s1c2] s2[s2c1] + 无组 m，5 行）

describe('column groups × 结构 mutation', () => {
  it('deleteCols 级联移除空组，undo 完整恢复组树', () => {
    const engine = makeEngine()
    engine.deleteCols(['s1c1', 's1c2'])
    expect(engine.getColumnGroups().some((n) => 'id' in n && n.id === 's1')).toBe(false)
    engine.undo()
    const s1 = engine.getColumnGroups().find((n) => 'id' in n && n.id === 's1')
    expect(s1 && 'children' in s1 ? s1.children : []).toEqual([
      { fieldId: 's1c1' },
      { fieldId: 's1c2' },
    ])
  })

  it('moveCols 跨组 no-op 返 false，fields 与组树均不动', () => {
    const engine = makeEngine()
    const fieldsBefore = engine
      .getData()
      .getSchema()
      .fields.map((f) => f.id)
    expect(engine.moveCols(['s1c2'], 's2c1')).toBe(false)
    expect(
      engine
        .getData()
        .getSchema()
        .fields.map((f) => f.id),
    ).toEqual(fieldsBefore)
  })

  it('moveCols 同组内部成功且组叶序同步', () => {
    const engine = makeEngine()
    expect(engine.moveCols(['s1c2'], 's1c1')).toBe(true)
    const s1 = engine.getColumnGroups().find((n) => 'id' in n && n.id === 's1')
    expect(s1 && 'children' in s1 ? s1.children : []).toEqual([
      { fieldId: 's1c2' },
      { fieldId: 's1c1' },
    ])
  })

  it('insertCols 组内部归组、undo command JSON 纯数据往返', () => {
    const engine = makeEngine()
    engine.insertCols(2, 1) // s1c1 与 s1c2 之间
    const s1 = engine.getColumnGroups().find((n) => 'id' in n && n.id === 's1')
    expect(s1 && 'children' in s1 ? s1.children.length : 0).toBe(3)
    engine.undo()
    // undo 后组树复原且命令可 JSON 往返（沿用 undo 域现有 roundtrip 测试模式补一条含 columnGroups 快照的用例）
  })
})
```

（engine 公开方法名 `deleteCols`/`moveCols`/`insertCols`/`getColumnGroups` 以 Task 5 与现实现为准；若 engine 层签名不同于 facade 层，测试改走 engine 实际签名——STOP+ASK 优先于自行改名。）

- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 实现**（见要点）；undo 域现有 JSON roundtrip 测试文件补一条含 `columnGroupsBefore/After` 的用例。
- [ ] **Step 4: 全量验证** — 重点：undo 域全部既有测试零回归（可选字段不破 22 种命令契约）。
- [ ] **Step 5: Commit** — `feat(core): 结构 mutation 维护组树一致性——归组/级联移除/跨组 no-op/undo 快照`

### Task 7: 公开 API（Grid facade + scrollToGroup）

**Files:**

- Modify: `packages/core/src/Grid.ts`、`packages/core/src/dom/runtime/GridController.ts`、`packages/core/src/dom/runtime/GridControllerImpl.ts`、`packages/core/src/dom/runtime/controllers/ViewportController.ts`、`packages/core/src/dom/runtime/GridRuntime.ts`（wiring）
- Test: `packages/core/tests/dom/runtime/GridControllerImpl.column-groups.test.ts` + golden 更新
- Verify/Update: `packages/core/tests/acceptance/contract/plugin-api/__goldens__/core.type.public-api-inventory.golden.txt`（**预期 diff**：+`getColumnGroups`/`selectGroup`/`scrollToGroup` + 类型导出）

**Interfaces:**

- Consumes: Task 5 `engine.getColumnGroups()`/`selectColumnGroup`
- Produces（公开面）:

```ts
// Grid / GridController
getColumnGroups(): readonly ColumnGroupChild[]     // 直调 engine，无收尾
selectGroup(groupId: string): boolean              // engine.selectColumnGroup + true 时 afterEngineMutation()（选区变化要重绘）
scrollToGroup(groupId: string, align?: 'start' | 'center' | 'end'): void
```

**实现要点：**

- `selectGroup` 走 `GridControllerImpl` 直调 engine + 条件收尾（Task 10 语义先例：`true` 才收尾）。**注意**：selection 变化的收尾语义以现有 `setSelection` 实现为准逐字对齐（可能是 invalidate 而非 afterEngineMutation——照抄现状，不发明）。
- `scrollToGroup` 在 `ViewportController` 新增：`engine.getColumnGroups()` 树中找组 → 首个**可见**叶列 fieldId → 复用 `scrollToCell` 的横向映射路径；`align` 缺省 = ensure-visible（已可见不动，与 `scrollToCell` 一致），显式 `'start'|'center'|'end'` 时按列逻辑 x 强制对齐（镜像 `scrollToRow` 的 align 分支实现于横轴）。runtime 公开方法一行 delegate（GridRuntime 分解后的既有模式）。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it } from 'bun:test'
// 沿用 tests/dom/runtime/ 现有 GridControllerImpl 测试的装配 helper（makeHost/mock backend 惯例）,
// schema 带两组（同 Task 5 fixture），断言：
// 1. grid.getColumnGroups() 返回组树
// 2. grid.selectGroup('s1') === true 且 getSelection().selectedRange 为整列 [1,2]
// 3. grid.selectGroup('ghost') === false
// 4. grid.scrollToGroup('s2', 'start') 后 host scrollLeft 变化（或 engine scrollX 对齐 s2 首叶列逻辑 x）
// 5. 公开 API golden 重跑更新
```

（装配 helper 以 `tests/dom/runtime/GridControllerImpl.test.ts` 现有惯例为准；步骤 1 写出完整可运行测试。）

- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 实现**（见要点）；golden 重新生成并 review diff 仅含预期新增。
- [ ] **Step 4: 全量验证**。
- [ ] **Step 5: Commit** — `feat(core): 公开 getColumnGroups/selectGroup/scrollToGroup——BMS locateStack 等价物`

### Task 8: canvas2d 组头绘制

**Files:**

- Modify: `packages/canvas2d/src/painters/HeaderPainter.ts`（`HeaderPaintParams` 追加 `columnGroupHeader?: RenderFrameColumnGroupHeader`、`leafHeaderHeight?: number`）、`packages/canvas2d/src/render/Canvas2DRenderer.ts`（表头段传参 + 冻结段各画）
- Test: `packages/canvas2d/tests/painters/HeaderPainter.column-groups.test.ts`

**Interfaces:**

- Consumes: Task 5 frame 契约（`columnGroupHeader`、`viewport.leafHeaderHeight`）
- Produces: 无下游

**绘制规则（spec §3）：**

- 组行从 y=0 起每行高 `theme.metrics.groupHeaderRowHeight`；叶头行区在组行之下、高 `leafHeaderHeight`。
- 每个 `GroupHeaderCell` 画背景（`selected` 时用现有列头选中高亮 token，与整列选中列头一致）+ label（左对齐 + `…` 截断，复用现有截断工具）+ 底边与右边分隔线（现有 gridLine token）。
- **叶头伸满**：`leafTopRowByViewCol[viewCol] < depth` 的列，其叶头从 `topRow × groupHeaderRowHeight` 画到表头底（背景/文字垂直居中于整个伸满区）。
- **冻结分段**：Renderer 对冻结段与滚动段分别传 `x`/`scrollOffsetX`（现有 HeaderPainter 双段模式照抄），组 cell 与段列区间相交部分各画一次，label 左对齐 + clip 在段内可见区。
- 零硬编码：所有色值/字号/行高取 theme。

- [ ] **Step 1: 写失败测试** — `RecordingContext2D` 断言：两组 schema 下 (a) 组行画出两个 `fillRect` 区间与 `fillText` label；(b) 无组列叶头 `fillText` 的 y 居中于全表头高；(c) `selected: true` 的组 cell 用选中背景色 token；(d) 冻结 `leftCols: 1` 时冻结段重画组 cell 可见部分。测试装配沿用 `packages/canvas2d/tests/painters/` 现有 HeaderPainter 测试惯例，frame 用最小手工对象（含 `columnGroupHeader` 与 `viewport.headerHeight/leafHeaderHeight`）。
- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 实现**（见绘制规则）。
- [ ] **Step 4: 全量验证** — `bun test packages/canvas2d` + 全 workspace 测试；无组路径既有 header 测试零回归。
- [ ] **Step 5: Commit** — `feat(canvas2d): HeaderPainter 组头多行绘制——叶头伸满/选中高亮/冻结分段`

### Task 9: hit-test 分层 + 组头点击选组

**Files:**

- Modify: `packages/core/src/dom/runtime/controllers/InputController.ts`（[hitTestColumnHeader](packages/core/src/dom/runtime/controllers/InputController.ts#L310) 分层 + pointer 路由组头分支）、`packages/core/src/dom/runtime/GridRuntime.ts`（若 deps 需新增闭包）
- Test: `packages/core/tests/dom/runtime/controllers/InputController.column-groups.test.ts`

**Interfaces:**

- Consumes: frame `columnGroupHeader` + `viewport.leafHeaderHeight`、Task 5 `engine.selectColumnGroup`
- Produces:

```ts
// InputController 追加（供 pointer 路由消费；hitTestColumnHeader 语义不变但只在叶头行区命中）
hitTestGroupHeader(event: WebPointerEvent): { groupId: string } | null
```

**实现要点：** y ∈ `[0, headerHeight - leafHeaderHeight)` = 组头行区 → 按行号 `floor(y / groupHeaderRowHeight)` 与逻辑 x → view col → 在 `rows[rowIdx]` 二分/线性找覆盖该列的 cell（**注意**：`leafTopRowByViewCol[col] <= rowIdx` 的列该行没有组 cell——伸满叶头区域，返 null 落回叶头语义）；`hitTestColumnHeader` 原 `event.y < headerHeight` 判定改为 `y ∈ [headerHeight - leafHeaderHeight, headerHeight)`，或对伸满列放宽到其 `topRow` 起（**伸满列的整个伸满区都算叶头命中**——排序/菜单/整列选择行为对无组列不因组头行存在而改变）。pointer down 路由：组头命中 → `engine.selectColumnGroup(groupId)` + invalidate，优先于既有列头分支。列宽 resize 命中区仍锚表头底缘不变。

- [ ] **Step 1: 写失败测试** — 沿用 `InputController.test.ts` 现有 deps stub 惯例：frame stub 带 `columnGroupHeader`（depth 1、组 s1 覆盖 view [1,2]）与 `headerHeight/leafHeaderHeight`；断言 (a) y 在组头行、x 在 s1 区间 → `hitTestGroupHeader` 返 `{ groupId: 's1' }`；(b) 同 y 在无组列 x（伸满区）→ null 且 `hitTestColumnHeader` 命中该列；(c) y 在叶头行 → `hitTestGroupHeader` null；(d) pointer down 组头 → deps `selectColumnGroup` 被调。
- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 实现**（见要点）。**STOP+ASK 点：** 若现有 `hitTestColumnHeader` 的消费方（列头菜单按钮 hover、ColumnHeaderDrag、ContextMenuController）对"y 全表头区命中"有隐性依赖导致分层后行为回归，停下确认边界归属。
- [ ] **Step 4: 全量验证** — 重点列头菜单/col-reorder/整列选择既有测试全绿。
- [ ] **Step 5: Commit** — `feat(core): 表头 hit-test 分层——组头点击选整组,叶头语义不变`

### Task 10: BDD 7 场景转绿 + Storybook + 收尾

**Files:**

- Create: `packages/core/tests/acceptance/functional/column-groups/column-groups-bdd.test.ts`（模式照抄 `functional/data-ops/windowed-bdd.test.ts`：一场景一 describe，头注释标 scenario id）
- Modify: 7 条场景 MD `status: draft → implemented`；`apps/storybook/src/stories/ColumnGroups.stories.ts`（新建：BMS 形态 demo——两层组 + 冻结指标列 + 点组头/程序化 locate 按钮）
- Verify: `mbd validate` + `bun run manifest:mbd`；`lint:scenario-coverage` 不退化

- [ ] **Step 1: 写 BDD 测试（先跑红确认场景断言真实约束实现）** — 逐场景翻译 G/W/T 为断言（场景 MD 是契约，**测试期望与场景/spec 矛盾时 STOP+ASK，禁静默改期望**）：
  - `core.L0.column-groups-schema-validation` → 构造矩阵（Task 1 已罩纯函数，此处走 `new Grid`/engine 构造路径断言 throw 与合法通过）
  - `core.L2.grid-column-groups-frame-layout` → 嵌套 fixture 断言 frame 结构与总高（对照场景 Then 逐条）
  - `core.L2.grid-column-groups-hide-shrink` → hide/unhide 三步断言
  - `core.L2.grid-column-groups-select-group` → 四步断言（含 ⊇ 派生）
  - `core.L2.grid-column-groups-scroll-to-group` → 40 列 fixture 四步断言
  - `core.L2.grid-column-groups-structural-mutations` → 五步断言
  - `core.L2.grid-column-groups-bms-smoke` → 33 列 BMS fixture 全断言
- [ ] **Step 2: 全绿后场景 status 翻转** — 7 个 MD `status: implemented`；`cd packages/core && bun run lint:mbd && bun run manifest:mbd`。
- [ ] **Step 3: Storybook story** — 新建 `ColumnGroups.stories.ts`（BMS 形态数据 + `withExcelHeaders` 不启用、深色 theme 可选），确认 `bun run storybook` 手动可视验证组头/点选/定位。
- [ ] **Step 4: 四 gate 收尾** — `bun test` + `bun run --filter '*' typecheck` + `bun run lint` + `bun run --filter @novasheet/core build && bun run --filter @novasheet/canvas2d build` 全绿；`lint:scenario-coverage` 不退化。
- [ ] **Step 5: Commit** — `test(core): 列组表头 7 条 BDD 场景转绿,status draft → implemented`（story 若单独成形可拆 `feat(storybook):` 一枚）。

---

## Self-Review 记录

- **Spec 覆盖**：§2.1/2.2→Task 1；§2.3→Task 2/6；§3.1→Task 3/5；§3.2→Task 4；§3.3→Task 8（冻结分段）+ Task 5（缓存）；§4.1→Task 9；§4.2→Task 3/5；§5→Task 7；§6→Task 1/5/7 错误路径；§7→各 task 测试 + Task 10。无缺口。
- **类型一致性**：`ColumnGroupChild`/`ColumnGroupsSnapshot`/`RenderFrameColumnGroupHeader`/`leafTopRowByViewCol`/`leafHeaderHeight`/`selectColumnGroup` 全计划统一。
- **已知松散点（实施时按 STOP+ASK 或现状对齐）**：`assembleRenderFrame` 所在文件路径、engine 构造参数形态、`tests/dom/runtime` 装配 helper 细节、`ChunkedAxis` 测试构造签名——均标注"以现实现为准"，只许改测试 stub 不许迁就改实现。
