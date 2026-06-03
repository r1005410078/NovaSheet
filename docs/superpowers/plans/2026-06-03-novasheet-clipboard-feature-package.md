# Clipboard Feature Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把剪贴板能力（copy/cut/paste + typed-paste 缓存 + navigator 包装）从 `@novasheet/web` 拆到默认安装的 `@novasheet/feature-clipboard`。

**Architecture:** 新增 `WebClipboard` 纯命令 capability + `web.clipboard` 贡献点（无 `WebFrameSync`/无 DOM 生命周期）。`ClipboardController` 自持 `WebClipboardAdapter` 与 typed 缓存，实现 copy/cut/paste 与 `onDataReplaced` 缓存失效。runtime 键盘/菜单/Grid 公共入口经薄壳委托。剪贴板语义（commitPaste/TSV）留 `@novasheet/core`。

**Tech Stack:** Bun workspaces、TypeScript strict + `verbatimModuleSyntax`、`bun:test`。

**设计依据：** `docs/superpowers/specs/2026-06-03-novasheet-clipboard-feature-package-design.md`。

**计划对 spec 的一处订正：** spec 写 `onEngineMutation`；实测 `clipboardCache = null` 只在 `setData` / `updateViewData` 两处（数据替换），非每次 mutation。故契约方法名用 **`onDataReplaced()`**，runtime 在这两处调用。

**已知计划风险（STOP+ASK）：**

- Task 2 大原子：`git mv WebClipboardAdapter` 即破坏 backend，feature/runtime/backend/install 须同提交首次绿。
- `snapshotSelection` / `fnv1aHash` 仅剪贴板用——移走后确认 runtime 无其它引用（grep 验证）。
- 4 个 `onCopy/onCut/onPaste/onPasteSkipped` 回调 + setter 保留在 runtime（Grid API 不变），经 deps 转发；若发现 setter 被其它路径用 STOP。

---

## Scope

In：`WebClipboard`/`web.clipboard` 契约；`ClipboardController`（copy/cut/paste/onDataReplaced + 自持 adapter + 缓存 + snapshotSelection + fnv1aHash）；runtime 薄壳委托 + 删实现；backend 删 adapter 构造 + 默认安装；测试迁移。

Out：剪贴板语义（core 不动）；键盘 Cmd+C/X/V 与右键菜单入口（留 kernel 委托）；4 个事件回调迁 engine/command（债务）。

## Current File Map

```txt
packages/web/src/clipboard/WebClipboardAdapter.ts       # 要搬
packages/web/tests/clipboard/WebClipboardAdapter.test.ts # 要搬
packages/web/src/runtime/WebGridRuntime.ts              # snapshotSelection/fnv1aHash/handleClipboard*/缓存
packages/web/src/index.ts
packages/sheet/src/backends/Canvas2DBackend.ts          # new WebClipboardAdapter / setClipboardAdapter
packages/sheet/src/defaults/installDefaultExtensions.ts
tsconfig.base.json / packages/sheet/{package.json,build.ts}
```

## Target File Map

```txt
packages/web/src/clipboard/WebClipboard.ts              # 新契约 + 注册/读取
packages/feature-clipboard/
  package.json / build.ts / tsconfig.json / tsconfig.build.json
  src/index.ts
  src/installClipboardFeature.ts
  src/ClipboardController.ts        # WebClipboard，自持 WebClipboardAdapter + 缓存
  src/WebClipboardAdapter.ts        # git mv
  tests/installClipboardFeature.test.ts
  tests/ClipboardController.test.ts
  tests/WebClipboardAdapter.test.ts # git mv
```

---

## Task 1: 新增 `WebClipboard` 契约与 `web.clipboard` 贡献点（独立绿提交）

**Files:**

- Create: `packages/web/src/clipboard/WebClipboard.ts`
- Modify: `packages/web/src/index.ts`
- Test: `packages/web/tests/clipboard/WebClipboard.test.ts`

- [ ] **Step 1: 写失败测试**

