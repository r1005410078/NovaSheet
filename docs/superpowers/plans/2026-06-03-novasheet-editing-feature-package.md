# Editing Feature Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把单元格编辑能力（`DomCellEditor` + 编辑生命周期）从 `@novasheet/web` 拆到默认安装的 `@novasheet/feature-editing`，复用 phase 3 的 `WebFrameSync` 做编辑器定位。

**Architecture:** 新增 `WebCellEditor` capability + `web.cell-editor` 贡献点（editing 非 drag）。`EditingController` 同时实现 `WebCellEditor`(命令) + `WebFrameSync`(定位)，自持 `DomCellEditor`。runtime 保留键盘/双击起编入口但委托 `cellEditController`；`commitActiveEdit` 重指向它（兑现 fill 的 follow-up）。编辑语义留 `@novasheet/core`。

**Execution Status (2026-06-03, inline 执行):** 完成 Task 1-3。全量 gates 通过（lint / typecheck --filter '*' / bun test 901 pass / 全包 build）。3 个原 web 编辑测试（键入起编、合并区编辑器矩形、右键先提交）迁入 `packages/feature-editing/tests/WebGridRuntime.editing.test.ts`（安装 feature + 真实 controller 驱动）。

**Tech Stack:** Bun workspaces、TypeScript strict + `verbatimModuleSyntax`、`bun:test`、phase 3 的 `WebFrameSync`。

**设计依据：** `docs/superpowers/specs/2026-06-03-novasheet-editing-feature-package-design.md`。

**已知计划风险（遇到 STOP+ASK）：**

- Task 2 是大原子提交：`git mv DomCellEditor` 立即破坏 backend，故 feature 落地 + runtime 委托 + backend 清理 + 默认安装必须**同一次提交**且首次绿（编辑是默认路径，不能留破损中间态）。
- 主题：旧 `syncCellEditorTheme` 在 setTheme 时重刷编辑器主题；新设计由 `EditingController.syncFrame` 在编辑器打开时 `applyTheme`，保持编辑中主题切换仍生效。若发现主题路径有其它依赖 STOP。
- `commitActiveEdit` 委托后，未安装 editing 时变 no-op：fill 起拖前"提交进行中编辑"成空操作，符合预期；若某 kernel 路径强依赖同步提交 STOP。

---

## Scope

In scope：`WebCellEditor`/`web.cell-editor` 契约；`EditingController`（含 `DomCellEditor`、`cell-editor-style`、`computeCellEditorRect`、multiline/autofit/行高恢复）；runtime 委托骨架 + 删除生命周期；通用 services `revealActiveCell`/`requestSyncPaint`/`tryCustomEditor`；sheet 默认安装 + backend 清理；测试迁移。

Out of scope：keyboard 契约（编辑键入口仍在 kernel）；自定义 editor 迁 command 契约（`tryCustomEditor`/`tryOpenCustomCellEditor` 暂留 web，债务）；编辑语义（core 不动）。

## Current File Map

```txt
packages/web/src/interaction/DomCellEditor.ts          # 要搬
packages/web/src/host/cell-editor-style.ts             # 要搬
packages/web/src/runtime/WebGridRuntime.ts             # 生命周期方法 / 委托骨架
packages/web/src/interaction/drag/WebDragContribution.ts # WebFrameSync 契约所在（已有）
packages/web/src/index.ts                              # 导出
packages/sheet/src/backends/Canvas2DBackend.ts         # new DomCellEditor / 自定义 editor
packages/sheet/src/defaults/installDefaultExtensions.ts
tsconfig.base.json / packages/sheet/{package.json,build.ts}
```

## Target File Map

```txt
packages/web/src/interaction/cell-editor/WebCellEditor.ts   # 新契约 + 注册/读取
packages/feature-editing/
  package.json / build.ts / tsconfig.json / tsconfig.build.json
  src/index.ts
  src/installEditingFeature.ts
  src/EditingController.ts        # WebCellEditor + WebFrameSync，自持 DomCellEditor
  src/DomCellEditor.ts            # git mv
  src/cell-editor-style.ts        # git mv
  src/computeCellEditorRect.ts    # 从 runtime 抽出
  tests/installEditingFeature.test.ts
  tests/EditingController.test.ts
  tests/DomCellEditor.test.ts     # git mv（若存在）
```

---

## Task 1: 新增 `WebCellEditor` 契约与 `web.cell-editor` 贡献点（独立绿提交）

