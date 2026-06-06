# Web 合并进 Core（依赖反转）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `@novasheet/web` 的表格控件 DOM 壳整体并入 `@novasheet/core`，反转渲染后端依赖为 `@novasheet/canvas2d → core`，删除 `@novasheet/web`，全程零行为变化。

**Architecture:** core 内部分两段——纯模型（`kernel`/`features`/`engine`/`ports`，零 DOM）与 DOM 壳（`dom/**`，browser-only，单向依赖纯模型）。渲染后端经 core 的 `RenderBackend` 端口反转注入；`canvas2d` 导出 `canvas2dBackend` 工厂，组合根（storybook）`new Grid({ data, backend: canvas2dBackend })` 注入。

**Tech Stack:** bun workspaces、TypeScript strict（`verbatimModuleSyntax`/`noUncheckedIndexedAccess`）、`bun test`、happy-dom、ESLint。

**前置阅读：** `docs/superpowers/specs/2026-06-06-novasheet-web-into-core-dip-design.md`（本计划的真理来源，§4 迁移映射、§5 select 范例、§6 端口/组合根）。

---

## 关于本计划的性质（执行者必读）

这是**行为保持的重构**，不是新功能。因此：

- **不写新的失败测试**作为 TDD 起点；**回归测试套件保持全绿**就是每个 Task 的验收门。
- 每个 Task 末尾的固定门（除非该 Task 另有说明）：
  - `bun run --filter '*' typecheck` —— 0 error
  - `bun test` —— 全绿
  - `bun run lint` —— 0 error / 0 warning
- **已知计划风险点**在对应 Task 标注「⚠️ STOP+ASK」。遇到与计划矛盾的实际接线（尤其 measurer 共享、`setData` renderer 重建、surface 所有权），**停下来问**，不要静默改。
- 一个 Task = 一个 commit（中文 body，Conventional Commits 前缀英文）。
- 移动文件优先用 `git mv` 保留历史。

### 文件依赖层级（决定移动顺序，自底向上）

```
1  render/WebRenderer        → core only（端口，叶子）
2  scroll/*, host/WebHost,   → core only（叶子）
   host/*-style
3  host/DomGridHost          → scroll + WebHost + style
4  interaction/**, overlay/**,→ host/WebHost + core
   handle/**, clipboard/*
5  runtime/WebGridRuntime    → 1–4 全部
6  backends/Canvas2DBackend  → runtime + canvas2d（唯一 canvas2d importer）
7  Grid.ts                   → backend
```

自底向上搬：已搬入 core 的文件只依赖「已搬入 core 或纯 core」；仍在 web 的文件把对它们的 import 改成 `@novasheet/core`。任何时刻不出现 `core → web` 边。

---

## Task 1：RenderBackend 端口（移 WebRenderer 进 core/ports，反转命名）

**Files:**
- Create: `packages/core/src/ports/RenderBackend.ts`
- Delete: `packages/web/src/render/WebRenderer.ts`
- Modify: `packages/core/src/index.ts`（导出端口）
- Modify: `packages/canvas2d/src/render/Canvas2DRenderer.ts`（`implements RenderBackend`）
- Modify: `packages/web/src/runtime/WebGridRuntime.ts:90`、`packages/web/src/index.ts`、`packages/web/src/Grid.ts`（改 import 来源）

- [ ] **Step 1: 建端口文件**（内容即原 `WebRenderer.ts`，接口改名 `RenderBackend`）

```ts
// packages/core/src/ports/RenderBackend.ts
/**
 * 渲染后端端口——所有绘制后端（Canvas2D / WebGL / WebGPU）实现它。
 * 实现分布在各后端包（如 `@novasheet/canvas2d`）。只负责绘制表面生命周期；
 * 滚动与布局状态由 DOM 壳的 runtime + engine 管理。
 */
import type { RenderFrame } from '../kernel/render/RenderFrame'

export interface RenderBackend {
  /** 将绘制表面挂到容器（Canvas2D 过渡期可能仍为 no-op，由后端工厂创建 canvas）。 */
  mount(container: HTMLElement): void
  /** 按 CSS 尺寸与 DPR 调整绘制表面。 */
  resize(width: number, height: number, dpr: number): void
  /** 根据引擎快照绘制一帧（同步；调度由 runtime 负责）。 */
  render(frame: RenderFrame): void
  destroy(): void
}
```

