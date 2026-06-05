# Layout 抽离为 DefaultLayoutState 聚合根 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development（推荐）或
> superpowers:executing-plans 逐任务执行。步骤用 `- [ ]` 复选框跟踪。

**Goal:** 把 `DefaultGridEngine` 亲自持有的 layout 状态（rowsAxis/colsAxis/frozen/viewport）与 ~8 个
layout 私有方法抽成自持状态的 `DefaultLayoutState` 聚合根，engine 全部委派，纯重构零行为变化。

**Architecture:** 有状态聚合根（对称 row/column 内化）+ push 模型（engine 从结构 pull view axis 后
push 给 layout 重建，layout 不反调结构）+ 两阶段生命周期（默认值回调先于结构、`initView` 后于结构）。

**Tech Stack:** TypeScript（strict + verbatimModuleSyntax + noUncheckedIndexedAccess）、bun test、
`ChunkedAxis`/`FrozenRegions`/`Viewport`/`Theme`（`@novasheet/core`，平台无关）。

- Spec：`docs/superpowers/specs/2026-06-05-novasheet-layout-state-aggregate-design.md`
- 分支：`refactor-default-grid-engine-decomposition`（不新建分支）

---

## 工具链（NON-NEGOTIABLE）

- 包管理/运行：`bun`（≥1.2）。**禁用** npm/yarn/pnpm。
- 单文件测试：`bun test packages/core/tests/engine/layout/<file>.test.ts`。
- 全量回归：`bun test`（当前基线 **1017 pass / 0 fail**，不得回归）。
- Typecheck：`bun run --filter @novasheet/core typecheck`（结构改动后跑 `--filter '*'`）。
- Lint：`bun run lint`（0 warning）。
- 测试导入：`import { describe, expect, it } from 'bun:test'`（非 vitest）。
- Commit：Conventional Commit 英文前缀 + 中文 subject/正文；正文末行必须是：
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`。禁用 `--no-verify`。

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `packages/core/src/engine/layout/LayoutState.ts`（**重写**） | 富接口 `LayoutState` + `DefaultLayoutState` 实现；删除脱节的 `LayoutStateInput`（旧值接口）。 |
| `packages/core/tests/engine/layout/DefaultLayoutState.test.ts`（新建） | 聚合根隔离单元测试。 |
| `packages/core/src/engine/DefaultGridEngine.ts`（修改） | 删 4 字段 + 8 方法 + `DEFAULT_EXCEL_ROW_HEADER_WIDTH` 常量；改持 `private layout` 并全部委派。 |
| `packages/core/src/engine/layout/README.md`（修改） | 候选方法清单更新为「已抽离」。 |
| `packages/core/src/engine/README.md`（修改） | 第 6 步标 ✅，下一步候选改第 7 步。 |

## 现状基线（逐字对照，迁移须保行为）

`DEFAULT_EXCEL_ROW_HEADER_WIDTH = 44`（engine 现 line 82）。8 个待抽方法现状：
- `resolveDefaultRowHeight()`：`this.explicitDefaultRowHeight ?? this.theme.metrics.rowHeight`。
- `averageColWidth()`：`fields = schema.fields; if (fields.length===0) return 100; sum = Σ f.width; return Math.max(1, Math.round(sum/fields.length))`。
- `rebuildViewAxis()`：`rowsAxis = rowStructure.getViewRowsAxis(); snap = viewport.snapshot(); frozen = new FrozenRegions(rowsAxis, colsAxis, frozen.getFrozenConfig()); viewport = new Viewport(rowsAxis, colsAxis, frozen); viewport.setHeaderHeight(snap.headerHeight); setRowHeaderWidth(snap.rowHeaderWidth); setSize(snap.contentRect.width, snap.contentRect.height); setScroll(snap.scrollX, snap.scrollY)`。
- `rebuildViewColsAxis()`：同上但换 `colsAxis = columnStructure.getViewColsAxis()`。
- `resolveFrozenConfig(options)`：`{ topRows: frozen.topRows ?? 0, leftCols: frozen.leftCols ?? 0, rightCols: frozen.rightCols ?? 0 }`（`frozen = options.frozen ?? {}`）。
- `applySheetChrome()`：`gutter = excelHeaders ? Math.max(theme.metrics.rowHeaderWidth, 44) : 0; viewport.setRowHeaderWidth(gutter)`。
- `syncFrozenAfterColInsert(at, count)`：`cfg = frozen.getFrozenConfig(); oldTotalCols = schema.fields.length - count; let {leftCols, rightCols} = cfg; if (at < leftCols) leftCols += count; if (rightCols > 0 && at >= oldTotalCols - rightCols) rightCols += count; frozen.setFrozen({topRows: cfg.topRows, leftCols, rightCols})`。
- `syncFrozenAfterColDelete(removedIndices, totalColsBefore)`：`cfg = frozen.getFrozenConfig(); leftHit = removedIndices.filter(i=>i<cfg.leftCols).length; rightBoundary = totalColsBefore - cfg.rightCols; rightHit = removedIndices.filter(i=>i>=rightBoundary).length; frozen.setFrozen({topRows: cfg.topRows, leftCols: max(0, cfg.leftCols-leftHit), rightCols: max(0, cfg.rightCols-rightHit)})`。

构造序列（line ~210-214）：`rowsAxis = rowStructure.getViewRowsAxis(); colsAxis = columnStructure.getViewColsAxis(); frozen = new FrozenRegions(rowsAxis, colsAxis, resolveFrozenConfig(options)); viewport = new Viewport(rowsAxis, colsAxis, frozen); viewport.setHeaderHeight(theme.metrics.headerHeight); applySheetChrome()`。

`rebuildData`（line ~307-311）：同构造，但 frozen 用 `this.frozen.getFrozenConfig()`（**当前 live** 配置，非 options），viewport.setHeaderHeight 用 `theme.metrics.headerHeight`，尾随 `applySheetChrome()`。

> **关键不变量**：`initView` 首次（构造）用 options 派生配置；后续（setData）用当前 live frozen 配置。
> 两种 rebuild 语义不可混：`initView` 用 theme header + 默认尺寸；`rebuildRows/Cols` 保留 viewport snapshot。

---

## Task 1：`LayoutState` 接口 + `DefaultLayoutState` 构造 + 默认值派生

**Files:**
- Modify（整体重写）：`packages/core/src/engine/layout/LayoutState.ts`
- Test：`packages/core/tests/engine/layout/DefaultLayoutState.test.ts`

- [ ] **Step 1：写失败测试（默认值派生）**

`packages/core/tests/engine/layout/DefaultLayoutState.test.ts`：

```ts
import { describe, expect, it } from 'bun:test'
import { DefaultLayoutState } from '../../../src/engine/layout/LayoutState'
import { denseGridTheme } from '../../../src/theme/denseGridTheme'
import type { Schema } from '../../../src/data/Schema'