**Files:**

- Create: `packages/web/src/interaction/cell-editor/WebCellEditor.ts`
- Modify: `packages/web/src/index.ts`
- Test: `packages/web/tests/interaction/cell-editor/WebCellEditor.test.ts`

- [ ] **Step 1: 写失败测试**

Create `packages/web/tests/interaction/cell-editor/WebCellEditor.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import { registerWebCellEditor, getWebCellEditorContributions } from '@novasheet/web'

describe('web.cell-editor contribution', () => {
  it('注册并按 order 读取 cell-editor 贡献', () => {
    const ctx = createSheetContext()
    registerWebCellEditor(ctx, { id: 'editing', order: 10, create: () => null })
    expect(getWebCellEditorContributions(ctx).map((c) => c.id)).toEqual(['editing'])
  })
})
```

Run: `bun test packages/web/tests/interaction/cell-editor/WebCellEditor.test.ts`
Expected: FAIL — 未导出。

- [ ] **Step 2: 实现契约**

Create `packages/web/src/interaction/cell-editor/WebCellEditor.ts`:

```ts
import type { AutofitRowsResult, CellAddress, GridEngine, SheetContext } from '@novasheet/core'
import type { WebHost } from '../../host/WebHost'
import type { WebFrameSync } from '../drag/WebDragContribution'

/** 编辑器命令接口：runtime 的键盘/双击入口与 commitActiveEdit 服务委托给它。 */
export interface WebCellEditor {
  /** 打开编辑器（双击 / F2）；返回是否成功进入编辑。 */
  open(cell: CellAddress, options: { selectAll?: boolean }): boolean
  /** 以首个键入字符为 draft 打开（键入即编辑）。 */
  beginWithDraft(cell: CellAddress, draft: string): boolean
  /** 提交当前编辑；moveAfter 提交后下移选区。 */
  commitActive(moveAfter: boolean): void
  /** 取消当前编辑（含 multiline 行高恢复）。 */
  cancelActive(): void
}

/** 提供给 cell-editor feature 的 runtime 服务（feature 自定义 deps）。 */
export interface WebCellEditorRuntimeDeps {
  readonly engine: GridEngine
  readonly host: WebHost
  autofitRows(options: { rows?: readonly number[] }): AutofitRowsResult
  afterEngineMutation(): void
  refresh(): void
  /** 把当前选区目标滚动到可见（提交下移后用）。 */
  revealActiveCell(): void
  /** 打开编辑器前同步绘制一帧。 */
  requestSyncPaint(): void
  isBlocked(): boolean
  /** 自定义 editor 逃生口（决策债务）：返回 true 表示已被自定义 editor 接管。 */
  tryCustomEditor(cell: CellAddress): boolean
}

export const WEB_CELL_EDITOR_CONTRIBUTION = 'web.cell-editor'

/** 贡献一个 cell-editor controller（同时实现 WebCellEditor + WebFrameSync）。 */
export interface WebCellEditorContribution {
  readonly id: string
  readonly order: number
  create(deps: WebCellEditorRuntimeDeps): (WebCellEditor & WebFrameSync) | null
}

/** 在 SheetContext 上注册 cell-editor 贡献。 */
export function registerWebCellEditor(ctx: SheetContext, contribution: WebCellEditorContribution): void {
  ctx.extensions.contribute(WEB_CELL_EDITOR_CONTRIBUTION, contribution)
}

/** 按 order 读取 cell-editor 贡献。 */
export function getWebCellEditorContributions(ctx: SheetContext): readonly WebCellEditorContribution[] {
  return (ctx.registry.contributions.get(WEB_CELL_EDITOR_CONTRIBUTION) ?? [])
    .filter(isWebCellEditorContribution)
    .sort((a, b) => a.order - b.order)
}

function isWebCellEditorContribution(value: unknown): value is WebCellEditorContribution {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Partial<WebCellEditorContribution>
  return typeof c.id === 'string' && typeof c.order === 'number' && typeof c.create === 'function'
}
```

> 形态镜像 `WebDragContribution.ts` 的 `registerWebDrag`/`getWebDragContributions`。若 `SheetContext` 的 `extensions.contribute` / `registry.contributions` 签名与 drag 版不同，STOP 并对齐。

- [ ] **Step 3: 导出**

In `packages/web/src/index.ts` 加：

