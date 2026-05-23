# Cross-Platform Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the current `@novasheet/core` (which conflates engine state + browser host + Canvas2D renderer) into three packages — `@novasheet/core` (platform-independent), `@novasheet/web` (browser host), `@novasheet/web-canvas2d` (Canvas2D renderer + public Grid) — without losing any of the 126 existing tests or breaking any of the 11 Storybook stories.

**Architecture:** Each task is a behavior-preserving move on a single branch with green tests at every commit. Order is "expand then contract": create new packages and add new files alongside existing ones (additive), update Storybook to consume the new public Grid, then remove the old code from `@novasheet/core` last. The current monolithic `Grid` in core is decomposed into `DefaultGridEngine` (data/layout/state, in core), `DomGridHost` (DOM lifecycle, in web), `Canvas2DRenderer` (drawing, in web-canvas2d), `WebGridRuntime` (orchestrator wiring engine + host + renderer, in web), and a thin facade `Grid` exposed by `@novasheet/web-canvas2d`. The `WebRenderer` interface lives in `@novasheet/web` so future `@novasheet/web-webgl` etc. can implement the same shape.

**Tech Stack:** Bun 1.3+, TypeScript 5.4+ (strict), `bun:test` + happy-dom, existing `RecordingContext2D` test helper, existing `Bun.build` + tsc DTS pattern.

**Spec reference:** [docs/superpowers/specs/2026-05-17-novasheet-cross-platform-rendering-architecture.md](../specs/2026-05-17-novasheet-cross-platform-rendering-architecture.md)

**Out of scope:**

- WebGL / WebGPU renderers (future, after this refactor proves the boundary)
- Full `RenderCommand[]` (spec §5 decision: stay with RenderFrame engine-snapshot for now)
- New features (no M3 scope, no React wrapper)
- npm publishing (this is internal restructure; first publish comes after refactor)

---

## File Structure

### Final target layout

```
NovaSheet/
├── bunfig.toml                          # already exists; test preload paths updated
├── package.json                         # workspaces field includes new packages
├── bun.lock                             # regenerated as packages get added
└── packages/
    ├── core/                            # platform-independent
    │   ├── package.json
    │   ├── build.ts
    │   ├── tsconfig.json
    │   ├── tsconfig.build.json
    │   ├── src/
    │   │   ├── index.ts                 # exports: types + engine + interfaces (no Grid)
    │   │   ├── types.ts
    │   │   ├── data/
    │   │   │   ├── Schema.ts
    │   │   │   ├── DataSource.ts
    │   │   │   └── InMemoryDataSource.ts
    │   │   ├── theme/
    │   │   │   ├── Theme.ts
    │   │   │   └── denseGridTheme.ts
    │   │   ├── layout/
    │   │   │   ├── ChunkedAxis.ts       # also exports Axis + MutableAxis interfaces
    │   │   │   ├── FrozenRegions.ts
    │   │   │   └── Viewport.ts
    │   │   ├── engine/
    │   │   │   ├── GridEngine.ts        # interface
    │   │   │   └── DefaultGridEngine.ts
    │   │   ├── render/
    │   │   │   └── RenderFrame.ts       # interface only — no implementation
    │   │   └── util/
    │   │       ├── raf.ts               # FrameScheduler — stays in core
    │   │       ├── BinarySearch.ts
    │   │       └── ChunkArray.ts
    │   └── tests/
    │       ├── setup.ts                 # minimal — no happy-dom (core is DOM-free)
    │       ├── helpers/
    │       │   └── (none — core tests need no DOM helpers)
    │       ├── data/
    │       ├── theme/
    │       ├── layout/
    │       ├── engine/                  # DefaultGridEngine.test.ts
    │       └── util/
    │
    ├── web/                             # browser host (DOM, scroll, resize, DPR)
    │   ├── package.json
    │   ├── build.ts
    │   ├── tsconfig.json
    │   ├── tsconfig.build.json
    │   ├── src/
    │   │   ├── index.ts
    │   │   ├── host/
    │   │   │   ├── WebHost.ts           # interface + WebHostOptions + WebHostFactory
    │   │   │   └── DomGridHost.ts
    │   │   ├── scroll/
    │   │   │   ├── ScrollMapper.ts      # moved from core; SAFE_MAX is web-specific
    │   │   │   └── NativeScroller.ts
    │   │   ├── render/
    │   │   │   └── WebRenderer.ts       # interface implemented by Canvas2DRenderer etc.
    │   │   └── runtime/
    │   │       └── WebGridRuntime.ts    # orchestrates engine + host + renderer
    │   └── tests/
    │       ├── setup.ts                 # happy-dom + global-stub
    │       ├── helpers/
    │       │   └── global-stub.ts       # moved from core
    │       ├── host/
    │       ├── scroll/
    │       └── runtime/
    │
    └── web-canvas2d/                    # Canvas2D renderer + public Grid facade
        ├── package.json
        ├── build.ts
        ├── tsconfig.json
        ├── tsconfig.build.json
        ├── src/
        │   ├── index.ts                 # exports Grid + GridOptions only
        │   ├── Grid.ts                  # thin public facade
        │   ├── surface/
        │   │   └── HighDPI.ts           # canvas-DPR-specific
        │   ├── render/
        │   │   └── Canvas2DRenderer.ts  # renamed from Renderer; implements WebRenderer
        │   └── painters/
        │       ├── CellPainter.ts
        │       ├── GridLinesPainter.ts
        │       └── HeaderPainter.ts
        └── tests/
            ├── setup.ts                 # happy-dom + canvas stub
            ├── helpers/
            │   ├── recording-context.ts # moved from core
            │   └── global-stub.ts       # duplicated for package independence
            ├── render/                  # Canvas2DRenderer.test.ts
            └── painters/

apps/storybook/
└── src/                                 # imports updated from @novasheet/core → @novasheet/web-canvas2d
```

### Files deleted from `packages/core` after migration

```
packages/core/src/
├── Grid.ts                              # → split into engine/DefaultGridEngine (core) + web/runtime + web-canvas2d/Grid
├── scroll/
│   ├── ScrollMapper.ts                  # → packages/web/src/scroll/
│   └── NativeScroller.ts                # → packages/web/src/scroll/
└── render/
    ├── Renderer.ts                      # → packages/web-canvas2d/src/render/Canvas2DRenderer.ts
    ├── HighDPI.ts                       # → packages/web-canvas2d/src/surface/
    ├── CellPainter.ts                   # → packages/web-canvas2d/src/painters/
    ├── GridLinesPainter.ts              # → packages/web-canvas2d/src/painters/
    └── HeaderPainter.ts                 # → packages/web-canvas2d/src/painters/

packages/core/tests/
├── Grid.test.ts                         # → split into engine/DefaultGridEngine.test (core) + web/runtime
├── scroll/*.test.ts                     # → packages/web/tests/scroll/
├── render/*.test.ts                     # → packages/web-canvas2d/tests/
└── helpers/
    ├── recording-context.ts             # → packages/web-canvas2d/tests/helpers/
    ├── recording-context.test.ts        # → packages/web-canvas2d/tests/helpers/
    └── global-stub.ts                   # → packages/web/tests/helpers/ + packages/web-canvas2d/tests/helpers/
```

### Files explicitly NOT touched

- `apps/storybook/src/stories/*` content (only imports change in Task 11)
- `apps/storybook/src/grid-host.ts` (only the imported `Grid` type changes)
- `apps/storybook/src/generated-data-source.ts` (still imports from `@novasheet/core` — `DataSource` interface lives there)
- `docs/superpowers/specs/*` (spec is canonical; only this plan + CLAUDE.md/README update)

---

## Conventions

- **Working directory**: `/Users/rongts/NovaSheet` for all commands unless stated otherwise.
- **Commit cadence**: one commit per task. Each task ends with `bun test` (full suite, 126 tests) + `bun run lint` + `bun run typecheck` (all 3 packages once they exist) all green before commit.
- **Behavior preservation**: 126 tests must pass at every commit boundary. If a test must move file location, the move + import update happen in the same commit as the moved code.
- **Expand-then-contract**: new code goes in new files first; old files are deleted only when nothing imports them (verified by grep).
- **No new tests required**: this is a behavior-preserving refactor. Existing tests cover the behavior. If a test needs to be split (e.g. `Grid.test.ts` engine half + runtime half), split content stays in one of the two new locations — total assertion count unchanged.

---

### Task 1: Create empty `@novasheet/web` and `@novasheet/web-canvas2d` packages

**Files:**

- Create: `packages/web/package.json`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/tsconfig.build.json`
- Create: `packages/web/build.ts`
- Create: `packages/web/src/index.ts` (placeholder `export {}`)
- Create: `packages/web-canvas2d/package.json`
- Create: `packages/web-canvas2d/tsconfig.json`
- Create: `packages/web-canvas2d/tsconfig.build.json`
- Create: `packages/web-canvas2d/build.ts`
- Create: `packages/web-canvas2d/src/index.ts` (placeholder `export {}`)
- Modify: `/Users/rongts/NovaSheet/package.json` (workspaces field already covers `packages/*`, no change)

- [ ] **Step 1: Create `packages/web/package.json`**

```json
{
  "name": "@novasheet/web",
  "version": "0.0.0",
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
    "@novasheet/core": "workspace:*"
  },
  "devDependencies": {
    "@happy-dom/global-registrator": "^20.9.0",
    "@types/bun": "latest",
    "happy-dom": "^14.7.1",
    "typescript": "^5.4.5"
  }
}
```

- [ ] **Step 2: Create `packages/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "./dist"
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

- [ ] **Step 3: Create `packages/web/tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "rootDir": "src"
  },
  "include": ["src/**/*"],
  "exclude": ["tests"]
}
```

- [ ] **Step 4: Create `packages/web/build.ts`**

```ts
/**
 * Build script for @novasheet/web. Same pattern as packages/core/build.ts:
 * Bun.build for ESM + CJS, tsc --emitDeclarationOnly for .d.ts.
 */

import { rm, copyFile } from 'node:fs/promises'

const ROOT = new URL('.', import.meta.url).pathname

await rm(`${ROOT}dist`, { recursive: true, force: true })

const common = {
  entrypoints: [`${ROOT}src/index.ts`],
  outdir: `${ROOT}dist`,
  target: 'browser' as const,
  sourcemap: 'linked' as const,
  minify: false,
} satisfies Parameters<typeof Bun.build>[0]

const esmResult = await Bun.build({ ...common, format: 'esm' })
if (!esmResult.success) {
  console.error('ESM build failed:', esmResult.logs)
  process.exit(1)
}

const cjsResult = await Bun.build({
  ...common,
  format: 'cjs',
  naming: '[name].cjs',
})
if (!cjsResult.success) {
  console.error('CJS build failed:', cjsResult.logs)
  process.exit(1)
}

const dts = Bun.spawn(
  ['bunx', 'tsc', '-p', 'tsconfig.build.json', '--emitDeclarationOnly', '--outDir', `${ROOT}dist`],
  { cwd: ROOT, stdout: 'inherit', stderr: 'inherit' },
)
const dtsExitCode = await dts.exited
if (dtsExitCode !== 0) {
  console.error('tsc declaration generation failed')
  process.exit(1)
}

