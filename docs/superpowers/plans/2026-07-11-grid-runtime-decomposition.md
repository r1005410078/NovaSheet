# GridRuntime 分解实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 2981 行的 `GridRuntime.ts` 分解为薄组合根 + 8 个域 controller + 1 个 flush pipeline,并在 Phase 2 把 mutation passthrough 职责挪回 `GridControllerImpl` 直调 engine。

**Architecture:** 沿用现有 Drag 类的窄 deps-object + 闭包注入模式;GridRuntime 保留为唯一 wiring 点,controller 之间零互相 import。Phase 1 九个 task 纯机械拆分(runtime 公开面零变化),Phase 2 两个 task 做 mutation 改道。

**Tech Stack:** TypeScript strict(`noUncheckedIndexedAccess` + `verbatimModuleSyntax`)、bun workspaces、`bun:test`。

**Spec:** `docs/superpowers/specs/2026-07-11-grid-runtime-decomposition-design.md`(§3.2 成员分派表、§3.4 跨域契约、§4 特例表)。

## Global Constraints

- **bun only**;测试 `bun test packages/core`,typecheck `bun run --filter '*' typecheck`,lint `bun run lint`(含 `lint:architecture`)。三者全绿才 commit。
- **Commit:** Conventional Commits,中文 subject,英文 `type(scope)` 与 identifier。一 task 一 commit,never `--no-verify`。
- **公开面(Phase 1):** `GridRuntime` 所有 public 方法签名不变(改一行 delegate);`tests/dom/runtime/` 现有测试**一行不改**且全绿。controllers 不从 `packages/core/src/dom/index.ts` 导出。
- **迁移规约:** 方法体**逐字迁移**(含注释),仅按本 task 的映射表改 `this.xxx` 引用;imports 随迁,type-only 用 `import type`。禁止顺手重构/改语义/删注释。
- **deps 规约:** 迁移中发现方法体引用了 deps 接口未列出的 runtime 成员——**加 deps 项**(闭包指回 runtime),绝不 import `GridRuntime` 或其他 controller 类。deps 中 scheduler 用结构类型 `Pick<FrameScheduler, 'schedule' | 'cancel'>` 以便测试注入假实现。
- **STOP+ASK:** 遇到与本计划或 spec 矛盾的现实现(方法归属冲突、语义不明的快捷键分支、`tests/helpers/mock-grid-engine.ts` 能力不足以支撑给定单测)时停下来问,禁静默选。
- **destroy 幂等(不变量 #7):** 每个 controller 有 `destroy(): void`,可重复调用无副作用;`GridRuntime.destroy()` 扇出后 StrictMode 相关测试须绿。
- 单测文件放 `packages/core/tests/dom/runtime/controllers/`,mirror `src/`。测试 stub 用最小结构对象 `as unknown as GridEngine` 风格(现有 `makeHost()` 惯例),或 `tests/helpers/mock-grid-engine.ts`。

### 每 task 标准循环(下文各 task 的 Step 序列都实例化此循环)

1. 写新 controller 的失败单测(测试代码见各 task)
2. `bun test packages/core/tests/dom/runtime/controllers/<file>` → FAIL(模块不存在)
3. 建 controller 文件,按成员清单逐字迁移 + 按映射表改引用;GridRuntime 构造 controller 并把原方法改 delegate/删除私有方法
4. 单测 PASS;`bun test packages/core` 全绿;typecheck + lint 全绿
5. Commit

---

## Phase 1 — 机械拆分

### Task 1: ExcelWorkspaceBinding

**Files:**
- Create: `packages/core/src/dom/runtime/controllers/ExcelWorkspaceBinding.ts`
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts`
- Test: `packages/core/tests/dom/runtime/controllers/ExcelWorkspaceBinding.test.ts`

**Interfaces:**
- Consumes: `GridEngine`(`getData`/`getFrame`/`resizeExcelWorkspace`)、`ExcelWorkspaceController`/`ExcelWorkspacePort`/`ExcelWorkspacePolicy`(features 层,现 GridRuntime 已 import)
- Produces(后续 task 依赖):

```ts
export interface ExcelWorkspacePortDeps {
  readonly engine: GridEngine
  markMutated(): void
}
/** 独立导出便于单测;binding 内部复用 */
export function createExcelWorkspacePort(deps: ExcelWorkspacePortDeps): ExcelWorkspacePort

export interface ExcelWorkspaceBindingDeps {
  readonly engine: GridEngine
  afterEngineMutation(): void
}
export class ExcelWorkspaceBinding {
  constructor(opts: {
    readonly policy?: Partial<ExcelWorkspacePolicy>
    readonly deps: ExcelWorkspaceBindingDeps
  })
  recordScroll(source: NativeScrollSource | undefined): void // ← recordExcelWorkspaceScroll
  runFrame(): void                                           // ← runExcelWorkspaceFrame
}
```

**迁移成员:** `ExcelWorkspaceReadableDataSource` 接口、`isExcelWorkspaceReadableDataSource`、`createExcelWorkspacePort`(改为上面导出函数,`this.excelWorkspaceMutated = true` → `deps.markMutated()`)、`excelWorkspaceController` 字段、`excelWorkspaceMutated` 字段、`recordExcelWorkspaceScroll`、`runExcelWorkspaceFrame`。

**引用映射:** `this.engine` → `this.deps.engine`;`this.afterEngineMutation()` → `this.deps.afterEngineMutation()`。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it, mock } from 'bun:test'
import { createExcelWorkspacePort } from '../../../../src/dom/runtime/controllers/ExcelWorkspaceBinding'
import type { GridEngine } from '../../../../src/engine/GridEngine'

function makeEngineStub() {
  const data = {
    getRowCount: () => 10,
    getSchema: () => ({ fields: [{ id: 'a' }, { id: 'b' }] }),
  }
  return {
    getData: () => data,
    resizeExcelWorkspace: mock(() => true),
  } as unknown as GridEngine
}

describe('ExcelWorkspaceBinding — port', () => {
  it('appendRows 经 engine.resizeExcelWorkspace 扩容并标记 mutated', () => {
    const engine = makeEngineStub()
    const markMutated = mock(() => {})
    const port = createExcelWorkspacePort({ engine, markMutated })
    port.appendRows(3)
    expect(engine.resizeExcelWorkspace).toHaveBeenCalledWith({ rowCount: 13, colCount: 2 })
    expect(markMutated).toHaveBeenCalledTimes(1)
  })

  it('appendRows(0) 与 resize 失败时不标记 mutated', () => {
    const engine = makeEngineStub()
    ;(engine.resizeExcelWorkspace as unknown as ReturnType<typeof mock>).mockReturnValue(false)
    const markMutated = mock(() => {})
    const port = createExcelWorkspacePort({ engine, markMutated })
    port.appendRows(0)
    port.appendRows(2)
    expect(markMutated).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 运行确认失败** — `bun test packages/core/tests/dom/runtime/controllers/ExcelWorkspaceBinding.test.ts`,期望 FAIL(cannot resolve module)。
- [ ] **Step 3: 实现** — 建文件迁移上述成员;GridRuntime 中字段改 `private excelWorkspace?: ExcelWorkspaceBinding`,constructor 改:

```ts
if (opts.excelWorkspace) {
  this.excelWorkspace = new ExcelWorkspaceBinding({
    policy: typeof opts.excelWorkspace === 'object' ? opts.excelWorkspace.policy : undefined,
    deps: { engine: this.engine, afterEngineMutation: () => this.afterEngineMutation() },
  })
}
```

`handleHostScroll` 内两处调用改 `this.excelWorkspace?.recordScroll(source)` / `this.excelWorkspace?.runFrame()`;删除 runtime 内旧私有方法与字段。
- [ ] **Step 4: 全量验证** — `bun test packages/core` + typecheck + lint 全绿。
- [ ] **Step 5: Commit** — `refactor(core): GridRuntime 拆出 ExcelWorkspaceBinding`

### Task 2: ViewportController(+ 共享 frame 类型)

**Files:**
- Create: `packages/core/src/dom/runtime/runtime-frame.ts`、`packages/core/src/dom/runtime/controllers/ViewportController.ts`
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts`
- Test: `packages/core/tests/dom/runtime/controllers/ViewportController.test.ts`

**Interfaces:**
- Consumes: `ScrollMapper`(controller 自持 `new ScrollMapper()`,从 GridRuntime 移入)、`WebHost`、`GridEngine`
- Produces:

```ts
// runtime-frame.ts — GridRuntime 与各 controller 共享,消除各文件重复派生
export type RuntimeRenderFrame = ReturnType<GridEngine['getFrame']>
export type RuntimeCellEdit = NonNullable<RuntimeRenderFrame['cellEdit']>

export interface ViewportControllerDeps {
  readonly engine: GridEngine
  readonly host: WebHost
  readonly scheduler: Pick<FrameScheduler, 'schedule' | 'cancel'>
  isDestroyed(): boolean
  invalidate(): void
  paintSync(): void
  getRenderer(): RenderBackend                      // scheduleHostResize 内 renderer.resize
  onSurfaceResize?(width: number, height: number, dpr: number): void
  /** handleHostScroll:setScroll 前(excel 记录) */
  beforeApplyScroll(source: NativeScrollSource | undefined): void
  /** handleHostScroll:setScroll 后、invalidate 前(关编辑器/同步 editor 位置/关菜单/藏 tooltip/excel 帧) */
  afterApplyScroll(): void
}
export class ViewportController {
  constructor(deps: ViewportControllerDeps)
  handleHostScroll(scrollTop: number, scrollLeft: number, source?: NativeScrollSource): void
  handleHostResize(cssWidth: number, cssHeight: number, dpr: number): void
  handleHostDprChange(dpr: number): void
  onContainerResize(): void
  scheduleHostResize(): void
  remapScroll(): void
  resizeSpacer(): void
  getScrollLimits(): { maxTop: number; maxLeft: number }
  getColsContentWidth(): number
  getColsTotalSizeForFrame(frame: RuntimeRenderFrame): number
  scrollToRow(rowIndex: number, align?: 'start' | 'center' | 'end'): void
  scrollToCell(rowIndex: number, fieldId: string): void
  ensureCellVisible(cell: CellAddress): void
  getSelectionScrollTarget(): CellAddress | null
  destroy(): void   // scheduler.cancel(HOST_RESIZE_KEY)
}
```

**迁移成员:** `scrollMapper`、`HOST_RESIZE_KEY` 常量、`handleHostScroll`、`handleHostResize`、`handleHostDprChange`、`scheduleHostResize`、`onContainerResize`、`mapScrollToLogical`、`logicalToScrollY`、`logicalToScrollX`、`remapScroll`、`getScrollLimits`、`getColsContentWidth`、`getColsTotalSizeForFrame`、`resizeSpacer`、`scrollToRow`、`scrollToCell`、`ensureCellVisible`、`getSelectionScrollTarget`。

**引用映射:** `this.engine/host/scheduler` → `this.deps.*`;`this.destroyed` → `this.deps.isDestroyed()`;`this.invalidate()/paintSync()` → deps;`this.renderer.resize(...)` → `this.deps.getRenderer().resize(...)`;`this.onSurfaceResize?.(...)` → `this.deps.onSurfaceResize?.(...)`;handleHostScroll 内 `recordExcelWorkspaceScroll(source)` → `this.deps.beforeApplyScroll(source)`,`closeActiveCustomEditor()+syncCellEditorPosition()+closeContextMenu()+validationTooltip?.hide()+runExcelWorkspaceFrame()` 五连调 → `this.deps.afterApplyScroll()`(顺序在 runtime 组合闭包内逐字保持)。

**GridRuntime wiring(constructor):**

```ts
this.viewport = new ViewportController({
  engine: this.engine,
  host: this.host,
  scheduler: this.scheduler,
  isDestroyed: () => this.destroyed,
  invalidate: () => this.invalidate(),
  paintSync: () => this.paintSync(),
  getRenderer: () => this.renderer,
  onSurfaceResize: this.onSurfaceResize,
  beforeApplyScroll: (source) => this.excelWorkspace?.recordScroll(source),
  afterApplyScroll: () => {
    this.closeActiveCustomEditor()
    this.syncCellEditorPosition()
    this.closeContextMenu()
    this.validationTooltip?.hide()
    this.excelWorkspace?.runFrame()
  },
})
```

runtime 上同名 public 方法改一行 delegate(`handleHostScroll/handleHostResize/handleHostDprChange/onContainerResize/scrollToRow/scrollToCell/autofitRows 不动`);私有跨域调用点(`afterEngineMutation` 内 `resizeSpacer/remapScroll`、edit/drag 域内 `ensureCellVisible/getSelectionScrollTarget/getScrollLimits/getColsTotalSizeForFrame`)改 `this.viewport.*`。`destroy()` 中 `scheduler.cancel(HOST_RESIZE_KEY)` 改 `this.viewport.destroy()`。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it, mock } from 'bun:test'
import { ViewportController } from '../../../../src/dom/runtime/controllers/ViewportController'
import type { GridEngine } from '../../../../src/engine/GridEngine'
import type { WebHost } from '../../../../src/dom/host/Host'
import type { RenderBackend } from '../../../../src/ports/RenderBackend'

