# Fill Handle Feature Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把填充柄能力（autofill 拖拽 + 预览 + commit + DOM 层）从 `@novasheet/web` 固定构造拆到默认安装的 `@novasheet/feature-fill-handle`，并为此在 `@novasheet/web` 建立可复用的 `WebFrameSync` 每帧同步契约。

**Architecture:** `@novasheet/web` 保留 runtime kernel + 新增 feature-agnostic 的 `WebFrameSync` 可选能力（按能力探测，非新 contribution point）。`@novasheet/feature-fill-handle` 用一个 `FillHandleController`（同时 `implements Drag + WebFrameSync`，独占持有 `DomFillHandleLayer`）通过 `web.drag` contribution 注册。`@novasheet/sheet` 默认安装。填充语义留 `@novasheet/core`。

**Tech Stack:** Bun workspaces、TypeScript strict + `verbatimModuleSyntax`、`bun:test`、现有 `WebDragContribution` / `getWebDragContributions`。

**设计依据：** `docs/superpowers/specs/2026-06-02-novasheet-fill-handle-feature-package-design.md`（含决策 B：onFill 暂留 web 记债，core 不建事件系统）。

**已知计划风险（执行时遇到必须 STOP+ASK，不要静默选择）：**

- `interacting` 状态聚合：fill drag 不再写 `this.activeDrag`，必须靠「`this.drags.some(d => d.active)`」让 `isDragBlocked()` 与 `syncFrame` 的 hide 逻辑看到 fill active。若发现别处仍假设 fill 在 `activeDrag` 里，STOP。
- `FillEvent` 有两份定义（`WebGridRuntime.ts:180` 与 `FillHandleDrag.ts:15`）。本计划把规范定义落到 `WebDragContribution.ts`，删除两处重复。若结构不一致，STOP。
- `syncFillHandle` 当前用 `engine.getFrame()`，selection overlay 用 `getRenderFrame()`。本计划统一传 `getRenderFrame()`；computeFillHandleRect 只用 viewport/axis，不受 viewPipeline 注入影响。若行为有差异，STOP。

---

## Scope

In scope:

- 新增 `@novasheet/web` 的 `WebFrameSync` / `WebInteractionStatus` 契约 + runtime flush/teardown 探测派发。
- `WebDragRuntimeDeps` 补通用 `autofitRows` / `commitActiveEdit`，与债务项 `onFill?`。
- `FillEvent` 规范定义迁到 `WebDragContribution.ts`，web 导出不变。
- `mergeVisualRange` 提升到 `@novasheet/core` 并导出。
- 新建 `@novasheet/feature-fill-handle`，`git mv` `FillHandleDrag` + `DomFillHandleLayer`，迁入 `computeFillHandleRect`，合成 `FillHandleController`。
- `WebGridRuntime` 删除 fill 专用代码（`fillHandleDrag` 字段、`handleFillPointer*`、`syncFillHandle`、`fillLayer`、`DomFillHandleLayer` 导入）。
- `@novasheet/sheet` 默认安装 + `Canvas2DBackend` 删除 fill 层构造。
- 测试 ownership 迁移。

Out of scope：

- 把 `onFill` 改成 engine 事件（决策 B 债务，单独 brainstorm）。
- 动填充语义（`computeFillTarget` / `FillSeries` / `FillStylePropagator` / `commitFill` / `getFillMergeSnap`）。
- 回补 resize / reorder 半拆（phase 14）。
- 把 `computeRangeOverlayRects` / `OverlayRect` 移出 web（选区/reorder 共享）。

## Current File Map

```txt
packages/web/src/interaction/drag/WebDragContribution.ts   # WebDragRuntimeDeps 契约
packages/web/src/interaction/drag/FillHandleDrag.ts        # 要搬：fill drag + 本地 FillEvent 重复定义
packages/web/src/interaction/DomFillHandleLayer.ts         # 要搬：fill DOM 层
packages/web/src/interaction/RangeOverlayRects.ts          # computeFillHandleRect(搬) + computeRangeOverlayRects/OverlayRect(留)
packages/web/src/runtime/WebGridRuntime.ts                 # FillEvent 定义(180)、fill 构造/方法/syncFillHandle、mergeVisualRange(205)
packages/web/src/index.ts                                  # 导出
packages/core/src/geometry/range.ts                        # cellInRange / unionRange
packages/core/src/index.ts                                 # core 导出
packages/sheet/src/backends/Canvas2DBackend.ts             # new DomFillHandleLayer
packages/sheet/src/defaults/installDefaultExtensions.ts    # 默认安装
packages/sheet/package.json / build.ts
tsconfig.base.json
```

## Target File Map

```txt
packages/feature-fill-handle/
  package.json
  build.ts
  tsconfig.json
  tsconfig.build.json
  src/index.ts
  src/installFillHandleFeature.ts
  src/FillHandleController.ts        # git mv 自 FillHandleDrag.ts，改造为 Drag + WebFrameSync
  src/computeFillHandleRect.ts       # 自 RangeOverlayRects.ts 抽出
  tests/installFillHandleFeature.test.ts
  tests/FillHandleController.test.ts # git mv 自 web FillHandleDrag.test.ts
  tests/DomFillHandleLayer.test.ts   # git mv 自 web
  tests/computeFillHandleRect.test.ts
  tests/helpers/...                  # 按需

packages/web/src/interaction/WebFrameSync.ts               # 新契约（或并入 WebDragContribution.ts）
```

---

## Task 1: 建立 `WebFrameSync` 基座与通用 services（独立 commit，全 no-op）

**Files:**

- Modify: `packages/web/src/interaction/drag/WebDragContribution.ts`
- Modify: `packages/web/src/runtime/WebGridRuntime.ts`
- Modify: `packages/web/src/index.ts`
- Test: `packages/web/tests/runtime/WebGridRuntime.frame-sync.test.ts`

