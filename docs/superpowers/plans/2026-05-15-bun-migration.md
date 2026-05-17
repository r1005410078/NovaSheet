# Bun Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the pnpm + Node.js + Vitest + tsup toolchain with Bun-native equivalents — `bun install` for deps, `bun test` for tests, `Bun.build` for bundling — while preserving the published library shape and all 126 existing tests.

**Architecture:** Single runtime (Bun) for install / test / build. Lockfile changes from `pnpm-lock.yaml` (text) to `bun.lock` (text in modern Bun). Workspace definition moves from `pnpm-workspace.yaml` to standard `workspaces` field in root `package.json`. Vitest's `vi.*` mock APIs are replaced by `bun:test`'s `mock` / `spyOn` and a tiny in-repo `stubGlobal/unstubAllGlobals` helper for the few places we manually swap global functions. Happy-dom is injected via `@happy-dom/global-registrator` in a preload file (replaces Vitest's `environment: 'happy-dom'`). `tsup` is replaced by a 20-line `build.ts` invoking `Bun.build` for ESM + CJS bundles and `tsc --emitDeclarationOnly` for .d.ts. Storybook stays on Node-equivalents (Storybook 8 + Vite + Bun is brittle); we keep `bun run storybook` as the entry but rely on Bun's Node-shim to run Storybook tooling unchanged.

**Tech Stack:** Bun ^1.2, TypeScript 5.4+ (strict), `bun:test`, `@happy-dom/global-registrator`, ESLint 8, Prettier 3.

**Spec reference:** Migration evaluated in the conversation that produced this plan (option D from the "pnpm vs Bun" tradeoff matrix). No design spec — this is a toolchain swap.

**Out of scope:**
- Library API or feature changes (this is purely a build/test infrastructure migration)
- Replacing ESLint or Prettier (both work fine under Bun)
- Storybook framework swap (deferred; we verify it still runs)
- Publishing to npm registry (consumers are still using node/npm/pnpm/yarn/bun — they all consume `.js` + `.cjs` + `.d.ts` the same)

---

## File Structure

### Created

```
NovaSheet/
├── bunfig.toml                          # root bun config (test preload, workspace settings)
└── packages/core/
    ├── build.ts                         # replaces tsup.config.ts
    └── tests/helpers/
        └── global-stub.ts               # stubGlobal/unstubAllGlobals replacement for vi.stubGlobal
```

### Deleted

```
NovaSheet/
├── pnpm-workspace.yaml                  # → root package.json `workspaces` field
├── pnpm-lock.yaml                       # → bun.lock (auto-generated)
└── packages/core/
    ├── tsup.config.ts                   # → build.ts
    └── vitest.config.ts                 # → bunfig.toml [test] section
```

### Modified

```
NovaSheet/
├── package.json                         # add workspaces, swap scripts to bun, trustedDependencies
├── packages/core/package.json           # swap scripts to bun, change devDeps
├── apps/storybook/package.json          # swap scripts to bun (storybook command unchanged)
├── packages/core/tests/setup.ts         # register happy-dom + canvas stub for bun runtime
├── packages/core/tests/**/*.test.ts     # vi.* → bun:test (16 files)
├── .github/workflows/ci.yml             # setup-bun + bun commands
├── CLAUDE.md                            # toolchain section
└── README.md                            # install/test/build instructions
```

---

## Conventions

- **Working directory**: `/Users/rongts/NovaSheet` for all commands unless stated otherwise.
- **Commit cadence**: one commit per task (each task ends with a commit step).
- **No regressions**: after Task 4 (test migration), all 126 tests MUST pass under `bun test`. After Task 5 (build migration), `bun run build` must produce `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts` matching the existing tsup output's exports surface.
- **Commit messages**: conventional commits (`chore(bun): ...`, `refactor(test): ...`, etc.)

---

### Task 1: Pre-flight — verify Bun and capture pnpm baseline

**Files:**
- Modify (read-only inspection): nothing in this task; we just gather baseline numbers.

- [ ] **Step 1: Verify Bun is installed**

```bash
bun --version
```

Expected: prints a version number `1.2.x` or newer. If not installed:

```bash
curl -fsSL https://bun.sh/install | bash
exec $SHELL  # reload PATH
bun --version  # retry
```

If installation fails or version < 1.2, STOP and ask the controller — we need Bun ≥ 1.2 for stable `bun:test` + workspaces.

- [ ] **Step 2: Capture current pnpm + Node baseline for comparison**

```bash
cd /Users/rongts/NovaSheet
time pnpm --filter @novasheet/core test 2>&1 | tail -3
time pnpm --filter @novasheet/core build 2>&1 | tail -3
pnpm --filter @novasheet/core test 2>&1 | grep "Tests" | tail -1
```

Record the timings somewhere (use a file like `/tmp/bun-migration-baseline.txt`):

```bash
{
  echo "=== Baseline ==="
  echo "Node: $(node --version)"
  echo "pnpm: $(pnpm --version)"
  echo "Bun: $(bun --version)"
  echo "Tests count: $(pnpm --filter @novasheet/core test 2>&1 | grep 'Tests' | tail -1)"
  echo "--- test time ---"
  { time pnpm --filter @novasheet/core test 2>&1 | tail -1; } 2>&1
  echo "--- build time ---"
  { time pnpm --filter @novasheet/core build 2>&1 | tail -1; } 2>&1
} > /tmp/bun-migration-baseline.txt 2>&1

cat /tmp/bun-migration-baseline.txt
```

Reference this at the end of Task 10 to confirm we hit the expected speedup.

- [ ] **Step 3: Confirm the working tree is clean**

```bash
git status
```

If unclean, commit or stash first. The migration changes many files; we want a clean baseline.

- [ ] **Step 4: No commit needed** — this is a pre-flight check, no file changes.

---

### Task 2: Workspace bootstrap — replace pnpm-workspace.yaml with package.json workspaces

**Files:**
- Modify: `/Users/rongts/NovaSheet/package.json`
- Delete: `/Users/rongts/NovaSheet/pnpm-workspace.yaml`

- [ ] **Step 1: Replace root `package.json` with bun-friendly version**

Open `/Users/rongts/NovaSheet/package.json` and replace ENTIRELY with:

```json
{
  "name": "novasheet",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "workspaces": [
    "packages/*",
    "apps/*"
  ],
  "scripts": {
    "build": "bun run --filter '*' build",
    "test": "bun test",
    "typecheck": "bun run --filter '*' typecheck",
    "lint": "eslint packages",
    "format": "prettier --write \"**/*.{ts,tsx,js,json,md}\"",
    "storybook": "bun run --filter @novasheet/storybook storybook",
    "build-storybook": "bun run --filter @novasheet/storybook build-storybook"
  },
  "trustedDependencies": [
    "esbuild"
  ],
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^7.8.0",
    "@typescript-eslint/parser": "^7.8.0",
    "eslint": "^8.57.0",
    "prettier": "^3.2.5",
    "typescript": "^5.4.5"
  }
}
```

Key changes vs old version:
- Added `"workspaces": ["packages/*", "apps/*"]` (replaces pnpm-workspace.yaml)
- All workspace iteration moves from `pnpm -r run X` / `pnpm --filter <pkg>` to `bun run --filter '*' X` / `bun run --filter <pkg>`
- `"test"` script becomes `bun test` (top-level, scans workspaces automatically)
- Added `"typecheck"` to root (used by CI; not present before)
- `"pnpm": { "onlyBuiltDependencies": ["esbuild"] }` becomes `"trustedDependencies": ["esbuild"]` (Bun's equivalent)

- [ ] **Step 2: Delete pnpm-workspace.yaml**

```bash
rm /Users/rongts/NovaSheet/pnpm-workspace.yaml
```

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-workspace.yaml
git commit -m "chore(bun): move workspaces from pnpm-workspace.yaml to package.json"
```

> Note: pnpm-lock.yaml is intentionally NOT touched yet. It still exists until Task 3 where bun install regenerates lockfile.

---

### Task 3: Install dependencies via Bun

**Files:**
- Delete: `/Users/rongts/NovaSheet/pnpm-lock.yaml`
- Delete: `/Users/rongts/NovaSheet/node_modules` (will be regenerated)
- Create: `/Users/rongts/NovaSheet/bun.lock` (auto-generated by `bun install`)
- Update: `/Users/rongts/NovaSheet/.gitignore` (no change needed — `node_modules` already ignored)

- [ ] **Step 1: Remove old install artifacts**

```bash
cd /Users/rongts/NovaSheet
rm -rf node_modules packages/*/node_modules apps/*/node_modules
rm pnpm-lock.yaml
```

- [ ] **Step 2: Run `bun install`**

```bash
bun install
```

Expected output: includes line `+ X packages installed` and finishes in seconds. Generates `bun.lock` at root (text format in Bun 1.2+; if you see `bun.lockb` binary lockfile, upgrade Bun to ≥ 1.2 first).

If install fails with errors about specific packages (e.g., esbuild postinstall), the `trustedDependencies` field in root package.json should have authorized it. Re-check Task 2 Step 1.

- [ ] **Step 3: Verify workspace linking**

```bash
ls node_modules/@novasheet
```

Expected: `core  storybook` (both workspace packages symlinked).

- [ ] **Step 4: Verify Bun can run scripts**

```bash
bun run --filter @novasheet/core typecheck
```

Expected: `tsc --noEmit` completes with no errors. (Tests still on Vitest — they will FAIL until Task 4. Just typecheck.)

- [ ] **Step 5: Commit**

```bash
git add bun.lock pnpm-lock.yaml
git commit -m "chore(bun): switch lockfile pnpm-lock.yaml → bun.lock"
```

---

### Task 4: Test infrastructure — bunfig.toml + setup.ts + global-stub helper

**Files:**
- Create: `/Users/rongts/NovaSheet/bunfig.toml`
- Create: `/Users/rongts/NovaSheet/packages/core/tests/helpers/global-stub.ts`
- Modify: `/Users/rongts/NovaSheet/packages/core/tests/setup.ts`
- Add dev dep: `@happy-dom/global-registrator`

- [ ] **Step 1: Install happy-dom global registrator**

```bash
cd /Users/rongts/NovaSheet
bun add -D @happy-dom/global-registrator --filter @novasheet/core
```

Verify it's added to `packages/core/package.json` devDependencies.

- [ ] **Step 2: Create `bunfig.toml` at repo root**

```toml
# Bun configuration — bunfig.toml
# Tests preload happy-dom and the canvas stub before any test runs.

[install]
# Lockfile pinning behavior (default exact = false is fine for libraries)

[test]
preload = ["./packages/core/tests/setup.ts"]
```

- [ ] **Step 3: Create `global-stub.ts` helper**

`bun:test` doesn't ship `vi.stubGlobal` / `vi.unstubAllGlobals`. The tests use them in HighDPI, NativeScroller, raf, and Grid (manual RAF stubs). Provide a tiny replacement:

Create `/Users/rongts/NovaSheet/packages/core/tests/helpers/global-stub.ts`:

```ts
/**
 * Vitest-style global stubbing for bun:test.
 *
 * Save → set → restore on `unstubAllGlobals()`. Tracks stubs in module-scope
 * Map so multiple calls in one test all roll back together — matches the
 * `vi.stubGlobal` + `vi.unstubAllGlobals` ergonomics tests were written against.
 *
 * Usage:
 *   import { stubGlobal, unstubAllGlobals } from '../helpers/global-stub'
 *   beforeEach(() => {})
 *   afterEach(() => unstubAllGlobals())
 *
 *   stubGlobal('devicePixelRatio', 2)
 *   // ... test ...
 */

type GlobalLike = Record<string, unknown>

const stubs = new Map<string, unknown>()

export function stubGlobal(name: string, value: unknown): void {
  if (!stubs.has(name)) {
    stubs.set(name, (globalThis as unknown as GlobalLike)[name])
  }
  ;(globalThis as unknown as GlobalLike)[name] = value
}

export function unstubAllGlobals(): void {
  for (const [name, original] of stubs) {
    if (original === undefined) {
      delete (globalThis as unknown as GlobalLike)[name]
    } else {
      ;(globalThis as unknown as GlobalLike)[name] = original
    }
  }
  stubs.clear()
}
```

- [ ] **Step 4: Replace `tests/setup.ts` with the bun-compatible version**

Open `/Users/rongts/NovaSheet/packages/core/tests/setup.ts` and replace ENTIRELY:

```ts
/**
 * Test environment bootstrap. Loaded once via bunfig.toml `[test] preload`
 * before any test file runs.
 *
 * Steps:
 *   1. Register happy-dom globally — installs document / window / HTMLElement /
 *      HTMLCanvasElement etc into the bun runtime. Vitest used to do this via
 *      `environment: 'happy-dom'` in vitest.config.ts.
 *   2. Stub HTMLCanvasElement.prototype.getContext('2d') to return our
 *      RecordingContext2D — happy-dom doesn't implement Canvas 2D, so without
 *      this stub `new Grid(el, ...)` would throw.
 */

import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register()

// Import AFTER happy-dom registration so HTMLCanvasElement exists.
const { createRecordingContext } = await import('./helpers/recording-context')

HTMLCanvasElement.prototype.getContext = function getContext(this: HTMLCanvasElement, type: string) {
  if (type !== '2d') return null
  return createRecordingContext(this.width || 800, this.height || 600).ctx as never
} as never
```

Why dynamic `await import`: top-level await is allowed in preload; the module that exports `createRecordingContext` itself uses no DOM globals at parse time but using dynamic import keeps the load order obvious — happy-dom first, then anything that touches DOM types.

- [ ] **Step 5: Commit**

```bash
git add bunfig.toml packages/core/package.json packages/core/tests/setup.ts packages/core/tests/helpers/global-stub.ts bun.lock
git commit -m "chore(bun): add test preload (happy-dom registrator + canvas stub) and stubGlobal helper"
```

---

### Task 5: Migrate test files — vitest imports → bun:test

This is the largest task. 16 test files. Strategy: do them in a single subagent run for consistency, with clear file-by-file mapping below.

**Files (all modified):**
```
packages/core/tests/_probe.test.ts
packages/core/tests/Grid.test.ts
packages/core/tests/data/InMemoryDataSource.test.ts
packages/core/tests/data/Schema.test.ts
packages/core/tests/helpers/recording-context.test.ts
packages/core/tests/layout/ChunkedAxis.test.ts
packages/core/tests/layout/Viewport.test.ts
packages/core/tests/render/CellPainter.test.ts
packages/core/tests/render/GridLinesPainter.test.ts
packages/core/tests/render/HeaderPainter.test.ts
packages/core/tests/render/HighDPI.test.ts
packages/core/tests/render/Renderer.test.ts
packages/core/tests/scroll/NativeScroller.test.ts
packages/core/tests/scroll/ScrollMapper.test.ts
packages/core/tests/theme/denseGridTheme.test.ts
packages/core/tests/util/raf.test.ts
```

**Mapping (applies to ALL files):**

| Vitest | bun:test replacement |
|---|---|
| `import { describe, expect, it } from 'vitest'` | `import { describe, expect, it } from 'bun:test'` |
| `import { describe, expect, it, vi } from 'vitest'` | `import { describe, expect, it, mock, spyOn } from 'bun:test'` |
| `import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'` | `import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'` |
| `vi.fn()` | `mock(() => {})` |
| `vi.fn((arg) => ...)` | `mock((arg) => ...)` |
| `vi.spyOn(obj, 'method')` | `spyOn(obj, 'method')` |
| `vi.stubGlobal('foo', val)` | `stubGlobal('foo', val)` — also `import { stubGlobal, unstubAllGlobals } from '../helpers/global-stub'` |
| `vi.unstubAllGlobals()` | `unstubAllGlobals()` |

**Files that need ONLY the import statement changed (11 files):**

These files import only `describe / expect / it` from vitest, no `vi.*` usage:

- `_probe.test.ts`
- `data/Schema.test.ts`
- `helpers/recording-context.test.ts`
- `layout/ChunkedAxis.test.ts`
- `layout/Viewport.test.ts`
- `render/CellPainter.test.ts`
- `render/GridLinesPainter.test.ts`
- `render/HeaderPainter.test.ts`
- `render/Renderer.test.ts`  *(uses manual globalThis.requestAnimationFrame stub but NOT vi.*)*
- `scroll/ScrollMapper.test.ts`
- `theme/denseGridTheme.test.ts`

For each, simply change:
```ts
import { describe, expect, it } from 'vitest'
```
to:
```ts
import { describe, expect, it } from 'bun:test'
```

(Some files import additional helpers like `beforeAll`, `beforeEach`, `afterAll`, `afterEach` — those are also exported from `bun:test`. Adjust the import list to match what each file uses.)

**Files needing vi.* replacements (5 files):**

#### `data/InMemoryDataSource.test.ts`

Change:
```ts
import { describe, expect, it, vi } from 'vitest'
```
to:
```ts
import { describe, expect, it, mock } from 'bun:test'
```

Then `s/vi.fn()/mock(() => {})/g` throughout.

#### `render/HighDPI.test.ts`

Change:
```ts
import { describe, expect, it, vi } from 'vitest'
```
to:
```ts
import { describe, expect, it } from 'bun:test'
import { stubGlobal, unstubAllGlobals } from '../helpers/global-stub'
```

Then:
- `vi.stubGlobal('devicePixelRatio', 2)` → `stubGlobal('devicePixelRatio', 2)`
- `vi.unstubAllGlobals()` → `unstubAllGlobals()`

#### `scroll/NativeScroller.test.ts`

Change:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
to:
```ts
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
```

Then:
- `vi.fn()` → `mock(() => {})`
- `vi.spyOn(host, 'addEventListener')` → `spyOn(host, 'addEventListener')` (same for `removeEventListener`)

The file uses a custom RAF stub via `globalThis.requestAnimationFrame = ...` in `beforeEach` — that pattern doesn't use `vi.*` and stays unchanged.

#### `util/raf.test.ts`

Change:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
to:
```ts
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { stubGlobal, unstubAllGlobals } from '../helpers/global-stub'
```

Then:
- `vi.fn()` → `mock(() => {})`
- `vi.stubGlobal('requestAnimationFrame', ...)` → `stubGlobal('requestAnimationFrame', ...)`
- `vi.unstubAllGlobals()` → `unstubAllGlobals()`

#### `Grid.test.ts`

Change:
```ts
import { describe, expect, it, vi } from 'vitest'
```
to:
```ts
import { describe, expect, it, spyOn } from 'bun:test'
```

Then:
- `vi.spyOn(grid as unknown as { invalidate: () => void }, 'invalidate')` → `spyOn(grid as unknown as { invalidate: () => void }, 'invalidate')`
- Same for `viewport.setScroll`, `viewport.setSize`, `highDpi.resize`, etc.
- Manual RAF stub via `globalThis.requestAnimationFrame = ...` stays unchanged (doesn't use vi.*)

- [ ] **Step 1: Apply import-only swaps to the 11 simple files**

For each file in the "import only" list above, replace the vitest import line with the bun:test equivalent. Use sed for speed:

```bash
cd /Users/rongts/NovaSheet
for f in \
  packages/core/tests/_probe.test.ts \
  packages/core/tests/data/Schema.test.ts \
  packages/core/tests/helpers/recording-context.test.ts \
  packages/core/tests/layout/ChunkedAxis.test.ts \
  packages/core/tests/layout/Viewport.test.ts \
  packages/core/tests/render/CellPainter.test.ts \
  packages/core/tests/render/GridLinesPainter.test.ts \
  packages/core/tests/render/HeaderPainter.test.ts \
  packages/core/tests/render/Renderer.test.ts \
  packages/core/tests/scroll/ScrollMapper.test.ts \
  packages/core/tests/theme/denseGridTheme.test.ts
do
  sed -i '' "s/from 'vitest'/from 'bun:test'/g" "$f"
done
```

- [ ] **Step 2: Manually edit `data/InMemoryDataSource.test.ts`**

Replace import:
```ts
import { describe, expect, it, vi } from 'vitest'
```
with:
```ts
import { describe, expect, it, mock } from 'bun:test'
```

Then `s/vi\.fn()/mock(() => {})/g` in that file:
```bash
sed -i '' 's/vi\.fn()/mock(() => {})/g' packages/core/tests/data/InMemoryDataSource.test.ts
```

- [ ] **Step 3: Manually edit `render/HighDPI.test.ts`**

Replace import:
```ts
import { describe, expect, it, vi } from 'vitest'
```
with:
```ts
import { describe, expect, it } from 'bun:test'
import { stubGlobal, unstubAllGlobals } from '../helpers/global-stub'
```

Then replace `vi.stubGlobal` and `vi.unstubAllGlobals` calls:
```bash
sed -i '' 's/vi\.stubGlobal/stubGlobal/g; s/vi\.unstubAllGlobals/unstubAllGlobals/g' packages/core/tests/render/HighDPI.test.ts
```

- [ ] **Step 4: Manually edit `scroll/NativeScroller.test.ts`**

Replace import line:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
with:
```ts
import { afterEach, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'
```

Then:
```bash
sed -i '' 's/vi\.fn()/mock(() => {})/g; s/vi\.spyOn/spyOn/g' packages/core/tests/scroll/NativeScroller.test.ts
```

- [ ] **Step 5: Manually edit `util/raf.test.ts`**

Replace import line:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
with:
```ts
import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { stubGlobal, unstubAllGlobals } from '../helpers/global-stub'
```

Then:
```bash
sed -i '' 's/vi\.fn()/mock(() => {})/g; s/vi\.stubGlobal/stubGlobal/g; s/vi\.unstubAllGlobals/unstubAllGlobals/g' packages/core/tests/util/raf.test.ts
```

- [ ] **Step 6: Manually edit `Grid.test.ts`**

Replace import line:
```ts
import { describe, expect, it, vi } from 'vitest'
```
with:
```ts
import { describe, expect, it, spyOn } from 'bun:test'
```

Then:
```bash
sed -i '' 's/vi\.spyOn/spyOn/g' packages/core/tests/Grid.test.ts
```

- [ ] **Step 7: Verify no `vi.` or `from 'vitest'` remains**

```bash
grep -rn "from 'vitest'\|vi\." packages/core/tests/
```

Expected: NO output. If anything matches, investigate that file manually.

- [ ] **Step 8: Run the test suite under Bun**

```bash
cd /Users/rongts/NovaSheet
bun test
```

Expected: ALL 126 tests pass.

Common failure modes & fixes:
- `Cannot find module 'bun:test'`: Bun version too old. Upgrade to ≥ 1.2.
- `document is not defined`: setup.ts preload didn't fire. Check bunfig.toml `[test] preload` path and the cwd you're running from.
- `HTMLCanvasElement.prototype.getContext is undefined`: happy-dom didn't register. Check setup.ts.
- `mock is not a function`: Bun's mock API may be slightly different by version. Try `import { mock } from 'bun:test'` (which should already be there) and `mock()` without arguments. If still failing, fall back to `mock(() => {})`.
- `spyOn called on non-method`: Bun's spyOn requires the property to be a function. Same as Vitest. The spy targets should be fine.

- [ ] **Step 9: Typecheck**

```bash
bun run --filter @novasheet/core typecheck
```

Expected: clean.

- [ ] **Step 10: Lint**

```bash
bun run lint
```

Expected: clean. ESLint still runs (Bun shims Node for it).

- [ ] **Step 11: Commit**

```bash
git add packages/core/tests/
git commit -m "refactor(test): migrate 16 test files from vitest to bun:test"
```

---

### Task 6: Build system — replace tsup with Bun.build

**Files:**
- Create: `/Users/rongts/NovaSheet/packages/core/build.ts`
- Delete: `/Users/rongts/NovaSheet/packages/core/tsup.config.ts`
- Modify: `/Users/rongts/NovaSheet/packages/core/package.json`

- [ ] **Step 1: Create `packages/core/build.ts`**

```ts
/**
 * Build script — replaces tsup with Bun.build (for JS bundles) + tsc (for .d.ts).
 *
 * Outputs to dist/:
 *   - index.js       ESM bundle + index.js.map sourcemap
 *   - index.cjs      CJS bundle + index.cjs.map sourcemap
 *   - index.d.ts     TypeScript declarations (via tsc --emitDeclarationOnly)
 *   - index.d.cts    CJS-side declarations (copy of .d.ts — same shape)
 *
 * Run via: bun run build  (from packages/core/)
 */

import { rm, copyFile } from 'node:fs/promises'

const ROOT = new URL('.', import.meta.url).pathname

await rm(`${ROOT}dist`, { recursive: true, force: true })

const common = {
  entrypoints: [`${ROOT}src/index.ts`],
  outdir: `${ROOT}dist`,
  target: 'browser' as const,
  sourcemap: 'external' as const,
  minify: false,
} satisfies Parameters<typeof Bun.build>[0]

// ESM bundle
const esmResult = await Bun.build({ ...common, format: 'esm' })
if (!esmResult.success) {
  console.error('ESM build failed:', esmResult.logs)
  process.exit(1)
}

// CJS bundle — Bun emits .js by default; rename to .cjs via `naming`
const cjsResult = await Bun.build({
  ...common,
  format: 'cjs',
  naming: '[name].cjs',
})
if (!cjsResult.success) {
  console.error('CJS build failed:', cjsResult.logs)
  process.exit(1)
}

// Generate .d.ts via tsc — Bun.build doesn't emit declarations.
const dts = Bun.spawn(
  ['bunx', 'tsc', '--emitDeclarationOnly', '--outDir', `${ROOT}dist`, '--declaration', '--declarationMap'],
  { cwd: ROOT, stdout: 'inherit', stderr: 'inherit' },
)
const dtsExitCode = await dts.exited
if (dtsExitCode !== 0) {
  console.error('tsc declaration generation failed')
  process.exit(1)
}

// CJS consumers (per package.json exports.require.types) want .d.cts.
// tsc only emits .d.ts; copy to .d.cts so require() callers get types.
await copyFile(`${ROOT}dist/index.d.ts`, `${ROOT}dist/index.d.cts`)

console.log('✓ Build complete')
console.log('  ESM:', esmResult.outputs.map((o) => o.path).join(', '))
console.log('  CJS:', cjsResult.outputs.map((o) => o.path).join(', '))
console.log('  DTS: index.d.ts, index.d.cts')
```

- [ ] **Step 2: Update `packages/core/package.json` scripts and devDeps**

Open `/Users/rongts/NovaSheet/packages/core/package.json` and replace ENTIRELY with:

```json
{
  "name": "@novasheet/core",
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
  "devDependencies": {
    "@happy-dom/global-registrator": "^15.0.0",
    "happy-dom": "^14.7.1",
    "typescript": "^5.4.5"
  }
}
```

Changes vs prior:
- `"build": "tsup"` → `"build": "bun run build.ts"`
- `"test": "vitest --run"` → `"test": "bun test"`
- `"test:watch": "vitest"` → `"test:watch": "bun test --watch"`
- Removed `tsup` and `vitest` from devDependencies
- Added `@happy-dom/global-registrator` (from Task 4 Step 1)

- [ ] **Step 3: Delete `tsup.config.ts` and `vitest.config.ts`**

```bash
rm /Users/rongts/NovaSheet/packages/core/tsup.config.ts
rm /Users/rongts/NovaSheet/packages/core/vitest.config.ts
```

- [ ] **Step 4: Re-install (cleanup tsup/vitest from node_modules)**

```bash
cd /Users/rongts/NovaSheet
bun install
```

- [ ] **Step 5: Run the new build**

```bash
bun run --filter @novasheet/core build
```

Expected output:
```
✓ Build complete
  ESM: <path>/dist/index.js
  CJS: <path>/dist/index.cjs
  DTS: index.d.ts, index.d.cts
```

Inspect `packages/core/dist/`:
```bash
ls -la packages/core/dist/
```

Expected files:
- `index.js` (ESM)
- `index.js.map`
- `index.cjs` (CJS)
- `index.cjs.map`
- `index.d.ts`
- `index.d.cts`

- [ ] **Step 6: Verify public exports surface is preserved**

```bash
bun -e "import('./packages/core/dist/index.js').then(m => console.log(Object.keys(m).sort()))"
```

Expected:
```
[ "Grid", "InMemoryDataSource", "SAFE_MAX", "ScrollMapper", "denseGridTheme" ]
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/build.ts packages/core/package.json packages/core/tsup.config.ts packages/core/vitest.config.ts bun.lock
git commit -m "build(core): replace tsup with Bun.build + tsc DTS"
```

---

### Task 7: Update apps/storybook package.json scripts

**Files:**
- Modify: `/Users/rongts/NovaSheet/apps/storybook/package.json`

The Storybook CLI is a Node application. Bun's Node-compat shim runs it, but we keep the script invocations identical so we're not coupled to Bun semantics for Storybook commands. The change here is minimal — we just verify nothing breaks.

- [ ] **Step 1: Inspect current scripts**

```bash
cat apps/storybook/package.json
```

The scripts should already be:
```json
"scripts": {
  "storybook": "storybook dev -p 6006",
  "build-storybook": "storybook build"
}
```

No change required — these commands work under both Node and Bun.

- [ ] **Step 2: Verify storybook starts under Bun**

```bash
cd /Users/rongts/NovaSheet
timeout 10 bun run --filter @novasheet/storybook storybook 2>&1 | head -25 || true
```

Expected: "Storybook ... started" log appears within 10 seconds. The timeout kills it; that's fine.

Common failures & fixes:
- ESM/CJS resolve errors: pre-existing Storybook 8 + Vite quirk. Try removing `apps/storybook/node_modules/.vite` cache: `rm -rf apps/storybook/node_modules/.vite`. If still failing, downgrade Vite in apps/storybook to `^5.4.0` or move Storybook commands back to `node` (see Task 8 fallback).
- `Cannot find module 'storybook'`: re-run `bun install`.

- [ ] **Step 3: Verify storybook static build**

```bash
bun run --filter @novasheet/storybook build-storybook 2>&1 | tail -5
```

Expected: completes with "✓ built in Xs". Storybook static output in `apps/storybook/storybook-static/`.

- [ ] **Step 4: Clean up the static build artifact (it's gitignored but tidy)**

```bash
rm -rf apps/storybook/storybook-static
```

- [ ] **Step 5: Commit (only if anything actually changed)**

```bash
git status
```

If clean (likely), no commit needed for this task. If `apps/storybook/package.json` or its bun.lock-related changes need committing, do:

```bash
git add apps/storybook bun.lock
git commit -m "chore(storybook): verify storybook runs under bun (no code change)"
```

---

### Task 8: Storybook fallback path (only if Task 7 failed)

**Files:**
- Modify: `/Users/rongts/NovaSheet/apps/storybook/package.json`
- Modify: `/Users/rongts/NovaSheet/package.json` (root scripts)

**Skip this task entirely if Task 7 Step 2 + Step 3 both succeeded.**

If Storybook fails under Bun, route Storybook commands through Node while keeping the rest of the toolchain on Bun.

- [ ] **Step 1: Add Node prefix to storybook scripts**

In `/Users/rongts/NovaSheet/apps/storybook/package.json`:

```json
"scripts": {
  "storybook": "node --experimental-vm-modules ./node_modules/storybook/bin/index.js dev -p 6006",
  "build-storybook": "node --experimental-vm-modules ./node_modules/storybook/bin/index.js build"
}
```

(Path to the storybook binary may differ slightly; check `ls node_modules/storybook/bin/` and adjust.)

- [ ] **Step 2: Verify**

```bash
timeout 10 bun run --filter @novasheet/storybook storybook 2>&1 | head -25 || true
```

The `bun run` invokes the script which itself calls `node`. Should work.

- [ ] **Step 3: Document the fallback in CLAUDE.md**

Append to the Toolchain section of CLAUDE.md (will be edited in Task 9; just take note for now). Wording suggestion:

> Storybook commands invoke Node directly (`node --experimental-vm-modules ...`) because Storybook 8 + Vite has known compatibility issues under Bun's Node-shim. All other commands (test, build, lint, install) use Bun natively.

- [ ] **Step 4: Commit**

```bash
git add apps/storybook/package.json
git commit -m "chore(storybook): route storybook commands through node (bun shim incompatibility)"
```

---

### Task 9: CI workflow — switch to setup-bun + bun commands

**Files:**
- Modify: `/Users/rongts/NovaSheet/.github/workflows/ci.yml`

- [ ] **Step 1: Replace the workflow**

Replace `/Users/rongts/NovaSheet/.github/workflows/ci.yml` ENTIRELY with:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  verify:
    name: lint · typecheck · test · build
    runs-on: ubuntu-latest
    timeout-minutes: 10
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
        with:
          bun-version: latest

      - name: Install
        run: bun install --frozen-lockfile

      - name: Lint
        run: bun run lint

      - name: Typecheck
        run: bun run --filter @novasheet/core typecheck

      - name: Test
        run: bun test

      - name: Build
        run: bun run --filter @novasheet/core build
```

Changes vs prior:
- Removed `pnpm/action-setup` + `actions/setup-node`
- Added `oven-sh/setup-bun@v1`
- `pnpm install` → `bun install`
- `pnpm lint` → `bun run lint`
- `pnpm --filter @novasheet/core typecheck` → `bun run --filter @novasheet/core typecheck`
- `pnpm --filter @novasheet/core test` → `bun test`
- `pnpm --filter @novasheet/core build` → `bun run --filter @novasheet/core build`

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: switch to setup-bun + bun commands"
```

> Note: This will only get verified once you push the commit. The first CI run after push should pass; if it fails because the GitHub runner's Bun doesn't honor `bunfig.toml [test] preload` from cwd, switch the `Test` step to `cd packages/core && bun test`.

---

### Task 10: Documentation updates

**Files:**
- Modify: `/Users/rongts/NovaSheet/CLAUDE.md`
- Modify: `/Users/rongts/NovaSheet/README.md`

- [ ] **Step 1: Update CLAUDE.md "Toolchain" section**

Open `/Users/rongts/NovaSheet/CLAUDE.md`, find the section starting with `## Toolchain (NON-NEGOTIABLE)`, and REPLACE that section's body with:

```markdown
## Toolchain (NON-NEGOTIABLE)

- **Package manager + runtime:** `bun` (≥ 1.2). **NEVER** use `npm`, `yarn`, or `pnpm` — they will desync the lockfile and break CI.
- **Test:** `bun test` (top-level). Tests live in `packages/core/tests/`. Setup is preloaded via `bunfig.toml` (`[test] preload = ["./packages/core/tests/setup.ts"]`).
- **Typecheck:** `bun run --filter @novasheet/core typecheck` — TypeScript is strict + `noUncheckedIndexedAccess` + `verbatimModuleSyntax`.
- **Lint:** `bun run lint` — must be clean (0 errors, 0 warnings).
- **Build:** `bun run --filter @novasheet/core build` (custom `build.ts` invoking `Bun.build` for ESM + CJS + `tsc --emitDeclarationOnly` for .d.ts).
- **Storybook:** `bun run storybook` (or `bun run --filter @novasheet/storybook storybook`).
- **All four (lint, typecheck, test, build) must pass** before any commit lands on `main` (CI enforces).
- **Mock APIs in tests:** `bun:test` exports `mock` and `spyOn` (replaces Vitest's `vi.fn` / `vi.spyOn`). For global stubbing (no `vi.stubGlobal` in bun:test), use `packages/core/tests/helpers/global-stub.ts` (`stubGlobal` / `unstubAllGlobals`).
```

- [ ] **Step 2: Update CLAUDE.md "Testing conventions" section**

In the same file, find `## Testing conventions` and replace its body with:

```markdown
## Testing conventions

- **TDD strict.** Write the failing test first, see it fail, implement, see it pass, commit. Plan steps follow this exact rhythm.
- **Canvas tests use `RecordingContext2D`** (`tests/helpers/recording-context.ts`) — captures ctx instruction sequences as `{ op, args }` objects. Assert on instruction sequences, not on pixels.
- **`tests/setup.ts`** is preloaded by Bun (via `bunfig.toml [test] preload`). It registers happy-dom globally and installs the `RecordingContext` onto `HTMLCanvasElement.prototype.getContext('2d')` — Bun runtime alone has no DOM.
- **`bun:test` import**: `import { describe, expect, it, mock, spyOn } from 'bun:test'`. NOT `from 'vitest'`.
- **Global stubbing**: `import { stubGlobal, unstubAllGlobals } from '../helpers/global-stub'` (bun:test has no built-in equivalent of `vi.stubGlobal`).
- **Type-only failing tests** (Schema, DataSource interface) won't fail at runtime in `bun test` because TS imports erase. Use `tsc --noEmit` to verify the "test fails before implementation" gate for type-only modules.
```

- [ ] **Step 3: Update README.md "Quick Start" and "开发脚本" sections**

In `/Users/rongts/NovaSheet/README.md`, find the "Quick Start" code block and update to:

```bash
bun install
bun run --filter @novasheet/core build
```

And the "开发脚本" section to:

```bash
bun install                # 安装依赖
bun test                   # 跑全部包测试
bun run --filter @novasheet/core build           # 构建 core 包
bun run lint               # ESLint
bun run format             # Prettier 全量格式化
bun run storybook          # 启动组件变体玩具间（localhost:6006）
bun run build-storybook    # 构建静态 storybook 站点
```

Also remove the "针对单包" subsection's pnpm-specific invocations (or update them to `bun run --filter ...`).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: update toolchain references to bun (pnpm → bun migration)"
```

---

### Task 11: Final integration verification + commit cleanup

**Files:** (no source changes; verification + cleanup only)

- [ ] **Step 1: Run the full verification chain under Bun**

```bash
cd /Users/rongts/NovaSheet
bun install --frozen-lockfile
bun run lint
bun run --filter @novasheet/core typecheck
bun test
bun run --filter @novasheet/core build
```

Expected: each command completes with 0 exit code. Test count: 126 passing. Build output: 6 files in `packages/core/dist/`.

- [ ] **Step 2: Verify public exports surface**

```bash
bun -e "import('./packages/core/dist/index.js').then(m => console.log(Object.keys(m).sort()))"
```

Expected: `[ "Grid", "InMemoryDataSource", "SAFE_MAX", "ScrollMapper", "denseGridTheme" ]`

- [ ] **Step 3: Verify storybook starts**

```bash
timeout 8 bun run storybook 2>&1 | head -15 || true
```

Expected: `Storybook ... started` line visible within 8 seconds.

- [ ] **Step 4: Compare against baseline**

```bash
cat /tmp/bun-migration-baseline.txt
```

Then run the same operations under Bun and compare:

```bash
{
  echo "=== Bun ==="
  echo "Bun: $(bun --version)"
  echo "Tests count: $(bun test 2>&1 | grep -E 'tests|pass' | tail -2)"
  echo "--- test time ---"
  { time bun test 2>&1 | tail -1; } 2>&1
  echo "--- build time ---"
  { time bun run --filter @novasheet/core build 2>&1 | tail -1; } 2>&1
} > /tmp/bun-migration-result.txt 2>&1

diff /tmp/bun-migration-baseline.txt /tmp/bun-migration-result.txt || true
cat /tmp/bun-migration-result.txt
```

Expected: test time and build time both significantly lower than baseline. Report numbers in the commit message.

- [ ] **Step 5: Search for any lingering pnpm references**

```bash
grep -rn "pnpm" --include="*.ts" --include="*.json" --include="*.md" --include="*.yml" --include="*.yaml" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=storybook-static \
  /Users/rongts/NovaSheet | grep -v "pnpm → bun\|former: pnpm\|was pnpm"
```

Expected: no matches (or only matches in docs explaining the migration history).

If something matches, fix it.

- [ ] **Step 6: Search for any lingering vitest / tsup references**

```bash
grep -rn "vitest\|tsup" --include="*.ts" --include="*.json" --include="*.md" --include="*.yml" --include="*.yaml" \
  --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=storybook-static \
  /Users/rongts/NovaSheet
```

Expected: no matches.

- [ ] **Step 7: Final commit (any fixes from steps 5/6) and push**

```bash
git status
# If clean from steps 5/6, no commit needed.
# Otherwise:
git add -A
git commit -m "chore(bun): clean up lingering pnpm/vitest/tsup references"

git push origin main
```

- [ ] **Step 8: Tag the migration**

```bash
git tag bun-migration
git push origin bun-migration
```

---

## Migration Completion Checklist

When all tasks above pass, the following should be true:

- [ ] `bun --version` ≥ 1.2 on dev machine
- [ ] `bun.lock` exists at repo root; `pnpm-lock.yaml` and `pnpm-workspace.yaml` deleted
- [ ] Root `package.json` has `"workspaces": ["packages/*", "apps/*"]`
- [ ] `bunfig.toml` at root with `[test] preload = ["./packages/core/tests/setup.ts"]`
- [ ] `packages/core/tests/setup.ts` registers happy-dom globally and stubs canvas getContext
- [ ] `packages/core/tests/helpers/global-stub.ts` provides `stubGlobal` / `unstubAllGlobals`
- [ ] All 16 test files import from `'bun:test'`, not `'vitest'`
- [ ] No `vi.*` calls anywhere in tests
- [ ] `packages/core/build.ts` produces ESM + CJS + DTS
- [ ] `tsup.config.ts` and `vitest.config.ts` deleted
- [ ] CI workflow uses `oven-sh/setup-bun@v1` and `bun` commands
- [ ] CLAUDE.md "Toolchain" + "Testing conventions" sections refer to Bun
- [ ] README.md install/test/build commands use Bun
- [ ] Full chain passes: `bun install --frozen-lockfile && bun run lint && bun run --filter @novasheet/core typecheck && bun test && bun run --filter @novasheet/core build`
- [ ] 126 tests passing under `bun test`
- [ ] Build dist matches prior shape (ESM + CJS + d.ts + d.cts)
- [ ] Storybook starts successfully (under Bun or via Node fallback per Task 8)
- [ ] git tag `bun-migration` exists on remote
- [ ] No grep matches for `pnpm`, `vitest`, or `tsup` (except in historical docs)