function schemaOf(widths: readonly number[]): Schema {
  return { fields: widths.map((w, i) => ({ id: `f${i}`, name: `F${i}`, type: 'text', width: w })) }
}

function makeLayout(opts?: {
  explicitDefaultRowHeight?: number
  excelHeaders?: boolean
  frozenInput?: { topRows?: number; leftCols?: number; rightCols?: number }
  widths?: readonly number[]
}) {
  return new DefaultLayoutState({
    theme: denseGridTheme,
    explicitDefaultRowHeight: opts?.explicitDefaultRowHeight,
    excelHeaders: opts?.excelHeaders ?? false,
    frozenInput: opts?.frozenInput,
    getSchema: () => schemaOf(opts?.widths ?? [100, 100, 100]),
  })
}

describe('DefaultLayoutState 默认值派生', () => {
  it('resolveDefaultRowHeight：显式优先，否则取 theme', () => {
    expect(makeLayout({ explicitDefaultRowHeight: 32 }).resolveDefaultRowHeight()).toBe(32)
    expect(makeLayout().resolveDefaultRowHeight()).toBe(denseGridTheme.metrics.rowHeight)
  })

  it('averageColWidth：四舍五入平均，下界 1，空 schema 返回 100', () => {
    expect(makeLayout({ widths: [80, 100, 120] }).averageColWidth()).toBe(100)
    expect(makeLayout({ widths: [10, 11] }).averageColWidth()).toBe(11) // round(10.5)=11(银行家舍入不适用，JS Math.round)
    expect(makeLayout({ widths: [] }).averageColWidth()).toBe(100)
  })
})
```

- [ ] **Step 2：跑测试看红**

Run：`bun test packages/core/tests/engine/layout/DefaultLayoutState.test.ts`
Expected：FAIL（`DefaultLayoutState` 未导出 / 类型不符）。

- [ ] **Step 3：重写 `LayoutState.ts`（仅构造 + 默认值，视图方法占位下一任务补全——但本步先放完整接口与构造）**

整体替换 `packages/core/src/engine/layout/LayoutState.ts`：

```ts
import type { ChunkedAxis } from '../../layout/ChunkedAxis'
import { FrozenRegions } from '../../layout/FrozenRegions'
import type { FrozenConfig } from '../../layout/FrozenRegions'
import { Viewport } from '../../layout/Viewport'
import type { Theme } from '../../theme/Theme'
import type { Schema } from '../../data/Schema'

/** 构造 `DefaultLayoutState` 所需输入：theme/schema 派生，不含 axes（两阶段生命周期第一阶段）。 */
export interface LayoutStateInput {
  readonly theme: Theme
  readonly explicitDefaultRowHeight: number | undefined
  readonly excelHeaders: boolean
  readonly frozenInput: Partial<FrozenConfig> | undefined
  readonly getSchema: () => Schema
}

/**
 * Layout 领域聚合根：自持 view axes + frozen + viewport，并集中 layout 初始化/rebuild 规则。
 *
 * 两阶段生命周期：构造后即可答默认值派生（`resolveDefaultRowHeight`/`averageColWidth`，供 row/column
 * 结构构造回调）；待结构产出 view axis 后调 `initView` 装配 frozen+viewport。push 模型：engine 把
 * 结构 pull 出的 view axis 传入，本领域不反调 row/column。
 */