- [ ] **Step 1: 写失败测试 — frame-sync 生命周期被驱动**

Create `packages/web/tests/runtime/WebGridRuntime.frame-sync.test.ts`:

```ts
import { describe, expect, it, mock } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import { registerWebDrag, WebGridRuntime } from '@novasheet/web'
import type { Drag, WebFrameSync, WebInteractionStatus } from '@novasheet/web'
import { makeEngine, makeHost, makeRenderer } from './helpers/runtime-fixtures'

function makeFrameSyncDrag(spy: {
  attach: ReturnType<typeof mock>
  sync: ReturnType<typeof mock>
  destroy: ReturnType<typeof mock>
}): Drag & WebFrameSync {
  return {
    autoScrollAxis: null,
    get active() {
      return false
    },
    tryStart: () => false,
    move: () => false,
    commit: () => {},
    cancel: () => {},
    reevaluate: () => {},
    attach: spy.attach,
    syncFrame: (frame, status: WebInteractionStatus) => spy.sync(status),
    destroy: spy.destroy,
  }
}

describe('WebGridRuntime frame-sync 基座', () => {
  it('attach/syncFrame/destroy 按生命周期被驱动', () => {
    const spy = { attach: mock(() => {}), sync: mock(() => {}), destroy: mock(() => {}) }
    const ctx = createSheetContext()
    registerWebDrag(ctx, { id: 'probe', order: 1, create: () => makeFrameSyncDrag(spy) })

    const runtime = new WebGridRuntime({
      engine: makeEngine(),
      context: ctx,
      host: makeHost(),
      renderer: makeRenderer(),
    })

    expect(spy.attach).toHaveBeenCalledTimes(1)

    runtime.paintNow()
    expect(spy.sync).toHaveBeenCalled()
    const status = spy.sync.mock.calls.at(-1)?.[0] as WebInteractionStatus
    expect(status).toMatchObject({ interacting: false, editing: false })

    runtime.destroy()
    expect(spy.destroy).toHaveBeenCalledTimes(1)
  })

  it('无 frame-sync contribution 时 flush 不 crash', () => {
    const ctx = createSheetContext()
    const runtime = new WebGridRuntime({
      engine: makeEngine(),
      context: ctx,
      host: makeHost(),
      renderer: makeRenderer(),
    })
    expect(() => runtime.paintNow()).not.toThrow()
    runtime.destroy()
  })
})
```

> 注：测试用到的 `makeEngine` / `makeHost` / `makeRenderer` fixtures、以及一个能触发同步绘制的 `paintNow()` 公共方法，下一步处理。`autoScrollAxis: null` 需 `Drag` 接口允许 `null`——若不允许，用现有合法值并 STOP 记录。

- [ ] **Step 2: 跑测试确认失败**

Run:

```bash
bun test packages/web/tests/runtime/WebGridRuntime.frame-sync.test.ts
```

Expected: FAIL —— `WebFrameSync` / `WebInteractionStatus` 未导出，`runtime.paintNow` 不存在。

- [ ] **Step 3: 复用或新建 runtime fixtures**

检查 `packages/web/tests/runtime/` 是否已有可复用的 engine/host/renderer doubles（`WebGridRuntime.test.ts` 内可能是局部函数）。若无共享文件，创建 `packages/web/tests/runtime/helpers/runtime-fixtures.ts`，从 `WebGridRuntime.test.ts` 抽出最小 `makeEngine()` / `makeHost()` / `makeRenderer()`（保持与现有测试一致的最小实现）。

> 若 `WebGridRuntime.test.ts` 已有等价 helper 且导出成本低，优先复用，不要造重复 double。具体实现以现有测试为准；本步不贴实现以免与现状漂移——执行者按现有 doubles 抄齐即可。

- [ ] **Step 4: 定义 `WebFrameSync` 契约 + 通用 services**

In `packages/web/src/interaction/drag/WebDragContribution.ts`：

把 `FillEvent` 规范定义落到本文件（删除其它处重复见 Task 3），并扩展 `WebDragRuntimeDeps`：

```ts
import type {
  CellRange,
  FillDirection,
  GridEngine,
  RenderFrame,
  SheetContext,
} from '@novasheet/core'
import type { AutofitRowsResult } from '@novasheet/core'
// ... 现有 import 保留

/** 填充应用事件（公共 onFill 回调载荷）。决策 B：暂留 web。 */
export interface FillEvent {
  readonly source: CellRange
  readonly fill: CellRange
  readonly result: CellRange
  readonly direction: FillDirection
}

/** runtime 每帧交互状态，供 overlay 决定显隐。 */
export interface WebInteractionStatus {
  /** 任一 drag 处于 active（拖拽进行中）。 */
  readonly interacting: boolean
  /** 引擎当前在编辑单元格。 */
  readonly editing: boolean
}

/**
 * 拥有 DOM overlay 的 drag 可选实现：让 runtime 在 flush/teardown 中驱动它每帧同步。
 * feature-agnostic：runtime 按能力探测，不关心具体 overlay。
 */
export interface WebFrameSync {
  attach(container: HTMLElement): void
  syncFrame(frame: RenderFrame, status: WebInteractionStatus): void
  destroy(): void
}
```

在 `WebDragRuntimeDeps` 里补三项（保留现有成员）：

```ts
export interface WebDragRuntimeDeps {
  readonly engine: GridEngine
  readonly host: WebHost
  // ... 现有成员不变 ...
  /** 通用 runtime 服务：自动行高。 */
  autofitRows(options: { rows?: readonly number[]; minHeight?: number; maxHeight?: number }): AutofitRowsResult
  /** 通用 runtime 服务：提交进行中的编辑。 */
  commitActiveEdit(moveSelection: boolean): void
  /** 决策 B 债务：填充应用回调，唯一保留的 fill-named 成员。 */
  onFill?(event: FillEvent): void
}
```

