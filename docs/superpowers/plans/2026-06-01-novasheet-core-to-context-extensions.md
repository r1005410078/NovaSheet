# NovaSheet Core To Context Extensions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** shrink `@novasheet/core` toward a small kernel and move the assembled browser spreadsheet into `@novasheet/sheet`, with extension seams centered on `SheetContext`.

**Architecture:** `@novasheet/core` owns platform-independent state contracts and `SheetContext`; `@novasheet/web` owns browser host primitives only; `@novasheet/canvas2d` owns Canvas2D rendering; `@novasheet/sheet` wires them into the default `Grid`. Extension functions receive `ctx: SheetContext`; runtime handles are read through `ctx.cell()`, `ctx.canvas()`, `ctx.overlay()`, and `ctx.grid()`.

**Tech:** Bun workspaces, TypeScript strict mode, `bun:test`, package-level build scripts, existing `DefaultGridEngine`/`WebGridRuntime`/`Canvas2DRenderer` kept green during migration.

---

## Current Problem

Current package responsibilities are mixed:

| Current package | Current responsibility | Problem |
|---|---|---|
| `@novasheet/core` | data, layout, full engine, selection, clipboard, formatting, view layers, undo, context menus | too much product behavior |
| `@novasheet/web` | public `Grid`, `Canvas2DBackend`, DOM host, runtime, overlays | host and product assembly are coupled |
| `@novasheet/web-canvas2d` | Canvas2D renderer | name implies it belongs under web host |

Target package responsibilities:

| Target package | Responsibility |
|---|---|
| `@novasheet/core` | kernel contracts: data, layout, frame, `SheetContext`, extension registry |
| `@novasheet/web` | browser host/runtime primitives; no public product `Grid` |
| `@novasheet/canvas2d` | Canvas2D renderer only |
| `@novasheet/sheet` | default assembled product: `Grid`, default extensions, default Canvas2D backend |

---

## Target File Structure

```txt
packages/core/src/context/
  RuntimeScope.ts
  extensions.ts
  SheetContext.ts

packages/canvas2d/
  src/
  tests/
  package.json

packages/web/src/
  host/
  interaction/
  overlay/
  runtime/
  render/
  scroll/
  index.ts

packages/sheet/src/
  Grid.ts
  backends/Canvas2DBackend.ts
  grid/GridController.ts
  defaults/installDefaultExtensions.ts
  index.ts
```

---

## Migration Rules

1. No compatibility aliases unless explicitly requested.
2. Keep every task green before committing.
3. Package split first, feature extraction later.
4. `SheetContext` goes into `@novasheet/core` before `@novasheet/sheet` starts depending on it.
5. `@novasheet/core` must stay DOM-free; canvas/DOM handles are generic or `unknown` at the core boundary.

---

## Task 1: Add `SheetContext` To Core

**Files**

- Add `packages/core/src/context/RuntimeScope.ts`
- Add `packages/core/src/context/extensions.ts`
- Add `packages/core/src/context/SheetContext.ts`
- Add `packages/core/tests/context/SheetContext.test.ts`
- Edit `packages/core/src/index.ts`

- [ ] **Step 1: Add failing tests**

Create `packages/core/tests/context/SheetContext.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '../../src/context/SheetContext'
import type { CellHandle } from '../../src/context/RuntimeScope'

function makeCellHandle(value: unknown): CellHandle {
  return {
    value: () => value,
    rect: () => ({ x: 0, y: 0, width: 100, height: 28 }),
    address: () => ({ rowIndex: 0, colIndex: 0 }),
    range: () => ({ startRow: 0, endRow: 0, startCol: 0, endCol: 0 }),
    commit: () => {},
    invalidate: () => {},
  }
}

describe('SheetContext', () => {
  it('registers a cell extension by type', () => {
    const ctx = createSheetContext()
    const draw = () => {}

    ctx.extensions.cell('rating', { draw })

    expect(ctx.registry.cells.get('rating')?.draw).toBe(draw)
  })

  it('throws when runtime accessors are used outside a scope', () => {
    const ctx = createSheetContext()

    expect(() => ctx.cell()).toThrow('NovaSheet: ctx.cell() is only available during a cell scope')
  })

  it('provides runtime handles inside a scope and restores after return', () => {
    const ctx = createSheetContext()
    const value = ctx.run({ cell: makeCellHandle(3) }, () => ctx.cell().value())

    expect(value).toBe(3)
    expect(() => ctx.cell()).toThrow()
  })
})
```