await copyFile(`${ROOT}dist/index.d.ts`, `${ROOT}dist/index.d.cts`)

console.log('Build complete')
console.log('  ESM:', esmResult.outputs.map((o) => o.path).join(', '))
console.log('  CJS:', cjsResult.outputs.map((o) => o.path).join(', '))
console.log('  DTS: index.d.ts, index.d.cts')
```

- [ ] **Step 5: Create `packages/web/src/index.ts`**

```ts
// @novasheet/web — placeholder. Real exports added by later tasks.
export {}
```

- [ ] **Step 6: Repeat Steps 1-5 for `packages/web-canvas2d/`**

Same files, with these substitutions in `package.json`:

- `"name": "@novasheet/web-canvas2d"`
- Add `"@novasheet/web": "workspace:*"` to `dependencies`

Other files (`tsconfig.json`, `tsconfig.build.json`, `build.ts`, `src/index.ts`) are identical to web's versions.

- [ ] **Step 7: Run `bun install` to register new workspaces**

```bash
cd /Users/rongts/NovaSheet
bun install
```

Expected: `bun pm ls` now shows 4 workspaces (root, core, web, web-canvas2d, storybook).

- [ ] **Step 8: Verify all three packages can be built and typechecked**

```bash
bun run --filter '*' typecheck
bun run --filter '*' build
```

Expected: all packages exit 0. `packages/web/dist/index.js` and `packages/web-canvas2d/dist/index.js` exist with empty exports.

- [ ] **Step 9: Verify tests still pass**

```bash
bun test
```

Expected: 126 passing (no test changes yet).

- [ ] **Step 10: Commit**

```bash
git add packages/web packages/web-canvas2d bun.lock
git commit -m "chore(refactor): scaffold empty @novasheet/web and @novasheet/web-canvas2d packages"
```

---

### Task 2: Add `Axis` and `MutableAxis` interfaces alongside `ChunkedAxis`

**Files:**

- Modify: `packages/core/src/layout/ChunkedAxis.ts` (add interface exports)

This is purely additive. No test changes — `ChunkedAxis` already satisfies the interface shape.

- [ ] **Step 1: Edit `packages/core/src/layout/ChunkedAxis.ts`**

Find the existing `export class ChunkedAxis` and ADD these two interface exports BEFORE the class:

```ts
/**
 * Read-only axis contract — what painters / engine consumers need.
 *
 * Implementations: `ChunkedAxis` (default, this file). Future implementations
 * (e.g. small-dataset flat array) implement the same interface. Mutation
 * capability is on `MutableAxis` so consumers that only read can't mutate.
 */
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

/**
 * Mutable axis — for engine state holders. Painters should depend on `Axis`,
 * not `MutableAxis`, so they can't accidentally mutate during render.
 */
export interface MutableAxis extends Axis {
  setSize(index: number, size: number): void
  setDefaultSize(size: number): void
}
```

- [ ] **Step 2: Verify `ChunkedAxis` structurally satisfies `MutableAxis`**

Add a static type assertion at the bottom of the file (after the class):

```ts
// Compile-time assertion: ChunkedAxis must satisfy MutableAxis.
// This catches signature drift the moment it happens.
const _typecheck: MutableAxis = null as unknown as ChunkedAxis
void _typecheck
```

- [ ] **Step 3: Typecheck**

```bash
bun run --filter @novasheet/core typecheck
```

Expected: exit 0. If TS errors, ChunkedAxis is missing a method — fix by adjusting the interface to match reality, not by adding to the class.

- [ ] **Step 4: Tests still green**

```bash
bun test
```

Expected: 126 passing.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/layout/ChunkedAxis.ts
git commit -m "feat(core): add Axis + MutableAxis interfaces alongside ChunkedAxis"
```

---

### Task 3: Move `ScrollMapper` from `@novasheet/core` to `@novasheet/web`

**Files:**

- Create: `packages/web/src/scroll/ScrollMapper.ts` (moved from core)
- Modify: `packages/web/src/index.ts` (re-export)
- Delete: `packages/core/src/scroll/ScrollMapper.ts`
- Modify: `packages/core/src/index.ts` (remove ScrollMapper export)
- Move: `packages/core/tests/scroll/ScrollMapper.test.ts` → `packages/web/tests/scroll/ScrollMapper.test.ts`
- Create: `packages/web/tests/setup.ts` (minimal — ScrollMapper is pure math, but the file establishes the structure for later tasks)
- Create: `bunfig.toml` update (add packages/web/tests/setup.ts to preload chain)

The ScrollMapper code itself doesn't change. Only its location + the consumers that import it.

- [ ] **Step 1: Find current consumers of ScrollMapper**

```bash
grep -rln "from.*ScrollMapper\|from '@novasheet/core'.*ScrollMapper" packages/ apps/ 2>/dev/null | grep -v node_modules
```

Expected matches (verify before proceeding):

- `packages/core/src/Grid.ts` (imports `ScrollMapper`)
- `packages/core/src/index.ts` (re-exports `ScrollMapper, SAFE_MAX`)
- `packages/core/tests/scroll/ScrollMapper.test.ts` (the test itself)

`apps/storybook/` does NOT import ScrollMapper directly.

- [ ] **Step 2: Copy the file to its new location**

```bash
mkdir -p packages/web/src/scroll
cp packages/core/src/scroll/ScrollMapper.ts packages/web/src/scroll/ScrollMapper.ts
```

The file content stays identical. Verify with `diff packages/core/src/scroll/ScrollMapper.ts packages/web/src/scroll/ScrollMapper.ts` — should show no differences.

- [ ] **Step 3: Update `packages/web/src/index.ts`**

```ts
// @novasheet/web — browser host & web-specific platform code.
//
// Currently exports:
//   - ScrollMapper / SAFE_MAX: non-linear scroll mapping with web-element height cap

export { ScrollMapper, SAFE_MAX } from './scroll/ScrollMapper'
```

- [ ] **Step 4: Move the test file**

```bash
mkdir -p packages/web/tests/scroll
git mv packages/core/tests/scroll/ScrollMapper.test.ts packages/web/tests/scroll/ScrollMapper.test.ts
```

Edit the moved file's import to use a relative path within `@novasheet/web`:

Find:

```ts
import { ScrollMapper, SAFE_MAX } from '../../src/scroll/ScrollMapper'
```

Replace with (same path — file moved with the structure):

```ts
import { ScrollMapper, SAFE_MAX } from '../../src/scroll/ScrollMapper'
```

(No change to the import line itself — the relative depth is the same.)

- [ ] **Step 5: Create `packages/web/tests/setup.ts`**

```ts
/**
 * Test environment bootstrap for @novasheet/web tests. Loaded once via
 * bunfig.toml [test] preload before any test file runs.
 *
 * Registers happy-dom globally — web tests touch DOM types (HTMLElement etc.).
 * No canvas stub here — that's only needed in @novasheet/web-canvas2d.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register()
```

- [ ] **Step 6: Update root `bunfig.toml` to preload both setup files**

Edit `/Users/rongts/NovaSheet/bunfig.toml`:

```toml
[install]
# Pin npmjs.org registry — avoids leaking a contributor's `~/.npmrc` mirror
# (e.g. registry.npmmirror.com) into bun.lock, which would route every CI
# install through a mirror that may not be reachable from GitHub runners.
registry = "https://registry.npmjs.org/"

[test]
preload = [
  "./packages/core/tests/setup.ts",
  "./packages/web/tests/setup.ts",
]
```