> ⚠️ 确认 `RenderFrame` 在 core 的真实相对路径（`kernel/render/RenderFrame`）；若 barrel 路径不同，用 core 内规范路径。

- [ ] **Step 2: core 导出端口**

在 `packages/core/src/index.ts` 加：

```ts
export type { RenderBackend } from './ports/RenderBackend'
```

- [ ] **Step 3: canvas2d 实现端口**

`packages/canvas2d/src/render/Canvas2DRenderer.ts`：加 `import type { RenderBackend } from '@novasheet/core'`，类声明改为 `export class Canvas2DRenderer implements RenderBackend`。（其 `mount/resize/render/destroy` 已存在；只是补名义实现。）

- [ ] **Step 4: web 改用 core 端口**

- `packages/web/src/runtime/WebGridRuntime.ts`：把 `import type { WebRenderer } from '../render/WebRenderer'` 改为 `import type { RenderBackend } from '@novasheet/core'`，文件内 `WebRenderer` 类型引用全部改 `RenderBackend`。
- `packages/web/src/index.ts`：删 `export type { WebRenderer } from './render/WebRenderer'`，加 `export type { RenderBackend } from '@novasheet/core'`。
- `packages/web/src/Grid.ts`：`GridRendererBackend` 若引用 `WebRenderer`，改 `RenderBackend`（来源 `@novasheet/core`）。
- 删除 `packages/web/src/render/WebRenderer.ts`。

- [ ] **Step 5: 验证 + 提交**

```bash
cd /Users/rongts/NovaSheet
bun run --filter '*' typecheck && bun test && bun run lint
git add -A
git commit -m "refactor(core): 渲染后端端口 RenderBackend 入 core/ports，canvas2d 反向实现"
```
Expected: typecheck/test/lint 全绿。

---

## Task 2：移叶子 DOM 模块进 core/dom（scroll + host 原语）

**Files（git mv）:**
- `packages/web/src/scroll/NativeScroller.ts` → `packages/core/src/dom/scroll/NativeScroller.ts`
- `packages/web/src/scroll/ScrollMapper.ts` → `packages/core/src/dom/scroll/ScrollMapper.ts`
- `packages/web/src/host/WebHost.ts` → `packages/core/src/dom/host/Host.ts`
- `packages/web/src/host/scrollbar-style.ts` → `packages/core/src/dom/host/scrollbar-style.ts`
- `packages/web/src/host/DomGridHost.ts` → `packages/core/src/dom/host/DomGridHost.ts`
- Create: `packages/core/src/dom/index.ts`（DOM 壳 barrel）
- Modify: `packages/core/src/index.ts`、web 中各 importer

> **只迁 `scrollbar-style.ts`**（其消费者 `DomGridHost` 本 Task 迁入 core，可走相对 import）。其余 4 个 style 文件（`cell-editor-style`/`context-menu-style`/`filter-popover-style`/`resize-handle-style`）的消费者（`DomCellEditor`/`DomContextMenuLayer`/`FilterPopover`/`DomHandleLayer`）在 Task 3 才迁，**故这 4 个 style 文件随消费者一起放到 Task 3 迁移**——避免它们的 DOM 操纵函数被迫进 `@novasheet/core` 公共 API。barrel 不导出任何 `ensure*/apply*Style`。

> 命名：`WebHost.ts → Host.ts`，但内部导出名 `WebHost`/`WebPointerEvent`/`WebKeyboardEvent`/`WebHostOptions`/`WebHostFactory` **本 Task 暂不改**（减小一次 churn；后续可选改名 Task）。

- [ ] **Step 1: git mv 上述文件**

```bash
cd /Users/rongts/NovaSheet
mkdir -p packages/core/src/dom/scroll packages/core/src/dom/host
git mv packages/web/src/scroll/NativeScroller.ts packages/core/src/dom/scroll/NativeScroller.ts
git mv packages/web/src/scroll/ScrollMapper.ts packages/core/src/dom/scroll/ScrollMapper.ts
git mv packages/web/src/host/WebHost.ts packages/core/src/dom/host/Host.ts
git mv packages/web/src/host/scrollbar-style.ts packages/core/src/dom/host/scrollbar-style.ts
git mv packages/web/src/host/DomGridHost.ts packages/core/src/dom/host/DomGridHost.ts
```

