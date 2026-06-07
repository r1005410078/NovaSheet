# NovaSheet Excel Workspace AutoGrow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Excel-mode dynamic workspace that starts at A-Z x 1000, grows only from wheel-driven edge scrolling when edge content exists, and shrinks unused blank capacity back to content bounds plus buffer.

**Architecture:** Add a pure `features/excel-workspace/` domain for sizing policy, content bounds, wheel intent, grow/shrink decisions, and small append/shrink ports. Runtime only forwards wheel/scroll state and applies decisions; sparse Excel data owns row/column materialization and schema changes. Normal `DataSource` behavior remains unchanged unless Excel workspace mode is explicitly enabled.

**Tech Stack:** TypeScript strict mode, `bun:test`, existing `DataSource` protocol, `ChunkedAxis`, `ScrollMapper`, `GridRuntime`, Storybook HTML + React examples.

---

## File Map

| File | Responsibility |
| --- | --- |
| `packages/core/src/features/excel-workspace/ExcelWorkspacePolicy.ts` | Defaults: A-Z x 1000, grow batch, shrink buffer, max caps, wheel TTL. |
| `packages/core/src/features/excel-workspace/ExcelWorkspaceTypes.ts` | Shared types: `ExcelWorkspaceSize`, `ExcelWorkspaceDecision`, `ExcelWorkspacePort`. |
| `packages/core/src/features/excel-workspace/ExcelWorkspaceRules.ts` | Pure grow/shrink decisions from visible range, intent, bounds, and policy. |
| `packages/core/src/features/excel-workspace/ExcelWorkspaceController.ts` | Orchestrates policy + state + port, emits append/shrink calls. |
| `packages/core/src/features/excel-workspace/index.ts` | Public exports for the domain. |
| `packages/core/src/features/excel-workspace/README.md` | Domain contract and invariants. |
| `packages/core/src/kernel/data/SparseExcelDataSource.ts` | Sparse Excel-like data source: starts 1000 x 26, tracks materialized bounds, supports append/shrink without storing blank cells. |
| `packages/core/src/dom/scroll/NativeScroller.ts` | Record wheel intent separately from plain scroll events. |
| `packages/core/src/dom/runtime/GridRuntime.ts` | Wire wheel-driven scroll frames to `ExcelWorkspaceController`; preserve anchor after grow/shrink. |
| `packages/core/src/dom/runtime/GridController.ts` | Expose options/ports if needed by runtime. |
| `packages/core/src/Grid.ts` | Add opt-in `excelWorkspace` option and facade constructor wiring. |
| `packages/core/src/index.ts` | Export `SparseExcelDataSource` and Excel workspace types. |
| `apps/storybook/src/stories/ExcelWorkspace.stories.ts` | Demo: starts A-Z x 1000, wheel grows, blank capacity shrinks. |
| `apps/storybook/src/stories/snippets/excel-workspace.autogrow.snippet.ts` | Copyable usage snippet. |

---

## Domain Semantics

Initial workspace:

```ts
const DEFAULT_EXCEL_WORKSPACE_ROWS = 1_000
const DEFAULT_EXCEL_WORKSPACE_COLS = 26
```

Logical size rule:

```ts
rowCount = max(minRows, contentEndRow + 1 + rowBuffer)
colCount = max(minCols, contentEndCol + 1 + colBuffer)
```

Grow rule:

```ts
growRows =
  intent.kind === 'wheel' &&
  intent.deltaY > 0 &&
  visible.endRow >= rowCount - rowGrowThreshold &&
  hasMaterializedRows(rowCount - rowGrowThreshold, rowCount - 1)
```

Shrink rule:

```ts
shrinkRows =
  rowCount > max(minRows, contentEndRow + 1 + rowBuffer) &&
  now - lastGrowAt >= shrinkDelayMs
```

Important invariant:

```txt
Shrink may remove only blank capacity. It must never drop value, format, merge, row height, column width, or future metadata.
```

---

## Task 1: Pure Workspace Policy And Rules