```ts
export {
  WEB_CELL_EDITOR_CONTRIBUTION,
  registerWebCellEditor,
  getWebCellEditorContributions,
} from './interaction/cell-editor/WebCellEditor'
export type {
  WebCellEditor,
  WebCellEditorContribution,
  WebCellEditorRuntimeDeps,
} from './interaction/cell-editor/WebCellEditor'
```

- [ ] **Step 4: 验证 + 提交**

Run（全部 exit 0）：

```bash
bun test packages/web/tests/interaction/cell-editor/WebCellEditor.test.ts
bun run --filter @novasheet/web typecheck
bun run --filter @novasheet/web build
bun run lint
```

```bash
git add packages/web/src/interaction/cell-editor packages/web/src/index.ts packages/web/tests/interaction/cell-editor
git commit -m "$(printf 'feat(web): 新增 WebCellEditor 契约与 web.cell-editor 贡献点\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: feature-editing 整竖切片 + runtime 委托 + backend 默认安装（大原子提交）

> 一次做完、一次绿。`git mv DomCellEditor` 起即破坏 backend，编辑又是默认路径，故 feature/runtime/backend/install 必须同一提交。

**Files:**

- Create: `packages/feature-editing/{package.json,build.ts,tsconfig.json,tsconfig.build.json,src/index.ts,src/installEditingFeature.ts,src/EditingController.ts,src/computeCellEditorRect.ts}`
- Move: `packages/web/src/interaction/DomCellEditor.ts` → `packages/feature-editing/src/DomCellEditor.ts`
- Move: `packages/web/src/host/cell-editor-style.ts` → `packages/feature-editing/src/cell-editor-style.ts`
- Move (if exists): `packages/web/tests/interaction/DomCellEditor.test.ts` → `packages/feature-editing/tests/DomCellEditor.test.ts`
- Modify: `packages/web/src/runtime/WebGridRuntime.ts`、`packages/web/src/index.ts`
- Modify: `packages/sheet/src/backends/Canvas2DBackend.ts`、`packages/sheet/src/defaults/installDefaultExtensions.ts`、`packages/sheet/package.json`、`packages/sheet/build.ts`、`tsconfig.base.json`

- [ ] **Step 1: 建包脚手架**

Create `packages/feature-editing/package.json`（镜像 feature-fill-handle，改 name/description 为 `@novasheet/feature-editing` / "Cell editing feature for NovaSheet."）。
Create `build.ts`：复制 `packages/feature-fill-handle/build.ts`，注释包名改 editing，`EXTERNALS = ['@novasheet/core', '@novasheet/web']`。
Create `tsconfig.json` / `tsconfig.build.json`：与 `packages/feature-fill-handle/` 同内容。
In `tsconfig.base.json` paths 加：`"@novasheet/feature-editing": ["packages/feature-editing/src/index.ts"],`（字母序在 canvas2d 后、fill-handle 前）。
Run: `bun install`。

- [ ] **Step 2: 搬移 DOM 编辑器与样式**

```bash
mkdir -p packages/feature-editing/src packages/feature-editing/tests
git mv packages/web/src/interaction/DomCellEditor.ts packages/feature-editing/src/DomCellEditor.ts
git mv packages/web/src/host/cell-editor-style.ts packages/feature-editing/src/cell-editor-style.ts
```

In `packages/feature-editing/src/DomCellEditor.ts` 改 import：
`import { applyCellEditorTheme, ensureCellEditorStylesheet } from './cell-editor-style'`（原为 `../host/cell-editor-style`）。`CellRect, Theme` 仍从 `@novasheet/core`。

若 `packages/web/tests/interaction/DomCellEditor.test.ts` 存在：`git mv` 到 `packages/feature-editing/tests/DomCellEditor.test.ts`，import 改 `../src/DomCellEditor`。

- [ ] **Step 3: 抽出 `computeCellEditorRect`**

Create `packages/feature-editing/src/computeCellEditorRect.ts`:

```ts
import { computeCellRect, type CellAddress, type RenderFrame } from '@novasheet/core'
import { computeRangeOverlayRects, type OverlayRect } from '@novasheet/web'

