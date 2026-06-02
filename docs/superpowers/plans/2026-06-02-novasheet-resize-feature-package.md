# Resize Feature Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the existing row/column resize drag state machine into `@novasheet/feature-resize` while preserving default `@novasheet/sheet` behavior.

**Architecture:** `@novasheet/web` keeps DOM handle infrastructure and runtime dispatch contracts. `@novasheet/feature-resize` owns `ResizeDrag` and registers it through `SheetContext` as a web drag contribution. `@novasheet/sheet` installs the feature by default.

**Tech Stack:** Bun workspaces, TypeScript strict mode, `verbatimModuleSyntax`, `bun:test`, existing `WebDragContribution`, existing `ResizeDrag`.

---

## Scope

In scope:

- Move `packages/web/src/interaction/drag/ResizeDrag.ts` to `packages/feature-resize/src/ResizeDrag.ts`.
- Add `installResizeFeature(ctx)`.
- Let `WebGridRuntime` consume resize drag through contributions.
- Keep `DomHandleLayer`, `resize-handle-style`, resize popovers, menu actions, and keyboard resize in `@novasheet/web`.
- Migrate resize drag tests to feature package ownership.

Out of scope:

- Moving `DomHandleLayer`.
- Moving `RowHeightPopover` / `ColumnWidthPopover`.
- Moving menu resize actions.
- Moving keyboard resize.
- Rewriting resize semantics.

## Current File Map

```txt
packages/web/src/interaction/drag/ResizeDrag.ts
packages/web/src/interaction/drag/WebDragContribution.ts
packages/web/src/runtime/WebGridRuntime.ts
packages/web/tests/interaction/drag/ResizeDrag.test.ts
packages/web/tests/runtime/WebGridRuntime.test.ts
packages/sheet/src/defaults/installDefaultExtensions.ts
packages/sheet/package.json
packages/sheet/build.ts
docs/superpowers/specs/2026-06-02-novasheet-resize-feature-package-design.md
docs/superpowers/plans/2026-06-02-novasheet-feature-package-roadmap.md
```

## Target File Map

```txt
packages/feature-resize/
  package.json
  build.ts
  tsconfig.json
  tsconfig.build.json
  src/index.ts
  src/installResizeFeature.ts
  src/ResizeDrag.ts
  tests/installResizeFeature.test.ts
  tests/ResizeDrag.test.ts
  tests/WebGridRuntime.resize.test.ts
```

---

## Task 1: Extend Web Drag Runtime Deps For Resize

**Files:**

- Modify: `packages/web/src/interaction/drag/WebDragContribution.ts`
- Modify: `packages/web/src/runtime/WebGridRuntime.ts`
- Modify: `packages/web/src/index.ts`
- Test: `packages/web/tests/interaction/drag/WebDragContribution.test.ts`

- [ ] **Step 1: Add failing test for `handleLayer` in runtime deps**

Append to `packages/web/tests/interaction/drag/WebDragContribution.test.ts`:

```ts
it('accepts runtime deps with a handle layer for resize features', () => {
  const ctx = createSheetContext()
  const contribution: WebDragContribution = {
    id: 'probe-resize',
    order: 5,
    create: (deps) => {
      expect(deps.handleLayer).toBeDefined()
      return null
    },
  }

  registerWebDrag(ctx, contribution)

  const [registered] = getWebDragContributions(ctx)
  expect(registered?.id).toBe('probe-resize')
})
```

Run:

```bash
bun test packages/web/tests/interaction/drag/WebDragContribution.test.ts
```

Expected: FAIL with TypeScript/typecheck later because `WebDragRuntimeDeps` has no `handleLayer`.

- [ ] **Step 2: Add handle layer to web drag deps**

Update `packages/web/src/interaction/drag/WebDragContribution.ts`:

```ts
import type { DomHandleLayer } from '../DomHandleLayer'

export interface WebDragRuntimeDeps {
  readonly engine: GridEngine
  readonly host: WebHost
  readonly handleLayer?: DomHandleLayer
  readonly columnReorderOverlay?: ColumnReorderOverlay
  readonly rowReorderOverlay?: RowReorderOverlay
  // existing methods unchanged
}
```

Update `packages/web/src/runtime/WebGridRuntime.ts` in `createWebDragRuntimeDeps()`:

```ts
return {
  engine: this.engine,
  host: this.host,
  handleLayer: this.handleLayer,
  columnReorderOverlay: this.columnReorderOverlay,
  rowReorderOverlay: this.rowReorderOverlay,
  // existing deps unchanged
}
```

