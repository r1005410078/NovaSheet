# NovaSheet Cross-Platform Rendering Architecture

- **Date**: 2026-05-17
- **Status**: Proposed
- **Scope**: One-shot refactor from Web Canvas-specific core toward cross-platform architecture
- **Initial implementation target**: Web Canvas2D only
- **Future implementation targets**: WebGL, WebGPU, Flutter, Swift/iOS, Android

---

## 1. Problem

NovaSheet currently works, but the main architectural boundary is wrong for the long-term product goal.

`packages/core` is not a pure engine today. It directly creates and owns:

- DOM container children: `scrollHost`, `scrollSpacer`, `canvas`
- browser APIs: `HTMLElement`, `ResizeObserver`, `requestAnimationFrame`, scroll events
- Canvas2D APIs: `CanvasRenderingContext2D`, `HTMLCanvasElement`
- concrete implementations: `ChunkedAxis`, `FrozenRegions`, `Viewport`, `Renderer`, `NativeScroller`, `HighDPI`, `ScrollMapper`

This makes the current implementation a Web Canvas2D grid, not a cross-platform spreadsheet engine.

The concrete pain:

| Area             | Current shape                                     | Problem                                                    |
| ---------------- | ------------------------------------------------- | ---------------------------------------------------------- |
| `Grid`           | constructs all concrete classes directly          | replacing renderer/host requires editing `Grid`            |
| `Renderer`       | depends on Canvas2D context and painter classes   | WebGL/WebGPU/Flutter cannot reuse the boundary             |
| `NativeScroller` | depends on DOM scroll events                      | web-only code lives under core                             |
| `HighDPI`        | mixes DPR with Canvas2D bitmap setup              | not reusable as-is for WebGL/WebGPU/Flutter                |
| comments         | large explanations live on implementation classes | future interfaces and implementations would duplicate docs |

The refactor should make package boundaries match the intended product boundary.

---

## 2. Goals

1. Split the current implementation into clear packages:
   - `@novasheet/core`
   - `@novasheet/web`
   - `@novasheet/web-canvas2d`
2. Keep only platform-independent logic in `@novasheet/core`.
3. Keep shared browser host concerns in `@novasheet/web`.
4. Keep Canvas2D-specific surface, renderer, and painters in `@novasheet/web-canvas2d`.
5. Preserve the public web usage shape through `@novasheet/web-canvas2d`:

   ```ts
   import { Grid } from '@novasheet/web-canvas2d'

   const grid = new Grid(container, { data, theme })
   ```

6. Move architectural comments and examples to interfaces/contracts.
7. Keep implementation comments focused on implementation details only.
8. Complete the refactor in one implementation pass because current feature surface is still small.

---

## 3. Non-Goals

This refactor will not implement:

- WebGL renderer
- WebGPU renderer
- Flutter package
- Swift/iOS package
- Android package
- Full `RenderCommand[]` abstraction
- Formula engine, editing, selection, copy/paste, filtering, grouping, or column reorder

The refactor should make those future targets easier, but only Web Canvas2D will be implemented now.

---

## 4. Package Architecture

Target package layout:

```text
packages/
  core/
    src/
      data/
      layout/
      theme/
      engine/
      render/
      scheduler/

  web/
    src/
      host/
      scroll/
      resize/
      runtime/

  web-canvas2d/
    src/
      Grid.ts
      surface/
      render/
      painters/
```

Responsibility split:

| Package                   | Owns                                                                                           | Must not own                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `@novasheet/core`         | data contracts, schema, theme contracts, layout, viewport, engine state, render frame contract | DOM, canvas, browser scroll events                                  |
| `@novasheet/web`          | DOM host, native scroll adapter, scroll spacer, resize observer, DPR reading, web lifecycle    | Canvas2D drawing, WebGL/WebGPU drawing                              |
| `@novasheet/web-canvas2d` | Web Canvas2D surface, Canvas2D renderer, Canvas2D painters, public web `Grid` facade           | platform-independent layout rules                                   |
| `apps/storybook`          | examples and visual validation                                                                 | direct dependency on `@novasheet/core` for the rendered grid facade |