export interface LayoutState {
  resolveDefaultRowHeight(): number
  averageColWidth(): number
  initView(rowsAxis: ChunkedAxis, colsAxis: ChunkedAxis): void
  rebuildRows(rowsAxis: ChunkedAxis): void
  rebuildCols(colsAxis: ChunkedAxis): void
  applyTheme(theme: Theme): void
  remapFrozenAfterColInsert(at: number, count: number, oldTotalCols: number): void
  remapFrozenAfterColDelete(removedIndices: readonly number[], totalColsBefore: number): void
  setFrozenConfig(config: Partial<FrozenConfig>): void
  setViewportSize(width: number, height: number): void
  setScroll(logicalX: number, logicalY: number): void
  setHeaderHeight(headerHeight: number): void
  getRowsAxis(): ChunkedAxis
  getColsAxis(): ChunkedAxis
  getViewport(): Viewport
  getFrozenConfig(): FrozenConfig
}

export class DefaultLayoutState implements LayoutState {
  private theme: Theme
  private readonly explicitDefaultRowHeight: number | undefined
  private readonly excelHeaders: boolean
  private readonly getSchema: () => Schema
  private readonly initialFrozenConfig: FrozenConfig
  private viewInitialized = false
  private rowsAxis!: ChunkedAxis
  private colsAxis!: ChunkedAxis
  private frozen!: FrozenRegions
  private viewport!: Viewport

  constructor(input: LayoutStateInput) {
    this.theme = input.theme
    this.explicitDefaultRowHeight = input.explicitDefaultRowHeight
    this.excelHeaders = input.excelHeaders
    this.getSchema = input.getSchema
    const f = input.frozenInput ?? {}
    this.initialFrozenConfig = {
      topRows: f.topRows ?? 0,
      leftCols: f.leftCols ?? 0,
      rightCols: f.rightCols ?? 0,
    }
  }

  resolveDefaultRowHeight(): number {
    return this.explicitDefaultRowHeight ?? this.theme.metrics.rowHeight
  }

  averageColWidth(): number {
    const fields = this.getSchema().fields
    if (fields.length === 0) return 100
    const sum = fields.reduce((acc, field) => acc + field.width, 0)
    return Math.max(1, Math.round(sum / fields.length))
  }

  // 以下视图方法在 Task 2 / Task 3 实现；本任务先抛错占位以保证类型完整、测试聚焦默认值。
  initView(): void {
    throw new Error('not implemented')
  }
  rebuildRows(): void {
    throw new Error('not implemented')
  }
  rebuildCols(): void {
    throw new Error('not implemented')
  }
  applyTheme(): void {
    throw new Error('not implemented')
  }
  remapFrozenAfterColInsert(): void {
    throw new Error('not implemented')
  }
  remapFrozenAfterColDelete(): void {
    throw new Error('not implemented')
  }
  setFrozenConfig(): void {
    throw new Error('not implemented')
  }
  setViewportSize(): void {
    throw new Error('not implemented')
  }
  setScroll(): void {
    throw new Error('not implemented')
  }
  setHeaderHeight(): void {
    throw new Error('not implemented')
  }
  getRowsAxis(): ChunkedAxis {
    return this.rowsAxis
  }
  getColsAxis(): ChunkedAxis {
    return this.colsAxis
  }
  getViewport(): Viewport {
    return this.viewport
  }
  getFrozenConfig(): FrozenConfig {
    return this.frozen.getFrozenConfig()
  }
}
```

> 注：占位 `throw new Error('not implemented')` 的方法签名故意省略参数（接口已定义参数），实现任务会补全。
> `DEFAULT_EXCEL_ROW_HEADER_WIDTH` 常量于 Task 2（`applySheetChrome` 实现处）再引入，避免本任务出现未使用常量。

- [ ] **Step 4：跑测试看绿**

Run：`bun test packages/core/tests/engine/layout/DefaultLayoutState.test.ts`
Expected：PASS（2 个 it）。

- [ ] **Step 5：typecheck + lint**

Run：`bun run --filter @novasheet/core typecheck && bun run lint`
Expected：均 exit 0。（注意：旧 `LayoutStateInput` 字段被删，但旧 `LayoutState.ts` 是孤儿无引用，typecheck 应通过；若有引用报错→停并报告。）

- [ ] **Step 6：commit**

```bash
git add packages/core/src/engine/layout/LayoutState.ts packages/core/tests/engine/layout/DefaultLayoutState.test.ts
git commit -m "$(printf 'feat(core): 新增 DefaultLayoutState 聚合根骨架与默认值派生\n\nLayoutState 富接口 + 构造 + resolveDefaultRowHeight/averageColWidth(对称 row/column\n内化的两阶段生命周期第一阶段);视图方法占位待补。替换脱节的旧 LayoutStateInput 值接口。\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2：`initView` + `rebuildRows`/`rebuildCols` + viewport mutator + getter + `setFrozenConfig`

**Files:**
- Modify：`packages/core/src/engine/layout/LayoutState.ts`
- Test：`packages/core/tests/engine/layout/DefaultLayoutState.test.ts`

- [ ] **Step 1：写失败测试（视图装配 + rebuild 保留 snapshot + frozen 配置来源）**

