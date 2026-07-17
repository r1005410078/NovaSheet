# `@zhiguang/novasheet-core`

[中文 README](README.zh-CN.md)

Platform-independent engine for NovaSheet — a Canvas-first spreadsheet/grid for large datasets. `core` owns all state and behavior (data, viewport, selection, editing, formatting, merge, fill, clipboard, undo/redo, validation); it renders nothing itself. A `RenderBackend` is injected at construction time (e.g. [`@zhiguang/novasheet-canvas2d`](../canvas2d)), so `core` has zero Canvas/DOM-renderer dependency and stays usable from a worker or test environment that never paints a pixel.

Every guarantee documented below is backed by a BDD acceptance scenario under [`tests/acceptance/**/scenarios/*.md`](tests/acceptance) — see [Testing](#testing) for how to navigate them.

## Install

```bash
bun add @zhiguang/novasheet-core @zhiguang/novasheet-canvas2d
```

## Quick start

```ts
import { Grid, InMemoryDataSource, denseGridTheme } from '@zhiguang/novasheet-core'
import { canvas2dBackend } from '@zhiguang/novasheet-canvas2d'

const data = new InMemoryDataSource({
  schema: {
    fields: [
      { id: 'name', name: 'Name', type: 'text', width: 160 },
      { id: 'revenue', name: 'Revenue', type: 'number', width: 120 },
      { id: 'joined', name: 'Joined', type: 'date', width: 120 },
    ],
  },
  rows: [
    { name: 'Alice', revenue: 12000, joined: 45123 },
    { name: 'Bob', revenue: 8400, joined: 45200 },
  ],
})

const container = document.getElementById('app')!
const grid = new Grid(container, {
  backend: canvas2dBackend(),
  data,
  theme: denseGridTheme,
  frozen: { topRows: 1, leftCols: 1 },
})

grid.scrollToCell(1, 'revenue')
grid.setColumnWidth('revenue', 140)
```

`Grid.destroy()` is fully idempotent — safe to call from React `StrictMode` mount/unmount/remount cycles.

## Components

| Component                                                                                         | What it is                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Grid` ([`Grid.ts`](src/Grid.ts))                                                                 | Public facade. One instance per mounted container; every method below hangs off it.                                                                                                                                                                                                                                                                                                                                      |
| `DataSource` (`InMemoryDataSource`, `SparseExcelDataSource`, `WindowedDataSource`)                | Row storage. `InMemoryDataSource` holds a plain array (~300k rows × 50 cols); `SparseExcelDataSource` is a sparse, auto-growing Excel-like workspace; `WindowedDataSource` fetches/subscribes a sliding visible-region window against a transport-agnostic `WindowedDataProvider` port (HTTP + WebSocket). All implement the same sync `DataSource` interface — bring your own paginated implementation if you need one. |
| `RenderBackend` / `RenderBackendFactory` ([`ports/RenderBackend.ts`](src/ports/RenderBackend.ts)) | The seam `core` renders through. `@zhiguang/novasheet-canvas2d` is the shipped implementation; anything implementing the port (WebGL, WebGPU, a test stub) can be passed as `GridOptions.backend`.                                                                                                                                                                                                                                |
| `Theme` (`denseGridTheme`)                                                                        | The single source of truth for every color/font/spacing token painters use. Swap with `grid.setTheme(theme)`.                                                                                                                                                                                                                                                                                                            |
| `CellTypeRegistry`                                                                                | Per-`Field.type` business semantics: how a value is edited, parsed, sorted, filtered, and clipboard-serialized. Built-ins cover `text`/`number`/`date`; register your own (e.g. `rating`) for everything else. Column-scoped.                                                                                                                                                                                            |
| `CellTypeStore` (`setCellType`/`clearCellType`/`getCellType`)                                     | Per-_cell_ override of the resolved scalar type (`text`/`number`/`date`/`checkbox`), independent of the column's `Field.type` — "one column, multiple types". Raw-coordinate indexed, undoable, survives structural remap.                                                                                                                                                                                               |
| `ValidatorDefinition`                                                                             | Per-rule validation logic (sync or async), wired to every write path automatically.                                                                                                                                                                                                                                                                                                                                      |
| `CellAttachmentCodec`                                                                             | Opaque, namespaced per-cell payloads (e.g. rich-text runs, comments) that ride along with copy/paste, fill, and undo.                                                                                                                                                                                                                                                                                                    |
| `CellEditorRegistry`                                                                              | DOM/overlay editors keyed by `Field.type`, for input that a single text box can't express (date pickers, dropdowns).                                                                                                                                                                                                                                                                                                     |
| Canvas painter registry (`cellRenderers`)                                                         | **Not part of `core`** — `core` renders nothing, so per-type display painters are registered on the render backend factory instead (e.g. `canvas2dBackend({ cellRenderers })` in `@zhiguang/novasheet-canvas2d`). `core` only guarantees the resolved field/value/attachment data a painter needs reaches it through the frame.                                                                                                   |
| `ViewPipeline` (`SortLayer`, `FilterLayer`, `HideRowsLayer`)                                      | Composable view-coordinate transforms over the raw `DataSource`; `Grid` exposes the composed result, mutations always resolve back to raw coordinates.                                                                                                                                                                                                                                                                   |
| `RangeStyleStore` / `MergeStore`                                                                  | Range-keyed format and merge state, raw-coordinate indexed, survive structural mutation + undo.                                                                                                                                                                                                                                                                                                                          |

## Usage examples

### Selection and navigation

```ts
const cell = { rowIndex: 2, colIndex: 1 }
grid.setSelection({ activeCell: cell, anchorCell: cell, extentCell: cell, selectedRange: null })
const { activeCell, selectedRange } = grid.getSelection()
```

Insert/delete remap the selection automatically — inserting above shifts it down; deleting never leaves it dangling on a removed row.

There is no dedicated whole-row/whole-column selection method — clicking a row/column header does it interactively, and the programmatic equivalent is a `setSelection` call spanning the full axis:

```ts
// Select the whole column at colIndex (what a column-header click does)
const rowCount = data.getRowCount()
grid.setSelection({
  activeCell: { rowIndex: 0, colIndex },
  anchorCell: { rowIndex: 0, colIndex },
  extentCell: { rowIndex: rowCount - 1, colIndex },
  selectedRange: { startRow: 0, endRow: rowCount - 1, startCol: colIndex, endCol: colIndex },
})
```

Set all four fields — `anchorCell`/`extentCell` drive where Shift+arrow extension grows from. A whole-row selection is the transpose (span `0..fields.length - 1` on the column axis). The range is a static snapshot: it does not auto-grow when rows are appended later.

### Custom cell types (column-level `CellTypeRegistry`)

Register a `CellTypeDefinition` keyed by `Field.type` to plug a whole new business type into edit, clipboard, sort, filter, and cell-action handling at once — it applies to every cell in that column (unless overridden per-cell, see below).

```ts
import { SKIP_CELL_VALUE, type CellTypeDefinition } from '@zhiguang/novasheet-core'

const ratingType: CellTypeDefinition = {
  editable: true,
  formatForEdit: (value) => String(value ?? ''),
  parseEditInput: (input) => {
    const n = Number(input)
    return Number.isNaN(n) ? SKIP_CELL_VALUE : Math.max(0, Math.min(5, n))
  },
  serializeClipboard: (value) => String(value ?? ''),
  parseClipboard: (text) => {
    const n = Number(text)
    return Number.isNaN(n) ? SKIP_CELL_VALUE : n
  },
  sortValue: (value) => (typeof value === 'number' ? value : null),
  isEmpty: (value) => value == null,
  filterOperators: [
    {
      id: 'rating-gte',
      label: 'Rating >=',
      matches: (value, operand) =>
        typeof value === 'number' && typeof operand === 'number' && value >= operand,
    },
  ],
  onAction: (ctx) => {
    // custom cell-action handling; call ctx.preventOpenEditor() to skip the default open-editor step that follows
  },
}

new Grid(container, { backend: canvas2dBackend(), data, cellTypes: { rating: ratingType } })
```

Every hook is optional — wire only what the type needs. `parseEditInput` / `parseClipboard` return the `SKIP_CELL_VALUE` sentinel to reject input without writing anything. A `Field.type` with **no** matching registry entry (and no built-in) falls back to read-only plain-text display: it never throws, the raw value is untouched, and double-click / Enter / F2 / typing never open an editor for it.

Lookup is by the cell's **resolved** type (column default, or per-cell `setCellType` override) first. If a cell has an explicit override and no entry exists for that resolved type, lookup does **not** fall back to the column's own `Field.type` entry — it's treated as unregistered for that one cell, rather than silently reusing a definition built for a different type.

### Per-cell type override (`setCellType` / `clearCellType` / `getCellType`)

```ts
const range = { startRow: 0, endRow: 0, startCol: 2, endCol: 2 }
grid.setCellType(range, 'date') // this cell now reads/edits/sorts as date, regardless of its column's Field.type
grid.getCellType(0, 2) // 'date'
grid.clearCellType(range) // back to the column's default type
```

This is the "one column, multiple types" escape hatch — distinct from `CellTypeRegistry` above, and scoped to only the four scalar resolved types: `text` / `number` / `date` / `checkbox`. Locked, BDD-covered semantics:

- **Trigger is explicit only** — `setCellType` or drag-fill propagation. Typed input is never type-inferred, and paste always coerces to the **target's** resolved type rather than importing the source's override.
- `setCellType` / `clearCellType` / `getCellType` take **view coordinates**; the underlying `CellTypeStore` is keyed by **raw coordinates**, sparse, and remaps on row/column insert/delete/move (an override inside a deleted range is dropped, not orphaned). A non-contiguous view range is rejected (`false`, no write) instead of silently scattering raw writes.
- **An illegal existing value is left alone** — `setCellType` never coerces or clears the underlying value; if it can't be read as the new resolved type, display falls back.
- **Sort across mixed resolved types** uses a fixed cross-type rank instead of implicit JS comparison: `number`/`date` < `text` < `checkbox` (`false` < `true`) < empty. Empty is always last regardless of direction; descending only reverses the non-empty ranks; ties break by stable row index.
- **Filter** gates the available operators by the column's default type, not the per-cell override, while predicates still run against the resolved value.
- Both calls are undoable/redoable as a single step.

### Value formatting, fill color, borders, text wrap

```ts
const range = { startRow: 0, endRow: 9, startCol: 1, endCol: 1 }
grid.setValueFormat(range, { kind: 'currency', currency: 'USD', decimals: 2 })
grid.setValueFormat(range, { kind: 'percent', decimals: 1 })
grid.setValueFormat(range, { kind: 'date', pattern: 'YYYY-MM-DD' })
grid.setFillColor(range, '#fff2cc')
grid.setFillColor(range, null) // clear
grid.setBorders(range, 'outer', { color: '#000', width: 'thin', lineStyle: 'solid' })
grid.setTextWrap(range, 'wrap') // 'overflow' | 'wrap' | 'clip'
```

Formats are keyed by raw coordinate internally, so `getViewCellFormat` keeps resolving to the right cell after a sort. The raw cell value is never mutated by a format — `ValueFormat` only changes display text.

### Merge cells

```ts
grid.mergeCells(range) // interior cells now resolve to the same region via getViewMergeRegion
grid.unmergeCells(range) // getViewMergeRegion(...) → null again
```

A merge survives sort (the region remaps to the new view positions) and survives structural undo/redo together with whatever format sat on top of it.

### Fill handle

```ts
grid.onFill((event) => console.log(event.fill, event.result))
```

Dragging the fill handle projects arithmetic/date sequences or clones a single sample, and propagates every format axis (`fillColor`, `borders`, `textWrap`, `valueFormat`) plus the source's resolved cell type onto the target — if the source lacks an axis, the target's stale value on that axis is cleared (Sheets-style overwrite), and the whole operation undoes as one unit.

### Clipboard

```ts
new Grid(container, {
  backend: canvas2dBackend(),
  data,
  onPasteSkipped: (cells) => cells.forEach((c) => console.log(c.reason)), // e.g. 'type'
})
await grid.copy() // or grid.cut()
await grid.paste()
```

Paste coerces incoming values to the **target's** resolved type (it does not import the source's type the way fill does); cells that can't be coerced, or land on a read-only type, are skipped and reported via `onPasteSkipped` without touching the target. `serializeRowsToTsv` / `parseTsvToCells` are exported directly for round-tripping outside a mounted `Grid`.

### Sort, filter, hide (view pipeline)

```ts
grid.getSortLayer().setSpec({ fieldId: 'revenue', direction: 'desc' })
grid
  .getFilterLayer()
  .setSpec({ fieldId: 'name', op: { kind: 'text-contains', value: 'a', caseSensitive: false } })
grid.hideCols(['joined'])
grid.getHiddenCols() // ['joined']
```

All three layers compose into one final frame; mutation APIs (`setCellType`, `setValueFormat`, ...) keep taking **view** coordinates and resolve back to raw internally.

### Remote / windowed data (`WindowedDataSource`)

```ts
import { WindowedDataSource, type WindowedDataProvider } from '@zhiguang/novasheet-core'

const provider: WindowedDataProvider = {
  loadRange: (window, signal) =>
    fetch(`/api/rows?${toQuery(window)}`, { signal }).then((r) => r.json()),
  subscribe: (onEvent) => {
    const ws = new WebSocket('/api/rows/stream')
    ws.onmessage = (e) => onEvent(JSON.parse(e.data))
    return {
      setWindow: (window) => ws.send(JSON.stringify({ type: 'setWindow', window })),
      close: () => ws.close(),
    }
  },
}

const data = new WindowedDataSource({ schema, rowCount: 100_000, provider, preloadScreens: 2 })
const grid = new Grid(container, { backend: canvas2dBackend(), data })
```

`Grid` calls `hintWindow(visibleWindow)` on every frame (a no-op once the window stops changing); `WindowedDataSource` expands it by `preloadScreens` screens, dedupes against an LRU block cache, and only fetches what's missing — scrolling within the preloaded margin issues zero requests. `loadRange` responses and `subscribe` push events (`cells` / `rowCount` / `resync`) reconcile through a stale-while-revalidate epoch, so scrolling back to an already-visited region repaints instantly from cache while a background refetch (if stale) replaces it. `hintWindow` forwards through `SortLayer` / `FilterLayer` / `HideRowsLayer` / `VisibleColumnsDataSource`, so sort/filter/hide compose on top transparently. See [`apps/storybook/src/stories/WindowedDataSource.stories.ts`](../../apps/storybook/src/stories/WindowedDataSource.stories.ts) for a runnable example with a simulated network fetch and tick-by-tick push feed.

### Validation

```ts
import type { ValidatorDefinition } from '@zhiguang/novasheet-core'

const positiveNumber: ValidatorDefinition = {
  validate: (value) =>
    typeof value === 'number' && value >= 0 ? null : 'Must be a non-negative number',
}

new Grid(container, {
  backend: canvas2dBackend(),
  data,
  validators: { 'positive-number': positiveNumber },
})
grid.setValidation(range, { type: 'positive-number' })
grid.validateAll()
grid.getValidationState(rowIndex, colIndex) // null | { status: 'invalid', message } | { status: 'pending' }
```

Validators can be sync or return a `Promise`; async runs are scheduled with a bounded batch size and concurrency (`validationBatchSize`, `validationMaxConcurrent` on `GridOptions`) and every write path (edit, paste, fill, undo, redo) re-queues automatically.

### Cell attachments

```ts
import type { CellAttachmentCodec } from '@zhiguang/novasheet-core'

const richTextCodec: CellAttachmentCodec<{ runs: unknown[] }> = {
  namespace: 'rich-text',
  serialize: (data) => JSON.stringify(data),
  deserialize: (text) => JSON.parse(text),
}

new Grid(container, { backend: canvas2dBackend(), data, cellAttachments: [richTextCodec] })
grid.setCellAttachment('rich-text', rawRow, rawCol, { runs: [...] })
grid.getCellAttachment('rich-text', rawRow, rawCol)
```

Attachments are keyed by **raw** coordinate, remap on structural insert/delete the same way cell-type overrides do, ride along with copy/paste and fill, and undo together with the cell's value.

### Undo / redo

```ts
grid.onUndo((event) => console.log(event))
grid.onRedo((event) => console.log(event))
grid.undo()
grid.redo()
grid.canUndo()
grid.canRedo()
```

Every mutating facade method (`insertRows`, `setCellType`, `mergeCells`, `setValueFormat`, paste, fill, ...) pushes one of 22 `UndoCommand` kinds; each kind is plain-data and JSON round-trips exactly, so a host application can persist/replay history outside the `Grid` instance.

### Context menu extension

```ts
new Grid(container, {
  backend: canvas2dBackend(),
  data,
  contextMenus: {
    cell: { mode: 'append', items: [{ id: 'copy-as-json', label: 'Copy as JSON' }] },
  },
  onContextMenuAction: (action, ctx) => {
    if (action === 'copy-as-json') {
      /* custom id arrives as a plain string */
    }
  },
})
```

Built-in row/column-header menus (insert/delete/hide/unhide, ...) ship with golden-locked item lists; `append`/`prepend`/`replace` extend them without core needing to know your custom action ids.

### Custom DOM cell editor

```ts
import type { CellEditor } from '@zhiguang/novasheet-core'

const dateEditor: CellEditor = {
  open(ctx) {
    const input = document.createElement('input')
    input.type = 'date'
    input.style.position = 'absolute'
    Object.assign(input.style, { left: `${ctx.rect.x}px`, top: `${ctx.rect.y}px` })
    input.addEventListener('change', () => ctx.commit(input.value))
    ctx.container.appendChild(input)
  },
}

new Grid(container, { backend: canvas2dBackend(), data, cellEditors: { date: dateEditor } })
```

`ctx.trigger` tells you why the editor opened (`'double-click' | 'enter' | 'f2' | 'typing' | 'api' | 'cell-action'`); `ctx.initialInput` carries the first typed character when triggered by typing. Like `cellTypes`, lookup is by **resolved** type with no fallback to the column type once a cell has an explicit override (same rule as above).

### Custom cell display (canvas painter)

`core` never renders, so there is no `GridOptions` field for display — the per-type painter registry is owned by the **render backend** you pass in. For `@zhiguang/novasheet-canvas2d` that's `canvas2dBackend({ cellRenderers })`:

```ts
import type { Canvas2DCellRenderer } from '@zhiguang/novasheet-canvas2d'

const ratingRenderer: Canvas2DCellRenderer = {
  paint(ctx, { value, rect, theme }) {
    const score = typeof value === 'number' ? value : 0
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i < score ? theme.colors.selectionBorder : theme.colors.gridLineStrong
      ctx.fillRect(rect.x + i * 12, rect.y + 4, 10, 10)
    }
  },
}