No new export is required because `DomHandleLayer` is already exported from `packages/web/src/index.ts`.

- [ ] **Step 3: Verify web contract**

Run:

```bash
bun test packages/web/tests/interaction/drag/WebDragContribution.test.ts
bun run --filter @novasheet/web typecheck
bun run --filter @novasheet/web build
bun run lint
```

Expected: all exit 0.

- [ ] **Step 4: Commit**

```bash
git add packages/web/src/interaction/drag/WebDragContribution.ts packages/web/src/runtime/WebGridRuntime.ts packages/web/tests/interaction/drag/WebDragContribution.test.ts
git commit -m "feat(web): 扩展拖拽贡献点 resize 依赖"
```

---

## Task 2: Create `@novasheet/feature-resize` Package Files

**Files:**

- Create: `packages/feature-resize/package.json`
- Create: `packages/feature-resize/build.ts`
- Create: `packages/feature-resize/tsconfig.json`
- Create: `packages/feature-resize/tsconfig.build.json`
- Create: `packages/feature-resize/src/index.ts`
- Create: `packages/feature-resize/src/installResizeFeature.ts`
- Move: `packages/web/src/interaction/drag/ResizeDrag.ts` -> `packages/feature-resize/src/ResizeDrag.ts`
- Modify: `tsconfig.base.json`
- Test: `packages/feature-resize/tests/installResizeFeature.test.ts`

- [ ] **Step 1: Add package files**

Create `packages/feature-resize/package.json`:

```json
{
  "name": "@novasheet/feature-resize",
  "version": "0.1.0",
  "description": "Row and column resize feature for NovaSheet.",
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

Create `packages/feature-resize/build.ts` using the same script shape as `packages/feature-row-column-reorder/build.ts`, with:

```ts
const EXTERNALS = ['@novasheet/core', '@novasheet/web'] as const
```

Create `packages/feature-resize/tsconfig.json`:

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

Create `packages/feature-resize/tsconfig.build.json`:

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

- [ ] **Step 2: Add workspace path**

Update `tsconfig.base.json` paths:

```json
"@novasheet/feature-resize": [
  "packages/feature-resize/src/index.ts"
]
```

Run:

```bash
bun install
```

Expected: lockfile updates with the new workspace package.

- [ ] **Step 3: Move old implementation**

Run:

```bash
git mv packages/web/src/interaction/drag/ResizeDrag.ts packages/feature-resize/src/ResizeDrag.ts
```

Update imports in moved `packages/feature-resize/src/ResizeDrag.ts`:

```ts
import { MIN_RESIZE_SIZE, type GridEngine, type ResizeHandleRect } from '@novasheet/core'
import type { AutoScrollAxis, DomHandleLayer, Drag, WebPointerEvent } from '@novasheet/web'
```

Keep existing `ResizeDragDeps`, `ResizeDrag`, and behavior unchanged.

- [ ] **Step 4: Add installer and exports**

Create `packages/feature-resize/src/installResizeFeature.ts`:

```ts
import type { SheetContext } from '@novasheet/core'
import { registerWebDrag } from '@novasheet/web'
import { ResizeDrag } from './ResizeDrag'

/** Install row and column resize drag into a SheetContext. */
export function installResizeFeature(ctx: SheetContext): void {
  registerWebDrag(ctx, {
    id: 'resize',
    order: 10,
    create: (deps) =>
      new ResizeDrag({
        engine: deps.engine,
        handleLayer: deps.handleLayer,
        afterEngineMutation: deps.afterEngineMutation,
      }),
  })
}
```

Create `packages/feature-resize/src/index.ts`:

```ts
export { installResizeFeature } from './installResizeFeature'
export { ResizeDrag } from './ResizeDrag'
export type { ResizeDragDeps } from './ResizeDrag'
```

- [ ] **Step 5: Add installer test**

Create `packages/feature-resize/tests/installResizeFeature.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import { getWebDragContributions } from '@novasheet/web'
import { installResizeFeature } from '../src'