describe('ViewportController — scheduleHostResize', () => {
  it('单 RAF 内完成 viewport 尺寸、renderer.resize 与 paintSync', () => {
    const engine = {
      setViewportSize: mock(() => {}),
      setScroll: mock(() => {}),
      getRowsTotalSize: () => 0,
      getColsTotalSize: () => 0,
      getFrame: () => ({ colsAxis: { getTotalSize: () => 0, getCount: () => 0 } }),
    } as unknown as GridEngine
    const host = {
      getContainerSize: () => ({ width: 400, height: 300 }),
      getDpr: () => 2,
      getScrollPosition: () => ({ scrollTop: 0, scrollLeft: 0 }),
      setScrollSize: mock(() => {}),
      scrollTo: mock(() => {}),
    } as unknown as WebHost
    const renderer = { resize: mock(() => {}) } as unknown as RenderBackend
    const paintSync = mock(() => {})
    const scheduled: (() => void)[] = []
    const vp = new ViewportController({
      engine,
      host,
      scheduler: { schedule: (_k: string, cb: () => void) => { scheduled.push(cb) }, cancel: () => {} },
      isDestroyed: () => false,
      invalidate: () => {},
      paintSync,
      getRenderer: () => renderer,
      beforeApplyScroll: () => {},
      afterApplyScroll: () => {},
    })
    vp.scheduleHostResize()
    expect(paintSync).not.toHaveBeenCalled()
    for (const cb of scheduled) cb()
    expect(engine.setViewportSize).toHaveBeenCalledWith(400, 300)
    expect(renderer.resize).toHaveBeenCalledWith(400, 300, 2)
    expect(paintSync).toHaveBeenCalledTimes(1)
  })
})
```

(engine/host stub 字段以迁移后代码实际引用为准补齐——补 stub,不改实现。)
- [ ] **Step 2: 运行确认失败** — FAIL(模块不存在)。
- [ ] **Step 3: 实现**(见上迁移成员/映射/wiring;`RuntimeRenderFrame` 派生类型改从 `runtime-frame.ts` import,GridRuntime 顶部本地 `type RuntimeRenderFrame/RuntimeCellEdit` 删除改 import)。
- [ ] **Step 4: 全量验证**(含 `GridRuntime.drag-auto-scroll.test.ts`、`frame-dedup` 全绿)。
- [ ] **Step 5: Commit** — `refactor(core): GridRuntime 拆出 ViewportController 与共享 frame 类型`

### Task 3: RenderFlushPipeline

**Files:**
- Create: `packages/core/src/dom/runtime/RenderFlushPipeline.ts`
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts`
- Test: `packages/core/tests/dom/runtime/controllers/RenderFlushPipeline.test.ts`

**Interfaces:**

```ts
export interface RenderFlushPipelineDeps {
  readonly scheduler: Pick<FrameScheduler, 'schedule' | 'cancel'>
  isDestroyed(): boolean
  getFrame(): RuntimeRenderFrame                     // () => engine.getFrame()
  getRenderer(): RenderBackend
  getViewPipeline(): ViewPipeline | undefined
  /** edit 域 frame 增强(activeCustomEditorCellEdit 合并);Task 7 前指向 runtime 私有状态 */
  augmentFrame(frame: RuntimeRenderFrame): RuntimeRenderFrame
  syncSelectionOverlay(frame: RuntimeRenderFrame): void
  /** resize/fill/hideRow/hideCol handle + cellEditor 位置;runtime 组合闭包保持现顺序 */
  syncDomLayers(frame: RuntimeRenderFrame): void
  getOnSelectionChange(): ((selection: GridSelection) => void) | undefined
}
export class RenderFlushPipeline {
  constructor(deps: RenderFlushPipelineDeps)
  invalidate(): void
  paintSync(): void
  getRenderFrame(): RuntimeRenderFrame
  cancelPending(): void // scheduler.cancel('renderer:flush');replaceRenderer 路径用
  destroy(): void       // = cancelPending;幂等
}
```