/** 合并区感知的编辑器矩形：active cell 落在合并区时锚定整个合并区，否则取单元格 rect。 */
export function computeCellEditorRect(
  frame: RenderFrame,
  cell: CellAddress,
): OverlayRect | null {
  const mergeRange = (frame.mergeRegions ?? []).find(
    (merge) =>
      cell.rowIndex >= merge.range.startRow &&
      cell.rowIndex <= merge.range.endRow &&
      cell.colIndex >= merge.range.startCol &&
      cell.colIndex <= merge.range.endCol,
  )?.range
  if (mergeRange) return computeRangeOverlayRects(frame, mergeRange).at(-1) ?? null
  return computeCellRect(frame, cell)
}
```

> `computeCellRect` 返回 `CellRect`，`computeRangeOverlayRects` 返回 `OverlayRect`；二者结构都是 `{x,y,width,height}`。`DomCellEditor.open/syncRect` 形参为 `CellRect`。统一返回 `OverlayRect`（同形）；若 `CellRect` 与 `OverlayRect` 类型不兼容导致 controller 调用报错，在 controller 处 `as` 或让本函数返回 `CellRect | null` 并对 merge 分支构造 `CellRect`。执行时以 typecheck 为准。

- [ ] **Step 4: 写 `EditingController`**

Create `packages/feature-editing/src/EditingController.ts`:

```ts
import type { AutofitRowsResult, CellAddress, GridEngine, RenderFrame } from '@novasheet/core'
import type {
  WebCellEditor,
  WebCellEditorRuntimeDeps,
  WebFrameSync,
  WebInteractionStatus,
} from '@novasheet/web'
import { DomCellEditor } from './DomCellEditor'
import { computeCellEditorRect } from './computeCellEditorRect'

export type EditingControllerDeps = WebCellEditorRuntimeDeps

/**
 * 单元格编辑控制器：WebCellEditor(命令) + WebFrameSync(定位)，自持 DomCellEditor。
 * 编辑语义全部经 engine；DOM 编辑器回调直达本控制器；定位/主题在 syncFrame 每帧同步。
 */
export class EditingController implements WebCellEditor, WebFrameSync {
  private editor: DomCellEditor | null = null
  private multilineOriginalRowHeight: number | null = null

  constructor(private readonly deps: EditingControllerDeps) {}

  // --- WebFrameSync ---

  attach(container: HTMLElement): void {
    this.editor = new DomCellEditor(container, {
      onDraftChange: (draft) => this.deps.engine.updateCellEditDraft(draft),
      onCommitEnter: () => this.commitActive(true),
      onCommitBlur: () => this.commitActive(false),
      onCancel: () => {
        this.cancelActive()
        this.deps.refresh()
      },
    })
    this.editor.attach()
  }

  syncFrame(frame: RenderFrame, _status: WebInteractionStatus): void {
    if (!this.editor?.isOpen()) return
    const session = frame.cellEdit
    if (!session) {
      this.editor.close()
      return
    }
    const rect = computeCellEditorRect(frame, session.cell)
    if (!rect) {
      this.cancelActive()
      return
    }
    this.editor.applyTheme(frame.theme)
    this.editor.syncRect(rect)
  }

  destroy(): void {
    this.editor?.destroy()
    this.editor = null
  }

  // --- WebCellEditor ---

  open(cell: CellAddress, options: { selectAll?: boolean }): boolean {
    if (!this.editor || this.deps.isBlocked()) return false
    if (this.deps.tryCustomEditor(cell)) return true
    if (!this.deps.engine.beginCellEdit(cell)) return false
    return this.showEditor(options)
  }

  beginWithDraft(cell: CellAddress, draft: string): boolean {
    if (!this.editor || this.deps.isBlocked()) return false
    if (this.deps.tryCustomEditor(cell)) return true
    if (!this.deps.engine.beginCellEdit(cell)) return false
    this.deps.engine.updateCellEditDraft(draft)
    return this.showEditor({ selectAll: false })
  }

  commitActive(moveAfter: boolean): void {
    const engine = this.deps.engine
    if (!engine.isCellEditing()) return
    const session = engine.getFrame().cellEdit
    const wasMultiline = this.multilineOriginalRowHeight !== null
    const editedRow = session?.cell.rowIndex
    if (!engine.commitCellEdit()) return
    this.multilineOriginalRowHeight = null
    this.editor?.close()
    if (wasMultiline && editedRow !== undefined) {
      this.deps.autofitRows({ rows: [editedRow] })
    }
    if (moveAfter) {
      engine.navigateSelection('ArrowDown', false)
      this.deps.revealActiveCell()
    }
    this.deps.refresh()
  }