**Files:**
- Create: `packages/core/src/features/excel-workspace/ExcelWorkspacePolicy.ts`
- Create: `packages/core/src/features/excel-workspace/ExcelWorkspaceTypes.ts`
- Create: `packages/core/src/features/excel-workspace/ExcelWorkspaceRules.ts`
- Create: `packages/core/src/features/excel-workspace/index.ts`
- Test: `packages/core/tests/features/excel-workspace/ExcelWorkspaceRules.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/tests/features/excel-workspace/ExcelWorkspaceRules.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'

import {
  DEFAULT_EXCEL_WORKSPACE_POLICY,
  decideExcelWorkspaceResize,
} from '../../../src/features/excel-workspace'

describe('ExcelWorkspaceRules', () => {
  it('keeps the default A-Z x 1000 workspace without edge content', () => {
    const decision = decideExcelWorkspaceResize({
      policy: DEFAULT_EXCEL_WORKSPACE_POLICY,
      nowMs: 1_000,
      size: { rowCount: 1_000, colCount: 26 },
      visible: { rows: [970, 999], cols: [0, 25] },
      contentBounds: null,
      intent: { kind: 'wheel', atMs: 950, deltaX: 0, deltaY: 120 },
      hasMaterializedRows: false,
      hasMaterializedCols: false,
      lastGrowAtMs: null,
    })

    expect(decision).toEqual({ kind: 'none' })
  })

  it('grows rows on wheel-driven bottom edge when edge content exists', () => {
    const decision = decideExcelWorkspaceResize({
      policy: DEFAULT_EXCEL_WORKSPACE_POLICY,
      nowMs: 1_000,
      size: { rowCount: 1_000, colCount: 26 },
      visible: { rows: [970, 999], cols: [0, 25] },
      contentBounds: { startRow: 0, endRow: 999, startCol: 0, endCol: 4 },
      intent: { kind: 'wheel', atMs: 950, deltaX: 0, deltaY: 120 },
      hasMaterializedRows: true,
      hasMaterializedCols: false,
      lastGrowAtMs: null,
    })

    expect(decision).toEqual({ kind: 'grow', rows: 200, cols: 0 })
  })

  it('does not grow when the same scroll position came from scrollbar drag', () => {
    const decision = decideExcelWorkspaceResize({
      policy: DEFAULT_EXCEL_WORKSPACE_POLICY,
      nowMs: 1_000,
      size: { rowCount: 1_000, colCount: 26 },
      visible: { rows: [970, 999], cols: [0, 25] },
      contentBounds: { startRow: 0, endRow: 999, startCol: 0, endCol: 4 },
      intent: { kind: 'scrollbar', atMs: 950 },
      hasMaterializedRows: true,
      hasMaterializedCols: false,
      lastGrowAtMs: null,
    })

    expect(decision).toEqual({ kind: 'none' })
  })

  it('shrinks blank row capacity to content bounds plus buffer', () => {
    const decision = decideExcelWorkspaceResize({
      policy: DEFAULT_EXCEL_WORKSPACE_POLICY,
      nowMs: 5_000,
      size: { rowCount: 2_000, colCount: 26 },
      visible: { rows: [100, 130], cols: [0, 25] },
      contentBounds: { startRow: 0, endRow: 850, startCol: 0, endCol: 4 },
      intent: { kind: 'scrollbar', atMs: 4_900 },
      hasMaterializedRows: false,
      hasMaterializedCols: false,
      lastGrowAtMs: 1_000,
    })

    expect(decision).toEqual({ kind: 'shrink', rowCount: 1_051, colCount: 26 })
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
bun test packages/core/tests/features/excel-workspace/ExcelWorkspaceRules.test.ts
```

Expected: FAIL because `features/excel-workspace` does not exist.

- [ ] **Step 3: Implement policy/types/rules**

Create `packages/core/src/features/excel-workspace/ExcelWorkspacePolicy.ts`:

```ts
export interface ExcelWorkspacePolicy {
  readonly minRows: number
  readonly minCols: number
  readonly rowGrowBatch: number
  readonly colGrowBatch: number
  readonly rowGrowThreshold: number
  readonly colGrowThreshold: number
  readonly rowBuffer: number
  readonly colBuffer: number
  readonly maxRows: number
  readonly maxCols: number
  readonly wheelIntentTtlMs: number
  readonly growCooldownMs: number
  readonly shrinkDelayMs: number
}

export const DEFAULT_EXCEL_WORKSPACE_POLICY: ExcelWorkspacePolicy = {
  minRows: 1_000,
  minCols: 26,
  rowGrowBatch: 200,
  colGrowBatch: 10,
  rowGrowThreshold: 30,
  colGrowThreshold: 5,
  rowBuffer: 200,
  colBuffer: 10,
  maxRows: 1_048_576,
  maxCols: 16_384,
  wheelIntentTtlMs: 200,
  growCooldownMs: 100,
  shrinkDelayMs: 500,
}
```

Create `packages/core/src/features/excel-workspace/ExcelWorkspaceTypes.ts`:

```ts
import type { CellRange } from '../../kernel/coords/SelectionTypes'
import type { ExcelWorkspacePolicy } from './ExcelWorkspacePolicy'

export interface ExcelWorkspaceSize {
  readonly rowCount: number
  readonly colCount: number
}

export interface ExcelWorkspaceVisibleRange {
  readonly rows: readonly [number, number]
  readonly cols: readonly [number, number]
}

export type ExcelWorkspaceScrollIntent =
  | { readonly kind: 'wheel'; readonly atMs: number; readonly deltaX: number; readonly deltaY: number }
  | { readonly kind: 'scrollbar'; readonly atMs: number }
  | { readonly kind: 'programmatic'; readonly atMs: number }

export type ExcelWorkspaceDecision =
  | { readonly kind: 'none' }
  | { readonly kind: 'grow'; readonly rows: number; readonly cols: number }
  | { readonly kind: 'shrink'; readonly rowCount: number; readonly colCount: number }

export interface ExcelWorkspaceDecisionInput {
  readonly policy: ExcelWorkspacePolicy
  readonly nowMs: number
  readonly size: ExcelWorkspaceSize
  readonly visible: ExcelWorkspaceVisibleRange
  readonly contentBounds: CellRange | null
  readonly intent: ExcelWorkspaceScrollIntent | null
  readonly hasMaterializedRows: boolean
  readonly hasMaterializedCols: boolean
  readonly lastGrowAtMs: number | null
}
```

Create `packages/core/src/features/excel-workspace/ExcelWorkspaceRules.ts`:

```ts
import type { ExcelWorkspaceDecision, ExcelWorkspaceDecisionInput } from './ExcelWorkspaceTypes'

export function decideExcelWorkspaceResize(input: ExcelWorkspaceDecisionInput): ExcelWorkspaceDecision {
  const growRows = shouldGrowRows(input)
  const growCols = shouldGrowCols(input)
  if (growRows || growCols) {
    return {
      kind: 'grow',
      rows: growRows ? Math.min(input.policy.rowGrowBatch, input.policy.maxRows - input.size.rowCount) : 0,
      cols: growCols ? Math.min(input.policy.colGrowBatch, input.policy.maxCols - input.size.colCount) : 0,
    }
  }

  const shrink = computeShrinkTarget(input)
  if (shrink) return shrink
  return { kind: 'none' }
}

function shouldGrowRows(input: ExcelWorkspaceDecisionInput): boolean {
  const intent = input.intent
  if (!intent || intent.kind !== 'wheel') return false
  if (input.nowMs - intent.atMs > input.policy.wheelIntentTtlMs) return false
  if (input.lastGrowAtMs !== null && input.nowMs - input.lastGrowAtMs < input.policy.growCooldownMs) return false
  if (intent.deltaY <= 0) return false
  if (input.size.rowCount >= input.policy.maxRows) return false
  return (
    input.visible.rows[1] >= input.size.rowCount - input.policy.rowGrowThreshold &&
    input.hasMaterializedRows
  )
}

function shouldGrowCols(input: ExcelWorkspaceDecisionInput): boolean {
  const intent = input.intent
  if (!intent || intent.kind !== 'wheel') return false
  if (input.nowMs - intent.atMs > input.policy.wheelIntentTtlMs) return false
  if (input.lastGrowAtMs !== null && input.nowMs - input.lastGrowAtMs < input.policy.growCooldownMs) return false
  if (intent.deltaX <= 0) return false
  if (input.size.colCount >= input.policy.maxCols) return false
  return (
    input.visible.cols[1] >= input.size.colCount - input.policy.colGrowThreshold &&
    input.hasMaterializedCols
  )
}

function computeShrinkTarget(input: ExcelWorkspaceDecisionInput): ExcelWorkspaceDecision | null {
  if (input.lastGrowAtMs !== null && input.nowMs - input.lastGrowAtMs < input.policy.shrinkDelayMs) return null
  const bounds = input.contentBounds
  const targetRows = bounds
    ? Math.max(input.policy.minRows, bounds.endRow + 1 + input.policy.rowBuffer)
    : input.policy.minRows
  const targetCols = bounds
    ? Math.max(input.policy.minCols, bounds.endCol + 1 + input.policy.colBuffer)
    : input.policy.minCols
  const rowCount = Math.min(targetRows, input.size.rowCount)
  const colCount = Math.min(targetCols, input.size.colCount)
  if (rowCount === input.size.rowCount && colCount === input.size.colCount) return null
  return { kind: 'shrink', rowCount, colCount }
}
```

Create `packages/core/src/features/excel-workspace/index.ts`:

```ts
export {
  DEFAULT_EXCEL_WORKSPACE_POLICY,
  type ExcelWorkspacePolicy,
} from './ExcelWorkspacePolicy'
export { decideExcelWorkspaceResize } from './ExcelWorkspaceRules'
export type {
  ExcelWorkspaceDecision,
  ExcelWorkspaceDecisionInput,
  ExcelWorkspaceScrollIntent,
  ExcelWorkspaceSize,
  ExcelWorkspaceVisibleRange,
} from './ExcelWorkspaceTypes'
```

- [ ] **Step 4: Run tests**

Run:

```bash
bun test packages/core/tests/features/excel-workspace/ExcelWorkspaceRules.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/features/excel-workspace packages/core/tests/features/excel-workspace/ExcelWorkspaceRules.test.ts
git commit -m "feat(core): 新增 Excel workspace 纯规则"
```

---

## Task 2: Sparse Excel Data Source

**Files:**
- Create: `packages/core/src/kernel/data/SparseExcelDataSource.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/kernel/data/SparseExcelDataSource.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/tests/kernel/data/SparseExcelDataSource.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'

import { SparseExcelDataSource } from '../../../src/kernel/data/SparseExcelDataSource'

describe('SparseExcelDataSource', () => {
  it('starts as A-Z x 1000 without materializing blank rows', () => {
    const data = new SparseExcelDataSource()

    expect(data.getRowCount()).toBe(1_000)
    expect(data.getSchema().fields).toHaveLength(26)
    expect(data.getSchema().fields[0]?.name).toBe('A')
    expect(data.getSchema().fields[25]?.name).toBe('Z')
    expect(data.getRows(0, 10)).toHaveLength(11)
    expect(data.getCell(999, 'Z')).toBeUndefined()
    expect(data.getContentBounds()).toBeNull()
  })

  it('tracks content bounds for materialized cells', () => {
    const data = new SparseExcelDataSource()

    data.updateCell(980, 'Z', 'edge')

    expect(data.getCell(980, 'Z')).toBe('edge')
    expect(data.getContentBounds()).toEqual({
      startRow: 980,
      endRow: 980,
      startCol: 25,
      endCol: 25,
    })
    expect(data.hasMaterializedRows(970, 999)).toBe(true)
    expect(data.hasMaterializedCols(20, 25)).toBe(true)
  })

  it('appends and shrinks blank capacity without dropping content', () => {
    const data = new SparseExcelDataSource()
    data.updateCell(980, 'Z', 'edge')

    data.appendRows(200)
    data.appendCols(10)

    expect(data.getRowCount()).toBe(1_200)
    expect(data.getSchema().fields).toHaveLength(36)
    expect(data.getSchema().fields[26]?.name).toBe('AA')

    data.resizeWorkspace({ rowCount: 1_050, colCount: 30 })

    expect(data.getRowCount()).toBe(1_050)
    expect(data.getSchema().fields).toHaveLength(30)
    expect(data.getCell(980, 'Z')).toBe('edge')
  })

  it('rejects shrink targets that would drop materialized content', () => {
    const data = new SparseExcelDataSource()
    data.updateCell(980, 'Z', 'edge')

    expect(() => data.resizeWorkspace({ rowCount: 500, colCount: 26 })).toThrow(
      'SparseExcelDataSource.resizeWorkspace: target would drop materialized content',
    )
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
bun test packages/core/tests/kernel/data/SparseExcelDataSource.test.ts
```