Run:

```bash
bun test packages/core/tests/context/SheetContext.test.ts
```

Expected: FAIL because `createSheetContext` does not exist.

- [ ] **Step 2: Add runtime handle types**

Create `packages/core/src/context/RuntimeScope.ts`:

```ts
import type { CellAddress, CellRange } from '../interaction/SelectionModel'

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface CellHandle {
  value(): unknown
  rect(): Rect
  address(): CellAddress
  range(): CellRange
  commit(value: unknown): void
  invalidate(): void
}

export interface CanvasHandle<TCanvasContext = unknown> {
  ctx(): TCanvasContext
}

export interface OverlayHandle<TElement = unknown> {
  openPopover(options: { anchor: Rect; content: TElement }): void
  close(): void
}

export interface GridHandle {
  id(): string
  invalidate(): void
}

export interface RuntimeScope<TCanvasContext = unknown, TElement = unknown> {
  cell?: CellHandle
  canvas?: CanvasHandle<TCanvasContext>
  overlay?: OverlayHandle<TElement>
  grid?: GridHandle
}
```

- [ ] **Step 3: Add extension registry types**

Create `packages/core/src/context/extensions.ts`:

```ts
export interface CellExtension {
  draw?: () => void
  edit?: () => void
  text?: () => string
  parse?: (text: string) => unknown
}

export type CommandHandler = () => void | boolean | Promise<void | boolean>

export interface ExtensionRegistry {
  readonly cells: Map<string, CellExtension>
  readonly commands: Map<string, CommandHandler>
}

export interface ExtensionRegistrar {
  cell(type: string, extension: CellExtension): void
  command(id: string, handler: CommandHandler): void
}
```

- [ ] **Step 4: Add `SheetContext`**

Create `packages/core/src/context/SheetContext.ts`:

```ts
import type {
  CanvasHandle,
  CellHandle,
  GridHandle,
  OverlayHandle,
  RuntimeScope,
} from './RuntimeScope'
import type { CommandHandler, ExtensionRegistrar, ExtensionRegistry } from './extensions'

export interface SheetContext<TCanvasContext = unknown, TElement = unknown> {
  readonly registry: ExtensionRegistry
  readonly extensions: ExtensionRegistrar
  run<T>(scope: RuntimeScope<TCanvasContext, TElement>, fn: () => T): T
  cell(): CellHandle
  canvas(): CanvasHandle<TCanvasContext>
  overlay(): OverlayHandle<TElement>
  grid(): GridHandle
}

export function createSheetContext<TCanvasContext = unknown, TElement = unknown>(): SheetContext<
  TCanvasContext,
  TElement
> {
  const registry: ExtensionRegistry = {
    cells: new Map(),
    commands: new Map(),
  }
  const stack: Array<RuntimeScope<TCanvasContext, TElement>> = []
  const current = () => stack[stack.length - 1]

  return {
    registry,
    extensions: {
      cell(type: string, extension) {
        registry.cells.set(type, extension)
      },
      command(id: string, handler: CommandHandler) {
        registry.commands.set(id, handler)
      },
    },
    run<T>(scope: RuntimeScope<TCanvasContext, TElement>, fn: () => T): T {
      stack.push(scope)
      try {
        return fn()
      } finally {
        stack.pop()
      }
    },
    cell(): CellHandle {
      const handle = current()?.cell
      if (!handle) throw new Error('NovaSheet: ctx.cell() is only available during a cell scope')
      return handle
    },
    canvas(): CanvasHandle<TCanvasContext> {
      const handle = current()?.canvas
      if (!handle) throw new Error('NovaSheet: ctx.canvas() is only available during a canvas scope')
      return handle
    },
    overlay(): OverlayHandle<TElement> {
      const handle = current()?.overlay
      if (!handle) throw new Error('NovaSheet: ctx.overlay() is only available during an overlay scope')
      return handle
    },
    grid(): GridHandle {
      const handle = current()?.grid
      if (!handle) throw new Error('NovaSheet: ctx.grid() is only available during a grid scope')
      return handle
    },
  }
}
```

- [ ] **Step 5: Export core API**

Add to `packages/core/src/index.ts`:

```ts
export { createSheetContext } from './context/SheetContext'
export type { SheetContext } from './context/SheetContext'
export type {
  CanvasHandle,
  CellHandle,
  GridHandle,
  OverlayHandle,
  Rect,
  RuntimeScope,
} from './context/RuntimeScope'
export type {
  CellExtension,
  CommandHandler,
  ExtensionRegistrar,
  ExtensionRegistry,
} from './context/extensions'
```

- [ ] **Step 6: Verify**

Run:

```bash
bun test packages/core/tests/context/SheetContext.test.ts
bun run --filter @novasheet/core build
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/context packages/core/tests/context packages/core/src/index.ts
git commit -m "feat(core): 增加 SheetContext 内核 API"
```

---

## Task 2: Rename Canvas Package To `@novasheet/canvas2d`

**Files**

- Move `packages/web-canvas2d/` → `packages/canvas2d/`
- Edit `packages/canvas2d/package.json`
- Edit `packages/canvas2d/src/index.ts`
- Edit `packages/web/package.json`
- Edit imports from `@novasheet/web-canvas2d`

- [ ] **Step 1: Verify current references**

Run:

```bash
rg "@novasheet/web-canvas2d|web-canvas2d" packages apps docs
```

Expected: references in package metadata, build scripts, docs, and `Canvas2DBackend`.

- [ ] **Step 2: Move package**

Run:

```bash
mv packages/web-canvas2d packages/canvas2d
```

- [ ] **Step 3: Rename package metadata**

In `packages/canvas2d/package.json`, change:

```json
{
  "name": "@novasheet/canvas2d",
  "repository": {
    "directory": "packages/canvas2d"
  }
}
```

- [ ] **Step 4: Update imports**

Replace:

```ts
from '@novasheet/web-canvas2d'
```

with:

```ts
from '@novasheet/canvas2d'
```

In `packages/web/package.json`, replace the dependency with:

```json
"@novasheet/canvas2d": "^0.1.0"
```

- [ ] **Step 5: Verify**

Run:

```bash
bun install --frozen-lockfile
bun run --filter @novasheet/canvas2d build
bun run --filter @novasheet/web build
bun test packages/canvas2d/tests
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/canvas2d packages/web package.json bun.lock
git add -u packages/web-canvas2d
git commit -m "refactor(packages): 重命名 canvas2d 渲染包"
```

---

## Task 3: Add `@novasheet/sheet`

**Files**

- Add `packages/sheet/package.json`
- Add `packages/sheet/build.ts`
- Add `packages/sheet/tsconfig.json`
- Add `packages/sheet/tsconfig.build.json`
- Add `packages/sheet/src/index.ts`
- Add `packages/sheet/src/defaults/installDefaultExtensions.ts`

- [ ] **Step 1: Create package manifest**

Create `packages/sheet/package.json` by copying `packages/web/package.json` and changing:

```json
{
  "name": "@novasheet/sheet",
  "description": "Default NovaSheet browser spreadsheet assembly.",
  "repository": {
    "directory": "packages/sheet"
  },
  "dependencies": {
    "@novasheet/core": "^0.1.0",
    "@novasheet/web": "^0.1.0",
    "@novasheet/canvas2d": "^0.1.0"
  }
}
```

Keep the same devDependencies as `packages/web/package.json`.

- [ ] **Step 2: Create build files**

Copy `packages/web/build.ts` to `packages/sheet/build.ts`, then set:

```ts
const EXTERNALS = ['@novasheet/core', '@novasheet/web', '@novasheet/canvas2d'] as const
```

Copy `packages/web/tsconfig.json` to `packages/sheet/tsconfig.json`.

Copy `packages/web/tsconfig.build.json` to `packages/sheet/tsconfig.build.json`.

- [ ] **Step 3: Create default extension installer**

Create `packages/sheet/src/defaults/installDefaultExtensions.ts`:

```ts
import type { SheetContext } from '@novasheet/core'

export function installDefaultExtensions(_ctx: SheetContext): void {
  // Built-in capabilities are still in DefaultGridEngine/WebGridRuntime during the first package split.
}
```

- [ ] **Step 4: Create temporary package entry**

Create `packages/sheet/src/index.ts`:

```ts
export { installDefaultExtensions } from './defaults/installDefaultExtensions'
```

- [ ] **Step 5: Verify**

Run:

```bash
bun install --frozen-lockfile
bun run --filter @novasheet/sheet build
```

Expected: package builds.

- [ ] **Step 6: Commit**

```bash
git add packages/sheet package.json bun.lock
git commit -m "refactor(packages): 新增 sheet 装配包"
```

---