- [ ] **Step 2: 修正已移动文件的内部 import**

- `dom/host/Host.ts`：`from '@novasheet/core'` 的 import 改为 core 内**相对路径**（如 `FrameScheduler`/`ThemeScrollbar` → 对应 `../../kernel/...` 规范路径）。⚠️ 用 core 内部规范路径，勿保留 `@novasheet/core` 自引用。
- `dom/host/DomGridHost.ts`：`'../scroll/NativeScroller'` → `'../scroll/NativeScroller'`（同名仍成立）；`'./WebHost'` → `'./Host'`；`'./scrollbar-style'` 不变；`from '@novasheet/core'` 的核心符号改 core 内相对路径。
- `dom/scroll/*`：原本只依赖 `@novasheet/core`，改为 core 内相对路径。

- [ ] **Step 3: core barrel 导出**

```ts
// packages/core/src/dom/index.ts
export { NativeScroller } from './scroll/NativeScroller'
export type { ScrollListener } from './scroll/NativeScroller'
export { ScrollMapper, SAFE_MAX } from './scroll/ScrollMapper'
export { DomGridHost } from './host/DomGridHost'
export type { WebHost, WebHostOptions, WebHostFactory, WebPointerEvent, WebKeyboardEvent } from './host/Host'
```

`packages/core/src/index.ts` 加 `export * from './dom'`。

- [ ] **Step 4: web 中 importer 改指向 core**

web 仍在的文件里，对上述符号的相对 import 改为 `@novasheet/core`：
- `runtime/WebGridRuntime.ts:89`（`../host/WebHost` → `@novasheet/core`，名 `WebHost`/`WebPointerEvent` 等）、`:92`（`../scroll/ScrollMapper` → `@novasheet/core`）。
- `interaction/drag/{SelectionDrag,ColumnHeaderDrag,FillHandleDrag,ResizeDrag,RowHeaderDrag,Drag}.ts`：`../../host/WebHost` → `@novasheet/core`。
- `backends/Canvas2DBackend.ts`：`../host/DomGridHost` → `@novasheet/core`、`../host/WebHost`（若有）→ `@novasheet/core`。
- `index.ts`：`ScrollMapper`/`SAFE_MAX`/`NativeScroller`/`DomGridHost`/`WebHost*` 等改从 `@novasheet/core` re-export（或直接删，统一由 core 公开）。

- [ ] **Step 5: 验证 + 提交**

```bash
bun run --filter '*' typecheck && bun test && bun run lint
git add -A
git commit -m "refactor(core): scroll/host DOM 原语迁入 core/dom，web 改指向 core"
```

---

## Task 3：移 interaction / overlay / handle / clipboard 进 core/dom

**Files（git mv）:**
- `packages/web/src/interaction/drag/*` → `packages/core/src/dom/interaction/drag/*`
- `packages/web/src/interaction/{DomCellEditor,DomContextMenuLayer,DomFillHandleLayer,DomHandleLayer}.ts` → `packages/core/src/dom/interaction/`
- `packages/web/src/interaction/{FilterPopover,RangeOverlayRects}.ts` → `packages/core/src/dom/overlay/`
- `packages/web/src/handle/{HideToggleHandle,HideColToggleHandle}.ts` → `packages/core/src/dom/interaction/handle/`
- `packages/web/src/overlay/*` → `packages/core/src/dom/overlay/*`
- `packages/web/src/host/{cell-editor-style,context-menu-style,filter-popover-style,resize-handle-style}.ts` → `packages/core/src/dom/host/`（**随其消费者一起迁，见 Task 2 订正**；消费者 `DomCellEditor`/`DomContextMenuLayer`/`FilterPopover`/`DomHandleLayer` 改走 core 内相对 import，barrel 不导出这些 style 函数）
- `packages/web/tests/host/resize-handle-style.test.ts` → `packages/core/tests/dom/host/resize-handle-style.test.ts`
- `packages/web/src/clipboard/WebClipboardAdapter.ts` → `packages/core/src/dom/clipboard/DomClipboardAdapter.ts`（类同时改名 `WebClipboardAdapter → DomClipboardAdapter`）

