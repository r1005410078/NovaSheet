# 行列拖拽排序能力包实施计划

> **给 agentic worker：** 实施本计划时必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans`。步骤使用 checkbox（`- [ ]`）追踪进度。

> **总路线图：** 本计划是 feature package 拆分总计划中的阶段 0-1，见 `docs/superpowers/plans/2026-06-02-novasheet-feature-package-roadmap.md`。完成本计划后，回到总路线图打勾。

**目标：** 把已经实现并验证过的行/列表头拖拽排序能力移动到默认安装的 feature package 中，保持用户可见行为不变。

**架构：** `@novasheet/core` 保持 DOM-free，只在 `SheetContext` 上提供通用 contribution registry。`@novasheet/web` 负责 typed web drag contribution 契约与 runtime 派发。`@novasheet/feature-row-column-reorder` 拥有现有 `RowHeaderDrag` 与 `ColumnHeaderDrag` 实现，并由 `@novasheet/sheet` 通过 `installDefaultExtensions` 默认安装。

**技术栈：** Bun workspaces、TypeScript strict mode、`verbatimModuleSyntax`、`bun:test`、现有 `WebGridRuntime` drag state machine、现有 `SheetContext`。

---

## 范围

本计划只抽取已经 shipped 的行/列表头拖拽排序能力，不重新设计拖拽行为、选区语义、overlay、undo、resize、fill handle、editing、clipboard 或 context menu。

实施原则：

- 以搬迁为主：旧实现优先 `git mv`，避免重写。
- 只增加必要的薄 adapter / registry / installer。
- 默认 `@novasheet/sheet` 行为必须保持一致。
- 不保留兼容 alias，除非测试证明内部 import 还需要临时路径。

## 目标文件结构

```txt
packages/core/src/context/extensions.ts
packages/core/src/context/SheetContext.ts
packages/core/tests/context/SheetContext.test.ts

packages/web/src/interaction/drag/Drag.ts
packages/web/src/interaction/drag/WebDragContribution.ts
packages/web/src/runtime/WebGridRuntime.ts
packages/web/src/index.ts
packages/web/tests/interaction/drag/WebDragContribution.test.ts

packages/feature-row-column-reorder/
  package.json
  build.ts
  tsconfig.json
  tsconfig.build.json
  src/index.ts
  src/installRowColumnReorder.ts
  src/ColumnHeaderDrag.ts
  src/RowHeaderDrag.ts
  tests/installRowColumnReorder.test.ts
  tests/WebGridRuntime.col-reorder.test.ts
  tests/WebGridRuntime.row-reorder.test.ts