Expected: FAIL because `SparseExcelDataSource` does not exist.

- [ ] **Step 3: Implement sparse data source**

Create `packages/core/src/kernel/data/SparseExcelDataSource.ts`:

```ts
import type { DataSource, DataSourceEvent, DataSourceListener } from './DataSource'
import type { CellValue, Field, Row, Schema } from './Schema'
import { columnIndexToLetter } from '../geometry/columnLetter'
import type { CellRange } from '../coords/SelectionTypes'

export interface SparseExcelDataSourceOptions {
  readonly rowCount?: number
  readonly colCount?: number
}

export interface SparseExcelWorkspaceSize {
  readonly rowCount: number
  readonly colCount: number
}

export class SparseExcelDataSource implements DataSource {
  private rowCount: number
  private schema: Schema
  private readonly cells = new Map<string, CellValue>()
  private readonly listeners = new Set<DataSourceListener>()

  constructor(options: SparseExcelDataSourceOptions = {}) {
    this.rowCount = options.rowCount ?? 1_000
    this.schema = { fields: makeFields(options.colCount ?? 26) }
  }

  getRowCount(): number {
    return this.rowCount
  }

  getSchema(): Schema {
    return this.schema
  }

  getRows(startIndex: number, endIndex: number): Row[] {
    const start = Math.max(0, startIndex)
    const end = Math.min(this.rowCount - 1, endIndex)
    if (end < start) return []
    return Array.from({ length: end - start + 1 }, (_, offset) => this.rowAt(start + offset))
  }

  getCell(rowIndex: number, fieldId: string): CellValue | undefined {
    return this.cells.get(cellKey(rowIndex, this.fieldIdToCol(fieldId)))
  }

  updateCell(rowIndex: number, fieldId: string, value: CellValue): void {
    if (rowIndex < 0 || rowIndex >= this.rowCount) return
    const colIndex = this.fieldIdToCol(fieldId)
    if (colIndex < 0) return
    const key = cellKey(rowIndex, colIndex)
    if (value === null || value === undefined || value === '') this.cells.delete(key)
    else this.cells.set(key, value)
    this.emit({ type: 'rowsChanged', startIndex: rowIndex, endIndex: rowIndex })
  }

  appendRows(count: number): void {
    if (count <= 0) return
    this.rowCount += count
    this.emit({ type: 'rowCountChanged', newCount: this.rowCount })
  }

  appendCols(count: number): void {
    if (count <= 0) return
    this.schema = { fields: makeFields(this.schema.fields.length + count) }
    this.emit({ type: 'schemaChanged' })
  }

  resizeWorkspace(size: SparseExcelWorkspaceSize): void {
    const bounds = this.getContentBounds()
    if (bounds && (size.rowCount <= bounds.endRow || size.colCount <= bounds.endCol)) {
      throw new Error('SparseExcelDataSource.resizeWorkspace: target would drop materialized content')
    }
    const rowChanged = size.rowCount !== this.rowCount
    const colChanged = size.colCount !== this.schema.fields.length
    this.rowCount = size.rowCount
    if (colChanged) this.schema = { fields: makeFields(size.colCount) }
    if (rowChanged) this.emit({ type: 'rowCountChanged', newCount: this.rowCount })
    if (colChanged) this.emit({ type: 'schemaChanged' })
  }

  getContentBounds(): CellRange | null {
    let startRow = Number.POSITIVE_INFINITY
    let endRow = -1
    let startCol = Number.POSITIVE_INFINITY
    let endCol = -1
    for (const key of this.cells.keys()) {
      const [row, col] = parseCellKey(key)
      startRow = Math.min(startRow, row)
      endRow = Math.max(endRow, row)
      startCol = Math.min(startCol, col)
      endCol = Math.max(endCol, col)
    }
    if (endRow < 0 || endCol < 0) return null
    return { startRow, endRow, startCol, endCol }
  }

  hasMaterializedRows(start: number, end: number): boolean {
    for (const key of this.cells.keys()) {
      const [row] = parseCellKey(key)
      if (row >= start && row <= end) return true
    }
    return false
  }

  hasMaterializedCols(start: number, end: number): boolean {
    for (const key of this.cells.keys()) {
      const [, col] = parseCellKey(key)
      if (col >= start && col <= end) return true
    }
    return false
  }

  subscribe(listener: DataSourceListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private rowAt(rowIndex: number): Row {
    const row: Record<string, CellValue> = {}
    for (const field of this.schema.fields) {
      const value = this.getCell(rowIndex, field.id)
      if (value !== undefined) row[field.id] = value
    }
    return row as Row
  }

  private fieldIdToCol(fieldId: string): number {
    return this.schema.fields.findIndex((field) => field.id === fieldId)
  }

  private emit(event: DataSourceEvent): void {
    for (const listener of this.listeners) listener(event)
  }
}

function makeFields(count: number): Field[] {
  return Array.from({ length: count }, (_, index) => ({
    id: columnIndexToLetter(index),
    name: columnIndexToLetter(index),
    type: 'text' as const,
    width: 96,
  }))
}

function cellKey(row: number, col: number): string {
  return `${row}:${col}`
}

function parseCellKey(key: string): readonly [number, number] {
  const [row, col] = key.split(':').map(Number)
  return [row!, col!]
}
```