- [ ] **Step 1: git mv 全部上述文件**

```bash
cd /Users/rongts/NovaSheet
mkdir -p packages/core/src/dom/interaction/drag packages/core/src/dom/interaction/handle packages/core/src/dom/overlay packages/core/src/dom/clipboard
git mv packages/web/src/interaction/drag/* packages/core/src/dom/interaction/drag/
git mv packages/web/src/interaction/DomCellEditor.ts packages/core/src/dom/interaction/DomCellEditor.ts
git mv packages/web/src/interaction/DomContextMenuLayer.ts packages/core/src/dom/interaction/DomContextMenuLayer.ts
git mv packages/web/src/interaction/DomFillHandleLayer.ts packages/core/src/dom/interaction/DomFillHandleLayer.ts
git mv packages/web/src/interaction/DomHandleLayer.ts packages/core/src/dom/interaction/DomHandleLayer.ts
git mv packages/web/src/interaction/FilterPopover.ts packages/core/src/dom/overlay/FilterPopover.ts
git mv packages/web/src/interaction/RangeOverlayRects.ts packages/core/src/dom/overlay/RangeOverlayRects.ts
git mv packages/web/src/handle/HideToggleHandle.ts packages/core/src/dom/interaction/handle/HideToggleHandle.ts
git mv packages/web/src/handle/HideColToggleHandle.ts packages/core/src/dom/interaction/handle/HideColToggleHandle.ts
git mv packages/web/src/overlay/SelectionOverlay.ts packages/core/src/dom/overlay/SelectionOverlay.ts
git mv packages/web/src/overlay/ColumnReorderOverlay.ts packages/core/src/dom/overlay/ColumnReorderOverlay.ts
git mv packages/web/src/overlay/RowReorderOverlay.ts packages/core/src/dom/overlay/RowReorderOverlay.ts
git mv packages/web/src/overlay/ColumnWidthPopover.ts packages/core/src/dom/overlay/ColumnWidthPopover.ts
git mv packages/web/src/overlay/RowHeightPopover.ts packages/core/src/dom/overlay/RowHeightPopover.ts
git mv packages/web/src/host/cell-editor-style.ts packages/core/src/dom/host/cell-editor-style.ts
git mv packages/web/src/host/context-menu-style.ts packages/core/src/dom/host/context-menu-style.ts
git mv packages/web/src/host/filter-popover-style.ts packages/core/src/dom/host/filter-popover-style.ts
git mv packages/web/src/host/resize-handle-style.ts packages/core/src/dom/host/resize-handle-style.ts
git mv packages/web/tests/host/resize-handle-style.test.ts packages/core/tests/dom/host/resize-handle-style.test.ts
git mv packages/web/src/clipboard/WebClipboardAdapter.ts packages/core/src/dom/clipboard/DomClipboardAdapter.ts
```

> 这 4 个 style 文件的消费者（`DomCellEditor`/`DomContextMenuLayer`/`FilterPopover`/`DomHandleLayer`）本 Task 也迁入 core，故它们对 style 的 import 改为 core 内相对路径（`'../host/cell-editor-style'` 等）；`core/src/dom/index.ts` **不**导出任何 `ensure*/apply*Style` 函数。`resize-handle-style.test.ts` 的 import 改为 `'../../../src/dom/host/resize-handle-style'`。

- [ ] **Step 2: 修正已移动文件的 import**

对每个移动文件：
- 对 `@novasheet/core` 核心符号的 import → core 内相对路径。
- 对 host/scroll（Task 2 已入 core）的 import → core 内相对路径（如 `'../../host/WebHost'` → `'../host/Host'`、drag 下 `'../host/Host'`）。
- `DomClipboardAdapter.ts`：类名 `WebClipboardAdapter` → `DomClipboardAdapter`，更新文件内自引用与 TSDoc。

- [ ] **Step 3: core barrel 追加导出**

`packages/core/src/dom/index.ts` 追加（保持与原 web `index.ts` 公开面一致）：

```ts
export { DomClipboardAdapter } from './clipboard/DomClipboardAdapter'
// SelectionOverlay/handle/popover 等为内部装配用，按需导出（runtime/Grid 装配会从 core 内相对路径引用，不必进公共 barrel）
```