---

## 5. Core Contracts

### `GridEngine`

`GridEngine` is the platform-independent state coordinator.

It should replace the non-DOM parts of the current `Grid`.

Responsibilities:

- hold `DataSource`
- hold `Theme`
- own `ChunkedAxis` for rows and columns
- own `FrozenRegions`
- own `Viewport`
- own logical scroll state
- apply row/column sizing mutations
- expose a snapshot/frame for rendering

Draft interface:

```ts
export interface GridEngine {
  setData(data: DataSource): void
  setTheme(theme: Theme): void
  setViewportSize(width: number, height: number): void
  setScroll(logicalX: number, logicalY: number): void
  setRowHeight(rowIndex: number, height: number): void
  setColumnWidth(fieldId: string, width: number): void
  refresh(): void
  getFrame(): RenderFrame
}
```

Default implementation:

```ts
export class DefaultGridEngine implements GridEngine {
  // uses ChunkedAxis / FrozenRegions / Viewport internally
}
```

### `RenderFrame`

For the first refactor, `RenderFrame` should stay close to current behavior rather than introducing full command rendering.

Draft shape:

```ts
export interface RenderFrame {
  data: DataSource
  theme: Theme
  rowsAxis: Axis
  colsAxis: Axis
  viewport: ViewportSnapshot
}
```

Rationale:

- This preserves the current Canvas2D renderer logic.
- It avoids designing a full cross-platform `RenderCommand[]` before WebGL/Flutter requirements are proven.
- It still removes DOM/Canvas dependencies from core.

Future phase:

```ts
export type RenderCommand = FillRectCommand | TextCommand | LineCommand | ClipCommand
```

That command layer should be designed later, when a second renderer target is being prototyped.

### `Axis`

`ChunkedAxis` should be hidden behind an interface where consumers do not need the concrete class.

Draft interface:

```ts
export interface Axis {
  readonly version: number
  getTotalSize(): number
  getCount(): number
  getDefaultSize(): number
  getSize(index: number): number
  indexToPosition(index: number): number
  positionToIndex(position: number): number
  getVisibleRange(startPos: number, endPos: number): [number, number]
}
```

Mutation-capable implementation can extend it internally:

```ts
export interface MutableAxis extends Axis {
  setSize(index: number, size: number): void
  setDefaultSize(size: number): void
}
```

### Contract Comments

Long explanatory comments should live on interfaces:

- `GridEngine`
- `RenderFrame`
- `Axis`
- `ViewportSnapshot`
- `Quadrant`
- `WebHost`
- `WebRenderer`
- `RenderSurface`

Implementation classes should keep only:

- implementation caveats
- performance details
- platform-specific constraints
- non-obvious lifecycle behavior

This avoids maintaining two sets of architectural docs.

---

## 6. Web Host Contracts

`@novasheet/web` owns browser host behavior that is shared by Canvas2D, WebGL, and WebGPU.

### `WebHost`

Draft interface:

```ts
export interface WebHost {
  attach(): void
  setScrollSize(width: number, height: number): void
  scrollTo(scrollTop: number, scrollLeft: number): void
  destroy(): void
}
```

Responsibilities:

- create/manage `scrollHost`
- create/manage `scrollSpacer`
- attach native scroll listener
- expose scroll callbacks
- observe container resize
- read device pixel ratio
- restore container styles on destroy

### `WebGridRuntime`

`WebGridRuntime` wires `GridEngine`, `WebHost`, `ScrollMapper`, and `WebRenderer`.

Draft shape:

```ts
export interface WebGridRuntime {
  refresh(): void
  scrollToRow(rowIndex: number, align?: 'start' | 'center' | 'end'): void
  scrollToCell(rowIndex: number, fieldId: string): void
  destroy(): void
}
```

It owns web-specific orchestration:

```text
scrollHost scroll
  -> NativeScroller
  -> ScrollMapper
  -> GridEngine.setScroll()
  -> WebRenderer.render(engine.getFrame())
```

---