**迁移成员:** `invalidate`、`paintSync`、`getRenderFrame`、`notifySelectionChange`(pipeline 私有)、`lastSelectionChangeSignature`。`getRenderFrame` 中 `activeCustomEditorCellEdit` 合并段抽为 `deps.augmentFrame`;viewPipeline 注入留 pipeline 内(经 `deps.getViewPipeline()`)。

**flush 帧内顺序(逐字保持,pipeline 固化):** `render(frame)` → `deps.syncSelectionOverlay(frame)` → `notifySelectionChange(frame)` → `deps.syncDomLayers(frame)`。

**GridRuntime wiring:**

```ts
this.flush = new RenderFlushPipeline({
  scheduler: this.scheduler,
  isDestroyed: () => this.destroyed,
  getFrame: () => this.engine.getFrame(),
  getRenderer: () => this.renderer,
  getViewPipeline: () => this.viewPipeline,
  augmentFrame: (frame) =>
    this.activeCustomEditorCellEdit && !frame.cellEdit
      ? { ...frame, cellEdit: this.activeCustomEditorCellEdit }
      : frame,
  syncSelectionOverlay: (frame) => this.syncSelectionOverlay(frame),
  syncDomLayers: (frame) => {
    this.syncResizeHandles(frame)
    this.syncFillHandle(frame)
    this.syncHideToggleHandles(frame)
    this.syncHideColToggleHandles(frame)
    this.syncCellEditorPosition(frame)
  },
  getOnSelectionChange: () => this.onSelectionChange,
})
```

runtime 的 `invalidate()/paintSync()/refresh()` 改 delegate;`sync*` 系列与 `syncSelectionOverlay` 默认参数 `frame = this.getRenderFrame()` 改 `frame = this.flush.getRenderFrame()`;`replaceRenderer` 与 `destroy` 中 `scheduler.cancel('renderer:flush')` 改 `this.flush.destroy()` 前者保持 cancel 语义(replaceRenderer 只 cancel 不销毁 pipeline——给 pipeline 加 `cancelPending(): void`)。`setOnSelectionChange` 存 runtime 字段不变(经 `getOnSelectionChange` 读)。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it, mock } from 'bun:test'
import { RenderFlushPipeline } from '../../../../src/dom/runtime/RenderFlushPipeline'
import type { RenderBackend } from '../../../../src/ports/RenderBackend'
import type { RuntimeRenderFrame } from '../../../../src/dom/runtime/runtime-frame'

describe('RenderFlushPipeline', () => {
  function make() {
    const order: string[] = []
    const frame = {
      selection: { activeCell: null, selectedRange: null },
      cellEdit: undefined,
    } as unknown as RuntimeRenderFrame
    const getFrame = mock(() => frame)
    const renderer = { render: mock(() => order.push('render')) } as unknown as RenderBackend
    const scheduled: (() => void)[] = []
    const pipeline = new RenderFlushPipeline({
      scheduler: { schedule: (_k, cb) => { scheduled.push(cb) }, cancel: () => {} },
      isDestroyed: () => false,
      getFrame,
      getRenderer: () => renderer,
      getViewPipeline: () => undefined,
      augmentFrame: (f) => f,
      syncSelectionOverlay: () => order.push('selection'),
      syncDomLayers: () => order.push('layers'),
      getOnSelectionChange: () => undefined,
    })
    return { pipeline, scheduled, getFrame, order }
  }

  it('一次 flush 恰好一次 getFrame,顺序 render→selection→layers', () => {
    const { pipeline, scheduled, getFrame, order } = make()
    pipeline.invalidate()
    scheduled[0]!()
    expect(getFrame).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['render', 'selection', 'layers'])
  })

  it('paintSync 同步走完整帧且只调一次 getFrame', () => {
    const { pipeline, getFrame, order } = make()
    pipeline.paintSync()
    expect(getFrame).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['render', 'selection', 'layers'])
  })
})
```

- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 实现**(见上);注意 `mergeVisualRange` 若仅被 `syncSelectionOverlay`/`notifySelectionChange` 使用,随实际使用方所在文件走。
- [ ] **Step 4: 全量验证** — 重点 `GridRuntime.frame-dedup.test.ts` 全绿。
- [ ] **Step 5: Commit** — `refactor(core): GridRuntime 拆出 RenderFlushPipeline,固化单帧 flush 契约`

### Task 4: ClipboardController

**Files:**
- Create: `packages/core/src/dom/runtime/controllers/ClipboardController.ts`
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts`
- Test: `packages/core/tests/dom/runtime/controllers/ClipboardController.test.ts`

**Interfaces:**

```ts
export interface ClipboardControllerDeps {
  readonly engine: GridEngine
  isDestroyed(): boolean
  afterEngineMutation(): void
}
export class ClipboardController {
  constructor(deps: ClipboardControllerDeps)
  setAdapter(adapter: DomClipboardAdapter): void
  setOnCopy(cb: (range: CellRange) => void): void
  setOnCut(cb: (range: CellRange) => void): void
  setOnPaste(cb: (target: CellRange) => void): void
  setOnPasteSkipped(cb: (cells: readonly PasteSkippedCell[]) => void): void
  setOnUndo(cb: (event: UndoEvent) => void): void
  setOnRedo(cb: (event: RedoEvent) => void): void
  handleClipboardCopy(): Promise<boolean>
  handleClipboardCut(): Promise<boolean>
  handleClipboardPaste(): Promise<boolean>
  undo(): void
  redo(): void
  canUndo(): boolean
  canRedo(): boolean
  clearCache(): void        // ← setData/updateViewData 的 clipboardCache = null
}
```

**迁移成员:** `fnv1aHash`、`clipboardAdapter`、`clipboardCache`、`onCopy/onCut/onPaste/onPasteSkipped/onUndo/onRedo` 回调字段、`handleClipboardCopy/Cut/Paste`、`snapshotSelection`、`captureSelectionAttachments`、`undo`、`redo`、`canUndo`、`canRedo`。`UndoEvent/RedoEvent` 接口留在 GridRuntime.ts 导出(公开 API golden 含它们时不动;controller `import type` 回来)。

**引用映射:** `this.engine` → `this.deps.engine`;`this.destroyed` → `this.deps.isDestroyed()`;`this.afterEngineMutation()` → `this.deps.afterEngineMutation()`。

**GridRuntime wiring:** `this.clipboard = new ClipboardController({ engine: this.engine, isDestroyed: () => this.destroyed, afterEngineMutation: () => this.afterEngineMutation() })`;runtime 的 `setClipboardAdapter/setOnCopy/.../undo/redo/canUndo/canRedo/handleClipboard*` 全部改一行 delegate;`setData/updateViewData` 内 `this.clipboardCache = null` → `this.clipboard.clearCache()`;keyDown 与菜单动作中的 `this.handleClipboardCopy()` 等暂保持调 runtime 公开 shim(Task 6/9 再改 deps)。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it, mock } from 'bun:test'
import { ClipboardController } from '../../../../src/dom/runtime/controllers/ClipboardController'
import type { GridEngine } from '../../../../src/engine/GridEngine'