> ⚠️ 原 `web/index.ts` 仅公开 `WebClipboardAdapter`（现 `DomClipboardAdapter`）；overlay/handle/drag 是内部类，**不要**新增公共导出，避免扩大 public API。

- [ ] **Step 4: web 残留 importer 改指向 core**

`runtime/WebGridRuntime.ts:70–88`、`backends/Canvas2DBackend.ts`、`index.ts` 中对 interaction/overlay/handle/clipboard 的相对 import：
- 这些类的**装配**发生在 runtime/backend（下个 Task 才进 core），现阶段它们仍在 web，但被引用的类已进 core → 改为 `@novasheet/core` 内部相对…**不行**，web 不能用 core 内部相对路径。改为从 `@novasheet/core` 公共入口引用。
- 因 overlay/handle/drag 不进公共 barrel（Step 3），**本 Task 需临时**在 `core/src/index.ts` 经 `export * from './dom/_assembly'` 暴露这些内部类供 web 装配引用；该临时面在 Task 5（装配进 core）后**删除**。

> ⚠️ STOP+ASK：若不想引入临时 `_assembly` 公共面，可改为「Task 3 与 Task 4、5 合并为一个原子大移动」。两条路二选一前先确认——见本计划末尾「替代：原子大移动」。

- [ ] **Step 5: 验证 + 提交**

```bash
bun run --filter '*' typecheck && bun test && bun run lint
git add -A
git commit -m "refactor(core): interaction/overlay/handle/clipboard 迁入 core/dom"
```

---

## Task 4：移 runtime + GridController 进 core/dom/runtime

**Files（git mv）:**
- `packages/web/src/grid/GridController.ts` → `packages/core/src/dom/runtime/GridController.ts`
- `packages/web/src/runtime/WebGridRuntime.ts` → `packages/core/src/dom/runtime/GridRuntime.ts`（类名 `WebGridRuntime` → `GridRuntime`，类型 `WebGridRuntimeOptions` → `GridRuntimeOptions`）

- [ ] **Step 1: git mv + 改内部 import**

```bash
mkdir -p packages/core/src/dom/runtime
git mv packages/web/src/grid/GridController.ts packages/core/src/dom/runtime/GridController.ts
git mv packages/web/src/runtime/WebGridRuntime.ts packages/core/src/dom/runtime/GridRuntime.ts
```

`GridRuntime.ts` 内全部相对 import 改 core 内规范路径（interaction/overlay/handle/host/scroll/clipboard/ports 均已在 `core/src/dom/**` 与 `core/src/ports`）；`@novasheet/core` 核心符号改 core 内相对路径。类名 `WebGridRuntime → GridRuntime`、`WebGridRuntimeOptions → GridRuntimeOptions`。

- [ ] **Step 2: core 导出**

`core/src/dom/index.ts` 加：

```ts
export { GridRuntime } from './runtime/GridRuntime'
export type { GridRuntimeOptions } from './runtime/GridRuntime'
export type { AutofitRowsOptions, AutofitRowsResult, FillEvent, RedoEvent, UndoEvent, GridController } from './runtime/GridController'
```

- [ ] **Step 3: web 残留 importer 改指向 core**

`backends/Canvas2DBackend.ts`、`Grid.ts`：`WebGridRuntime`→`GridRuntime`、`../grid/GridController`→`@novasheet/core`、`../runtime/WebGridRuntime`→`@novasheet/core`。

- [ ] **Step 4: 验证 + 提交**

```bash
bun run --filter '*' typecheck && bun test && bun run lint
git add -A
git commit -m "refactor(core): WebGridRuntime→GridRuntime 迁入 core/dom/runtime"
```

---

## Task 5：拆 Canvas2DBackend → `canvas2dBackend` 工厂（canvas2d）+ 通用装配（core）

DIP 完成：去掉最后的 `web → canvas2d` 边，且不产生 `core → canvas2d` 边。

**Files:**
- Modify: `packages/core/src/ports/RenderBackend.ts`（加工厂契约类型）
- Create: `packages/canvas2d/src/backend/canvas2dBackend.ts` + `packages/canvas2d/src/index.ts` 导出
- Create: `packages/core/src/dom/runtime/GridControllerImpl.ts`（通用装配，来自 `Canvas2DBackend` 去掉 canvas2d 专有部分）
- Delete: `packages/web/src/backends/Canvas2DBackend.ts`