new Grid(container, {
  data,
  cellTypes: { rating: ratingType }, // from the section above — drives edit/sort/filter
  backend: canvas2dBackend({ cellRenderers: { rating: ratingRenderer } }),
})
```

The renderer is keyed by `Field.type` too, but the `field` it receives in `paint(ctx, params)` has already been swapped to the cell's **resolved** type by the renderer — a `setCellType` override picks the matching painter automatically, with the same "no fallback to the column painter" rule as `cellEditors`/`cellTypes`. `params` also carries `getAttachment(namespace, viewRow, viewCol)` (read whatever `cellAttachments` codec wrote for this cell) and `formatCell(...)` (resolved `ValueFormat` display text), so a custom renderer can draw from both data sources without re-deriving them. `Canvas2DCellRenderer` is exported by `@zhiguang/novasheet-canvas2d`, not `core` — the type lives wherever the rendering does.

### Putting a custom type together end to end

A fully custom cell type composes four registration points, three of them on `core` and one on the backend:

| Axis                                            | API                                  | Package    |
| ----------------------------------------------- | ------------------------------------ | ---------- |
| Business semantics (edit/sort/filter/clipboard) | `GridOptions.cellTypes`              | `core`     |
| Extra per-cell payload                          | `GridOptions.cellAttachments`        | `core`     |
| DOM/overlay editor                              | `GridOptions.cellEditors`            | `core`     |
| Canvas painter                                  | `canvas2dBackend({ cellRenderers })` | `canvas2d` |

```ts
new Grid(container, {
  data,
  cellTypes: { rating: ratingType },
  cellAttachments: [myCodec],
  cellEditors: { rating: ratingEditor },
  backend: canvas2dBackend({ cellRenderers: { rating: ratingRenderer } }),
})
```

The shipped reference implementation of this pattern is the rich-text cell type in `@zhiguang/novasheet-cell-kit` (codec + canvas renderer + inline contenteditable editor + an external React toolbar), wired up end to end in [`apps/storybook/src/stories/RichText.stories.ts`](../../apps/storybook/src/stories/RichText.stories.ts) — read that file for a complete, working example beyond what fits in this README.

### Lifecycle, layout, frozen regions

```ts
grid.setFrozen({ topRows: 1, leftCols: 1, rightCols: 1 })
grid.autofitRows({ rows: [0, 1, 2], maxHeight: 200 }) // wrap-enabled columns only
grid.refresh()
grid.destroy() // idempotent — safe to call more than once
```

## Testing

```bash
bun test            # unit + acceptance specs
bun run typecheck
```

Behavior is specified before it's implemented: each capability above has a Given/When/Then scenario under `tests/acceptance/**/scenarios/*.md` (see [`tests/acceptance/SCENARIOS.md`](tests/acceptance/SCENARIOS.md) for the index), validated against the test suite with `bun run lint:mbd`. Source layout and the pure-layer/DOM-shell boundary are documented in [`src/ARCHITECTURE.md`](src/ARCHITECTURE.md).