Modify `packages/core/src/index.ts`:

```ts
export { SparseExcelDataSource } from './kernel/data/SparseExcelDataSource'
export type {
  SparseExcelDataSourceOptions,
  SparseExcelWorkspaceSize,
} from './kernel/data/SparseExcelDataSource'
```

- [ ] **Step 4: Run tests**

Run:

```bash
bun test packages/core/tests/kernel/data/SparseExcelDataSource.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/kernel/data/SparseExcelDataSource.ts packages/core/src/index.ts packages/core/tests/kernel/data/SparseExcelDataSource.test.ts
git commit -m "feat(core): 新增稀疏 Excel 数据源"
```

---

## Task 3: Workspace Controller

**Files:**
- Create: `packages/core/src/features/excel-workspace/ExcelWorkspaceController.ts`
- Modify: `packages/core/src/features/excel-workspace/index.ts`
- Test: `packages/core/tests/features/excel-workspace/ExcelWorkspaceController.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/core/tests/features/excel-workspace/ExcelWorkspaceController.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'

import {
  DEFAULT_EXCEL_WORKSPACE_POLICY,
  ExcelWorkspaceController,
} from '../../../src/features/excel-workspace'

describe('ExcelWorkspaceController', () => {
  it('appends rows once when wheel reaches materialized bottom edge', () => {
    const appended: number[] = []
    const controller = new ExcelWorkspaceController({
      policy: DEFAULT_EXCEL_WORKSPACE_POLICY,
      port: {
        getSize: () => ({ rowCount: 1_000, colCount: 26 }),
        getVisibleRange: () => ({ rows: [970, 999], cols: [0, 25] }),
        getContentBounds: () => ({ startRow: 0, endRow: 999, startCol: 0, endCol: 3 }),
        hasMaterializedRows: () => true,
        hasMaterializedCols: () => false,
        appendRows: (count) => appended.push(count),
        appendCols: () => {},
        resizeWorkspace: () => {},
      },
    })

    controller.recordWheel({ atMs: 1_000, deltaX: 0, deltaY: 120 })
    controller.afterScrollFrame(1_010)

    expect(appended).toEqual([200])
  })

  it('shrinks blank capacity after cooldown', () => {
    const resized: Array<{ rowCount: number; colCount: number }> = []
    const controller = new ExcelWorkspaceController({
      policy: DEFAULT_EXCEL_WORKSPACE_POLICY,
      port: {
        getSize: () => ({ rowCount: 2_000, colCount: 26 }),
        getVisibleRange: () => ({ rows: [20, 60], cols: [0, 25] }),
        getContentBounds: () => ({ startRow: 0, endRow: 800, startCol: 0, endCol: 5 }),
        hasMaterializedRows: () => false,
        hasMaterializedCols: () => false,
        appendRows: () => {},
        appendCols: () => {},
        resizeWorkspace: (size) => resized.push(size),
      },
    })

    controller.afterScrollFrame(2_000)

    expect(resized).toEqual([{ rowCount: 1_001, colCount: 26 }])
  })
})
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
bun test packages/core/tests/features/excel-workspace/ExcelWorkspaceController.test.ts
```

Expected: FAIL because `ExcelWorkspaceController` does not exist.

- [ ] **Step 3: Implement controller**

Create `packages/core/src/features/excel-workspace/ExcelWorkspaceController.ts`:

```ts
import {
  DEFAULT_EXCEL_WORKSPACE_POLICY,
  type ExcelWorkspacePolicy,
} from './ExcelWorkspacePolicy'
import { decideExcelWorkspaceResize } from './ExcelWorkspaceRules'
import type { ExcelWorkspaceScrollIntent, ExcelWorkspaceSize, ExcelWorkspaceVisibleRange } from './ExcelWorkspaceTypes'
import type { CellRange } from '../../kernel/coords/SelectionTypes'

export interface ExcelWorkspacePort {
  getSize(): ExcelWorkspaceSize
  getVisibleRange(): ExcelWorkspaceVisibleRange
  getContentBounds(): CellRange | null
  hasMaterializedRows(start: number, end: number): boolean
  hasMaterializedCols(start: number, end: number): boolean
  appendRows(count: number): void
  appendCols(count: number): void
  resizeWorkspace(size: ExcelWorkspaceSize): void
}

export interface ExcelWorkspaceControllerOptions {
  readonly policy?: Partial<ExcelWorkspacePolicy>
  readonly port: ExcelWorkspacePort
}

export class ExcelWorkspaceController {
  private readonly policy: ExcelWorkspacePolicy
  private readonly port: ExcelWorkspacePort
  private lastIntent: ExcelWorkspaceScrollIntent | null = null
  private lastGrowAtMs: number | null = null

  constructor(options: ExcelWorkspaceControllerOptions) {
    this.policy = { ...DEFAULT_EXCEL_WORKSPACE_POLICY, ...options.policy }
    this.port = options.port
  }

  recordWheel(input: { readonly atMs: number; readonly deltaX: number; readonly deltaY: number }): void {
    this.lastIntent = { kind: 'wheel', ...input }
  }

  recordProgrammaticScroll(atMs: number): void {
    this.lastIntent = { kind: 'programmatic', atMs }
  }

  recordScrollbarScroll(atMs: number): void {
    if (this.lastIntent?.kind === 'wheel' && atMs - this.lastIntent.atMs <= this.policy.wheelIntentTtlMs) return
    this.lastIntent = { kind: 'scrollbar', atMs }
  }

  afterScrollFrame(nowMs: number): void {
    const size = this.port.getSize()
    const visible = this.port.getVisibleRange()
    const rowEdgeStart = Math.max(0, size.rowCount - this.policy.rowGrowThreshold)
    const colEdgeStart = Math.max(0, size.colCount - this.policy.colGrowThreshold)
    const decision = decideExcelWorkspaceResize({
      policy: this.policy,
      nowMs,
      size,
      visible,
      contentBounds: this.port.getContentBounds(),
      intent: this.lastIntent,
      hasMaterializedRows: this.port.hasMaterializedRows(rowEdgeStart, size.rowCount - 1),
      hasMaterializedCols: this.port.hasMaterializedCols(colEdgeStart, size.colCount - 1),
      lastGrowAtMs: this.lastGrowAtMs,
    })

    if (decision.kind === 'grow') {
      if (decision.rows > 0) this.port.appendRows(decision.rows)
      if (decision.cols > 0) this.port.appendCols(decision.cols)
      this.lastGrowAtMs = nowMs
      return
    }
    if (decision.kind === 'shrink') {
      this.port.resizeWorkspace({ rowCount: decision.rowCount, colCount: decision.colCount })
    }
  }
}
```

