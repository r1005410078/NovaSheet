# NovaSheet Cell Extension API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first public extension surface for custom `FieldType`, Canvas2D cell rendering, core DOM cell editors, and React editor/filter-editor adapters.

**Architecture:** Core owns backend-neutral data semantics and DOM overlay editor lifecycle. Canvas2D owns canvas-only cell rendering through backend options. React never participates in canvas cell drawing; it only adapts React components into core editor/filter-editor overlays.

**Tech Stack:** TypeScript, `bun:test`, core `Grid`/`DefaultGridEngine`/`GridRuntime`, Canvas2D `CellPainter`, React 18 `createRoot`.

---

## Inputs

- Spec: `docs/superpowers/specs/2026-06-12-novasheet-cell-extension-api-design.md`
- BDD scenarios:
  - `packages/core/tests/acceptance/contract/plugin-api/scenarios/L0-cell-extension-custom-type-fallback.md`
  - `packages/core/tests/acceptance/contract/plugin-api/scenarios/L0-cell-extension-type-definition-contract.md`
  - `packages/core/tests/acceptance/e2e/grid/scenarios/L2-grid-custom-editor-open-triggers.md`
  - `packages/core/tests/acceptance/e2e/grid/scenarios/L2-grid-cell-action-opens-editor.md`
  - `packages/react/tests/excel/scenarios/L3c-custom-react-editor-commit-cancel.md`
  - `packages/react/tests/excel/scenarios/L3c-custom-react-filter-editor-apply-cancel.md`

## File Structure

| Area | Files | Responsibility |
| --- | --- | --- |
| Core schema | `packages/core/src/kernel/data/Schema.ts` | Widen `FieldType`; keep `CellValue` limited to current supported serializable values. |
| Core type semantics | `packages/core/src/features/cell-types/CellTypes.ts`, `packages/core/src/features/cell-types/index.ts` | `CellTypeDefinition`, built-ins, registry helpers, edit/clipboard/sort/filter semantics. |
| Core options | `packages/core/src/engine/GridEngine.ts`, `packages/core/src/Grid.ts`, `packages/core/src/index.ts` | Accept `cellTypes`, `cellEditors`, `cellFilterEditors`; pass them to engine/runtime. |
| Core editing | `packages/core/src/features/edit/CellEdit.ts`, `packages/core/src/features/edit/EditController.ts`, `packages/core/src/dom/runtime/GridRuntime.ts`, `packages/core/src/dom/interaction/DomCellEditor.ts` | Use registry for inline edit; add unified `openCellEditor(ctx)` for built-in/custom editors. |
| Core action hit zones | `packages/core/src/kernel/render/RenderTypes.ts`, `packages/core/src/kernel/interaction/HitTest.ts`, `packages/core/src/dom/runtime/GridRuntime.ts` | Carry renderer-declared action zones and route clicks to `onAction` then editor fallback. |
| Canvas2D backend | `packages/canvas2d/src/backend/canvas2dBackend.ts`, `packages/canvas2d/src/painters/CellPainter.ts`, `packages/canvas2d/src/render/Canvas2DRenderer.ts`, `packages/canvas2d/src/index.ts` | Change `canvas2dBackend()` builder shape; support backend-specific `cellRenderers`. |
| React adapters | `packages/react/src/editors/createReactCellEditor.tsx`, `packages/react/src/editors/createReactCellFilterEditor.tsx`, `packages/react/src/index.ts` | Wrap React components into core overlay editor contracts only. No React cell renderer export. |
| Storybook examples | `apps/storybook/src/stories/FieldTypes.stories.ts` | Add rating/assignee examples showing Canvas2D renderer + React editor/filter editor. |

## API Names To Keep Stable

```ts
// core
export type BuiltInFieldType =
  | 'text'
  | 'number'
  | 'singleSelect'
  | 'multiSelect'
  | 'date'
  | 'checkbox'
  | 'url'

export type FieldType = BuiltInFieldType | (string & {})

export interface CellTypeDefinition {
  readonly editable?: boolean
  formatForEdit?(value: CellValue | undefined, ctx: CellTypeContext): string
  parseEditInput?(input: string, ctx: CellTypeContext): CellParseResult
  serializeClipboard?(value: CellValue | undefined, ctx: CellTypeContext): string
  parseClipboard?(text: string, ctx: CellTypeContext): CellParseResult
  sortValue?(value: CellValue | undefined, ctx: CellTypeContext): string | number | boolean | Date | null
  isEmpty?(value: CellValue | undefined, ctx: CellTypeContext): boolean
  readonly filterOperators?: readonly CellFilterOperator[]
  onAction?(ctx: CellActionContext): void
}

export interface CellEditor {
  open(ctx: CellEditorOpenContext): void
  close?(): void
  destroy?(): void
}

export interface CellFilterEditor {
  open(ctx: CellFilterEditorOpenContext): void
  close?(): void
  destroy?(): void
}
```

```ts
// canvas2d
export interface Canvas2DCellRenderer {
  paint(ctx: CanvasRenderingContext2D, params: Canvas2DCellRenderParams): void
  getActionZones?(params: Canvas2DCellRenderParams): readonly CellActionZone[]
}

export function canvas2dBackend(options?: Canvas2DBackendOptions): RenderBackendFactory
```

```ts
// react
export function createReactCellEditor<TProps>(
  Component: React.ComponentType<TProps & ReactCellEditorProps>,
  options?: { readonly kind?: 'inline' | 'popover' | 'modal' },
): CellEditor

export function createReactCellFilterEditor<TProps>(
  Component: React.ComponentType<TProps & ReactCellFilterEditorProps>,
): CellFilterEditor
```

