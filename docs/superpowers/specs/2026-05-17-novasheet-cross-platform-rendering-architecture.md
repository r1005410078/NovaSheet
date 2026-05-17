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
8. Complete the refactor on a single branch via sequential commits, one per Step in §9. Each Step ends with green tests + commit before the next Step begins. ("One-pass" here means "one branch" — NOT "one giant commit". 18+ src files + 16+ test files move; commit boundaries protect against half-working intermediate states.)

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

`RenderFrame` is an **engine state snapshot** — not a renderer-agnostic command stream.

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

**Honest framing (read this before assuming what RenderFrame buys you)**:

This contract removes DOM/Canvas types from core but **does not eliminate per-renderer iteration logic**. A future `WebGLRenderer` still has to:

- iterate `for (r in rowRange) for (c in colRange)` over the visible quadrants
- call `data.getCell(r, fieldId)` per cell
- read `theme.colors.*` / `theme.metrics.*`
- handle text measurement, clipping, alpha, etc.

i.e. each new renderer re-implements roughly the same `paintQuadrant` loop. The only reuse RenderFrame gives is the **input shape** (which axes are visible, where scroll currently is), not the **drawing logic**.

This is a deliberate YAGNI choice. Two alternatives were considered:

| Alternative | What it would do | Why not now |
|---|---|---|
| (A) Full `RenderCommand[]` precomputed in core | core emits `{type:'fillText', x, y, str, color}[]`; renderer only translates primitives | premature; second renderer hasn't surfaced its real needs (alpha? batching? text-shaping?) — designing the language now risks getting it wrong |
| (B) **Engine snapshot only (this spec)** | each renderer iterates its own paintQuadrant | per-renderer code duplication for the iteration loop, accepted |
| (C) Shared iteration helpers | core exposes `iterateVisibleCells(frame, callback)`; renderers pass per-cell draw callbacks | could be added later if (B) duplication actually becomes painful |

Decision: go with (B). Re-evaluate after a second renderer (WebGL or Flutter) actually exists. (A) and (C) can be layered on later without breaking (B)'s contracts.

### `Axis`

`ChunkedAxis` should be hidden behind an interface where consumers do not need the concrete class.

**File layout**: put `Axis` and `MutableAxis` interfaces in the same file as `ChunkedAxis` class (i.e. `packages/core/src/layout/ChunkedAxis.ts` exports both). Avoid creating an adjacent `layout/Axis.ts` next to `layout/ChunkedAxis.ts` — adjacent files with same root word are a known anti-pattern. If a second axis implementation later appears (e.g. `FlatAxis` for tiny datasets), extract the interface to `layout/Axis.ts` then; not before.

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
export interface WebHostOptions {
  container: HTMLElement
  /** Called every native scroll event (RAF-throttled by the host). */
  onScroll: (scrollTop: number, scrollLeft: number) => void
  /** Called when container size changes (via ResizeObserver). */
  onResize: (cssWidth: number, cssHeight: number, dpr: number) => void
  /** Called when DPR changes (window moved between displays). */
  onDprChange?: (dpr: number) => void
}

export interface WebHost {
  /** Mount scrollHost + scrollSpacer into the container; attach scroll/resize/DPR listeners. */
  attach(): void
  /** Resize the scroll-spacer so the native scrollbar reflects current content extent. */
  setScrollSize(width: number, height: number): void
  /** Programmatically scroll. */
  scrollTo(scrollTop: number, scrollLeft: number): void
  /** Read current DPR (cached; updated by onDprChange). */
  getDpr(): number
  /** Read current container CSS size. */
  getContainerSize(): { width: number; height: number }
  /** Detach all listeners, remove scrollHost + scrollSpacer, restore container styles. */
  destroy(): void
}