## Task 4: Move Public Grid Assembly From Web To Sheet

**Files**

- Move `packages/web/src/Grid.ts` → `packages/sheet/src/Grid.ts`
- Move `packages/web/src/grid/GridController.ts` → `packages/sheet/src/grid/GridController.ts`
- Move `packages/web/src/backends/Canvas2DBackend.ts` → `packages/sheet/src/backends/Canvas2DBackend.ts`
- Edit `packages/web/src/index.ts`
- Edit `packages/sheet/src/index.ts`
- Move facade tests from `packages/web/tests/` to `packages/sheet/tests/`

- [ ] **Step 1: Move assembly files**

Run:

```bash
mkdir -p packages/sheet/src/grid packages/sheet/src/backends
mv packages/web/src/Grid.ts packages/sheet/src/Grid.ts
mv packages/web/src/grid/GridController.ts packages/sheet/src/grid/GridController.ts
mv packages/web/src/backends/Canvas2DBackend.ts packages/sheet/src/backends/Canvas2DBackend.ts
```

- [ ] **Step 2: Export required browser primitives from web**

Edit `packages/web/src/index.ts` so it exports host/runtime primitives needed by the moved backend:

```ts
export { WebGridRuntime } from './runtime/WebGridRuntime'
export type { WebGridRuntimeOptions } from './runtime/WebGridRuntime'
export { DomGridHost } from './host/DomGridHost'
export { DomCellEditor } from './interaction/DomCellEditor'
export { DomContextMenuLayer } from './interaction/DomContextMenuLayer'
export { DomFillHandleLayer } from './interaction/DomFillHandleLayer'
export { DomHandleLayer } from './interaction/DomHandleLayer'
export { FilterPopover } from './interaction/FilterPopover'
export { HideColToggleHandle } from './handle/HideColToggleHandle'
export { HideToggleHandle } from './handle/HideToggleHandle'
export { ColumnReorderOverlay } from './overlay/ColumnReorderOverlay'
export { ColumnWidthPopover } from './overlay/ColumnWidthPopover'
export { RowHeightPopover } from './overlay/RowHeightPopover'
export { RowReorderOverlay } from './overlay/RowReorderOverlay'
export { SelectionOverlay } from './overlay/SelectionOverlay'
export { WebClipboardAdapter } from './clipboard/WebClipboardAdapter'
```

Remove public `Grid` exports from `packages/web/src/index.ts`.

- [ ] **Step 3: Update moved backend imports**

In `packages/sheet/src/backends/Canvas2DBackend.ts`, replace relative web imports with:

```ts
import { Canvas2DRenderer, Canvas2DTextMeasurer, HighDPI } from '@novasheet/canvas2d'
import {
  ColumnReorderOverlay,
  ColumnWidthPopover,
  DomCellEditor,
  DomContextMenuLayer,
  DomFillHandleLayer,
  DomGridHost,
  DomHandleLayer,
  FilterPopover,
  HideColToggleHandle,
  HideToggleHandle,
  RowHeightPopover,
  RowReorderOverlay,
  SelectionOverlay,
  WebClipboardAdapter,
  WebGridRuntime,
} from '@novasheet/web'
```

- [ ] **Step 4: Export from sheet**

Edit `packages/sheet/src/index.ts`:

```ts
export { Grid, withExcelHeaders } from './Grid'
export type { GridOptions, GridRendererBackend } from './Grid'
export type {
  AutofitRowsOptions,
  AutofitRowsResult,
  FillEvent,
  GridController,
  GridPublicEventMap,
  RedoEvent,
  UndoEvent,
} from './grid/GridController'
export { installDefaultExtensions } from './defaults/installDefaultExtensions'
```

- [ ] **Step 5: Move facade tests**

Run:

```bash
mkdir -p packages/sheet/tests
mv packages/web/tests/Grid*.test.ts packages/sheet/tests/
```

Keep runtime, host, overlay, drag, and interaction tests in `packages/web/tests`.

- [ ] **Step 6: Verify**

Run:

```bash
bun run --filter @novasheet/web build
bun run --filter @novasheet/sheet build
bun test packages/sheet/tests packages/web/tests
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add packages/sheet packages/web
git commit -m "refactor(packages): 将 Grid 装配迁入 sheet 包"
```

---

## Task 5: Add `context` And `extensions` Options To Sheet Grid

**Files**