describe('installResizeFeature', () => {
  it('registers the resize drag contribution', () => {
    const ctx = createSheetContext()

    installResizeFeature(ctx)

    expect(getWebDragContributions(ctx).map((contribution) => contribution.id)).toEqual(['resize'])
  })
})
```

- [ ] **Step 6: Continue immediately to runtime wiring**

Do not verify or commit yet. After `git mv`, `@novasheet/web` still imports the old
`ResizeDrag` path, so package creation and runtime contribution wiring are one atomic change.
Task 3 performs the first green verification and commit for this package move.

---

## Task 3: Wire Runtime To Resize Contribution

**Files:**

- Modify: `packages/web/src/runtime/WebGridRuntime.ts`
- Test: `packages/web/tests/runtime/WebGridRuntime.test.ts`
- Test: `packages/feature-resize/tests/WebGridRuntime.resize.test.ts`

- [ ] **Step 1: Add no-feature runtime test**

In `packages/web/tests/runtime/WebGridRuntime.test.ts`, add a test near the resize describe block:

```ts
it('resize pointer methods no-op when resize feature is not installed', () => {
  const engine = makeEngine()
  const runtime = new WebGridRuntime({
    engine,
    host: makeHost(),
    renderer: makeRenderer(),
    handleLayer: {
      showIndicator: mock(() => {}),
      hideIndicator: mock(() => {}),
      sync: mock(() => {}),
    } as never,
  })

  runtime.handleResizePointerDown(columnHandle, 1, 100, 0)
  runtime.handleResizePointerMove(1, 130, 0)
  runtime.handleResizePointerUp(1)

  expect(engine.commitColumnResize).not.toHaveBeenCalled()
})
```

Run:

```bash
bun test packages/web/tests/runtime/WebGridRuntime.test.ts
```

Expected: FAIL while runtime still directly constructs old `ResizeDrag`, or compile fails because the old import path no longer exists.

- [ ] **Step 2: Add resize contribution shape in runtime**

In `packages/web/src/runtime/WebGridRuntime.ts`:

Remove:

```ts
import { ResizeDrag } from '../interaction/drag/ResizeDrag'
```

Add near imports:

```ts
import type { ResizeHandleRect } from '@novasheet/core'
```

Add local interface:

```ts
interface WebResizeDrag extends Drag {
  start(handle: ResizeHandleRect, pointerId: number, clientX: number, clientY: number): boolean
  movePointer(pointerId: number, clientX: number, clientY: number): boolean
  commitPointer(pointerId: number): boolean
}
```

Change field:

```ts
private resizeDrag: WebResizeDrag | null = null
```

Remove direct constructor block:

```ts
this.resizeDrag = new ResizeDrag({
  engine: this.engine,
  handleLayer: this.handleLayer,
  afterEngineMutation: () => this.afterEngineMutation(),
})
```

After `contributedDrags` creation, assign:

```ts
this.resizeDrag = contributedDrags.find(isWebResizeDrag) ?? null
this.drags = [
  ...contributedDrags.filter((drag) => drag !== this.resizeDrag),
  this.selectionDrag,
]
```

Add helper:

```ts
function isWebResizeDrag(drag: Drag): drag is WebResizeDrag {
  const candidate = drag as Partial<WebResizeDrag>
  return (
    typeof candidate.start === 'function' &&
    typeof candidate.movePointer === 'function' &&
    typeof candidate.commitPointer === 'function'
  )
}
```

Update uses:

```ts
private isDragBlocked(): boolean {
  return this.resizeDrag?.active === true || !!this.activeDrag
}
```

```ts
if (this.resizeDrag?.start(handle, pointerId, clientX, clientY)) {
  this.activeDrag = this.resizeDrag
}
```

```ts
this.resizeDrag?.movePointer(pointerId, clientX, clientY)
```

```ts
if (!this.resizeDrag?.commitPointer(pointerId)) return
this.activeDrag = null
```

For all other `this.resizeDrag.active` checks, use:

```ts
this.resizeDrag?.active === true
```

- [ ] **Step 3: Move resize behavior tests to feature package**

Create `packages/feature-resize/tests/WebGridRuntime.resize.test.ts` with the two pointer resize tests from `packages/web/tests/runtime/WebGridRuntime.test.ts`, but add:

```ts
import { createSheetContext } from '@novasheet/core'
import { WebGridRuntime } from '@novasheet/web'
import { installResizeFeature } from '../src'