packages/sheet/package.json
packages/sheet/build.ts
packages/sheet/src/backends/Canvas2DBackend.ts
packages/sheet/src/defaults/installDefaultExtensions.ts
packages/sheet/tests/Grid.col-reorder.test.ts
```

## Task 1: 给 `SheetContext` 增加通用 contribution point

**文件：**

- 修改：`packages/core/src/context/extensions.ts`
- 修改：`packages/core/src/context/SheetContext.ts`
- 修改：`packages/core/tests/context/SheetContext.test.ts`
- 修改：`packages/core/src/index.ts`

- [ ] **Step 1: 先写失败测试**

把下面测试追加到 `packages/core/tests/context/SheetContext.test.ts`：

```ts
it('registers and reads generic extension contributions by point id', () => {
  const ctx = createSheetContext()
  const contribution = { id: 'feature-a' }

  ctx.extensions.contribute('web.drag', contribution)

  expect(ctx.registry.contributions.get('web.drag')).toEqual([contribution])
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
bun test packages/core/tests/context/SheetContext.test.ts
```

预期：失败，错误指向 `contribute` 或 `contributions` 不存在。

- [ ] **Step 3: 增加通用 contribution 类型**

更新 `packages/core/src/context/extensions.ts`，让 registry / registrar 支持 DOM-free contribution point：

```ts
/** Opaque extension contribution registered under a named contribution point. */
export type ExtensionContribution = unknown

/** Registered extension capabilities for one SheetContext. */
export interface ExtensionRegistry {
  readonly cells: Map<string, CellExtension>
  readonly commands: Map<string, CommandHandler>
  readonly contributions: Map<string, ExtensionContribution[]>
}

/** Registration API exposed to extension installers. */
export interface ExtensionRegistrar {
  cell(type: string, extension: CellExtension): void
  command(id: string, handler: CommandHandler): void
  contribute(point: string, contribution: ExtensionContribution): void
}
```

保留已有 `CellExtension` 与 `CommandHandler` 定义，不改语义。

- [ ] **Step 4: 在 `createSheetContext` 中存储 contributions**

更新 `packages/core/src/context/SheetContext.ts`：

```ts
const registry: ExtensionRegistry = {
  cells: new Map(),
  commands: new Map(),
  contributions: new Map(),
}
```

在 `extensions` 对象里增加：

```ts
contribute(point: string, contribution) {
  const existing = registry.contributions.get(point) ?? []
  registry.contributions.set(point, [...existing, contribution])
},
```

- [ ] **Step 5: 导出新类型**

更新 `packages/core/src/index.ts`：

```ts
export type { ExtensionContribution } from './context/extensions'
```

如果已有 grouped export，就把 `ExtensionContribution` 加进原 export block，避免重复 export。

- [ ] **Step 6: 验证 core**

```bash
bun test packages/core/tests/context/SheetContext.test.ts
bun run --filter @novasheet/core typecheck
bun run --filter @novasheet/core build
bun run lint
```

预期：全部 exit 0。

- [ ] **Step 7: 提交**

```bash
git add packages/core/src/context/extensions.ts packages/core/src/context/SheetContext.ts packages/core/tests/context/SheetContext.test.ts packages/core/src/index.ts
git commit -m "feat(core): 增加通用扩展贡献点"
```

## Task 2: 增加 Web drag contribution 契约

**文件：**

- 新增：`packages/web/src/interaction/drag/WebDragContribution.ts`
- 修改：`packages/web/src/index.ts`
- 新增：`packages/web/tests/interaction/drag/WebDragContribution.test.ts`

- [ ] **Step 1: 先写失败测试**

创建 `packages/web/tests/interaction/drag/WebDragContribution.test.ts`：

```ts
import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import {
  WEB_DRAG_CONTRIBUTION,
  getWebDragContributions,
  registerWebDrag,
  type WebDragContribution,
} from '../../../src'

describe('web drag contributions', () => {
  it('registers typed drag contributions through SheetContext', () => {
    const ctx = createSheetContext()
    const contribution: WebDragContribution = {
      id: 'test-drag',
      order: 10,
      create: () => null,
    }

    registerWebDrag(ctx, contribution)

    expect(ctx.registry.contributions.get(WEB_DRAG_CONTRIBUTION)).toEqual([contribution])
    expect(getWebDragContributions(ctx)).toEqual([contribution])
  })

  it('sorts drag contributions by order', () => {
    const ctx = createSheetContext()

    registerWebDrag(ctx, { id: 'late', order: 20, create: () => null })
    registerWebDrag(ctx, { id: 'early', order: 5, create: () => null })

    expect(getWebDragContributions(ctx).map((item) => item.id)).toEqual(['early', 'late'])
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
bun test packages/web/tests/interaction/drag/WebDragContribution.test.ts
```

预期：失败，原因是 `WEB_DRAG_CONTRIBUTION`、`registerWebDrag`、`getWebDragContributions` 尚未导出。

- [ ] **Step 3: 增加 web drag contribution contract**

创建 `packages/web/src/interaction/drag/WebDragContribution.ts`：

```ts
import type { SheetContext } from '@novasheet/core'
import type { GridEngine, CellRange } from '@novasheet/core'
import type { WebHost, WebPointerEvent } from '../../host/WebHost'
import type { ColumnReorderOverlay } from '../../overlay/ColumnReorderOverlay'
import type { RowReorderOverlay } from '../../overlay/RowReorderOverlay'
import type { Drag } from './Drag'

/** Contribution point id used by web runtime drag features. */
export const WEB_DRAG_CONTRIBUTION = 'web.drag'

/** Runtime services exposed to drag feature factories. */
export interface WebDragRuntimeDeps {
  readonly engine: GridEngine
  readonly host: WebHost
  readonly columnReorderOverlay?: ColumnReorderOverlay
  readonly rowReorderOverlay?: RowReorderOverlay
  refresh(): void
  afterEngineMutation(): void
  closeContextMenu(): void
  requestAutoScroll(pointer: WebPointerEvent): void
  stopAutoScroll(): void
  isBlocked(): boolean
  hitTestColumnHeader(event: WebPointerEvent): { colIndex: number; fieldId: string } | null
  hitTestRowHeader(event: WebPointerEvent): { rowIndex: number } | null
  isWholeColumnSelection(range: CellRange): boolean
  isWholeRowSelection(range: CellRange): boolean
  selectWholeColumn(colIndex: number): void
  selectWholeColumnRange(anchorCol: number, extentCol: number): void
  selectWholeRowRange(anchorRow: number, extentRow: number): void
  getColsTotalSize(): number
}

/** Factory contribution that creates one web drag state machine for a runtime instance. */
export interface WebDragContribution {
  readonly id: string
  readonly order: number
  create(deps: WebDragRuntimeDeps): Drag | null
}

/** Register a web drag contribution on a SheetContext. */
export function registerWebDrag(ctx: SheetContext, contribution: WebDragContribution): void {
  ctx.extensions.contribute(WEB_DRAG_CONTRIBUTION, contribution)
}

/** Read web drag contributions in deterministic dispatch order. */
export function getWebDragContributions(ctx: SheetContext): readonly WebDragContribution[] {
  return (ctx.registry.contributions.get(WEB_DRAG_CONTRIBUTION) ?? [])
    .filter(isWebDragContribution)
    .sort((a, b) => a.order - b.order)
}

function isWebDragContribution(value: unknown): value is WebDragContribution {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<WebDragContribution>
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.order === 'number' &&
    typeof candidate.create === 'function'
  )
}
```

- [ ] **Step 4: 从 web package 导出 contract**

更新 `packages/web/src/index.ts`：

```ts
export type { AutoScrollAxis, Drag } from './interaction/drag/Drag'
export {
  WEB_DRAG_CONTRIBUTION,
  getWebDragContributions,
  registerWebDrag,
} from './interaction/drag/WebDragContribution'
export type { WebDragContribution, WebDragRuntimeDeps } from './interaction/drag/WebDragContribution'
```

- [ ] **Step 5: 验证 web helper**

```bash
bun test packages/web/tests/interaction/drag/WebDragContribution.test.ts
bun run --filter @novasheet/web typecheck
bun run --filter @novasheet/web build
bun run lint
```

预期：全部 exit 0。

- [ ] **Step 6: 提交**

```bash
git add packages/web/src/interaction/drag/WebDragContribution.ts packages/web/src/index.ts packages/web/tests/interaction/drag/WebDragContribution.test.ts
git commit -m "feat(web): 增加拖拽贡献点契约"
```

## Task 3: 新建 `@novasheet/feature-row-column-reorder` 并接入 runtime

**文件：**

- 新建目录：`packages/feature-row-column-reorder/`
- 移动：`packages/web/src/interaction/drag/ColumnHeaderDrag.ts` → `packages/feature-row-column-reorder/src/ColumnHeaderDrag.ts`
- 移动：`packages/web/src/interaction/drag/RowHeaderDrag.ts` → `packages/feature-row-column-reorder/src/RowHeaderDrag.ts`
- 新增：`packages/feature-row-column-reorder/src/installRowColumnReorder.ts`
- 新增：`packages/feature-row-column-reorder/src/index.ts`
- 新增：package config / build files，沿用 `packages/web` 模式
- 修改：`tsconfig.base.json`
- 修改：`packages/web/src/runtime/WebGridRuntime.ts`
- 修改：`packages/web/tests/runtime/WebGridRuntime.col-reorder.test.ts`
- 修改：`packages/web/tests/runtime/WebGridRuntime.row-reorder.test.ts`

> 计划修正：`RowHeaderDrag` / `ColumnHeaderDrag` 一旦 `git mv` 出 `@novasheet/web`，`WebGridRuntime` 继续 import 旧路径会让 `@novasheet/web` barrel 无法加载。因此 package 搬迁与 runtime contribution 消费必须在同一个任务内完成，不能在中间要求 feature package 独立通过测试。

- [ ] **Step 1: 新建 package 文件**

创建 `packages/feature-row-column-reorder/package.json`：

```json
{
  "name": "@novasheet/feature-row-column-reorder",
  "version": "0.1.0",
  "description": "Row and column header reorder feature for NovaSheet.",
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "bun run build.ts",
    "test": "bun test",
    "test:watch": "bun test --watch",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@novasheet/core": "^0.1.0",
    "@novasheet/web": "^0.1.0"
  },
  "devDependencies": {
    "@happy-dom/global-registrator": "^20.9.0",
    "@types/bun": "latest",
    "happy-dom": "^20.9.0",
    "typescript": "^6.0.3"
  }
}
```

复制 `packages/web/build.ts`、`packages/web/tsconfig.json`、`packages/web/tsconfig.build.json` 到新包，并把 `build.ts` 里的 `EXTERNALS` 改成：

```ts
const EXTERNALS = ['@novasheet/core', '@novasheet/web'] as const
```

更新 `tsconfig.base.json` paths：

```json
"@novasheet/feature-row-column-reorder": [
  "packages/feature-row-column-reorder/src/index.ts"
]
```

- [ ] **Step 2: 用 `git mv` 移动旧实现**

```bash
git mv packages/web/src/interaction/drag/ColumnHeaderDrag.ts packages/feature-row-column-reorder/src/ColumnHeaderDrag.ts
git mv packages/web/src/interaction/drag/RowHeaderDrag.ts packages/feature-row-column-reorder/src/RowHeaderDrag.ts
```

- [ ] **Step 3: 更新 moved files 的 import**

在两个 moved files 中，把相对 web import 改成从 public web package 导入：

```ts
import type {
  AutoScrollAxis,
  Drag,
  WebDragRuntimeDeps,
  WebHost,
  WebPointerEvent,
} from '@novasheet/web'
```

`CellRange` 和 `GridEngine` 继续从 `@novasheet/core` 导入。

`ColumnHeaderDrag.ts` 中定义：

```ts
export type ColumnHeaderDragDeps = Pick<
  WebDragRuntimeDeps,
  | 'engine'
  | 'host'
  | 'refresh'
  | 'afterEngineMutation'
  | 'closeContextMenu'
  | 'requestAutoScroll'
  | 'stopAutoScroll'
  | 'isBlocked'
  | 'hitTestColumnHeader'
  | 'isWholeColumnSelection'
  | 'selectWholeColumn'
  | 'selectWholeColumnRange'
  | 'getColsTotalSize'
> & {
  readonly overlay?: WebDragRuntimeDeps['columnReorderOverlay']
}
```

`RowHeaderDrag.ts` 中定义：

```ts
export type RowHeaderDragDeps = Pick<
  WebDragRuntimeDeps,
  | 'engine'
  | 'host'
  | 'refresh'
  | 'afterEngineMutation'
  | 'closeContextMenu'
  | 'requestAutoScroll'
  | 'stopAutoScroll'
  | 'isBlocked'
  | 'hitTestRowHeader'
  | 'isWholeRowSelection'
  | 'selectWholeRowRange'
> & {
  readonly overlay?: WebDragRuntimeDeps['rowReorderOverlay']
}
```

- [ ] **Step 4: 增加 installer**

创建 `packages/feature-row-column-reorder/src/installRowColumnReorder.ts`：

```ts
import type { SheetContext } from '@novasheet/core'
import { registerWebDrag } from '@novasheet/web'
import { ColumnHeaderDrag } from './ColumnHeaderDrag'
import { RowHeaderDrag } from './RowHeaderDrag'

/** Install row and column header reorder drags into a SheetContext. */
export function installRowColumnReorder(ctx: SheetContext): void {
  registerWebDrag(ctx, {
    id: 'column-header-reorder',
    order: 20,
    create: (deps) =>
      new ColumnHeaderDrag({
        engine: deps.engine,
        host: deps.host,
        overlay: deps.columnReorderOverlay,
        refresh: deps.refresh,
        afterEngineMutation: deps.afterEngineMutation,
        closeContextMenu: deps.closeContextMenu,
        requestAutoScroll: deps.requestAutoScroll,
        stopAutoScroll: deps.stopAutoScroll,
        isBlocked: deps.isBlocked,
        hitTestColumnHeader: deps.hitTestColumnHeader,
        isWholeColumnSelection: deps.isWholeColumnSelection,
        selectWholeColumn: deps.selectWholeColumn,
        selectWholeColumnRange: deps.selectWholeColumnRange,
        getColsTotalSize: deps.getColsTotalSize,
      }),
  })

  registerWebDrag(ctx, {
    id: 'row-header-reorder',
    order: 30,
    create: (deps) =>
      new RowHeaderDrag({
        engine: deps.engine,
        host: deps.host,
        overlay: deps.rowReorderOverlay,
        refresh: deps.refresh,
        afterEngineMutation: deps.afterEngineMutation,
        closeContextMenu: deps.closeContextMenu,
        requestAutoScroll: deps.requestAutoScroll,
        stopAutoScroll: deps.stopAutoScroll,
        isBlocked: deps.isBlocked,
        hitTestRowHeader: deps.hitTestRowHeader,
        isWholeRowSelection: deps.isWholeRowSelection,
        selectWholeRowRange: deps.selectWholeRowRange,
      }),
  })
}
```

创建 `packages/feature-row-column-reorder/src/index.ts`：

```ts
export { installRowColumnReorder } from './installRowColumnReorder'
export { ColumnHeaderDrag } from './ColumnHeaderDrag'
export type { ColumnHeaderDragDeps } from './ColumnHeaderDrag'
export { RowHeaderDrag } from './RowHeaderDrag'
export type { RowHeaderDragDeps } from './RowHeaderDrag'
```

- [ ] **Step 5: 增加 installer 测试**

创建 `packages/feature-row-column-reorder/tests/installRowColumnReorder.test.ts`：

```ts
import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import { getWebDragContributions } from '@novasheet/web'
import { installRowColumnReorder } from '../src'

describe('installRowColumnReorder', () => {
  it('registers row and column reorder drag contributions', () => {
    const ctx = createSheetContext()

    installRowColumnReorder(ctx)

    expect(getWebDragContributions(ctx).map((item) => item.id)).toEqual([
      'column-header-reorder',
      'row-header-reorder',
    ])
  })
})
```

- [ ] **Step 6: 更新 runtime reorder 测试显式安装 feature**

在两个 reorder runtime 测试中导入：

```ts
import { createSheetContext } from '@novasheet/core'
import { installRowColumnReorder } from '@novasheet/feature-row-column-reorder'
```

增加 helper：

```ts
function makeContext() {
  const ctx = createSheetContext()
  installRowColumnReorder(ctx)
  return ctx
}
```

把 `context: makeContext()` 传给两个测试文件里所有 `new WebGridRuntime({ ... })`。

- [ ] **Step 7: 让 `WebGridRuntime` 消费 drag contributions**

在 `packages/web/src/runtime/WebGridRuntime.ts` 导入：

```ts
import { createSheetContext, type SheetContext } from '@novasheet/core'
import { getWebDragContributions, type WebDragRuntimeDeps } from '../interaction/drag/WebDragContribution'
```

给 `WebGridRuntimeOptions` 增加：

```ts
/** Extension context used to read web runtime feature contributions. */
context?: SheetContext
```

增加私有字段：

```ts
private readonly context: SheetContext
```

构造函数中设置：

```ts
this.context = opts.context ?? createSheetContext()
```

从 `WebGridRuntime.ts` 移除 `ColumnHeaderDrag` 与 `RowHeaderDrag` import，移除对应字段和直接 `new` 的 constructor 代码块，改为：

```ts
const contributedDrags = getWebDragContributions(this.context)
  .map((contribution) => contribution.create(this.createWebDragRuntimeDeps()))
  .filter((drag): drag is Drag => drag !== null)

this.drags = [...contributedDrags, this.selectionDrag]
```

新增 runtime deps factory：

```ts
private createWebDragRuntimeDeps(): WebDragRuntimeDeps {
  return {
    engine: this.engine,
    host: this.host,
    columnReorderOverlay: this.columnReorderOverlay,
    rowReorderOverlay: this.rowReorderOverlay,
    refresh: () => this.refresh(),
    afterEngineMutation: () => this.afterEngineMutation(),
    closeContextMenu: () => this.closeContextMenu(),
    requestAutoScroll: (pointer) => this.requestDragAutoScroll(pointer),
    stopAutoScroll: () => this.stopDragAutoScroll(),
    isBlocked: () => this.isDragBlocked(),
    hitTestColumnHeader: (event) => this.hitTestColumnHeader(event),
    hitTestRowHeader: (event) => this.hitTestRowHeader(event),
    isWholeColumnSelection: (range) => this.isWholeColumnSelection(range),
    isWholeRowSelection: (range) => this.isWholeRowSelection(range),
    selectWholeColumn: (col) => this.selectWholeColumn(col),
    selectWholeColumnRange: (anchor, extent) => this.selectWholeColumnRange(anchor, extent),
    selectWholeRowRange: (anchor, extent) => this.selectWholeRowRange(anchor, extent),
    getColsTotalSize: () => this.getColsTotalSizeForFrame(this.engine.getFrame()),
  }
}
```

- [ ] **Step 8: 验证 feature package 与 runtime**

```bash
bun test packages/feature-row-column-reorder/tests/installRowColumnReorder.test.ts
bun test packages/web/tests/runtime/WebGridRuntime.col-reorder.test.ts packages/web/tests/runtime/WebGridRuntime.row-reorder.test.ts
bun run --filter @novasheet/feature-row-column-reorder typecheck
bun run --filter @novasheet/web typecheck
bun run --filter @novasheet/web build
bun run --filter @novasheet/feature-row-column-reorder build
bun run lint
```

预期：全部 exit 0。

- [ ] **Step 9: 提交**

```bash
git add packages/feature-row-column-reorder packages/web/src/runtime/WebGridRuntime.ts packages/web/src/index.ts packages/web/tests/runtime/WebGridRuntime.col-reorder.test.ts packages/web/tests/runtime/WebGridRuntime.row-reorder.test.ts packages/web/src/interaction/drag/ColumnHeaderDrag.ts packages/web/src/interaction/drag/RowHeaderDrag.ts
git commit -m "feat(row-column-reorder): 新增行列拖拽排序能力包"
```

## Task 4: 保留默认 sheet assembly 行为

**文件：**

- 修改：`packages/sheet/package.json`
- 修改：`packages/sheet/build.ts`
- 修改：`packages/sheet/src/backends/Canvas2DBackend.ts`
- 修改：`packages/sheet/src/defaults/installDefaultExtensions.ts`
- 修改：`packages/sheet/tests/Grid.col-reorder.test.ts`

- [ ] **Step 1: 增加 feature package 依赖**

更新 `packages/sheet/package.json` dependencies：

```json
"@novasheet/feature-row-column-reorder": "^0.1.0"
```

更新 `packages/sheet/build.ts`：

```ts
const EXTERNALS = [
  '@novasheet/core',
  '@novasheet/web',
  '@novasheet/canvas2d',
  '@novasheet/feature-row-column-reorder',
] as const
```

- [ ] **Step 2: 把 context 传给 `WebGridRuntime`**

在 `packages/sheet/src/backends/Canvas2DBackend.ts` 的 `new WebGridRuntime({ ... })` 中加入：

```ts
context: this.sheetContext,
```

放在 `engine`、`host`、`renderer` 附近即可。

- [ ] **Step 3: 默认安装 feature**

更新 `packages/sheet/src/defaults/installDefaultExtensions.ts`：

```ts
import type { SheetContext } from '@novasheet/core'
import { installRowColumnReorder } from '@novasheet/feature-row-column-reorder'
import { installBasicCells } from './installBasicCells'

/** Install built-in NovaSheet capabilities for the default sheet assembly. */
export function installDefaultExtensions(ctx: SheetContext): void {
  installBasicCells(ctx)
  installRowColumnReorder(ctx)
}
```

- [ ] **Step 4: 保持现有 sheet 行为测试通过**

```bash
bun test packages/sheet/tests/Grid.col-reorder.test.ts
bun run --filter @novasheet/sheet typecheck
bun run --filter @novasheet/sheet build
```

预期：全部 exit 0。

- [ ] **Step 5: 提交**

```bash
git add packages/sheet/package.json packages/sheet/build.ts packages/sheet/src/backends/Canvas2DBackend.ts packages/sheet/src/defaults/installDefaultExtensions.ts packages/sheet/tests/Grid.col-reorder.test.ts
git commit -m "feat(sheet): 默认安装行列拖拽排序能力"
```

## Task 5: 把 ownership 测试迁移到 feature package

**文件：**

- 移动：`packages/web/tests/runtime/WebGridRuntime.col-reorder.test.ts` → `packages/feature-row-column-reorder/tests/WebGridRuntime.col-reorder.test.ts`
- 移动：`packages/web/tests/runtime/WebGridRuntime.row-reorder.test.ts` → `packages/feature-row-column-reorder/tests/WebGridRuntime.row-reorder.test.ts`
- 修改 moved tests 的 imports
- 移动/补齐：`packages/web/tests/runtime/WebGridRuntime.test.ts` 中残留的行表头选择用例 → `packages/feature-row-column-reorder/tests/WebGridRuntime.row-reorder.test.ts`
- 精简：`packages/web/tests/runtime/WebGridRuntime.drag-auto-scroll.test.ts` 中的表头拖选 auto-scroll 用例（feature 测试已覆盖），保留填充柄 auto-scroll 用例

- [ ] **Step 1: 用 `git mv` 移动测试**

```bash
git mv packages/web/tests/runtime/WebGridRuntime.col-reorder.test.ts packages/feature-row-column-reorder/tests/WebGridRuntime.col-reorder.test.ts
git mv packages/web/tests/runtime/WebGridRuntime.row-reorder.test.ts packages/feature-row-column-reorder/tests/WebGridRuntime.row-reorder.test.ts
```

- [ ] **Step 2: 更新 moved tests imports**

列测试中替换相对 web imports：

```ts
import type { ColumnReorderOverlay, WebHost, WebRenderer } from '@novasheet/web'
import { WebGridRuntime } from '@novasheet/web'
```

行测试中：

```ts
import type { RowReorderOverlay, WebHost, WebRenderer } from '@novasheet/web'
import { WebGridRuntime } from '@novasheet/web'
```

保留：

```ts
import { installRowColumnReorder } from '../src'
```

- [ ] **Step 3: 必要时从 web 导出 overlay types**

如果 typecheck 报 overlay classes 没有作为 type 导出，更新 `packages/web/src/index.ts`：

```ts
export type { ColumnReorderOverlay } from './overlay/ColumnReorderOverlay'
export type { RowReorderOverlay } from './overlay/RowReorderOverlay'
```

不要删除已有 value exports。

- [ ] **Step 4: 迁移残留的 header 行为测试**

`WebGridRuntime` 不再内建行/列表头 drag，`web` runtime 测试不能继续断言行/列表头选择或表头拖选 auto-scroll。

- 把 `packages/web/tests/runtime/WebGridRuntime.test.ts` 里的以下用例迁到 `packages/feature-row-column-reorder/tests/WebGridRuntime.row-reorder.test.ts`：
  - `Excel 行头左键选中整行`
  - `Excel 行头拖动扩展为连续整行选区`
  - `Excel 行头 Shift 点击从既有整行锚点扩展`
- 从 `packages/web/tests/runtime/WebGridRuntime.drag-auto-scroll.test.ts` 删除以下用例：
  - `列表头拖选到右边缘时横向滚动`
  - `行表头拖选到下边缘时纵向滚动`

原因：对应行为已由 `@novasheet/feature-row-column-reorder` 通过 `SheetContext` contribution 接管；web 包只保留 runtime 派发、普通选区、resize、fill handle 等平台行为测试。

- [ ] **Step 5: 验证 feature-owned tests**

```bash
bun test packages/feature-row-column-reorder/tests
bun test packages/web/tests/runtime
bun run --filter @novasheet/feature-row-column-reorder typecheck
bun run --filter @novasheet/web typecheck
```

预期：全部 exit 0。`web` runtime tests 不再直接拥有 row/column reorder 行为。

- [ ] **Step 6: 提交**

```bash
git add packages/feature-row-column-reorder/tests packages/web/tests/runtime packages/web/src/index.ts
git commit -m "test(row-column-reorder): 迁移拖拽排序运行时测试"
```

## Task 6: 全量验证与架构文档

**文件：**

- 修改：`docs/architecture.md`
- 修改：`docs/superpowers/plans/2026-06-01-novasheet-core-to-context-extensions.md`

- [ ] **Step 1: 记录 feature package 边界**

在 `docs/architecture.md` 增加：

```md
### Feature Packages

Feature packages own user-visible spreadsheet capabilities that can be installed on a `SheetContext`.
`@novasheet/feature-row-column-reorder` owns row and column header reorder drags. The package reuses
web drag contracts from `@novasheet/web` and calls engine APIs through runtime-provided dependencies.
`@novasheet/sheet` installs this package by default so the assembled Grid keeps the existing behavior.
```

- [ ] **Step 2: 更新当前迁移计划状态**

在 `docs/superpowers/plans/2026-06-01-novasheet-core-to-context-extensions.md` 的状态区域附近增加：

```md
### Follow-up: Feature package extraction

Row/column header reorder is the first user-visible capability moved from `@novasheet/web` fixed runtime construction into a default-installed feature package: `@novasheet/feature-row-column-reorder`.
```

- [ ] **Step 3: 跑全量 gates**

```bash
bun run lint
bun run --filter '*' typecheck
bun test
bun run --filter @novasheet/core build
bun run --filter @novasheet/web build
bun run --filter @novasheet/feature-row-column-reorder build
bun run --filter @novasheet/canvas2d build
bun run --filter @novasheet/sheet build
```

预期：全部 exit 0。

- [ ] **Step 4: 提交 docs**

```bash
git add docs/architecture.md docs/superpowers/plans/2026-06-01-novasheet-core-to-context-extensions.md
git commit -m "docs(architecture): 记录功能包拆分边界"
```

## 自检

- 覆盖范围：计划覆盖 contribution registry、web drag contract、feature package 创建、runtime consumption、默认 sheet 安装、测试 ownership 迁移、文档与全量验证。
- 占位扫描：没有占位标记，也没有未具体化的“写测试”步骤。
- 类型一致性：`SheetContext` 存 generic contributions；`@novasheet/web` 拥有 typed `WebDragContribution`；feature package 依赖 `@novasheet/web`；`@novasheet/sheet` 依赖 feature package；`@novasheet/core` 不导入 DOM 或 web 类型。
- 范围检查：本计划只抽取 row/column reorder。Resize、fill handle、editing、clipboard、context menu、undo 后续分别单独制定 feature plan。