- Edit `packages/sheet/src/Grid.ts`
- Edit `packages/sheet/src/backends/Canvas2DBackend.ts`
- Add `packages/sheet/tests/Grid.context.test.ts`

- [ ] **Step 1: Add failing tests**

Create `packages/sheet/tests/Grid.context.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { createSheetContext, InMemoryDataSource } from '@novasheet/core'
import { Grid } from '../src/Grid'

const data = new InMemoryDataSource({
  schema: { fields: [{ id: 'score', name: 'Score', type: 'rating', width: 120 }] },
  rows: [{ score: 3 }],
})

describe('Grid SheetContext options', () => {
  it('uses the provided context', () => {
    const ctx = createSheetContext()
    ctx.extensions.cell('rating', { text: () => 'rating' })

    const grid = new Grid(document.createElement('div'), { data, context: ctx })

    expect(ctx.registry.cells.has('rating')).toBe(true)
    grid.destroy()
  })

  it('installs extensions into the selected context', () => {
    const ctx = createSheetContext()

    const grid = new Grid(document.createElement('div'), {
      data,
      context: ctx,
      extensions: [(sheet) => sheet.extensions.cell('rating', { text: () => 'rating' })],
    })

    expect(ctx.registry.cells.has('rating')).toBe(true)
    grid.destroy()
  })
})
```

Run:

```bash
bun test packages/sheet/tests/Grid.context.test.ts
```

Expected: FAIL because `context` and `extensions` options are not typed or wired.

- [ ] **Step 2: Add option types**

In `packages/sheet/src/Grid.ts`:

```ts
import { createSheetContext, type SheetContext } from '@novasheet/core'

export type SheetExtensionInstall = (ctx: SheetContext) => void

export interface GridOptions extends GridEngineOptions {
  context?: SheetContext
  extensions?: readonly SheetExtensionInstall[]
  // Keep the current GridOptions event and renderer fields unchanged.
}
```

- [ ] **Step 3: Install context in constructor**

In `Grid` constructor:

```ts
const context = options.context ?? createSheetContext()
installDefaultExtensions(context)
for (const install of options.extensions ?? []) install(context)
```

Pass `context` into `Canvas2DBackend` via `gridOptions`.

- [ ] **Step 4: Store context in backend**

In `packages/sheet/src/backends/Canvas2DBackend.ts`:

```ts
private readonly sheetContext: SheetContext<CanvasRenderingContext2D, HTMLElement>
```

Accept:

```ts
context?: SheetContext<CanvasRenderingContext2D, HTMLElement>
```

Initialize:

```ts
this.sheetContext = gridOptions?.context ?? createSheetContext()
```

- [ ] **Step 5: Verify**

Run:

```bash
bun test packages/sheet/tests/Grid.context.test.ts
bun run --filter @novasheet/sheet build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/sheet
git commit -m "feat(sheet): 支持上下文与扩展安装"
```

---

## Task 6: Prove A Custom Cell Draw Extension

**Files**

- Edit `packages/canvas2d/src/render/Canvas2DRenderer.ts`
- Edit `packages/sheet/src/backends/Canvas2DBackend.ts`
- Add `packages/sheet/tests/Grid.cell-extension.test.ts`

- [ ] **Step 1: Add failing test**

Create `packages/sheet/tests/Grid.cell-extension.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { createSheetContext, InMemoryDataSource } from '@novasheet/core'
import { Grid } from '../src/Grid'

describe('cell draw extensions', () => {
  it('calls draw for a custom field type during paint', () => {
    const ctx = createSheetContext<CanvasRenderingContext2D, HTMLElement>()
    let drawCount = 0

    ctx.extensions.cell('rating', {
      draw: () => {
        drawCount++
        expect(ctx.cell().value()).toBe(3)
      },
    })

    const el = document.createElement('div')
    Object.assign(el.style, { width: '300px', height: '160px' })

    const grid = new Grid(el, {
      data: new InMemoryDataSource({
        schema: { fields: [{ id: 'score', name: 'Score', type: 'rating', width: 120 }] },
        rows: [{ score: 3 }],
      }),
      context: ctx,
    })

    grid.refresh()

    expect(drawCount).toBeGreaterThan(0)
    grid.destroy()
  })
})
```

Run:

```bash
bun test packages/sheet/tests/Grid.cell-extension.test.ts
```

Expected: FAIL because the renderer does not invoke cell extensions.

- [ ] **Step 2: Add `sheetContext` to renderer options**