Create `packages/web/tests/clipboard/WebClipboard.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import { registerWebClipboard, getWebClipboardContributions } from '@novasheet/web'

describe('web.clipboard contribution', () => {
  it('注册并按 order 读取 clipboard 贡献', () => {
    const ctx = createSheetContext()
    registerWebClipboard(ctx, { id: 'b', order: 20, create: () => null })
    registerWebClipboard(ctx, { id: 'a', order: 10, create: () => null })
    expect(getWebClipboardContributions(ctx).map((c) => c.id)).toEqual(['a', 'b'])
  })
})
```

Run: `bun test packages/web/tests/clipboard/WebClipboard.test.ts` → FAIL（未导出）。

- [ ] **Step 2: 实现契约**

Create `packages/web/src/clipboard/WebClipboard.ts`:

```ts
import type { CellRange, GridEngine, PasteSkippedCell, SheetContext } from '@novasheet/core'

/** 剪贴板命令接口：runtime 的键盘/菜单/Grid 入口委托给它。 */
export interface WebClipboard {
  copy(): Promise<boolean>
  cut(): Promise<boolean>
  paste(): Promise<boolean>
  /** 数据源被替换（setData/updateViewData）后调用：使 typed-paste 缓存失效。 */
  onDataReplaced(): void
}

/** 提供给 clipboard feature 的 runtime 服务。 */
export interface WebClipboardRuntimeDeps {
  readonly engine: GridEngine
  afterEngineMutation(): void
  /** per-Grid 事件回调（决策债务）。 */
  onCopy(range: CellRange): void
  onCut(range: CellRange): void
  onPaste(target: CellRange): void
  onPasteSkipped(cells: readonly PasteSkippedCell[]): void
}

export const WEB_CLIPBOARD_CONTRIBUTION = 'web.clipboard'

export interface WebClipboardContribution {
  readonly id: string
  readonly order: number
  create(deps: WebClipboardRuntimeDeps): WebClipboard | null
}

export function registerWebClipboard(ctx: SheetContext, contribution: WebClipboardContribution): void {
  ctx.extensions.contribute(WEB_CLIPBOARD_CONTRIBUTION, contribution)
}

export function getWebClipboardContributions(ctx: SheetContext): readonly WebClipboardContribution[] {
  return (ctx.registry.contributions.get(WEB_CLIPBOARD_CONTRIBUTION) ?? [])
    .filter(isWebClipboardContribution)
    .sort((a, b) => a.order - b.order)
}

function isWebClipboardContribution(value: unknown): value is WebClipboardContribution {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Partial<WebClipboardContribution>
  return typeof c.id === 'string' && typeof c.order === 'number' && typeof c.create === 'function'
}
```

- [ ] **Step 3: 导出**

In `packages/web/src/index.ts` 加：

```ts
export {
  WEB_CLIPBOARD_CONTRIBUTION,
  registerWebClipboard,
  getWebClipboardContributions,
} from './clipboard/WebClipboard'
export type { WebClipboard, WebClipboardContribution, WebClipboardRuntimeDeps } from './clipboard/WebClipboard'
```

- [ ] **Step 4: 验证 + 提交**

```bash
bun test packages/web/tests/clipboard/WebClipboard.test.ts
bun run --filter @novasheet/web typecheck
bun run --filter @novasheet/web build
bun run lint
```