  cancelActive(): void {
    const engine = this.deps.engine
    if (!engine.isCellEditing()) {
      this.editor?.close()
      this.multilineOriginalRowHeight = null
      return
    }
    const session = engine.getFrame().cellEdit
    const restoreHeight = this.multilineOriginalRowHeight
    const restoreRow = session?.cell.rowIndex
    engine.cancelCellEdit()
    this.editor?.close()
    if (restoreHeight !== null && restoreRow !== undefined) {
      const currentHeight = engine.getRowsAxis().getSize(restoreRow)
      if (currentHeight !== restoreHeight) {
        engine.setRowHeight(restoreRow, restoreHeight)
        this.deps.afterEngineMutation()
      }
    }
    this.multilineOriginalRowHeight = null
  }

  private showEditor(options: { selectAll?: boolean }): boolean {
    const engine = this.deps.engine
    const frame = engine.getFrame()
    const session = frame.cellEdit
    const rect = session ? computeCellEditorRect(frame, session.cell) : null
    if (!session || !rect || !this.editor) {
      engine.cancelCellEdit()
      return false
    }
    const field = engine.getData().getSchema?.().fields[session.cell.colIndex]
    // 任意非 number 格用多行编辑器（Alt+Enter 硬换行，提交时 autofit）；number 单行。
    const multiline = field ? field.type !== 'number' : true
    this.multilineOriginalRowHeight = multiline
      ? engine.getRowsAxis().getSize(session.cell.rowIndex)
      : null
    this.deps.requestSyncPaint()
    this.editor.applyTheme(engine.getTheme())
    this.editor.open(rect, session.draft, { ...options, multiline })
    return true
  }
}
```

> 这是从 runtime 的 `openCellEditor`/`beginCellEditWithDraft`/`showCellEditor`/`commitCellEdit`/`cancelCellEdit`/`syncCellEditorPosition` 平移而来，差异：`fillLayer→自持 editor`、`openCustomCellEditor?→deps.tryCustomEditor`、`ensureCellVisible(getSelectionScrollTarget())→deps.revealActiveCell()`、`paintSync→deps.requestSyncPaint()`、`resizeDrag.active 守卫→deps.isBlocked()`、定位逻辑搬进 `syncFrame`、主题在 `syncFrame`/`showEditor` 用 `applyTheme`。

- [ ] **Step 5: installer + index**

Create `packages/feature-editing/src/installEditingFeature.ts`:

```ts
import type { SheetContext } from '@novasheet/core'
import { registerWebCellEditor } from '@novasheet/web'
import { EditingController } from './EditingController'

/** 安装单元格编辑能力（DOM 编辑器 + 编辑生命周期 + 定位）。 */
export function installEditingFeature(ctx: SheetContext): void {
  registerWebCellEditor(ctx, {
    id: 'editing',
    order: 10,
    create: (deps) => new EditingController(deps),
  })
}
```

Create `packages/feature-editing/src/index.ts`:

```ts
export { installEditingFeature } from './installEditingFeature'
export { EditingController } from './EditingController'
export type { EditingControllerDeps } from './EditingController'
export { DomCellEditor } from './DomCellEditor'
export { computeCellEditorRect } from './computeCellEditorRect'
```

- [ ] **Step 6: runtime 委托 + 删除生命周期**

In `packages/web/src/runtime/WebGridRuntime.ts`:

删 import：`import type { DomCellEditor } from '../interaction/DomCellEditor'`。
加 import：`import { getWebCellEditorContributions, type WebCellEditor } from '../interaction/cell-editor/WebCellEditor'`（`WebFrameSync` 已 import）。

字段：删 `private cellEditor?: DomCellEditor`、`private editingMultilineOriginalRowHeight: number | null = null`；加 `private cellEditController: (WebCellEditor & WebFrameSync) | null = null`。
删 `setCellEditor` 方法（及 `opts` 里无关联——`setCellEditor` 由 backend 调，backend 也删）。

构造函数：在 `this.frameSyncs = this.drags.filter(isWebFrameSync)` 之后、`for (const fs of this.frameSyncs) fs.attach(...)` 之前插入：

```ts
this.cellEditController =
  getWebCellEditorContributions(this.context)
    .map((c) => c.create(this.createWebCellEditorDeps()))
    .find((e): e is WebCellEditor & WebFrameSync => e !== null) ?? null