(Order matters — core preload first, web second. But since they only register globals and don't conflict, the order is informative.)

- [ ] **Step 7: Update `packages/core/src/Grid.ts` to import ScrollMapper from `@novasheet/web`**

Find:

```ts
import { ScrollMapper } from './scroll/ScrollMapper'
```

Replace with:

```ts
import { ScrollMapper } from '@novasheet/web'
```

This requires `@novasheet/core` to depend on `@novasheet/web` — which creates a dependency cycle in the long term but is FINE TRANSIENTLY for this task. The cycle is resolved in Task 8 when `Grid` is removed from core entirely.

Add `@novasheet/web` to `packages/core/package.json` dependencies:

```json
"dependencies": {
  "@novasheet/web": "workspace:*"
}
```

(Add a `dependencies` field if it doesn't exist.)

- [ ] **Step 8: Remove ScrollMapper from `packages/core/src/index.ts`**

Delete this section:

```ts
// 滚动层
export { ScrollMapper, SAFE_MAX } from './scroll/ScrollMapper'
```

- [ ] **Step 9: Delete the old file**

```bash
rm packages/core/src/scroll/ScrollMapper.ts
rmdir packages/core/src/scroll 2>/dev/null  # remove empty dir if other files don't exist yet
```

- [ ] **Step 10: Run install + tests**

```bash
bun install
bun test
bun run --filter '*' typecheck
bun run --filter '*' build
```

Expected: 126 tests passing. typecheck clean. ScrollMapper.test.ts now runs from `packages/web/tests/`.

- [ ] **Step 11: Commit**

```bash
git add packages/core packages/web bunfig.toml bun.lock
git commit -m "refactor(scroll): move ScrollMapper + SAFE_MAX to @novasheet/web

The 6,000,000 px SAFE_MAX constant comes from Firefox/iOS Safari
element-height limits — a Web-platform constraint. Core stays
browser-agnostic. Test file follows. Adds @novasheet/web preload
to bunfig.toml.

Note: Grid.ts now imports ScrollMapper from @novasheet/web, creating
a transient core→web cycle. The cycle is resolved in Task 8 when
Grid is removed from core entirely."
```

---

### Task 4: Move `NativeScroller` from `@novasheet/core` to `@novasheet/web`

**Files:**

- Create: `packages/web/src/scroll/NativeScroller.ts` (moved from core)
- Modify: `packages/web/src/index.ts` (re-export)
- Delete: `packages/core/src/scroll/NativeScroller.ts`
- Move: `packages/core/tests/scroll/NativeScroller.test.ts` → `packages/web/tests/scroll/NativeScroller.test.ts`
- Move: `packages/core/tests/helpers/global-stub.ts` → `packages/web/tests/helpers/global-stub.ts`

`NativeScroller` depends on `FrameScheduler` from `@novasheet/core/src/util/raf.ts`. That stays in core (FrameScheduler is pure logic, no DOM). The import in NativeScroller becomes `from '@novasheet/core'`.

- [ ] **Step 1: Move NativeScroller source**

```bash
cp packages/core/src/scroll/NativeScroller.ts packages/web/src/scroll/NativeScroller.ts
```

Edit the moved `packages/web/src/scroll/NativeScroller.ts` import:

Find:

```ts
import type { FrameScheduler } from '../util/raf'
```

Replace with:

```ts
import type { FrameScheduler } from '@novasheet/core'
```

This requires `FrameScheduler` to be exported from `@novasheet/core`. Check `packages/core/src/index.ts`:

```bash
grep "FrameScheduler" packages/core/src/index.ts
```

If not exported, add to `packages/core/src/index.ts`:

```ts
// Utility — exported so @novasheet/web can share RAF scheduling
export { FrameScheduler, frameScheduler } from './util/raf'
```

- [ ] **Step 2: Update `packages/web/src/index.ts`**

Append:

```ts
export { NativeScroller } from './scroll/NativeScroller'
export type { ScrollListener } from './scroll/NativeScroller'
```

- [ ] **Step 3: Move test + helper files**

```bash
mkdir -p packages/web/tests/helpers
git mv packages/core/tests/scroll/NativeScroller.test.ts packages/web/tests/scroll/NativeScroller.test.ts
git mv packages/core/tests/helpers/global-stub.ts packages/web/tests/helpers/global-stub.ts
```

- [ ] **Step 4: Update test imports in `packages/web/tests/scroll/NativeScroller.test.ts`**

Find:

```ts
import { NativeScroller } from '../../src/scroll/NativeScroller'
import { FrameScheduler } from '../../src/util/raf'
```

Replace with:

```ts
import { NativeScroller } from '../../src/scroll/NativeScroller'
import { FrameScheduler } from '@novasheet/core'
```

(NativeScroller path is the same; FrameScheduler now comes from core package.)

- [ ] **Step 5: Check if other core tests still import global-stub**

```bash
grep -rln "global-stub" packages/core/tests/
```

If any remain (e.g. HighDPI.test.ts, raf.test.ts), they will move in Tasks 6 and below. For now, those test files still reference the (now non-existent) `packages/core/tests/helpers/global-stub.ts` — typecheck WILL fail.

**This task fixes that by ALSO updating those remaining imports to use the new location**:

```bash
# Find affected files
grep -rln "from.*helpers/global-stub" packages/core/tests/
```

Expected files: `packages/core/tests/render/HighDPI.test.ts`, `packages/core/tests/util/raf.test.ts`.

For each file, change:

```ts
import { stubGlobal, unstubAllGlobals } from '../helpers/global-stub'
```

To:

```ts
import { stubGlobal, unstubAllGlobals } from '@novasheet/web/tests/helpers/global-stub'
```

This is awkward (reaching into another package's test dir), but it's TRANSIENT — those tests move to their respective new packages in Tasks 6+. The right long-term solution (duplicating `global-stub.ts` in web-canvas2d) lands in Task 6.

Alternative if cross-package test imports are not allowed by TS resolution: temporarily keep a copy at `packages/core/tests/helpers/global-stub.ts` and delete it in the task that moves those tests. This is the safer option.

**Use the safer alternative**: keep a copy in core tests, mark as deprecated:

```bash
# Restore the core copy temporarily
cp packages/web/tests/helpers/global-stub.ts packages/core/tests/helpers/global-stub.ts
```

Add a note at the top of `packages/core/tests/helpers/global-stub.ts`:

```ts
// TEMPORARY duplicate — primary copy is in packages/web/tests/helpers/.
// This file is deleted when the tests in packages/core/tests/render/ and
// packages/core/tests/util/ move to their respective web/web-canvas2d homes
// (Tasks 6 and below).
```

- [ ] **Step 6: Delete the original NativeScroller source**

```bash
rm packages/core/src/scroll/NativeScroller.ts
rmdir packages/core/src/scroll 2>/dev/null
```

- [ ] **Step 7: Update `packages/core/src/Grid.ts` import**

Find:

```ts
import { NativeScroller } from './scroll/NativeScroller'
```

Replace with:

```ts
import { NativeScroller } from '@novasheet/web'
```

- [ ] **Step 8: Run install + tests**

```bash
bun install
bun test
bun run --filter '*' typecheck
bun run --filter '*' build
```

Expected: 126 tests passing.

- [ ] **Step 9: Commit**

```bash
git add packages/core packages/web bun.lock
git commit -m "refactor(scroll): move NativeScroller to @novasheet/web

NativeScroller and its tests + the global-stub helper move to
@novasheet/web. FrameScheduler stays in @novasheet/core (no DOM
dependency) and is now exported from core's public API so web
package can import it.

Temporary duplicate of global-stub.ts in packages/core/tests/helpers/
will be deleted in later tasks as HighDPI.test + raf.test relocate."
```

---

### Task 5: Move Canvas2D painters (`CellPainter`, `GridLinesPainter`, `HeaderPainter`) to `@novasheet/web-canvas2d`

**Files:**

- Create: `packages/web-canvas2d/src/painters/CellPainter.ts`
- Create: `packages/web-canvas2d/src/painters/GridLinesPainter.ts`
- Create: `packages/web-canvas2d/src/painters/HeaderPainter.ts`
- Modify: `packages/web-canvas2d/src/index.ts` (re-export, internal — may or may not be public)
- Delete: `packages/core/src/render/CellPainter.ts`
- Delete: `packages/core/src/render/GridLinesPainter.ts`
- Delete: `packages/core/src/render/HeaderPainter.ts`
- Move: `packages/core/tests/render/CellPainter.test.ts` → `packages/web-canvas2d/tests/painters/CellPainter.test.ts`
- Move: `packages/core/tests/render/GridLinesPainter.test.ts` → `packages/web-canvas2d/tests/painters/GridLinesPainter.test.ts`
- Move: `packages/core/tests/render/HeaderPainter.test.ts` → `packages/web-canvas2d/tests/painters/HeaderPainter.test.ts`
- Move: `packages/core/tests/helpers/recording-context.ts` → `packages/web-canvas2d/tests/helpers/recording-context.ts`
- Move: `packages/core/tests/helpers/recording-context.test.ts` → `packages/web-canvas2d/tests/helpers/recording-context.test.ts`
- Create: `packages/web-canvas2d/tests/helpers/global-stub.ts` (copy from web)
- Create: `packages/web-canvas2d/tests/setup.ts` (happy-dom + canvas stub)

Painters import from `@novasheet/core` for `Theme`, `Field`, `Schema`, `ChunkedAxis`, `Axis`, `QuadrantRect`. None depend on `@novasheet/web`.

- [ ] **Step 1: Move all three painters**

```bash
mkdir -p packages/web-canvas2d/src/painters
cp packages/core/src/render/CellPainter.ts packages/web-canvas2d/src/painters/CellPainter.ts
cp packages/core/src/render/GridLinesPainter.ts packages/web-canvas2d/src/painters/GridLinesPainter.ts
cp packages/core/src/render/HeaderPainter.ts packages/web-canvas2d/src/painters/HeaderPainter.ts
```

- [ ] **Step 2: Update painter imports**

For each of the three painter files in `packages/web-canvas2d/src/painters/`, update imports to use `@novasheet/core`:

Find patterns like:

```ts
import type { CellValue, Field } from '../data/Schema'
import type { QuadrantRect } from '../layout/FrozenRegions'
import type { Theme } from '../theme/Theme'
import type { ChunkedAxis } from '../layout/ChunkedAxis'
import type { Schema } from '../data/Schema'
```

Replace ALL with:

```ts
import type { CellValue, Field, QuadrantRect, Schema, Theme } from '@novasheet/core'
import type { Axis } from '@novasheet/core'
```

(Use `Axis` interface from Task 2 instead of `ChunkedAxis` concrete class — this is the right abstraction for painters per spec §5.)

Then in code where the painters typed `colsAxis: ChunkedAxis` or `rowsAxis: ChunkedAxis`, change to `Axis`.

For this to work, `@novasheet/core/src/index.ts` must export these types. Add:

```ts
// In packages/core/src/index.ts:
export type { QuadrantRect, Quadrant, Quadrants } from './layout/FrozenRegions'
export type { Axis, MutableAxis } from './layout/ChunkedAxis'
```

- [ ] **Step 3: Move RecordingContext + tests**

```bash
mkdir -p packages/web-canvas2d/tests/helpers
mkdir -p packages/web-canvas2d/tests/painters
git mv packages/core/tests/helpers/recording-context.ts packages/web-canvas2d/tests/helpers/recording-context.ts
git mv packages/core/tests/helpers/recording-context.test.ts packages/web-canvas2d/tests/helpers/recording-context.test.ts
git mv packages/core/tests/render/CellPainter.test.ts packages/web-canvas2d/tests/painters/CellPainter.test.ts
git mv packages/core/tests/render/GridLinesPainter.test.ts packages/web-canvas2d/tests/painters/GridLinesPainter.test.ts
git mv packages/core/tests/render/HeaderPainter.test.ts packages/web-canvas2d/tests/painters/HeaderPainter.test.ts
```

- [ ] **Step 4: Update test file imports**

For `packages/web-canvas2d/tests/painters/CellPainter.test.ts`:

- `import { CellPainter } from '../../src/render/CellPainter'` → `import { CellPainter } from '../../src/painters/CellPainter'`
- `import { ChunkedAxis } from '../../src/layout/ChunkedAxis'` → `import { ChunkedAxis } from '@novasheet/core'`
- `import { denseGridTheme } from '../../src/theme/denseGridTheme'` → `import { denseGridTheme } from '@novasheet/core'`
- `import type { Field } from '../../src/data/Schema'` → `import type { Field } from '@novasheet/core'`
- `import { createRecordingContext } from '../helpers/recording-context'` → keep as-is (now resolves to `packages/web-canvas2d/tests/helpers/`)

Same pattern for the other two painter tests and `recording-context.test.ts`.

For `recording-context.test.ts`, just update the import to point to the new path:

- `import { createRecordingContext } from './recording-context'` → keep (same directory).

- [ ] **Step 5: Make sure `ChunkedAxis` is exported from `@novasheet/core`**

In `packages/core/src/index.ts`, add if missing:

```ts
export { ChunkedAxis, CHUNK_SIZE } from './layout/ChunkedAxis'
```

- [ ] **Step 6: Create `packages/web-canvas2d/tests/setup.ts`**

```ts
/**
 * Test environment bootstrap for @novasheet/web-canvas2d tests.
 *
 * Steps:
 *   1. Register happy-dom globally — installs HTMLCanvasElement etc.
 *   2. Stub HTMLCanvasElement.prototype.getContext('2d') to return our
 *      RecordingContext2D — happy-dom doesn't implement Canvas 2D.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register()

const { createRecordingContext } = await import('./helpers/recording-context')

HTMLCanvasElement.prototype.getContext = function getContext(
  this: HTMLCanvasElement,
  type: string,
) {
  if (type !== '2d') return null
  return createRecordingContext(this.width || 800, this.height || 600).ctx as never
} as never
```

- [ ] **Step 7: Copy global-stub.ts to web-canvas2d tests**

```bash
cp packages/web/tests/helpers/global-stub.ts packages/web-canvas2d/tests/helpers/global-stub.ts
```

This duplicates a tiny file but keeps packages independent (no cross-package test imports).

- [ ] **Step 8: Update root `bunfig.toml` to include web-canvas2d preload**

```toml
[test]
preload = [
  "./packages/core/tests/setup.ts",
  "./packages/web/tests/setup.ts",
  "./packages/web-canvas2d/tests/setup.ts",
]
```

- [ ] **Step 9: Update `packages/core/src/render/Renderer.ts` painter imports**

The Renderer (still in core for now — moves in Task 6) needs to import from the new location:

```ts
import { CellPainter } from '@novasheet/web-canvas2d'
import { GridLinesPainter } from '@novasheet/web-canvas2d'
import { HeaderPainter } from '@novasheet/web-canvas2d'
```

Add temporary exports to `packages/web-canvas2d/src/index.ts`:

```ts
// Internal exports — only used by the (transient) core/Renderer import path.
// Removed in Task 6 when Renderer itself moves into this package.
export { CellPainter } from './painters/CellPainter'
export { GridLinesPainter } from './painters/GridLinesPainter'
export { HeaderPainter } from './painters/HeaderPainter'
```

And add to core's `dependencies`:

```json
"dependencies": {
  "@novasheet/web": "workspace:*",
  "@novasheet/web-canvas2d": "workspace:*"
}
```

Yes — core temporarily depends on BOTH web and web-canvas2d. This is fine because Task 6 removes Renderer.ts from core, breaking the cycle.

- [ ] **Step 10: Delete old painter files in core**

```bash
rm packages/core/src/render/CellPainter.ts
rm packages/core/src/render/GridLinesPainter.ts
rm packages/core/src/render/HeaderPainter.ts
```

- [ ] **Step 11: Run install + tests**

```bash
bun install
bun test
bun run --filter '*' typecheck
bun run --filter '*' build
```

Expected: 126 tests passing.

- [ ] **Step 12: Commit**

```bash
git add packages/core packages/web-canvas2d bunfig.toml bun.lock
git commit -m "refactor(painters): move Cell/GridLines/Header painters + RecordingContext to @novasheet/web-canvas2d

Painters depend on theme/data types (still in core) and on the canvas
2D context (web-canvas2d). They have no DOM lifecycle, so they live
with the Canvas2D-specific package. Updated painter type imports to
use Axis interface (Task 2) instead of ChunkedAxis concrete class.

Test helpers also move: RecordingContext + its test. global-stub
duplicated to web-canvas2d/tests/helpers for package independence.

Temporary: core/Renderer still imports painters via @novasheet/web-canvas2d
re-export. Resolved in Task 6 when Renderer moves."
```

---

### Task 6: Move `Renderer` (renamed `Canvas2DRenderer`) + `HighDPI` to `@novasheet/web-canvas2d`

**Files:**

- Create: `packages/web-canvas2d/src/render/Canvas2DRenderer.ts` (moved from `packages/core/src/render/Renderer.ts`, renamed)
- Create: `packages/web-canvas2d/src/surface/HighDPI.ts` (moved from `packages/core/src/render/HighDPI.ts`)
- Delete: `packages/core/src/render/Renderer.ts`
- Delete: `packages/core/src/render/HighDPI.ts`
- Delete: `packages/core/src/render/` directory (now empty)
- Move: `packages/core/tests/render/Renderer.test.ts` → `packages/web-canvas2d/tests/render/Canvas2DRenderer.test.ts`
- Move: `packages/core/tests/render/HighDPI.test.ts` → `packages/web-canvas2d/tests/render/HighDPI.test.ts`
- Modify: `packages/core/src/Grid.ts` (import Canvas2DRenderer + HighDPI from `@novasheet/web-canvas2d`)
- Modify: `packages/web-canvas2d/src/index.ts` (export Canvas2DRenderer; remove transient painter exports — Renderer now uses them internally)

- [ ] **Step 1: Move Renderer.ts as Canvas2DRenderer.ts**

```bash
mkdir -p packages/web-canvas2d/src/render
cp packages/core/src/render/Renderer.ts packages/web-canvas2d/src/render/Canvas2DRenderer.ts
```

Edit `packages/web-canvas2d/src/render/Canvas2DRenderer.ts`:

1. Rename the class: `export class Renderer` → `export class Canvas2DRenderer`
2. Rename `RENDERER_KEY` to keep it — no change needed, it's internal.
3. Update imports:

```ts
import type { DataSource, Theme, Quadrant, Axis, Viewport } from '@novasheet/core'
import { FrameScheduler } from '@novasheet/core'
import { CellPainter } from '../painters/CellPainter'
import { GridLinesPainter } from '../painters/GridLinesPainter'
import { HeaderPainter } from '../painters/HeaderPainter'
```

(Drop the painter imports from `'./CellPainter'` etc; they're in the same package now.)

- [ ] **Step 2: Update `RendererOptions` type name**

Rename `export interface RendererOptions` → `export interface Canvas2DRendererOptions`.

- [ ] **Step 3: Move HighDPI.ts**

```bash
mkdir -p packages/web-canvas2d/src/surface
cp packages/core/src/render/HighDPI.ts packages/web-canvas2d/src/surface/HighDPI.ts
```

No content change.

- [ ] **Step 4: Move test files**

```bash
mkdir -p packages/web-canvas2d/tests/render
git mv packages/core/tests/render/Renderer.test.ts packages/web-canvas2d/tests/render/Canvas2DRenderer.test.ts
git mv packages/core/tests/render/HighDPI.test.ts packages/web-canvas2d/tests/render/HighDPI.test.ts
```

- [ ] **Step 5: Update test imports**

In `packages/web-canvas2d/tests/render/Canvas2DRenderer.test.ts`:

- `import { Renderer } from '../../src/render/Renderer'` → `import { Canvas2DRenderer } from '../../src/render/Canvas2DRenderer'`
- All other `from '../../src/...'` imports for layout/data/theme → `from '@novasheet/core'`
- Replace all references to `Renderer` (class name) with `Canvas2DRenderer`
- `import { createRecordingContext } from '../helpers/recording-context'` — same path, still works

In `packages/web-canvas2d/tests/render/HighDPI.test.ts`:

- `import { HighDPI } from '../../src/render/HighDPI'` → `import { HighDPI } from '../../src/surface/HighDPI'`
- `import { createRecordingContext } from '../helpers/recording-context'` — same path
- Uses `stubGlobal` from `'../helpers/global-stub'` — same path (now resolves to web-canvas2d copy)

- [ ] **Step 6: Update `packages/web-canvas2d/src/index.ts`**

Replace the transient painter exports with the renderer export:

```ts
// @novasheet/web-canvas2d — Canvas2D-specific renderer for NovaSheet grid.
// Public surface: Grid (added in Task 10).
// Internal surface: Canvas2DRenderer, HighDPI — exported for the transient
// core/Grid.ts consumer; will be made internal in Task 10 when public Grid lands.

export { Canvas2DRenderer } from './render/Canvas2DRenderer'
export type { Canvas2DRendererOptions } from './render/Canvas2DRenderer'
export { HighDPI } from './surface/HighDPI'
```

(Drop the painter re-exports — they're no longer needed externally; Renderer uses them internally.)

- [ ] **Step 7: Update `packages/core/src/Grid.ts`**

Find:

```ts
import { Renderer } from './render/Renderer'
import { HighDPI } from './render/HighDPI'
```

Replace with:

```ts
import { Canvas2DRenderer as Renderer, HighDPI } from '@novasheet/web-canvas2d'
```

(Alias `Canvas2DRenderer as Renderer` keeps the rest of Grid.ts unchanged for now. Grid.ts will be split in Task 8.)

- [ ] **Step 8: Delete old files**

```bash
rm packages/core/src/render/Renderer.ts
rm packages/core/src/render/HighDPI.ts
rmdir packages/core/src/render
```

- [ ] **Step 9: Run install + tests**

```bash
bun install
bun test
bun run --filter '*' typecheck
bun run --filter '*' build
```

Expected: 126 tests passing.

- [ ] **Step 10: Commit**

```bash
git add packages/core packages/web-canvas2d bun.lock
git commit -m "refactor(render): move Renderer→Canvas2DRenderer + HighDPI to @novasheet/web-canvas2d

Renderer is now Canvas2DRenderer in @novasheet/web-canvas2d/src/render/.
HighDPI moves to packages/web-canvas2d/src/surface/ (Canvas2D-specific
DPR/bitmap setup). Both depend on web-canvas2d painters internally.

Tests move with implementations. Cross-package imports between core test
helpers no longer needed — recording-context lives in web-canvas2d.

core/Grid.ts still exists as the public web facade, but now imports
Canvas2DRenderer from @novasheet/web-canvas2d. Grid.ts split into
engine + runtime + facade happens in Task 8 + 9."
```

---

### Task 7: Move `WebRenderer` interface to `@novasheet/web`

**Files:**

- Create: `packages/web/src/render/WebRenderer.ts`
- Modify: `packages/web/src/index.ts` (re-export)
- Modify: `packages/web-canvas2d/src/render/Canvas2DRenderer.ts` (implement WebRenderer)

This is additive — just declaring the interface that Canvas2DRenderer already satisfies.

- [ ] **Step 1: Create `packages/web/src/render/WebRenderer.ts`**

```ts
/**
 * WebRenderer — shared contract for all web-platform renderers (Canvas2D,
 * WebGL, WebGPU). Implementations live in their own packages
 * (e.g. @novasheet/web-canvas2d, future @novasheet/web-webgl).
 *
 * The renderer owns its drawing surface (canvas element, GL context, etc.)
 * and consumes RenderFrame snapshots from the engine. It does NOT own the
 * DOM scroll host or layout state — those are WebHost and GridEngine.
 */

import type { RenderFrame } from '@novasheet/core'

export interface WebRenderer {
  /** Attach the renderer's drawing surface (canvas etc.) into container. */
  mount(container: HTMLElement): void
  /** Resize the drawing surface to (width × height) CSS px at given DPR. */
  resize(width: number, height: number, dpr: number): void
  /** Render one frame. Synchronous; consumers schedule via FrameScheduler. */
  render(frame: RenderFrame): void
  /** Detach drawing surface, clean up GL contexts / event listeners etc. */
  destroy(): void
}
```

This depends on `RenderFrame` from `@novasheet/core` — which doesn't exist yet. Create it in the next step.

- [ ] **Step 2: Create `packages/core/src/render/RenderFrame.ts`**

```ts
/**
 * RenderFrame — engine state snapshot consumed by web renderers (Canvas2D,
 * WebGL, ...). NOT a renderer-agnostic command stream — each renderer still
 * iterates visible cells and translates to its own draw primitives. The
 * snapshot just removes DOM/Canvas dependencies from core (spec §5).
 */

import type { DataSource } from '../data/DataSource'
import type { Theme } from '../theme/Theme'
import type { Axis } from '../layout/ChunkedAxis'
import type { ViewportSnapshot } from '../layout/Viewport'

export interface RenderFrame {
  data: DataSource
  theme: Theme
  rowsAxis: Axis
  colsAxis: Axis
  viewport: ViewportSnapshot
}
```

- [ ] **Step 3: Export `RenderFrame` from `@novasheet/core`**

In `packages/core/src/index.ts`, add:

```ts
export type { RenderFrame } from './render/RenderFrame'
```

(Note: the existing `packages/core/src/render/` directory was deleted in Task 6. We're recreating it for this interface-only file.)

```bash
mkdir -p packages/core/src/render
# (file already created in Step 2)
```

- [ ] **Step 4: Export `WebRenderer` from `@novasheet/web`**

In `packages/web/src/index.ts`:

```ts
export type { WebRenderer } from './render/WebRenderer'
```

- [ ] **Step 5: Make `Canvas2DRenderer` formally implement `WebRenderer`**

In `packages/web-canvas2d/src/render/Canvas2DRenderer.ts`:

Add import:

```ts
import type { WebRenderer } from '@novasheet/web'
import type { RenderFrame } from '@novasheet/core'
```

Change class declaration:

```ts
export class Canvas2DRenderer implements WebRenderer {
  ...
}
```

Add the three methods that satisfy `WebRenderer` (alongside existing methods). Implement them as thin wrappers around existing logic:

```ts
mount(container: HTMLElement): void {
  // Renderer is currently constructed with ctx already bound; this method
  // is the future-facing entry. For the M2.x compatibility, we leave the
  // constructor-bound path AND add this declarative mount. Implementation
  // pending Task 9 where Canvas2DRenderer's lifecycle moves into mount/destroy.
  // For now, mount is a no-op (constructor handles attachment).
  void container
}

resize(width: number, height: number, dpr: number): void {
  // Defer to HighDPI which already does this.
  // (HighDPI is constructed in current Renderer constructor; will be
  // pulled here in Task 9 when ownership shifts.)
  void width
  void height
  void dpr
}

render(frame: RenderFrame): void {
  // Adapter for the future RenderFrame consumer path. Current paint() takes
  // no args and reads from viewport directly. After Task 9 the engine will
  // pass a frame here; for now it's an alias for paint().
  void frame
  this.paint()
}

// destroy() already exists as a method — no change needed.
```

This is a deliberate transition: the class implements the interface NOW (so the contract is locked) but the actual `render(frame)` flow only takes effect in Task 9 when WebGridRuntime starts passing frames.

- [ ] **Step 6: Tests still pass**

```bash
bun test
bun run --filter '*' typecheck
bun run --filter '*' build
```

Expected: 126 passing. (No test changes — Canvas2DRenderer behavior unchanged, just an additional formal interface.)

- [ ] **Step 7: Commit**

```bash
git add packages/core packages/web packages/web-canvas2d bun.lock
git commit -m "feat: introduce WebRenderer interface + RenderFrame engine snapshot

WebRenderer in @novasheet/web is the shared contract for all web-platform
renderers (Canvas2D, future WebGL, WebGPU). RenderFrame in @novasheet/core
is the engine state snapshot the renderers consume.

Canvas2DRenderer now formally implements WebRenderer. mount/resize/render
methods are stubs that delegate to existing constructor-based paths;
they become load-bearing in Task 9 when WebGridRuntime drives the renderer."
```

---

### Task 8: Extract `DefaultGridEngine` from `packages/core/src/Grid.ts`

**Files:**

- Create: `packages/core/src/engine/GridEngine.ts` (interface)
- Create: `packages/core/src/engine/DefaultGridEngine.ts` (extracted from Grid.ts)
- Modify: `packages/core/src/Grid.ts` (delegates to DefaultGridEngine for engine state)
- Create: `packages/core/tests/engine/DefaultGridEngine.test.ts` (extracted assertions from Grid.test.ts that are engine-only)

This is the largest task. It's where the conceptual split lands. Grid.ts becomes a thin wrapper that holds the engine + DOM concerns; Task 9 + 10 finish the split by moving DOM concerns to web/web-canvas2d.

- [ ] **Step 1: Create `packages/core/src/engine/GridEngine.ts`**

```ts
/**
 * GridEngine — platform-independent state coordinator (spec §5).
 *
 * Owns: DataSource, Theme, row/col axes, FrozenRegions, Viewport, logical
 * scroll state, row/column size mutations.
 *
 * Does NOT own: DOM, canvas, browser scroll events, ResizeObserver, DPR.
 * Those are WebHost / WebRenderer responsibilities.
 */

import type { DataSource } from '../data/DataSource'
import type { Theme } from '../theme/Theme'
import type { RenderFrame } from '../render/RenderFrame'

export interface GridEngineOptions {
  data: DataSource
  theme?: Theme
  frozenRows?: number
  frozenCols?: number
  defaultRowHeight?: number
}

export interface GridEngine {
  setData(data: DataSource): void
  setTheme(theme: Theme): void
  setFrozen(rows: number, cols: number): void
  setViewportSize(width: number, height: number): void
  setHeaderHeight(headerHeight: number): void
  setScroll(logicalX: number, logicalY: number): void
  setRowHeight(rowIndex: number, height: number): void
  setColumnWidth(fieldId: string, width: number): void
  /** Get the current state snapshot for rendering. */
  getFrame(): RenderFrame
  /** Get the row content total in CSS px (used by scroll mapper consumers). */
  getRowsTotalSize(): number
  /** Get the column content total in CSS px. */
  getColsTotalSize(): number
  /** Resolve a fieldId to its visible column index, or -1. */
  getColumnIndex(fieldId: string): number
  /** Read the current theme (immutable). */
  getTheme(): Theme
  /** Read the row axis. */
  getRowsAxis(): import('../layout/ChunkedAxis').Axis
  /** Read the col axis. */
  getColsAxis(): import('../layout/ChunkedAxis').Axis
}
```

- [ ] **Step 2: Create `packages/core/src/engine/DefaultGridEngine.ts`**

Extract from current `packages/core/src/Grid.ts` the non-DOM parts. Specifically the fields:

- `data, theme, explicitDefaultRowHeight, rowsAxis, colsAxis, frozen, viewport, scrollMapper`

And the methods (sans DOM):

- `setData, setTheme, setRowHeight, setColumnWidth, setFrozen, resolveDefaultRowHeight, averageColWidth, applyFieldWidths`

Plus new methods to satisfy `GridEngine`:

- `setViewportSize` (delegates to viewport.setSize)
- `setHeaderHeight` (delegates to viewport.setHeaderHeight)
- `setScroll` (delegates to viewport.setScroll)
- `getFrame` (returns `{ data, theme, rowsAxis, colsAxis, viewport: viewport.snapshot() }`)
- `getRowsTotalSize / getColsTotalSize / getColumnIndex / getTheme / getRowsAxis / getColsAxis`

NO DOM. NO Renderer. NO HighDPI. NO ScrollMapper (that's in web now).

Reference implementation skeleton:

```ts
import type { DataSource } from '../data/DataSource'
import type { Theme } from '../theme/Theme'
import { ChunkedAxis, type Axis } from '../layout/ChunkedAxis'
import { FrozenRegions } from '../layout/FrozenRegions'
import { Viewport } from '../layout/Viewport'
import { denseGridTheme } from '../theme/denseGridTheme'
import type { GridEngine, GridEngineOptions } from './GridEngine'
import type { RenderFrame } from '../render/RenderFrame'

export class DefaultGridEngine implements GridEngine {
  private data: DataSource
  private theme: Theme
  private explicitDefaultRowHeight: number | undefined
  private rowsAxis: ChunkedAxis
  private colsAxis: ChunkedAxis
  private frozen: FrozenRegions
  private viewport: Viewport

  constructor(options: GridEngineOptions) {
    this.data = options.data
    this.theme = options.theme ?? denseGridTheme
    this.explicitDefaultRowHeight = options.defaultRowHeight
    this.rowsAxis = new ChunkedAxis({
      count: this.data.getRowCount(),
      defaultSize: this.resolveDefaultRowHeight(),
    })
    this.colsAxis = new ChunkedAxis({
      count: this.data.getSchema().fields.length,
      defaultSize: this.averageColWidth(),
    })
    this.frozen = new FrozenRegions(
      this.rowsAxis,
      this.colsAxis,
      options.frozenRows ?? 0,
      options.frozenCols ?? 0,
    )
    this.viewport = new Viewport(this.rowsAxis, this.colsAxis, this.frozen)
    this.viewport.setHeaderHeight(this.theme.metrics.headerHeight)
    this.applyFieldWidths()
  }

  setData(data: DataSource): void {
    this.data = data
    this.rowsAxis = new ChunkedAxis({
      count: this.data.getRowCount(),
      defaultSize: this.resolveDefaultRowHeight(),
    })
    this.colsAxis = new ChunkedAxis({
      count: this.data.getSchema().fields.length,
      defaultSize: this.averageColWidth(),
    })
    this.frozen = new FrozenRegions(
      this.rowsAxis,
      this.colsAxis,
      this.frozen.frozenRows,
      this.frozen.frozenCols,
    )
    this.viewport = new Viewport(this.rowsAxis, this.colsAxis, this.frozen)
    this.viewport.setHeaderHeight(this.theme.metrics.headerHeight)
    this.applyFieldWidths()
  }

  setTheme(theme: Theme): void {
    this.theme = theme
    this.viewport.setHeaderHeight(theme.metrics.headerHeight)
    if (this.explicitDefaultRowHeight === undefined) {
      this.rowsAxis.setDefaultSize(theme.metrics.rowHeight)
    }
  }

  setFrozen(rows: number, cols: number): void {
    this.frozen.setFrozen(rows, cols)
  }

  setViewportSize(width: number, height: number): void {
    this.viewport.setSize(width, height)
  }

  setHeaderHeight(headerHeight: number): void {
    this.viewport.setHeaderHeight(headerHeight)
  }

  setScroll(logicalX: number, logicalY: number): void {
    this.viewport.setScroll(logicalX, logicalY)
  }

  setRowHeight(rowIndex: number, height: number): void {
    this.rowsAxis.setSize(rowIndex, height)
  }

  setColumnWidth(fieldId: string, width: number): void {
    const index = this.getColumnIndex(fieldId)
    if (index < 0) return
    this.colsAxis.setSize(index, width)
  }

  getFrame(): RenderFrame {
    return {
      data: this.data,
      theme: this.theme,
      rowsAxis: this.rowsAxis,
      colsAxis: this.colsAxis,
      viewport: this.viewport.snapshot(),
    }
  }

  getRowsTotalSize(): number {
    return this.rowsAxis.getTotalSize()
  }
  getColsTotalSize(): number {
    return this.colsAxis.getTotalSize()
  }
  getColumnIndex(fieldId: string): number {
    return this.data.getSchema().fields.findIndex((f) => f.id === fieldId)
  }
  getTheme(): Theme {
    return this.theme
  }
  getRowsAxis(): Axis {
    return this.rowsAxis
  }
  getColsAxis(): Axis {
    return this.colsAxis
  }

  private resolveDefaultRowHeight(): number {
    return this.explicitDefaultRowHeight ?? this.theme.metrics.rowHeight
  }

  private averageColWidth(): number {
    const fields = this.data.getSchema().fields
    if (fields.length === 0) return 100
    const sum = fields.reduce((acc, f) => acc + f.width, 0)
    return Math.max(1, Math.round(sum / fields.length))
  }

  private applyFieldWidths(): void {
    const fields = this.data.getSchema().fields
    const avg = this.colsAxis.getDefaultSize()
    for (let i = 0; i < fields.length; i++) {
      if (fields[i]!.width !== avg) {
        this.colsAxis.setSize(i, fields[i]!.width)
      }
    }
  }
}
```

- [ ] **Step 3: Export from core**

In `packages/core/src/index.ts`:

```ts
export { DefaultGridEngine } from './engine/DefaultGridEngine'
export type { GridEngine, GridEngineOptions } from './engine/GridEngine'
```

- [ ] **Step 4: Refactor `packages/core/src/Grid.ts` to delegate to DefaultGridEngine**

Replace the engine-state fields and methods in Grid.ts with delegation to a held `engine: DefaultGridEngine`. The DOM/scroll/renderer parts stay in Grid for now (they move in Task 9 + 10).

Pattern:

```ts
class Grid {
  private engine: DefaultGridEngine
  // ... DOM fields stay: container, canvas, scrollHost, scrollSpacer, scrollMapper, nativeScroller, renderer, highDpi, resizeObserver, originalPosition, destroyed, scheduler

  constructor(container: HTMLElement, options: GridOptions) {
    this.container = container
    this.engine = new DefaultGridEngine({
      data: options.data,
      theme: options.theme,
      frozenRows: options.frozenRows,
      frozenCols: options.frozenCols,
      defaultRowHeight: options.defaultRowHeight,
    })
    // ... existing DOM/scroll/renderer setup, but read engine state via engine.getXxx()
  }

  setData(data: DataSource): void {
    this.engine.setData(data)
    // re-create renderer (since axes recreated)
    // ... existing renderer recreation logic
    this.resizeSpacer()
    this.remapScroll()
    this.invalidate()
  }

  setTheme(theme: Theme): void {
    this.engine.setTheme(theme)
    this.renderer.setTheme(theme)
    this.resizeSpacer()
    this.remapScroll()
    this.invalidate()
  }

  setRowHeight(rowIndex: number, height: number): void {
    this.engine.setRowHeight(rowIndex, height)
    this.resizeSpacer()
    this.remapScroll()
    this.invalidate()
  }

  setColumnWidth(fieldId: string, width: number): void {
    this.engine.setColumnWidth(fieldId, width)
    this.resizeSpacer()
    this.remapScroll()
    this.invalidate()
  }

  // scrollToRow/Cell + DOM lifecycle + destroy stay in Grid
}
```

This is a careful refactor — preserve every existing test's behavior. Read all 17 Grid.test.ts cases first; ensure each still passes.

- [ ] **Step 5: Create `packages/core/tests/engine/DefaultGridEngine.test.ts`**

Extract from `packages/core/tests/Grid.test.ts` the assertions that test ENGINE STATE (not DOM). Specifically:

- `setData` updates row count
- `setTheme` propagates headerHeight
- `setRowHeight` updates axis
- `setColumnWidth` updates axis
- `getFrame` returns expected shape

Don't move tests that touch DOM (those stay in `Grid.test.ts` until Task 10 when they move to web-canvas2d).

Template:

```ts
import { describe, expect, it } from 'bun:test'
import { DefaultGridEngine, InMemoryDataSource, denseGridTheme, type Schema } from '../../src'

const SCHEMA: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 200 },
    { id: 'age', name: 'Age', type: 'number', width: 80 },
  ],
}

function makeData(rows = 10) {
  return new InMemoryDataSource({
    schema: SCHEMA,
    rows: Array.from({ length: rows }, (_, i) => ({ name: `n${i}`, age: i })),
  })
}

describe('DefaultGridEngine', () => {
  it('initializes with default theme + schema-driven column widths', () => {
    const engine = new DefaultGridEngine({ data: makeData(5) })
    expect(engine.getRowsAxis().getCount()).toBe(5)
    expect(engine.getColsAxis().getCount()).toBe(2)
    expect(engine.getTheme()).toBe(denseGridTheme)
  })

  it('setData rebuilds axes', () => {
    const engine = new DefaultGridEngine({ data: makeData(5) })
    engine.setData(makeData(100))
    expect(engine.getRowsAxis().getCount()).toBe(100)
  })

  it('setRowHeight updates the axis', () => {
    const engine = new DefaultGridEngine({ data: makeData(10) })
    const before = engine.getRowsAxis().getSize(3)
    engine.setRowHeight(3, before * 2)
    expect(engine.getRowsAxis().getSize(3)).toBe(before * 2)
  })

  it('setColumnWidth updates the axis by fieldId', () => {
    const engine = new DefaultGridEngine({ data: makeData(10) })
    engine.setColumnWidth('age', 250)
    expect(engine.getColsAxis().getSize(1)).toBe(250)
  })

  it('setColumnWidth on unknown fieldId is a no-op', () => {
    const engine = new DefaultGridEngine({ data: makeData(10) })
    expect(() => engine.setColumnWidth('nope', 250)).not.toThrow()
  })

  it('getFrame returns the engine snapshot', () => {
    const engine = new DefaultGridEngine({ data: makeData(10) })
    engine.setViewportSize(400, 300)
    const frame = engine.getFrame()
    expect(frame.data.getRowCount()).toBe(10)
    expect(frame.theme).toBe(denseGridTheme)
    expect(frame.rowsAxis.getCount()).toBe(10)
    expect(frame.viewport.contentRect.width).toBe(400)
  })
})
```

- [ ] **Step 6: Run all tests**

```bash
bun test
bun run --filter '*' typecheck
bun run --filter '*' build
```

Expected: 126 prior + 6 new engine tests = 132 tests passing.

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "refactor(engine): extract DefaultGridEngine from Grid.ts

Engine state (DataSource, Theme, axes, FrozenRegions, Viewport, logical
scroll) moves to DefaultGridEngine in @novasheet/core/engine/. Grid.ts
becomes a thin facade that delegates engine ops to the engine and keeps
only DOM/scroll/renderer concerns (those move to web/web-canvas2d in
Task 9 + 10).

GridEngine interface gives downstream code (WebGridRuntime, future
non-web hosts) a stable contract independent of the engine implementation.

Adds packages/core/tests/engine/DefaultGridEngine.test.ts with 6 unit
tests for the extracted engine — covers init, setData/setTheme/
setRowHeight/setColumnWidth, getFrame. Existing 126 Grid tests still
pass via the delegation layer."
```

---

### Task 9: Move scroll/host/runtime out of `core/Grid.ts` into `@novasheet/web`

> **NOTE TO IMPLEMENTER**: This is the largest task in the plan. If it feels too big for one
> commit, split into **Task 9a (DomGridHost only)** and **Task 9b (WebGridRuntime only)** —
> each ending green. The order matters: DomGridHost first (so its tests pass), then
> WebGridRuntime which depends on DomGridHost type. The plan body below describes the
> full work; split it at Step 3 if needed.

**Files:**

- Create: `packages/web/src/host/WebHost.ts` (interface)
- Create: `packages/web/src/host/DomGridHost.ts` (the scrollHost/spacer/canvas-bearing host)
- Create: `packages/web/src/runtime/WebGridRuntime.ts` (orchestrator)
- Modify: `packages/web/src/index.ts` (re-export host + runtime)
- Modify: `packages/core/src/Grid.ts` (DOM/scroll concerns deleted; becomes a near-empty pass-through OR removed entirely if web-canvas2d takes over)
- Move: parts of `packages/core/tests/Grid.test.ts` → `packages/web/tests/runtime/WebGridRuntime.test.ts`

This task does the bulk of the DOM extraction.

- [ ] **Step 1: Define `WebHost` interface**

Create `packages/web/src/host/WebHost.ts` with the contracts from spec §6 (with the C3 fix applied: callbacks for onScroll/onResize/onDprChange, container ownership clarified).

(Full content per spec §6 — paste verbatim.)

- [ ] **Step 2: Implement `DomGridHost`**

Create `packages/web/src/host/DomGridHost.ts`. Extract from current `Grid.ts`:

- DOM creation (scrollHost, scrollSpacer, canvas appendChild)
- ResizeObserver wiring
- DPR watcher (`matchMedia` self-re-registering)
- Container style management (originalPosition save/restore)
- Native scroll listener attach/detach

It owns scrollHost + scrollSpacer; canvas is owned by the renderer. Constructor takes `WebHostOptions`.

Skeleton:

```ts
import type { WebHost, WebHostOptions } from './WebHost'

export class DomGridHost implements WebHost {
  private container: HTMLElement
  private onScroll: WebHostOptions['onScroll']
  private onResize: WebHostOptions['onResize']
  private onDprChange?: WebHostOptions['onDprChange']
  private scrollHost!: HTMLDivElement
  private scrollSpacer!: HTMLDivElement
  private resizeObserver: ResizeObserver | null = null
  private originalPosition = ''
  private destroyed = false
  private currentDpr = 1

  constructor(options: WebHostOptions) {
    this.container = options.container
    this.onScroll = options.onScroll
    this.onResize = options.onResize
    this.onDprChange = options.onDprChange
  }

  attach(): void {
    // ... extract from current Grid constructor
  }

  setScrollSize(width: number, height: number): void {
    this.scrollSpacer.style.width = `${width}px`
    this.scrollSpacer.style.height = `${height}px`
  }

  scrollTo(scrollTop: number, scrollLeft: number): void {
    this.scrollHost.scrollTo({ top: scrollTop, left: scrollLeft })
  }

  getDpr(): number {
    return this.currentDpr
  }
  getContainerSize(): { width: number; height: number } {
    return {
      width: this.container.clientWidth || this.container.getBoundingClientRect().width || 400,
      height: this.container.clientHeight || this.container.getBoundingClientRect().height || 300,
    }
  }

  destroy(): void {
    // ... extract from current Grid destroy
  }

  // ... private DPR watcher, scroll handler setup
}
```

(The full implementation is too long for the plan. The implementer should treat this as a behavior-preserving extraction: move blocks of code from Grid.ts to DomGridHost.ts, keeping logic identical. Run tests after each block move.)

- [ ] **Step 3: Implement `WebGridRuntime`**

Create `packages/web/src/runtime/WebGridRuntime.ts`. The orchestrator wires:

- `GridEngine` (state)
- `WebHost` (DOM lifecycle)
- `WebRenderer` (drawing)
- `ScrollMapper` (logical ↔ DOM scroll)
- `FrameScheduler` (RAF)

Plus the public methods `refresh / scrollToRow / scrollToCell / destroy`.

Skeleton:

```ts
import type { GridEngine } from '@novasheet/core'
import { FrameScheduler } from '@novasheet/core'
import type { WebHost } from '../host/WebHost'
import type { WebRenderer } from '../render/WebRenderer'
import { ScrollMapper } from '../scroll/ScrollMapper'

export interface WebGridRuntimeOptions {
  engine: GridEngine
  host: WebHost
  renderer: WebRenderer
  scheduler?: FrameScheduler
}

export class WebGridRuntime {
  private engine: GridEngine
  private host: WebHost
  private renderer: WebRenderer
  private scheduler: FrameScheduler
  private scrollMapper: ScrollMapper
  private destroyed = false

  constructor(opts: WebGridRuntimeOptions) {
    this.engine = opts.engine
    this.host = opts.host
    this.renderer = opts.renderer
    this.scheduler = opts.scheduler ?? new FrameScheduler()
    this.scrollMapper = new ScrollMapper()
  }

  attach(): void {
    this.host.attach()
    // Initial sync
    const { width, height } = this.host.getContainerSize()
    this.engine.setViewportSize(width, height)
    this.renderer.resize(width, height, this.host.getDpr())
    this.resizeSpacer()
    this.invalidate()
  }

  refresh(): void {
    this.invalidate()
  }

  scrollToRow(rowIndex: number, align: 'start' | 'center' | 'end' = 'start'): void {
    // ... lifted from current Grid.scrollToRow
  }

  scrollToCell(rowIndex: number, fieldId: string): void {
    // ... lifted from current Grid.scrollToCell
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.scheduler.cancel('renderer:flush')
    this.renderer.destroy()
    this.host.destroy()
  }

  private invalidate(): void {
    if (this.destroyed) return
    this.scheduler.schedule('renderer:flush', () => {
      const frame = this.engine.getFrame()
      this.renderer.render(frame)
    })
  }

  private resizeSpacer(): void {
    /* ... lifted */
  }
  private remapScroll(): void {
    /* ... lifted */
  }

  // Public handlers wired by Grid facade as DomGridHost callbacks.
  // These exist so the public Grid can construct the host BEFORE the runtime
  // (host needs callbacks at construction; runtime needs the host reference).
  // After construction, Grid calls runtime.attach() which begins listening.

  handleHostScroll(scrollTop: number, scrollLeft: number): void {
    const { logicalX, logicalY } = this.mapScrollToLogical(scrollTop, scrollLeft)
    this.engine.setScroll(logicalX, logicalY)
    this.invalidate()
  }

  handleHostResize(cssWidth: number, cssHeight: number, dpr: number): void {
    this.engine.setViewportSize(cssWidth, cssHeight)
    this.renderer.resize(cssWidth, cssHeight, dpr)
    this.resizeSpacer()
    this.remapScroll()
    this.invalidate()
  }

  handleHostDprChange(dpr: number): void {
    const { width, height } = this.host.getContainerSize()
    this.renderer.resize(width, height, dpr)
    this.invalidate()
  }

  private mapScrollToLogical(
    scrollTop: number,
    scrollLeft: number,
  ): { logicalX: number; logicalY: number } {
    // ... lifted from current Grid; uses ScrollMapper + engine.getRowsTotalSize() etc.
  }
}
```

(Again — too long for plan body. Implementer lifts behavior preservingly.)

- [ ] **Step 4: Update `packages/web/src/index.ts`**

Append:

```ts
export type { WebHost, WebHostOptions } from './host/WebHost'
export { DomGridHost } from './host/DomGridHost'
export { WebGridRuntime } from './runtime/WebGridRuntime'
export type { WebGridRuntimeOptions } from './runtime/WebGridRuntime'
```

- [ ] **Step 5: Move tests**

Tests for the new code:

- `packages/web/tests/host/DomGridHost.test.ts` — DOM lifecycle, ResizeObserver wiring, originalPosition restore, destroy idempotency
- `packages/web/tests/runtime/WebGridRuntime.test.ts` — scroll mapping, scrollToRow/Cell, invalidate scheduling, destroy

Extract the relevant test cases from `packages/core/tests/Grid.test.ts` (the DOM-touching ones — most of them) and rewrite them to test the new types directly. Aim for one-for-one assertion preservation.

Plan-budget for this is non-trivial. Take it methodically.

- [ ] **Step 6: Verify all tests pass + commit**

```bash
bun test
# Expect: 126 + 6 (Task 8 engine) + ~13 (DomGridHost + WebGridRuntime split from Grid.test) = ~145
bun run --filter '*' typecheck
bun run --filter '*' build
git add packages/core packages/web bun.lock
git commit -m "refactor(web): extract DomGridHost + WebGridRuntime from Grid.ts

DOM lifecycle, ResizeObserver, scrollHost/spacer, DPR watcher → DomGridHost.
Scroll mapping, scrollToRow/Cell, invalidate/RAF coordination → WebGridRuntime.

Grid.ts in @novasheet/core is now an empty shell (or near-empty) — moved
to @novasheet/web-canvas2d in Task 10."
```

---

### Task 10: Create public `Grid` facade in `@novasheet/web-canvas2d` and delete `core/Grid.ts`

**Files:**

- Create: `packages/web-canvas2d/src/Grid.ts` (the public facade)
- Modify: `packages/web-canvas2d/src/index.ts` (export Grid as primary surface)
- Delete: `packages/core/src/Grid.ts`
- Modify: `packages/core/src/index.ts` (remove Grid export)
- Move: remaining tests from `packages/core/tests/Grid.test.ts` to `packages/web-canvas2d/tests/Grid.test.ts`
- Delete: `packages/core/tests/Grid.test.ts`

- [ ] **Step 1: Create `packages/web-canvas2d/src/Grid.ts`**

```ts
/**
 * Public Grid facade — the consumer-facing class for browser Canvas2D
 * usage of NovaSheet. Wraps DefaultGridEngine + DomGridHost +
 * Canvas2DRenderer + WebGridRuntime so consumers don't have to wire
 * those four pieces themselves.
 *
 * See spec §7 + I1 (review) for why a wrapper exists vs. exporting
 * WebGridRuntime as Grid.
 */

import {
  DefaultGridEngine,
  type DataSource,
  type Theme,
  type GridEngineOptions,
} from '@novasheet/core'
import { DomGridHost, WebGridRuntime } from '@novasheet/web'
import { Canvas2DRenderer } from './render/Canvas2DRenderer'

export interface GridOptions extends GridEngineOptions {
  // Same as GridEngineOptions for now; reserved for future Grid-only
  // options like cursor styling.
}

export class Grid {
  private engine: DefaultGridEngine
  private host: DomGridHost
  private renderer: Canvas2DRenderer
  private runtime: WebGridRuntime

  constructor(container: HTMLElement, options: GridOptions) {
    this.engine = new DefaultGridEngine(options)

    // Renderer (canvas-bearing). Constructed without ctx; mount handles it.
    this.renderer = new Canvas2DRenderer()

    // Host wires DOM events through callbacks to the runtime methods.
    // Define host AFTER renderer so callbacks can reference renderer.
    this.host = new DomGridHost({
      container,
      onScroll: (scrollTop, scrollLeft) => this.runtime.handleHostScroll(scrollTop, scrollLeft),
      onResize: (w, h, dpr) => this.runtime.handleHostResize(w, h, dpr),
      onDprChange: (dpr) => this.runtime.handleHostDprChange(dpr),
    })

    this.runtime = new WebGridRuntime({
      engine: this.engine,
      host: this.host,
      renderer: this.renderer,
    })

    this.runtime.attach()
  }

  setData(data: DataSource): void {
    this.engine.setData(data)
    this.runtime.refresh()
  }

  setTheme(theme: Theme): void {
    this.engine.setTheme(theme)
    this.runtime.refresh()
  }

  setRowHeight(rowIndex: number, height: number): void {
    this.engine.setRowHeight(rowIndex, height)
    this.runtime.refresh()
  }

  setColumnWidth(fieldId: string, width: number): void {
    this.engine.setColumnWidth(fieldId, width)
    this.runtime.refresh()
  }

  scrollToRow(rowIndex: number, align?: 'start' | 'center' | 'end'): void {
    this.runtime.scrollToRow(rowIndex, align)
  }

  scrollToCell(rowIndex: number, fieldId: string): void {
    this.runtime.scrollToCell(rowIndex, fieldId)
  }

  refresh(): void {
    this.runtime.refresh()
  }

  destroy(): void {
    this.runtime.destroy()
  }
}
```

(Note: `runtime.handleHostScroll` etc. need to exist on `WebGridRuntime`. Add them in Task 9 OR add now and run tests.)

- [ ] **Step 2: Update `packages/web-canvas2d/src/index.ts`**

```ts
// @novasheet/web-canvas2d — Canvas2D-specific renderer for NovaSheet grid.
//
// Public surface:
export { Grid } from './Grid'
export type { GridOptions } from './Grid'

// Internal (re-exported for advanced users / testing):
export { Canvas2DRenderer } from './render/Canvas2DRenderer'
export type { Canvas2DRendererOptions } from './render/Canvas2DRenderer'
export { HighDPI } from './surface/HighDPI'
```

- [ ] **Step 3: Move tests**

```bash
git mv packages/core/tests/Grid.test.ts packages/web-canvas2d/tests/Grid.test.ts
```

Update the moved file's imports:

- `import { Grid } from '../src/Grid'` → `import { Grid } from '../src/Grid'`
- `import { InMemoryDataSource, denseGridTheme, type Schema } from '../src/...'` → `import { InMemoryDataSource, denseGridTheme, type Schema } from '@novasheet/core'`
- `import { spyOn } from 'bun:test'` — keep

The relative `../src/Grid` now points to `packages/web-canvas2d/src/Grid.ts` — good.

Some tests reference internal Grid fields via `as unknown as { invalidate: ... }` patterns. If the new Grid facade doesn't have those private fields (because invalidate moved to runtime), those tests need slight adaptation:

- `spyOn(grid as unknown as { invalidate: () => void }, 'invalidate')` → `spyOn((grid as unknown as { runtime: { refresh: () => void } }).runtime, 'refresh')`

OR add a passthrough `private invalidate()` on the public Grid for test compatibility — only if many tests depend on it. Inspect.

- [ ] **Step 4: Delete core/Grid.ts**

```bash
rm packages/core/src/Grid.ts
```

- [ ] **Step 5: Remove Grid export from `packages/core/src/index.ts`**

Delete these lines:

```ts
export { Grid } from './Grid'
export type { GridOptions } from './Grid'
```

Add a comment marker:

```ts
// Note: Grid is exported by @novasheet/web-canvas2d (consumer-facing facade).
// Programmatic engine access: use DefaultGridEngine here.
```

- [ ] **Step 6: Remove dependencies on @novasheet/web + web-canvas2d from core**

Edit `packages/core/package.json` and remove:

```json
"dependencies": {
  "@novasheet/web": "workspace:*",       // ← remove
  "@novasheet/web-canvas2d": "workspace:*"  // ← remove
}
```

(Or remove the `dependencies` field entirely if empty.)

Core is now self-contained — no web/web-canvas2d dependencies.

- [ ] **Step 7: Run full suite**

```bash
bun install  # cleans up the now-removed deps
bun test
bun run --filter '*' typecheck
bun run --filter '*' build
```

Expected: ~145+ tests passing.

- [ ] **Step 8: Commit**

```bash
git add packages/core packages/web-canvas2d bun.lock
git commit -m "refactor: public Grid facade in @novasheet/web-canvas2d; remove Grid from core

Grid.ts deleted from @novasheet/core. Public Grid lives in
@novasheet/web-canvas2d and composes engine (core) + host (web) +
renderer (web-canvas2d) + runtime (web).

@novasheet/core no longer depends on @novasheet/web or
@novasheet/web-canvas2d — clean unidirectional dependency.

Consumer API surface unchanged from M2: import { Grid } and use the
same methods."
```

---

### Task 11: Update Storybook to import from `@novasheet/web-canvas2d`

**Files:**

- Modify: `apps/storybook/package.json` (swap `@novasheet/core` dep for `@novasheet/web-canvas2d`; keep `@novasheet/core` as transitive)
- Modify: `apps/storybook/src/grid-host.ts` (import Grid from web-canvas2d)
- Modify: `apps/storybook/src/stories/Scroll.stories.ts` (import Grid type from web-canvas2d)
- (No change to story content; GeneratedDataSource still imports from `@novasheet/core` — DataSource interface lives there.)

- [ ] **Step 1: Update `apps/storybook/package.json`**

```json
"dependencies": {
  "@novasheet/core": "workspace:*",
  "@novasheet/web-canvas2d": "workspace:*"
}
```

(Add web-canvas2d; keep core for the GeneratedDataSource's `DataSource` import.)

- [ ] **Step 2: Update `apps/storybook/src/grid-host.ts`**

Find:

```ts
import { Grid, type GridOptions } from '@novasheet/core'
```

Replace with:

```ts
import { Grid, type GridOptions } from '@novasheet/web-canvas2d'
```

- [ ] **Step 3: Update `apps/storybook/src/stories/Scroll.stories.ts`**

Find:

```ts
import { Grid, InMemoryDataSource, type Schema } from '@novasheet/core'
```

Replace with:

```ts
import { Grid } from '@novasheet/web-canvas2d'
import { InMemoryDataSource, type Schema } from '@novasheet/core'
```

(`Grid` type comes from web-canvas2d; data + types come from core.)

- [ ] **Step 4: Search for other story files that import Grid from core**

```bash
grep -rln "import.*Grid.*from '@novasheet/core'" apps/storybook/src/
```

For each match, apply the same split: `Grid` from web-canvas2d, types/data from core.

- [ ] **Step 5: Install + verify Storybook**

```bash
bun install
bun run --filter @novasheet/storybook build-storybook 2>&1 | tail -10
```

Expected: build succeeds, 11 stories indexed.

- [ ] **Step 6: Verify dev server boots**

```bash
bun run storybook 2>&1 &
sleep 6
curl -s http://localhost:6006/iframe.html | head -5
kill %1 2>/dev/null
wait 2>/dev/null
```

Expected: HTML response from iframe (no Storybook error pages).

- [ ] **Step 7: Cleanup**

```bash
rm -rf apps/storybook/storybook-static
```

- [ ] **Step 8: Commit**

```bash
git add apps/storybook bun.lock
git commit -m "feat(storybook): switch Grid import from @novasheet/core to @novasheet/web-canvas2d

All 11 stories still render. GeneratedDataSource still imports from
@novasheet/core (DataSource interface lives there). InMemoryDataSource
+ Schema types still come from @novasheet/core; only Grid is from
@novasheet/web-canvas2d now.

Confirms the refactor's consumer-facing promise: import { Grid } works
the same as before, just from a different package."
```

---

### Task 12: Doc updates + final integration + tag

**Files:**

- Modify: `CLAUDE.md` (toolchain, current state, architectural invariants)
- Modify: `README.md` (architecture diagram, quick start)

- [ ] **Step 1: Update CLAUDE.md "Current state"**

Replace the relevant section to reflect the 3-package layout:

```markdown
**Last shipped:** **Cross-platform refactor** — tag `cross-platform-refactor` at the HEAD of `main`. ~145+ tests across 3 packages, lint/typecheck/build all clean. The monolithic `@novasheet/core` has been split into:

- `@novasheet/core` — platform-independent (data, schema, theme, layout, engine, RenderFrame contract). No DOM.
- `@novasheet/web` — browser host (DomGridHost, NativeScroller, ScrollMapper, WebGridRuntime, WebRenderer contract). No Canvas-specific code.
- `@novasheet/web-canvas2d` — Canvas2D renderer + public `Grid` facade. Consumers `import { Grid } from '@novasheet/web-canvas2d'`.

**Next milestone:** **M3 Frozen + Dynamic sizing** — not yet planned. Same scope as before (per spec §4 + §5.3 + §5.7) but now lives across packages: `FrozenRegions` stays in `@novasheet/core`, FrozenPainter (M3) lands in `@novasheet/web-canvas2d/painters/`.

**Architecture invariants refresh:**

- Renderer reads ONLY from `RenderFrame` (from engine.getFrame()) — unchanged in spirit, new in shape
- All mutations go through `DefaultGridEngine` or its facade `Grid` — unchanged
- Theme is the ONLY source of visual values — unchanged
- Three-package dependency direction: `core ← web ← web-canvas2d`. No back-edges. `apps/storybook` depends on `@novasheet/web-canvas2d` (consumer) + `@novasheet/core` (DataSource interface for the GeneratedDataSource helper).
```

- [ ] **Step 2: Update CLAUDE.md "What goes where"**

Replace the table with package-aware locations:

```markdown
| Topic                               | Location                                                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Public types & API for consumers    | `packages/web-canvas2d/src/index.ts` (Grid) + `packages/core/src/index.ts` (DataSource, Theme, Schema types) |
| Engine state coordinator            | `packages/core/src/engine/DefaultGridEngine.ts`                                                              |
| Algorithm core                      | `packages/core/src/layout/ChunkedAxis.ts` (also exports `Axis`/`MutableAxis` interfaces)                     |
| Per-frame logic                     | `packages/web-canvas2d/src/render/Canvas2DRenderer.ts`                                                       |
| Theme tokens                        | `packages/core/src/theme/denseGridTheme.ts`                                                                  |
| DataSource ABC                      | `packages/core/src/data/DataSource.ts`                                                                       |
| DOM host                            | `packages/web/src/host/DomGridHost.ts`                                                                       |
| Scroll math + spec scroll constants | `packages/web/src/scroll/ScrollMapper.ts` (SAFE_MAX = 6_000_000)                                             |
| Tests                               | each `packages/<pkg>/tests/` mirrors its `src/`                                                              |
| Test helpers — RecordingContext     | `packages/web-canvas2d/tests/helpers/recording-context.ts`                                                   |
| Test helpers — global-stub          | `packages/web/tests/helpers/global-stub.ts` + duplicated in `packages/web-canvas2d/tests/helpers/`           |
```

- [ ] **Step 3: Update CLAUDE.md "Things explicitly NOT" list**

Replace "M1 paths" with current-shape paths:

```markdown
## Things explicitly NOT shipped yet (don't add prematurely)

- Frozen quadrants painting beyond M1 stub (M3 — `packages/web-canvas2d/src/painters/FrozenPainter.ts`)
- Dynamic row-height autofit / multi-line text (M3)
- Resize handles / `<handle-layer>` interaction (M4 — likely `packages/web/src/interaction/`)
- React wrapper (M4 — `packages/react` or `packages/web-react`)
- WebGL / WebGPU renderers (post-Phase-1)
- Server-paginated DataSource (Phase 4 — `packages/core/src/data/PaginatedDataSource.ts`)
```

- [ ] **Step 4: Update README.md architecture diagram**

Replace the existing one with:

```
┌────────────────────────────────────────────────────────────┐
│   @novasheet/web-canvas2d                                  │
│   ┌──────────────────────────────────────────────────────┐ │
│   │  Grid (public facade)                                │ │
│   └────────────────────────┬─────────────────────────────┘ │
│   ┌──────────────────────────────────────────────────────┐ │
│   │  Canvas2DRenderer (implements WebRenderer)           │ │
│   │  CellPainter · GridLinesPainter · HeaderPainter      │ │
│   │  HighDPI                                              │ │
│   └──────────────────────────────────────────────────────┘ │
└────────────────────────────┬───────────────────────────────┘
                             │ depends on
                             ▼
┌────────────────────────────────────────────────────────────┐
│   @novasheet/web                                           │
│   ┌─────────────┐ ┌──────────────┐ ┌────────────────────┐ │
│   │ DomGridHost │ │ ScrollMapper │ │  WebGridRuntime    │ │
│   │ (host)      │ │ NativeScrolr │ │  (orchestrator)    │ │
│   └─────────────┘ └──────────────┘ └────────────────────┘ │
│                              WebRenderer (interface)       │
└────────────────────────────┬───────────────────────────────┘
                             │ depends on
                             ▼
┌────────────────────────────────────────────────────────────┐
│   @novasheet/core (no DOM, no canvas)                      │
│   ┌────────────────────────────────────────────────────┐   │
│   │ DefaultGridEngine (engine state coordinator)       │   │
│   └────────────────────────────────────────────────────┘   │
│   ┌──────┐ ┌──────────┐ ┌──────────┐ ┌────────────────┐   │
│   │ Data │ │ Theme    │ │ Layout   │ │ RenderFrame    │   │
│   │      │ │          │ │ (axes)   │ │ (interface)    │   │
│   └──────┘ └──────────┘ └──────────┘ └────────────────┘   │
└────────────────────────────────────────────────────────────┘
```

- [ ] **Step 5: Update README "Quick Start"**

Update import lines to use the new packages:

```ts
import { Grid } from '@novasheet/web-canvas2d'
import { InMemoryDataSource, denseGridTheme } from '@novasheet/core'
```

- [ ] **Step 6: Final verification**

```bash
bun install --frozen-lockfile
bun run lint
bun run --filter '*' typecheck
bun test
bun run --filter '*' build
bun run --filter @novasheet/storybook build-storybook 2>&1 | tail -3
```

Expected: all green. Test count ≥ 132 (126 original tests + 6 engine + new web/web-canvas2d tests; exact number depends on Task 9's test split).

- [ ] **Step 7: Verify acceptance criteria from spec §12**

Manually verify (just commands):

```bash
# (1) core has no direct DOM references
grep -rn "HTMLElement\|HTMLCanvasElement\|CanvasRenderingContext2D\|document.createElement\|ResizeObserver\|window.devicePixelRatio" packages/core/src/ 2>&1
# Expected: zero matches

# (2) web has the host + scroll
ls packages/web/src/host/DomGridHost.ts packages/web/src/scroll/ScrollMapper.ts
# Expected: both files exist

# (3) web-canvas2d exports Grid
grep "export.*Grid" packages/web-canvas2d/src/index.ts
# Expected: Grid + GridOptions

# (4) Storybook stories work
bun run --filter @novasheet/storybook build-storybook 2>&1 | grep "Stories indexed\|stories\|exited"

# (5) test count
bun test 2>&1 | grep "pass\|fail"
# Expected: 0 fail, >= 132 pass
```

- [ ] **Step 8: Commit doc updates + tag + push**

```bash
git add CLAUDE.md README.md
git commit -m "docs: update CLAUDE.md + README for three-package architecture"
git tag cross-platform-refactor
git push origin main
git push origin cross-platform-refactor
```

---

## Migration Completion Checklist

When all tasks above pass, the following should be true:

- [ ] `@novasheet/core` exists with engine + data + theme + layout + RenderFrame; no DOM/canvas references
- [ ] `@novasheet/web` exists with WebHost / DomGridHost / NativeScroller / ScrollMapper / WebGridRuntime / WebRenderer contract
- [ ] `@novasheet/web-canvas2d` exists with Canvas2DRenderer / painters / HighDPI / public Grid
- [ ] Dependency direction is `core ← web ← web-canvas2d`; no back-edges; `apps/storybook` depends on web-canvas2d + core
- [ ] All 126 original tests still pass (relocated to package owners) + new engine/host/runtime tests
- [ ] Storybook builds + dev server boots; all 11 stories render
- [ ] `bun install --frozen-lockfile && bun run lint && bun run --filter '*' typecheck && bun test && bun run --filter '*' build` succeeds
- [ ] CLAUDE.md + README updated
- [ ] git tag `cross-platform-refactor` exists on remote
- [ ] Spec §12 acceptance criteria 1-8 all green

**What's intentionally NOT working yet:**

- WebGL / WebGPU renderers (next milestones)
- React wrapper (M4)
- M3 frozen quadrant rendering (the FrozenRegions stub returns only `main`)