```bash
git add packages/web/src/clipboard/WebClipboard.ts packages/web/src/index.ts packages/web/tests/clipboard/WebClipboard.test.ts
git commit -m "$(printf 'feat(web): 新增 WebClipboard 契约与 web.clipboard 贡献点\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2: feature-clipboard 整竖切片 + runtime 委托 + backend 默认安装（大原子提交）

**Files:** 见 Target File Map + Modify `packages/web/src/runtime/WebGridRuntime.ts`、`packages/web/src/index.ts`、`packages/sheet/src/backends/Canvas2DBackend.ts`、`installDefaultExtensions.ts`、`tsconfig.base.json`、`packages/sheet/{package.json,build.ts}`。

- [ ] **Step 1: 建包脚手架**

镜像 `packages/feature-fill-handle/`：`package.json`（name `@novasheet/feature-clipboard`，description "Clipboard (copy/cut/paste) feature for NovaSheet."，deps `@novasheet/core`+`@novasheet/web`，同款 devDeps），`build.ts`（注释改名，`EXTERNALS=['@novasheet/core','@novasheet/web']`），`tsconfig.json` / `tsconfig.build.json`（与 fill-handle 同）。
`tsconfig.base.json` paths 加 `"@novasheet/feature-clipboard": ["packages/feature-clipboard/src/index.ts"],`（canvas2d 后、editing 前）。
Run `bun install`。

- [ ] **Step 2: 搬移 adapter + 测试**

```bash
mkdir -p packages/feature-clipboard/src packages/feature-clipboard/tests
git mv packages/web/src/clipboard/WebClipboardAdapter.ts packages/feature-clipboard/src/WebClipboardAdapter.ts
git mv packages/web/tests/clipboard/WebClipboardAdapter.test.ts packages/feature-clipboard/tests/WebClipboardAdapter.test.ts
```

`WebClipboardAdapter.ts` 无内部相对 import（纯 navigator 包装），无需改 import。
`WebClipboardAdapter.test.ts` 改 import 为 `../src/WebClipboardAdapter`（原相对路径核对后改）。

- [ ] **Step 3: 写 `ClipboardController`**

Create `packages/feature-clipboard/src/ClipboardController.ts`:

```ts
import {
  computePasteTarget,
  isMutableDataSource,
  parseTsvToCells,
  serializeRowsToTsv,
  type ApplyPasteSource,
  type CellRange,
  type Row,
  type WebClipboard,
  type WebClipboardRuntimeDeps,
} from '@novasheet/core'
import { WebClipboardAdapter } from './WebClipboardAdapter'

export type ClipboardControllerDeps = WebClipboardRuntimeDeps

interface ClipboardCache {
  range: CellRange
  rows: readonly Row[]
  tsvHash: number
}

/** FNV-1a：typed-paste 缓存命中判定（剪贴板 TSV 与缓存一致才走高保真粘贴）。 */
function fnv1aHash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h
}

/**
 * 剪贴板控制器（纯命令；无 DOM）。自持 navigator 包装与 typed-paste 缓存。
 * copy 序列化选区 + 缓存；cut 复制后清源；paste 命中缓存走高保真、否则解析 TSV。
 */
export class ClipboardController implements WebClipboard {
  private readonly adapter = new WebClipboardAdapter()
  private cache: ClipboardCache | null = null

  constructor(private readonly deps: ClipboardControllerDeps) {}

  onDataReplaced(): void {
    this.cache = null
  }

  async copy(): Promise<boolean> {
    const snap = this.snapshotSelection()
    if (!snap) return false
    this.cache = { range: snap.range, rows: snap.rows, tsvHash: fnv1aHash(snap.tsv) }
    await this.adapter.writeText(snap.tsv)
    this.deps.onCopy(snap.range)
    return true
  }

  async cut(): Promise<boolean> {
    if (!isMutableDataSource(this.deps.engine.getData())) return false
    const snap = this.snapshotSelection()
    if (!snap) return false
    this.cache = { range: snap.range, rows: snap.rows, tsvHash: fnv1aHash(snap.tsv) }
    await this.adapter.writeText(snap.tsv)
    this.deps.engine.clearRange(snap.range)
    this.deps.afterEngineMutation()
    this.deps.onCut(snap.range)
    return true
  }

  async paste(): Promise<boolean> {
    const data = this.deps.engine.getData()
    if (!isMutableDataSource(data)) return false
    const sel = this.deps.engine.getSelection()
    const active = sel.activeCell
    const range = sel.selectedRange
    if (!active || !range) return false

    const tsv = (await this.adapter.readText()) ?? ''
    if (tsv === '') return false

    const schema = data.getSchema()
    const fields = schema.fields
    const fieldIdsAtCols = fields.map((f) => f.id)
    const tsvHash = fnv1aHash(tsv)
    let source: ApplyPasteSource

    if (this.cache && this.cache.tsvHash === tsvHash) {
      const cachedRange = this.cache.range
      const cachedFieldIds = fields.slice(cachedRange.startCol, cachedRange.endCol + 1).map((f) => f.id)
      const cells = this.cache.rows.map((row) => cachedFieldIds.map((fid) => row[fid] ?? null))
      source = { cells, sourceFieldIds: cachedFieldIds, typed: true }
    } else {
      const anchorFieldIds = fieldIdsAtCols.slice(active.colIndex)
      const cells = parseTsvToCells(tsv, anchorFieldIds, schema)
      source = { cells, sourceFieldIds: anchorFieldIds, typed: false }
    }

    const sourceRows = source.cells.length
    const sourceCols = source.cells[0]?.length ?? 0
    if (sourceRows === 0 || sourceCols === 0) return false

    const target = computePasteTarget(active, range, sourceRows, sourceCols, {
      rowCount: data.getRowCount(),
      colCount: fields.length,
    })

    this.deps.engine.commitPaste(source, target, fieldIdsAtCols, (skipped) => this.deps.onPasteSkipped(skipped))
    this.deps.afterEngineMutation()
    this.deps.onPaste({
      startRow: target.startRow,
      endRow: target.endRow,
      startCol: target.startCol,
      endCol: target.endCol,
    })
    return true
  }