追加到 `DefaultLayoutState.test.ts`（顶部补 import）：

```ts
import { ChunkedAxis } from '../../../src/layout/ChunkedAxis'

function axis(count: number, defaultSize: number): ChunkedAxis {
  return new ChunkedAxis({ count, defaultSize })
}

describe('DefaultLayoutState 视图装配与 rebuild', () => {
  it('initView：装配 viewport（theme header）+ frozen（首次用 initial 配置）', () => {
    const layout = makeLayout({ frozenInput: { leftCols: 1 } })
    layout.initView(axis(10, 24), axis(3, 100))
    expect(layout.getFrozenConfig()).toEqual({ topRows: 0, leftCols: 1, rightCols: 0 })
    expect(layout.getViewport().snapshot().headerHeight).toBe(denseGridTheme.metrics.headerHeight)
    expect(layout.getRowsAxis().getTotalSize()).toBe(10 * 24)
    expect(layout.getColsAxis().getTotalSize()).toBe(3 * 100)
  })

  it('rebuildRows：换 rowsAxis 并保留 viewport snapshot（size/scroll/header）', () => {
    const layout = makeLayout()
    layout.initView(axis(10, 24), axis(3, 100))
    layout.setViewportSize(300, 200)
    layout.setScroll(0, 50)
    layout.setHeaderHeight(40)
    layout.rebuildRows(axis(20, 24))
    const snap = layout.getViewport().snapshot()
    expect(layout.getRowsAxis().getTotalSize()).toBe(20 * 24)
    expect(snap.contentRect).toEqual({ width: 300, height: 200 })
    expect(snap.scrollY).toBe(50)
    expect(snap.headerHeight).toBe(40)
  })

  it('rebuildCols：换 colsAxis 并保留 snapshot', () => {
    const layout = makeLayout()
    layout.initView(axis(10, 24), axis(3, 100))
    layout.setViewportSize(300, 200)
    layout.rebuildCols(axis(5, 100))
    expect(layout.getColsAxis().getTotalSize()).toBe(5 * 100)
    expect(layout.getViewport().snapshot().contentRect).toEqual({ width: 300, height: 200 })
  })

  it('initView 二次调用（setData 语义）：用当前 live frozen 配置而非 initial', () => {
    const layout = makeLayout({ frozenInput: { leftCols: 1 } })
    layout.initView(axis(10, 24), axis(3, 100))
    layout.setFrozenConfig({ leftCols: 2 })
    layout.initView(axis(8, 24), axis(4, 100)) // 模拟 setData 重新装配
    expect(layout.getFrozenConfig()).toEqual({ topRows: 0, leftCols: 2, rightCols: 0 })
  })

  it('excelHeaders：initView 后 row-header gutter 取 max(theme, 44)', () => {
    const layout = makeLayout({ excelHeaders: true })
    layout.initView(axis(10, 24), axis(3, 100))
    const expected = Math.max(denseGridTheme.metrics.rowHeaderWidth, 44)
    expect(layout.getViewport().snapshot().rowHeaderWidth).toBe(expected)
  })
})
```

- [ ] **Step 2：跑测试看红**

Run：`bun test packages/core/tests/engine/layout/DefaultLayoutState.test.ts`
Expected：FAIL（`not implemented`）。

- [ ] **Step 3：实现视图方法**

先在文件顶部 import 区之后新增常量（`applySheetChrome` 用）：

```ts
/** excel 风格 row header 的最小 gutter 宽度（与抽离前 engine 常量一致）。 */
const DEFAULT_EXCEL_ROW_HEADER_WIDTH = 44
```

再在 `DefaultLayoutState` 中，用下列实现**替换**对应占位方法：

```ts
  initView(rowsAxis: ChunkedAxis, colsAxis: ChunkedAxis): void {
    const config = this.viewInitialized ? this.frozen.getFrozenConfig() : this.initialFrozenConfig
    this.viewInitialized = true
    this.rowsAxis = rowsAxis
    this.colsAxis = colsAxis
    this.frozen = new FrozenRegions(rowsAxis, colsAxis, config)
    this.viewport = new Viewport(rowsAxis, colsAxis, this.frozen)
    this.viewport.setHeaderHeight(this.theme.metrics.headerHeight)
    this.applySheetChrome()
  }

  rebuildRows(rowsAxis: ChunkedAxis): void {
    this.rowsAxis = rowsAxis
    this.recreateViewportPreserving()
  }

  rebuildCols(colsAxis: ChunkedAxis): void {
    this.colsAxis = colsAxis
    this.recreateViewportPreserving()
  }

  setFrozenConfig(config: Partial<FrozenConfig>): void {
    this.frozen.setFrozen(config)
  }

  setViewportSize(width: number, height: number): void {
    this.viewport.setSize(width, height)
  }

  setScroll(logicalX: number, logicalY: number): void {
    this.viewport.setScroll(logicalX, logicalY)
  }

  setHeaderHeight(headerHeight: number): void {
    this.viewport.setHeaderHeight(headerHeight)
  }

  /** 重建 frozen+viewport，保留当前 viewport 的 header/gutter/尺寸/滚动（mutation 路径用）。 */
  private recreateViewportPreserving(): void {
    const snap = this.viewport.snapshot()
    this.frozen = new FrozenRegions(this.rowsAxis, this.colsAxis, this.frozen.getFrozenConfig())
    this.viewport = new Viewport(this.rowsAxis, this.colsAxis, this.frozen)
    this.viewport.setHeaderHeight(snap.headerHeight)
    this.viewport.setRowHeaderWidth(snap.rowHeaderWidth)
    this.viewport.setSize(snap.contentRect.width, snap.contentRect.height)
    this.viewport.setScroll(snap.scrollX, snap.scrollY)
  }

  /** excel 风格 row header gutter（与抽离前 engine `applySheetChrome` 一致）。 */
  private applySheetChrome(): void {
    const gutter = this.excelHeaders
      ? Math.max(this.theme.metrics.rowHeaderWidth, DEFAULT_EXCEL_ROW_HEADER_WIDTH)
      : 0
    this.viewport.setRowHeaderWidth(gutter)
  }
```