Modify `packages/core/src/features/excel-workspace/index.ts`:

```ts
export { ExcelWorkspaceController, type ExcelWorkspacePort } from './ExcelWorkspaceController'
```

- [ ] **Step 4: Run tests**

Run:

```bash
bun test packages/core/tests/features/excel-workspace/ExcelWorkspaceController.test.ts packages/core/tests/features/excel-workspace/ExcelWorkspaceRules.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/features/excel-workspace packages/core/tests/features/excel-workspace
git commit -m "feat(core): 新增 Excel workspace 控制器"
```

---

## Task 4: Runtime Wheel Intent Wiring

**Files:**
- Modify: `packages/core/src/dom/scroll/NativeScroller.ts`
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts`
- Modify: `packages/core/src/Grid.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/dom/scroll/NativeScroller.test.ts`
- Test: `packages/canvas2d/tests/grid/Grid.excel-workspace.test.ts`

- [ ] **Step 1: Write failing NativeScroller test**

Create or update `packages/core/tests/dom/scroll/NativeScroller.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'

import { NativeScroller } from '../../../src/dom/scroll/NativeScroller'
import { FrameScheduler } from '../../../src/kernel/util/raf'

describe('NativeScroller wheel intent', () => {
  it('reports wheel intent separately from scroll events', async () => {
    const host = document.createElement('div')
    let wheel: { deltaX: number; deltaY: number } | null = null
    const scroller = new NativeScroller(host, new FrameScheduler(), () => {}, {
      onWheel: (event) => {
        wheel = { deltaX: event.deltaX, deltaY: event.deltaY }
      },
    })

    scroller.attach()
    host.dispatchEvent(new WheelEvent('wheel', { deltaX: 0, deltaY: 120 }))

    expect(wheel).toEqual({ deltaX: 0, deltaY: 120 })
    scroller.destroy()
  })
})
```

Expected failure: constructor does not accept `onWheel`.

- [ ] **Step 2: Write failing Grid integration test**

Create `packages/canvas2d/tests/grid/Grid.excel-workspace.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import { Grid, SparseExcelDataSource } from '@novasheet/core'
import { canvas2dBackend } from '@novasheet/canvas2d'

describe('Grid excelWorkspace', () => {
  it('grows rows only after wheel-driven edge scroll', async () => {
    const host = document.createElement('div')
    Object.assign(host.style, { width: '640px', height: '360px' })
    document.body.appendChild(host)
    const data = new SparseExcelDataSource()
    data.updateCell(999, 'A', 'edge')
    const grid = new Grid(host, {
      data,
      backend: canvas2dBackend(),
      excelHeaders: true,
      excelWorkspace: true,
    })

    grid.scrollToRow(999, 'end')
    expect(data.getRowCount()).toBe(1_000)

    const scrollHost = host.querySelector('[data-novasheet-scroll-host]') as HTMLElement
    scrollHost.dispatchEvent(new WheelEvent('wheel', { deltaY: 120 }))
    scrollHost.dispatchEvent(new Event('scroll'))
    await new Promise((resolve) => requestAnimationFrame(resolve))

    expect(data.getRowCount()).toBeGreaterThan(1_000)

    grid.destroy()
    host.remove()
  })
})
```

Expected failure: `excelWorkspace` option is not wired yet.

- [ ] **Step 3: Implement NativeScroller wheel hook**

Modify `packages/core/src/dom/scroll/NativeScroller.ts` constructor and attach/destroy:

```ts
export interface NativeScrollerOptions {
  readonly onWheel?: (event: WheelEvent) => void
}

constructor(
  private scrollHost: HTMLElement,
  private scheduler: FrameScheduler,
  private onScroll: ScrollListener,
  private options: NativeScrollerOptions = {},
) {}

attach(): void {
  if (this.listenerAttached || this.destroyed) return
  this.scrollHost.addEventListener('scroll', this.handler, { passive: true })
  this.scrollHost.addEventListener('wheel', this.wheelHandler, { passive: true })
  this.listenerAttached = true
}