describe('ClipboardController — undo/redo 事件顺序', () => {
  it('undo 成功:先 afterEngineMutation 再 onUndo(command)', () => {
    const cmd = { kind: 'test' }
    const calls: string[] = []
    const engine = { undo: mock(() => cmd) } as unknown as GridEngine
    const ctl = new ClipboardController({
      engine,
      isDestroyed: () => false,
      afterEngineMutation: () => calls.push('afterEngineMutation'),
    })
    ctl.setOnUndo((e) => calls.push(`onUndo:${(e.command as { kind: string }).kind}`))
    ctl.undo()
    expect(calls).toEqual(['afterEngineMutation', 'onUndo:test'])
  })

  it('undo 无命令时不触发任何收尾', () => {
    const engine = { undo: mock(() => null) } as unknown as GridEngine
    const after = mock(() => {})
    const ctl = new ClipboardController({ engine, isDestroyed: () => false, afterEngineMutation: after })
    ctl.undo()
    expect(after).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 实现**(见上)。
- [ ] **Step 4: 全量验证** — 重点 `GridRuntime.undo.test.ts`、`clipboard-attachment-copy.test.ts` 全绿。
- [ ] **Step 5: Commit** — `refactor(core): GridRuntime 拆出 ClipboardController(copy/cut/paste/undo/redo)`

### Task 5: PopoverController

**Files:**
- Create: `packages/core/src/dom/runtime/controllers/PopoverController.ts`
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts`
- Test: `packages/core/tests/dom/runtime/controllers/PopoverController.test.ts`

**Interfaces:**

```ts
export interface PopoverControllerDeps {
  readonly engine: GridEngine
  getFilterLayer(): FilterLayer | undefined
  onContextMenuAction(action: ContextMenuAction | string, ctx: ContextMenuContext): void // filter-open 回退
  closeContextMenu(): void
  hideFillPreview(): void
  hideColumnReorderOverlay(): void
}
export type PopoverAnchorPoint = { readonly clientX: number; readonly clientY: number } | null
export class PopoverController {
  constructor(deps: PopoverControllerDeps)
  setFilterPopover(popover: FilterPopover): void
  setRowHeightPopover(popover: RowHeightPopover): void
  setColumnWidthPopover(popover: ColumnWidthPopover): void
  isFilterPopoverOpen(): boolean
  openFilterPopover(ctx: Extract<ContextMenuContext, { targetKind: 'columnHeader' }>, anchor: PopoverAnchorPoint): void
  handleFilterPopoverApply(op: FilterOp | null): void
  /** rowIds 已 sorted-unique;anchor 为触发菜单的 client 坐标 */
  openRowHeightPopover(rowIds: readonly number[], anchor: PopoverAnchorPoint): void
  openColumnWidthPopover(fieldIds: readonly string[], anchor: PopoverAnchorPoint): void
  getPendingRowHeightIds(): number[]
  getPendingColumnWidthFieldIds(): readonly string[]
  applyTheme(theme: Theme): void   // ← syncFilterPopoverTheme 体
}
```

**迁移成员:** `filterPopover/rowHeightPopover/columnWidthPopover` 字段、`pendingRowHeightIds/pendingColumnWidthFieldIds`、`filterPopoverFieldId`、`openFilterPopover`(签名加 `anchor` 参数,体内 `this.lastContextMenuPoint` → `anchor`)、`handleFilterPopoverApply`、`getPendingRowHeightIds/getPendingColumnWidthFieldIds`、`syncFilterPopoverTheme` 体。`invokeRowHeaderContextMenuAction` 的 `resize-row-height` 分支与 `invokeColumnHeaderContextMenuAction` 的 `resize-column-width` 分支抽为 `openRowHeightPopover/openColumnWidthPopover`(读当前行高/列宽的 engine 逻辑随迁),原分支改调 `this.popovers.openRowHeightPopover(sortedIds, this.lastContextMenuPoint)`。

**GridRuntime wiring:** deps 全闭包指回 runtime(`getFilterLayer: () => this.filterLayer` 等);runtime 同名 public 方法改 delegate;`setTheme` 内 `syncFilterPopoverTheme()` → `this.popovers.applyTheme(theme)`;keyDown 的 `this.filterPopover?.isOpen()` → `this.popovers.isFilterPopoverOpen()`。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it, mock } from 'bun:test'
import { PopoverController } from '../../../../src/dom/runtime/controllers/PopoverController'
import type { GridEngine } from '../../../../src/engine/GridEngine'

function makeCtl(over: Partial<ConstructorParameters<typeof PopoverController>[0]> = {}) {
  return new PopoverController({
    engine: {} as unknown as GridEngine,
    getFilterLayer: () => undefined,
    onContextMenuAction: mock(() => {}),
    closeContextMenu: mock(() => {}),
    hideFillPreview: () => {},
    hideColumnReorderOverlay: () => {},
    ...over,
  })
}
const colCtx = { targetKind: 'columnHeader', field: { id: 'f1' }, colIndex: 0 } as never

describe('PopoverController — openFilterPopover', () => {
  it('未注入 popover 时回退 onContextMenuAction(filter-open)', () => {
    const onAction = mock(() => {})
    const ctl = makeCtl({ onContextMenuAction: onAction })
    ctl.openFilterPopover(colCtx, null)
    expect(onAction).toHaveBeenCalledWith('filter-open', colCtx)
  })

  it('注入 popover 后 open 并先关菜单', () => {
    const closeContextMenu = mock(() => {})
    const ctl = makeCtl({ closeContextMenu })
    const popover = { open: mock(() => {}), isOpen: () => false, applyTheme: () => {} }
    ctl.setFilterPopover(popover as never)
    ctl.openFilterPopover(colCtx, { clientX: 10, clientY: 20 })
    expect(closeContextMenu).toHaveBeenCalled()
    expect(popover.open).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 实现**(见上)。
- [ ] **Step 4: 全量验证**。
- [ ] **Step 5: Commit** — `refactor(core): GridRuntime 拆出 PopoverController(filter/rowHeight/columnWidth)`

### Task 6: ContextMenuController

**Files:**
- Create: `packages/core/src/dom/runtime/controllers/ContextMenuController.ts`
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts`
- Test: `packages/core/tests/dom/runtime/controllers/ContextMenuController.test.ts`

**Interfaces:**

```ts
export interface ContextMenuControllerDeps {
  readonly engine: GridEngine
  readonly host: WebHost
  isDestroyed(): boolean
  invalidate(): void
  afterEngineMutation(): void
  getViewPipeline(): ViewPipeline | undefined
  getSortLayer(): SortLayer | undefined
  getFilterLayer(): FilterLayer | undefined
  getContextMenus(): ContextMenuExtensionConfig | undefined
  isDragActive(): boolean                                  // resizeDrag.active || activeDrag?.active
  isCellEditing(): boolean
  commitCellEdit(moveAfter: boolean): void
  hitTestColumnHeader(event: WebPointerEvent): { colIndex: number } | null
  // 剪贴板(菜单默认动作)
  clipboardCopy(): Promise<boolean>
  clipboardCut(): Promise<boolean>
  clipboardPaste(): Promise<boolean>
  // popover 域
  openFilterPopover(ctx: Extract<ContextMenuContext, { targetKind: 'columnHeader' }>, anchor: PopoverAnchorPoint): void
  openRowHeightPopover(rowIds: readonly number[], anchor: PopoverAnchorPoint): void
  openColumnWidthPopover(fieldIds: readonly string[], anchor: PopoverAnchorPoint): void
  // 结构 mutation(Phase 2 后闭包体改直调 engine;接口不变)
  insertRows(beforeUnderlyingRow: number, count: number): readonly number[]
  deleteRows(underlyingRowIds: readonly number[]): void
  hideRows(underlyingRowIds: readonly number[]): void
  unhideRows(underlyingRowIds: readonly number[]): void
  insertCols(beforeFieldIndex: number, count: number): readonly Field[]
  deleteCols(fieldIds: readonly string[]): void
  hideCols(fieldIds: readonly string[]): void
  unhideCols(fieldIds: readonly string[]): void
}
export class ContextMenuController {
  constructor(deps: ContextMenuControllerDeps)
  setLayer(layer: DomContextMenuLayer): void
  setRenderer(renderer: ContextMenuRenderer): void          // ← contextMenuRenderer
  setOnAction(cb: (action: ContextMenuAction | string, ctx: ContextMenuContext) => void): void
  hasActionOverride(): boolean
  close(): void
  handleHostContextMenu(event: WebPointerEvent): void
  handleContextMenuSelected(id: ContextMenuAction | string): void
  openContextMenuAt(rowIndex: number, fieldId: string): void
  getRowHeaderContextMenuItems(ctx: { targetRowIndex: number }): readonly ContextMenuItem[]
  invokeRowHeaderContextMenuAction(id: string, ctx: { targetRowIndex: number }): void
  getColumnHeaderContextMenuItems(ctx: { targetColIndex: number }): readonly ContextMenuItem[]
  invokeColumnHeaderContextMenuAction(id: string, ctx: { targetColIndex: number }): void
  updateHoveredColumnHeaderMenu(event: WebPointerEvent): void
  hitTestColumnHeaderMenuButton(event: WebPointerEvent): { colIndex: number } | null
  openColumnHeaderContextMenu(colIndex: number, event: WebPointerEvent): void
  applyTheme(theme: Theme): void                            // ← syncContextMenuTheme 体
  destroy(): void                                           // contextMenuRenderer?.destroy()
}
```

**迁移成员:** `COLUMN_HEADER_MENU_BUTTON_SIZE/COLUMN_HEADER_MENU_BUTTON_MIN_COL_WIDTH/BUILTIN_CONTEXT_MENU_ACTIONS` 常量、`contextMenuLayer/contextMenuRenderer/contextMenus/onContextMenuAction/lastContextMenuContext/lastContextMenuPoint/lastHoveredColumnMenu` 字段、`isBuiltInContextMenuAction`、`markUnhandledCustomItemsDisabled`、`openResolvedContextMenu`、`closeContextMenu`(→`close`)、`handleHostContextMenu`、`handleContextMenuSelected`、`openContextMenuAt`、`getRowHeaderContextMenuItems`、`invokeRowHeaderContextMenuAction`、`getColumnHeaderContextMenuItems`、`invokeColumnHeaderContextMenuAction`、`viewColToFieldId`、`rawSchemaIndexBeforeViewCol`、`rawSchemaIndexAfterViewCol`、`collectHiddenInViewColRange`、`updateHoveredColumnHeaderMenu`、`hitTestColumnHeaderMenuButton`、`openColumnHeaderContextMenu`、`syncContextMenuTheme` 体。

**引用映射(关键处):** `this.resizeDrag.active || this.activeDrag?.active` → `this.deps.isDragActive()`;`this.engine.isCellEditing()` 判定 + `this.commitCellEdit(false)` → `if (this.deps.isCellEditing()) this.deps.commitCellEdit(false)`;`this.sortLayer?/filterLayer?` → `this.deps.getSortLayer()?/getFilterLayer()?`;`this.insertRows(...)` 等 8 个结构 mutation → `this.deps.insertRows(...)`;`resize-row-height/resize-column-width` 分支 → `this.deps.openRowHeightPopover(sortedIds, this.lastContextMenuPoint)` / `openColumnWidthPopover(fieldIds, this.lastContextMenuPoint)`;`this.openFilterPopover(ctx)` → `this.deps.openFilterPopover(ctx, this.lastContextMenuPoint)`;`this.handleClipboardCopy()` → `this.deps.clipboardCopy()`。

**GridRuntime wiring:** 结构 mutation deps 在 Phase 1 指向 runtime 现 passthrough(`insertRows: (at, n) => this.insertRows(at, n)` 等);Task 5 中 PopoverController deps 的 `closeContextMenu` 闭包改指 `() => this.contextMenu.close()`;runtime public 同名方法全改 delegate;`afterEngineMutation`/`destroy`/`handleHostScroll` 组合闭包中 `closeContextMenu()` → `this.contextMenu.close()`;pointer 路由三处(`hitTestColumnHeaderMenuButton/openColumnHeaderContextMenu/updateHoveredColumnHeaderMenu`)改 `this.contextMenu.*`(Task 9 再变 deps)。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it, mock } from 'bun:test'
import { ContextMenuController } from '../../../../src/dom/runtime/controllers/ContextMenuController'
import type { GridEngine } from '../../../../src/engine/GridEngine'
import type { WebHost } from '../../../../src/dom/host/Host'

function makeCtl(over: Record<string, unknown> = {}) {
  const engine = {
    getSelection: () => ({ selectedRange: { startRow: 1, endRow: 2, startCol: 0, endCol: 0 } }),
    getData: () => ({ resolveUnderlyingRow: (r: number) => r, getSchema: () => ({ fields: [{ id: 'a' }] }) }),
    getHiddenRows: () => [],
  } as unknown as GridEngine
  const deps = {
    engine,
    host: {} as unknown as WebHost,
    isDestroyed: () => false,
    invalidate: () => {},
    afterEngineMutation: () => {},
    getViewPipeline: () => undefined,
    getSortLayer: () => undefined,
    getFilterLayer: () => undefined,
    getContextMenus: () => undefined,
    isDragActive: () => false,
    isCellEditing: () => false,
    commitCellEdit: () => {},
    hitTestColumnHeader: () => null,
    clipboardCopy: mock(async () => true),
    clipboardCut: mock(async () => true),
    clipboardPaste: mock(async () => true),
    openFilterPopover: mock(() => {}),
    openRowHeightPopover: mock(() => {}),
    openColumnWidthPopover: mock(() => {}),
    insertRows: mock(() => [] as number[]),
    deleteRows: mock(() => {}),
    hideRows: mock(() => {}),
    unhideRows: mock(() => {}),
    insertCols: mock(() => []),
    deleteCols: mock(() => {}),
    hideCols: mock(() => {}),
    unhideCols: mock(() => {}),
    ...over,
  }
  return { ctl: new ContextMenuController(deps as never), deps }
}

describe('ContextMenuController — 行头动作', () => {
  it('hide-rows 以选区底层行 id(sorted-unique)调 deps.hideRows', () => {
    const { ctl, deps } = makeCtl()
    ctl.invokeRowHeaderContextMenuAction('hide-rows', { targetRowIndex: 1 })
    expect(deps.hideRows).toHaveBeenCalledWith([1, 2])
  })

  it('insert-above 以选区首行与行数调 deps.insertRows', () => {
    const { ctl, deps } = makeCtl()
    ctl.invokeRowHeaderContextMenuAction('insert-above', { targetRowIndex: 1 })
    expect(deps.insertRows).toHaveBeenCalledWith(1, 2)
  })
})
```

- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 实现**(见上)。**STOP+ASK 点:** `handleContextMenuSelected` 中 `onContextMenuAction` 完全接管分支与内置动作的优先级如与迁移后 deps 组合产生语义分歧,停下确认。
- [ ] **Step 4: 全量验证** — 重点列头菜单相关测试(`col-reorder`、菜单锚点/hover 测试)全绿。
- [ ] **Step 5: Commit** — `refactor(core): GridRuntime 拆出 ContextMenuController(菜单路由/动作/hover 按钮)`

### Task 7: CellEditController

**Files:**
- Create: `packages/core/src/dom/runtime/controllers/CellEditController.ts`
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts`
- Test: `packages/core/tests/dom/runtime/controllers/CellEditController.test.ts`

**Interfaces:**

```ts
export interface CellEditControllerDeps {
  readonly engine: GridEngine
  readonly editorContainer: HTMLElement
  isDestroyed(): boolean
  refresh(): void
  paintSync(): void
  afterEngineMutation(): void
  ensureCellVisible(cell: CellAddress): void
  getSelectionScrollTarget(): CellAddress | null
  autofitRows(options: AutofitRowsRuntimeOptions): AutofitRowsResult
}
export class CellEditController {
  constructor(opts: {
    readonly cellEditors: CellEditorRegistry
    readonly cellTypes: CellTypeRegistry
    readonly deps: CellEditControllerDeps
  })
  setCellEditor(editor: DomCellEditor): void
  openCellEditor(rowIndex: number, fieldId: string): boolean
  openCellEditorForTrigger(args: { cell: CellAddress; trigger: CellEditorTrigger; initialInput?: string; selectAll?: boolean }): boolean
  hasCustomCellEditor(cell: CellAddress): boolean
  invokeCellAction(action: CellActionHit): void
  closeActiveCustomEditor(): void
  commitCellEdit(moveAfter: boolean): void
  cancelCellEdit(): void
  handleCellEditDraft(draft: string): void
  handleCellEditCommitEnter(): void
  handleCellEditCommitBlur(): void
  handleCellEditCancel(): void
  syncCellEditorPosition(frame?: RuntimeRenderFrame): void
  /** flush augmentFrame 钩子:合并 activeCustomEditorCellEdit */
  augmentFrame(frame: RuntimeRenderFrame): RuntimeRenderFrame
  applyTheme(theme: Theme): void                 // ← syncCellEditorTheme 体
  destroy(): void  // closeActiveCustomEditor + cancelCellEdit + registry editor.destroy?.()
}
```

**迁移成员:** `cellEditor/cellEditors/cellTypes/activeCustomEditor/activeCustomEditorCellEdit/activeCustomEditorToken/nextCustomEditorToken/editingMultilineOriginalRowHeight` 字段、`openCellEditorForTrigger`、`resolveRuntimeField`、`resolveCellEditorEntry`、`resolveCellTypeDefinitionEntry`、`hasCustomCellEditor`、`invokeCellAction`、`openCustomCellEditor`、`commitCustomEditorValue`、`closeCustomEditor`、`closeActiveCustomEditor`、`openBuiltInDomEditor`、`showCellEditor`、`commitCellEdit`、`cancelCellEdit`、`syncCellEditorPosition`、`computeCellEditorRect`、`resolveEditCell`、`openCellEditor`、`handleCellEdit*` 四个、`syncCellEditorTheme` 体。

**引用映射:** `this.paintSync()` → `this.deps.paintSync()`;`this.autofitRows(...)` → `this.deps.autofitRows(...)`;`this.engine.navigateSelection` 等 engine 调用 → `this.deps.engine.*`;`this.getSelectionScrollTarget()/ensureCellVisible(...)` → deps;`this.afterEngineMutation()`(cancelCellEdit 恢复行高路径)→ deps;`frame ?? this.engine.getFrame()` fallback → `frame ?? this.deps.engine.getFrame()`。

**GridRuntime wiring:** flush 的 `augmentFrame` 闭包改 `(frame) => this.cellEdit.augmentFrame(frame)`;`syncDomLayers` 内 `syncCellEditorPosition` 改 `this.cellEdit.syncCellEditorPosition(frame)`;ViewportController deps 的 `afterApplyScroll` 组合闭包、`afterEngineMutation`、`destroy`、pointer/keyDown 路由、FillHandleDrag deps 的 `commitCellEdit`、ContextMenuController deps 的 `isCellEditing/commitCellEdit` 全部改指 `this.cellEdit.*`;runtime public `setCellEditor/openCellEditor/handleCellEdit*` 改 delegate。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it, mock } from 'bun:test'
import { CellEditController } from '../../../../src/dom/runtime/controllers/CellEditController'
import { makeMockGridEngine } from '../../../helpers/mock-grid-engine'

function makeCtl(engine = makeMockGridEngine()) {
  const deps = {
    engine,
    editorContainer: document.createElement('div'),
    isDestroyed: () => false,
    refresh: mock(() => {}),
    paintSync: mock(() => {}),
    afterEngineMutation: mock(() => {}),
    ensureCellVisible: mock(() => {}),
    getSelectionScrollTarget: () => null,
    autofitRows: mock(() => ({ changedRows: 0, skippedRows: 0 })),
  }
  return { ctl: new CellEditController({ cellEditors: {}, cellTypes: {}, deps }), deps, engine }
}

describe('CellEditController', () => {
  it('augmentFrame 在自定义编辑激活且 frame 无 cellEdit 时合并会话', () => {
    const { ctl } = makeCtl()
    const frame = { cellEdit: undefined } as never
    // 未激活自定义编辑:原样返回
    expect(ctl.augmentFrame(frame)).toBe(frame)
  })

  it('非编辑态 cancelCellEdit 只关编辑器不触发 mutation 收尾', () => {
    const { ctl, deps, engine } = makeCtl()
    ;(engine.isCellEditing as unknown as ReturnType<typeof mock>).mockReturnValue(false)
    const editor = { open: mock(() => {}), close: mock(() => {}), isOpen: () => false, applyTheme: () => {} }
    ctl.setCellEditor(editor as never)
    ctl.cancelCellEdit()
    expect(editor.close).toHaveBeenCalled()
    expect(deps.afterEngineMutation).not.toHaveBeenCalled()
  })
})
```

(若 `makeMockGridEngine` 缺 `isCellEditing` 等 mock,在 helper 中补 `mock(() => false)`;helper 结构性不兼容则 STOP+ASK。)
- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 实现**(见上)。**STOP+ASK 点:** custom editor token 生命周期(`activeCustomEditorToken/nextCustomEditorToken`)迁移中发现与 close/commit 竞态语义不明时停下确认。
- [ ] **Step 4: 全量验证** — 重点 editor 相关测试 + StrictMode destroy 测试全绿。
- [ ] **Step 5: Commit** — `refactor(core): GridRuntime 拆出 CellEditController(内建+自定义编辑生命周期)`

### Task 8: DragCoordinator

**Files:**
- Create: `packages/core/src/dom/runtime/controllers/DragCoordinator.ts`
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts`
- Test: `packages/core/tests/dom/runtime/controllers/DragCoordinator.test.ts`

**Interfaces:**

```ts
export interface DragCoordinatorDeps {
  readonly engine: GridEngine
  readonly host: WebHost
  readonly scheduler: Pick<FrameScheduler, 'schedule' | 'cancel'>
  refresh(): void
  afterEngineMutation(): void
  closeContextMenu(): void
  commitCellEdit(moveAfter: boolean): void
  autofitRows(options: AutofitRowsRuntimeOptions): AutofitRowsResult
  onFill(event: FillEvent): void
  syncFillHandle(): void
  getScrollLimits(): { maxTop: number; maxLeft: number }
  getColsTotalSize(): number
  hitTestColumnHeader(event: WebPointerEvent): { colIndex: number } | null
  hitTestRowHeader(event: WebPointerEvent): { rowIndex: number } | null
  isWholeColumnSelection(range: CellRange): boolean
  isWholeRowSelection(range: CellRange): boolean
  selectWholeColumn(colIndex: number): void
  selectWholeColumnRange(anchorCol: number, extentCol: number): void
  selectWholeRowRange(anchorRow: number, extentRow: number): void
  // DOM layers(可选注入,与 GridRuntimeOptions 同名项一致)
  readonly handleLayer?: DomHandleLayer
  readonly fillLayer?: DomFillHandleLayer
  readonly columnReorderOverlay?: ColumnReorderOverlay
  readonly rowReorderOverlay?: RowReorderOverlay
}
export class DragCoordinator {
  constructor(deps: DragCoordinatorDeps)   // 内部构造 5 个 Drag 实例(现 constructor 段逐字迁移)
  tryStartDrag(event: WebPointerEvent): boolean       // pointerDown 的 drags 循环
  moveActiveDrag(event: WebPointerEvent): boolean     // activeDrag?.move
  commitActiveDrag(): boolean                          // pointerUp
  cancelActiveDrag(): boolean                          // Escape;有 activeDrag 时 cancel 并返回 true
  clearActiveDrag(): void                              // afterEngineMutation 的 activeDrag = null
  isDragBlocked(): boolean
  isResizeDragActive(): boolean                        // resizeDrag.active(sync/cursor 判定用)
  isAnyDragActive(): boolean                           // resizeDrag.active || activeDrag?.active
  handleResizePointerDown(handle: ResizeHandleRect, pointerId: number, clientX: number, clientY: number): void
  handleResizePointerMove(pointerId: number, clientX: number, clientY: number): void
  handleResizePointerUp(pointerId: number): void
  handleResizeKeyboard(handle: ResizeHandleRect, delta: number): void
  handleFillPointerDown(pointerId: number, clientX: number, clientY: number): void
  handleFillPointerMove(pointerId: number, clientX: number, clientY: number): void
  handleFillPointerUp(pointerId: number): void
  destroy(): void   // activeDrag?.cancel + stopAutoScroll(scheduler.cancel(DRAG_AUTO_SCROLL_KEY))
}
```

(`handleResizePointerDown` 的实际参数以现 runtime 签名为准逐字保持。)

**迁移成员:** `DRAG_AUTO_SCROLL_KEY/DRAG_AUTO_SCROLL_EDGE_PX/DRAG_AUTO_SCROLL_MAX_STEP_PX` 常量、`AutoScrollDragKind` 类型、`lastDragPointer/activeDrag/resizeDrag/columnHeaderDrag/rowHeaderDrag/fillHandleDrag/selectionDrag/drags` 字段、constructor 中 5 个 Drag 构造段(deps 闭包改指 coordinator 自身 deps:如 `hitTestColumnHeader: (e) => this.deps.hitTestColumnHeader(e)`、`requestAutoScroll: (p) => this.requestDragAutoScroll(p)`)、`isDragBlocked`、`requestDragAutoScroll`、`stopDragAutoScroll`、`updateDragAutoScroll`、`tickDragAutoScroll`、`computeDragAutoScrollStep`、`reevaluateDragAfterAutoScroll`、`activeAutoScrollDrag`、`handleResizePointer*` 三个、`handleFillPointer*` 三个、`handleResizeKeyboard`、`readResizeSize`。

**GridRuntime wiring:** deps 闭包指向已拆 controller(`closeContextMenu: () => this.contextMenu.close()`、`commitCellEdit: (m) => this.cellEdit.commitCellEdit(m)`、`getScrollLimits: () => this.viewport.getScrollLimits()`、`getColsTotalSize: () => this.viewport.getColsTotalSizeForFrame(this.engine.getFrame())`、`syncFillHandle: () => this.syncFillHandle()`)与 runtime 暂存方法(hitTest/selectWhole* 仍在 runtime,Task 9 再迁);pointer 路由改 `this.drag.tryStartDrag(event)` 等;`syncResizeHandles` 的 `this.resizeDrag.active` → `this.drag.isResizeDragActive()`;`handleHostContextMenu` 用的 `isDragActive` 闭包 → `() => this.drag.isAnyDragActive()`;`afterEngineMutation` 的 `this.activeDrag = null` → `this.drag.clearActiveDrag()`;runtime public `handleResizePointer*/handleFillPointer*/handleResizeKeyboard` 改 delegate。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it, mock } from 'bun:test'
import { DragCoordinator } from '../../../../src/dom/runtime/controllers/DragCoordinator'
import { makeMockGridEngine } from '../../../helpers/mock-grid-engine'
import type { WebHost } from '../../../../src/dom/host/Host'

function makeCoordinator() {
  const cancel = mock(() => {})
  const host = {
    getContainerSize: () => ({ width: 400, height: 300 }),
    getScrollPosition: () => ({ scrollTop: 0, scrollLeft: 0 }),
    scrollTo: mock(() => {}),
  } as unknown as WebHost
  const drag = new DragCoordinator({
    engine: makeMockGridEngine(),
    host,
    scheduler: { schedule: (_k: string, cb: () => void) => { cb() }, cancel },
    refresh: () => {},
    afterEngineMutation: () => {},
    closeContextMenu: () => {},
    commitCellEdit: () => {},
    autofitRows: () => ({ changedRows: 0, skippedRows: 0 }),
    onFill: () => {},
    syncFillHandle: () => {},
    getScrollLimits: () => ({ maxTop: 1000, maxLeft: 1000 }),
    getColsTotalSize: () => 4000,
    hitTestColumnHeader: () => null,
    hitTestRowHeader: () => null,
    isWholeColumnSelection: () => false,
    isWholeRowSelection: () => false,
    selectWholeColumn: () => {},
    selectWholeColumnRange: () => {},
    selectWholeRowRange: () => {},
  })
  return { drag, cancel }
}

describe('DragCoordinator — 编排状态', () => {
  it('无 active drag 时 cancel/commit/move 均为 no-op 且不阻塞', () => {
    const { drag } = makeCoordinator()
    expect(drag.cancelActiveDrag()).toBe(false)
    expect(drag.commitActiveDrag()).toBe(false)
    expect(drag.moveActiveDrag({ x: 0, y: 0 } as never)).toBe(false)
    expect(drag.isDragBlocked()).toBe(false)
    expect(drag.isAnyDragActive()).toBe(false)
  })

  it('destroy 幂等:二次调用不抛且每次都取消 auto-scroll 调度', () => {
    const { drag, cancel } = makeCoordinator()
    drag.destroy()
    drag.destroy()
    expect(cancel.mock.calls.length).toBeGreaterThanOrEqual(2)
  })
})
```

(auto-scroll 行为主锚点是既有 `GridRuntime.drag-auto-scroll.test.ts` 经 runtime delegate 保持全绿,不在本单测重复。)
- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 实现**(见上)。
- [ ] **Step 4: 全量验证** — 重点 `drag-auto-scroll`、`fill`、`col-reorder` 测试全绿。
- [ ] **Step 5: Commit** — `refactor(core): GridRuntime 拆出 DragCoordinator(拖拽编排与 auto-scroll)`

### Task 9: InputController(收尾拆分)

**Files:**
- Create: `packages/core/src/dom/runtime/controllers/InputController.ts`
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts`
- Test: `packages/core/tests/dom/runtime/controllers/InputController.test.ts`

**Interfaces:**

```ts
export interface InputControllerDeps {
  readonly engine: GridEngine
  readonly host: WebHost
  isDestroyed(): boolean
  refresh(): void
  invalidate(): void
  getRenderer(): RenderBackend                       // getCellActionAt
  readonly validationTooltip?: ValidationTooltip
  // drag
  tryStartDrag(event: WebPointerEvent): boolean
  moveActiveDrag(event: WebPointerEvent): boolean
  commitActiveDrag(): boolean
  cancelActiveDrag(): boolean
  isAnyDragActive(): boolean
  isResizeDragActive(): boolean
  // edit
  closeActiveCustomEditor(): void
  commitCellEdit(moveAfter: boolean): void
  openCellEditorForTrigger(args: { cell: CellAddress; trigger: CellEditorTrigger; initialInput?: string; selectAll?: boolean }): boolean
  hasCustomCellEditor(cell: CellAddress): boolean
  invokeCellAction(action: CellActionHit): void
  // clipboard / undo
  clipboardCopy(): Promise<boolean>
  clipboardCut(): Promise<boolean>
  clipboardPaste(): Promise<boolean>
  undo(): void
  redo(): void
  // menu
  hitTestColumnHeaderMenuButton(event: WebPointerEvent): { colIndex: number } | null
  openColumnHeaderContextMenu(colIndex: number, event: WebPointerEvent): void
  updateHoveredColumnHeaderMenu(event: WebPointerEvent): void
  isFilterPopoverOpen(): boolean
  // viewport
  ensureCellVisible(cell: CellAddress): void
  getSelectionScrollTarget(): CellAddress | null
}
export class InputController {
  constructor(deps: InputControllerDeps)
  handleHostPointerDown(event: WebPointerEvent): void
  handleHostPointerMove(event: WebPointerEvent): void
  handleHostPointerUp(): void
  handleHostDoubleClick(event: WebPointerEvent): void
  handleHostKeyDown(event: WebKeyboardEvent): boolean
  // 供 DragCoordinator deps 反向消费
  hitTestColumnHeader(event: WebPointerEvent): { colIndex: number } | null
  hitTestRowHeader(event: WebPointerEvent): { rowIndex: number } | null
  isWholeColumnSelection(range: CellRange): boolean
  isWholeRowSelection(range: CellRange): boolean
  selectWholeColumn(colIndex: number): void
  selectWholeColumnRange(anchorCol: number, extentCol: number): void
  selectWholeRowRange(anchorRow: number, extentRow: number): void
}
```

**迁移成员:** `handleHostPointerDown/Move/Up`、`handleHostDoubleClick`、`handleHostKeyDown`、`updateHeaderCursor`、`hitTestColumnHeader`、`hitTestRowHeader`、`isWholeColumnSelection`、`isWholeRowSelection`、`selectWholeColumn`、`selectWholeColumnRange`、`selectWholeRowRange`、`updateValidationTooltip`、`computeValidationCellRect`。

**引用映射(keyDown 关键分支——语义逐字保持):** `Escape+activeDrag` → `this.deps.cancelActiveDrag()`(返回 true/false 语义同现状);`this.filterPopover?.isOpen()` → `this.deps.isFilterPopoverOpen()`;`void this.handleClipboardCopy()` → `void this.deps.clipboardCopy()`(cut/paste 同);`this.engine.canUndo()` 守卫 + `this.undo()` → `this.deps.engine.canUndo()` + `this.deps.undo()`;F2/Enter/typing → `this.deps.openCellEditorForTrigger(...)`/`hasCustomCellEditor`;导航尾段 → `this.deps.getSelectionScrollTarget()/ensureCellVisible()/refresh()`。pointerDown:`closeActiveCustomEditor/commitCellEdit/invokeCellAction/getCellActionAt/hitTestColumnHeaderMenuButton/openColumnHeaderContextMenu/drags 循环` 全走 deps。

**GridRuntime wiring:** runtime public `handleHostPointer*/handleHostDoubleClick/handleHostKeyDown` 改 delegate;DragCoordinator deps 中 `hitTestColumnHeader/hitTestRowHeader/isWhole*/selectWhole*` 闭包改指 `this.input.*`;ContextMenuController deps 的 `hitTestColumnHeader` 同步改指。

- [ ] **Step 1: 写失败测试**

```ts
import { describe, expect, it, mock } from 'bun:test'
import { InputController } from '../../../../src/dom/runtime/controllers/InputController'
import { makeMockGridEngine } from '../../../helpers/mock-grid-engine'
import type { WebHost } from '../../../../src/dom/host/Host'

function makeCtl(over: Record<string, unknown> = {}) {
  const deps = {
    engine: makeMockGridEngine(),
    host: { setCursor: mock(() => {}) } as unknown as WebHost,
    isDestroyed: () => false,
    refresh: mock(() => {}),
    invalidate: () => {},
    getRenderer: () => ({}) as never,
    tryStartDrag: mock(() => false),
    moveActiveDrag: () => false,
    commitActiveDrag: () => false,
    cancelActiveDrag: mock(() => true),
    isAnyDragActive: () => false,
    isResizeDragActive: () => false,
    closeActiveCustomEditor: () => {},
    commitCellEdit: () => {},
    openCellEditorForTrigger: () => false,
    hasCustomCellEditor: () => false,
    invokeCellAction: () => {},
    clipboardCopy: mock(async () => true),
    clipboardCut: mock(async () => true),
    clipboardPaste: mock(async () => true),
    undo: mock(() => {}),
    redo: mock(() => {}),
    hitTestColumnHeaderMenuButton: () => null,
    openColumnHeaderContextMenu: () => {},
    updateHoveredColumnHeaderMenu: () => {},
    isFilterPopoverOpen: () => false,
    ensureCellVisible: () => {},
    getSelectionScrollTarget: () => null,
    ...over,
  }
  return { ctl: new InputController(deps as never), deps }
}

describe('InputController — keyDown 路由', () => {
  it('Cmd/Ctrl+C 走 clipboardCopy 并吞掉事件', () => {
    const { ctl, deps } = makeCtl()
    const handled = ctl.handleHostKeyDown({ key: 'c', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false } as never)
    expect(handled).toBe(true)
    expect(deps.clipboardCopy).toHaveBeenCalled()
  })

  it('filter popover 打开时不抢键盘', () => {
    const { ctl, deps } = makeCtl({ isFilterPopoverOpen: () => true })
    const handled = ctl.handleHostKeyDown({ key: 'c', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false } as never)
    expect(handled).toBe(false)
    expect(deps.clipboardCopy).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 运行确认失败**。
- [ ] **Step 3: 实现**(见上)。**STOP+ASK 点(spec §6 首要风险):** keyDown 任何分支的 return true/false 语义、修饰键组合归属不明时停下确认,不得改变任何快捷键行为。
- [ ] **Step 4: 全量验证** — 全套 `bun test packages/core`;此时 `GridRuntime.ts` 实测约 1226 行(组合根 wiring + ~32 个 mutation passthrough + setter/回调注册一行 delegate;原 plan 估的 "≤~700 行" 低估了 8-controller 组合根本身的体量,以实测为准,非缺陷)。
- [ ] **Step 5: Commit** — `refactor(core): GridRuntime 拆出 InputController,Phase 1 拆分收官`

---

## Phase 2 — mutation passthrough 重划

### Task 10: GridControllerImpl 直调 engine,删除 runtime passthrough

> 与 spec §4 的 Task 10/11 划分微调:白盒测试改指向并入本 task(否则删方法后本 task 无法全绿),spec 的 Task 11 内容归入下方 Task 11 收尾验证。意图不变。

**Files:**
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts`、`packages/core/src/dom/runtime/GridControllerImpl.ts`
- Modify(测试改指向): `packages/core/tests/dom/runtime/*.test.ts` 中直调 runtime mutation 的用例

**Interfaces:**
- Consumes: `GridControllerImpl` 已自持 `this.engine`(`DefaultGridEngine`)与 `this.runtime`;`runtime.afterEngineMutation()` 已 public。
- Produces: runtime 上述 passthrough 方法删除;`GridControllerImpl` 内改 `this.engine.xxx(...)` + 收尾语义等价调用。

**方法清单与收尾语义(改道时逐方法核对现 runtime 实现,保持完全等价):**

| 组 | 方法 | 收尾语义 |
| --- | --- | --- |
| 行结构 | `insertRows`(返回 ids)、`deleteRows`、`hideRows`、`unhideRows`、`setRowHeights`、`setRowHeight` | engine 调用后 `afterEngineMutation()`;`insertRows` 先取返回值 |
| 列结构 | `insertCols`(返回 Fields)、`deleteCols`、`hideCols`、`unhideCols`、`setColumnWidths`、`setColumnWidth`、`moveCols`(返回 boolean) | 同上;`moveCols` 返回 `false` 时是否仍收尾以现实现为准 |
| format/merge | `setFillColor`、`setBorders`、`setValueFormat`、`setCellType`、`clearCellType`、`setTextWrap`、`mergeCells`、`unmergeCells`(均返回 boolean) | **返回 `false`(sort/filter 打散 no-op)时不收尾**;`true` 才 `afterEngineMutation()`——以现实现为准逐一核对 |
| validation | `setValidation`、`clearValidation` | 以现实现为准(afterEngineMutation 或 invalidate) |
| attachment/读 | `setCellAttachment`、`getCellAttachment`、`getCellText`、`getHiddenRows`、`getHiddenCols`、`getSelection` | 读方法直调 engine 无收尾;`setCellAttachment` 以现实现为准 |
| selection/frozen | `setSelection`、`setFrozen` | 以现实现为准 |

**保留在 runtime(非 passthrough,不动):** `undo/redo/canUndo/canRedo`(→ClipboardController)、`setData/updateViewData/setTheme/replaceRenderer`(带 renderer/cache 编排)、`autofitRows`、`afterEngineMutation`、`refresh`、`attach/destroy`、`openCellEditor`、`scrollToRow/scrollToCell`、`getRowHeaderContextMenuItems` 等菜单 API、各 `handle*` 事件入口、各 `set*`(editor/layer/popover/callback 注入)。

- [ ] **Step 1: 生成基线清单** — 逐个读 runtime 上表方法现实现,把"engine 调用 + 收尾"语义记录成对照表(留在 task notes,不猜)。
- [ ] **Step 2: 改道 GridControllerImpl** — 对照表逐方法把 `this.runtime.xxx(...)` 改为 `this.engine.xxx(...)` + 等价收尾(`this.runtime.afterEngineMutation()` / 无收尾 / 条件收尾)。ContextMenuController deps 的结构 mutation 闭包(在 GridRuntime wiring 内)同步改为直调 engine + 收尾,例:

```ts
insertRows: (at, n) => {
  const ids = this.engine.insertRows(at, n)
  this.afterEngineMutation()
  return ids
},
```

- [ ] **Step 3: 删除 runtime passthrough 方法**,并更新 `tests/dom/runtime/` 中直调这些方法的测试:mutation 改 `engine.xxx(...)` 后手动 `runtime.afterEngineMutation()`(或改走 `GridControllerImpl`,取更贴近场景者)。
- [ ] **Step 4: 全量验证** — `bun test`(全 workspace)+ typecheck + lint 全绿;`GridRuntime.ts` 应 ≤ ~450 行。
- [ ] **Step 5: Commit** — `refactor(core): mutation passthrough 移出 GridRuntime,GridControllerImpl 直调 engine`

### Task 11: 收尾验证与文档

**Files:**
- Verify: `packages/core/tests/acceptance/contract/plugin-api/__goldens__/core.type.public-api-inventory.golden.txt`(应无 diff)、`packages/core/src/dom/index.ts`(不新增导出)
- Modify: `docs/superpowers/specs/2026-07-11-grid-runtime-decomposition-design.md`(状态→已实现)、`CLAUDE.md`(若 Current state 提及 GridRuntime 行数/结构则同步)

- [ ] **Step 1: 全量四 gate** — `bun test` + `bun run --filter '*' typecheck` + `bun run lint` + `bun run --filter @novasheet/core build && bun run --filter @novasheet/canvas2d build` 全绿;`mbd validate` 与 `lint:scenario-coverage` 不退化。
- [ ] **Step 2: 行数与边界断言** — `wc -l packages/core/src/dom/runtime/GridRuntime.ts`;Task 9 完成时实测 1226 行,Task 10 预期移除约 32 个 mutation passthrough 方法(约 164 行),目标区间 ≤ 1100 行(原 plan "≤450" 严重低估 8-controller 组合根本身体量,以此行为准,不视为质量问题);`grep -rn "from '../GridRuntime'" packages/core/src/dom/runtime/controllers/` 无结果(controller 零依赖 runtime);golden 无 diff。
- [ ] **Step 3: 更新 spec 状态与 CLAUDE.md**,commit — `docs(spec): GridRuntime 分解标记完成并同步导航`
- [ ] **Step 4: dispatch code-reviewer**(里程碑收尾,即便全绿)——重点审 deps 接口最小性、destroy 幂等扇出、flush 单帧契约、Task 10 收尾语义等价性。