> `AutofitRowsResult` 的入参与 `AutofitRowsRuntimeOptions` 同形，这里就地内联以免 web 契约反向依赖 runtime 私有类型。

- [ ] **Step 5: runtime 探测 + flush 派发 + teardown + 暴露 `paintNow`**

In `packages/web/src/runtime/WebGridRuntime.ts`：

import 契约：

```ts
import type { WebFrameSync, WebInteractionStatus } from '../interaction/drag/WebDragContribution'
```

新增字段（靠近 `private drags`）：

```ts
private frameSyncs: WebFrameSync[] = []
```

构造函数末尾（`this.drags = [...]` 之后）收集并 attach：

```ts
this.frameSyncs = this.drags.filter(isWebFrameSync)
for (const fs of this.frameSyncs) fs.attach(this.host.container)
```

加探测 helper（放在 `isWebResizeDrag` 旁）：

```ts
function isWebFrameSync(drag: Drag): drag is Drag & WebFrameSync {
  const c = drag as Partial<WebFrameSync>
  return (
    typeof c.attach === 'function' &&
    typeof c.syncFrame === 'function' &&
    typeof c.destroy === 'function'
  )
}
```

`createWebDragRuntimeDeps()` 补三项：

```ts
autofitRows: (options) => this.autofitRows(options),
commitActiveEdit: (moveSelection) => this.commitCellEdit(moveSelection),
onFill: (event) => this.onFill?.(event),
```

在 `invalidate()` 的 flush 回调里、`syncCellEditorPosition()` 之后加：

```ts
this.syncFrameSyncs(frame)
```

在 `paintSync()` 同样位置加：

```ts
this.syncFrameSyncs(this.getRenderFrame())
```

新增方法：

```ts
/** 驱动所有 frame-sync overlay（如填充柄）每帧同步。 */
private syncFrameSyncs(frame: ReturnType<GridEngine['getFrame']>): void {
  if (this.frameSyncs.length === 0) return
  const status: WebInteractionStatus = {
    interacting: this.resizeDrag?.active === true || this.drags.some((d) => d.active),
    editing: this.engine.isCellEditing(),
  }
  for (const fs of this.frameSyncs) fs.syncFrame(frame, status)
}

/** 公开同步绘制一帧（测试/即时刷新用）。 */
paintNow(): void {
  this.paintSync()
}
```

> 若已有等价公共方法可触发 `paintSync`，复用它、不要新增 `paintNow`，并相应改 Step 1 测试。

`destroy()` 里，在 `this.renderer.destroy()` 之前加：

```ts
for (const fs of this.frameSyncs) fs.destroy()
this.frameSyncs = []
```

`isDragBlocked()` 改为也看 contributed drags：

```ts
private isDragBlocked(): boolean {
  return this.resizeDrag?.active === true || this.drags.some((d) => d.active) || !!this.activeDrag
}
```

- [ ] **Step 6: 导出契约**

In `packages/web/src/index.ts`，把 `WebFrameSync` / `WebInteractionStatus` 加入从 `WebDragContribution` 的类型导出：

```ts
export type {
  WebDragContribution,
  WebDragRuntimeDeps,
  WebFrameSync,
  WebInteractionStatus,
  FillEvent,
} from './interaction/drag/WebDragContribution'
```

并删除第 10 行里从 `./runtime/WebGridRuntime` 导出的 `FillEvent`（保留 `RedoEvent` / `UndoEvent` / `WebGridRuntimeOptions`）。

- [ ] **Step 7: 跑测试确认通过 + gates**

Run:

```bash
bun test packages/web/tests/runtime/WebGridRuntime.frame-sync.test.ts
bun test packages/web/tests/runtime/WebGridRuntime.test.ts
bun run --filter @novasheet/web typecheck
bun run --filter @novasheet/web build
bun run lint
```

> Step 6 删 `FillEvent` 旧导出后，`WebGridRuntime.ts:180` 仍定义着重复 `FillEvent`——Task 3 删它。本步若 typecheck 因重复定义/未用报错，把 `WebGridRuntime.ts` 的 `FillEvent` 改为 `import type { FillEvent } from '../interaction/drag/WebDragContribution'` 并删本地定义（提前到此步亦可）。

Expected: all exit 0。

- [ ] **Step 8: Commit**

```bash
git add packages/web/src/interaction/drag/WebDragContribution.ts packages/web/src/runtime/WebGridRuntime.ts packages/web/src/index.ts packages/web/tests/runtime
git commit -m "feat(web): 新增 WebFrameSync 每帧同步基座与通用 drag services"
```

---

## Task 2: `mergeVisualRange` 提升到 `@novasheet/core`

**Files:**

- Modify: `packages/core/src/geometry/range.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/web/src/runtime/WebGridRuntime.ts`
- Test: `packages/core/tests/geometry/range.test.ts`

- [ ] **Step 1: 写失败测试**

Append to `packages/core/tests/geometry/range.test.ts`（若无则新建，import 路径对齐现有 range 测试）：

```ts
import { mergeVisualRange } from '../../src/geometry/range'

describe('mergeVisualRange', () => {
  const range = { startRow: 1, endRow: 1, startCol: 1, endCol: 1 }

  it('无 activeCell 或无 mergeRegions 时原样返回', () => {
    expect(mergeVisualRange(undefined, range, { rowIndex: 1, colIndex: 1 })).toEqual(range)
    expect(mergeVisualRange([], range, null)).toEqual(range)
  })

  it('activeCell 落在合并区时返回 union', () => {
    const merge = { startRow: 1, endRow: 3, startCol: 1, endCol: 2 }
    const regions = [{ range: merge }] as never
    expect(mergeVisualRange(regions, range, { rowIndex: 1, colIndex: 1 })).toEqual({
      startRow: 1,
      endRow: 3,
      startCol: 1,
      endCol: 2,
    })
  })
})
```