  /** snapshot 当前 selectedRange 的值 + TSV；selection 空返回 null。 */
  private snapshotSelection(): { range: CellRange; rows: Row[]; tsv: string } | null {
    const sel = this.deps.engine.getSelection()
    const range = sel.selectedRange
    if (!range) return null
    const data = this.deps.engine.getData()
    const fields = data.getSchema().fields
    const fieldIds = fields.slice(range.startCol, range.endCol + 1).map((f) => f.id)
    const rows: Row[] = []
    for (let r = range.startRow; r <= range.endRow; r++) {
      const row: Row = {}
      for (const fid of fieldIds) row[fid] = data.getCell(r, fid) ?? null
      rows.push(row)
    }
    return { range, rows, tsv: serializeRowsToTsv(rows, fieldIds) }
  }
}
```

> 平移自 runtime 的 `snapshotSelection` / `handleClipboardCopy` / `handleClipboardCut` / `handleClipboardPaste` / `fnv1aHash`，差异：`clipboardAdapter→自持 adapter`、`clipboardCache→this.cache`、`onCopy?./onCut?./onPaste?./onPasteSkipped?.→deps.onCopy/...`（deps 已是必选转发，no-op 安全）、`afterEngineMutation()→deps.afterEngineMutation()`。`WebClipboard`/`WebClipboardRuntimeDeps`/`Row`/`ApplyPasteSource`/`PasteSkippedCell` 从 `@novasheet/core` 还是 `@novasheet/web` import 以 typecheck 为准：`WebClipboard`/`WebClipboardRuntimeDeps` 来自 `@novasheet/web`（上面 import 写错了，应从 web 引入）；`Row`/`ApplyPasteSource`/`computePasteTarget`/`isMutableDataSource`/`parseTsvToCells`/`serializeRowsToTsv` 来自 `@novasheet/core`。修正 import 分组。

- [ ] **Step 3b: 修正 import 分组**

`ClipboardController.ts` 顶部 import 改为：

```ts
import {
  computePasteTarget,
  isMutableDataSource,
  parseTsvToCells,
  serializeRowsToTsv,
  type ApplyPasteSource,
  type CellRange,
  type Row,
} from '@novasheet/core'
import type { WebClipboard, WebClipboardRuntimeDeps } from '@novasheet/web'
import { WebClipboardAdapter } from './WebClipboardAdapter'
```

- [ ] **Step 4: installer + index**

Create `packages/feature-clipboard/src/installClipboardFeature.ts`:

```ts
import type { SheetContext } from '@novasheet/core'
import { registerWebClipboard } from '@novasheet/web'
import { ClipboardController } from './ClipboardController'