- [ ] **Step 4：跑测试看绿**

Run：`bun test packages/core/tests/engine/layout/DefaultLayoutState.test.ts`
Expected：PASS（默认值 2 + 视图 5 = 7 it）。

- [ ] **Step 5：typecheck + lint**

Run：`bun run --filter @novasheet/core typecheck && bun run lint`
Expected：exit 0。

- [ ] **Step 6：commit**

```bash
git add packages/core/src/engine/layout/LayoutState.ts packages/core/tests/engine/layout/DefaultLayoutState.test.ts
git commit -m "$(printf 'feat(core): DefaultLayoutState 视图装配 initView + rebuildRows/Cols + viewport 委派\n\ninitView 首次用 initial 冻结配置、后续用 live 配置(对应 setData);rebuildRows/Cols 经\n共享 recreateViewportPreserving 重建并保留 viewport snapshot,消除原 rebuildViewAxis/\nrebuildViewColsAxis 两份复制。setFrozenConfig/setViewportSize/setScroll/setHeaderHeight\n委派 viewport;applySheetChrome 内化。\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3：`applyTheme` + `remapFrozenAfterColInsert`/`remapFrozenAfterColDelete`

**Files:**
- Modify：`packages/core/src/engine/layout/LayoutState.ts`
- Test：`packages/core/tests/engine/layout/DefaultLayoutState.test.ts`

- [ ] **Step 1：写失败测试**

追加：

```ts
describe('DefaultLayoutState applyTheme 与 frozen remap', () => {
  it('applyTheme：换 theme header + 重算 excel gutter', () => {
    const layout = makeLayout({ excelHeaders: true })
    layout.initView(axis(10, 24), axis(3, 100))
    const themed = {
      ...denseGridTheme,
      metrics: { ...denseGridTheme.metrics, headerHeight: 99, rowHeaderWidth: 60 },
    }
    layout.applyTheme(themed)
    const snap = layout.getViewport().snapshot()
    expect(snap.headerHeight).toBe(99)
    expect(snap.rowHeaderWidth).toBe(Math.max(60, 44))
  })

  it('remapFrozenAfterColInsert：插入落在左冻结区内 → leftCols 增长', () => {
    const layout = makeLayout({ frozenInput: { leftCols: 2, rightCols: 1 } })
    layout.initView(axis(10, 24), axis(5, 100))
    // 在 at=1 插 2 列；oldTotalCols=5。at(1) < leftCols(2) → left+2；rightCols>0 且 at(1) >= 5-1=4? 否。
    layout.remapFrozenAfterColInsert(1, 2, 5)
    expect(layout.getFrozenConfig()).toEqual({ topRows: 0, leftCols: 4, rightCols: 1 })
  })

  it('remapFrozenAfterColInsert：插入落在右冻结边界 → rightCols 增长', () => {
    const layout = makeLayout({ frozenInput: { leftCols: 1, rightCols: 2 } })
    layout.initView(axis(10, 24), axis(6, 100))
    // at=5 插 1 列；oldTotalCols=6；at(5) < left(1)? 否。right>0 且 at(5) >= 6-2=4 → right+1。
    layout.remapFrozenAfterColInsert(5, 1, 6)
    expect(layout.getFrozenConfig()).toEqual({ topRows: 0, leftCols: 1, rightCols: 3 })
  })

  it('remapFrozenAfterColDelete：删除命中左右冻结区 → 各自收缩，下界 0', () => {
    const layout = makeLayout({ frozenInput: { leftCols: 2, rightCols: 2 } })
    layout.initView(axis(10, 24), axis(6, 100))
    // totalColsBefore=6；删 [0, 5]：left 命中 idx<2 → 1 个；rightBoundary=6-2=4，idx>=4 → 1 个。
    layout.remapFrozenAfterColDelete([0, 5], 6)
    expect(layout.getFrozenConfig()).toEqual({ topRows: 0, leftCols: 1, rightCols: 1 })
  })
})
```

- [ ] **Step 2：跑测试看红**

Run：`bun test packages/core/tests/engine/layout/DefaultLayoutState.test.ts`
Expected：FAIL（`not implemented`）。

- [ ] **Step 3：实现**

替换对应占位方法：

```ts
  applyTheme(theme: Theme): void {
    this.theme = theme
    this.viewport.setHeaderHeight(theme.metrics.headerHeight)
    this.applySheetChrome()
  }

  remapFrozenAfterColInsert(at: number, count: number, oldTotalCols: number): void {
    const cfg = this.frozen.getFrozenConfig()
    let { leftCols, rightCols } = cfg
    if (at < leftCols) leftCols += count
    if (rightCols > 0 && at >= oldTotalCols - rightCols) rightCols += count
    this.frozen.setFrozen({ topRows: cfg.topRows, leftCols, rightCols })
  }

  remapFrozenAfterColDelete(removedIndices: readonly number[], totalColsBefore: number): void {
    const cfg = this.frozen.getFrozenConfig()
    const leftHit = removedIndices.filter((idx) => idx < cfg.leftCols).length
    const rightBoundary = totalColsBefore - cfg.rightCols
    const rightHit = removedIndices.filter((idx) => idx >= rightBoundary).length
    this.frozen.setFrozen({
      topRows: cfg.topRows,
      leftCols: Math.max(0, cfg.leftCols - leftHit),
      rightCols: Math.max(0, cfg.rightCols - rightHit),
    })
  }