### canvas2d 专有 vs 通用（来自 `Canvas2DBackend.ts` 现状）

| 专有（进工厂，留 canvas2d） | 通用（进 core 装配） |
| --- | --- |
| `canvas = document.createElement('canvas')` + style + `container.appendChild`（L163–171） | engine / pipeline / sort/filter layer / 全部 DOM 层（host/handle/fill/hide/overlay/cellEditor/contextMenu/popover）/ runtime / clipboard |
| `getContext('2d')`（L173–175） | `scheduler`（core `FrameScheduler`，共享给工厂） |
| `new HighDPI(canvas, ctx)`（L177） | `runtime.setData(composed, rebuildCb)` 编排 |
| `createRenderer()` → `new Canvas2DRenderer({ ctx, ...engine getters, scheduler, measurer })`（L542+） | 监听器集合 / 事件转发 / 公开 API |
| `measurer = new Canvas2DTextMeasurer()`（L141，共享给 runtime） | |
| `onSurfaceResize:(w,h)=>highDpi.resize(w,h)`（L238） | |

- [ ] **Step 1: 工厂契约入端口**

```ts
// packages/core/src/ports/RenderBackend.ts （追加）
import type { FrameScheduler } from '../kernel/...'      // 规范路径
import type { TextMeasurer } from '../kernel/...'         // 规范路径
import type { GridEngineFrameSource } from '...'          // engine 暴露 getData/getViewport/getRowsAxis/getColsAxis/getTheme 的最窄接口

/** 后端工厂构造时的纯依赖（core 提供）。 */
export interface RenderBackendDeps {
  readonly container: HTMLElement
  readonly engine: GridEngineFrameSource
  readonly scheduler: FrameScheduler
}

/** 后端工厂返回给装配层的句柄：渲染器 + 共享 measurer + 重建/尺寸钩子。 */
export interface RenderBackendHandle {
  readonly renderer: RenderBackend
  readonly measurer: TextMeasurer
  /** `setData` 后按当前 engine 重建渲染器（对应原 createRenderer）。 */
  createRenderer(engine: GridEngineFrameSource): RenderBackend
  /** CSS 尺寸变化时同步绘制表面（对应原 highDpi.resize）。 */
  resizeSurface(width: number, height: number): void
  destroy(): void
}

export type RenderBackendFactory = (deps: RenderBackendDeps) => RenderBackendHandle
```

> ⚠️ STOP+ASK：`GridEngineFrameSource` 取 `DefaultGridEngine` 上 `getData/getViewport/getRowsAxis/getColsAxis/getTheme` 的最窄只读接口；若 engine 已有等价类型则复用，勿新造重复类型。

- [ ] **Step 2: canvas2d 工厂实现**

```ts
// packages/canvas2d/src/backend/canvas2dBackend.ts
import type { RenderBackendDeps, RenderBackendHandle, RenderBackend, GridEngineFrameSource } from '@novasheet/core'
import { Canvas2DRenderer } from '../render/Canvas2DRenderer'
import { Canvas2DTextMeasurer } from '../measure/Canvas2DTextMeasurer'
import { HighDPI } from '../surface/HighDPI'

export const canvas2dBackend: RenderBackendFactory = ({ container, engine, scheduler }) => {
  const canvas = document.createElement('canvas')
  Object.assign(canvas.style, { position: 'absolute', top: '0', left: '0', pointerEvents: 'none', zIndex: '0' })
  container.appendChild(canvas)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('NovaSheet: 2d canvas context unavailable')
  const highDpi = new HighDPI(canvas, ctx)
  const measurer = new Canvas2DTextMeasurer()
  const createRenderer = (e: GridEngineFrameSource): RenderBackend =>
    new Canvas2DRenderer({
      ctx, data: e.getData(), viewport: e.getViewport(),
      rowsAxis: e.getRowsAxis(), colsAxis: e.getColsAxis(), theme: e.getTheme(),
      scheduler, measurer,
    })
  return {
    renderer: createRenderer(engine),
    measurer,
    createRenderer,
    resizeSurface: (w, h) => highDpi.resize(w, h),
    destroy: () => canvas.remove(),
  }
}
```

`packages/canvas2d/src/index.ts` 加 `export { canvas2dBackend } from './backend/canvas2dBackend'`。