> `CellAddress` 字段名以 core 现有定义为准（这里假设 `rowIndex` / `colIndex`）。执行者照 `packages/core/src/index.ts` 的 `CellAddress` 修正测试字段，若不一致 STOP 记录。

- [ ] **Step 2: 跑测试确认失败**

```bash
bun test packages/core/tests/geometry/range.test.ts
```

Expected: FAIL —— `mergeVisualRange` 未导出。

- [ ] **Step 3: 实现（从 runtime 搬入 core）**

In `packages/core/src/geometry/range.ts`，新增（复用同文件已有的 `cellInRange` / `unionRange`）：

```ts
import type { CellAddress } from '../...' // 对齐本文件已有类型 import
import type { MergeRegion } from '../merge/MergeStore'

/** active cell 落在合并区时，把选区扩成合并区 union；否则原样返回。 */
export function mergeVisualRange(
  mergeRegions: readonly MergeRegion[] | undefined,
  range: CellRange,
  activeCell: CellAddress | null | undefined,
): CellRange {
  if (!activeCell || !mergeRegions) return range
  const merge = mergeRegions.find((m) => cellInRange(activeCell, m.range))?.range
  return merge ? unionRange(range, merge) : range
}
```

> 若 `range.ts` import `MergeStore` 会形成 core 内部循环依赖，则把 `MergeRegion` 的结构类型就地内联为 `{ range: CellRange }` 的最小形状，避免环。执行时验证无循环依赖。

In `packages/core/src/index.ts`，在 `./geometry/range` 的导出块里加 `mergeVisualRange`。

- [ ] **Step 4: runtime 改用 core 版本**

In `packages/web/src/runtime/WebGridRuntime.ts`：

- 删除本地 `function mergeVisualRange(...)`（205 行起）。
- 从 core import：`import { mergeVisualRange } from '@novasheet/core'`（并入现有 core import）。
- 两处调用点（syncSelectionOverlay 等）保持不变。

- [ ] **Step 5: 跑测试 + gates**

```bash
bun test packages/core/tests/geometry/range.test.ts
bun test packages/web/tests/runtime/WebGridRuntime.test.ts
bun run --filter @novasheet/core typecheck
bun run --filter @novasheet/web typecheck
bun run --filter @novasheet/core build
bun run lint
```

Expected: all exit 0。

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/geometry/range.ts packages/core/src/index.ts packages/core/tests/geometry/range.test.ts packages/web/src/runtime/WebGridRuntime.ts
git commit -m "refactor(core): mergeVisualRange 从 runtime 提升到 core geometry"
```

---

## Task 3: 新建 `@novasheet/feature-fill-handle` 并接入 runtime（原子变更）

> 本 Task 跨 `git mv` + runtime 删 fill 代码，必须一次做完、一次绿，中途不 commit。

**Files:**

- Create: `packages/feature-fill-handle/{package.json,build.ts,tsconfig.json,tsconfig.build.json,src/index.ts,src/installFillHandleFeature.ts,src/computeFillHandleRect.ts}`
- Move: `packages/web/src/interaction/drag/FillHandleDrag.ts` → `packages/feature-fill-handle/src/FillHandleController.ts`
- Move: `packages/web/src/interaction/DomFillHandleLayer.ts` → `packages/feature-fill-handle/src/DomFillHandleLayer.ts`
- Move: `packages/web/tests/interaction/drag/FillHandleDrag.test.ts` → `packages/feature-fill-handle/tests/FillHandleController.test.ts`
- Move: `packages/web/tests/interaction/DomFillHandleLayer.test.ts` → `packages/feature-fill-handle/tests/DomFillHandleLayer.test.ts`
- Modify: `packages/web/src/interaction/RangeOverlayRects.ts`、`packages/web/src/index.ts`、`packages/web/src/runtime/WebGridRuntime.ts`
- Modify: `tsconfig.base.json`
- Move: `packages/web/tests/runtime/WebGridRuntime.fill.test.ts` → `packages/feature-fill-handle/tests/WebGridRuntime.fill.test.ts`

- [ ] **Step 1: 建包脚手架**

Create `packages/feature-fill-handle/package.json`（镜像 feature-resize，仅改 name/description）：

```json
{
  "name": "@novasheet/feature-fill-handle",
  "version": "0.1.0",
  "description": "Fill handle (autofill) feature for NovaSheet.",
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

Create `packages/feature-fill-handle/build.ts`：复制 `packages/feature-resize/build.ts` 全文，仅把注释里的包名改为 `@novasheet/feature-fill-handle`，`EXTERNALS` 保持 `['@novasheet/core', '@novasheet/web']`。

Create `packages/feature-fill-handle/tsconfig.json`：

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "../..",
    "outDir": "./dist",
    "types": ["bun"]
  },
  "include": ["src/**/*", "tests/**/*", "build.ts"]
}
```

Create `packages/feature-fill-handle/tsconfig.build.json`：

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "paths": {}
  },
  "include": ["src/**/*"],
  "exclude": ["tests"]
}
```

In `tsconfig.base.json` paths 加（保持字母序附近）：

```json
"@novasheet/feature-fill-handle": ["packages/feature-fill-handle/src/index.ts"],
```

Run：

```bash
bun install
```

- [ ] **Step 2: 抽出 `computeFillHandleRect` 到 feature；web 导出 `computeRangeOverlayRects`**

In `packages/web/src/interaction/RangeOverlayRects.ts`：删除 `computeFillHandleRect` 及其私有 `HANDLE_SIZE`（保留 `OverlayRect` / `computeRangeOverlayRects`）。