destroy(): void {
  if (this.destroyed) return
  this.destroyed = true
  this.scheduler.cancel('scroll:read')
  if (this.listenerAttached) {
    this.scrollHost.removeEventListener('scroll', this.handler)
    this.scrollHost.removeEventListener('wheel', this.wheelHandler)
    this.listenerAttached = false
  }
}

private wheelHandler = (event: WheelEvent): void => {
  this.options.onWheel?.(event)
}
```

- [ ] **Step 4: Add Grid option and runtime controller wiring**

Modify `packages/core/src/Grid.ts`:

```ts
import type { ExcelWorkspacePolicy } from './features/excel-workspace'

export interface GridOptions extends GridEngineOptions {
  readonly excelWorkspace?: boolean | Partial<ExcelWorkspacePolicy>
  // existing options...
}
```

Pass `excelWorkspace` into `GridControllerImpl`, then into `GridRuntime`.

In `GridRuntime`, create an `ExcelWorkspaceController` only when:

```ts
options.excelWorkspace !== undefined && options.excelWorkspace !== false
```

Runtime port should read:

```ts
getSize: () => ({
  rowCount: this.engine.getFrame().data.getRowCount(),
  colCount: this.engine.getFrame().data.getSchema().fields.length,
})
```

For `SparseExcelDataSource`, call methods directly after narrowing:

```ts
function isExcelWorkspaceDataSource(data: unknown): data is SparseExcelDataSource {
  return (
    typeof data === 'object' &&
    data !== null &&
    'appendRows' in data &&
    'appendCols' in data &&
    'resizeWorkspace' in data &&
    'getContentBounds' in data
  )
}
```

After `appendRows`, `appendCols`, or `resizeWorkspace`, call the existing data event path to rebuild axes. If the existing subscription already handles `rowCountChanged` / `schemaChanged`, do not manually rebuild twice.

- [ ] **Step 5: Run targeted tests**

Run:

```bash
bun test packages/core/tests/dom/scroll/NativeScroller.test.ts packages/canvas2d/tests/grid/Grid.excel-workspace.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/dom/scroll/NativeScroller.ts packages/core/src/dom/runtime packages/core/src/Grid.ts packages/core/src/index.ts packages/core/tests/dom/scroll/NativeScroller.test.ts packages/canvas2d/tests/grid/Grid.excel-workspace.test.ts
git commit -m "feat(core): 接入 Excel workspace 滚轮扩容"
```

---

## Task 5: Blank Capacity Shrink And Anchor Preservation

**Files:**
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts`
- Modify: `packages/core/src/features/excel-workspace/ExcelWorkspaceController.ts`
- Test: `packages/canvas2d/tests/grid/Grid.excel-workspace.test.ts`

- [ ] **Step 1: Add failing shrink integration test**

Append to `packages/canvas2d/tests/grid/Grid.excel-workspace.test.ts`:

```ts
it('shrinks unused blank capacity without dropping edge content', async () => {
  const host = document.createElement('div')
  Object.assign(host.style, { width: '640px', height: '360px' })
  document.body.appendChild(host)
  const data = new SparseExcelDataSource({ rowCount: 2_000, colCount: 26 })
  data.updateCell(800, 'A', 'content')
  const grid = new Grid(host, {
    data,
    backend: canvas2dBackend(),
    excelHeaders: true,
    excelWorkspace: { shrinkDelayMs: 0 },
  })

  grid.scrollToRow(100, 'start')
  await new Promise((resolve) => requestAnimationFrame(resolve))

  expect(data.getRowCount()).toBe(1_001)
  expect(data.getCell(800, 'A')).toBe('content')

  grid.destroy()
  host.remove()
})
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
bun test packages/canvas2d/tests/grid/Grid.excel-workspace.test.ts
```

Expected: FAIL because runtime does not run shrink decision on non-wheel scroll frames or does not preserve data.

- [ ] **Step 3: Preserve logical anchor around resize**

Before applying controller decision in runtime, capture:

```ts
const beforeFrame = this.engine.getFrame()
const anchor = {
  scrollY: beforeFrame.viewport.scrollY,
  scrollX: beforeFrame.viewport.scrollX,
}
```

After data resize events rebuild axes/spacer, restore current logical offset through existing scroll mapper:

```ts
this.setLogicalScroll(anchor.scrollY, anchor.scrollX)
```

If there is no existing `setLogicalScroll` helper, extract one from the current scroll handler path so it:

```txt
logical scroll -> engine.setScroll -> renderer invalidate -> scrollHost scrollTop/Left sync when needed
```

Do not reset selection during shrink.

- [ ] **Step 4: Run tests**

Run:

```bash
bun test packages/canvas2d/tests/grid/Grid.excel-workspace.test.ts packages/core/tests/features/excel-workspace
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/dom/runtime/GridRuntime.ts packages/core/src/features/excel-workspace packages/canvas2d/tests/grid/Grid.excel-workspace.test.ts
git commit -m "feat(core): 回收 Excel workspace 空白容量"
```

---

## Task 6: Storybook Demo

**Files:**
- Create: `apps/storybook/src/stories/ExcelWorkspace.stories.ts`
- Create: `apps/storybook/src/stories/snippets/excel-workspace.autogrow.snippet.ts`
- Test: `apps/storybook/src/stories/ExcelWorkspace.stories.test.ts`

- [ ] **Step 1: Write failing story test**

