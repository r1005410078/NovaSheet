# `@zhiguang/novasheet-react`

[中文 README](README.zh-CN.md)

React adapter for NovaSheet. This package wraps `@zhiguang/novasheet-core`'s imperative `Grid` (rendered through `@zhiguang/novasheet-canvas2d`) into React components, hooks, and a ready-made Excel-style shell. It is **not** an engine or a renderer — it owns no grid state, no mutation logic, no Canvas painting. Every capability below ultimately calls a public `Grid` method; see [`@zhiguang/novasheet-core`](../core/README.md) for what those methods guarantee.

Behavior is also specified as Given/When/Then scenarios under [`tests/excel/scenarios/*.md`](tests/excel) (index: [`tests/excel/SCENARIOS.md`](tests/excel/SCENARIOS.md)), layered L3a (shell/DOM/props/ref/StrictMode) → L3b (toolbar click → `grid.*` wiring) → L3c (user journeys) — see [Testing](#testing).

## Install

```bash
bun add @zhiguang/novasheet-react react react-dom
```

`@zhiguang/novasheet-core` and `@zhiguang/novasheet-canvas2d` come in as this package's own dependencies; `react`/`react-dom` (>=18.3) are peer dependencies.

## Quick start

```tsx
import { NovaExcel } from '@zhiguang/novasheet-react'

// Zero-config: an empty, infinitely-scrollable A–Z × 1000 sparse workbook with a built-in toolbar.
export function BlankWorkbook() {
  return <NovaExcel className="h-[600px] w-full" />
}
```

```tsx
import { InMemoryDataSource } from '@zhiguang/novasheet-core'
import { NovaSheetGrid } from '@zhiguang/novasheet-react'

const data = new InMemoryDataSource({
  schema: { fields: [{ id: 'name', name: 'Name', type: 'text', width: 160 }] },
  rows: [{ name: 'Alice' }, { name: 'Bob' }],
})

// Bare grid, no toolbar chrome.
export function PlainGrid() {
  return <NovaSheetGrid data={data} className="h-[480px] w-full" />
}
```

`@zhiguang/novasheet-react` does not ship global CSS. The built-in toolbar uses Tailwind utility classes, so consuming apps must load Tailwind and include `packages/react/src/**/*` (or the published component code) in their content scan.

## Responsibilities

| Does | Detail |
| --- | --- |
| React lifecycle binding | Creates `Grid` on mount, calls `Grid.destroy()` on unmount; compatible with Strict Mode's mount → unmount → mount cycle. |
| DOM container management | Owns the grid host element and wires the container ref to the `Grid` facade; never paints a canvas itself. |
| Default backend assembly | Composes core's `Grid` with `@zhiguang/novasheet-canvas2d`'s `canvas2dBackend` by default. |
| React-shaped API | Components, hooks, ref handles, typed event callbacks, and a props-diff strategy on top of the imperative facade. |
| Business toolbar | Ships `NovaSheetToolbar` — display + typed action dispatch only, no engine logic in the React layer. |
| Stable integration entry points | Surfaces data source, schema, theme, frozen, selection, editing, clipboard, and undo/redo wiring for application code. |

| Does not | Why |
| --- | --- |
| Implement engine state | `DefaultGridEngine`, mutation, undo, view/raw coordinates, and the `DataSource` protocol live in `@zhiguang/novasheet-core`. |
| Implement Canvas painting | Renderer, painters, HighDPI, text measurement live in `@zhiguang/novasheet-canvas2d`. |
| Bypass the `Grid` facade | Every mutation goes through `Grid`'s public methods. |
| Read renderer internals | Only holds the public `Grid` handle; never touches `Canvas2DRenderer`/painter private state. |
| Hardcode visual values | Visual tokens still come from core's `Theme`; this layer only owns container sizing and business props. |

## Dependency direction

```text
@zhiguang/novasheet-core      Grid facade · engine · DOM runtime · contracts
        ↑
@zhiguang/novasheet-canvas2d  Canvas2D RenderBackend implementation
        ↑
@zhiguang/novasheet-react     React component/hook adapter
        ↑
business apps        React applications
```

`@zhiguang/novasheet-react` may depend on `core` and `canvas2d`. The reverse is forbidden — neither may import this package. Source layering inside this package (`excel/` vs `features/grid` vs `features/toolbar` vs `components`/`lib`) and its import-direction rules are documented in [`docs/project-structure.md`](docs/project-structure.md) and [`docs/project-standards.md`](docs/project-standards.md); enforced by `bun run lint:react-boundary`.

## Components

| Component | What it is |
| --- | --- |
| `NovaSheetGrid` | Bare React grid, no toolbar. Wraps core `Grid` + `canvas2dBackend`; mount/destroy lifecycle is Strict-Mode-safe. Props mirror `GridOptions` (minus `backend`) plus standard `div` props. |
| `useNovaSheetGrid` | The hook powering `NovaSheetGrid`. Returns `{ containerRef, gridRef }` for building your own layout around the same mount/update logic. |
| `NovaExcel` | Batteries-included Excel shell: `NovaSheetGrid` + `NovaSheetToolbar` + built-in action wiring. Defaults to an internal `SparseExcelDataSource` + `excelWorkspace: true` + `excelHeaders: true` when `data` is omitted. |
| `useNovaExcelToolbar` | The headless hook powering `NovaExcel`'s toolbar wiring (undo/redo/clipboard/fill/border/merge/text-wrap/value-format → `grid.*`, plus toolbar-state sync). Use it to drive a fully custom toolbar UI off the same action routing. |
| `NovaSheetToolbar` | Standalone compact spreadsheet toolbar component. Dispatches a typed `ToolbarAction` via `onAction` — it never calls `Grid` itself. |
| `createReactCellEditor` | Adapter: wrap a React component as a core `CellEditor` (inline/popover/modal), for `GridOptions.cellEditors`. |
| `createReactCellFilterEditor` | Adapter: wrap a React component as a `CellFilterEditor` for a custom type's filter UI, decoupled from `CellTypeDefinition.filterOperators` predicate logic. |
| `defaultToolbarItems`, `deriveToolbarStateFromGrid`, `useNovaSheetToolbarState`, `CustomColorPicker`, `CHECKERBOARD_BG`, `ToolbarColorPalette`, `ToolbarColorPaletteCustom` | Lower-level building blocks behind `NovaSheetToolbar` (default item order, pure Grid→toolbar-state derivation, color-picker UI) for assembling a customized toolbar without forking the whole component. |

## Usage examples

### Bare grid

```tsx
import { InMemoryDataSource, denseGridTheme } from '@zhiguang/novasheet-core'
import { NovaSheetGrid, type NovaSheetGridRef } from '@zhiguang/novasheet-react'
import { useRef } from 'react'

export function Sheet({ data }: { data: InMemoryDataSource }) {
  const ref = useRef<NovaSheetGridRef>(null)
  return (
    <NovaSheetGrid
      ref={ref}
      data={data}
      theme={denseGridTheme}
      frozen={{ topRows: 1 }}
      onSelectionChange={(selection) => console.log(selection)}
      className="h-[480px] w-full"
    />
  )
}
```
`ref.current.grid` is the underlying core `Grid` instance — anything not exposed directly on `NovaSheetGridRef` (`refresh`, `destroy`, `scrollToRow`, `scrollToCell`, `setColumnWidth`, `setFrozen`) is still reachable through it (`ref.current.grid.setValueFormat(...)`, `.mergeCells(...)`, etc.).

### Excel shell, with and without data

```tsx
import { SparseExcelDataSource } from '@zhiguang/novasheet-core'
import { NovaExcel } from '@zhiguang/novasheet-react'

const data = new SparseExcelDataSource()
data.updateCell(0, 'A', 'NovaSheet')

export function ExcelSheet() {
  return (
    <NovaExcel
      data={data}
      className="h-[560px] w-full"
      onToolbarAction={(action) => console.log(action.id)}
    />
  )
}

// Omit `data` to get the internal SparseExcelDataSource + excelWorkspace mode for free.
export function BlankExcel() {
  return <NovaExcel className="h-[560px] w-full" />
}
```
`showToolbar={false}` drops the built-in `NovaSheetToolbar` DOM while keeping the grid and `ref` fully usable — for embedding a read-only sheet or driving an entirely custom toolbar via `ref.current.grid`.

### Structural and selection callbacks via ref

```tsx
<NovaExcel
  onSelectionChange={(s) => console.log(s.activeCell)}
  onRowsInserted={(e) => console.log('inserted at', e.at, e.newIds)}
  onColumnsDeleted={(e) => console.log('removed', e.removed)}
  onUndo={(e) => console.log(e.command)}
/>
```
These mirror `GridOptions`' callbacks one-for-one; `NovaExcel` composes them with its own toolbar-state sync (your callback runs first, then the toolbar re-derives its state) rather than replacing them.

### A fully custom toolbar (`useNovaExcelToolbar`)

```tsx
import { useRef } from 'react'
import { NovaSheetGrid, useNovaExcelToolbar, type NovaSheetGridRef } from '@zhiguang/novasheet-react'

function CustomToolbarSheet({ data }) {
  const gridRef = useRef<NovaSheetGridRef>(null)
  const { toolbarState, disabledActionIds, handleToolbarAction } = useNovaExcelToolbar({
    getGrid: () => gridRef.current?.grid ?? null,
  })

  return (
    <div className="flex h-full flex-col">
      <button disabled={disabledActionIds.includes('undo')} onClick={() => handleToolbarAction({ id: 'undo' })}>
        Undo
      </button>
      <button onClick={() => handleToolbarAction({ id: 'fill-color', color: '#fff2cc' })}>Highlight</button>
      <NovaSheetGrid ref={gridRef} data={data} className="flex-1" />
    </div>
  )
}
```
`handleToolbarAction` resolves a selection (falling back to a default range if there isn't one, mirroring `setValueFormat`-style toolbar actions), calls the matching `grid.*` method, and re-derives `toolbarState`/`disabledActionIds` — the exact same routing `NovaExcel` uses internally, just without its bundled UI.

### Standalone `NovaSheetToolbar`

```tsx
import { NovaSheetToolbar } from '@zhiguang/novasheet-react'

export function SheetToolbar() {
  return (
    <NovaSheetToolbar
      state={{ zoom: '100%', textWrap: '溢出' }}
      disabledActionIds={['undo', 'redo']}
      onAction={(action) => console.log(action.id)}
    />
  )
}
```
`NovaSheetToolbar` never touches `Grid` — it just renders `state`/`disabledActionIds` and hands user intent to `onAction({ id })`. Pairing it with `useNovaExcelToolbar` (above) is how `NovaExcel` itself is built.

### Custom cell editor

```tsx
import { createReactCellEditor, type ReactCellEditorProps } from '@zhiguang/novasheet-react'

function AssigneePicker({ value, commit, cancel }: ReactCellEditorProps) {
  return (
    <div>
      {['Alice', 'Bob', 'Carol'].map((name) => (
        <button key={name} onClick={() => commit(name)}>{name}</button>
      ))}
      <button onClick={cancel}>Cancel</button>
    </div>
  )
}

const assigneeEditor = createReactCellEditor(AssigneePicker, { kind: 'popover' })

<NovaSheetGrid data={data} cellEditors={{ assignee: assigneeEditor }} />
```
`createReactCellEditor` mounts/unmounts a React root per open/close cycle and forwards the full core `CellEditorOpenContext` as props (`value`, `field`, `rect`, `trigger`, `getAttachment`/`setAttachment`, ...) alongside `commit`/`cancel`. `kind: 'inline'` (default) positions the editor over the cell rect; `'popover'`/`'modal'` position it below.

### Custom filter editor

```tsx
import { createReactCellFilterEditor, type ReactCellFilterEditorProps } from '@zhiguang/novasheet-react'

function AssigneeFilter({ value, apply, cancel }: ReactCellFilterEditorProps) {
  const selected = new Set(Array.isArray(value) ? value : [])
  return (
    <div>
      {['Alice', 'Bob', 'Carol'].map((name) => (
        <label key={name}>
          <input type="checkbox" checked={selected.has(name)} onChange={() => { /* toggle */ }} />
          {name}
        </label>
      ))}
      <button onClick={() => apply({ operatorId: 'assignee-is-any-of', value: [...selected] })}>Apply</button>
      <button onClick={cancel}>Cancel</button>
    </div>
  )
}

const assigneeFilterEditor = createReactCellFilterEditor(AssigneeFilter)
```
The React component only collects an `operatorId` + `value` — actual filter semantics still live in `cellTypes[type].filterOperators[...].matches(...)` on the `core` side. This editor has no business logic; it's purely a UI surface for picking which registered operator/value to apply.

### Putting a custom type together in React

The flagship example combining `createReactCellEditor`, `cellAttachments`, a canvas renderer, and a `NovaSheetToolbar` extension item is the rich-text cell type shipped in `@zhiguang/novasheet-cell-kit`, wired end to end in [`apps/storybook/src/stories/RichText.stories.ts`](../../apps/storybook/src/stories/RichText.stories.ts). Its `richTextExtension.toolbarExtension(controller)` plugs into `NovaSheetToolbar`'s `extensionItems` prop — the same seam used for any custom React control (a color picker, a formula bar button, ...) that needs to act on the currently-open cell editor rather than on the grid selection.

## Known gap: not every `GridOptions` field is forwarded

`NovaSheetGridProps` types as `Omit<GridOptions, 'backend'>`, so TypeScript happily accepts any core `GridOptions` field as a prop. At runtime, today, `NovaSheetGrid` / `useNovaSheetGrid` only forward: `data`, `theme`, `frozen`, `defaultRowHeight`, `excelHeaders`, `excelWorkspace`, `locale`, `formatters`, `cellEditors`, and the documented callbacks (`onContextMenuAction`, clipboard/`onCopy`/`onCut`/`onPaste`/`onPasteSkipped`, `onUndo`/`onRedo`/`onFill`, structural `onRows*`/`onColumns*`/`onHide*Change`, `onSelectionChange`).

**Not yet forwarded**: `cellTypes`, `cellAttachments`, `validators`, `validationBatchSize`, `validationMaxConcurrent`, `contextMenus`, `contextMenuRenderer`, `fillCellTypes`. Passing one of these as a JSX prop is not a type error, but it is a no-op for configuring the grid — and for `<NovaSheetGrid>`/`<NovaExcel>` specifically, the unrecognized prop falls through to the host `<div>` as a raw DOM attribute (React will warn about it in the console). If you need one of these options today, construct `Grid` directly (see [`@zhiguang/novasheet-core`](../core/README.md)) instead of going through this adapter, or extend `useNovaSheetGrid`'s destructure list.

## Testing

```bash
bun test                      # tests/excel/**, tests/features/**
bun run lint:scenario-coverage
bun run typecheck
```

`tests/excel/` is the primary behavior-test surface for this package (Core's own L0–L2 behavior suite lives in `@zhiguang/novasheet-core`; see its README). Scenarios layer as **L3a** shell/DOM/props/ref/StrictMode, **L3b** toolbar-click→`grid.*` wiring, **L3c** user journeys — index in [`tests/excel/SCENARIOS.md`](tests/excel/SCENARIOS.md), full text in `tests/excel/scenarios/*.md`. `lint:scenario-coverage` fails on scenarios with no matching test and on tests with no matching scenario.