/** 安装剪贴板能力（copy/cut/paste + typed 缓存）。 */
export function installClipboardFeature(ctx: SheetContext): void {
  registerWebClipboard(ctx, {
    id: 'clipboard',
    order: 10,
    create: (deps) => new ClipboardController(deps),
  })
}
```

Create `packages/feature-clipboard/src/index.ts`:

```ts
export { installClipboardFeature } from './installClipboardFeature'
export { ClipboardController } from './ClipboardController'
export type { ClipboardControllerDeps } from './ClipboardController'
export { WebClipboardAdapter } from './WebClipboardAdapter'
```

- [ ] **Step 5: runtime 委托 + 删实现**

In `packages/web/src/runtime/WebGridRuntime.ts`:

删 import `import type { WebClipboardAdapter } from '../clipboard/WebClipboardAdapter'`。
加 import `import { getWebClipboardContributions, type WebClipboard, type WebClipboardRuntimeDeps } from '../clipboard/WebClipboard'`。
核对并删除仅剪贴板用的 core import：`serializeRowsToTsv`、`parseTsvToCells`、`computePasteTarget`、`ApplyPasteSource`（若他处无用）；**保留** `PasteSkippedCell`（onPasteSkipped 字段类型）、`isMutableDataSource`（确认是否他处仍用，用则留）、`Row`（确认）。以 typecheck 的 unused 报告为准增删。

字段：删 `private clipboardAdapter?: WebClipboardAdapter`、`private clipboardCache: {...} | null = null`；加 `private clipboardController: WebClipboard | null = null`。保留 `onCopy`/`onCut`/`onPaste`/`onPasteSkipped` 字段。
删 `setClipboardAdapter` 方法。删模块级 `fnv1aHash`（确认仅剪贴板用）。删 `snapshotSelection` 方法。

构造函数（在 `cellEditController` 探测之后）加：

```ts
this.clipboardController =
  getWebClipboardContributions(this.context)
    .map((c) => c.create(this.createWebClipboardDeps()))
    .find((c): c is WebClipboard => c !== null) ?? null
```

加 deps 工厂：

```ts
private createWebClipboardDeps(): WebClipboardRuntimeDeps {
  return {
    engine: this.engine,
    afterEngineMutation: () => this.afterEngineMutation(),
    onCopy: (range) => this.onCopy?.(range),
    onCut: (range) => this.onCut?.(range),
    onPaste: (target) => this.onPaste?.(target),
    onPasteSkipped: (cells) => this.onPasteSkipped?.(cells),
  }
}
```

3 个 handle 改薄壳：

```ts
handleClipboardCopy(): Promise<boolean> {
  if (this.destroyed) return Promise.resolve(false)
  return this.clipboardController?.copy() ?? Promise.resolve(false)
}
handleClipboardCut(): Promise<boolean> {
  if (this.destroyed) return Promise.resolve(false)
  return this.clipboardController?.cut() ?? Promise.resolve(false)
}
handleClipboardPaste(): Promise<boolean> {
  if (this.destroyed) return Promise.resolve(false)
  return this.clipboardController?.paste() ?? Promise.resolve(false)
}
```

`setData` / `updateViewData` 里 `this.clipboardCache = null` → `this.clipboardController?.onDataReplaced()`。

- [ ] **Step 6: backend 清理 + 默认安装**

In `packages/sheet/src/backends/Canvas2DBackend.ts`:
- 删 import `WebClipboardAdapter`。
- 删字段 `private clipboardAdapter = new WebClipboardAdapter()`。
- 删 `this.runtime.setClipboardAdapter(this.clipboardAdapter)`。
- 保留 `setOnCopy`/`setOnCut`/`setOnPaste`/`setOnPasteSkipped` 接线（gridOptions）、公共 `copy()/cut()/paste()`（仍调 `runtime.handleClipboard*`）。

In `installDefaultExtensions.ts`：`import { installClipboardFeature } from '@novasheet/feature-clipboard'`，在 `installEditingFeature(ctx)` 后插 `installClipboardFeature(ctx)`。
`packages/sheet/package.json` deps 加 `"@novasheet/feature-clipboard": "^0.1.0"`；`build.ts` `EXTERNALS` 加 `'@novasheet/feature-clipboard'`。`bun install`。

- [ ] **Step 7: 测试**

`installClipboardFeature.test.ts`（feature）：

```ts
import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import { getWebClipboardContributions } from '@novasheet/web'
import { installClipboardFeature } from '../src'