- [ ] **Step 3: 通用装配进 core**

把 `Canvas2DBackend.ts` 的通用部分搬成 `core/src/dom/runtime/GridControllerImpl.ts`（类名沿用 `GridControllerImpl implements GridController`），改动：
- 构造签名加 `backend: RenderBackendFactory`。
- 用 `const handle = backend({ container, engine: this.engine, scheduler: this.scheduler })` 替代原 canvas/ctx/highDpi/renderer/measurer 字段；`this.renderer = handle.renderer`、`this.measurer = handle.measurer`。
- 原 `onSurfaceResize:(w,h)=>this.highDpi.resize(w,h)` → `(w,h)=>handle.resizeSurface(w,h)`。
- 原 `this.renderer = this.runtime.setData(composed, () => this.createRenderer())` → `() => handle.createRenderer(this.engine)`。
- `destroy()` 调 `handle.destroy()`。
- 删除所有 `@novasheet/canvas2d` import。

- [ ] **Step 4: 删 web backend，验证 + 提交**

```bash
git rm packages/web/src/backends/Canvas2DBackend.ts
bun run --filter '*' typecheck && bun test && bun run lint
git add -A
git commit -m "refactor(core): Canvas2DBackend 拆为 canvas2dBackend 工厂(canvas2d)+通用装配(core)，反转依赖"
```

> ⚠️ STOP+ASK：若 `runtime.setData` 的 renderer-rebuild 回调签名、或 measurer 在 runtime 内的消费方式与上述不符，停下来确认再改。

---

## Task 6：Grid facade 进 core，删除 @novasheet/web

**Files:**
- `packages/web/src/Grid.ts` → `packages/core/src/Grid.ts`（装配改用 `GridControllerImpl` + 注入 backend）
- Modify: `packages/core/src/index.ts`、`apps/storybook/**`、根 `bunfig.toml`、`package.json`(workspaces/scripts)、`tsconfig*`
- Delete: 整个 `packages/web/`

- [ ] **Step 1: git mv Grid + 接通 backend 注入**

```bash
git mv packages/web/src/Grid.ts packages/core/src/Grid.ts
```

`core/src/Grid.ts`：
- import 改 core 内相对路径（`GridControllerImpl`、类型）。
- `GridOptions` 加 `backend: RenderBackendFactory`（必填）。
- 内部 `new GridControllerImpl(container, engineOptions, gridOptions, backend)`。
- `core/src/index.ts` 加 `export { Grid, withExcelHeaders } from './Grid'` + `export type { GridOptions } from './Grid'`，并移除 Task 3 引入的临时 `_assembly` 公共面。

- [ ] **Step 2: 删除 web 包**

```bash
git rm -r packages/web
```

- [ ] **Step 3: 组合根改注入 backend**

`apps/storybook/**` 中所有 `import { Grid } from '@novasheet/web'` →
```ts
import { Grid } from '@novasheet/core'
import { canvas2dBackend } from '@novasheet/canvas2d'
// new Grid({ ...opts, backend: canvas2dBackend })
```
逐处给 `new Grid({...})` 加 `backend: canvas2dBackend`。其余从 `@novasheet/web` 的 import 改 `@novasheet/core`。

- [ ] **Step 4: 工具链收尾**

- 根 `package.json` workspaces 去掉 web；build script 去掉 `@novasheet/web`，build 顺序改 `core → canvas2d`。
- `bunfig.toml`：preload 链去掉 web setup；core 段补 happy-dom（DOM 壳测试需要）。⚠️ 纯引擎测试不应被 happy-dom 拖累——见 Task 7 两档 setup。
- `tsconfig*`：去掉 web 的 project reference / paths。
- 全仓 grep `@novasheet/web` 应为 0 命中。

- [ ] **Step 5: 验证 + 提交**

```bash
grep -rln "@novasheet/web" packages apps && echo "STILL REFERENCED" || echo "clean"
bun run --filter '*' typecheck && bun test && bun run lint
bun run --filter @novasheet/canvas2d build && bun run --filter @novasheet/core build
git add -A
git commit -m "refactor(core): Grid facade 入 core 并注入 backend；删除 @novasheet/web"
```
Expected: grep `clean`；四关全绿；build 成功。

---