In `packages/canvas2d/src/render/Canvas2DRenderer.ts`, add:

```ts
import type { SheetContext } from '@novasheet/core'

export interface Canvas2DRendererOptions {
  sheetContext?: SheetContext<CanvasRenderingContext2D, HTMLElement>
  // Keep the current renderer option fields unchanged.
}
```

Store it:

```ts
private readonly sheetContext?: SheetContext<CanvasRenderingContext2D, HTMLElement>
```

- [ ] **Step 3: Pass context from backend**

In `packages/sheet/src/backends/Canvas2DBackend.ts`, where `Canvas2DRenderer` is created, pass:

```ts
sheetContext: this.sheetContext,
```

- [ ] **Step 4: Invoke extension before default cell painter**

In the body-cell paint loop, before the default `CellPainter.paint`, add:

```ts
const extension = this.sheetContext?.registry.cells.get(field.type)
if (extension?.draw) {
  const rect = { x, y, width, height }
  this.sheetContext.run(
    {
      cell: {
        value: () => value,
        rect: () => rect,
        address: () => ({ rowIndex, colIndex }),
        range: () => ({ startRow: rowIndex, endRow: rowIndex, startCol: colIndex, endCol: colIndex }),
        commit: () => {
          throw new Error('NovaSheet: ctx.cell().commit() is not available during draw')
        },
        invalidate: () => this.invalidate(),
      },
      canvas: { ctx: () => this.ctx },
    },
    extension.draw,
  )
  return
}
```

Use the actual local variable names in `Canvas2DRenderer`; keep the scope limited to the custom draw branch.

- [ ] **Step 5: Verify**

Run:

```bash
bun test packages/sheet/tests/Grid.cell-extension.test.ts
bun test packages/canvas2d/tests/render
bun run --filter @novasheet/sheet build
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add packages/canvas2d packages/sheet
git commit -m "feat(sheet): 支持自定义 cell 绘制"
```

---

## Task 7: Prove A Custom Cell Popover Editor

**Files**

- Edit `packages/sheet/src/backends/Canvas2DBackend.ts`
- Edit `packages/web/src/runtime/WebGridRuntime.ts`
- Add `packages/sheet/tests/Grid.cell-extension-edit.test.ts`

- [ ] **Step 1: Add failing test**

Create `packages/sheet/tests/Grid.cell-extension-edit.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { createSheetContext, InMemoryDataSource, type CellAddress } from '@novasheet/core'
import { Grid } from '../src/Grid'

function canvas2dDelegate(grid: Grid) {
  return (
    grid as unknown as {
      delegate: {
        openCustomCellEditorForTest: (cell: CellAddress) => boolean
      }
    }
  ).delegate
}

describe('cell edit extensions', () => {
  it('calls custom edit and exposes overlay handle', () => {
    const ctx = createSheetContext<CanvasRenderingContext2D, HTMLElement>()
    let opened = false

    ctx.extensions.cell('rating', {
      edit: () => {
        const root = document.createElement('button')
        root.textContent = '5'
        ctx.overlay().openPopover({ anchor: ctx.cell().rect(), content: root })
        opened = true
      },
    })

    const el = document.createElement('div')
    Object.assign(el.style, { width: '300px', height: '160px' })

    const grid = new Grid(el, {
      data: new InMemoryDataSource({
        schema: { fields: [{ id: 'score', name: 'Score', type: 'rating', width: 120 }] },
        rows: [{ score: 3 }],
      }),
      context: ctx,
    })

    expect(canvas2dDelegate(grid).openCustomCellEditorForTest({ rowIndex: 0, colIndex: 0 })).toBe(true)

    expect(opened).toBe(true)
    grid.destroy()
  })
})
```

This test follows the existing `Grid.test.ts` pattern: the public `Grid` facade stays unchanged, and the test reaches `Canvas2DBackend` internals through a local helper.

- [ ] **Step 2: Add a runtime seam for custom edit**

In `packages/web/src/runtime/WebGridRuntime.ts`, add:

```ts
tryOpenCustomCellEditor(
  cell: CellAddress,
  invoke: (rect: { x: number; y: number; width: number; height: number }) => boolean,
): boolean
```

This method should compute the current cell rect from the latest frame and call `invoke(rect)` when the cell is visible.

- [ ] **Step 3: Add a small popover host in sheet**

In `packages/sheet/src/backends/Canvas2DBackend.ts`, create a simple DOM popover owned by backend:

```ts
private openExtensionPopover(anchor: Rect, content: HTMLElement): void
private closeExtensionPopover(): void
```

The implementation appends a positioned absolutely placed `<div data-novasheet-extension-popover>` to the container and removes the previous one before opening a new one.

- [ ] **Step 4: Add backend edit invoker**

In `packages/sheet/src/backends/Canvas2DBackend.ts`, add an internal method that is not exported through `GridController` or `Grid`:

```ts
openCustomCellEditorForTest(cell: CellAddress): boolean
private openCustomCellEditor(cell: CellAddress): boolean
```

- [ ] **Step 5: Invoke custom edit before default editor**

In the begin-edit path, check the field type:

```ts
const extension = this.sheetContext.registry.cells.get(field.type)
if (extension?.edit) {
  const handled = this.runtime.tryOpenCustomCellEditor(cell, (rect) => {
    this.sheetContext.run(
      {
        cell: {
          value: () => currentValue,
          rect: () => rect,
          address: () => cell,
          range: () => ({ startRow: cell.rowIndex, endRow: cell.rowIndex, startCol: cell.colIndex, endCol: cell.colIndex }),
          commit: (value) => this.engine.setCellValue(cell, value),
          invalidate: () => this.runtime.refresh(),
        },
        overlay: {
          openPopover: ({ anchor, content }) => this.openExtensionPopover(anchor, content),
          close: () => this.closeExtensionPopover(),
        },
      },
      extension.edit,
    )
    return true
  })
  if (handled) return
}
```

- [ ] **Step 6: Add single-cell commit API**

Edit `packages/core/src/engine/GridEngine.ts`:

```ts
setCellValue(cell: CellAddress, value: CellValue): boolean
```

Implement it in `packages/core/src/engine/DefaultGridEngine.ts` by resolving the target field, writing through the existing mutable data path, and returning `false` when the data source is not mutable or the address is outside the schema/row bounds. Add `packages/core/tests/engine/DefaultGridEngine.set-cell-value.test.ts` covering success, read-only source, and invalid address.

- [ ] **Step 7: Verify**

Run:

```bash
bun test packages/sheet/tests/Grid.cell-extension-edit.test.ts
bun test packages/core/tests/engine/DefaultGridEngine.set-cell-value.test.ts
bun test packages/web/tests/runtime/WebGridRuntime.test.ts
bun run --filter @novasheet/sheet build
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add packages/sheet packages/web packages/core
git commit -m "feat(sheet): 支持自定义 cell 编辑弹层"
```

---

## Task 8: Move App Imports To `@novasheet/sheet`

**Files**

- Edit `apps/storybook/**`
- Edit snippets under `apps/storybook/src/stories/snippets/**`
- Edit docs that show public `Grid` import
- Edit `apps/storybook/package.json`

- [ ] **Step 1: Replace public Grid imports**

Run:

```bash
rg "from '@novasheet/web'|import\\('@novasheet/web'\\)" apps docs
```

Replace public `Grid`, `GridOptions`, and `withExcelHeaders` imports with:

```ts
from '@novasheet/sheet'
```

Keep imports from `@novasheet/web` only when a file uses web host primitives directly.

- [ ] **Step 2: Add Storybook dependency**

In `apps/storybook/package.json`, ensure:

```json
"@novasheet/sheet": "workspace:*"
```

- [ ] **Step 3: Verify Storybook**

Run:

```bash
bun run --filter @novasheet/storybook build
```

Expected: Storybook builds.

- [ ] **Step 4: Commit**

```bash
git add apps docs package.json bun.lock
git commit -m "refactor(apps): 默认使用 sheet 入口"
```

---

## Task 9: Register Built-In Cell Types Through Default Extensions

**Files**

- Add `packages/sheet/src/defaults/installBasicCells.ts`
- Edit `packages/sheet/src/defaults/installDefaultExtensions.ts`
- Add `packages/sheet/tests/default-cells.test.ts`

- [ ] **Step 1: Add default cell installer**

Create `packages/sheet/src/defaults/installBasicCells.ts`:

```ts
import type { SheetContext } from '@novasheet/core'

export function installBasicCells(ctx: SheetContext): void {
  ctx.extensions.cell('text', {})
  ctx.extensions.cell('number', {})
  ctx.extensions.cell('boolean', {})
  ctx.extensions.cell('date', {})
  ctx.extensions.cell('singleSelect', {})
  ctx.extensions.cell('multiSelect', {})
  ctx.extensions.cell('url', {})
}
```