## 7. Web Canvas2D Contracts

`@novasheet/web-canvas2d` owns the only implemented renderer for this refactor.

### Public `Grid`

`@novasheet/web-canvas2d` exports the browser-facing facade:

```ts
export class Grid {
  constructor(container: HTMLElement, options: GridOptions)
  setData(data: DataSource): void
  setTheme(theme: Theme): void
  setRowHeight(rowIndex: number, height: number): void
  setColumnWidth(fieldId: string, width: number): void
  scrollToRow(rowIndex: number, align?: 'start' | 'center' | 'end'): void
  scrollToCell(rowIndex: number, fieldId: string): void
  refresh(): void
  destroy(): void
}
```

This preserves current Storybook/web usage while moving it out of `@novasheet/core`.

### `WebRenderer`

Draft interface:

```ts
export interface WebRenderer {
  mount(container: HTMLElement): void
  resize(width: number, height: number, dpr: number): void
  render(frame: RenderFrame): void
  destroy(): void
}
```

### `Canvas2DRenderer`

`Canvas2DRenderer` replaces current `Renderer` as a web-canvas implementation.

It owns:

- `HTMLCanvasElement`
- `CanvasRenderingContext2D`
- Canvas2D DPR transform
- `CellPainter`
- `GridLinesPainter`
- `HeaderPainter`

It should not own:

- DOM scroll host
- scroll spacer
- logical scroll mapping
- data/layout mutation

---

## 8. Dependency Injection Strategy

Use dependency injection as a design pattern, not a framework.

Do not introduce a TS DI container.

Use:

- explicit interfaces
- factory functions
- composition roots
- constructor injection where needed

Example:

```ts
export function createWebCanvasGrid(container: HTMLElement, options: GridOptions): Grid {
  const engine = new DefaultGridEngine(options)
  const renderer = new Canvas2DRenderer()
  const host = new DomGridHost(container)
  const runtime = new DefaultWebGridRuntime(engine, host, renderer)
  return new Grid(runtime)
}
```

Why not a DI framework:

| Reason                        | Explanation                                            |
| ----------------------------- | ------------------------------------------------------ |
| Flutter rewrite will use Dart | TS DI containers cannot be reused in Dart/Swift/Kotlin |
| Current codebase is small     | explicit factories are easier to read and test         |
| Tree-shaking                  | explicit imports are more bundler-friendly             |
| Debuggability                 | dependency wiring remains visible                      |

---

## 9. Migration Plan

This refactor should be implemented in one branch, but with sequential commits.

### Step 1: Add Packages

Create:

- `packages/web`
- `packages/web-canvas2d`

Update root workspace if needed.

### Step 2: Extract Core Interfaces

Add contract files under `packages/core/src`:

- `engine/GridEngine.ts`
- `render/RenderFrame.ts`
- `layout/Axis.ts`

Move long architectural comments from implementation classes to interfaces.

### Step 3: Extract `DefaultGridEngine`

Move non-DOM logic from current `Grid` into `DefaultGridEngine`.

Keep:

- data/theme state
- row/col axis creation
- `FrozenRegions`
- `Viewport`
- logical scroll
- row/column size mutation
- frame generation

Remove from core:

- `document.createElement`
- `HTMLElement`
- `HTMLCanvasElement`
- `CanvasRenderingContext2D`
- `ResizeObserver`
- `NativeScroller`
- `HighDPI`

### Step 4: Move Web Host

Move to `@novasheet/web`:

- `NativeScroller`
- `ScrollMapper` if it remains web scroll-specific
- DOM host setup
- scrollHost / scrollSpacer sizing
- resize observer wiring
- DPR reading

If `ScrollMapper` remains purely mathematical, it may stay in `core`.
Decision: keep `ScrollMapper` in `core` for now because it maps logical content size to capped scroll coordinates and has no DOM dependency.

### Step 5: Move Canvas2D Renderer

Move to `@novasheet/web-canvas2d`:

- current `Renderer`
- `HighDPI`
- `CellPainter`
- `GridLinesPainter`
- `HeaderPainter`
- canvas recording test helpers where relevant