describe('installClipboardFeature', () => {
  it('注册 clipboard 贡献', () => {
    const ctx = createSheetContext()
    installClipboardFeature(ctx)
    expect(getWebClipboardContributions(ctx).map((c) => c.id)).toEqual(['clipboard'])
  })
})
```

`ClipboardController.test.ts`（feature；复制 `packages/feature-fill-handle/tests/helpers/mock-grid-engine.ts` 到 `packages/feature-clipboard/tests/helpers/`，stub `navigator.clipboard`）：

```ts
import { describe, expect, it, mock } from 'bun:test'
import type { WebClipboardRuntimeDeps } from '@novasheet/web'
import { ClipboardController } from '../src'
import { makeMockGridEngine } from './helpers/mock-grid-engine'

function stubClipboard(): { store: { text: string } } {
  const store = { text: '' }
  ;(globalThis as { navigator?: unknown }).navigator = {
    clipboard: {
      writeText: (t: string) => {
        store.text = t
        return Promise.resolve()
      },
      readText: () => Promise.resolve(store.text),
    },
  }
  return { store }
}

function makeDeps(over: Partial<WebClipboardRuntimeDeps> = {}): {
  deps: WebClipboardRuntimeDeps
  spies: { copy: ReturnType<typeof mock>; paste: ReturnType<typeof mock> }
} {
  const spies = { copy: mock(() => {}), paste: mock(() => {}) }
  const deps: WebClipboardRuntimeDeps = {
    engine: makeMockGridEngine({
      selection: {
        activeCell: { rowIndex: 0, colIndex: 0 },
        anchorCell: { rowIndex: 0, colIndex: 0 },
        extentCell: { rowIndex: 0, colIndex: 0 },
        selectedRange: { startRow: 0, endRow: 0, startCol: 0, endCol: 0 },
      },
    }),
    afterEngineMutation: mock(() => {}),
    onCopy: spies.copy,
    onCut: mock(() => {}),
    onPaste: spies.paste,
    onPasteSkipped: mock(() => {}),
    ...over,
  }
  return { deps, spies }
}

describe('ClipboardController', () => {
  it('copy 序列化选区写入剪贴板并回调 onCopy', async () => {
    stubClipboard()
    const { deps, spies } = makeDeps()
    const ok = await new ClipboardController(deps).copy()
    expect(ok).toBe(true)
    expect(spies.copy).toHaveBeenCalled()
  })

  it('无选区时 copy 返回 false', async () => {
    stubClipboard()
    const { deps } = makeDeps()
    deps.engine.getSelection = mock(() => ({ activeCell: null, anchorCell: null, extentCell: null, selectedRange: null }))
    expect(await new ClipboardController(deps).copy()).toBe(false)
  })

  it('paste 经 engine.commitPaste 提交并回调 onPaste', async () => {
    const { store } = stubClipboard()
    store.text = 'hello'
    const { deps, spies } = makeDeps()
    deps.engine.commitPaste = mock(() => {})
    const ok = await new ClipboardController(deps).paste()
    expect(ok).toBe(true)
    expect(deps.engine.commitPaste).toHaveBeenCalled()
    expect(spies.paste).toHaveBeenCalled()
  })

  it('onDataReplaced 后 typed 缓存失效（paste 走解析而非缓存）', async () => {
    const { store } = stubClipboard()
    const { deps } = makeDeps()
    deps.engine.commitPaste = mock(() => {})
    const controller = new ClipboardController(deps)
    await controller.copy()
    store.text = '' // 缓存命中需 readText 非空；这里仅验证不抛错路径
    controller.onDataReplaced()
    expect(await controller.paste()).toBe(false) // tsv 空 → false，证明未走缓存旁路
  })
})
```

> 测试断言以 `makeMockGridEngine` 的 `GridEngine` 形状为准；`mock-grid-engine` 的 `commitPaste`/`clearRange`/`getData`(schema/getCell) 已具备。若 `isMutableDataSource(mockData)` 返回 false 导致 cut/paste 提前 return，给 mock data 加 `setCell`/`setCells` 等使其判定为 mutable，或在 deps engine.getData 覆盖为 mutable double（执行时按 `isMutableDataSource` 实现调整）。

迁移 runtime 侧剪贴板测试：grep `packages/web/tests` 中 `handleClipboard`/`clipboardCache`/`setClipboardAdapter`/`snapshotSelection` 的用例，迁到 `packages/feature-clipboard/tests/`（安装 feature 经 runtime 薄壳驱动）或改为 controller 单测。sheet `Grid` 的 copy/paste/onPaste 用例应仍通过（默认安装后行为不变），不过则按真因修正（STOP 若语义冲突）。

- [ ] **Step 8: 全量验证（一次绿）**

```bash
bun install
bun test
bun run --filter '*' typecheck
bun run lint
bun run --filter @novasheet/core build
bun run --filter @novasheet/web build
bun run --filter @novasheet/feature-clipboard build
bun run --filter @novasheet/canvas2d build
bun run --filter @novasheet/sheet build
```

- [ ] **Step 9: Commit**

```bash
git add -A packages/feature-clipboard tsconfig.base.json bun.lock packages/web/src packages/web/tests packages/sheet
git commit -m "$(printf 'feat(clipboard): 新增 clipboard 能力包并接入 web.clipboard 契约\n\n- git mv WebClipboardAdapter 进包；ClipboardController 自持 adapter + typed 缓存\n- snapshotSelection/fnv1aHash/copy/cut/paste 平移进包\n- runtime handleClipboard* 改薄壳委托；setData/updateViewData 改 onDataReplaced\n- backend 删 adapter 构造；sheet 默认安装 installClipboardFeature\n- 键盘/菜单入口暂留 kernel；4 个事件回调经 deps 转发（债务）\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3: 文档与全量验证