```

- [ ] **Step 4：跑测试看绿**

Run：`bun test packages/core/tests/engine/layout/DefaultLayoutState.test.ts`
Expected：PASS（共 11 it）。

- [ ] **Step 5：typecheck + lint**

Run：`bun run --filter @novasheet/core typecheck && bun run lint`
Expected：exit 0。聚合根此时**完整且无占位**。

- [ ] **Step 6：commit**

```bash
git add packages/core/src/engine/layout/LayoutState.ts packages/core/tests/engine/layout/DefaultLayoutState.test.ts
git commit -m "$(printf 'feat(core): DefaultLayoutState applyTheme 与 frozen 配置 remap\n\napplyTheme 换 theme header + 重算 chrome;remapFrozenAfterColInsert/Delete 内化原\nsyncFrozenAfterCol*(oldTotalCols/totalColsBefore 改由调用方显式传入)。聚合根完整。\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 4：engine 接线（原子替换，删 4 字段 + 8 方法 + 常量，全部委派）

**Files:**
- Modify：`packages/core/src/engine/DefaultGridEngine.ts`

> 本任务一次性替换 engine 内部至委派 `layout`，因删字段会同时断开所有读点，须原子完成；typecheck 是兜底。
> **不改任何外部行为**；逐点对照「现状基线」。

- [ ] **Step 1：构造 `layout` 并替换字段**

1. 删除字段声明（现 line ~93/94/101/102）：`private rowsAxis: ChunkedAxis`、`private colsAxis: ChunkedAxis`、
   `private frozen: FrozenRegions`、`private viewport: Viewport`。新增：`private readonly layout: DefaultLayoutState`。
2. 顶部 import：`import { DefaultLayoutState } from './layout/LayoutState'`。删除现 line 82 的
   `const DEFAULT_EXCEL_ROW_HEADER_WIDTH = 44`（已移入 LayoutState.ts）。
3. 构造函数（现 line ~205-214）改为：先建 layout，再用其默认值回调建结构，最后 `initView`：

```ts
    this.layout = new DefaultLayoutState({
      theme: this.theme,
      explicitDefaultRowHeight: this.explicitDefaultRowHeight,
      excelHeaders: this.excelHeaders,
      frozenInput: options.frozen,
      getSchema: () => this.rawData.getSchema(),
    })
    this.rowStructure = new DefaultRowStructure(this.rawData, () => this.layout.resolveDefaultRowHeight())
    // …（columnStructure 同理，回调改 () => this.layout.averageColWidth()）…
    this.data = this.columnStructure.getColViewData(this.rowStructure.getRowViewData())
    this.layout.initView(this.rowStructure.getViewRowsAxis(), this.columnStructure.getViewColsAxis())
    this.applySheetChrome() // ← 删除此行（initView 已含 chrome）
```

> 注意：构造函数中 `rowStructure`/`columnStructure`/`moveRowsCommand` 等的创建顺序须保持；只把
> `() => this.resolveDefaultRowHeight()` → `() => this.layout.resolveDefaultRowHeight()`、
> `() => this.averageColWidth()` → `() => this.layout.averageColWidth()`，并把原 `rowsAxis/colsAxis/frozen/
> viewport` 四行赋值 + `setHeaderHeight` + `applySheetChrome()` 整体替换为单行 `this.layout.initView(...)`。
> `viewport.setHeaderHeight(this.theme.metrics.headerHeight)` 由 initView 内部完成，勿重复。

- [ ] **Step 2：替换 `rebuildData` / `setTheme` / 列插删 / viewport mutator / undo ctx / getFrame / 读取面**

逐点替换（对照「现状基线」，仅改持有方，行为不变）：