- [ ] **Step 2: Install it by default**

Edit `packages/sheet/src/defaults/installDefaultExtensions.ts`:

```ts
import type { SheetContext } from '@novasheet/core'
import { installBasicCells } from './installBasicCells'

export function installDefaultExtensions(ctx: SheetContext): void {
  installBasicCells(ctx)
}
```

- [ ] **Step 3: Add tests**

Create `packages/sheet/tests/default-cells.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { createSheetContext } from '@novasheet/core'
import { installDefaultExtensions } from '../src/defaults/installDefaultExtensions'

describe('default cell extensions', () => {
  it('registers built-in field types', () => {
    const ctx = createSheetContext()

    installDefaultExtensions(ctx)

    expect(ctx.registry.cells.has('text')).toBe(true)
    expect(ctx.registry.cells.has('number')).toBe(true)
    expect(ctx.registry.cells.has('url')).toBe(true)
  })
})
```

- [ ] **Step 4: Verify**

Run:

```bash
bun test packages/sheet/tests/default-cells.test.ts
bun run --filter @novasheet/sheet build
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/sheet
git commit -m "feat(sheet): 注册默认 cell 能力"
```

---

## Task 10: Document The New Boundary

**Files**

- Add `docs/package-boundaries.md`
- Edit `docs/architecture-review-2026-05-31.md`
- Edit `CLAUDE.md`

- [ ] **Step 1: Add package boundary doc**

Create `docs/package-boundaries.md`:

~~~md
# NovaSheet Package Boundaries

| Package | Role |
| --- | --- |
| `@novasheet/core` | Kernel: data, layout, frame contracts, `SheetContext` |
| `@novasheet/web` | Browser host/runtime primitives |
| `@novasheet/canvas2d` | Canvas2D renderer |
| `@novasheet/sheet` | Default assembled spreadsheet product |

Default users import:

```ts
import { Grid } from '@novasheet/sheet'
```

Advanced users can create a shared context:

```ts
const ctx = createSheetContext()
installRatingCell(ctx)
new Grid(el, { data, context: ctx })
```
~~~

- [ ] **Step 2: Update architecture review**

Append to `docs/architecture-review-2026-05-31.md`:

```md
### R9 🟠 core 过大：迁往 SheetContext + sheet composition root

已决定把默认产品装配迁入 `@novasheet/sheet`，`@novasheet/core`
收敛为小内核，功能能力逐步通过 `SheetContext` 注册。
```

- [ ] **Step 3: Verify references**

Run:

```bash
rg "@novasheet/web-canvas2d|@novasheet/web" docs apps packages
```

Expected: public `Grid` examples point to `@novasheet/sheet`; low-level web primitive references still point to `@novasheet/web`.

- [ ] **Step 4: Update agent rules**

Edit `CLAUDE.md` package-state and build-gate sections so they name:

```txt
@novasheet/core
@novasheet/web
@novasheet/canvas2d
@novasheet/sheet
```

The build gate becomes:

```bash
bun run --filter @novasheet/sheet build
bun run --filter @novasheet/web build
bun run --filter @novasheet/canvas2d build
bun run --filter @novasheet/core build
```

- [ ] **Step 5: Commit**

```bash
git add docs CLAUDE.md
git commit -m "docs(architecture): 记录 sheet 分层边界"
```

---

## Final Verification

Run:

```bash
bun run lint
bun run --filter '*' typecheck
bun test
bun run --filter @novasheet/sheet build
bun run --filter @novasheet/web build
bun run --filter @novasheet/canvas2d build
bun run --filter @novasheet/core build
```

---

## Known Follow-Ups

These are intentionally not in this plan:

| Follow-up | Reason |
|---|---|
| Move selection into an extension | Needs a working context seam first |
| Move clipboard into an extension | Needs command dispatch through context |
| Move fill handle into an extension | Touches drag routing and overlay sync |
| Split `DefaultGridEngine` | Higher risk; do after package boundary stabilizes |

---

## Self-Review

- Coverage: package naming, package boundaries, `SheetContext`, public `Grid` move, custom cell draw, custom cell edit, app imports, docs.
- Scope: does not attempt a full engine split.
- Type boundary: core handle types are generic/DOM-free.
- No compatibility aliases: old `@novasheet/web-canvas2d` and public `@novasheet/web` Grid are removed by the migration.