Create `packages/feature-fill-handle/src/computeFillHandleRect.ts`：

```ts
import type { CellRange, RenderFrame } from '@novasheet/core'
import { computeRangeOverlayRects, type OverlayRect } from '@novasheet/web'

const HANDLE_SIZE = 8

/** 选最靠右下的可见 rect 作为填充柄锚点，避免冻结区重复边框生成多个手柄。 */
export function computeFillHandleRect(frame: RenderFrame, range: CellRange): OverlayRect | null {
  const rects = computeRangeOverlayRects(frame, range)
  if (rects.length === 0) return null
  const bottomRight = rects
    .slice()
    .sort((a, b) => a.y + a.height - (b.y + b.height) || a.x + a.width - (b.x + b.width))
    .at(-1)!
  return {
    x: bottomRight.x + bottomRight.width - HANDLE_SIZE / 2,
    y: bottomRight.y + bottomRight.height - HANDLE_SIZE / 2,
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
  }
}
```

In `packages/web/src/index.ts`：把 `computeRangeOverlayRects` 加入导出，删除 `DomFillHandleLayer` 导出：

```ts
export { computeRangeOverlayRects } from './interaction/RangeOverlayRects'
export type { OverlayRect } from './interaction/RangeOverlayRects'
// 删除：export { DomFillHandleLayer } from './interaction/DomFillHandleLayer'
```

- [ ] **Step 3: 搬移文件**

```bash
git mv packages/web/src/interaction/DomFillHandleLayer.ts packages/feature-fill-handle/src/DomFillHandleLayer.ts
git mv packages/web/src/interaction/drag/FillHandleDrag.ts packages/feature-fill-handle/src/FillHandleController.ts
git mv packages/web/tests/interaction/DomFillHandleLayer.test.ts packages/feature-fill-handle/tests/DomFillHandleLayer.test.ts
git mv packages/web/tests/interaction/drag/FillHandleDrag.test.ts packages/feature-fill-handle/tests/FillHandleController.test.ts
git mv packages/web/tests/runtime/WebGridRuntime.fill.test.ts packages/feature-fill-handle/tests/WebGridRuntime.fill.test.ts
```

`DomFillHandleLayer.ts` 改 import：`import type { OverlayRect } from '@novasheet/web'`（原为相对路径 `./RangeOverlayRects`）。

- [ ] **Step 4: 改造 `FillHandleController`（Drag + WebFrameSync，自持 layer）**

把 `packages/feature-fill-handle/src/FillHandleController.ts` 改成下列内容（在原 `FillHandleDrag` 基础上：类改名 `FillHandleController`；`implements Drag, WebFrameSync`；从 deps 拿掉 `fillLayer`，改为 `attach` 内构造自持 layer 并接线 pointer 回调；把 runtime 旧 `syncFillHandle` 逻辑搬进 `syncFrame`；引入 `computeFillHandleRect` + `mergeVisualRange`）：

