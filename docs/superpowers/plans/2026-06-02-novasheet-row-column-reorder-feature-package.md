# Row Column Reorder Feature Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the existing row/column header reorder drag behavior into a default-installed feature package without changing user-visible behavior.

**Architecture:** `@novasheet/core` stays DOM-free and only owns a generic contribution registry on `SheetContext`. `@novasheet/web` owns typed web drag contribution contracts and runtime dispatch. `@novasheet/feature-row-column-reorder` owns the existing `RowHeaderDrag` and `ColumnHeaderDrag` implementations, installed by `@novasheet/sheet` through `installDefaultExtensions`.

**Tech Stack:** Bun workspaces, TypeScript strict mode with `verbatimModuleSyntax`, `bun:test`, existing `WebGridRuntime` drag state machine, existing `SheetContext`.

---

## Scope

This plan only extracts the already-shipped row/column header reorder feature. It does not redesign drag behavior, selection semantics, overlays, undo, resize, fill handle, editing, clipboard, or context menus.

The intended implementation style is move-first:

- Use `git mv` for existing drag files and runtime tests where ownership changes.
- Add thin adapter/registry code only where needed.
- Keep default `@novasheet/sheet` behavior identical.
- Do not keep compatibility aliases unless a test proves an internal import still needs a temporary path.

## Target File Structure

```txt
packages/core/src/context/extensions.ts
packages/core/src/context/SheetContext.ts
packages/core/tests/context/SheetContext.test.ts

packages/web/src/interaction/drag/Drag.ts
packages/web/src/interaction/drag/WebDragContribution.ts
packages/web/src/runtime/WebGridRuntime.ts
packages/web/src/index.ts
packages/web/tests/interaction/drag/WebDragContribution.test.ts
packages/web/tests/runtime/WebGridRuntime.drag-contributions.test.ts

packages/feature-row-column-reorder/
  package.json
  build.ts
  tsconfig.json
  tsconfig.build.json
  src/index.ts
  src/installRowColumnReorder.ts
  src/ColumnHeaderDrag.ts
  src/RowHeaderDrag.ts
  tests/ColumnHeaderDrag.test.ts
  tests/RowHeaderDrag.test.ts
  tests/setup.ts

packages/sheet/package.json
packages/sheet/build.ts
packages/sheet/src/defaults/installDefaultExtensions.ts
packages/sheet/tests/Grid.col-reorder.test.ts
```

## Task 1: Add Generic Contribution Points To `SheetContext`

**Files:**

