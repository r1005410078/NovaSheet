# NovaSheet M1 · Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the NovaSheet monorepo and build the data + layout + theme + static rendering foundation. At the end of M1, `new Grid(el, { data })` can render a single static frame of a small dataset (100 rows × 5 cols) to a canvas — no scrolling, no interaction, no frozen panes yet (M2-M4 add those).

**Architecture:** TypeScript-first monorepo (pnpm workspaces); `@novasheet/core` is framework-agnostic. Layered architecture per spec: Data → Layout → Theme + Viewport → Render → Grid facade. Test strategy: TDD with Vitest + happy-dom, custom `RecordingContext2D` for canvas instruction-level assertions (instead of pixel diff).

**Tech Stack:** TypeScript 5.4+ (strict), pnpm workspaces, tsup (build), Vitest (test + bench), happy-dom (DOM env), ESLint + Prettier, Node 20+.

**Spec reference:** [docs/superpowers/specs/2026-05-13-novasheet-phase1-canvas-grid-design.md](../specs/2026-05-13-novasheet-phase1-canvas-grid-design.md)

**Out of scope for M1 (covered in later milestones):**
- Scrolling / virtualization (M2)
- Frozen rows / cols, dynamic row height (M3)
- Resize interaction, React wrapper (M4)
- Playground app, Playwright tests, iOS Safari validation (M5)

---

## File Structure

### Files created in M1

```
NovaSheet/
├── .gitignore
├── .editorconfig
├── .prettierrc
├── .eslintrc.cjs
├── pnpm-workspace.yaml
├── package.json                            # root: scripts only
├── tsconfig.base.json
└── packages/
    └── core/
        ├── package.json                    # @novasheet/core
        ├── tsconfig.json                   # extends base
        ├── tsup.config.ts                  # build config
        ├── vitest.config.ts                # test config
        ├── src/
        │   ├── index.ts                    # public re-exports
        │   ├── Grid.ts                     # facade
        │   ├── types.ts                    # shared types
        │   ├── data/
        │   │   ├── Schema.ts               # FieldType, Field, Schema, CellValue, Row
        │   │   ├── DataSource.ts           # interface + event types
        │   │   └── InMemoryDataSource.ts   # sync in-memory implementation
        │   ├── theme/
        │   │   ├── Theme.ts                # Theme interface
        │   │   └── denseGridTheme.ts       # default theme
        │   ├── layout/
        │   │   ├── ChunkedAxis.ts          # chunked offset math
        │   │   ├── FrozenRegions.ts        # M1 stub: returns single `main` quadrant
        │   │   └── Viewport.ts             # snapshot aggregator
        │   ├── render/
        │   │   ├── HighDPI.ts              # canvas DPR sizing
        │   │   ├── GridLinesPainter.ts     # grid lines (Path2D batched)
        │   │   ├── CellPainter.ts          # text + number + fallback
        │   │   ├── HeaderPainter.ts        # column headers
        │   │   └── Renderer.ts             # RAF + flush + per-quadrant drawing
        │   └── util/
        │       ├── raf.ts                  # FrameScheduler singleton
        │       ├── BinarySearch.ts         # generic lowerBound
        │       └── ChunkArray.ts           # Chunk struct + helpers
        └── tests/
            ├── helpers/
            │   └── recording-context.ts    # RecordingContext2D for ctx instruction capture
            ├── data/
            │   ├── Schema.test.ts
            │   └── InMemoryDataSource.test.ts
            ├── theme/
            │   └── denseGridTheme.test.ts
            ├── layout/
            │   ├── ChunkedAxis.test.ts
            │   └── Viewport.test.ts
            ├── util/
            │   └── raf.test.ts
            ├── render/
            │   ├── HighDPI.test.ts
            │   ├── GridLinesPainter.test.ts
            │   ├── CellPainter.test.ts
            │   ├── HeaderPainter.test.ts
            │   └── Renderer.test.ts
            └── Grid.test.ts                # integration smoke test
```

### Files explicitly **not** created in M1

- `src/scroll/*` (M2: NativeScroller, ScrollMapper)
- `src/render/FrozenPainter.ts` (M3)
- `src/interaction/*` (M4)
- `packages/react/*` (M4)
- `apps/playground/*` (M5)

---

## Conventions

- **TDD strict**: every behavior gets a failing test before implementation.
- **Commit cadence**: one commit per completed task (each task ends with a commit step).
- **No exports until needed**: only re-export from `index.ts` once a module is used by a public API.
- **Test paths use `vitest --run`** for CI parity (no watch mode in plan commands).
- **Working directory**: `/Users/rongts/NovaSheet` for all commands unless stated otherwise.

---

### Task 1: Repo & tooling bootstrap

**Files:**
- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `.prettierrc`
- Create: `.eslintrc.cjs`
- Create: `pnpm-workspace.yaml`
- Create: `package.json` (root)
- Create: `tsconfig.base.json`

- [ ] **Step 1: Initialize git and ensure pnpm is available**

```bash
cd /Users/rongts/NovaSheet
git init
pnpm --version  # require >= 9; if missing, install: npm i -g pnpm
node --version  # require >= 20
```

Expected: git initializes; pnpm and node versions print without error.

- [ ] **Step 2: Write `.gitignore`**

```
node_modules
dist
coverage
.tsbuildinfo
.DS_Store
.vscode
.idea
*.log
.superpowers/
```

- [ ] **Step 3: Write `.editorconfig`**

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
```

- [ ] **Step 4: Write `.prettierrc`**

```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "arrowParens": "always"
}
```

- [ ] **Step 5: Write `.eslintrc.cjs`**

```js
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['dist', 'node_modules', 'coverage'],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/consistent-type-imports': 'error',
  },
}
```

- [ ] **Step 6: Write `pnpm-workspace.yaml`**

```yaml
packages:
  - 'packages/*'
  - 'apps/*'
```

- [ ] **Step 7: Write root `package.json`**

```json
{
  "name": "novasheet",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "pnpm -r run build",
    "test": "pnpm -r run test",
    "lint": "eslint packages",
    "format": "prettier --write \"**/*.{ts,tsx,js,json,md}\""
  },
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^7.8.0",
    "@typescript-eslint/parser": "^7.8.0",
    "eslint": "^8.57.0",
    "prettier": "^3.2.5",
    "typescript": "^5.4.5"
  }
}
```

- [ ] **Step 8: Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 9: Install root dependencies**

Run: `pnpm install`
Expected: lockfile created, no errors.

- [ ] **Step 10: Commit**

```bash
git add .
git commit -m "chore: bootstrap monorepo with pnpm, ts, eslint, prettier"
```

---

### Task 2: Create `@novasheet/core` package skeleton + test helper

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/tsup.config.ts`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/tests/helpers/recording-context.ts`
- Create: `packages/core/tests/helpers/recording-context.test.ts`

- [ ] **Step 1: Write `packages/core/package.json`**

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
    "build": "tsup",
    "test": "vitest --run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "happy-dom": "^14.7.1",
    "tsup": "^8.0.2",
    "typescript": "^5.4.5",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Write `packages/core/tsconfig.json`**

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

- [ ] **Step 3: Write `packages/core/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2022',
})
```

- [ ] **Step 4: Write `packages/core/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    coverage: { reporter: ['text', 'html'], include: ['src/**/*.ts'] },
  },
})
```

- [ ] **Step 5: Write placeholder `packages/core/src/index.ts`**

```ts
export {}
```

- [ ] **Step 6: Install dependencies**

Run: `pnpm install`
Expected: `@novasheet/core` linked into workspace; deps install without error.

- [ ] **Step 7: Write `RecordingContext2D` failing test**

Create `packages/core/tests/helpers/recording-context.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createRecordingContext } from './recording-context'

describe('RecordingContext2D', () => {
  it('records fillRect calls with arguments', () => {
    const { ctx, ops } = createRecordingContext()
    ctx.fillStyle = '#fff'
    ctx.fillRect(10, 20, 100, 200)
    expect(ops).toEqual([
      { op: 'set:fillStyle', value: '#fff' },
      { op: 'fillRect', args: [10, 20, 100, 200] },
    ])
  })

  it('records save/restore and clip', () => {
    const { ctx, ops } = createRecordingContext()
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, 10, 10)
    ctx.clip()
    ctx.restore()
    expect(ops.map((o) => o.op)).toEqual(['save', 'beginPath', 'rect', 'clip', 'restore'])
  })

  it('measureText returns deterministic width based on string length', () => {
    const { ctx } = createRecordingContext()
    const m = ctx.measureText('abcdef')
    expect(m.width).toBe(6 * 7) // 6 chars × 7px default
  })
})
```

- [ ] **Step 8: Run test to verify it fails**

Run: `pnpm --filter @novasheet/core test`
Expected: FAIL (module not found).

- [ ] **Step 9: Implement `RecordingContext2D`**

Create `packages/core/tests/helpers/recording-context.ts`:

```ts
export type RecordedOp =
  | { op: 'save' }
  | { op: 'restore' }
  | { op: 'beginPath' }
  | { op: 'clip' }
  | { op: 'rect'; args: [number, number, number, number] }
  | { op: 'fillRect'; args: [number, number, number, number] }
  | { op: 'clearRect'; args: [number, number, number, number] }
  | { op: 'fillText'; args: [string, number, number, number?] }
  | { op: 'strokeText'; args: [string, number, number, number?] }
  | { op: 'moveTo'; args: [number, number] }
  | { op: 'lineTo'; args: [number, number] }
  | { op: 'stroke' }
  | { op: 'fill' }
  | { op: 'setTransform'; args: [number, number, number, number, number, number] }
  | { op: 'set:fillStyle'; value: string | CanvasGradient | CanvasPattern }
  | { op: 'set:strokeStyle'; value: string | CanvasGradient | CanvasPattern }
  | { op: 'set:font'; value: string }
  | { op: 'set:textBaseline'; value: CanvasTextBaseline }
  | { op: 'set:textAlign'; value: CanvasTextAlign }
  | { op: 'set:lineWidth'; value: number }

const CHAR_WIDTH = 7 // deterministic default for measureText