if (this.cellEditController) this.frameSyncs = [...this.frameSyncs, this.cellEditController]
```

加 deps 工厂：

```ts
private createWebCellEditorDeps(): WebCellEditorRuntimeDeps {
  return {
    engine: this.engine,
    host: this.host,
    autofitRows: (options) => this.autofitRows(options),
    afterEngineMutation: () => this.afterEngineMutation(),
    refresh: () => this.refresh(),
    revealActiveCell: () => {
      const target = this.getSelectionScrollTarget()
      if (target) this.ensureCellVisible(target)
    },
    requestSyncPaint: () => this.paintSync(),
    isBlocked: () => this.resizeDrag?.active === true || !!this.activeDrag,
    tryCustomEditor: (cell) => this.openCustomCellEditor?.(cell) ?? false,
  }
}
```

（import 类型 `WebCellEditorRuntimeDeps` from cell-editor module。）

把 4 个生命周期方法改成**委托薄壳**（保留方法名以减少调用点改动）：

```ts
private openCellEditor(cell: CellAddress, options: { selectAll?: boolean } = {}): boolean {
  return this.cellEditController?.open(cell, options) ?? false
}
private beginCellEditWithDraft(cell: CellAddress, draft: string): boolean {
  return this.cellEditController?.beginWithDraft(cell, draft) ?? false
}
private commitCellEdit(moveAfter: boolean): void {
  this.cellEditController?.commitActive(moveAfter)
}
private cancelCellEdit(): void {
  this.cellEditController?.cancelActive()
}
```

删除这些方法（已移入 controller）：`showCellEditor`、`syncCellEditorPosition`、`computeCellEditorRect`、`syncCellEditorTheme`、`handleCellEditDraft`、`handleCellEditCommitEnter`、`handleCellEditCommitBlur`、`handleCellEditCancel`。

删除调用点：
- `handleHostScroll`：删 `this.syncCellEditorPosition()`（保留 `this.invalidate()`，flush 经 frameSync 重定位）。
- `invalidate()` / `paintSync()`：删 `this.syncCellEditorPosition()`。
- 所有 `this.syncCellEditorTheme()`（setTheme/afterEngineMutation 路径，约 2 处）：删（controller 在 syncFrame 内 applyTheme）。

保留不动：`tryOpenCustomCellEditor`（backend 自定义 editor 用）、`openCustomCellEditor?` opt/field、`commitActiveEdit` 服务（已是 `(m) => this.commitCellEdit(m)`，经薄壳委托 controller）、`ensureCellVisible`/`getSelectionScrollTarget`。

In `packages/web/src/index.ts`：删 `export { DomCellEditor } from './interaction/DomCellEditor'`。

- [ ] **Step 7: backend 清理 + 默认安装**

In `packages/sheet/src/backends/Canvas2DBackend.ts`:
- 删 import `DomCellEditor`。
- 删字段 `private cellEditor: DomCellEditor`。
- 删 `new DomCellEditor(...)` + `.attach()` + `this.runtime.setCellEditor(this.cellEditor)`（构造块）。
- 删 destroy 里 `this.cellEditor.destroy()`。
- 保留 `openCustomCellEditor` opt（传 runtime）、`private openCustomCellEditor` 方法、`runtime.tryOpenCustomCellEditor` 调用。

In `packages/sheet/src/defaults/installDefaultExtensions.ts`：加 `import { installEditingFeature } from '@novasheet/feature-editing'` 并在 `installResizeFeature(ctx)` 后、`installFillHandleFeature(ctx)` 前后任意位置插 `installEditingFeature(ctx)`（顺序无功能影响）。

In `packages/sheet/package.json` dependencies 加 `"@novasheet/feature-editing": "^0.1.0"`。
In `packages/sheet/build.ts` `EXTERNALS` 加 `'@novasheet/feature-editing'`。
Run: `bun install`。

- [ ] **Step 8: 测试**

Create `packages/feature-editing/tests/installEditingFeature.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import { getWebCellEditorContributions } from '@novasheet/web'
import { installEditingFeature } from '../src'

describe('installEditingFeature', () => {
  it('注册 editing cell-editor 贡献', () => {
    const ctx = createSheetContext()
    installEditingFeature(ctx)
    expect(getWebCellEditorContributions(ctx).map((c) => c.id)).toEqual(['editing'])
  })
})
```

Create `packages/feature-editing/tests/EditingController.test.ts`（用 `packages/feature-fill-handle/tests/helpers/mock-grid-engine.ts` 的同款 helper——复制到 `packages/feature-editing/tests/helpers/mock-grid-engine.ts`）：

```ts
import { describe, expect, it, mock } from 'bun:test'
import type { WebCellEditorRuntimeDeps } from '@novasheet/web'
import { EditingController } from '../src'
import { makeMockGridEngine } from './helpers/mock-grid-engine'

