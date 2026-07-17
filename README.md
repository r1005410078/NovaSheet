# NovaSheet

> A high-performance Canvas spreadsheet engine for AI-native data workbenches.

[![CI](https://github.com/r1005410078/NovaSheet/actions/workflows/ci.yml/badge.svg)](https://github.com/r1005410078/NovaSheet/actions/workflows/ci.yml)
[![Live demo](https://img.shields.io/badge/demo-Storybook-ff4785)](https://r1005410078.github.io/NovaSheet/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[Live Demo](https://r1005410078.github.io/NovaSheet/) · [中文 README](README.zh-CN.md) · [Contributing](CONTRIBUTING.md) · [Changelog](CHANGELOG.md) · [0.1.0 Release Notes](docs/release/0.1.0.md)

NovaSheet is an open-source spreadsheet engine for building large, interactive data applications. It uses a Canvas-first rendering architecture and is designed to scale toward **1,000,000+ rows x 500+ columns**, while keeping the core engine portable and the browser runtime ergonomic.

The long-term goal is to provide infrastructure for AI-native data workbenches: fast grids, structured data editing, formulas, import/export, multi-view workflows, and natural-language assistance on top of a reliable spreadsheet foundation.

## Why NovaSheet

- **Canvas-first performance**: a single visible-region redraw path for large datasets.
- **Portable engine**: `@zhiguang/novasheet-core`'s engine layers (kernel/features/engine) are DOM-free; rendering is injected through a `RenderBackend` port, so core never depends on Canvas.
- **Public facade in core**: `import { Grid } from '@zhiguang/novasheet-core'`, with the renderer passed in as `backend: canvas2dBackend()`.
- **Dedicated renderer package**: `@zhiguang/novasheet-canvas2d` owns Canvas2D painting and the custom cell-renderer registry.
- **React adapter**: `@zhiguang/novasheet-react` ships `<NovaExcel />` (a ready-made Excel-style shell) and `<NovaSheetGrid />`.
- **Extensible cells**: register custom cell types, editors, attachments, and canvas painters — `@zhiguang/novasheet-cell-kit`'s rich-text cell is the first-party reference implementation.
- **Spreadsheet interactions**: selection, keyboard navigation, editing, clipboard, undo/redo, fill handle, sorting, filtering, row/column operations, merge cells, value formatting, and validation.
- **Live Storybook demos**: interactive examples for scroll, frozen regions, autofit, Excel-style headers, editing, clipboard, selection, formatting, windowed data, and more.
- **Tested monorepo**: 1,797 passing `bun:test` tests across the workspace, with BDD acceptance scenarios backing the public API.

## Current Status

NovaSheet is pre-1.0 and actively developed.

| Area       | Status                                                                                                |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| Packages   | `@zhiguang/novasheet-core`, `@zhiguang/novasheet-canvas2d`, `@zhiguang/novasheet-react`, `@zhiguang/novasheet-cell-kit`, `@zhiguang/novasheet-mbd` |
| Tests      | 1,797 passing tests with `bun:test`                                                                   |
| CI gates   | lint, typecheck, test, build                                                                          |
| Public API | `import { Grid } from '@zhiguang/novasheet-core'` + `backend: canvas2dBackend()`                               |
| Demo       | Storybook on GitHub Pages                                                                             |
| License    | MIT                                                                                                   |

Recently delivered: **Phase 5-C value formatting, custom cell-type extension API (+ `@zhiguang/novasheet-cell-kit` rich text), cell validation, `WindowedDataSource` remote data, and the React adapter**.

Next milestone: **Phase 5-D conditional formatting**.

## Demo And Release Readiness

- Live Storybook demo: <https://r1005410078.github.io/NovaSheet/>
- Planned public package milestone: [NovaSheet 0.1.0](docs/release/0.1.0.md)
- npm release checklist: [docs/npm-publishing.md](docs/npm-publishing.md)
- Release manager: Changesets

The packages are prepared as public workspace packages, but they have not been published to npm yet. Before the first npm release, maintainers should verify package tarballs and reconcile package export paths with the files included in published artifacts.

## Quick Start

NovaSheet uses Bun workspaces.

```bash
bun install
bun run --filter @zhiguang/novasheet-core build
bun run --filter @zhiguang/novasheet-canvas2d build
```

```ts
import { Grid, InMemoryDataSource, denseGridTheme } from '@zhiguang/novasheet-core'
import { canvas2dBackend } from '@zhiguang/novasheet-canvas2d'

const data = new InMemoryDataSource({
  schema: {
    fields: [
      { id: 'employee', name: 'Employee', type: 'text', width: 160 },
      { id: 'team', name: 'Team', type: 'text', width: 120 },
      { id: 'region', name: 'Region', type: 'text', width: 100 },
      { id: 'revenue', name: 'Revenue', type: 'number', width: 120 },
      { id: 'growth', name: 'Growth', type: 'number', width: 100 },
      { id: 'owner', name: 'Owner', type: 'text', width: 140 },
      { id: 'status', name: 'Status', type: 'text', width: 100 },
      { id: 'notes', name: 'Notes', type: 'text', width: 240 },
    ],
  },
  rows: Array.from({ length: 100_000 }, (_, i) => ({
    employee: `Employee ${i}`,
    team: ['Platform', 'Data', 'Design'][i % 3],
    region: ['NA', 'EU', 'APAC'][i % 3],
    revenue: i * 1_000 + 250,
    growth: (i % 20) - 10,
    owner: `Owner ${i % 12}`,
    status: ['On track', 'Watch', 'Blocked'][i % 3],
    notes: `Quarterly note ${i}`,
  })),
})

const container = document.getElementById('app')!
const grid = new Grid(container, {
  data,
  backend: canvas2dBackend(),
  theme: denseGridTheme,
  frozen: { topRows: 1, leftCols: 1, rightCols: 1 },
})

grid.scrollToCell(500, 'owner')
grid.setColumnWidth('revenue', 140)
grid.setFrozen({ topRows: 2, leftCols: 1, rightCols: 1 })

// grid.destroy()
```

Run the local demo:

```bash
bun run storybook
```

Open Storybook and choose the `Table /` stories to explore interactive variants. Each story canvas is editable, and Storybook's code panel can be used as a usage reference.

## Packages

```text
novasheet/
├── packages/
│   ├── core/                @zhiguang/novasheet-core — engine + DOM shell + public Grid facade
│   ├── canvas2d/            @zhiguang/novasheet-canvas2d — Canvas2D render backend
│   ├── react/               @zhiguang/novasheet-react — React adapter (NovaExcel shell, hooks)
│   ├── cell-kit/            @zhiguang/novasheet-cell-kit — opt-in cell components (rich text)
│   └── mbd/                 @zhiguang/novasheet-mbd — markdown BDD scenario tooling (dev-only)
├── apps/
│   └── storybook/           interactive demo app
├── docs/
│   ├── architecture.md
│   └── superpowers/
│       ├── specs/
│       └── plans/
├── bunfig.toml
├── bun.lock
└── package.json
```

## Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│   Composition roots: apps/storybook · @zhiguang/novasheet-react      │
│   new Grid(container, { data, backend: canvas2dBackend() }) │
└──────────────┬──────────────────────────┬───────────────────┘
               │ uses                     │ injects
               ▼                          ▼
┌──────────────────────────┐   ┌─────────────────────────────┐
│   @zhiguang/novasheet-core        │   │   @zhiguang/novasheet-canvas2d       │
│   Grid (public facade)   │   │   canvas2dBackend()         │
│   DefaultGridEngine      │◄──│   Canvas2DRenderer          │
│   kernel/features/engine │   │   painters · HighDPI        │
│   DOM shell (dom/)       │   │   implements the            │
│   ports/RenderBackend    │   │   RenderBackend port        │
└──────────────────────────┘   └─────────────────────────────┘
```

Dependency direction is intentionally one-way — `core` never imports a renderer; `@zhiguang/novasheet-canvas2d` implements core's `RenderBackend` port and depends back on core:

```text
core <- canvas2d <- cell-kit
core + canvas2d <- react <- apps
```

See [docs/architecture.md](docs/architecture.md) for the detailed architecture notes.

## Roadmap

| Milestone                          | Scope                                                                                                                 | Status  |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------- |
| M1 Foundation                      | Canvas rendering, theme tokens, data source, axes, painters, frame scheduler, Grid facade                             | Done    |
| M2 Virtual scrolling               | Native scroll host, nonlinear scroll mapping, `scrollToRow`, `scrollToCell`, 1M+ rows                                 | Done    |
| M3 Frozen regions / autofit        | top / left / right frozen regions, dynamic row height, multiline autofit                                              | Done    |
| Phase 3 Interactions               | selection, keyboard navigation, resize, basic editing                                                                 | Done    |
| Phase 4 Spreadsheet workflows      | context menu, clipboard, undo/redo, fill handle, sort/filter, row/column structure, column reorder                    | Done    |
| Phase 5-A Merge + basic formatting | merge/unmerge, fill color, basic borders, undo/redo, Storybook coverage                                               | Done    |
| Phase 5-B Advanced borders         | per-edge borders, dashed/dotted/double line styles                                                                    | Done    |
| Phase 5-C Value formatting         | number/currency/percent/date formats, custom formatter registry, three-state text wrap                                | Done    |
| Cell extension API                 | custom cell types/editors/attachments, canvas cell renderers, per-cell type override, `@zhiguang/novasheet-cell-kit` rich text | Done    |
| Cell validation                    | sync/async `ValidatorDefinition`, auto-wired to every write path (edit/paste/fill/undo)                               | Done    |
| Windowed remote data               | `WindowedDataSource` sliding-window fetch/subscribe with LRU block cache                                              | Done    |
| React adapter                      | `@zhiguang/novasheet-react`: `<NovaExcel />` shell, `<NovaSheetGrid />`, hooks, toolbar                                        | Done    |
| Phase 5-D Conditional formatting   | conditional formatting rules                                                                                          | Next    |
| Phase 6 Schema + field types       | field editor, lookup, rollup, grouping, aggregation                                                                   | Planned |
| Phase 7 Formulas + import/export   | formula engine, multi-sheet support, named ranges, pivot tables, charts, xlsx/csv                                     | Planned |
| Phase 8 Server + multi-view        | server-paginated data sources, OPFS, collaboration, Grid/Kanban/Calendar/Gallery views                                | Planned |
| Phase 9 Framework adapters         | Vue adapter                                                                                                           | Planned |
| Phase 10 AI-native workflows       | natural-language queries, insights, autocomplete, data-cleaning assistance                                            | Planned |

Detailed design specs and implementation plans live in [docs/superpowers](docs/superpowers).

## Development

```bash
bun install
bun run lint
bun run typecheck
bun test
bun run build
bun run changeset status
bun run storybook
bun run build-storybook
```

Package-level commands:

```bash
bun run --filter @zhiguang/novasheet-core test
bun run --filter @zhiguang/novasheet-core typecheck
bun run --filter @zhiguang/novasheet-core build
```

Build Storybook with the same base path used by GitHub Pages:

```bash
STORYBOOK_BASE_PATH=/NovaSheet/ bun run build-storybook
bunx serve apps/storybook/storybook-static
```

## Contributing

NovaSheet is early, but it is maintained as a long-term open-source infrastructure project.

Good contributions include reproducible bugs, performance regressions, Storybook examples, documentation improvements, tests, and roadmap-aligned engine / renderer / web runtime work.

Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Security reports should follow [SECURITY.md](SECURITY.md).

## License

NovaSheet is licensed under the [MIT License](LICENSE).