export function createRecordingContext(width = 800, height = 600): {
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  ops: RecordedOp[]
} {
  const ops: RecordedOp[] = []
  const canvas = { width, height, style: {} } as unknown as HTMLCanvasElement

  let _fillStyle: string | CanvasGradient | CanvasPattern = '#000'
  let _strokeStyle: string | CanvasGradient | CanvasPattern = '#000'
  let _font = '10px sans-serif'
  let _textBaseline: CanvasTextBaseline = 'alphabetic'
  let _textAlign: CanvasTextAlign = 'left'
  let _lineWidth = 1

  const ctx = {
    canvas,
    get fillStyle() { return _fillStyle },
    set fillStyle(v) { _fillStyle = v; ops.push({ op: 'set:fillStyle', value: v }) },
    get strokeStyle() { return _strokeStyle },
    set strokeStyle(v) { _strokeStyle = v; ops.push({ op: 'set:strokeStyle', value: v }) },
    get font() { return _font },
    set font(v) { _font = v; ops.push({ op: 'set:font', value: v }) },
    get textBaseline() { return _textBaseline },
    set textBaseline(v) { _textBaseline = v; ops.push({ op: 'set:textBaseline', value: v }) },
    get textAlign() { return _textAlign },
    set textAlign(v) { _textAlign = v; ops.push({ op: 'set:textAlign', value: v }) },
    get lineWidth() { return _lineWidth },
    set lineWidth(v) { _lineWidth = v; ops.push({ op: 'set:lineWidth', value: v }) },

    save() { ops.push({ op: 'save' }) },
    restore() { ops.push({ op: 'restore' }) },
    beginPath() { ops.push({ op: 'beginPath' }) },
    clip() { ops.push({ op: 'clip' }) },
    rect(x: number, y: number, w: number, h: number) { ops.push({ op: 'rect', args: [x, y, w, h] }) },
    fillRect(x: number, y: number, w: number, h: number) { ops.push({ op: 'fillRect', args: [x, y, w, h] }) },
    clearRect(x: number, y: number, w: number, h: number) { ops.push({ op: 'clearRect', args: [x, y, w, h] }) },
    fillText(text: string, x: number, y: number, maxWidth?: number) {
      ops.push({ op: 'fillText', args: maxWidth === undefined ? [text, x, y] : [text, x, y, maxWidth] })
    },
    strokeText(text: string, x: number, y: number, maxWidth?: number) {
      ops.push({ op: 'strokeText', args: maxWidth === undefined ? [text, x, y] : [text, x, y, maxWidth] })
    },
    moveTo(x: number, y: number) { ops.push({ op: 'moveTo', args: [x, y] }) },
    lineTo(x: number, y: number) { ops.push({ op: 'lineTo', args: [x, y] }) },
    stroke() { ops.push({ op: 'stroke' }) },
    fill() { ops.push({ op: 'fill' }) },
    setTransform(a: number, b: number, c: number, d: number, e: number, f: number) {
      ops.push({ op: 'setTransform', args: [a, b, c, d, e, f] })
    },
    measureText(s: string): TextMetrics {
      return { width: s.length * CHAR_WIDTH } as TextMetrics
    },
    createLinearGradient(): CanvasGradient {
      return { addColorStop: () => {} } as unknown as CanvasGradient
    },
  } as unknown as CanvasRenderingContext2D

  return { canvas, ctx, ops }
}
```

- [ ] **Step 10: Run test to verify it passes**

Run: `pnpm --filter @novasheet/core test`
Expected: PASS, 3 tests passing.

- [ ] **Step 11: Commit**

```bash
git add packages/core
git commit -m "feat(core): scaffold @novasheet/core package with vitest + recording context"
```

---

### Task 3: Schema, Field, CellValue, Row types

**Files:**
- Create: `packages/core/src/data/Schema.ts`
- Create: `packages/core/src/types.ts`
- Test: `packages/core/tests/data/Schema.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/core/tests/data/Schema.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Field, FieldType, Schema } from '../../src/data/Schema'