function makeDeps(over: Partial<WebCellEditorRuntimeDeps> = {}): {
  deps: WebCellEditorRuntimeDeps
  spies: { reveal: ReturnType<typeof mock>; custom: ReturnType<typeof mock> }
} {
  const spies = { reveal: mock(() => {}), custom: mock(() => false) }
  const deps: WebCellEditorRuntimeDeps = {
    engine: makeMockGridEngine({
      selection: {
        activeCell: { rowIndex: 0, colIndex: 0 },
        anchorCell: { rowIndex: 0, colIndex: 0 },
        extentCell: { rowIndex: 0, colIndex: 0 },
        selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
      },
    }),
    host: {} as never,
    autofitRows: mock(() => ({ changedRows: 0, skippedRows: 0 })),
    afterEngineMutation: mock(() => {}),
    refresh: mock(() => {}),
    revealActiveCell: spies.reveal,
    requestSyncPaint: mock(() => {}),
    isBlocked: () => false,
    tryCustomEditor: spies.custom,
    ...over,
  }
  return { deps, spies }
}

describe('EditingController', () => {
  it('open 经 engine.beginCellEdit 进入编辑并打开 DOM 编辑器', () => {
    const { deps } = makeDeps()
    const engine = deps.engine
    engine.beginCellEdit = mock(() => true)
    engine.getFrame = mock(() => ({
      cellEdit: { cell: { rowIndex: 0, colIndex: 0 }, draft: '' },
      mergeRegions: [],
      theme: { metrics: {}, colors: {} },
      rowsAxis: { indexToPosition: () => 0, getSize: () => 30 },
      colsAxis: { indexToPosition: () => 0, getSize: () => 100 },
      viewport: { regions: [{ rowRange: [0, 9], colRange: [0, 3], rect: { x: 0, y: 30, width: 400, height: 270 }, scrollOffsetX: 0, scrollOffsetY: 0 }] },
    })) as never
    const controller = new EditingController(deps)
    const container = document.createElement('div')
    controller.attach(container)

    expect(controller.open({ rowIndex: 0, colIndex: 0 }, { selectAll: false })).toBe(true)
    expect(engine.beginCellEdit).toHaveBeenCalled()
    expect(container.querySelector('[data-novasheet-cell-editor]')).toBeTruthy()
    controller.destroy()
  })

  it('isBlocked 时 open 返回 false 不进入编辑', () => {
    const { deps } = makeDeps({ isBlocked: () => true })
    const controller = new EditingController(deps)
    controller.attach(document.createElement('div'))
    expect(controller.open({ rowIndex: 0, colIndex: 0 }, {})).toBe(false)
    controller.destroy()
  })

  it('tryCustomEditor 接管时 open 返回 true 且不 beginCellEdit', () => {
    const { deps, spies } = makeDeps()
    spies.custom.mockImplementation(() => true)
    const engine = deps.engine
    engine.beginCellEdit = mock(() => true)
    const controller = new EditingController(deps)
    controller.attach(document.createElement('div'))
    expect(controller.open({ rowIndex: 0, colIndex: 0 }, {})).toBe(true)
    expect(engine.beginCellEdit).not.toHaveBeenCalled()
    controller.destroy()
  })

  it('commitActive(true) 提交后下移并 revealActiveCell', () => {
    const { deps, spies } = makeDeps()
    const engine = deps.engine
    engine.isCellEditing = mock(() => true)
    engine.commitCellEdit = mock(() => true)
    engine.navigateSelection = mock(() => true)
    new EditingController(deps).commitActive(true)
    expect(engine.commitCellEdit).toHaveBeenCalled()
    expect(engine.navigateSelection).toHaveBeenCalledWith('ArrowDown', false)
    expect(spies.reveal).toHaveBeenCalled()
  })
})
```

> 测试细节以现有 `mock-grid-engine` 的 `GridEngine` 形状为准；若 `getFrame` mock 字段缺失导致 `computeCellEditorRect`/`hitTest` 报错，补齐 frame 字段。断言聚焦委托与生命周期，不追像素。

迁移 runtime 侧编辑测试：`packages/web/tests/runtime/` 下若有断言 `cellEditor`/`handleCellEdit*`/`syncCellEditorPosition`/`setCellEditor` 的用例（grep `cellEditor`/`CellEdit`），改为安装 editing feature + 经 `cellEditController` 驱动，或迁到 `packages/feature-editing/tests/`。sheet 侧 `Grid.test.ts` 的编辑/自定义 editor 用例应仍通过（默认安装后行为不变）；不通过则按真因修正（STOP 若语义冲突）。

- [ ] **Step 9: 全量验证（一次绿）**

```bash
bun install
bun test
bun run --filter '*' typecheck
bun run lint
bun run --filter @novasheet/core build
bun run --filter @novasheet/web build
bun run --filter @novasheet/feature-editing build
bun run --filter @novasheet/canvas2d build
bun run --filter @novasheet/sheet build
```

Expected: all exit 0。

- [ ] **Step 10: Commit**

```bash
git add -A packages/feature-editing tsconfig.base.json bun.lock packages/web/src packages/web/tests packages/sheet
git commit -m "$(printf 'feat(editing): 新增 editing 能力包并接入 cell-editor 契约\n\n- git mv DomCellEditor + cell-editor-style 进包；computeCellEditorRect 抽出\n- EditingController 实现 WebCellEditor + WebFrameSync，自持编辑器，定位复用 frame-sync\n- runtime 生命周期改委托 cellEditController；commitActiveEdit 重指向（兑现 fill follow-up）\n- backend 删 DomCellEditor 构造；sheet 默认安装 installEditingFeature\n- 键盘/双击起编入口暂留 kernel；自定义 editor 经 tryCustomEditor 路由\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: 文档与全量验证