## Plan Risks

| Risk | Mitigation |
| --- | --- |
| `canvas2dBackend` currently is passed directly as `backend: canvas2dBackend`. | Do a mechanical migration to `backend: canvas2dBackend()` in one commit before adding renderer options. |
| Editor lifecycle can double-open built-in and custom editors. | Introduce one runtime method `openCellEditor(ctx)` and make all triggers call it. |
| React renderer temptation reappears. | React package exports only editor/filter-editor adapters; tests assert no React cell renderer helper exists. |
| Filter predicate and filter UI become coupled. | Keep predicate in `CellTypeDefinition.filterOperators`; `CellFilterEditor` only returns filter spec/operator value. |

---

## Task 1: Core Cell Type Registry

**Files:**
- Modify: `packages/core/src/kernel/data/Schema.ts`
- Create: `packages/core/src/features/cell-types/CellTypes.ts`
- Create: `packages/core/src/features/cell-types/index.ts`
- Modify: `packages/core/src/features/edit/CellEdit.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/tests/features/cell-types/CellTypes.test.ts`
- Test: `packages/core/tests/engine/DefaultGridEngine.test.ts`

- [ ] **Step 1: Write failing registry tests**

Add `packages/core/tests/features/cell-types/CellTypes.test.ts`:

```ts
import { describe, expect, it } from 'bun:test'
import type { Field } from '../../../src'
import {
  SKIP_CELL_VALUE,
  formatCellForEditWithTypes,
  getCellTypeDefinition,
  parseCellEditInputWithTypes,
} from '../../../src/features/cell-types'

const ratingField: Field = {
  id: 'score',
  name: 'Score',
  type: 'rating',
  width: 120,
  options: { max: 5 },
}

describe('core.L0.cell-extension-type-definition-contract', () => {
  it('custom cell type drives edit parse and sort semantics', () => {
    const cellTypes = {
      rating: {
        formatForEdit: (value) => String(value ?? ''),
        parseEditInput: (input, ctx) => {
          const n = Number(input)
          if (Number.isNaN(n)) return SKIP_CELL_VALUE
          const max = Number(ctx.field.options?.max ?? 5)
          return Math.max(0, Math.min(max, n))
        },
        sortValue: (value) => (typeof value === 'number' ? value : null),
        filterOperators: [
          {
            id: 'gte',
            label: '>=',
            matches: (value, operand) =>
              typeof value === 'number' && typeof operand === 'number' && value >= operand,
          },
        ],
      },
    }

    const definition = getCellTypeDefinition('rating', cellTypes)
    expect(definition).toBe(cellTypes.rating)
    expect(formatCellForEditWithTypes(4, ratingField, cellTypes)).toBe('4')
    expect(parseCellEditInputWithTypes('9', ratingField, cellTypes)).toBe(5)
    expect(parseCellEditInputWithTypes('bad', ratingField, cellTypes)).toBe(SKIP_CELL_VALUE)
    expect(definition?.sortValue?.(4, { field: ratingField, locale: 'en-US' })).toBe(4)
    expect(definition?.filterOperators?.[0]?.matches(4, 3, { field: ratingField, locale: 'en-US' })).toBe(true)
  })

  it('unregistered custom type falls back to text display and is not editable', () => {
    expect(getCellTypeDefinition('rating', {})).toBeUndefined()
    expect(formatCellForEditWithTypes(4, ratingField, {})).toBe('4')
    expect(parseCellEditInputWithTypes('5', ratingField, {})).toBe(SKIP_CELL_VALUE)
  })
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test packages/core/tests/features/cell-types/CellTypes.test.ts
```

Expected: FAIL because `features/cell-types` exports do not exist.

- [ ] **Step 3: Implement minimal registry**

Change `packages/core/src/kernel/data/Schema.ts`:

```ts
export type BuiltInFieldType =
  | 'text'
  | 'number'
  | 'singleSelect'
  | 'multiSelect'
  | 'date'
  | 'checkbox'
  | 'url'

export type FieldType = BuiltInFieldType | (string & {})
```

Create `packages/core/src/features/cell-types/CellTypes.ts`:

```ts
import type { CellValue, Field, FieldType } from '../../kernel/data/Schema'

export const SKIP_CELL_VALUE = Symbol('novasheet.skip-cell-value')
export type CellParseResult = CellValue | null | typeof SKIP_CELL_VALUE

export interface CellTypeContext {
  readonly field: Field
  readonly locale: string
}

export interface CellFilterOperator {
  readonly id: string
  readonly label: string
  matches(value: CellValue | undefined, operand: CellValue | undefined, ctx: CellTypeContext): boolean
}

export interface CellActionContext extends CellTypeContext {
  readonly rowIndex: number
  readonly colIndex: number
  readonly actionId: string
  preventOpenEditor(): void
  commit(value: CellValue | null): void
}

export interface CellTypeDefinition {
  readonly editable?: boolean
  formatForEdit?(value: CellValue | undefined, ctx: CellTypeContext): string
  parseEditInput?(input: string, ctx: CellTypeContext): CellParseResult
  serializeClipboard?(value: CellValue | undefined, ctx: CellTypeContext): string
  parseClipboard?(text: string, ctx: CellTypeContext): CellParseResult
  sortValue?(value: CellValue | undefined, ctx: CellTypeContext): string | number | boolean | Date | null
  isEmpty?(value: CellValue | undefined, ctx: CellTypeContext): boolean
  readonly filterOperators?: readonly CellFilterOperator[]
  onAction?(ctx: CellActionContext): void
}

export type CellTypeRegistry = Readonly<Record<string, CellTypeDefinition>>

const builtInCellTypes: CellTypeRegistry = {
  text: {
    editable: true,
    formatForEdit: (value) => (value === null || value === undefined ? '' : String(value)),
    parseEditInput: (input) => (input.trim() === '' ? null : input),
  },
  number: {
    editable: true,
    formatForEdit: (value) => (typeof value === 'number' ? String(value) : ''),
    parseEditInput: (input) => {
      const trimmed = input.trim()
      if (trimmed === '') return null
      const n = Number(trimmed)
      return Number.isNaN(n) ? SKIP_CELL_VALUE : n
    },
  },
}

export function getCellTypeDefinition(
  type: FieldType,
  overrides: CellTypeRegistry = {},
): CellTypeDefinition | undefined {
  return overrides[type] ?? builtInCellTypes[type]
}

export function isEditableFieldTypeWithTypes(field: Field, registry: CellTypeRegistry = {}): boolean {
  return getCellTypeDefinition(field.type, registry)?.editable === true
}

export function formatCellForEditWithTypes(
  value: CellValue | undefined,
  field: Field,
  registry: CellTypeRegistry = {},
  locale = 'en-US',
): string {
  const ctx = { field, locale }
  return getCellTypeDefinition(field.type, registry)?.formatForEdit?.(value, ctx) ?? fallbackDisplay(value)
}

export function parseCellEditInputWithTypes(
  input: string,
  field: Field,
  registry: CellTypeRegistry = {},
  locale = 'en-US',
): CellParseResult {
  const definition = getCellTypeDefinition(field.type, registry)
  if (!definition?.editable || !definition.parseEditInput) return SKIP_CELL_VALUE
  return definition.parseEditInput(input, { field, locale })
}

function fallbackDisplay(value: CellValue | undefined): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}
```

Create `packages/core/src/features/cell-types/index.ts`:

```ts
export {
  SKIP_CELL_VALUE,
  formatCellForEditWithTypes,
  getCellTypeDefinition,
  isEditableFieldTypeWithTypes,
  parseCellEditInputWithTypes,
} from './CellTypes'
export type {
  CellActionContext,
  CellFilterOperator,
  CellParseResult,
  CellTypeContext,
  CellTypeDefinition,
  CellTypeRegistry,
} from './CellTypes'
```

Update `packages/core/src/features/edit/CellEdit.ts` to delegate old helpers through the new built-ins:

```ts
import type { CellValue, Field, FieldType } from '../../kernel/data/Schema'
import { SKIP_CELL_VALUE, formatCellForEditWithTypes, parseCellEditInputWithTypes } from '../cell-types'

export function isEditableFieldType(type: FieldType): boolean {
  return type === 'text' || type === 'number'
}

export function formatCellForEdit(value: CellValue | undefined, type: FieldType): string {
  return formatCellForEditWithTypes(value, { id: '', name: '', type, width: 0 })
}

export function parseCellEditInput(text: string, type: FieldType): CellValue | null | undefined {
  const parsed = parseCellEditInputWithTypes(text, { id: '', name: '', type, width: 0 })
  return parsed === SKIP_CELL_VALUE ? undefined : parsed
}

export { formatCellForEditWithTypes, parseCellEditInputWithTypes }
export type { Field }
```

Export from `packages/core/src/index.ts`:

```ts
export {
  SKIP_CELL_VALUE,
  formatCellForEditWithTypes,
  getCellTypeDefinition,
  isEditableFieldTypeWithTypes,
  parseCellEditInputWithTypes,
} from './features/cell-types'
export type {
  CellActionContext,
  CellFilterOperator,
  CellTypeContext,
  CellTypeDefinition,
  CellTypeRegistry,
} from './features/cell-types'
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test packages/core/tests/features/cell-types/CellTypes.test.ts
bun test packages/core/tests/engine/DefaultGridEngine.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/kernel/data/Schema.ts packages/core/src/features/cell-types packages/core/src/features/edit/CellEdit.ts packages/core/src/index.ts packages/core/tests/features/cell-types/CellTypes.test.ts packages/core/tests/engine/DefaultGridEngine.test.ts
git commit -m "feat(core): 新增单元格类型语义注册表"
```

---

## Task 2: Engine Uses Custom Cell Types For Inline Editing

**Files:**
- Modify: `packages/core/src/engine/GridEngine.ts`
- Modify: `packages/core/src/engine/DefaultGridEngine.ts`
- Modify: `packages/core/src/features/edit/EditController.ts`
- Modify: `packages/core/src/Grid.ts`
- Test: `packages/core/tests/engine/DefaultGridEngine.test.ts`

- [ ] **Step 1: Write failing engine tests**

Add to `packages/core/tests/engine/DefaultGridEngine.test.ts`:

```ts
it('core.L0.cell-extension-custom-type-fallback refuses editing for unregistered custom type', () => {
  const schema: Schema = {
    fields: [{ id: 'score', name: 'Score', type: 'rating', width: 120 }],
  }
  const data = new InMemoryDataSource({ schema, rows: [{ score: 4 }] })
  const engine = new DefaultGridEngine({ data })

  expect(engine.beginCellEdit({ rowIndex: 0, colIndex: 0 })).toBe(false)
  expect(data.getCell(0, 'score')).toBe(4)
})

it('core.L0.cell-extension-type-definition-contract uses custom parseEditInput', () => {
  const schema: Schema = {
    fields: [{ id: 'score', name: 'Score', type: 'rating', width: 120, options: { max: 5 } }],
  }
  const data = new InMemoryDataSource({ schema, rows: [{ score: 4 }] })
  const engine = new DefaultGridEngine({
    data,
    cellTypes: {
      rating: {
        editable: true,
        formatForEdit: (value) => String(value ?? ''),
        parseEditInput: (input, ctx) => {
          const n = Number(input)
          if (Number.isNaN(n)) return SKIP_CELL_VALUE
          return Math.min(Number(ctx.field.options?.max ?? 5), n)
        },
      },
    },
  })

  expect(engine.beginCellEdit({ rowIndex: 0, colIndex: 0 })).toBe(true)
  engine.updateCellEditDraft('8')
  expect(engine.commitCellEdit()).toBe(true)
  expect(data.getCell(0, 'score')).toBe(5)
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test packages/core/tests/engine/DefaultGridEngine.test.ts --test-name-pattern "cell-extension"
```