```ts
import {
  cellInRange,
  computeFillTarget,
  hitTestCell,
  mergeVisualRange,
  type AutofitRowsResult,
  type CellRange,
  type FillDirection,
  type GridEngine,
  type RenderFrame,
} from '@novasheet/core'
import {
  computeRangeOverlayRects,
  type Drag,
  type FillEvent,
  type WebFrameSync,
  type WebHost,
  type WebInteractionStatus,
  type WebPointerEvent,
} from '@novasheet/web'
import { DomFillHandleLayer } from './DomFillHandleLayer'
import { computeFillHandleRect } from './computeFillHandleRect'

/** FillHandleController 所需 runtime 服务（feature 自定义 deps）。 */
export interface FillHandleControllerDeps {
  readonly engine: GridEngine
  readonly host: WebHost
  afterEngineMutation(): void
  autofitRows(options: { rows?: readonly number[] }): AutofitRowsResult
  onFill(event: FillEvent): void
  closeContextMenu(): void
  commitActiveEdit(moveSelection: boolean): void
  requestAutoScroll(pointer: WebPointerEvent): void
  stopAutoScroll(): void
  isBlocked(): boolean
}

interface FillState {
  pointerId: number
  source: CellRange
  target: ReturnType<typeof computeFillTarget> | null
  lastPointer: WebPointerEvent | null
}

/**
 * 填充柄控制器：Drag 状态机 + WebFrameSync overlay，独占持有 DomFillHandleLayer。
 * layer pointerdown/move/up 直接回调本控制器；commit 只经 engine。
 */
export class FillHandleController implements Drag, WebFrameSync {
  readonly autoScrollAxis = 'both' as const
  private state: FillState | null = null
  private layer: DomFillHandleLayer | null = null

  constructor(private readonly deps: FillHandleControllerDeps) {}

  get active(): boolean {
    return this.state !== null
  }

  // --- WebFrameSync ---

  attach(container: HTMLElement): void {
    this.layer = new DomFillHandleLayer(container, {
      onFillPointerDown: (pointerId, x, y) => this.startFromClient(pointerId, x, y),
      onFillPointerMove: (pointerId, x, y) => this.moveFromClient(pointerId, x, y),
      onFillPointerUp: (pointerId) => this.commitPointer(pointerId),
    })
    this.layer.attach()
  }

  syncFrame(frame: RenderFrame, status: WebInteractionStatus): void {
    if (!this.layer) return
    if (status.interacting || status.editing) {
      this.layer.sync(null)
      return
    }
    const range = frame.selection?.selectedRange
    if (!range) {
      this.layer.sync(null)
      return
    }
    const visualRange = mergeVisualRange(frame.mergeRegions, range, frame.selection?.activeCell)
    this.layer.sync(computeFillHandleRect(frame, visualRange))
  }

  destroy(): void {
    this.state = null
    this.deps.stopAutoScroll()
    this.layer?.destroy()
    this.layer = null
  }

  // --- Drag ---

  tryStart(_event: WebPointerEvent): boolean {
    return false
  }

  move(event: WebPointerEvent): boolean {
    if (!this.state) return false
    this.applyPointerMove(event)
    return true
  }

  reevaluate(pointer: WebPointerEvent): void {
    this.move(pointer)
  }

  commit(): void {
    const state = this.state
    this.state = null
    this.deps.stopAutoScroll()
    this.layer?.hidePreview()
    if (!state?.target) return
    const result = this.deps.engine.commitFill(
      state.target.source,
      state.target.fill,
      state.target.direction,
    )
    if (!result) return
    const autofit = this.deps.autofitRows({ rows: uniqueRows(result.writes.map((w) => w.rowIndex)) })
    if (autofit.changedRows === 0) this.deps.afterEngineMutation()
    this.deps.onFill({
      source: state.target.source,
      fill: state.target.fill,
      result: state.target.result,
      direction: state.target.direction,
    })
  }

  cancel(): void {
    this.state = null
    this.deps.stopAutoScroll()
    this.layer?.hidePreview()
  }

  // --- 客户端坐标入口（layer 回调）---

  private startFromClient(pointerId: number, clientX: number, clientY: number): void {
    if (this.deps.isBlocked()) return
    if (this.deps.engine.isCellEditing()) this.deps.commitActiveEdit(false)
    const source = this.deps.engine.getSelection().selectedRange
    if (!source) return
    this.deps.closeContextMenu()
    this.state = {
      pointerId,
      source,
      target: null,
      lastPointer: this.pointerFromClient(clientX, clientY),
    }
  }

  private moveFromClient(pointerId: number, clientX: number, clientY: number): void {
    if (!this.state || this.state.pointerId !== pointerId) return
    this.move(this.pointerFromClient(clientX, clientY))
  }

  private commitPointer(pointerId: number): void {
    if (!this.state || this.state.pointerId !== pointerId) return
    this.commit()
  }

  private applyPointerMove(pointer: WebPointerEvent): void {
    const state = this.state
    if (!state) return
    state.lastPointer = pointer
    this.deps.requestAutoScroll(pointer)
    const frame = this.deps.engine.getFrame()
    const hit = hitTestCell(frame, pointer)
    if (!hit) return
    const data = this.deps.engine.getData()
    const snap = this.deps.engine.getFillMergeSnap(state.source)
    const onMergeSource = snap.rowSpan > 1 || snap.colSpan > 1
    const targetMerge = onMergeSource
      ? frame.mergeRegions?.find((region) => cellInRange(hit, region.range))?.range
      : undefined
    state.target = computeFillTarget(
      state.source,
      hit,
      { rowCount: data.getRowCount(), colCount: data.getSchema().fields.length },
      snap,
      targetMerge,
    )
    if (state.target) {
      this.layer?.showPreview(computeRangeOverlayRects(this.deps.engine.getFrame(), state.target.fill))
    } else {
      this.layer?.hidePreview()
    }
  }

  private pointerFromClient(clientX: number, clientY: number): WebPointerEvent {
    const rect = this.deps.host.getContainerBoundingRect()
    return { x: clientX - rect.left, y: clientY - rect.top, clientX, clientY, shiftKey: false }
  }
}

function uniqueRows(rows: readonly number[]): readonly number[] {
  return [...new Set(rows)]
}
```

> 变化点对照原 `FillHandleDrag`：删 `FillEvent` 本地定义（改 import 自 web）、删 `fillLayer` dep、`tryStartFromClient`→私有 `startFromClient`（layer 直接回调，不再经 runtime）、`deps.commitCellEdit`→`deps.commitActiveEdit`、所有 `this.deps.fillLayer?` → `this.layer?`、新增 `attach`/`syncFrame`/`destroy`。`RenderFrame` 类型按 core 导出名核对。

- [ ] **Step 5: installer + index**

Create `packages/feature-fill-handle/src/installFillHandleFeature.ts`：

```ts
import type { SheetContext } from '@novasheet/core'
import { registerWebDrag } from '@novasheet/web'
import { FillHandleController } from './FillHandleController'

/** 安装填充柄能力（autofill 拖拽 + 预览 + commit + DOM 层）。 */
export function installFillHandleFeature(ctx: SheetContext): void {
  registerWebDrag(ctx, {
    id: 'fill-handle',
    order: 20,
    create: (deps) =>
      new FillHandleController({
        engine: deps.engine,
        host: deps.host,
        afterEngineMutation: deps.afterEngineMutation,
        autofitRows: deps.autofitRows,
        onFill: (event) => deps.onFill?.(event),
        closeContextMenu: deps.closeContextMenu,
        commitActiveEdit: deps.commitActiveEdit,
        requestAutoScroll: deps.requestAutoScroll,
        stopAutoScroll: deps.stopAutoScroll,
        isBlocked: deps.isBlocked,
      }),
  })
}
```

Create `packages/feature-fill-handle/src/index.ts`：

```ts
export { installFillHandleFeature } from './installFillHandleFeature'
export { FillHandleController } from './FillHandleController'
export type { FillHandleControllerDeps } from './FillHandleController'
export { DomFillHandleLayer } from './DomFillHandleLayer'
export { computeFillHandleRect } from './computeFillHandleRect'
```

> `order: 20` 排在 resize(`10`) 之后；fill 与 resize 互不依赖，order 只为确定性。

- [ ] **Step 6: runtime 删除 fill 专用代码**

In `packages/web/src/runtime/WebGridRuntime.ts`：