Create `apps/storybook/src/stories/ExcelWorkspace.stories.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'

import { AutoGrow } from './ExcelWorkspace.stories'

describe('ExcelWorkspace Storybook story', () => {
  it('renders an Excel workspace grid', () => {
    const render = AutoGrow.render
    expect(render).toBeDefined()

    const host = render!({}, {} as never) as HTMLElement

    expect(host.querySelector('canvas')).not.toBeNull()
    expect(host.textContent).toContain('A-Z x 1000')

    const grid = (host.querySelector('[data-novasheet-story-grid]') as HTMLElement | null)
    expect(grid).not.toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
bun test apps/storybook/src/stories/ExcelWorkspace.stories.test.ts
```

Expected: FAIL because story does not exist.

- [ ] **Step 3: Add story**

Create `apps/storybook/src/stories/ExcelWorkspace.stories.ts`:

```ts
import type { Meta, StoryObj } from '@storybook/html'
import { SparseExcelDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'
import { docsMeta, docsStory } from '../story-docs'
import src from './snippets/excel-workspace.autogrow.snippet.ts?raw'

const meta: Meta = {
  title: 'Table/Excel workspace',
  parameters: { layout: 'fullscreen' },
  ...docsMeta(
    'Excel Workspace starts at A-Z x 1000. Wheel-driven edge scrolling grows the workspace only when the edge has materialized content; blank capacity is reclaimed.',
  ),
}
export default meta
type Story = StoryObj

export const AutoGrow: Story = {
  name: 'AutoGrow + blank reclaim',
  ...docsStory(src, 'Scroll with wheel near content at the bottom edge to grow. Dragging the scrollbar does not grow.'),
  render: () => {
    const wrapper = document.createElement('div')
    Object.assign(wrapper.style, {
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      width: '100%',
    })
    const status = document.createElement('div')
    status.textContent = 'Excel Workspace: A-Z x 1000'
    Object.assign(status.style, {
      padding: '6px 10px',
      font: '12px monospace',
      borderBottom: '1px solid #ddd',
    })
    const gridContainer = document.createElement('div')
    gridContainer.setAttribute('data-novasheet-story-grid', '')
    Object.assign(gridContainer.style, { flex: '1', minHeight: '0' })
    const data = new SparseExcelDataSource()
    data.updateCell(999, 'A', 'edge content')
    const grid = createGridHost({
      data,
      excelHeaders: true,
      excelWorkspace: true,
    }, '100%', '100%')
    gridContainer.appendChild(grid)
    wrapper.appendChild(status)
    wrapper.appendChild(gridContainer)
    return wrapper
  },
}
```

Create `apps/storybook/src/stories/snippets/excel-workspace.autogrow.snippet.ts`:

```ts
import { SparseExcelDataSource } from '@novasheet/core'
import { createGridHost } from '../grid-host'

const data = new SparseExcelDataSource()
data.updateCell(999, 'A', 'edge content')

export const host = createGridHost({
  data,
  excelHeaders: true,
  excelWorkspace: true,
})
```

- [ ] **Step 4: Run story test and typecheck**

Run:

```bash
bun test apps/storybook/src/stories/ExcelWorkspace.stories.test.ts
bun run --filter @novasheet/storybook typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/storybook/src/stories/ExcelWorkspace.stories.ts apps/storybook/src/stories/ExcelWorkspace.stories.test.ts apps/storybook/src/stories/snippets/excel-workspace.autogrow.snippet.ts
git commit -m "feat(storybook): 新增 Excel workspace 自动扩容演示"
```

---

## Task 7: Final Verification

**Files:**
- No implementation files unless previous tasks reveal small fixes.

- [ ] **Step 1: Run lint**

Run:

```bash
bun run lint
```

Expected: 0 errors / 0 warnings.

- [ ] **Step 2: Run full typecheck**

Run:

```bash
bun run --filter '*' typecheck
```

Expected: all packages exit 0.

- [ ] **Step 3: Run full tests**

Run:

```bash
bun test
```

Expected: all tests pass.

- [ ] **Step 4: Run build chain in dependency order**

Run:

```bash
bun run --filter @novasheet/core build
bun run --filter @novasheet/canvas2d build
bun run --filter @novasheet/react build
STORYBOOK_BASE_PATH=/NovaSheet/ bun run build-storybook
```

Expected: all commands exit 0. Storybook may print the existing Vite chunk-size warning.

- [ ] **Step 5: Commit verification-only fixes if needed**

If any verification command required small follow-up fixes:

```bash
git add <changed-files>
git commit -m "fix(core): 修正 Excel workspace 验证问题"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review

| Check | Result |
| --- | --- |
| Requirement: default A-Z x 1000 | Covered by Task 1 policy and Task 2 data source tests. |
| Requirement: wheel scroll grows at edge | Covered by Task 1 rules, Task 3 controller, Task 4 integration. |
| Requirement: scrollbar drag does not grow | Covered by Task 1 `scrollbar` intent test and Task 4 wheel hook design. |
| Requirement: blank extra cells are reclaimed | Covered by Task 1 shrink rule and Task 5 integration. |
| Requirement: do not drop real content | Covered by Task 2 shrink rejection and Task 5 content preservation. |
| Architecture boundary | Pure domain in `features/excel-workspace`; DOM intent in `NativeScroller`/`GridRuntime`; sparse data in `kernel/data`. |
| Placeholder scan | No placeholder text remains. |
| Type consistency | `ExcelWorkspaceSize`, `ExcelWorkspacePolicy`, `ExcelWorkspaceController`, and `SparseExcelDataSource` signatures are used consistently. |