**Files:** `docs/architecture.md`、`docs/superpowers/plans/2026-06-02-novasheet-feature-package-roadmap.md`、本计划文件。

- [ ] **Step 1: architecture.md**

Feature Packages 段加：

```md
`@novasheet/feature-editing` 拥有单元格编辑交互（第二个整竖切片）：`EditingController` 同时实现
`WebCellEditor`(命令) 与 `WebFrameSync`(定位)，自持 `DomCellEditor`，通过 `web.cell-editor` 贡献点安装。
runtime 保留键盘/双击起编入口并委托 controller，`commitActiveEdit` 重指向它；编辑语义留 `@novasheet/core`。
已知债务：编辑键入口仍在 kernel（待 keyboard 契约）、自定义 editor 经 web `tryCustomEditor`（待 command 契约）。
```

- [ ] **Step 2: roadmap phase 4 打勾**

总进度表 phase 4 行 `[ ]`→`[x]`，实施计划列填 `2026-06-03-novasheet-editing-feature-package.md`；「当前执行焦点」更新为 phase 4 完成、下一焦点 phase 5 clipboard。

- [ ] **Step 3: 本计划加执行状态**

顶部加 `**Execution Status (2026-06-03):** 完成 Task 1-3。全量 gates 通过。`（执行中如有计划外修正一并记录。）

- [ ] **Step 4: 全量 gates**（同 Task 2 Step 9）。

- [ ] **Step 5: Commit**

```bash
git add docs
git commit -m "$(printf 'docs(plan): 标记 editing 能力包完成\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Self-Review

- **Spec coverage**：Task 1=WebCellEditor/web.cell-editor 契约；Task 2=feature 整竖切片 + runtime 委托 + 通用 services + backend 清理 + 默认安装 + commitActiveEdit 重指向 + 测试；Task 3=docs + gates。覆盖 spec 全部小节。
- **决策一致性**：键盘入口留 kernel（薄壳委托）；定位复用 WebFrameSync；`tryCustomEditor` 是唯一 editing 专名 deps（债务）；编辑语义 core 不动。
- **类型一致性**：`WebCellEditor`/`WebCellEditorRuntimeDeps`/`WebCellEditorContribution`/`EditingController`/`installEditingFeature`/`cellEditController`/`computeCellEditorRect`/`revealActiveCell`/`requestSyncPaint`/`tryCustomEditor` 跨 Task 命名一致。
- **原子性**：Task 2 一次提交首次绿（git mv 即破坏默认编辑路径，feature/runtime/backend/install 同提交）。
- **占位扫描**：无 TBD；`computeCellEditorRect` 返回类型、测试 frame mock 字段标注「以 typecheck/现状为准」为受控不确定点，非占位。
- **风险前置**：原子性、主题在 syncFrame 重刷、commitActiveEdit 未装时 no-op 均标 STOP。