| 现状 | 改为 |
| --- | --- |
| `rebuildData` 尾段 4 行 axis/frozen/viewport + setHeaderHeight + `applySheetChrome()`（line ~307-311） | `this.layout.initView(this.rowStructure.getViewRowsAxis(), this.columnStructure.getViewColsAxis())` |
| `setTheme` 中 `this.viewport.setHeaderHeight(theme.metrics.headerHeight)` + `this.applySheetChrome()`（line 317） | `this.layout.applyTheme(theme)` |
| `setTheme` 中 `this.rebuildViewAxis()`（line ~321，无显式行高分支） | `this.layout.rebuildRows(this.rowStructure.getViewRowsAxis())` |
| `setFrozen` → `this.frozen.setFrozen(config)`（line 326） | `this.layout.setFrozenConfig(config)` |
| `setViewportSize` → `this.viewport.setSize(...)`（line 330） | `this.layout.setViewportSize(width, height)` |
| `setHeaderHeight` → `this.viewport.setHeaderHeight(...)`（line 334） | `this.layout.setHeaderHeight(headerHeight)` |
| `setScroll` → `this.viewport.setScroll(...)`（line 338） | `this.layout.setScroll(logicalX, logicalY)` |
| `getFrame`：`this.viewport.snapshot()` / `this.rowsAxis.*` / `this.colsAxis.*` / `rowsAxis: this.rowsAxis` / `colsAxis: this.colsAxis`（line 441-481） | 取 `const rowsAxis = this.layout.getRowsAxis()`、`const colsAxis = this.layout.getColsAxis()`、`const vpSnap = this.layout.getViewport().snapshot()`，函数内全部改用这三个局部变量 |
| `getRowsTotalSize` → `this.rowsAxis.getTotalSize()`（line 497） | `this.layout.getRowsAxis().getTotalSize()` |
| `getColsTotalSize` → `this.colsAxis.getTotalSize()`（line 501） | `this.layout.getColsAxis().getTotalSize()` |
| `getRowsAxis()` → `return this.rowsAxis`（line 513） | `return this.layout.getRowsAxis()` |
| `getColsAxis()` → `return this.colsAxis`（line 517） | `return this.layout.getColsAxis()` |
| `getViewport()` → `return this.viewport`（line 521） | `return this.layout.getViewport()` |
| `insertCols` 内 `this.frozen.getFrozenConfig()`（frozenBefore/After，line 694/700） | `this.layout.getFrozenConfig()` |
| `insertCols` 内 `this.syncFrozenAfterColInsert(event.at, event.count)`（line 697） | `this.layout.remapFrozenAfterColInsert(event.at, event.count, this.rawData.getSchema().fields.length - event.count)` |
| `insertCols` 内 `this.rebuildViewColsAxis()`（line 698） | `this.layout.rebuildCols(this.columnStructure.getViewColsAxis())` |
| `deleteCols` 内 `this.frozen.getFrozenConfig()`（line 723/730） | `this.layout.getFrozenConfig()` |
| `deleteCols` 内 `this.syncFrozenAfterColDelete(event.removedIndices, totalColsBefore)`（line 727） | `this.layout.remapFrozenAfterColDelete(event.removedIndices, totalColsBefore)` |
| `deleteCols` 内 `this.rebuildViewColsAxis()`（line 728） | `this.layout.rebuildCols(this.columnStructure.getViewColsAxis())` |
| `getFrozenConfig()` → `return this.frozen.getFrozenConfig()`（line 809） | `return this.layout.getFrozenConfig()` |
| undo ctx：`restoreFrozen: (config) => this.frozen.setFrozen(config)`（line 273） | `restoreFrozen: (config) => this.layout.setFrozenConfig(config)` |
| undo ctx：`rebuildRows: () => this.rebuildViewAxis()`（line 262，RowStructure ctx） | `rebuildRows: () => this.layout.rebuildRows(this.rowStructure.getViewRowsAxis())` |
| undo ctx：`rebuildCols: () => this.rebuildViewColsAxis()`（line 243/274，Column/ColumnStructure ctx 两处） | `rebuildCols: () => this.layout.rebuildCols(this.columnStructure.getViewColsAxis())` |
| RowUndo ctx：`rebuildRows: () => this.rebuildViewAxis()` | 同上改 `this.layout.rebuildRows(this.rowStructure.getViewRowsAxis())` |
| ColumnUndo ctx：`rebuildCols: () => this.rebuildViewColsAxis()` | 同上改 `this.layout.rebuildCols(this.columnStructure.getViewColsAxis())` |

> **逐一 grep 兜底**：替换后 `grep -nE "this\.(rowsAxis|colsAxis|frozen|viewport)\b" packages/core/src/engine/DefaultGridEngine.ts`
> 必须**零命中**（除 import 行外）。`grep -nE "rebuildViewAxis|rebuildViewColsAxis|syncFrozenAfterCol|applySheetChrome|resolveFrozenConfig|resolveDefaultRowHeight|averageColWidth"` 同样应零命中（方法将于 Step 3 删除）。

- [ ] **Step 3：删除 8 个迁移后变 dead 的私有方法**

删除：`resolveDefaultRowHeight`、`rebuildViewAxis`、`rebuildViewColsAxis`、`syncFrozenAfterColInsert`、
`syncFrozenAfterColDelete`、`resolveFrozenConfig`、`averageColWidth`、`applySheetChrome`。删后清理不再使用的
import（如 `FrozenRegions`、`Viewport`、`FrozenConfig` 若 engine 内已无其他引用——由 typecheck/lint 提示）。