## Task 7：ESLint 边界规则 + 两档测试 setup + 文档改写

**Files:**
- Modify: `.eslintrc*` / `eslint.config.*`、`bunfig.toml`、`packages/core/tests/setup*.ts`
- Modify: `CLAUDE.md`、`packages/core/src/ARCHITECTURE.md`、`packages/core/src/engine/README.md`

- [ ] **Step 1: import 边界规则**

加 `no-restricted-imports` / `import/no-restricted-paths`：
- `core/src/{kernel,features,engine,ports}/**` 禁止 import `core/src/dom/**`。
- 同上目录禁用 DOM 全局（`no-restricted-globals`: `document`/`window` 等；或 env 限定）。
- `core/src/dom/**` 允许依赖纯层，禁被纯层依赖（由上一条覆盖）。

- [ ] **Step 2: 两档 test setup**

- core 纯层测试（`tests/kernel`、`tests/features`、`tests/engine`）走**无 happy-dom** setup。
- core DOM 壳测试（`tests/dom/**`，含原 web 测试迁入）走 **happy-dom** setup。
- `bunfig.toml` preload 按目录分档；确认原 `packages/web/tests/**` 已迁入 `packages/core/tests/dom/**`（随 Task 2–6 的源文件移动同步迁移其测试）。

> ⚠️ STOP+ASK：bun 的 preload 是否支持按测试路径分档？若不支持，改为单一 happy-dom setup + 纯层测试不依赖 DOM（happy-dom 仅注册全局，纯层测试不触碰即可），并在本 Step 记录该退路。

- [ ] **Step 3: 文档改写**

- `CLAUDE.md`：重写「Dependency direction」「@novasheet/core — platform-independent / 无 DOM」「Current state」三处；不变量 #1 措辞（Renderer 仍只读 engine frame，host 在 core 内）；新增 ADR 行「core 吸收 DOM，渲染后端 DIP 注入」。包列表去掉 `@novasheet/web`。
- `ARCHITECTURE.md`：加 core 内「纯模型 / DOM 壳 / ports」三段与单向依赖规则。
- `engine/README.md`：导航补 `dom/` 层。

- [ ] **Step 4: 验证 + 提交**

```bash
bun run lint && bun run --filter '*' typecheck && bun test
git add -A
git commit -m "chore(core): 加纯层/ DOM 壳 ESLint 边界规则、两档 test setup、文档改写"
```

---

## 替代：原子大移动（Task 3–6 合并）

若不接受 Task 3 的临时 `_assembly` 公共面（⚠️ 点），可将 Task 3/4/5/6 合并为**一个原子 commit**：一次 `git mv` 全部 DOM 壳 + Grid 进 core、一次性重写所有 import、拆 backend、删 web，仅在末尾跑一次四关门。代价：单 commit 大、中途不可分步验证；收益：不引入临时公共面、不出现中途跨包边。**执行前与用户确认走分步（Task 3–6）还是原子。**

---

## Self-Review（计划 vs spec）

- **spec §2 决策**：core 吸收 DOM（Task 2–6）、DIP 反转（Task 1/5）、web 退休（Task 6）、纯重构零行为变化（全程门）✅
- **spec §4 目录/映射**：逐文件覆盖于 Task 2–6 的 `git mv` 列表 ✅
- **spec §5 select 范例**：无需代码改动（边界本就单向），由 ESLint 规则 Task 7 固化 ✅
- **spec §6 端口/组合根**：`RenderBackend`(Task 1) + 工厂契约/实现/注入(Task 5) + storybook 注入(Task 6) ✅
- **spec §8 工具链/文档**：Task 6 Step 4 + Task 7 ✅
- **spec §9 风险**：先翻转 DIP 边（Task 1/5 顺序）、两档 setup（Task 7）、canvas 所有权（Task 5 工厂持有）、增量+全程 typecheck（每 Task）✅
- **类型一致性**：`RenderBackend`/`RenderBackendHandle`/`RenderBackendFactory`/`GridEngineFrameSource`/`GridRuntime`/`canvas2dBackend` 在 Task 1/5/6 命名一致 ✅
- **占位符扫描**：无 TBD；两处 ⚠️ STOP+ASK 为有意的风险闸（measurer/setData 接线、preload 分档），非占位符 ✅
```