describe('Schema types', () => {
  it('FieldType covers all 7 Phase 1 types', () => {
    const types: FieldType[] = ['text', 'number', 'singleSelect', 'multiSelect', 'date', 'checkbox', 'url']
    expect(types).toHaveLength(7)
  })

  it('Field has required id/name/type/width', () => {
    const f: Field = { id: 'f1', name: 'Title', type: 'text', width: 200 }
    expect(f.id).toBe('f1')
    expect(f.width).toBe(200)
  })

  it('Schema fields are readonly', () => {
    const schema: Schema = {
      fields: [{ id: 'a', name: 'A', type: 'text', width: 100 }],
    }
    expect(schema.fields).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @novasheet/core test tests/data/Schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `Schema.ts`**

Create `packages/core/src/data/Schema.ts`:

```ts
export type FieldType =
  | 'text'
  | 'number'
  | 'singleSelect'
  | 'multiSelect'
  | 'date'
  | 'checkbox'
  | 'url'

export interface Field {
  readonly id: string
  readonly name: string
  readonly type: FieldType
  width: number
  hidden?: boolean
  options?: Record<string, unknown>
}

export interface Schema {
  readonly fields: readonly Field[]
}

export type CellValue = string | number | boolean | null | readonly string[] | Date

export type Row = Record<string, CellValue>
```

- [ ] **Step 4: Create `types.ts` re-exporting shared types**

Create `packages/core/src/types.ts`:

```ts
export type { CellValue, Field, FieldType, Row, Schema } from './data/Schema'
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @novasheet/core test tests/data/Schema.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): add Schema/Field/FieldType/CellValue/Row types"
```

---

### Task 4: DataSource interface + InMemoryDataSource

**Files:**
- Create: `packages/core/src/data/DataSource.ts`
- Create: `packages/core/src/data/InMemoryDataSource.ts`
- Test: `packages/core/tests/data/InMemoryDataSource.test.ts`

- [ ] **Step 1: Write failing tests for InMemoryDataSource**

Create `packages/core/tests/data/InMemoryDataSource.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import type { Schema } from '../../src/data/Schema'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'

const SCHEMA: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 200 },
    { id: 'age', name: 'Age', type: 'number', width: 80 },
  ],
}

describe('InMemoryDataSource', () => {
  it('reports row count and schema', () => {
    const ds = new InMemoryDataSource({
      schema: SCHEMA,
      rows: [{ name: 'A', age: 1 }, { name: 'B', age: 2 }],
    })
    expect(ds.getRowCount()).toBe(2)
    expect(ds.getSchema()).toBe(SCHEMA)
  })

  it('getRows returns the requested inclusive slice', () => {
    // endIndex is INCLUSIVE — matches ChunkedAxis.getVisibleRange [first, last] semantics
    const rows = Array.from({ length: 10 }, (_, i) => ({ name: `n${i}`, age: i }))
    const ds = new InMemoryDataSource({ schema: SCHEMA, rows })
    expect(ds.getRows(2, 5)).toEqual([
      { name: 'n2', age: 2 },
      { name: 'n3', age: 3 },
      { name: 'n4', age: 4 },
      { name: 'n5', age: 5 },
    ])
  })

  it('getRows clamps to valid range', () => {
    const rows = [{ name: 'a', age: 1 }]
    const ds = new InMemoryDataSource({ schema: SCHEMA, rows })
    expect(ds.getRows(-5, 10)).toEqual([{ name: 'a', age: 1 }])
  })

  it('getCell returns the cell value or undefined for missing row', () => {
    const ds = new InMemoryDataSource({
      schema: SCHEMA,
      rows: [{ name: 'A', age: 1 }],
    })
    expect(ds.getCell(0, 'name')).toBe('A')
    expect(ds.getCell(0, 'unknown')).toBeUndefined()
    expect(ds.getCell(99, 'name')).toBeUndefined()
  })

  it('updateCell emits rowsChanged for affected row', () => {
    const ds = new InMemoryDataSource({
      schema: SCHEMA,
      rows: [{ name: 'A', age: 1 }],
    })
    const listener = vi.fn()
    ds.subscribe(listener)
    ds.updateCell(0, 'age', 42)
    expect(ds.getCell(0, 'age')).toBe(42)
    expect(listener).toHaveBeenCalledWith({
      type: 'rowsChanged',
      startIndex: 0,
      endIndex: 0,
    })
  })

  it('setRows emits reset + rowCountChanged', () => {
    const ds = new InMemoryDataSource({ schema: SCHEMA, rows: [{ name: 'A', age: 1 }] })
    const listener = vi.fn()
    ds.subscribe(listener)
    ds.setRows([{ name: 'X', age: 9 }, { name: 'Y', age: 8 }])
    expect(ds.getRowCount()).toBe(2)
    expect(listener).toHaveBeenCalledWith({ type: 'rowCountChanged', newCount: 2 })
    expect(listener).toHaveBeenCalledWith({ type: 'reset' })
  })

  it('subscribe returns an unsubscribe function', () => {
    const ds = new InMemoryDataSource({ schema: SCHEMA, rows: [] })
    const listener = vi.fn()
    const unsub = ds.subscribe(listener)
    unsub()
    ds.setRows([{ name: 'A', age: 1 }])
    expect(listener).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @novasheet/core test tests/data/InMemoryDataSource.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `DataSource.ts`**

Create `packages/core/src/data/DataSource.ts`:

```ts
import type { CellValue, Row, Schema } from './Schema'

export type DataSourceEvent =
  | { type: 'reset' }
  | { type: 'rowsChanged'; startIndex: number; endIndex: number }
  | { type: 'schemaChanged' }
  | { type: 'rowCountChanged'; newCount: number }

export type DataSourceListener = (event: DataSourceEvent) => void

export interface DataSource {
  getRowCount(): number
  getSchema(): Schema
  /**
   * Range prefetch channel. Renderer calls once per frame with the visible row range.
   * endIndex is INCLUSIVE — matches ChunkedAxis.getVisibleRange [first, last] semantics.
   * Sync impls return rows immediately; async impls may return a Promise that resolves
   * after IO. Async resolution should emit a `rowsChanged` event to trigger re-paint.
   */
  getRows(startIndex: number, endIndex: number): Row[] | Promise<Row[]>
  /**
   * Hot-path cell read. Must be synchronous. Returns undefined if the row/field is not
   * loaded (async sources draw placeholder until `rowsChanged` arrives).
   */
  getCell(rowIndex: number, fieldId: string): CellValue | undefined
  subscribe(listener: DataSourceListener): () => void
}
```

- [ ] **Step 4: Implement `InMemoryDataSource.ts`**

Create `packages/core/src/data/InMemoryDataSource.ts`:

```ts
import type { DataSource, DataSourceEvent, DataSourceListener } from './DataSource'
import type { CellValue, Row, Schema } from './Schema'

export class InMemoryDataSource implements DataSource {
  private schema: Schema
  private rows: Row[]
  private listeners = new Set<DataSourceListener>()

  constructor(opts: { schema: Schema; rows: Row[] }) {
    this.schema = opts.schema
    this.rows = opts.rows.slice()
  }

  getRowCount(): number {
    return this.rows.length
  }

  getSchema(): Schema {
    return this.schema
  }

  getRows(startIndex: number, endIndex: number): Row[] {
    const start = Math.max(0, startIndex)
    const end = Math.min(this.rows.length, endIndex + 1)
    if (end <= start) return []
    return this.rows.slice(start, end)
  }

  getCell(rowIndex: number, fieldId: string): CellValue | undefined {
    const row = this.rows[rowIndex]
    if (!row) return undefined
    return row[fieldId]
  }

  subscribe(listener: DataSourceListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  updateCell(rowIndex: number, fieldId: string, value: CellValue): void {
    const row = this.rows[rowIndex]
    if (!row) return
    row[fieldId] = value
    this.emit({ type: 'rowsChanged', startIndex: rowIndex, endIndex: rowIndex })
  }

  setRows(rows: Row[]): void {
    this.rows = rows.slice()
    this.emit({ type: 'rowCountChanged', newCount: this.rows.length })
    this.emit({ type: 'reset' })
  }

  private emit(event: DataSourceEvent): void {
    for (const l of this.listeners) l(event)
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @novasheet/core test tests/data/InMemoryDataSource.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): add DataSource interface and InMemoryDataSource"
```

---

### Task 5: Theme interface + denseGridTheme

**Files:**
- Create: `packages/core/src/theme/Theme.ts`
- Create: `packages/core/src/theme/denseGridTheme.ts`
- Test: `packages/core/tests/theme/denseGridTheme.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/theme/denseGridTheme.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { denseGridTheme } from '../../src/theme/denseGridTheme'

describe('denseGridTheme', () => {
  it('exposes dense grid metrics', () => {
    expect(denseGridTheme.metrics.rowHeight).toBe(28)
    expect(denseGridTheme.metrics.headerHeight).toBe(32)
    expect(denseGridTheme.metrics.fontSize).toBeGreaterThanOrEqual(12)
    expect(denseGridTheme.metrics.fontSize).toBeLessThanOrEqual(13)
    expect(denseGridTheme.metrics.borderWidth).toBe(1)
  })

  it('declares all 7 field-type icons', () => {
    const types = ['text', 'number', 'singleSelect', 'multiSelect', 'date', 'checkbox', 'url'] as const
    for (const t of types) {
      expect(denseGridTheme.icons.byFieldType[t]).toBeDefined()
    }
  })

  it('provides text alignment by field type', () => {
    expect(denseGridTheme.cell.textAlignByType.text).toBe('left')
    expect(denseGridTheme.cell.textAlignByType.number).toBe('right')
  })

  it('colors include grid line and background', () => {
    expect(denseGridTheme.colors.background).toMatch(/^#|^rgb/)
    expect(denseGridTheme.colors.gridLine).toMatch(/^#|^rgb/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @novasheet/core test tests/theme/denseGridTheme.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `Theme.ts`**

Create `packages/core/src/theme/Theme.ts`:

```ts
import type { FieldType } from '../data/Schema'

export interface IconDef {
  /** SVG path data, fits in 16x16 viewBox */
  readonly path: string
}

export interface ThemeMetrics {
  readonly rowHeight: number
  readonly headerHeight: number
  readonly cellPaddingX: number
  readonly cellPaddingY: number
  readonly fontSize: number
  readonly fontFamily: string
  readonly borderWidth: number
}

export interface ThemeColors {
  readonly background: string
  readonly headerBackground: string
  readonly text: string
  readonly headerText: string
  readonly gridLine: string
  readonly gridLineStrong: string
  readonly frozenShadow: string
  readonly hoverRowBg: string
  readonly selectionBg: string
  readonly selectionBorder: string
}

export interface ThemeCell {
  readonly textAlignByType: Readonly<Record<FieldType, CanvasTextAlign>>
  readonly tagRadius: number
  readonly tagPaddingX: number
}

export interface ThemeIcons {
  readonly byFieldType: Readonly<Record<FieldType, IconDef>>
}

export interface ThemeScrollbar {
  readonly trackWidth: number
  readonly thumbColor: string
}

export interface Theme {
  readonly metrics: ThemeMetrics
  readonly colors: ThemeColors
  readonly cell: ThemeCell
  readonly icons: ThemeIcons
  readonly scrollbar: ThemeScrollbar
}
```

- [ ] **Step 4: Implement `denseGridTheme.ts`**

Create `packages/core/src/theme/denseGridTheme.ts`:

```ts
import type { Theme } from './Theme'

const simpleIcon = (path: string) => ({ path }) as const

export const denseGridTheme: Theme = {
  metrics: {
    rowHeight: 28,
    headerHeight: 32,
    cellPaddingX: 8,
    cellPaddingY: 4,
    fontSize: 12,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    borderWidth: 1,
  },
  colors: {
    background: '#ffffff',
    headerBackground: '#f6f8fa',
    text: '#1f2328',
    headerText: '#656d76',
    gridLine: '#eaeef2',
    gridLineStrong: '#d0d7de',
    frozenShadow: 'rgba(0,0,0,0.08)',
    hoverRowBg: '#f6f8fa',
    selectionBg: 'rgba(9,105,218,0.10)',
    selectionBorder: '#0969da',
  },
  cell: {
    textAlignByType: {
      text: 'left',
      number: 'right',
      singleSelect: 'left',
      multiSelect: 'left',
      date: 'left',
      checkbox: 'left',
      url: 'left',
    },
    tagRadius: 10,
    tagPaddingX: 6,
  },
  icons: {
    byFieldType: {
      text: simpleIcon('M3 4h10v1.5H3zM3 8h10v1.5H3zM3 12h7v1.5H3z'),
      number: simpleIcon('M5 3l-.5 3h2L7 3h1.5L8 6h2v1.5H7.75l-.25 2H10V11H7.25L6.75 14h-1.5l.5-3h-2L3.25 14h-1.5l.5-3H0V9.5h2.5l.25-2H0V6h3l.5-3z'),
      singleSelect: simpleIcon('M8 1a7 7 0 100 14A7 7 0 008 1zm0 12.5A5.5 5.5 0 118 2.5a5.5 5.5 0 010 11zM8 4.5A3.5 3.5 0 118 11.5 3.5 3.5 0 018 4.5z'),
      multiSelect: simpleIcon('M2 3h12v2H2zM2 7h12v2H2zM2 11h8v2H2z'),
      date: simpleIcon('M4 1v1.5H3A1.5 1.5 0 001.5 4v9A1.5 1.5 0 003 14.5h10A1.5 1.5 0 0014.5 13V4A1.5 1.5 0 0013 2.5h-1V1h-1.5v1.5h-5V1H4zm-1 5h10v7H3V6z'),
      checkbox: simpleIcon('M3 2.5A1.5 1.5 0 011.5 4v8A1.5 1.5 0 003 13.5h10A1.5 1.5 0 0014.5 12V4A1.5 1.5 0 0013 2.5H3zm4.25 7.31l4.94-4.94L11.13 3.81 7.25 7.69 5.81 6.25 4.75 7.31l2.5 2.5z'),
      url: simpleIcon('M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM2 8h12a6 6 0 01-6 6V2a6 6 0 016 6H2z'),
    },
  },
  scrollbar: {
    trackWidth: 12,
    thumbColor: 'rgba(0,0,0,0.3)',
  },
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @novasheet/core test tests/theme/denseGridTheme.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): add Theme interface and denseGridTheme default"
```

---

### Task 6: ChunkedAxis — all-default-chunks fast path

This task covers the simplest case: every chunk is `sizes: null` (all rows/cols at default size). Tasks 7-8 add mutation and traversal.

**Files:**
- Create: `packages/core/src/util/BinarySearch.ts`
- Create: `packages/core/src/util/ChunkArray.ts`
- Create: `packages/core/src/layout/ChunkedAxis.ts`
- Test: `packages/core/tests/layout/ChunkedAxis.test.ts`

- [ ] **Step 1: Write failing tests for all-default case**

Create `packages/core/tests/layout/ChunkedAxis.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ChunkedAxis, CHUNK_SIZE } from '../../src/layout/ChunkedAxis'

describe('ChunkedAxis (all default)', () => {
  it('totalSize = count × defaultSize', () => {
    const axis = new ChunkedAxis({ count: 100, defaultSize: 28 })
    expect(axis.getTotalSize()).toBe(100 * 28)
  })

  it('indexToPosition uses O(1) fast path for null chunks', () => {
    const axis = new ChunkedAxis({ count: 5000, defaultSize: 28 })
    expect(axis.indexToPosition(0)).toBe(0)
    expect(axis.indexToPosition(1)).toBe(28)
    expect(axis.indexToPosition(10)).toBe(280)
    expect(axis.indexToPosition(1024)).toBe(1024 * 28)
    expect(axis.indexToPosition(4999)).toBe(4999 * 28)
  })

  it('positionToIndex inverts indexToPosition', () => {
    const axis = new ChunkedAxis({ count: 5000, defaultSize: 28 })
    expect(axis.positionToIndex(0)).toBe(0)
    expect(axis.positionToIndex(27)).toBe(0)
    expect(axis.positionToIndex(28)).toBe(1)
    expect(axis.positionToIndex(4999 * 28)).toBe(4999)
  })

  it('positionToIndex clamps to valid index range', () => {
    const axis = new ChunkedAxis({ count: 10, defaultSize: 28 })
    expect(axis.positionToIndex(-100)).toBe(0)
    expect(axis.positionToIndex(99999)).toBe(9)
  })

  it('chunk count = ceil(count / CHUNK_SIZE)', () => {
    expect(CHUNK_SIZE).toBe(1024)
    const axis1 = new ChunkedAxis({ count: 1, defaultSize: 28 })
    const axis2 = new ChunkedAxis({ count: 1024, defaultSize: 28 })
    const axis3 = new ChunkedAxis({ count: 1025, defaultSize: 28 })
    expect(axis1.getChunkCount()).toBe(1)
    expect(axis2.getChunkCount()).toBe(1)
    expect(axis3.getChunkCount()).toBe(2)
  })

  it('count = 0 produces zero total size and no chunks', () => {
    const axis = new ChunkedAxis({ count: 0, defaultSize: 28 })
    expect(axis.getTotalSize()).toBe(0)
    expect(axis.getChunkCount()).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @novasheet/core test tests/layout/ChunkedAxis.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `BinarySearch.ts`**

Create `packages/core/src/util/BinarySearch.ts`:

```ts
/**
 * Returns the smallest index `i` in [0, length) such that arr[i] > target.
 * If no such index exists, returns `length`.
 * arr must be sorted ascending.
 */
export function upperBound(arr: ArrayLike<number>, length: number, target: number): number {
  let lo = 0
  let hi = length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (arr[mid]! > target) hi = mid
    else lo = mid + 1
  }
  return lo
}
```

- [ ] **Step 4: Implement `ChunkArray.ts`**

Create `packages/core/src/util/ChunkArray.ts`:

```ts
export interface Chunk {
  totalSize: number
  sizes: Float32Array | null
}

export function createDefaultChunk(chunkRowCount: number, defaultSize: number): Chunk {
  return {
    totalSize: chunkRowCount * defaultSize,
    sizes: null,
  }
}
```

- [ ] **Step 5: Implement `ChunkedAxis.ts` (all-default path only)**

Create `packages/core/src/layout/ChunkedAxis.ts`:

```ts
import { upperBound } from '../util/BinarySearch'
import { type Chunk, createDefaultChunk } from '../util/ChunkArray'

export const CHUNK_SIZE = 1024

export interface ChunkedAxisOptions {
  count: number
  defaultSize: number
}

export class ChunkedAxis {
  private defaultSize: number
  private count: number
  private chunks: Chunk[] = []
  /** chunkPrefixSum[i] = sum of totalSize for chunks[0..i). length = chunks.length + 1 */
  private chunkPrefixSum: Float64Array
  private totalSize = 0
  private _version = 0

  constructor(opts: ChunkedAxisOptions) {
    this.defaultSize = opts.defaultSize
    this.count = opts.count
    this.rebuild()
  }

  get version(): number {
    return this._version
  }

  getTotalSize(): number {
    return this.totalSize
  }

  getCount(): number {
    return this.count
  }

  getChunkCount(): number {
    return this.chunks.length
  }

  getDefaultSize(): number {
    return this.defaultSize
  }

  indexToPosition(index: number): number {
    if (this.count === 0) return 0
    const clamped = Math.max(0, Math.min(this.count - 1, index))
    const chunkIdx = clamped >>> 10
    const offsetInChunk = clamped & 1023
    const base = this.chunkPrefixSum[chunkIdx]!
    const chunk = this.chunks[chunkIdx]!
    if (chunk.sizes === null) {
      return base + offsetInChunk * this.defaultSize
    }
    let sum = 0
    for (let i = 0; i < offsetInChunk; i++) sum += chunk.sizes[i]!
    return base + sum
  }

  positionToIndex(position: number): number {
    if (this.count === 0) return 0
    if (position <= 0) return 0
    if (position >= this.totalSize) return this.count - 1
    const chunkIdx = upperBound(this.chunkPrefixSum, this.chunks.length + 1, position) - 1
    const chunk = this.chunks[chunkIdx]!
    const yInChunk = position - this.chunkPrefixSum[chunkIdx]!
    if (chunk.sizes === null) {
      const inner = Math.min(CHUNK_SIZE - 1, Math.floor(yInChunk / this.defaultSize))
      return Math.min(this.count - 1, chunkIdx * CHUNK_SIZE + inner)
    }
    let acc = 0
    for (let i = 0; i < chunk.sizes.length; i++) {
      acc += chunk.sizes[i]!
      if (acc > yInChunk) {
        return Math.min(this.count - 1, chunkIdx * CHUNK_SIZE + i)
      }
    }
    return Math.min(this.count - 1, chunkIdx * CHUNK_SIZE + chunk.sizes.length - 1)
  }

  private rebuild(): void {
    const nChunks = Math.ceil(this.count / CHUNK_SIZE)
    this.chunks = new Array(nChunks)
    this.chunkPrefixSum = new Float64Array(nChunks + 1)
    this.totalSize = 0
    for (let i = 0; i < nChunks; i++) {
      const rowsInChunk = i === nChunks - 1 ? this.count - i * CHUNK_SIZE : CHUNK_SIZE
      const chunk = createDefaultChunk(rowsInChunk, this.defaultSize)
      this.chunks[i] = chunk
      this.chunkPrefixSum[i + 1] = this.chunkPrefixSum[i]! + chunk.totalSize
      this.totalSize += chunk.totalSize
    }
    this._version++
  }
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @novasheet/core test tests/layout/ChunkedAxis.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat(core): add ChunkedAxis all-default fast path + binary search"
```

---

### Task 7: ChunkedAxis — setSize + lazy chunk materialization

**Files:**
- Modify: `packages/core/src/layout/ChunkedAxis.ts`
- Modify: `packages/core/tests/layout/ChunkedAxis.test.ts`

- [ ] **Step 1: Append failing tests for mutation**

Append to `packages/core/tests/layout/ChunkedAxis.test.ts`:

```ts
describe('ChunkedAxis (mutation)', () => {
  it('setSize materializes the chunk and updates total', () => {
    const axis = new ChunkedAxis({ count: 100, defaultSize: 28 })
    const before = axis.version
    axis.setSize(5, 50)
    expect(axis.getTotalSize()).toBe(99 * 28 + 50)
    expect(axis.indexToPosition(5)).toBe(5 * 28)
    expect(axis.indexToPosition(6)).toBe(5 * 28 + 50)
    expect(axis.version).toBeGreaterThan(before)
  })

  it('setSize across multiple chunks updates the prefix sums', () => {
    const axis = new ChunkedAxis({ count: 3000, defaultSize: 28 })
    axis.setSize(100, 100)
    axis.setSize(2000, 200)
    // indexToPosition(2001) = sum of sizes for rows 0..2000
    //   = 2001 default rows × 28 + delta(row 100: 100-28=72) + delta(row 2000: 200-28=172)
    //   = 56028 + 72 + 172 = 56272
    expect(axis.indexToPosition(2001)).toBe(
      101 * 28 + (100 - 28) + (2000 - 101) * 28 + 200,
    )
    expect(axis.getTotalSize()).toBe(3000 * 28 + (100 - 28) + (200 - 28))
  })

  it('setSize to defaultSize on a null chunk is a no-op (no allocation)', () => {
    const axis = new ChunkedAxis({ count: 100, defaultSize: 28 })
    const before = axis.version
    axis.setSize(5, 28)
    expect(axis.getTotalSize()).toBe(100 * 28)
    expect(axis.version).toBe(before)
  })

  it('setSize on out-of-range index is a no-op', () => {
    const axis = new ChunkedAxis({ count: 10, defaultSize: 28 })
    axis.setSize(-1, 100)
    axis.setSize(100, 100)
    expect(axis.getTotalSize()).toBe(10 * 28)
  })

  it('positionToIndex still inverts after mutation', () => {
    const axis = new ChunkedAxis({ count: 1000, defaultSize: 28 })
    axis.setSize(10, 100)
    axis.setSize(11, 100)
    expect(axis.positionToIndex(axis.indexToPosition(10))).toBe(10)
    expect(axis.positionToIndex(axis.indexToPosition(11))).toBe(11)
    expect(axis.positionToIndex(axis.indexToPosition(12) - 1)).toBe(11)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @novasheet/core test tests/layout/ChunkedAxis.test.ts`
Expected: FAIL — `setSize` not found.

- [ ] **Step 3: Add `setSize` to `ChunkedAxis`**

Edit `packages/core/src/layout/ChunkedAxis.ts` — add this method to the class (before `private rebuild()`):

```ts
  setSize(index: number, size: number): void {
    if (index < 0 || index >= this.count) return
    const chunkIdx = index >>> 10
    const offsetInChunk = index & 1023
    const chunk = this.chunks[chunkIdx]!

    if (chunk.sizes === null) {
      if (size === this.defaultSize) return
      const rowsInChunk =
        chunkIdx === this.chunks.length - 1
          ? this.count - chunkIdx * CHUNK_SIZE
          : CHUNK_SIZE
      const sizes = new Float32Array(CHUNK_SIZE)
      for (let i = 0; i < rowsInChunk; i++) sizes[i] = this.defaultSize
      chunk.sizes = sizes
    }

    const old = chunk.sizes[offsetInChunk]!
    const delta = size - old
    if (delta === 0) return
    chunk.sizes[offsetInChunk] = size
    chunk.totalSize += delta

    for (let i = chunkIdx + 1; i <= this.chunks.length; i++) {
      this.chunkPrefixSum[i] = this.chunkPrefixSum[i]! + delta
    }
    this.totalSize += delta
    this._version++
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @novasheet/core test tests/layout/ChunkedAxis.test.ts`
Expected: PASS, 11 tests total (6 prior + 5 new).

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add ChunkedAxis.setSize with lazy chunk materialization"
```

---

### Task 8: ChunkedAxis — getVisibleRange + setDefaultSize

**Files:**
- Modify: `packages/core/src/layout/ChunkedAxis.ts`
- Modify: `packages/core/tests/layout/ChunkedAxis.test.ts`

- [ ] **Step 1: Append failing tests**

Append to `packages/core/tests/layout/ChunkedAxis.test.ts`:

```ts
describe('ChunkedAxis (range + default size)', () => {
  it('getVisibleRange returns inclusive [first, last]', () => {
    const axis = new ChunkedAxis({ count: 1000, defaultSize: 28 })
    expect(axis.getVisibleRange(0, 100)).toEqual([0, 3]) // 0..27, 28..55, 56..83, 84..111 (last covered)
    expect(axis.getVisibleRange(56, 84)).toEqual([2, 3])
  })

  it('getVisibleRange clamps to 0..count-1', () => {
    const axis = new ChunkedAxis({ count: 5, defaultSize: 28 })
    expect(axis.getVisibleRange(-100, 99999)).toEqual([0, 4])
  })

  it('getVisibleRange with count=0 returns [0, -1] (empty)', () => {
    const axis = new ChunkedAxis({ count: 0, defaultSize: 28 })
    expect(axis.getVisibleRange(0, 100)).toEqual([0, -1])
  })

  it('setDefaultSize updates total but preserves overrides', () => {
    const axis = new ChunkedAxis({ count: 100, defaultSize: 28 })
    axis.setSize(5, 100)
    axis.setDefaultSize(40)
    expect(axis.getDefaultSize()).toBe(40)
    // Override sticks: row 5 stays at 100. All other rows (which were 28) scale to 40.
    // Total = 99 rows × 40 + 1 override × 100 = 4060
    expect(axis.getTotalSize()).toBe(99 * 40 + 100)
    // Row 5 still 100 wide: position of row 6 = 5 defaults + the override
    expect(axis.indexToPosition(6)).toBe(5 * 40 + 100)
    // Row 5 itself starts after 5 default rows
    expect(axis.indexToPosition(5)).toBe(5 * 40)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @novasheet/core test tests/layout/ChunkedAxis.test.ts`
Expected: FAIL — methods not found.

- [ ] **Step 3: Add `getVisibleRange` and `setDefaultSize`**

Edit `packages/core/src/layout/ChunkedAxis.ts` — add these methods to the class:

```ts
  getVisibleRange(startPos: number, endPos: number): [number, number] {
    if (this.count === 0) return [0, -1]
    const first = this.positionToIndex(startPos)
    const last = this.positionToIndex(endPos)
    return [first, last]
  }

  setDefaultSize(newDefault: number): void {
    if (newDefault === this.defaultSize) return
    const oldDefault = this.defaultSize
    this.defaultSize = newDefault
    // Recompute every chunk
    this.totalSize = 0
    this.chunkPrefixSum = new Float64Array(this.chunks.length + 1)
    for (let i = 0; i < this.chunks.length; i++) {
      const chunk = this.chunks[i]!
      if (chunk.sizes === null) {
        const rowsInChunk =
          i === this.chunks.length - 1 ? this.count - i * CHUNK_SIZE : CHUNK_SIZE
        chunk.totalSize = rowsInChunk * newDefault
      } else {
        // chunk has explicit per-row sizes: only those equal to oldDefault scale up
        let sum = 0
        for (let k = 0; k < chunk.sizes.length; k++) {
          if (chunk.sizes[k] === oldDefault) chunk.sizes[k] = newDefault
          sum += chunk.sizes[k]!
        }
        chunk.totalSize = sum
      }
      this.chunkPrefixSum[i + 1] = this.chunkPrefixSum[i]! + chunk.totalSize
      this.totalSize += chunk.totalSize
    }
    this._version++
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @novasheet/core test tests/layout/ChunkedAxis.test.ts`
Expected: PASS, 15 tests total.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add ChunkedAxis.getVisibleRange and setDefaultSize"
```

---

### Task 9: FrameScheduler

**Files:**
- Create: `packages/core/src/util/raf.ts`
- Test: `packages/core/tests/util/raf.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/util/raf.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FrameScheduler } from '../../src/util/raf'

describe('FrameScheduler', () => {
  let rafs: Array<() => void> = []

  beforeEach(() => {
    rafs = []
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
      rafs.push(cb)
      return rafs.length
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function flushFrame() {
    const pending = rafs
    rafs = []
    for (const cb of pending) cb()
  }

  it('schedules a single RAF for one task', () => {
    const scheduler = new FrameScheduler()
    const fn = vi.fn()
    scheduler.schedule('a', fn)
    expect(rafs).toHaveLength(1)
    flushFrame()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('coalesces multiple schedule calls into one RAF', () => {
    const scheduler = new FrameScheduler()
    scheduler.schedule('a', vi.fn())
    scheduler.schedule('b', vi.fn())
    scheduler.schedule('c', vi.fn())
    expect(rafs).toHaveLength(1)
  })

  it('same key collapses to last task', () => {
    const scheduler = new FrameScheduler()
    const first = vi.fn()
    const second = vi.fn()
    scheduler.schedule('a', first)
    scheduler.schedule('a', second)
    flushFrame()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('executes tasks in insertion order', () => {
    const scheduler = new FrameScheduler()
    const log: string[] = []
    scheduler.schedule('first', () => log.push('1'))
    scheduler.schedule('second', () => log.push('2'))
    scheduler.schedule('third', () => log.push('3'))
    flushFrame()
    expect(log).toEqual(['1', '2', '3'])
  })

  it('cancel removes a pending task', () => {
    const scheduler = new FrameScheduler()
    const fn = vi.fn()
    scheduler.schedule('a', fn)
    scheduler.cancel('a')
    flushFrame()
    expect(fn).not.toHaveBeenCalled()
  })

  it('schedules a new frame after flush', () => {
    const scheduler = new FrameScheduler()
    scheduler.schedule('a', vi.fn())
    flushFrame()
    scheduler.schedule('b', vi.fn())
    expect(rafs).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @novasheet/core test tests/util/raf.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `raf.ts`**

Create `packages/core/src/util/raf.ts`:

```ts
export class FrameScheduler {
  private pending = new Map<string, () => void>()
  private rafId: number | null = null

  schedule(key: string, task: () => void): void {
    this.pending.set(key, task)
    if (this.rafId === null) {
      this.rafId = requestAnimationFrame(() => this.flush())
    }
  }

  cancel(key: string): void {
    this.pending.delete(key)
  }

  private flush(): void {
    const tasks = Array.from(this.pending.values())
    this.pending.clear()
    this.rafId = null
    for (const task of tasks) task()
  }
}

export const frameScheduler = new FrameScheduler()
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @novasheet/core test tests/util/raf.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add FrameScheduler with key-dedup and insertion-order flush"
```

---

### Task 10: HighDPI

**Files:**
- Create: `packages/core/src/render/HighDPI.ts`
- Test: `packages/core/tests/render/HighDPI.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/render/HighDPI.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { HighDPI } from '../../src/render/HighDPI'
import { createRecordingContext } from '../helpers/recording-context'

function mockCanvas(): HTMLCanvasElement {
  return { width: 0, height: 0, style: { width: '', height: '' } } as unknown as HTMLCanvasElement
}

describe('HighDPI', () => {
  it('sets canvas dimensions to css * dpr and applies transform', () => {
    vi.stubGlobal('devicePixelRatio', 2)
    const canvas = mockCanvas()
    const { ctx, ops } = createRecordingContext()
    const h = new HighDPI(canvas, ctx)
    h.resize(400, 300)
    expect(canvas.style.width).toBe('400px')
    expect(canvas.style.height).toBe('300px')
    expect(canvas.width).toBe(800)
    expect(canvas.height).toBe(600)
    expect(ops).toContainEqual({ op: 'setTransform', args: [2, 0, 0, 2, 0, 0] })
    vi.unstubAllGlobals()
  })

  it('handles dpr = 1', () => {
    vi.stubGlobal('devicePixelRatio', 1)
    const canvas = mockCanvas()
    const { ctx } = createRecordingContext()
    new HighDPI(canvas, ctx).resize(100, 50)
    expect(canvas.width).toBe(100)
    expect(canvas.height).toBe(50)
    vi.unstubAllGlobals()
  })

  it('rounds fractional css dimensions', () => {
    vi.stubGlobal('devicePixelRatio', 1.5)
    const canvas = mockCanvas()
    const { ctx } = createRecordingContext()
    new HighDPI(canvas, ctx).resize(100, 50)
    expect(canvas.width).toBe(150)
    expect(canvas.height).toBe(75)
    vi.unstubAllGlobals()
  })

  it('reports current dpr after resize', () => {
    vi.stubGlobal('devicePixelRatio', 2)
    const canvas = mockCanvas()
    const { ctx } = createRecordingContext()
    const h = new HighDPI(canvas, ctx)
    h.resize(100, 100)
    expect(h.getDpr()).toBe(2)
    vi.unstubAllGlobals()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @novasheet/core test tests/render/HighDPI.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `HighDPI.ts`**

Create `packages/core/src/render/HighDPI.ts`:

```ts
export class HighDPI {
  private dpr = 1

  constructor(
    private canvas: HTMLCanvasElement,
    private ctx: CanvasRenderingContext2D,
  ) {}

  resize(cssWidth: number, cssHeight: number): void {
    this.dpr = window.devicePixelRatio || 1
    this.canvas.style.width = `${cssWidth}px`
    this.canvas.style.height = `${cssHeight}px`
    this.canvas.width = Math.round(cssWidth * this.dpr)
    this.canvas.height = Math.round(cssHeight * this.dpr)
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
  }

  getDpr(): number {
    return this.dpr
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @novasheet/core test tests/render/HighDPI.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add HighDPI canvas sizing"
```

---

### Task 11: FrozenRegions (M1 stub) + Viewport

For M1 the Viewport produces a single `main` quadrant covering the whole visible area. `FrozenRegions` is a stub that always returns just `main`; M3 will extend it with the other 3 quadrants.

**Files:**
- Create: `packages/core/src/layout/FrozenRegions.ts`
- Create: `packages/core/src/layout/Viewport.ts`
- Test: `packages/core/tests/layout/Viewport.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/layout/Viewport.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ChunkedAxis } from '../../src/layout/ChunkedAxis'
import { FrozenRegions } from '../../src/layout/FrozenRegions'
import { Viewport } from '../../src/layout/Viewport'

describe('Viewport (M1 single-quadrant)', () => {
  function setup() {
    const rowsAxis = new ChunkedAxis({ count: 100, defaultSize: 28 })
    const colsAxis = new ChunkedAxis({ count: 5, defaultSize: 100 })
    const frozen = new FrozenRegions(rowsAxis, colsAxis, 0, 0)
    const vp = new Viewport(rowsAxis, colsAxis, frozen)
    vp.setSize(400, 280) // viewport 400x280
    vp.setScroll(0, 0)
    vp.setHeaderHeight(32)
    return { rowsAxis, colsAxis, frozen, vp }
  }

  it('snapshot exposes main quadrant covering visible rows × cols', () => {
    const { vp } = setup()
    const snap = vp.snapshot()
    expect(snap.quadrants.main).toBeDefined()
    expect(snap.quadrants.topLeft).toBeUndefined()
    // visible rows: y range [0, 280-32=248] → row range [0, ceil(248/28)-1]
    expect(snap.quadrants.main.rowRange[0]).toBe(0)
    expect(snap.quadrants.main.rowRange[1]).toBeGreaterThanOrEqual(8)
    expect(snap.quadrants.main.colRange).toEqual([0, 3]) // 0..99, 100..199, 200..299, 300..399
  })

  it('snapshot reflects current scroll position', () => {
    const { vp } = setup()
    vp.setScroll(0, 140) // scroll down 5 rows (140/28)
    const snap = vp.snapshot()
    expect(snap.quadrants.main.rowRange[0]).toBe(5)
  })

  it('version increments on mutation', () => {
    const { vp } = setup()
    const v0 = vp.snapshot().version
    vp.setScroll(0, 100)
    expect(vp.snapshot().version).toBeGreaterThan(v0)
  })

  it('returns empty range when count is 0', () => {
    const rowsAxis = new ChunkedAxis({ count: 0, defaultSize: 28 })
    const colsAxis = new ChunkedAxis({ count: 0, defaultSize: 100 })
    const frozen = new FrozenRegions(rowsAxis, colsAxis, 0, 0)
    const vp = new Viewport(rowsAxis, colsAxis, frozen)
    vp.setSize(400, 280)
    vp.setHeaderHeight(32)
    const snap = vp.snapshot()
    expect(snap.quadrants.main.rowRange).toEqual([0, -1])
    expect(snap.quadrants.main.colRange).toEqual([0, -1])
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @novasheet/core test tests/layout/Viewport.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `FrozenRegions.ts` (M1 stub)**

Create `packages/core/src/layout/FrozenRegions.ts`:

```ts
import type { ChunkedAxis } from './ChunkedAxis'

export interface QuadrantRect {
  /** Canvas-space rect in CSS pixels */
  x: number
  y: number
  width: number
  height: number
}

export interface Quadrant {
  rowRange: [number, number]
  colRange: [number, number]
  rect: QuadrantRect
}

export interface Quadrants {
  main: Quadrant
  topLeft?: Quadrant
  topRight?: Quadrant
  bottomLeft?: Quadrant
}

export interface ViewportRect {
  width: number
  height: number
  scrollX: number
  scrollY: number
  headerHeight: number
}

export class FrozenRegions {
  constructor(
    private rowsAxis: ChunkedAxis,
    private colsAxis: ChunkedAxis,
    public frozenRows: number,
    public frozenCols: number,
  ) {}

  setFrozen(rows: number, cols: number): void {
    this.frozenRows = rows
    this.frozenCols = cols
  }

  /**
   * M1: only the `main` quadrant is populated. M3 will add topLeft / topRight / bottomLeft
   * when frozenRows > 0 or frozenCols > 0.
   */
  getQuadrants(vp: ViewportRect): Quadrants {
    // Viewport rect is half-open [start, start+size), but getVisibleRange
    // takes inclusive position endpoints. Subtract 1 from end positions
    // so position == start+size (which is OUTSIDE the viewport) doesn't
    // get included as a visible row/column.
    const yStart = vp.scrollY
    const yEnd = vp.scrollY + (vp.height - vp.headerHeight) - 1
    const xStart = vp.scrollX
    const xEnd = vp.scrollX + vp.width - 1

    const rowRange = this.rowsAxis.getVisibleRange(yStart, yEnd)
    const colRange = this.colsAxis.getVisibleRange(xStart, xEnd)

    const main: Quadrant = {
      rowRange,
      colRange,
      rect: {
        x: 0,
        y: vp.headerHeight,
        width: vp.width,
        height: vp.height - vp.headerHeight,
      },
    }
    return { main }
  }
}
```

- [ ] **Step 4: Implement `Viewport.ts`**

Create `packages/core/src/layout/Viewport.ts`:

```ts
import type { ChunkedAxis } from './ChunkedAxis'
import type { FrozenRegions, Quadrants } from './FrozenRegions'

export interface ViewportSnapshot {
  quadrants: Quadrants
  contentRect: { width: number; height: number }
  headerHeight: number
  scrollX: number
  scrollY: number
  version: number
}

export class Viewport {
  private width = 0
  private height = 0
  private scrollX = 0
  private scrollY = 0
  private headerHeight = 0
  private _version = 0

  constructor(
    private rowsAxis: ChunkedAxis,
    private colsAxis: ChunkedAxis,
    private frozen: FrozenRegions,
  ) {}

  setSize(width: number, height: number): void {
    this.width = width
    this.height = height
    this._version++
  }

  setScroll(scrollX: number, scrollY: number): void {
    this.scrollX = scrollX
    this.scrollY = scrollY
    this._version++
  }

  setHeaderHeight(h: number): void {
    this.headerHeight = h
    this._version++
  }

  snapshot(): ViewportSnapshot {
    const quadrants = this.frozen.getQuadrants({
      width: this.width,
      height: this.height,
      scrollX: this.scrollX,
      scrollY: this.scrollY,
      headerHeight: this.headerHeight,
    })
    return {
      quadrants,
      contentRect: { width: this.width, height: this.height },
      headerHeight: this.headerHeight,
      scrollX: this.scrollX,
      scrollY: this.scrollY,
      version: Math.max(this._version, this.rowsAxis.version, this.colsAxis.version),
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @novasheet/core test tests/layout/Viewport.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): add FrozenRegions stub and Viewport snapshot"
```

---

### Task 12: GridLinesPainter

**Files:**
- Create: `packages/core/src/render/GridLinesPainter.ts`
- Test: `packages/core/tests/render/GridLinesPainter.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/core/tests/render/GridLinesPainter.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ChunkedAxis } from '../../src/layout/ChunkedAxis'
import { GridLinesPainter } from '../../src/render/GridLinesPainter'
import { denseGridTheme } from '../../src/theme/denseGridTheme'
import { createRecordingContext } from '../helpers/recording-context'

describe('GridLinesPainter', () => {
  it('emits moveTo/lineTo per row + col then a single stroke', () => {
    const { ctx, ops } = createRecordingContext()
    const rowsAxis = new ChunkedAxis({ count: 10, defaultSize: 28 })
    const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })
    const painter = new GridLinesPainter(denseGridTheme)
    painter.paint(ctx, {
      rowsAxis,
      colsAxis,
      rowRange: [0, 2],
      colRange: [0, 1],
      rect: { x: 0, y: 32, width: 200, height: 100 },
    })
    const strokeCount = ops.filter((o) => o.op === 'stroke').length
    expect(strokeCount).toBe(1)
    expect(ops.some((o) => o.op === 'set:strokeStyle' && o.value === denseGridTheme.colors.gridLine)).toBe(true)
    expect(ops.some((o) => o.op === 'moveTo')).toBe(true)
    expect(ops.some((o) => o.op === 'lineTo')).toBe(true)
  })

  it('skips drawing when range is empty', () => {
    const { ctx, ops } = createRecordingContext()
    const rowsAxis = new ChunkedAxis({ count: 0, defaultSize: 28 })
    const colsAxis = new ChunkedAxis({ count: 0, defaultSize: 100 })
    new GridLinesPainter(denseGridTheme).paint(ctx, {
      rowsAxis,
      colsAxis,
      rowRange: [0, -1],
      colRange: [0, -1],
      rect: { x: 0, y: 0, width: 200, height: 100 },
    })
    expect(ops.filter((o) => o.op === 'stroke')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @novasheet/core test tests/render/GridLinesPainter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `GridLinesPainter.ts`**

Create `packages/core/src/render/GridLinesPainter.ts`:

```ts
import type { ChunkedAxis } from '../layout/ChunkedAxis'
import type { QuadrantRect } from '../layout/FrozenRegions'
import type { Theme } from '../theme/Theme'

export interface GridLinesPaintParams {
  rowsAxis: ChunkedAxis
  colsAxis: ChunkedAxis
  rowRange: [number, number]
  colRange: [number, number]
  rect: QuadrantRect
}

export class GridLinesPainter {
  constructor(private theme: Theme) {}

  setTheme(theme: Theme): void {
    this.theme = theme
  }

  paint(ctx: CanvasRenderingContext2D, params: GridLinesPaintParams): void {
    const { rowsAxis, colsAxis, rowRange, colRange, rect } = params
    if (rowRange[1] < rowRange[0] || colRange[1] < colRange[0]) return

    ctx.strokeStyle = this.theme.colors.gridLine
    ctx.lineWidth = this.theme.metrics.borderWidth

    ctx.beginPath()

    // Horizontal lines: after each visible row's bottom edge
    for (let r = rowRange[0]; r <= rowRange[1]; r++) {
      const yBase = rowsAxis.indexToPosition(r) + this.rowHeight(rowsAxis, r)
      const y = Math.floor(yBase - this.scrollOffsetY(rect)) + 0.5
      if (y < rect.y || y > rect.y + rect.height) continue
      ctx.moveTo(rect.x, y)
      ctx.lineTo(rect.x + rect.width, y)
    }

    // Vertical lines: after each visible column's right edge
    for (let c = colRange[0]; c <= colRange[1]; c++) {
      const xBase = colsAxis.indexToPosition(c) + this.colWidth(colsAxis, c)
      const x = Math.floor(xBase - this.scrollOffsetX(rect)) + 0.5
      if (x < rect.x || x > rect.x + rect.width) continue
      ctx.moveTo(x, rect.y)
      ctx.lineTo(x, rect.y + rect.height)
    }

    ctx.stroke()
  }

  private rowHeight(axis: ChunkedAxis, index: number): number {
    return axis.indexToPosition(index + 1) - axis.indexToPosition(index)
  }

  private colWidth(axis: ChunkedAxis, index: number): number {
    return axis.indexToPosition(index + 1) - axis.indexToPosition(index)
  }

  /** M1: no scroll, scroll offset = 0. Renderer will pass adjusted rect later. */
  private scrollOffsetX(_rect: QuadrantRect): number { return 0 }
  private scrollOffsetY(_rect: QuadrantRect): number { return 0 }
}
```

> Note: scroll-offset computation is stubbed here. Renderer (Task 15) computes the visible offsets externally and the painter assumes coordinates passed are already in canvas-space. In M2 the painter signature stays the same; only Renderer's call-site changes.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @novasheet/core test tests/render/GridLinesPainter.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add GridLinesPainter with Path2D-style batched stroke"
```

---

### Task 13: CellPainter — text + number + fallback

**Files:**
- Create: `packages/core/src/render/CellPainter.ts`
- Test: `packages/core/tests/render/CellPainter.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/render/CellPainter.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Field } from '../../src/data/Schema'
import { CellPainter } from '../../src/render/CellPainter'
import { denseGridTheme } from '../../src/theme/denseGridTheme'
import { createRecordingContext } from '../helpers/recording-context'

function makeField(overrides: Partial<Field> = {}): Field {
  return { id: 'f1', name: 'F', type: 'text', width: 100, ...overrides }
}

describe('CellPainter', () => {
  it('clips per cell with save/restore', () => {
    const { ctx, ops } = createRecordingContext()
    new CellPainter(denseGridTheme).paint(ctx, {
      value: 'hello',
      rect: { x: 0, y: 0, width: 100, height: 28 },
      field: makeField(),
    })
    const sequence = ops.map((o) => o.op).filter((op) => ['save', 'beginPath', 'rect', 'clip', 'restore'].includes(op))
    expect(sequence).toEqual(['save', 'beginPath', 'rect', 'clip', 'restore'])
  })

  it('paints text left-aligned with theme text color', () => {
    const { ctx, ops } = createRecordingContext()
    new CellPainter(denseGridTheme).paint(ctx, {
      value: 'hello',
      rect: { x: 10, y: 0, width: 100, height: 28 },
      field: makeField({ type: 'text' }),
    })
    expect(ops).toContainEqual({ op: 'set:textAlign', value: 'left' })
    expect(ops).toContainEqual({ op: 'set:fillStyle', value: denseGridTheme.colors.text })
    const fillTextOp = ops.find((o) => o.op === 'fillText')
    expect(fillTextOp).toBeDefined()
    if (fillTextOp?.op === 'fillText') {
      expect(fillTextOp.args[0]).toBe('hello')
      // x = rect.x + padX = 10 + 8
      expect(fillTextOp.args[1]).toBe(18)
    }
  })

  it('paints number right-aligned with thousands separator', () => {
    const { ctx, ops } = createRecordingContext()
    new CellPainter(denseGridTheme).paint(ctx, {
      value: 1234567,
      rect: { x: 0, y: 0, width: 100, height: 28 },
      field: makeField({ type: 'number' }),
    })
    expect(ops).toContainEqual({ op: 'set:textAlign', value: 'right' })
    const fillTextOp = ops.find((o) => o.op === 'fillText')
    expect(fillTextOp).toBeDefined()
    if (fillTextOp?.op === 'fillText') {
      expect(fillTextOp.args[0]).toBe('1,234,567')
    }
  })

  it('truncates long text with ellipsis based on available width', () => {
    const { ctx, ops } = createRecordingContext()
    // RecordingContext.measureText returns length * 7 px
    // Field width 50, padX*2 = 16, available width = 34 → ~4 chars + …
    new CellPainter(denseGridTheme).paint(ctx, {
      value: 'abcdefghijklmnop',
      rect: { x: 0, y: 0, width: 50, height: 28 },
      field: makeField({ type: 'text', width: 50 }),
    })
    const fillTextOp = ops.find((o) => o.op === 'fillText')
    if (fillTextOp?.op === 'fillText') {
      expect(fillTextOp.args[0]).toMatch(/…$/)
      expect(fillTextOp.args[0].length).toBeLessThan('abcdefghijklmnop'.length)
    }
  })

  it('fallback path renders non-text/number types via String()', () => {
    const { ctx, ops } = createRecordingContext()
    new CellPainter(denseGridTheme).paint(ctx, {
      value: true,
      rect: { x: 0, y: 0, width: 100, height: 28 },
      field: makeField({ type: 'checkbox' }),
    })
    const fillTextOp = ops.find((o) => o.op === 'fillText')
    if (fillTextOp?.op === 'fillText') {
      expect(fillTextOp.args[0]).toBe('true')
    }
  })

  it('null/undefined values render as empty (no fillText)', () => {
    const { ctx, ops } = createRecordingContext()
    new CellPainter(denseGridTheme).paint(ctx, {
      value: null,
      rect: { x: 0, y: 0, width: 100, height: 28 },
      field: makeField({ type: 'text' }),
    })
    expect(ops.filter((o) => o.op === 'fillText')).toHaveLength(0)
  })

  it('Date values use ISO string', () => {
    const { ctx, ops } = createRecordingContext()
    const d = new Date('2026-05-13T00:00:00Z')
    new CellPainter(denseGridTheme).paint(ctx, {
      value: d,
      rect: { x: 0, y: 0, width: 200, height: 28 },
      field: makeField({ type: 'date' }),
    })
    const fillTextOp = ops.find((o) => o.op === 'fillText')
    if (fillTextOp?.op === 'fillText') {
      expect(fillTextOp.args[0]).toBe(d.toISOString())
    }
  })

  it('array values for multiSelect join with comma', () => {
    const { ctx, ops } = createRecordingContext()
    new CellPainter(denseGridTheme).paint(ctx, {
      value: ['a', 'b', 'c'],
      rect: { x: 0, y: 0, width: 200, height: 28 },
      field: makeField({ type: 'multiSelect' }),
    })
    const fillTextOp = ops.find((o) => o.op === 'fillText')
    if (fillTextOp?.op === 'fillText') {
      expect(fillTextOp.args[0]).toBe('a, b, c')
    }
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @novasheet/core test tests/render/CellPainter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `CellPainter.ts`**

Create `packages/core/src/render/CellPainter.ts`:

```ts
import type { CellValue, Field } from '../data/Schema'
import type { QuadrantRect } from '../layout/FrozenRegions'
import type { Theme } from '../theme/Theme'

export interface CellPaintParams {
  value: CellValue | undefined
  rect: QuadrantRect
  field: Field
}

export class CellPainter {
  private truncationCache = new Map<string, string>()

  constructor(private theme: Theme) {}

  setTheme(theme: Theme): void {
    this.theme = theme
    this.truncationCache.clear()
  }

  paint(ctx: CanvasRenderingContext2D, params: CellPaintParams): void {
    const { value, rect, field } = params
    if (value === null || value === undefined) return

    ctx.save()
    ctx.beginPath()
    ctx.rect(rect.x, rect.y, rect.width, rect.height)
    ctx.clip()

    ctx.fillStyle = this.theme.colors.text
    ctx.textBaseline = 'middle'
    ctx.textAlign = this.theme.cell.textAlignByType[field.type]

    if (field.type === 'number' && typeof value === 'number') {
      this.paintNumber(ctx, value, rect)
    } else if (field.type === 'text' && typeof value === 'string') {
      this.paintText(ctx, value, rect)
    } else {
      this.paintFallback(ctx, value, rect, field)
    }

    ctx.restore()
  }

  private paintText(ctx: CanvasRenderingContext2D, text: string, rect: QuadrantRect): void {
    const padX = this.theme.metrics.cellPaddingX
    const availableWidth = rect.width - padX * 2
    const display = this.truncate(ctx, text, availableWidth)
    if (!display) return
    const x = rect.x + padX
    const y = rect.y + rect.height / 2
    ctx.fillText(display, x, y)
  }

  private paintNumber(ctx: CanvasRenderingContext2D, value: number, rect: QuadrantRect): void {
    const text = value.toLocaleString('en-US') // 千分位
    const padX = this.theme.metrics.cellPaddingX
    const availableWidth = rect.width - padX * 2
    const display = this.truncate(ctx, text, availableWidth)
    if (!display) return
    const x = rect.x + rect.width - padX
    const y = rect.y + rect.height / 2
    ctx.fillText(display, x, y)
  }

  private paintFallback(
    ctx: CanvasRenderingContext2D,
    value: CellValue,
    rect: QuadrantRect,
    _field: Field,
  ): void {
    let str: string
    if (value instanceof Date) str = value.toISOString()
    else if (Array.isArray(value)) str = value.join(', ')
    else str = String(value)
    this.paintText(ctx, str, rect)
  }

  private truncate(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (maxWidth <= 0) return ''
    const cacheKey = `${ctx.font}|${maxWidth}|${text}`
    const cached = this.truncationCache.get(cacheKey)
    if (cached !== undefined) return cached

    const fullWidth = ctx.measureText(text).width
    if (fullWidth <= maxWidth) {
      this.truncationCache.set(cacheKey, text)
      return text
    }
    const ellipsis = '…'
    const ellipsisWidth = ctx.measureText(ellipsis).width
    if (ellipsisWidth > maxWidth) {
      this.truncationCache.set(cacheKey, '')
      return ''
    }
    // Binary search for the largest prefix fitting in (maxWidth - ellipsisWidth)
    let lo = 0
    let hi = text.length
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1
      const w = ctx.measureText(text.slice(0, mid)).width
      if (w + ellipsisWidth <= maxWidth) lo = mid
      else hi = mid - 1
    }
    const result = text.slice(0, lo) + ellipsis
    this.truncationCache.set(cacheKey, result)
    return result
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @novasheet/core test tests/render/CellPainter.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add CellPainter (text/number specialized, fallback for other types)"
```

---

### Task 14: HeaderPainter

**Files:**
- Create: `packages/core/src/render/HeaderPainter.ts`
- Test: `packages/core/tests/render/HeaderPainter.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/core/tests/render/HeaderPainter.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { ChunkedAxis } from '../../src/layout/ChunkedAxis'
import type { Schema } from '../../src/data/Schema'
import { HeaderPainter } from '../../src/render/HeaderPainter'
import { denseGridTheme } from '../../src/theme/denseGridTheme'
import { createRecordingContext } from '../helpers/recording-context'

const SCHEMA: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 200 },
    { id: 'age', name: 'Age', type: 'number', width: 80 },
    { id: 'flag', name: 'Active', type: 'checkbox', width: 60 },
  ],
}

describe('HeaderPainter', () => {
  it('fills header background spanning full width with headerHeight', () => {
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis,
      colRange: [0, 2],
      width: 400,
    })
    const bgFill = ops.find(
      (o) =>
        o.op === 'fillRect' &&
        o.args[1] === 0 &&
        o.args[3] === denseGridTheme.metrics.headerHeight,
    )
    expect(bgFill).toBeDefined()
    expect(ops).toContainEqual({ op: 'set:fillStyle', value: denseGridTheme.colors.headerBackground })
  })

  it('renders each visible field name', () => {
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis,
      colRange: [0, 2],
      width: 400,
    })
    const texts = ops.filter((o) => o.op === 'fillText').map((o) => (o.op === 'fillText' ? o.args[0] : ''))
    expect(texts).toContain('Name')
    expect(texts).toContain('Age')
    expect(texts).toContain('Active')
  })

  it('uses theme headerText color for field names', () => {
    const { ctx, ops } = createRecordingContext()
    const colsAxis = new ChunkedAxis({ count: 3, defaultSize: 100 })
    new HeaderPainter(denseGridTheme).paint(ctx, {
      schema: SCHEMA,
      colsAxis,
      colRange: [0, 2],
      width: 400,
    })
    expect(ops).toContainEqual({ op: 'set:fillStyle', value: denseGridTheme.colors.headerText })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @novasheet/core test tests/render/HeaderPainter.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `HeaderPainter.ts`**

Create `packages/core/src/render/HeaderPainter.ts`:

```ts
import type { ChunkedAxis } from '../layout/ChunkedAxis'
import type { Schema } from '../data/Schema'
import type { Theme } from '../theme/Theme'

export interface HeaderPaintParams {
  schema: Schema
  colsAxis: ChunkedAxis
  colRange: [number, number]
  width: number
}

export class HeaderPainter {
  constructor(private theme: Theme) {}

  setTheme(theme: Theme): void {
    this.theme = theme
  }

  paint(ctx: CanvasRenderingContext2D, params: HeaderPaintParams): void {
    const { schema, colsAxis, colRange, width } = params
    const headerHeight = this.theme.metrics.headerHeight

    ctx.fillStyle = this.theme.colors.headerBackground
    ctx.fillRect(0, 0, width, headerHeight)

    if (colRange[1] < colRange[0]) return

    ctx.fillStyle = this.theme.colors.headerText
    ctx.textBaseline = 'middle'
    ctx.textAlign = 'left'

    const padX = this.theme.metrics.cellPaddingX
    for (let c = colRange[0]; c <= colRange[1]; c++) {
      const field = schema.fields[c]
      if (!field) continue
      const x = colsAxis.indexToPosition(c) + padX
      const y = headerHeight / 2
      ctx.fillText(field.name, x, y)
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @novasheet/core test tests/render/HeaderPainter.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add HeaderPainter for column field names"
```

---

### Task 15: Renderer — single-quadrant frame paint

**Files:**
- Create: `packages/core/src/render/Renderer.ts`
- Test: `packages/core/tests/render/Renderer.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/core/tests/render/Renderer.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { InMemoryDataSource } from '../../src/data/InMemoryDataSource'
import type { Schema } from '../../src/data/Schema'
import { ChunkedAxis } from '../../src/layout/ChunkedAxis'
import { FrozenRegions } from '../../src/layout/FrozenRegions'
import { Viewport } from '../../src/layout/Viewport'
import { Renderer } from '../../src/render/Renderer'
import { denseGridTheme } from '../../src/theme/denseGridTheme'
import { createRecordingContext } from '../helpers/recording-context'

const SCHEMA: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 100 },
    { id: 'age', name: 'Age', type: 'number', width: 80 },
  ],
}

describe('Renderer (M1 single quadrant)', () => {
  function setup() {
    const { ctx, ops } = createRecordingContext()
    const data = new InMemoryDataSource({
      schema: SCHEMA,
      rows: [
        { name: 'Alice', age: 30 },
        { name: 'Bob', age: 25 },
        { name: 'Carol', age: 40 },
      ],
    })
    const rowsAxis = new ChunkedAxis({ count: data.getRowCount(), defaultSize: denseGridTheme.metrics.rowHeight })
    const colsAxis = new ChunkedAxis({ count: SCHEMA.fields.length, defaultSize: 100 })
    const frozen = new FrozenRegions(rowsAxis, colsAxis, 0, 0)
    const viewport = new Viewport(rowsAxis, colsAxis, frozen)
    viewport.setSize(400, 200)
    viewport.setHeaderHeight(denseGridTheme.metrics.headerHeight)
    viewport.setScroll(0, 0)
    const renderer = new Renderer({ ctx, data, viewport, rowsAxis, colsAxis, theme: denseGridTheme })
    return { ctx, ops, data, viewport, renderer }
  }

  it('paint clears background then draws header and visible cells', () => {
    const { renderer, ops } = setup()
    renderer.paint()
    // background fill at the start
    const firstBgFill = ops.find((o) => o.op === 'fillRect')
    expect(firstBgFill).toBeDefined()
    // header texts present
    const texts = ops.filter((o) => o.op === 'fillText').map((o) => (o.op === 'fillText' ? o.args[0] : ''))
    expect(texts).toContain('Name')
    expect(texts).toContain('Age')
    expect(texts).toContain('Alice')
    expect(texts).toContain('Bob')
    expect(texts).toContain('Carol')
  })

  it('invalidate schedules a paint via FrameScheduler', () => {
    // Use mocked RAF
    const rafs: Array<() => void> = []
    const originalRaf = globalThis.requestAnimationFrame
    globalThis.requestAnimationFrame = ((cb: () => void) => {
      rafs.push(cb)
      return rafs.length
    }) as typeof requestAnimationFrame

    const { renderer, ops } = setup()
    ops.length = 0
    renderer.invalidate()
    expect(rafs).toHaveLength(1)
    rafs[0]!()
    expect(ops.filter((o) => o.op === 'fillText').length).toBeGreaterThan(0)

    globalThis.requestAnimationFrame = originalRaf
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @novasheet/core test tests/render/Renderer.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `Renderer.ts`**

Create `packages/core/src/render/Renderer.ts`:

```ts
import type { DataSource } from '../data/DataSource'
import type { ChunkedAxis } from '../layout/ChunkedAxis'
import type { Quadrant } from '../layout/FrozenRegions'
import type { Viewport } from '../layout/Viewport'
import type { Theme } from '../theme/Theme'
import { FrameScheduler } from '../util/raf'
import { CellPainter } from './CellPainter'
import { GridLinesPainter } from './GridLinesPainter'
import { HeaderPainter } from './HeaderPainter'

export interface RendererOptions {
  ctx: CanvasRenderingContext2D
  data: DataSource
  viewport: Viewport
  rowsAxis: ChunkedAxis
  colsAxis: ChunkedAxis
  theme: Theme
  scheduler?: FrameScheduler
}

const RENDERER_KEY = 'renderer:flush'

export class Renderer {
  private ctx: CanvasRenderingContext2D
  private data: DataSource
  private viewport: Viewport
  private rowsAxis: ChunkedAxis
  private colsAxis: ChunkedAxis
  private theme: Theme
  private scheduler: FrameScheduler
  private cellPainter: CellPainter
  private gridLinesPainter: GridLinesPainter
  private headerPainter: HeaderPainter

  constructor(opts: RendererOptions) {
    this.ctx = opts.ctx
    this.data = opts.data
    this.viewport = opts.viewport
    this.rowsAxis = opts.rowsAxis
    this.colsAxis = opts.colsAxis
    this.theme = opts.theme
    this.scheduler = opts.scheduler ?? new FrameScheduler()
    this.cellPainter = new CellPainter(this.theme)
    this.gridLinesPainter = new GridLinesPainter(this.theme)
    this.headerPainter = new HeaderPainter(this.theme)
  }

  setTheme(theme: Theme): void {
    this.theme = theme
    this.cellPainter.setTheme(theme)
    this.gridLinesPainter.setTheme(theme)
    this.headerPainter.setTheme(theme)
    this.invalidate()
  }

  setData(data: DataSource): void {
    this.data = data
    this.invalidate()
  }

  invalidate(): void {
    this.scheduler.schedule(RENDERER_KEY, () => this.paint())
  }

  paint(): void {
    const snapshot = this.viewport.snapshot()
    const { contentRect, headerHeight, quadrants } = snapshot

    // 1) Clear / background
    this.ctx.fillStyle = this.theme.colors.background
    this.ctx.fillRect(0, 0, contentRect.width, contentRect.height)

    // 2) Set font once per frame
    this.ctx.font = `${this.theme.metrics.fontSize}px ${this.theme.metrics.fontFamily}`

    // 3) Prefetch visible rows (sync path for InMemoryDataSource)
    const main = quadrants.main
    if (main.rowRange[1] >= main.rowRange[0]) {
      const maybe = this.data.getRows(main.rowRange[0], main.rowRange[1])
      // Phase 1 M1: synchronous source only; ignore Promise return for now
      void maybe
    }

    // 4) Draw main quadrant
    this.paintQuadrant(main)

    // 5) Header (always on top)
    this.headerPainter.paint(this.ctx, {
      schema: this.data.getSchema(),
      colsAxis: this.colsAxis,
      colRange: main.colRange,
      width: contentRect.width,
    })

    // Note: M1 does not draw frozen quadrants (FrozenRegions stub returns only main).
    // M3 will extend paint() to iterate all quadrants present in `quadrants`.
    void headerHeight
  }

  private paintQuadrant(quadrant: Quadrant): void {
    const { rowRange, colRange, rect } = quadrant
    if (rowRange[1] < rowRange[0] || colRange[1] < colRange[0]) return

    const schema = this.data.getSchema()
    for (let r = rowRange[0]; r <= rowRange[1]; r++) {
      const yTop = this.rowsAxis.indexToPosition(r)
      const yBottom = this.rowsAxis.indexToPosition(r + 1)
      const rowHeight = (r + 1 >= this.rowsAxis.getCount())
        ? this.rowsAxis.getTotalSize() - yTop
        : yBottom - yTop
      const cellY = rect.y + yTop // M1: no scroll subtraction (scrollY = 0)

      for (let c = colRange[0]; c <= colRange[1]; c++) {
        const field = schema.fields[c]
        if (!field) continue
        const xLeft = this.colsAxis.indexToPosition(c)
        const xRight = this.colsAxis.indexToPosition(c + 1)
        const colWidth = (c + 1 >= this.colsAxis.getCount())
          ? this.colsAxis.getTotalSize() - xLeft
          : xRight - xLeft
        const cellX = rect.x + xLeft
        const value = this.data.getCell(r, field.id)
        this.cellPainter.paint(this.ctx, {
          value,
          rect: { x: cellX, y: cellY, width: colWidth, height: rowHeight },
          field,
        })
      }
    }

    this.gridLinesPainter.paint(this.ctx, {
      rowsAxis: this.rowsAxis,
      colsAxis: this.colsAxis,
      rowRange,
      colRange,
      rect,
    })
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @novasheet/core test tests/render/Renderer.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core
git commit -m "feat(core): add Renderer for single-quadrant frame paint"
```

---

### Task 16: Grid facade

**Files:**
- Create: `packages/core/src/Grid.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/Grid.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/core/tests/Grid.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { Grid } from '../src/Grid'
import { InMemoryDataSource } from '../src/data/InMemoryDataSource'
import type { Schema } from '../src/data/Schema'
import { denseGridTheme } from '../src/theme/denseGridTheme'

const SCHEMA: Schema = {
  fields: [
    { id: 'name', name: 'Name', type: 'text', width: 200 },
    { id: 'age', name: 'Age', type: 'number', width: 80 },
  ],
}

function makeData() {
  return new InMemoryDataSource({
    schema: SCHEMA,
    rows: Array.from({ length: 50 }, (_, i) => ({ name: `n${i}`, age: i })),
  })
}

describe('Grid', () => {
  it('mounts a canvas into the container', () => {
    const el = document.createElement('div')
    Object.assign(el.style, { width: '400px', height: '300px' })
    document.body.appendChild(el)
    const grid = new Grid(el, { data: makeData() })
    expect(el.querySelector('canvas')).not.toBeNull()
    grid.destroy()
    document.body.removeChild(el)
  })

  it('destroy is idempotent and removes canvas', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    grid.destroy()
    grid.destroy() // second call: no throw
    expect(el.querySelector('canvas')).toBeNull()
  })

  it('mount → destroy → mount works (Strict Mode shape)', () => {
    const el = document.createElement('div')
    const data = makeData()
    const g1 = new Grid(el, { data })
    g1.destroy()
    const g2 = new Grid(el, { data })
    expect(el.querySelectorAll('canvas')).toHaveLength(1)
    g2.destroy()
  })

  it('setTheme triggers re-paint', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const spy = vi.spyOn(grid as unknown as { invalidate: () => void }, 'invalidate')
    grid.setTheme(denseGridTheme)
    expect(spy).toHaveBeenCalled()
    grid.destroy()
  })

  it('setData swaps data source and triggers paint', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const newData = new InMemoryDataSource({ schema: SCHEMA, rows: [{ name: 'X', age: 0 }] })
    grid.setData(newData)
    // No throw + canvas still present
    expect(el.querySelector('canvas')).not.toBeNull()
    grid.destroy()
  })

  it('setRowHeight changes a row height and triggers paint', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const spy = vi.spyOn(grid as unknown as { invalidate: () => void }, 'invalidate')
    grid.setRowHeight(5, 60)
    expect(spy).toHaveBeenCalled()
    grid.destroy()
  })

  it('setColumnWidth changes a column width and triggers paint', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    const spy = vi.spyOn(grid as unknown as { invalidate: () => void }, 'invalidate')
    grid.setColumnWidth('age', 200)
    expect(spy).toHaveBeenCalled()
    grid.destroy()
  })

  it('setColumnWidth on unknown fieldId is a no-op', () => {
    const el = document.createElement('div')
    const grid = new Grid(el, { data: makeData() })
    grid.setColumnWidth('does-not-exist', 200) // should not throw
    grid.destroy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @novasheet/core test tests/Grid.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `Grid.ts`**

Create `packages/core/src/Grid.ts`:

```ts
import type { DataSource } from './data/DataSource'
import { ChunkedAxis } from './layout/ChunkedAxis'
import { FrozenRegions } from './layout/FrozenRegions'
import { Viewport } from './layout/Viewport'
import { HighDPI } from './render/HighDPI'
import { Renderer } from './render/Renderer'
import { denseGridTheme } from './theme/denseGridTheme'
import type { Theme } from './theme/Theme'

export interface GridOptions {
  data: DataSource
  theme?: Theme
  frozenRows?: number
  frozenCols?: number
  defaultRowHeight?: number
}

export class Grid {
  private container: HTMLElement
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private data: DataSource
  private theme: Theme
  private explicitDefaultRowHeight: number | undefined
  private rowsAxis: ChunkedAxis
  private colsAxis: ChunkedAxis
  private frozen: FrozenRegions
  private viewport: Viewport
  private highDpi: HighDPI
  private renderer: Renderer
  private destroyed = false

  constructor(container: HTMLElement, options: GridOptions) {
    this.container = container
    this.data = options.data
    this.theme = options.theme ?? denseGridTheme
    this.explicitDefaultRowHeight = options.defaultRowHeight

    this.canvas = document.createElement('canvas')
    Object.assign(this.canvas.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      pointerEvents: 'none',
    })
    if (getComputedStyle(this.container).position === 'static') {
      this.container.style.position = 'relative'
    }
    this.container.appendChild(this.canvas)

    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('NovaSheet: 2d canvas context unavailable')
    this.ctx = ctx

    const rowHeight = this.resolveDefaultRowHeight()
    this.rowsAxis = new ChunkedAxis({ count: this.data.getRowCount(), defaultSize: rowHeight })
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

    this.highDpi = new HighDPI(this.canvas, this.ctx)
    this.renderer = new Renderer({
      ctx: this.ctx,
      data: this.data,
      viewport: this.viewport,
      rowsAxis: this.rowsAxis,
      colsAxis: this.colsAxis,
      theme: this.theme,
    })

    const rect = this.container.getBoundingClientRect()
    const w = rect.width || 400
    const h = rect.height || 300
    this.highDpi.resize(w, h)
    this.viewport.setSize(w, h)
    this.applyFieldWidths()

    this.renderer.paint()
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
    const rect = this.container.getBoundingClientRect()
    this.viewport.setSize(rect.width || 400, rect.height || 300)
    this.applyFieldWidths()
    this.renderer = new Renderer({
      ctx: this.ctx,
      data: this.data,
      viewport: this.viewport,
      rowsAxis: this.rowsAxis,
      colsAxis: this.colsAxis,
      theme: this.theme,
    })
    this.invalidate()
  }

  setTheme(theme: Theme): void {
    this.theme = theme
    this.viewport.setHeaderHeight(theme.metrics.headerHeight)
    if (this.explicitDefaultRowHeight === undefined) {
      this.rowsAxis.setDefaultSize(theme.metrics.rowHeight)
    }
    this.renderer.setTheme(theme)
    this.invalidate()
  }

  setRowHeight(rowIndex: number, height: number): void {
    this.rowsAxis.setSize(rowIndex, height)
    this.invalidate()
  }

  setColumnWidth(fieldId: string, width: number): void {
    const fields = this.data.getSchema().fields
    const index = fields.findIndex((f) => f.id === fieldId)
    if (index < 0) return
    this.colsAxis.setSize(index, width)
    this.invalidate()
  }

  refresh(): void {
    this.invalidate()
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    if (this.canvas.parentNode === this.container) {
      this.container.removeChild(this.canvas)
    }
  }

  private invalidate(): void {
    if (this.destroyed) return
    this.renderer.invalidate()
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

  /** Apply each field's `width` by calling colsAxis.setSize for non-default values */
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

- [ ] **Step 4: Update `index.ts` to re-export public API**

Replace `packages/core/src/index.ts` with:

```ts
export { Grid } from './Grid'
export type { GridOptions } from './Grid'
export { InMemoryDataSource } from './data/InMemoryDataSource'
export type {
  CellValue,
  Field,
  FieldType,
  Row,
  Schema,
} from './data/Schema'
export type {
  DataSource,
  DataSourceEvent,
  DataSourceListener,
} from './data/DataSource'
export { denseGridTheme } from './theme/denseGridTheme'
export type { Theme } from './theme/Theme'
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @novasheet/core test tests/Grid.test.ts`
Expected: PASS, 5 tests.

> Note: happy-dom doesn't ship a canvas 2d implementation. `getContext('2d')` returns `null` in happy-dom by default. We need to stub it for these tests.

If the tests fail with "2d canvas context unavailable", add a vitest setup file:

Create `packages/core/tests/setup.ts`:

```ts
import { beforeAll } from 'vitest'
import { createRecordingContext } from './helpers/recording-context'

beforeAll(() => {
  // happy-dom stub: HTMLCanvasElement.getContext returns null by default
  HTMLCanvasElement.prototype.getContext = function getContext(type: string) {
    if (type !== '2d') return null
    return createRecordingContext(this.width || 800, this.height || 600).ctx as never
  } as never
})
```

Edit `packages/core/vitest.config.ts` to register the setup:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    coverage: { reporter: ['text', 'html'], include: ['src/**/*.ts'] },
  },
})
```

Re-run: `pnpm --filter @novasheet/core test tests/Grid.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): add Grid facade + public exports + canvas test stub"
```

---

### Task 17: Full-suite integration smoke + typecheck + build

**Files:**
- (No new files; verifying the whole package end-to-end)

- [ ] **Step 1: Run the full test suite**

Run: `pnpm --filter @novasheet/core test`
Expected: ALL PASS. Total ~70 tests across 12 test files.

- [ ] **Step 2: Run typecheck**

Run: `pnpm --filter @novasheet/core typecheck`
Expected: no errors. If there are errors, fix them before continuing.

- [ ] **Step 3: Run build**

Run: `pnpm --filter @novasheet/core build`
Expected: `dist/` directory contains `index.js`, `index.cjs`, `index.d.ts`.

- [ ] **Step 4: Run lint**

Run: `pnpm lint`
Expected: zero errors. Warnings acceptable but address obvious ones.

- [ ] **Step 5: Verify exports surface**

Run a quick repl check (no need to commit anything):

```bash
node -e "import('./packages/core/dist/index.js').then(m => console.log(Object.keys(m)))"
```

Expected output includes: `Grid`, `InMemoryDataSource`, `denseGridTheme`.

- [ ] **Step 6: Commit any fixes from this task**

```bash
git status
# If clean, no commit needed.
# If there were fixes:
git add packages/core
git commit -m "chore(core): M1 final integration polish"
```

- [ ] **Step 7: Tag the milestone**

```bash
git tag m1-foundation
```

---

## M1 Completion Checklist

When all tasks above pass, the following should be true:

- [ ] Monorepo bootstrapped with pnpm workspaces, TypeScript strict, ESLint, Prettier
- [ ] `@novasheet/core` builds (ESM + CJS + d.ts) via tsup
- [ ] `pnpm --filter @novasheet/core test` passes all ~70 tests
- [ ] `pnpm --filter @novasheet/core typecheck` passes
- [ ] Public exports surface includes `Grid`, `InMemoryDataSource`, `denseGridTheme`, `Theme`, `DataSource`, `Schema`, `Field`, `FieldType`, `Row`, `CellValue`
- [ ] `new Grid(div, { data })` mounts a canvas, paints one frame containing the header row + visible rows (no scrolling yet)
- [ ] `grid.destroy()` is idempotent, mount→destroy→mount works
- [ ] `grid.setTheme()` swaps theme and triggers repaint
- [ ] `RecordingContext2D` test helper supports M2/M3/M4 future tests
- [ ] git tag `m1-foundation` exists

**What's intentionally NOT working yet:**
- Scroll (no overflow container, no scroll mapper) — M2
- Frozen rows / cols — M3
- Resize handles — M4
- React wrapper — M4
- Playground app, Playwright tests, FPS overlay — M5