- 删 `import { FillHandleDrag }`、`import type { DomFillHandleLayer }`、`import { computeFillHandleRect } from '../interaction/RangeOverlayRects'`（保留 `computeRangeOverlayRects` 若他处仍用；不再用则一并删）。
- 删字段 `private fillHandleDrag!: FillHandleDrag`、`fillLayer?` opt 与 `private fillLayer?`、`this.fillLayer = opts.fillLayer`、构造里 `this.fillHandleDrag = new FillHandleDrag({...})` 整块。
- 删 public `handleFillPointerDown` / `handleFillPointerMove` / `handleFillPointerUp`。
- 删 `private syncFillHandle()` 整块，及 `invalidate`/`paintSync` 里的 `this.syncFillHandle()` 调用（已由 Task 1 的 `syncFrameSyncs` 覆盖）。
- `SelectionDrag` 的 `syncFillHandle: () => this.syncFillHandle()` dep：改为 `syncFillHandle: () => this.invalidate()`（或删该 dep，若 SelectionDrag 仅用它触发一次重绘——按 SelectionDrag 实际用途选择；若语义不明 STOP）。
- `destroy()` 里 `this.fillLayer?.hidePreview()` 删除（layer 由 frameSync.destroy 处理）。
- `handleFillPointerUp` 里那两行 `columnReorderOverlay?.hide()` / `rowReorderOverlay?.hide()` 随方法删除（reorder overlay 不会与 fill 并发，无需在 fill commit 清理）。
- `FillEvent` 本地定义（180 行）：若 Task 1 Step 7 未删，此处删，改 `import type { FillEvent } from '../interaction/drag/WebDragContribution'`（`setOnFill` / `onFill` 字段保留）。

- [ ] **Step 7: 迁移测试到 feature**

`packages/feature-fill-handle/tests/FillHandleController.test.ts`（自 `FillHandleDrag.test.ts`）：

- import 改 `import { FillHandleController } from '../src'`。
- 旧测试若直接 `new FillHandleDrag({ fillLayer, ... })` 并断言 `fillLayer.showPreview`：改为先 `controller.attach(container)`，用一个能记录 `showPreview`/`sync` 的 `DomFillHandleLayer` 真实例或对 `container` 查询 DOM；或保留对 `DomFillHandleLayer` 的行为断言但通过 `attach` 注入容器。
- `tryStartFromClient` 等已改私有：测试改为通过 `attach` 后模拟 layer 的 pointer 回调，或新增针对 `syncFrame` 的断言。
- `commitCellEdit` dep 改 `commitActiveEdit`。

`packages/feature-fill-handle/tests/WebGridRuntime.fill.test.ts`（自 web runtime fill 测试）：

- `import { WebGridRuntime } from '@novasheet/web'`；`import { installFillHandleFeature } from '../src'`。
- 构造 runtime 前 `const ctx = createSheetContext(); installFillHandleFeature(ctx)`，`new WebGridRuntime({ ..., context: ctx })`。
- 旧测试若调用 `runtime.handleFillPointerDown(...)`：改为通过 fill layer 的 DOM pointer 事件或 controller 入口触发。若该测试强耦合已删的 runtime 方法且改造成本高，STOP 并报告，由 controller 单测覆盖等价行为。

`packages/feature-fill-handle/tests/installFillHandleFeature.test.ts`（新建）：

```ts
import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import { getWebDragContributions } from '@novasheet/web'
import { installFillHandleFeature } from '../src'

describe('installFillHandleFeature', () => {
  it('注册 fill-handle drag contribution', () => {
    const ctx = createSheetContext()
    installFillHandleFeature(ctx)
    expect(getWebDragContributions(ctx).map((c) => c.id)).toEqual(['fill-handle'])
  })
})
```

`computeFillHandleRect.test.ts`：若 web 原有 `computeFillHandleRect` 测试，`git mv` 过来并改 import 自 `../src/computeFillHandleRect`；否则按原 `RangeOverlayRects.test.ts` 中相关用例抽出。

- [ ] **Step 8: 跑全量验证（必须一次绿）**

```bash
bun install
bun test packages/feature-fill-handle/tests
bun test packages/web/tests
bun run --filter @novasheet/feature-fill-handle typecheck
bun run --filter @novasheet/web typecheck
bun run --filter @novasheet/web build
bun run --filter @novasheet/feature-fill-handle build
bun run lint
```

Expected: all exit 0。

- [ ] **Step 9: Commit**

```bash
git add bun.lock tsconfig.base.json packages/feature-fill-handle packages/web/src packages/web/tests
git commit -m "feat(fill-handle): 新增填充柄能力包并接入 frame-sync 基座"
```

---

## Task 4: `@novasheet/sheet` 默认安装 + backend 删除 fill 层

**Files:**

- Modify: `packages/sheet/package.json`、`packages/sheet/build.ts`、`packages/sheet/src/defaults/installDefaultExtensions.ts`、`packages/sheet/src/backends/Canvas2DBackend.ts`
- Test: `packages/sheet/tests/Grid.context.test.ts`

- [ ] **Step 1: 写失败测试**

Append to `packages/sheet/tests/Grid.context.test.ts`：

```ts
it('默认 context 安装 fill-handle drag', () => {
  const ctx = createSheetContext<CanvasRenderingContext2D, HTMLElement>()
  const grid = new Grid(document.createElement('div'), { data, context: ctx })
  expect(getWebDragContributions(ctx).map((c) => c.id)).toContain('fill-handle')
  grid.destroy()
})
```

> `getWebDragContributions` 从 `@novasheet/web` import（若文件未引入则加）。

Run:

```bash
bun test packages/sheet/tests/Grid.context.test.ts
```

Expected: FAIL —— 默认未安装 fill。

- [ ] **Step 2: 加依赖与 external**

`packages/sheet/package.json` dependencies 加：