Rename current `Renderer` to `Canvas2DRenderer`.

### Step 6: Add Public Web Facade

`@novasheet/web-canvas2d` exports `Grid`.

This `Grid` composes:

- `DefaultGridEngine`
- `DomGridHost`
- `Canvas2DRenderer`
- shared per-grid scheduler

### Step 7: Update Storybook

Storybook imports from:

```ts
import { Grid, type GridOptions } from '@novasheet/web-canvas2d'
```

Storybook Vite alias points to `packages/web-canvas2d/src/index.ts`.

### Step 8: Rehome Tests

Target test locations:

```text
packages/core/tests/
  data/
  layout/
  engine/
  scroll/ScrollMapper.test.ts

packages/web/tests/
  NativeScroller.test.ts
  DomGridHost.test.ts

packages/web-canvas2d/tests/
  render/
  helpers/recording-context.ts
```

Keep all existing behavioral coverage.

### Step 9: Compatibility Cleanup

`@novasheet/core` should no longer export browser `Grid`.

It should export:

- `DefaultGridEngine`
- `GridEngine`
- `DataSource`
- `InMemoryDataSource`
- `Schema` types
- `Theme`
- `denseGridTheme`
- layout contracts and implementations as appropriate
- `ScrollMapper` if kept in core

---

## 10. Testing Strategy

Required verification:

```bash
bun run format
bun run lint
bun run --filter @novasheet/core typecheck
bun run --filter @novasheet/web typecheck
bun run --filter @novasheet/web-canvas2d typecheck
bun test
bun run build
bun run build-storybook
```

Test ownership:

| Layer        | Tests                                                                                                |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| core         | pure TypeScript, no DOM requirement except existing happy-dom test preload until test infra is split |
| web          | happy-dom DOM tests                                                                                  |
| web-canvas2d | RecordingContext2D canvas instruction tests                                                          |
| storybook    | build smoke                                                                                          |

Important behavior to preserve:

- Grid first frame is painted synchronously in the web-canvas facade.
- Subsequent rendering is scheduled through the per-grid scheduler.
- Native scroll mapping still reaches the last row and far columns.
- `Grid.destroy()` remains idempotent.
- DataSource `getRows(start, end)` remains inclusive.
- Theme remains the only visual token source.

---

## 11. Risks

| Risk                      | Mitigation                                                                              |
| ------------------------- | --------------------------------------------------------------------------------------- |
| Refactor is large         | Keep behavior-preserving commits and run tests after each package move                  |
| Public API break          | Move browser `Grid` to `@novasheet/web-canvas2d` intentionally; update README/Storybook |
| Too many interfaces       | Only add interfaces at package boundaries, not for every private helper                 |
| Comments become stale     | Put architectural comments on interfaces; keep implementation comments short            |
| Storybook HMR breaks      | Alias Storybook to `packages/web-canvas2d/src/index.ts`                                 |
| Build config gets complex | Keep each package build script close to current `packages/core/build.ts` pattern        |

---

## 12. Acceptance Criteria

This refactor is complete when:

1. `@novasheet/core` has no direct references to:
   - `HTMLElement`
   - `HTMLCanvasElement`
   - `CanvasRenderingContext2D`
   - `document.createElement`
   - `ResizeObserver`
2. `@novasheet/web` owns browser host and scroll behavior.
3. `@novasheet/web-canvas2d` owns Canvas2D rendering and exports browser `Grid`.
4. Storybook renders all existing stories through `@novasheet/web-canvas2d`.
5. Existing tests pass after being moved to their package owners.
6. Format, lint, typecheck, tests, package builds, and Storybook build pass.
7. Long architectural comments live on contracts/interfaces, not duplicated across implementations.

---

## 13. Future Follow-Up

After this refactor, future work can add:

- `@novasheet/web-webgl`
- `@novasheet/web-webgpu`
- a Dart/Flutter implementation following the same architecture
- `RenderCommand[]` if a second renderer proves the need

The next renderer target should drive the exact command model. Do not design the full command language before a real second renderer exists.