function makeContext() {
  const ctx = createSheetContext()
  installResizeFeature(ctx)
  return ctx
}
```

Each `new WebGridRuntime(...)` in this feature test must include:

```ts
context: makeContext(),
```

Keep the `attach 时 resize handle 主题使用 viewport rowHeaderWidth` test in `packages/web/tests/runtime/WebGridRuntime.test.ts`, because it tests `DomHandleLayer` sync/theme, not `ResizeDrag`.

Remove the two pointer resize behavior tests from `packages/web/tests/runtime/WebGridRuntime.test.ts`:

- `拖拽中只更新预览，松手才 commitColumnResize`
- `无位移松手不提交`

Move the direct unit test in the same atomic change:

```bash
git mv packages/web/tests/interaction/drag/ResizeDrag.test.ts packages/feature-resize/tests/ResizeDrag.test.ts
```

Update `packages/feature-resize/tests/ResizeDrag.test.ts` imports:

```ts
import { ResizeDrag } from '../src'
import type { DomHandleLayer } from '@novasheet/web'
import type { ResizeHandleRect } from '@novasheet/core'
import { makeMockGridEngine } from './helpers/mock-grid-engine'
```

Create `packages/feature-resize/tests/helpers/mock-grid-engine.ts` with the minimal engine double needed by `ResizeDrag.test.ts`:

```ts
import { mock } from 'bun:test'
import type { GridEngine } from '@novasheet/core'

export function makeMockGridEngine(options: { colWidth?: number; rowHeight?: number } = {}): GridEngine {
  const colWidth = options.colWidth ?? 100
  const rowHeight = options.rowHeight ?? 28
  return {
    getColumnIndex: mock((fieldId: string) => (fieldId === 'field-0' ? 0 : -1)),
    getColsAxis: mock(() => ({ getSize: () => colWidth }) as never),
    getRowsAxis: mock(() => ({ getCount: () => 10, getSize: () => rowHeight }) as never),
    commitColumnResize: mock(() => {}),
    commitRowResize: mock(() => {}),
  } as unknown as GridEngine
}
```

- [ ] **Step 4: Verify runtime wiring**

Run:

```bash
bun test packages/feature-resize/tests
bun test packages/web/tests/interaction/drag
bun test packages/web/tests/runtime/WebGridRuntime.test.ts
bun run --filter @novasheet/feature-resize typecheck
bun run --filter @novasheet/web typecheck
bun run --filter @novasheet/web build
bun run --filter @novasheet/feature-resize build
bun run lint
```

Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add bun.lock tsconfig.base.json packages/feature-resize packages/web/src/runtime/WebGridRuntime.ts packages/web/src/interaction/drag/ResizeDrag.ts packages/web/tests/runtime/WebGridRuntime.test.ts packages/web/tests/interaction/drag
git commit -m "feat(resize): 新增 resize 能力包并接入 runtime"
```

---

## Task 4: Default Install In `@novasheet/sheet`

**Files:**

- Modify: `packages/sheet/package.json`
- Modify: `packages/sheet/build.ts`
- Modify: `packages/sheet/src/defaults/installDefaultExtensions.ts`
- Test: `packages/sheet/tests/Grid.test.ts` or `packages/sheet/tests/Grid.context.test.ts`

- [ ] **Step 1: Add failing sheet default install test**

Add to `packages/sheet/tests/Grid.context.test.ts`:

```ts
import { getWebDragContributions } from '@novasheet/web'

it('installs resize drag in the default context', () => {
  const ctx = createSheetContext<CanvasRenderingContext2D, HTMLElement>()
  const grid = new Grid(document.createElement('div'), { data, context: ctx })

  expect(getWebDragContributions(ctx).map((contribution) => contribution.id)).toContain('resize')

  grid.destroy()
})
```

Run:

```bash
bun test packages/sheet/tests/Grid.context.test.ts
```

Expected: FAIL because `installDefaultExtensions` does not install resize feature yet.

- [ ] **Step 2: Add sheet dependency and external**

Update `packages/sheet/package.json` dependencies:

```json
"@novasheet/feature-resize": "^0.1.0"
```

Update `packages/sheet/build.ts`:

```ts
const EXTERNALS = [
  '@novasheet/core',
  '@novasheet/web',
  '@novasheet/canvas2d',
  '@novasheet/feature-row-column-reorder',
  '@novasheet/feature-resize',
] as const
```

Run:

```bash
bun install
```

- [ ] **Step 3: Install resize feature by default**

Update `packages/sheet/src/defaults/installDefaultExtensions.ts`:

```ts
import { installResizeFeature } from '@novasheet/feature-resize'

export function installDefaultExtensions(ctx: SheetContext): void {
  installBasicCells(ctx)
  installResizeFeature(ctx)
  installRowColumnReorder(ctx)
}
```