```json
"@novasheet/feature-fill-handle": "^0.1.0",
```

`packages/sheet/build.ts` `EXTERNALS` 加 `'@novasheet/feature-fill-handle'`。

Run：`bun install`。

- [ ] **Step 3: 默认安装**

`packages/sheet/src/defaults/installDefaultExtensions.ts`：

```ts
import { installFillHandleFeature } from '@novasheet/feature-fill-handle'

export function installDefaultExtensions(ctx: SheetContext): void {
  installBasicCells(ctx)
  installResizeFeature(ctx)
  installFillHandleFeature(ctx)
  installRowColumnReorder(ctx)
}
```

- [ ] **Step 4: backend 删除 fill 层构造**

`packages/sheet/src/backends/Canvas2DBackend.ts`：

- 删 import `DomFillHandleLayer`（行 58）。
- 删字段 `private fillHandleLayer: DomFillHandleLayer`（行 94）。
- 删 `this.fillHandleLayer = new DomFillHandleLayer(...)` + `.attach()`（172–177）。
- 删传给 runtime 的 `fillLayer: this.fillHandleLayer`（行 212）。
- 删 `this.fillHandleLayer.destroy()`（行 366）。
- 保留 `FillEvent` import（行 69）与 `onFill` 公共方法（行 134/270/402）—— `Grid.onFill` 链路不变。

- [ ] **Step 5: 跑测试 + gates**

```bash
bun test packages/sheet/tests/Grid.context.test.ts
bun run --filter @novasheet/sheet typecheck
bun run --filter @novasheet/feature-fill-handle build
bun run --filter @novasheet/web build
bun run --filter @novasheet/sheet build
bun run lint
```

Expected: all exit 0。

- [ ] **Step 6: Commit**

```bash
git add bun.lock packages/sheet/package.json packages/sheet/build.ts packages/sheet/src/defaults/installDefaultExtensions.ts packages/sheet/src/backends/Canvas2DBackend.ts packages/sheet/tests/Grid.context.test.ts
git commit -m "feat(sheet): 默认安装 fill-handle 能力并移除 backend fill 层构造"
```

---

## Task 5: 文档与全量验证

**Files:**

- Modify: `docs/architecture.md`
- Modify: `docs/superpowers/plans/2026-06-02-novasheet-feature-package-roadmap.md`
- Modify: `docs/superpowers/plans/2026-06-02-novasheet-fill-handle-feature-package.md`（本文件，加执行状态）

- [ ] **Step 1: 架构文档**

`docs/architecture.md` Feature Packages 段加：

```md
`@novasheet/feature-fill-handle` 拥有填充柄交互（`FillHandleController` = `Drag` + `WebFrameSync`，
独占持有 `DomFillHandleLayer`），通过 `web.drag` contribution 安装。`@novasheet/web` 提供 feature-agnostic
的 `WebFrameSync` 每帧同步契约；填充语义（`computeFillTarget` / `commitFill`）留在 `@novasheet/core`。
已知债务：`onFill` 仍走 web `setOnFill`（待 engine 事件系统）。
```

- [ ] **Step 2: roadmap 标记 phase 3 完成**

`docs/superpowers/plans/2026-06-02-novasheet-feature-package-roadmap.md` 总进度表 phase 3 行状态 `[ ]` → `[x]`，实施计划列填 `2026-06-02-novasheet-fill-handle-feature-package.md`；更新「当前执行焦点」为 phase 3 完成、下一焦点 phase 4 editing。

- [ ] **Step 3: 本计划加执行状态**

本文件顶部加：

```md
**Execution Status (2026-06-02):** Completed Task 1-5. 决策 B：onFill 暂留 web。全量 gates 通过。
```

- [ ] **Step 4: 全量 gates**

```bash
bun run lint
bun run --filter '*' typecheck
bun test
bun run --filter @novasheet/core build
bun run --filter @novasheet/web build
bun run --filter @novasheet/feature-fill-handle build
bun run --filter @novasheet/canvas2d build
bun run --filter @novasheet/sheet build
```

Expected: all exit 0。

- [ ] **Step 5: Commit**

```bash
git add docs/architecture.md docs/superpowers/plans/2026-06-02-novasheet-feature-package-roadmap.md docs/superpowers/plans/2026-06-02-novasheet-fill-handle-feature-package.md
git commit -m "docs(plan): 标记 fill-handle 能力包完成"
```

---

## Self-Review

- **Spec coverage：** Task 1=WebFrameSync 基座 + 通用 services + onFill 债务 deps；Task 2=mergeVisualRange→core；Task 3=feature 包 + 整竖切片 + runtime 清理 + FillEvent 落 web 契约 + 测试迁移；Task 4=默认安装 + backend 清理；Task 5=docs + gates。覆盖 spec 全部小节。
- **决策 B 一致性：** 未引入 engine 事件；`onFill`/`setOnFill`/`FillEvent` 保留在 web；sheet onFill 链路零改。
- **类型一致性：** `FillHandleController` / `FillHandleControllerDeps` / `WebFrameSync` / `WebInteractionStatus` / `installFillHandleFeature` / `commitActiveEdit` 跨 Task 命名一致；`FillEvent` 规范定义单点（`WebDragContribution.ts`）。
- **原子性：** Task 3 跨 `git mv` + runtime 删码不中途 commit，Step 8 首次绿。
- **占位扫描：** 无 TBD。Step 3(fixtures)/Task3 Step7(测试改造) 因依赖现状测试细节，已显式标注「以现有 doubles/用例为准 + 不符 STOP」，非占位而是受控不确定点。
- **已知风险已前置：** `interacting` 聚合、`FillEvent` 双定义、frame 选择差异、`SelectionDrag.syncFillHandle` dep 改法均标 STOP+ASK。