export interface WebHostFactory {
  (options: WebHostOptions): WebHost
}
```

Ownership rules:

- `WebHost` **creates** `scrollHost` and `scrollSpacer` (the runtime never touches DOM directly).
- `WebHost` **owns** the lifecycle of scroll/resize/DPR listeners — `destroy()` is the only path to detach.
- The renderer's `<canvas>` is **NOT** owned by `WebHost` — it's owned by the platform-specific renderer (so a WebGPU swap doesn't require touching `WebHost`).
- Container styles touched by `WebHost`: only `position` (if computed style was `static`, set to `relative` on attach, restored on destroy). Nothing else.

Default implementation: `DomGridHost implements WebHost`, takes `WebHostOptions` in the constructor, defers DOM creation until `attach()`.

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

**Why a thin Grid wrapper instead of `export { WebGridRuntime as Grid }`?**

The wrapper exists to keep a **stable consumer-facing surface** independent of internal refactors:

- Internal `WebGridRuntime` may grow methods (`setOverscroll`, `attachDebugger`, ...) that aren't part of the public contract — `Grid` only re-exports what users should rely on.
- Methods naturally split between `engine` (data/theme/sizing) and `runtime` (scroll/lifecycle); `Grid` is the single forwarder so consumers don't reach into `grid.engine.setData(...)`.
- If a future v2 wants `Grid` to accept additional constructor options (e.g. `theme: 'dark'`) without touching internal contracts, the wrapper is where that lands.

If the wrapper truly becomes pure pass-through and stays that way for ≥ 6 months, drop it then.

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
- **`ScrollMapper`** (see decision below)
- DOM host setup (`DomGridHost implements WebHost`)
- scrollHost / scrollSpacer sizing
- resize observer wiring
- DPR reading

**`ScrollMapper` placement decision: `@novasheet/web`** (NOT core).

Rationale: `SAFE_MAX = 6_000_000` is derived from the lowest-common-denominator of Firefox / iOS Safari maximum element height (Firefox ~17.9M px, iOS Safari ~16.7M px). This is a **browser-specific constraint baked into a numeric constant**. Flutter / Swift / Android renderers don't have this limit — they shouldn't have to import and ignore ScrollMapper.

Keep core's "knows nothing about browsers" invariant clean. `@novasheet/web` is the right home for any Web-platform constant.

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

Detailed test migration:

| Current test/helper                       | Target package          | Required changes                                                                                                                |
| ----------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `tests/data/Schema.test.ts`               | `packages/core/tests`   | Keep as pure type/runtime tests. No DOM setup required.                                                                         |
| `tests/data/InMemoryDataSource.test.ts`   | `packages/core/tests`   | Keep as pure DataSource tests.                                                                                                  |
| `tests/layout/ChunkedAxis.test.ts`        | `packages/core/tests`   | Keep as pure layout tests. Update imports if `Axis` interface is introduced.                                                    |
| `tests/layout/Viewport.test.ts`           | `packages/core/tests`   | Keep in core. It should test `ViewportSnapshot` + `FrozenRegions` interaction without DOM.                                      |
| `tests/theme/denseGridTheme.test.ts`      | `packages/core/tests`   | Keep in core if `denseGridTheme` remains platform-independent. Remove any Canvas DOM type assumptions from assertions.          |
| `tests/scroll/ScrollMapper.test.ts`       | `packages/web/tests`    | Moved with `ScrollMapper` — SAFE_MAX is a Web-platform constant.                                                                |
| `tests/util/raf.test.ts`                  | `packages/core/tests`   | Keep only if scheduler remains core. If scheduler moves to web runtime, move test to `packages/web/tests`.                      |
| `tests/Grid.test.ts`                      | split                   | Move engine-only state tests to `packages/core/tests/engine/DefaultGridEngine.test.ts`; move DOM facade lifecycle tests to web. |
| `tests/scroll/NativeScroller.test.ts`     | `packages/web/tests`    | Update imports to `@novasheet/web`; keep happy-dom/global stubbing helpers here.                                                |
| `tests/render/Renderer.test.ts`           | `packages/web-canvas2d` | Rename to `Canvas2DRenderer.test.ts`; update expected instruction sequences if class names change.                              |
| `tests/render/CellPainter.test.ts`        | `packages/web-canvas2d` | Move with Canvas2D painter.                                                                                                     |
| `tests/render/GridLinesPainter.test.ts`   | `packages/web-canvas2d` | Move with Canvas2D painter.                                                                                                     |
| `tests/render/HeaderPainter.test.ts`      | `packages/web-canvas2d` | Move with Canvas2D painter.                                                                                                     |
| `tests/render/HighDPI.test.ts`            | `packages/web-canvas2d` | Move with Canvas2D surface because it asserts canvas bitmap/transform behavior.                                                 |
| `tests/helpers/recording-context.ts`      | `packages/web-canvas2d` | Move under `tests/helpers`; keep it Canvas2D-specific.                                                                          |
| `tests/helpers/recording-context.test.ts` | `packages/web-canvas2d` | Move with helper.                                                                                                               |
| `tests/helpers/global-stub.ts`            | shared or duplicated    | Prefer `packages/web/tests/helpers/global-stub.ts` and `packages/web-canvas2d/tests/helpers/global-stub.ts` initially.          |
| `tests/setup.ts`                          | split                   | Remove core dependency on global DOM setup. Add package-local setup files only for web/web-canvas2d tests.                      |
| `tests/_probe.test.ts`                    | re-evaluate             | Keep only if it documents a current invariant; otherwise delete or move to the package owning the probed invariant.             |

Test setup after refactor:

```text
packages/core/
  tests/setup.ts              optional; no happy-dom unless a core test truly needs it