Keep row/column reorder installed after resize so contribution order remains deterministic through `order`.

- [ ] **Step 4: Verify sheet behavior**

Run:

```bash
bun test packages/sheet/tests/Grid.context.test.ts
bun run --filter @novasheet/sheet typecheck
bun run --filter @novasheet/web build
bun run --filter @novasheet/feature-resize build
bun run --filter @novasheet/sheet build
bun run lint
```

Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add bun.lock packages/sheet/package.json packages/sheet/build.ts packages/sheet/src/defaults/installDefaultExtensions.ts packages/sheet/tests/Grid.context.test.ts
git commit -m "feat(sheet): 默认安装 resize 能力"
```

---

## Task 5: Confirm ResizeDrag Test Ownership

**Files:**

- Verify: `packages/feature-resize/tests/ResizeDrag.test.ts`
- Verify: `packages/web/tests/interaction/drag`

- [ ] **Step 1: Confirm old direct test is gone**

Run:

```bash
rg -n "ResizeDrag" packages/web/tests/interaction/drag packages/web/src/interaction/drag
```

Expected: no output.

- [ ] **Step 2: Verify ownership**

Run:

```bash
bun test packages/feature-resize/tests
bun test packages/web/tests/interaction/drag
bun run --filter @novasheet/feature-resize typecheck
bun run --filter @novasheet/web typecheck
bun run lint
```

Expected: all exit 0.

- [ ] **Step 3: Continue to final docs**

No commit is expected in this task. The ownership move is committed in Task 3 because it must be
atomic with moving `ResizeDrag.ts`.

---

## Task 6: Final Verification And Docs

**Files:**

- Modify: `docs/architecture.md`
- Modify: `docs/superpowers/plans/2026-06-02-novasheet-feature-package-roadmap.md`
- Modify: `docs/superpowers/plans/2026-06-02-novasheet-resize-feature-package.md`

- [ ] **Step 1: Update architecture docs**

In `docs/architecture.md` Feature Packages section, add:

```md
`@novasheet/feature-resize` owns row/column resize drag state. It consumes `DomHandleLayer`
through the web drag runtime deps, while the DOM handle layer and resize handle styling remain in
`@novasheet/web`.
```

- [ ] **Step 2: Mark roadmap stage 2 complete**

Update `docs/superpowers/plans/2026-06-02-novasheet-feature-package-roadmap.md`:

```md
| [x] | 2 | 行高列宽 resize | `@novasheet/feature-resize` | `2026-06-02-novasheet-resize-feature-package.md` | `ResizeDrag` 从 runtime 固定创建改为 feature 安装 |
```

Update current focus text so it says phases 0-2 are complete and next focus is `fill-handle`.

- [ ] **Step 3: Record plan execution status**

At the top of `docs/superpowers/plans/2026-06-02-novasheet-resize-feature-package.md`, add:

```md
**Execution Status (2026-06-02):** Completed Task 1-6. Full gates passed: `bun run lint`, `bun run --filter '*' typecheck`, `bun test`, and package builds for `@novasheet/core` / `@novasheet/web` / `@novasheet/feature-resize` / `@novasheet/canvas2d` / `@novasheet/sheet`.
```

- [ ] **Step 4: Run full gates**

Run:

```bash
bun run lint
bun run --filter '*' typecheck
bun test
bun run --filter @novasheet/core build
bun run --filter @novasheet/web build
bun run --filter @novasheet/feature-resize build
bun run --filter @novasheet/canvas2d build
bun run --filter @novasheet/sheet build
```

Expected: all exit 0.

- [ ] **Step 5: Commit docs**

```bash
git add docs/architecture.md docs/superpowers/plans/2026-06-02-novasheet-feature-package-roadmap.md docs/superpowers/plans/2026-06-02-novasheet-resize-feature-package.md
git commit -m "docs(plan): 标记 resize 能力包完成"
```

---

## Self-Review

- Spec coverage: covers `ResizeDrag` package extraction, runtime contribution wiring, default sheet install, test ownership, docs, and full gates.
- Scope check: does not move `DomHandleLayer`, resize popovers, menu actions, or keyboard resize.
- Type consistency: `installResizeFeature`, `ResizeDrag`, `ResizeDragDeps`, `WebDragRuntimeDeps.handleLayer`, and `WebResizeDrag` names are consistent across tasks.
- Atomicity: Task 2 deliberately skips verification/commit after `git mv`; Task 3 wires runtime and commits the first green state for the package move.