- Modify: `packages/core/src/context/extensions.ts`
- Modify: `packages/core/src/context/SheetContext.ts`
- Modify: `packages/core/tests/context/SheetContext.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Add the failing contribution registry test**

Append this test to `packages/core/tests/context/SheetContext.test.ts`:

```ts
it('registers and reads generic extension contributions by point id', () => {
  const ctx = createSheetContext()
  const contribution = { id: 'feature-a' }

  ctx.extensions.contribute('web.drag', contribution)

  expect(ctx.registry.contributions.get('web.drag')).toEqual([contribution])
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
bun test packages/core/tests/context/SheetContext.test.ts
```

Expected: FAIL with a TypeScript/runtime error indicating `contribute` or `contributions` does not exist.

- [ ] **Step 3: Add generic contribution types**

Update `packages/core/src/context/extensions.ts` so the registry and registrar include a DOM-free contribution point:

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

Keep the existing `CellExtension` and `CommandHandler` definitions unchanged.

- [ ] **Step 4: Store contributions in `createSheetContext`**

Update the registry object and registrar in `packages/core/src/context/SheetContext.ts`:

```ts
const registry: ExtensionRegistry = {
  cells: new Map(),
  commands: new Map(),
  contributions: new Map(),
}
```

Add this method beside `cell()` and `command()`:

```ts
contribute(point: string, contribution) {
  const existing = registry.contributions.get(point) ?? []
  registry.contributions.set(point, [...existing, contribution])
},
```

- [ ] **Step 5: Export contribution types**

Update `packages/core/src/index.ts` to export the new type:

```ts
export type { ExtensionContribution } from './context/extensions'
```

If `index.ts` already has a grouped export for `context/extensions`, add `ExtensionContribution` to that group instead of creating a duplicate export block.

- [ ] **Step 6: Verify core**

Run:

```bash
bun test packages/core/tests/context/SheetContext.test.ts
bun run --filter @novasheet/core typecheck
bun run --filter @novasheet/core build
bun run lint
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/context/extensions.ts packages/core/src/context/SheetContext.ts packages/core/tests/context/SheetContext.test.ts packages/core/src/index.ts
git commit -m "feat(core): 增加通用扩展贡献点"
```

## Task 2: Add Web Drag Contribution Contract

**Files:**

- Create: `packages/web/src/interaction/drag/WebDragContribution.ts`
- Modify: `packages/web/src/index.ts`
- Add: `packages/web/tests/interaction/drag/WebDragContribution.test.ts`

- [ ] **Step 1: Add the failing web contribution helper test**

Create `packages/web/tests/interaction/drag/WebDragContribution.test.ts`:

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

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
bun test packages/web/tests/interaction/drag/WebDragContribution.test.ts
```

Expected: FAIL because `WEB_DRAG_CONTRIBUTION`, `registerWebDrag`, and `getWebDragContributions` are not exported.

- [ ] **Step 3: Add the web drag contribution contract**

Create `packages/web/src/interaction/drag/WebDragContribution.ts`:

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
  return typeof candidate.id === 'string' && typeof candidate.order === 'number' && typeof candidate.create === 'function'
}
```

- [ ] **Step 4: Export web drag types and helpers**

Update `packages/web/src/index.ts`:

```ts
export type { AutoScrollAxis, Drag } from './interaction/drag/Drag'
export {
  WEB_DRAG_CONTRIBUTION,
  getWebDragContributions,
  registerWebDrag,
} from './interaction/drag/WebDragContribution'
export type { WebDragContribution, WebDragRuntimeDeps } from './interaction/drag/WebDragContribution'
```

- [ ] **Step 5: Verify web helper**

Run:

```bash
bun test packages/web/tests/interaction/drag/WebDragContribution.test.ts
bun run --filter @novasheet/web typecheck
bun run --filter @novasheet/web build
bun run lint
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/interaction/drag/WebDragContribution.ts packages/web/src/index.ts packages/web/tests/interaction/drag/WebDragContribution.test.ts
git commit -m "feat(web): 增加拖拽贡献点契约"
```

## Task 3: Create `@novasheet/feature-row-column-reorder`

**Files:**

- Create directory: `packages/feature-row-column-reorder/`
- Move: `packages/web/src/interaction/drag/ColumnHeaderDrag.ts` to `packages/feature-row-column-reorder/src/ColumnHeaderDrag.ts`
- Move: `packages/web/src/interaction/drag/RowHeaderDrag.ts` to `packages/feature-row-column-reorder/src/RowHeaderDrag.ts`
- Create: `packages/feature-row-column-reorder/src/installRowColumnReorder.ts`
- Create: `packages/feature-row-column-reorder/src/index.ts`
- Create package config/build files copied from the `packages/web` pattern

- [ ] **Step 1: Add package files**

Create `packages/feature-row-column-reorder/package.json`:

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

Copy `packages/web/build.ts`, `packages/web/tsconfig.json`, and `packages/web/tsconfig.build.json` into the new package, then update the build script `EXTERNALS`:

```ts
const EXTERNALS = ['@novasheet/core', '@novasheet/web'] as const
```

- [ ] **Step 2: Move existing drag implementations**

Run:

```bash
git mv packages/web/src/interaction/drag/ColumnHeaderDrag.ts packages/feature-row-column-reorder/src/ColumnHeaderDrag.ts
git mv packages/web/src/interaction/drag/RowHeaderDrag.ts packages/feature-row-column-reorder/src/RowHeaderDrag.ts
```

- [ ] **Step 3: Update imports in moved files**

In both moved files, replace relative web imports with public web package imports:

```ts
import type {
  AutoScrollAxis,
  Drag,
  WebDragRuntimeDeps,
  WebHost,
  WebPointerEvent,
} from '@novasheet/web'
```

Keep `CellRange` and `GridEngine` imports from `@novasheet/core`.

In `ColumnHeaderDrag.ts`, define:

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

In `RowHeaderDrag.ts`, define:

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

- [ ] **Step 4: Add installer**

Create `packages/feature-row-column-reorder/src/installRowColumnReorder.ts`:

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

Create `packages/feature-row-column-reorder/src/index.ts`:

```ts
export { installRowColumnReorder } from './installRowColumnReorder'
export { ColumnHeaderDrag } from './ColumnHeaderDrag'
export type { ColumnHeaderDragDeps } from './ColumnHeaderDrag'
export { RowHeaderDrag } from './RowHeaderDrag'
export type { RowHeaderDragDeps } from './RowHeaderDrag'
```

- [ ] **Step 5: Add installer test**

Create `packages/feature-row-column-reorder/tests/installRowColumnReorder.test.ts`:

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

- [ ] **Step 6: Verify feature package**

Run:

```bash
bun test packages/feature-row-column-reorder/tests/installRowColumnReorder.test.ts
bun run --filter @novasheet/feature-row-column-reorder typecheck
bun run --filter @novasheet/feature-row-column-reorder build
bun run lint
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/feature-row-column-reorder packages/web/src/interaction/drag/ColumnHeaderDrag.ts packages/web/src/interaction/drag/RowHeaderDrag.ts
git commit -m "feat(row-column-reorder): 新增行列拖拽排序能力包"
```

## Task 4: Make `WebGridRuntime` Consume Drag Contributions

**Files:**

- Modify: `packages/web/src/runtime/WebGridRuntime.ts`
- Modify tests: `packages/web/tests/runtime/WebGridRuntime.col-reorder.test.ts`
- Modify tests: `packages/web/tests/runtime/WebGridRuntime.row-reorder.test.ts`

- [ ] **Step 1: Update runtime reorder tests to install the feature**

In both reorder runtime tests, import context and installer:

```ts
import { createSheetContext } from '@novasheet/core'
import { installRowColumnReorder } from '@novasheet/feature-row-column-reorder'
```

Add this helper:

```ts
function makeContext() {
  const ctx = createSheetContext()
  installRowColumnReorder(ctx)
  return ctx
}
```

Pass `context: makeContext()` into every `new WebGridRuntime({ ... })` call in those two test files.

- [ ] **Step 2: Run tests to verify they fail before runtime consumption**

Run:

```bash
bun test packages/web/tests/runtime/WebGridRuntime.col-reorder.test.ts packages/web/tests/runtime/WebGridRuntime.row-reorder.test.ts
```

Expected: FAIL after Task 3 because `WebGridRuntime` still imports moved drag files or does not consume registered drags.

- [ ] **Step 3: Add context to runtime options**

In `packages/web/src/runtime/WebGridRuntime.ts`, import:

```ts
import { createSheetContext, type SheetContext } from '@novasheet/core'
import { getWebDragContributions, type WebDragRuntimeDeps } from '../interaction/drag/WebDragContribution'
```

Add to `WebGridRuntimeOptions`:

```ts
/** Extension context used to read web runtime feature contributions. */
context?: SheetContext
```

Add a private field:

```ts
private readonly context: SheetContext
```

In the constructor:

```ts
this.context = opts.context ?? createSheetContext()
```

- [ ] **Step 4: Remove hard-coded row/column drag construction**

Remove imports for `ColumnHeaderDrag` and `RowHeaderDrag` from `WebGridRuntime.ts`.

Remove these private fields:

```ts
private columnHeaderDrag!: ColumnHeaderDrag
private rowHeaderDrag!: RowHeaderDrag
```

Remove the direct `new ColumnHeaderDrag(...)` and `new RowHeaderDrag(...)` constructor blocks.

Add:

```ts
const contributedDrags = getWebDragContributions(this.context)
  .map((contribution) => contribution.create(this.createWebDragRuntimeDeps()))
  .filter((drag): drag is Drag => drag !== null)

this.drags = [...contributedDrags, this.selectionDrag]
```

- [ ] **Step 5: Add runtime dependency factory**

Add this private method to `WebGridRuntime`:

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

- [ ] **Step 6: Verify runtime behavior**

Run:

```bash
bun test packages/web/tests/runtime/WebGridRuntime.col-reorder.test.ts packages/web/tests/runtime/WebGridRuntime.row-reorder.test.ts
bun run --filter @novasheet/web typecheck
bun run --filter @novasheet/web build
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/web/src/runtime/WebGridRuntime.ts packages/web/tests/runtime/WebGridRuntime.col-reorder.test.ts packages/web/tests/runtime/WebGridRuntime.row-reorder.test.ts
git commit -m "refactor(web): 通过扩展贡献装配行列拖拽"
```

## Task 5: Install Row/Column Reorder In Default Sheet Assembly

**Files:**

- Modify: `packages/sheet/package.json`
- Modify: `packages/sheet/build.ts`
- Modify: `packages/sheet/src/backends/Canvas2DBackend.ts`
- Modify: `packages/sheet/src/defaults/installDefaultExtensions.ts`
- Modify: `packages/sheet/tests/Grid.col-reorder.test.ts`

- [ ] **Step 1: Add feature package dependency**

Update `packages/sheet/package.json` dependencies:

```json
"@novasheet/feature-row-column-reorder": "^0.1.0"
```

Update `packages/sheet/build.ts`:

```ts
const EXTERNALS = [
  '@novasheet/core',
  '@novasheet/web',
  '@novasheet/canvas2d',
  '@novasheet/feature-row-column-reorder',
] as const
```

- [ ] **Step 2: Pass context to `WebGridRuntime`**

In `packages/sheet/src/backends/Canvas2DBackend.ts`, add the existing sheet context to the runtime options:

```ts
context: this.sheetContext,
```

Place it beside `engine`, `host`, and `renderer` in the `new WebGridRuntime({ ... })` call.

- [ ] **Step 3: Install the feature by default**

Update `packages/sheet/src/defaults/installDefaultExtensions.ts`:

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

- [ ] **Step 4: Keep existing sheet behavior tests green**

Run:

```bash
bun test packages/sheet/tests/Grid.col-reorder.test.ts
bun run --filter @novasheet/sheet typecheck
bun run --filter @novasheet/sheet build
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/sheet/package.json packages/sheet/build.ts packages/sheet/src/backends/Canvas2DBackend.ts packages/sheet/src/defaults/installDefaultExtensions.ts packages/sheet/tests/Grid.col-reorder.test.ts
git commit -m "feat(sheet): 默认安装行列拖拽排序能力"
```

## Task 6: Move Ownership Tests To The Feature Package

**Files:**

- Move: `packages/web/tests/runtime/WebGridRuntime.col-reorder.test.ts` to `packages/feature-row-column-reorder/tests/WebGridRuntime.col-reorder.test.ts`
- Move: `packages/web/tests/runtime/WebGridRuntime.row-reorder.test.ts` to `packages/feature-row-column-reorder/tests/WebGridRuntime.row-reorder.test.ts`
- Modify imports in moved tests

- [ ] **Step 1: Move tests with `git mv`**

Run:

```bash
git mv packages/web/tests/runtime/WebGridRuntime.col-reorder.test.ts packages/feature-row-column-reorder/tests/WebGridRuntime.col-reorder.test.ts
git mv packages/web/tests/runtime/WebGridRuntime.row-reorder.test.ts packages/feature-row-column-reorder/tests/WebGridRuntime.row-reorder.test.ts
```

- [ ] **Step 2: Update moved test imports**

In moved tests, replace relative web imports:

```ts
import type { ColumnReorderOverlay, WebHost, WebRenderer } from '@novasheet/web'
import { WebGridRuntime } from '@novasheet/web'
```

For row tests:

```ts
import type { RowReorderOverlay, WebHost, WebRenderer } from '@novasheet/web'
import { WebGridRuntime } from '@novasheet/web'
```

Keep:

```ts
import { installRowColumnReorder } from '../src'
```

- [ ] **Step 3: Export overlay types from web if needed**

If typecheck reports that overlay classes are not exported as types, update `packages/web/src/index.ts`:

```ts
export type { ColumnReorderOverlay } from './overlay/ColumnReorderOverlay'
export type { RowReorderOverlay } from './overlay/RowReorderOverlay'
```

Do not remove the existing value exports for those classes.

- [ ] **Step 4: Verify feature-owned tests**

Run:

```bash
bun test packages/feature-row-column-reorder/tests
bun test packages/web/tests/runtime
bun run --filter @novasheet/feature-row-column-reorder typecheck
bun run --filter @novasheet/web typecheck
```

Expected: all commands exit 0. The web runtime tests should no longer own row/column reorder behavior directly.

- [ ] **Step 5: Commit**

```bash
git add packages/feature-row-column-reorder/tests packages/web/tests/runtime packages/web/src/index.ts
git commit -m "test(row-column-reorder): 迁移拖拽排序运行时测试"
```

## Task 7: Full Verification And Architecture Documentation

**Files:**

- Modify: `docs/architecture.md`
- Modify: `docs/superpowers/plans/2026-06-01-novasheet-core-to-context-extensions.md`

- [ ] **Step 1: Document the new feature package boundary**

Add a short section to `docs/architecture.md`:

```md
### Feature Packages

Feature packages own user-visible spreadsheet capabilities that can be installed on a `SheetContext`.
`@novasheet/feature-row-column-reorder` owns row and column header reorder drags. The package reuses
web drag contracts from `@novasheet/web` and calls engine APIs through runtime-provided dependencies.
`@novasheet/sheet` installs this package by default so the assembled Grid keeps the existing behavior.
```

- [ ] **Step 2: Update the active migration plan status**

In `docs/superpowers/plans/2026-06-01-novasheet-core-to-context-extensions.md`, add a note near the current status section:

```md
### Follow-up: Feature package extraction

Row/column header reorder is the first user-visible capability moved from `@novasheet/web` fixed runtime construction into a default-installed feature package: `@novasheet/feature-row-column-reorder`.
```

- [ ] **Step 3: Run full gates**

Run:

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

Expected: all commands exit 0.

- [ ] **Step 4: Commit docs**

```bash
git add docs/architecture.md docs/superpowers/plans/2026-06-01-novasheet-core-to-context-extensions.md
git commit -m "docs(architecture): 记录功能包拆分边界"
```

## Self-Review

- Spec coverage: The plan covers contribution registry, web drag contract, feature package creation, runtime consumption, default sheet installation, test ownership, docs, and full verification.
- Placeholder scan: No placeholder markers or unspecified "write tests" steps remain.
- Type consistency: `SheetContext` stores generic contributions; `@novasheet/web` owns typed `WebDragContribution`; the feature package depends on `@novasheet/web`; `@novasheet/sheet` depends on the feature package. `@novasheet/core` does not import DOM or web types.
- Scope check: This plan extracts only row/column reorder. Resize, fill handle, editing, clipboard, context menu, and undo remain separate future feature plans.