> 谨慎：`Viewport`/`ChunkedAxis`/`FrozenConfig`/`FrozenRegions` 可能仍被 `getRowsAxis(): ChunkedAxis` 等
> 返回类型或其他方法引用。**按 typecheck/lint 实际报错删 import**，不要凭空删。

- [ ] **Step 4：跑全量回归**

Run：`bun test`
Expected：**1017 pass / 0 fail**（零行为变化）。重点关注既有回归测试：
`DefaultGridEngine.row-undo-redo-rebuild.test.ts`（resize/hide redo viewport 不陈旧）、
`DefaultGridEngine.format-merge-structural-undo.test.ts`、`DefaultGridEngine.merge.test.ts`、getFrame 相关。
若任何失败 → **停并报告**，对照「现状基线」逐点核次序/参数（尤其 initView 的 frozen 配置来源、insertCols 的
`oldTotalCols = fields.length - event.count`）。

- [ ] **Step 5：typecheck（4 包）+ lint**

Run：`bun run --filter '*' typecheck && bun run lint`
Expected：4 包 exit 0、lint exit 0。

- [ ] **Step 6：commit**

```bash
git add packages/core/src/engine/DefaultGridEngine.ts
git commit -m "$(printf 'refactor(core): DefaultGridEngine 委派 DefaultLayoutState，删 layout 字段与方法\n\nengine 删 rowsAxis/colsAxis/frozen/viewport 四字段 + 8 个 layout 私有方法 +\nDEFAULT_EXCEL_ROW_HEADER_WIDTH 常量,改持 layout 并全部委派(构造 initView、rebuildData、\nsetTheme、列插删 frozen remap、viewport mutator、undo ctx rebuild/restoreFrozen、\ngetFrame/读取面)。纯重构零行为变化,1017 测试不回归。\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 5：文档收尾

**Files:**
- Modify：`packages/core/src/engine/layout/README.md`
- Modify：`packages/core/src/engine/README.md`

- [ ] **Step 1：更新 `engine/layout/README.md`**

把「当前位于 `DefaultGridEngine` 中的候选方法」清单改为「已抽离至 `DefaultLayoutState`」，并说明 push 模型
与两阶段生命周期（构造默认值 → `initView` 装配视图）。

- [ ] **Step 2：更新 `engine/README.md`**

「重构总进度」表第 6 步状态由 ⬜ 改 ✅，说明：`DefaultLayoutState` 聚合根自持 rowsAxis/colsAxis/frozen/
viewport，engine 委派，消除 rebuildViewAxis/rebuildViewColsAxis 重复。「下一步候选」改为第 7 步（接线
`format/FormatState`）。「迁移顺序」第 6 项标 ✅。

- [ ] **Step 3：lint + commit**

```bash
git add packages/core/src/engine/layout/README.md packages/core/src/engine/README.md
git commit -m "$(printf 'docs(core): engine/layout README 标记第6步(layout 抽离)完成\n\nDefaultLayoutState 聚合根接管 layout 初始化/rebuild;候选方法清单标已抽离;engine\n重构进度第6步标 ✅,下一步候选改第7步。\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## 最终验收（全部任务后）

- `DefaultGridEngine` 无 `rowsAxis`/`colsAxis`/`frozen`/`viewport` 字段与 8 个 layout 私有方法；改持 `layout` 委派。
- `rebuildViewAxis`/`rebuildViewColsAxis` 重复消除（聚合根内单一 `recreateViewportPreserving`）。
- `DefaultLayoutState` 隔离单元测试 11 it 全绿；全量 **1017 pass / 0 fail** 不回归；4 包 typecheck、lint 全绿。
- 派发最终 code-reviewer 子代理复核（CLAUDE.md：里程碑后终审），重点：构造序列、两种 rebuild 语义、
  initView 的 frozen 配置来源、insertCols 的 `oldTotalCols` 计算。

## 自检（plan self-review）

- **Spec 覆盖**：聚合根形态/push 模型/两阶段生命周期/并入三项（frozen remap、frozenConfig+chrome 初始化、
  theme 默认值）/接口面 13 方法 → Task 1-3 全实现；engine 删字段+8 方法+委派 → Task 4；脱节 `LayoutStateInput`
  删除 → Task 1；零行为变化回归 → Task 4 Step 4。覆盖完整。
- **占位符扫描**：无 TBD/TODO；Task 1 的 `not implemented` 是 TDD 中间态，Task 2/3 明确替换；`_excelGutter`
  临时字段在 Task 2 Step 3 明示删除。
- **类型一致**：`LayoutState` 13 方法签名在 Task 1 接口定义，Task 2/3 实现签名逐一对应；engine 委派调用
  （`getRowsAxis`/`getViewport`/`rebuildRows`/`rebuildCols`/`setFrozenConfig`/`remapFrozenAfterCol*`/
  `applyTheme`/`initView`）与接口名一致。
- **歧义点已标 STOP**：Task 1 Step 5（旧 LayoutStateInput 引用）、Task 4 Step 4（回归失败逐点对拍）。