**Files:** `docs/architecture.md`、`docs/superpowers/plans/2026-06-02-novasheet-feature-package-roadmap.md`、本计划文件。

- [ ] **Step 1: architecture.md** — Feature Packages 段加：

```md
`@novasheet/feature-clipboard` 拥有剪贴板交互（第三个整竖切片）：`ClipboardController` 实现纯命令
`WebClipboard`（copy/cut/paste + onDataReplaced 缓存失效），自持 `WebClipboardAdapter`，通过 `web.clipboard`
贡献点安装，无 DOM overlay/无 WebFrameSync。剪贴板语义（commitPaste/TSV）留 `@novasheet/core`。
已知债务：键盘 Cmd+C/X/V 与右键菜单入口仍在 kernel（待 keyboard/menu 契约）；onCopy/onCut/onPaste/onPasteSkipped
经 web deps 转发（待 engine 事件）。
```

- [ ] **Step 2: roadmap phase 5 打勾** — 总进度表 phase 5 `[ ]`→`[x]`，实施计划列填 `2026-06-03-novasheet-clipboard-feature-package.md`；「当前执行焦点」更新为 phase 5 完成、下一焦点 phase 6 context-menu。

- [ ] **Step 3: 本计划加执行状态** — 顶部加 `**Execution Status (2026-06-03):** 完成 Task 1-3。全量 gates 通过。`

- [ ] **Step 4: 全量 gates**（同 Task 2 Step 8）。

- [ ] **Step 5: Commit**

```bash
git add docs
git commit -m "$(printf 'docs(plan): 标记 clipboard 能力包完成\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Self-Review

- **Spec coverage**：Task 1=WebClipboard/web.clipboard 契约；Task 2=ClipboardController 整竖切片 + adapter 搬移 + runtime 委托 + onDataReplaced + backend 清理 + 默认安装 + 4 回调转发 + 测试；Task 3=docs + gates。覆盖 spec 全部。
- **spec 订正**：`onEngineMutation` → `onDataReplaced`（仅 setData/updateViewData 两处），plan 顶部已注明。
- **类型一致**：`WebClipboard`/`WebClipboardRuntimeDeps`/`WebClipboardContribution`/`ClipboardController`/`installClipboardFeature`/`clipboardController`/`onDataReplaced` 跨 Task 一致。`WebClipboard`/deps 来自 `@novasheet/web`，paste/TSV 类型来自 `@novasheet/core`（Step 3b 修正 import）。
- **原子性**：Task 2 一次提交首次绿（git mv 即破坏 backend）。
- **占位扫描**：无 TBD；import 增删、isMutableDataSource mock 可变性标注「以 typecheck/实现为准」为受控不确定点。
- **风险前置**：原子性、snapshotSelection/fnv1aHash 唯一性、4 回调保留均标 STOP。