packages/web/
  tests/setup.ts              happy-dom + DOM global helpers
  tests/helpers/global-stub.ts

packages/web-canvas2d/
  tests/setup.ts              happy-dom + RecordingContext2D canvas install
  tests/helpers/recording-context.ts
  tests/helpers/global-stub.ts
```

Package scripts:

```json
{
  "scripts": {
    "test": "bun test",
    "typecheck": "tsc --noEmit",
    "build": "bun run build.ts"
  }
}
```

Root verification remains:

```bash
bun test
bun run --filter '*' typecheck
bun run --filter '*' build
```

Testing refactor rules:

1. A test should live with the package that owns the behavior.
2. Core tests should not require `HTMLCanvasElement`, `HTMLElement`, or `CanvasRenderingContext2D`.
3. Web tests may use happy-dom but should not assert Canvas2D drawing instructions.
4. Web Canvas2D tests may use `RecordingContext2D` and assert drawing instruction order.
5. Every moved test must fail for the same kind of regression it caught before the refactor.

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
- (NOT `ScrollMapper` — moved to `@novasheet/web` per Step 4)

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

| Risk                                | Mitigation                                                                              |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| Refactor is large                   | Keep behavior-preserving commits and run tests after each package move                  |
| Public API break                    | Move browser `Grid` to `@novasheet/web-canvas2d` intentionally; update README/Storybook |
| Too many interfaces                 | Only add interfaces at package boundaries, not for every private helper                 |
| Comments become stale               | Put architectural comments on interfaces; keep implementation comments short            |
| Storybook HMR breaks                | Alias Storybook to `packages/web-canvas2d/src/index.ts`                                 |
| Build config gets complex           | Each package needs its own `build.ts` + `tsconfig.build.json` (mirroring `packages/core/`'s Bun-migration pattern). core may skip `build.ts` if it ships pure types — re-evaluate during Step 1. |
| **Inter-package version drift** when published | Use `workspace:*` in dev. On publish, replace with exact pins (`=x.y.z`); `@novasheet/web-canvas2d@1.2.0` peers `=@novasheet/web@1.2.0` peers `=@novasheet/core@1.2.0`. Mismatch will silently break consumers; CI must verify three-way version alignment before publish. |
| Three packages bloat consumer install | Acceptable trade-off — npm dedupes the shared tree. If it becomes a real problem, ship a meta-package `@novasheet/web-canvas2d-all` that re-exports the public surface. |

---

## 12. Acceptance Criteria

This refactor is complete when:

1. `@novasheet/core` has no direct references to:
   - `HTMLElement`
   - `HTMLCanvasElement`
   - `CanvasRenderingContext2D`
   - `document.createElement`
   - `ResizeObserver`
   - `window.devicePixelRatio`
2. `@novasheet/web` owns browser host, scroll behavior, AND `ScrollMapper` (with its Web-specific `SAFE_MAX`).
3. `@novasheet/web-canvas2d` owns Canvas2D rendering and exports browser `Grid`.
4. Storybook renders **all 11 existing stories** through `@novasheet/web-canvas2d`. `bun run storybook` boots cleanly; `bun run build-storybook` produces static output without errors.
5. **All 126 existing tests pass after relocation**. No test silently dropped. Test files redistributed per §9 Step 8 table.
6. Format, lint, typecheck (all three packages), tests, all three package builds, and Storybook build pass.
7. Long architectural comments live on contracts/interfaces, not duplicated across implementations.
8. Inter-package dependencies use exact version specifiers in published `package.json` (`workspace:*` for monorepo dev; `=x.y.z` for npm publish). See §11 versioning risk.

---

## 13. Future Follow-Up

After this refactor, future work can add:

- `@novasheet/web-webgl` — sibling to `web-canvas2d`, same `WebRenderer` contract
- `@novasheet/web-webgpu` — same
- `RenderCommand[]` if (B)→(A) migration from §5 RenderFrame becomes warranted
- a Dart/Flutter implementation **following the same architectural principles** (engine ↔ host ↔ renderer split) — NOT a literal port

**Cross-platform honesty**: the TypeScript interfaces in this spec do **not** translate to Dart/Swift/Kotlin. Each language has its own module/widget/state conventions; the abstractions would be redesigned in the target language. What carries across is the **design principle**: separate platform-independent state from platform-specific host from renderer-specific drawing. Don't over-promise "one architecture for all platforms" — promise "consistent architectural boundary in each platform".

The next renderer target should drive the exact command model. Do not design the full command language before a real second renderer exists.