Expected: FAIL because `GridEngineOptions.cellTypes` is not accepted/used.

- [ ] **Step 3: Implement options plumbing**

Add to `GridEngineOptions` in `packages/core/src/engine/GridEngine.ts`:

```ts
import type { CellTypeRegistry } from '../features/cell-types'

export interface GridEngineOptions {
  // existing fields...
  cellTypes?: CellTypeRegistry
}
```

In `packages/core/src/Grid.ts`, include `cellTypes` in `engineOptions`:

```ts
const engineOptions: GridEngineOptions = {
  data: options.data,
  theme: options.theme,
  frozen: options.frozen,
  defaultRowHeight: options.defaultRowHeight,
  excelHeaders: options.excelHeaders,
  formatters: options.formatters,
  locale: options.locale,
  cellTypes: options.cellTypes,
}
```

In `DefaultGridEngine`, pass `options.cellTypes` and `options.locale` into `EditController`:

```ts
private readonly cellTypes: CellTypeRegistry
private readonly locale: string

constructor(options: GridEngineOptions) {
  this.cellTypes = options.cellTypes ?? {}
  this.locale = options.locale ?? 'en-US'
  this.editController = new EditController(new CellEditModel(), {
    // existing ctx methods...
    getCellTypes: () => this.cellTypes,
    getLocale: () => this.locale,
  })
}
```

Extend `EditControllerContext` and use field-aware helpers:

```ts
export interface EditControllerContext {
  getData(): DataSource
  getCellTypes(): CellTypeRegistry
  getLocale(): string
  resolveEditCell(cell: CellAddress): CellAddress
  viewRowToRaw(viewRow: number): number
  pushUndo(command: UndoCommand): void
}

beginCellEdit(cell: CellAddress): boolean {
  const editCell = this.ctx.resolveEditCell(cell)
  const field = this.fieldAt(editCell.colIndex)
  if (!field || !isEditableFieldTypeWithTypes(field, this.ctx.getCellTypes())) return false
  const data = this.mutableData()
  if (!data) return false
  const value = data.getCell(editCell.rowIndex, field.id)
  this.model.begin(
    editCell,
    field.id,
    field.type,
    formatCellForEditWithTypes(value, field, this.ctx.getCellTypes(), this.ctx.getLocale()),
  )
  return true
}

commit(): boolean {
  const session = this.model.getSession()
  if (!session) return false
  const data = this.mutableData()
  if (!data) return false
  const field = data.getSchema().fields.find((item) => item.id === session.fieldId)
  if (!field) return false
  const parsed = parseCellEditInputWithTypes(
    session.draft,
    field,
    this.ctx.getCellTypes(),
    this.ctx.getLocale(),
  )
  if (parsed === SKIP_CELL_VALUE) return false
  // keep existing write + undo block
}
```

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test packages/core/tests/engine/DefaultGridEngine.test.ts --test-name-pattern "cell-extension|Phase 3.5"
bun run --filter @novasheet/core typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/engine/GridEngine.ts packages/core/src/engine/DefaultGridEngine.ts packages/core/src/features/edit/EditController.ts packages/core/src/Grid.ts packages/core/tests/engine/DefaultGridEngine.test.ts
git commit -m "feat(core): 让编辑流程使用自定义单元格类型语义"
```

---

## Task 3: Migrate Canvas2D Backend To Builder API

**Files:**
- Modify: `packages/canvas2d/src/backend/canvas2dBackend.ts`
- Modify all `backend: canvas2dBackend` call sites to `backend: canvas2dBackend()`
- Modify: `packages/react/src/features/grid/useNovaSheetGrid.ts`
- Test: `packages/canvas2d/tests/grid/Grid.test.ts`
- Test: `packages/react/tests/excel/NovaExcel.test.ts`

- [ ] **Step 1: Write failing API test**

Add to `packages/canvas2d/tests/grid/Grid.test.ts`:

```ts
it('canvas2dBackend() returns a RenderBackendFactory', () => {
  const backend = canvas2dBackend()
  expect(typeof backend).toBe('function')
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test packages/canvas2d/tests/grid/Grid.test.ts --test-name-pattern "canvas2dBackend"
```

Expected: FAIL because current `canvas2dBackend` expects backend deps directly.

- [ ] **Step 3: Implement builder shape**

Change `packages/canvas2d/src/backend/canvas2dBackend.ts`:

```ts
export interface Canvas2DBackendOptions {
  readonly cellRenderers?: Canvas2DCellRendererRegistry
}

export function canvas2dBackend(options: Canvas2DBackendOptions = {}): RenderBackendFactory {
  return ({ container, engine, scheduler }: RenderBackendDeps): RenderBackendHandle => {
    // existing body; capture options for Task 4
    void options
  }
}
```

Mechanically replace:

```ts
backend: canvas2dBackend
```

with:

```ts
backend: canvas2dBackend()
```

Do this in tests, Storybook snippets, `apps/storybook/src/grid-host.ts`, and `packages/react/src/features/grid/useNovaSheetGrid.ts`.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test packages/canvas2d/tests/grid/Grid.test.ts --test-name-pattern "canvas2dBackend"
bun test packages/react/tests/excel/NovaExcel.test.ts --test-name-pattern "excel.L3a.default-mount"
bun run --filter '*' typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas2d packages/react/src/features/grid/useNovaSheetGrid.ts apps/storybook packages/react/tests packages/canvas2d/tests
git commit -m "refactor(canvas2d): 后端工厂改为可配置 builder"
```

---

## Task 4: Canvas2D Custom Cell Renderers

**Files:**
- Modify: `packages/canvas2d/src/painters/CellPainter.ts`
- Modify: `packages/canvas2d/src/render/Canvas2DRenderer.ts`
- Modify: `packages/canvas2d/src/backend/canvas2dBackend.ts`
- Modify: `packages/canvas2d/src/index.ts`
- Test: `packages/canvas2d/tests/painters/CellPainter.test.ts`

- [ ] **Step 1: Write failing renderer test**

Add to `CellPainter.test.ts`:

```ts
it('custom renderer wins over fallback text rendering', () => {
  const { ctx, ops } = createRecordingContext()
  const painter = new CellPainter(denseGridTheme, {
    cellRenderers: {
      rating: {
        paint: (paintCtx, params) => {
          paintCtx.fillText(`rating:${String(params.value)}`, params.rect.x, params.rect.y)
        },
      },
    },
  })

  painter.paint(ctx, {
    value: 4,
    rect: { x: 10, y: 20, width: 100, height: 28 },
    field: makeField({ type: 'rating' }),
  })

  const fillTextOp = ops.find((op) => op.op === 'fillText')
  expect(fillTextOp).toEqual({ op: 'fillText', args: ['rating:4', 10, 20] })
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test packages/canvas2d/tests/painters/CellPainter.test.ts --test-name-pattern "custom renderer"
```

Expected: FAIL because `cellRenderers` option does not exist.

- [ ] **Step 3: Implement Canvas2D renderer registry**

Add types to `CellPainter.ts`:

```ts
export interface Canvas2DCellRenderParams extends CellPaintParams {
  readonly theme: Theme
}

export interface Canvas2DCellRenderer {
  paint(ctx: CanvasRenderingContext2D, params: Canvas2DCellRenderParams): void
  getActionZones?(params: Canvas2DCellRenderParams): readonly CellActionZone[]
}

export type Canvas2DCellRendererRegistry = Readonly<Record<string, Canvas2DCellRenderer>>

export interface CellPainterOptions {
  measurer?: TextMeasurer
  cellRenderers?: Canvas2DCellRendererRegistry
}
```

In `CellPainter.paint`, before built-in branches:

```ts
const custom = this.cellRenderers[field.type]
if (custom) {
  custom.paint(ctx, { ...params, theme: this.theme })
  ctx.restore()
  return
}
```

Thread the registry through `Canvas2DRendererOptions`, constructor, and `canvas2dBackend({ cellRenderers })`:

```ts
new Canvas2DRenderer({
  // existing
  cellRenderers: options.cellRenderers,
})
```

Export the types from `packages/canvas2d/src/index.ts`.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test packages/canvas2d/tests/painters/CellPainter.test.ts --test-name-pattern "custom renderer|非 text/number"
bun run --filter @novasheet/canvas2d typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/canvas2d/src packages/canvas2d/tests/painters/CellPainter.test.ts
git commit -m "feat(canvas2d): 支持自定义单元格 renderer"
```

---

## Task 5: Core Custom Cell Editor Contract And Unified Triggers

**Files:**
- Create: `packages/core/src/dom/interaction/CellEditorContract.ts`
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts`
- Modify: `packages/core/src/dom/runtime/GridControllerImpl.ts`
- Modify: `packages/core/src/Grid.ts`
- Modify: `packages/core/src/dom/runtime/GridController.ts`
- Test: `packages/core/tests/dom/runtime/GridRuntime.test.ts`

- [ ] **Step 1: Write failing trigger test**

Add to `GridRuntime.test.ts`:

```ts
it('core.L2.grid-custom-editor-open-triggers routes typing through custom editor context', () => {
  const engine = makeEngine()
  engine.getSelection = mock(() => ({
    activeCell: { rowIndex: 1, colIndex: 0 },
    anchorCell: { rowIndex: 1, colIndex: 0 },
    extentCell: { rowIndex: 1, colIndex: 0 },
    selectedRange: { startRow: 1, endRow: 1, startCol: 0, endCol: 0 },
  }))
  engine.getFrame = mock(() => makeFrameWithFields([{ id: 'owner', name: 'Owner', type: 'assignee', width: 160 }]))
  const editor = { open: mock(() => {}) }
  const runtime = new GridRuntime({
    engine,
    host: makeHost(),
    renderer: makeRenderer(),
    cellEditors: { assignee: editor },
  })

  expect(runtime.handleHostKeyDown({ key: 'B', shiftKey: false, ctrlKey: false, metaKey: false, altKey: false })).toBe(true)

  expect(editor.open).toHaveBeenCalledTimes(1)
  expect(editor.open.mock.calls[0]?.[0]).toMatchObject({
    cell: { rowIndex: 1, colIndex: 0 },
    field: { id: 'owner', type: 'assignee' },
    trigger: 'typing',
    initialInput: 'B',
  })
})
```

Use an existing test helper pattern for `makeFrameWithFields`; if none exists, define it locally in the test file.

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test packages/core/tests/dom/runtime/GridRuntime.test.ts --test-name-pattern "custom-editor-open-triggers"
```

Expected: FAIL because `GridRuntime` does not accept `cellEditors`.

- [ ] **Step 3: Implement editor contract**

Create `CellEditorContract.ts`:

```ts
import type { CellValue, Field } from '../../kernel/data/Schema'
import type { CellAddress } from '../../kernel/coords/SelectionTypes'
import type { CellRect } from '../../kernel/interaction/CellLayout'

export type CellEditorTrigger = 'double-click' | 'enter' | 'f2' | 'typing' | 'api' | 'cell-action'

export interface CellEditorOpenContext {
  readonly cell: CellAddress
  readonly field: Field
  readonly value: CellValue | undefined
  readonly rect: CellRect
  readonly trigger: CellEditorTrigger
  readonly initialInput?: string
  readonly actionId?: string
  commit(value: CellValue | null): void
  cancel(): void
}

export interface CellEditor {
  open(ctx: CellEditorOpenContext): void
  close?(): void
  destroy?(): void
}

export type CellEditorRegistry = Readonly<Record<string, CellEditor>>
```

Add `cellEditors?: CellEditorRegistry` to `GridOptions` and `GridRuntime` constructor options. Implement one private runtime method:

```ts
private openCellEditor(args: {
  readonly cell: CellAddress
  readonly trigger: CellEditorTrigger
  readonly initialInput?: string
  readonly actionId?: string
}): boolean {
  const frame = this.engine.getFrame()
  const field = frame.data.getSchema().fields[args.cell.colIndex]
  if (!field) return false
  const custom = this.cellEditors[field.type]
  if (custom) {
    const rect = this.computeCellRect(args.cell, frame)
    if (!rect) return false
    custom.open({
      cell: args.cell,
      field,
      value: frame.data.getCell(args.cell.rowIndex, field.id),
      rect,
      trigger: args.trigger,
      initialInput: args.initialInput,
      actionId: args.actionId,
      commit: (value) => this.commitEditorValue(args.cell, field.id, value),
      cancel: () => custom.close?.(),
    })
    return true
  }
  return this.openBuiltInDomEditor(args)
}
```

Move existing double-click and typing built-in editor logic into `openBuiltInDomEditor`. Add public facade method in `Grid`/`GridController`:

```ts
openCellEditor(rowIndex: number, fieldId: string): boolean
```

Its trigger must be `'api'`.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test packages/core/tests/dom/runtime/GridRuntime.test.ts --test-name-pattern "custom-editor-open-triggers|选中后直接键入|合并单元格进入编辑"
bun run --filter @novasheet/core typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/dom packages/core/src/Grid.ts packages/core/tests/dom/runtime/GridRuntime.test.ts
git commit -m "feat(core): 统一自定义单元格编辑器触发入口"
```

---

## Task 6: Cell Action Contract

**Files:**
- Modify: `packages/core/src/features/cell-types/CellTypes.ts`
- Modify: `packages/core/src/dom/runtime/GridRuntime.ts`
- Modify: `packages/canvas2d/src/painters/CellPainter.ts`
- Test: `packages/core/tests/dom/runtime/GridRuntime.test.ts`

- [ ] **Step 1: Write failing action test**

Add:

```ts
it('core.L2.grid-cell-action-opens-editor calls onAction before editor fallback', () => {
  const onAction = mock((ctx) => {
    expect(ctx.trigger).toBe('cell-action')
    expect(ctx.actionId).toBe('change-assignee')
  })
  const editor = { open: mock(() => {}) }
  const runtime = makeRuntimeWithCellExtension({
    field: { id: 'owner', name: 'Owner', type: 'assignee', width: 160 },
    cellTypes: { assignee: { onAction } },
    cellEditors: { assignee: editor },
    actionHit: { rowIndex: 0, colIndex: 0, actionId: 'change-assignee' },
  })

  runtime.handleHostPointerDown(makePointerEventAtAction())

  expect(onAction).toHaveBeenCalledTimes(1)
  expect(editor.open).toHaveBeenCalledTimes(1)
  expect(editor.open.mock.calls[0]?.[0]).toMatchObject({
    trigger: 'cell-action',
    actionId: 'change-assignee',
  })
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test packages/core/tests/dom/runtime/GridRuntime.test.ts --test-name-pattern "cell-action"
```

Expected: FAIL because action zones do not exist.

- [ ] **Step 3: Implement action routing minimally**

Define in core:

```ts
export interface CellActionZone {
  readonly id: string
  readonly rect: CellRect
}
```

For v1, store action zones on runtime during render only if available from backend is too large. If direct renderer-to-runtime channel is not available yet, implement a backend-neutral API on `RenderBackend`:

```ts
getCellActionAt?(x: number, y: number): { readonly rowIndex: number; readonly colIndex: number; readonly actionId: string } | null
```

Canvas2DRenderer can populate a `Map<string, CellActionZone[]>` while painting cells. Runtime checks `renderer.getCellActionAt?.(event.x, event.y)` before ordinary cell selection.

Route:

```ts
const action = this.renderer.getCellActionAt?.(event.x, event.y)
if (action) {
  this.invokeCellAction(action)
  return
}
```

`invokeCellAction` calls `cellTypes[field.type]?.onAction(ctx)` first. If `preventOpenEditor()` was not called, call `openCellEditor({ cell, trigger: 'cell-action', actionId })`.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test packages/core/tests/dom/runtime/GridRuntime.test.ts --test-name-pattern "cell-action"
bun run --filter @novasheet/core typecheck
bun run --filter @novasheet/canvas2d typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src packages/canvas2d/src packages/core/tests/dom/runtime/GridRuntime.test.ts
git commit -m "feat(core): 支持单元格 action 触发编辑器"
```

---

## Task 7: React Cell Editor Adapter

**Files:**
- Create: `packages/react/src/editors/createReactCellEditor.tsx`
- Create: `packages/react/src/editors/index.ts`
- Modify: `packages/react/src/index.ts`
- Test: `packages/react/tests/excel/NovaExcel.test.ts`

- [ ] **Step 1: Write failing React editor test**

Add to `NovaExcel.test.ts`:

```tsx
it('excel.L3c.custom-react-editor-commit-cancel commits and unmounts overlay', async () => {
  const ref = React.createRef<NovaExcelRef>()
  function AssigneePicker(props: ReactCellEditorProps) {
    return (
      <div data-testid="assignee-picker">
        <button onClick={() => props.commit('Bob')}>Bob</button>
        <button onClick={() => props.cancel()}>Cancel</button>
      </div>
    )
  }

  const data = createDenseData({
    fields: [{ id: 'owner', name: 'Owner', type: 'assignee', width: 160 }],
    rows: [{ owner: 'Alice' }],
  })
  const { container, unmount } = await mountNovaExcel({
    data,
    ref,
    cellEditors: {
      assignee: createReactCellEditor(AssigneePicker, { kind: 'popover' }),
    },
  })

  act(() => {
    ref.current!.grid.openCellEditor(0, 'owner')
  })
  ;(container.querySelector('button') as HTMLButtonElement).click()

  expect(data.getCell(0, 'owner')).toBe('Bob')
  expect(container.querySelector('[data-testid="assignee-picker"]')).toBeNull()
  unmount()
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test packages/react/tests/excel/NovaExcel.test.ts --test-name-pattern "excel.L3c.custom-react-editor"
```

Expected: FAIL because `createReactCellEditor` is not exported and `Grid.openCellEditor` does not exist until Task 5.

- [ ] **Step 3: Implement adapter**

Create:

```tsx
import { createRoot, type Root } from 'react-dom/client'
import React from 'react'
import type { CellEditor, CellEditorOpenContext, CellValue } from '@novasheet/core'

export interface ReactCellEditorProps extends CellEditorOpenContext {
  commit(value: CellValue | null): void
  cancel(): void
}

export function createReactCellEditor<TProps>(
  Component: React.ComponentType<TProps & ReactCellEditorProps>,
  _options: { readonly kind?: 'inline' | 'popover' | 'modal' } = {},
  componentProps?: TProps,
): CellEditor {
  let host: HTMLDivElement | null = null
  let root: Root | null = null

  const close = () => {
    root?.unmount()
    root = null
    host?.remove()
    host = null
  }

  return {
    open(ctx) {
      close()
      host = document.createElement('div')
      host.setAttribute('data-novasheet-react-cell-editor', '')
      Object.assign(host.style, {
        position: 'absolute',
        left: `${ctx.rect.x}px`,
        top: `${ctx.rect.y + ctx.rect.height}px`,
        zIndex: '20',
      })
      document.body.appendChild(host)
      root = createRoot(host)
      root.render(
        <Component
          {...(componentProps as TProps)}
          {...ctx}
          commit={(value) => {
            ctx.commit(value)
            close()
          }}
          cancel={() => {
            ctx.cancel()
            close()
          }}
        />,
      )
    },
    close,
    destroy: close,
  }
}
```

Export from `packages/react/src/editors/index.ts` and `packages/react/src/index.ts`. Do not export any `createReactCellRenderer`.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test packages/react/tests/excel/NovaExcel.test.ts --test-name-pattern "excel.L3c.custom-react-editor"
bun run --filter @novasheet/react lint:scenario-coverage
bun run --filter @novasheet/react typecheck
```

Expected: React editor scenario coverage missing count drops from 2 to 1.

- [ ] **Step 5: Commit**

```bash
git add packages/react/src packages/react/tests/excel/NovaExcel.test.ts
git commit -m "feat(react): 新增 React 单元格编辑器 adapter"
```

---

## Task 8: React Filter Editor Adapter

**Files:**
- Create: `packages/react/src/editors/createReactCellFilterEditor.tsx`
- Modify: `packages/react/src/editors/index.ts`
- Modify: `packages/react/src/index.ts`
- Modify core filter popover handoff only if required by current `FilterPopover`
- Test: `packages/react/tests/excel/NovaExcel.test.ts`

- [ ] **Step 1: Write failing filter editor test**

Add:

```tsx
it('excel.L3c.custom-react-filter-editor-apply-cancel applies operator value without predicate logic', async () => {
  function AssigneeFilter(props: ReactCellFilterEditorProps) {
    return <button onClick={() => props.apply({ operatorId: 'assignee-is-any-of', value: ['Alice', 'Bob'] })}>Apply</button>
  }

  const filterEditor = createReactCellFilterEditor(AssigneeFilter)
  const apply = mock(() => {})
  filterEditor.open({
    field: { id: 'owner', name: 'Owner', type: 'assignee', width: 160 },
    operatorId: 'assignee-is-any-of',
    value: null,
    rect: { x: 0, y: 0, width: 160, height: 28 },
    apply,
    cancel: mock(() => {}),
  })

  document.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))

  expect(apply).toHaveBeenCalledWith({ operatorId: 'assignee-is-any-of', value: ['Alice', 'Bob'] })
  expect(document.querySelector('[data-novasheet-react-filter-editor]')).toBeNull()
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test packages/react/tests/excel/NovaExcel.test.ts --test-name-pattern "custom-react-filter"
```

Expected: FAIL because adapter does not exist.

- [ ] **Step 3: Implement adapter**

Create:

```tsx
import { createRoot, type Root } from 'react-dom/client'
import React from 'react'
import type { CellValue, Field } from '@novasheet/core'

export interface CellFilterApply {
  readonly operatorId: string
  readonly value: CellValue | readonly CellValue[] | null
}

export interface ReactCellFilterEditorProps {
  readonly field: Field
  readonly operatorId: string
  readonly value: CellFilterApply['value']
  readonly rect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  apply(next: CellFilterApply): void
  cancel(): void
}

export interface CellFilterEditor {
  open(ctx: ReactCellFilterEditorProps): void
  close?(): void
  destroy?(): void
}

export function createReactCellFilterEditor<TProps>(
  Component: React.ComponentType<TProps & ReactCellFilterEditorProps>,
  componentProps?: TProps,
): CellFilterEditor {
  let host: HTMLDivElement | null = null
  let root: Root | null = null
  const close = () => {
    root?.unmount()
    root = null
    host?.remove()
    host = null
  }
  return {
    open(ctx) {
      close()
      host = document.createElement('div')
      host.setAttribute('data-novasheet-react-filter-editor', '')
      document.body.appendChild(host)
      root = createRoot(host)
      root.render(
        <Component
          {...(componentProps as TProps)}
          {...ctx}
          apply={(next) => {
            ctx.apply(next)
            close()
          }}
          cancel={() => {
            ctx.cancel()
            close()
          }}
        />,
      )
    },
    close,
    destroy: close,
  }
}
```

If core needs a shared `CellFilterEditor` type, move the interface to core and import it here.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test packages/react/tests/excel/NovaExcel.test.ts --test-name-pattern "custom-react-filter|custom-react-editor"
bun run --filter @novasheet/react lint:scenario-coverage
bun run --filter @novasheet/react typecheck
```

Expected: PASS; scenario coverage returns 31/31.

- [ ] **Step 5: Commit**

```bash
git add packages/react/src packages/react/tests/excel/NovaExcel.test.ts
git commit -m "feat(react): 新增 React 筛选编辑器 adapter"
```

---

## Task 9: Storybook Field Types Example

**Files:**
- Modify: `apps/storybook/src/stories/FieldTypes.stories.ts`
- Test: `bun run --filter @novasheet/storybook typecheck`

- [ ] **Step 1: Add failing typecheck example first**

Update `FieldTypes.stories.ts` with a `CustomExtensions` story that imports:

```ts
import { canvas2dBackend } from '@novasheet/canvas2d'
import { createReactCellEditor, createReactCellFilterEditor } from '@novasheet/react'
import type { CellTypeDefinition } from '@novasheet/core'
```

Define:

```ts
const ratingType: CellTypeDefinition = {
  editable: true,
  formatForEdit: (value) => String(value ?? ''),
  parseEditInput: (input) => {
    const n = Number(input)
    return Number.isNaN(n) ? SKIP_CELL_VALUE : Math.max(0, Math.min(5, n))
  },
}
```

Use:

```ts
new Grid(el, {
  data,
  cellTypes: { rating: ratingType },
  cellEditors: { rating: createReactCellEditor(RatingEditor) },
  cellFilterEditors: { rating: createReactCellFilterEditor(RatingFilter) },
  backend: canvas2dBackend({
    cellRenderers: { rating: ratingRenderer },
  }),
})
```

- [ ] **Step 2: Verify RED**

Run:

```bash
bun run --filter @novasheet/storybook typecheck
```

Expected before previous tasks: FAIL on missing APIs. At this point in the plan, it should typecheck after implementation.

- [ ] **Step 3: Finish story**

Ensure story demonstrates:

- renderer-only field is display-only if no editor is registered.
- `rating` has Canvas2D rendering and inline editor.
- `assignee` has text+button/action rendering and popover editor.
- Comments explain schema location: schema remains inside `DataSource`.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun run --filter @novasheet/storybook typecheck
bun run --filter @novasheet/storybook build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/storybook/src/stories/FieldTypes.stories.ts
git commit -m "docs(storybook): 增加单元格扩展示例"
```

---

## Task 10: Full Verification

**Files:**
- No production edits unless a gate fails.

- [ ] **Step 1: Run required gates**

```bash
bun run lint
bun run --filter '*' typecheck
bun test
bun run --filter @novasheet/web build
bun run --filter @novasheet/canvas2d build
bun run --filter @novasheet/core build
```

Expected: all PASS, 0 lint warnings.

- [ ] **Step 2: If any gate fails, fix with TDD**

For each failure:

1. Add or narrow a failing test that reproduces the issue.
2. Run the targeted command and confirm RED.
3. Implement the smallest fix.
4. Run targeted command and full affected package command.
5. Commit:

```bash
git commit -m "fix(<scope>): 修正单元格扩展验证失败"
```

- [ ] **Step 3: Final status**

```bash
git status --short --branch
git log --oneline -8
```

Expected: clean worktree, branch ahead by the feature commits.

---

## Self-Review

| Check | Result |
| --- | --- |
| Spec coverage | Covers custom type, fallback, Canvas2D renderer, unified editor triggers, cell action, React editor/filter editor, Storybook example. |
| React renderer ban | Preserved; no task exports or implements React cell rendering. |
| Backend split | Renderer registry is Canvas2D-only under `canvas2dBackend({ cellRenderers })`; future WebGL can define its own registry shape. |
| BDD/TDD order | Scenarios are already committed; every implementation task starts with failing tests. |
| Known gap | Filter operator integration with existing `FilterLayer` may need a small core follow-up inside Task 8 if current popover cannot hand off custom filter editors. STOP+ASK if this requires changing `FilterSpec` shape beyond operator id/value. |
