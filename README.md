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
- **Portable core**: `@novasheet/core` has no DOM or Canvas dependency.
- **Browser-ready facade**: `@novasheet/sheet` exposes the public `Grid` API.
- **Dedicated renderer package**: `@novasheet/canvas2d` owns Canvas2D painting.
- **Spreadsheet interactions**: selection, keyboard navigation, editing, clipboard, undo/redo, fill handle, sorting, filtering, row/column operations, merge cells, and range formatting.
- **Live Storybook demos**: interactive examples for scroll, frozen regions, autofit, Excel-style headers, editing, clipboard, selection, formatting, and more.
- **Tested monorepo**: 842 passing `bun:test` tests across the workspace.

## Current Status

NovaSheet is pre-1.0 and actively developed.

| Area       | Status                                                         |
| ---------- | -------------------------------------------------------------- |
| Packages   | `@novasheet/core`, `@novasheet/web`, `@novasheet/canvas2d`, `@novasheet/sheet` |
| Tests      | 842 passing tests with `bun:test`                              |
| CI gates   | lint, typecheck, test, build                                   |
| Public API | `import { Grid } from '@novasheet/sheet'`                        |
| Demo       | Storybook on GitHub Pages                                      |
| License    | MIT                                                            |

Recently delivered: **Phase 5-A merge cells + basic range formatting**.

Next milestone: **Phase 5-B advanced borders**.

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
bun run --filter @novasheet/core build
bun run --filter @novasheet/canvas2d build
bun run --filter @novasheet/sheet build
```

```ts
import { InMemoryDataSource, denseGridTheme } from '@novasheet/core'
import { Grid } from '@novasheet/sheet'

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
│   ├── core/                @novasheet/core
│   ├── web/                 @novasheet/web
│   ├── canvas2d/            @novasheet/canvas2d
│   └── sheet/               @novasheet/sheet
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
┌────────────────────────────────────────────────────────────┐
│   @novasheet/sheet                                         │
│   Grid (public facade) · Canvas2DBackend                   │
└────────────────────────────┬───────────────────────────────┘
              depends on     │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌────────────────────────────────────────────────────────────┐
│   @novasheet/web                                           │
│   WebGridRuntime · DomGridHost · ScrollMapper              │
│   NativeScroller · DOM interaction layers                  │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│   @novasheet/canvas2d                                      │
│   Canvas2DRenderer · Cell / Header / GridLines painters    │
│   HighDPI                                                  │
└────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────┐
│   @novasheet/core (no DOM, no canvas)                      │
│   DefaultGridEngine · DataSource · Theme · ChunkedAxis     │
│   FrozenRegions · Viewport · RenderFrame · ViewPipeline    │
└────────────────────────────────────────────────────────────┘
```

Dependency direction is intentionally one-way:

```text
core <- (web, canvas2d) <- sheet <- apps
```

See [docs/architecture.md](docs/architecture.md) for the detailed architecture notes.

## Roadmap

| Milestone                          | Scope                                                                                              | Status  |
| ---------------------------------- | -------------------------------------------------------------------------------------------------- | ------- |
| M1 Foundation                      | Canvas rendering, theme tokens, data source, axes, painters, frame scheduler, Grid facade          | Done    |
| M2 Virtual scrolling               | Native scroll host, nonlinear scroll mapping, `scrollToRow`, `scrollToCell`, 1M+ rows              | Done    |
| M3 Frozen regions / autofit        | top / left / right frozen regions, dynamic row height, multiline autofit                           | Done    |
| Phase 3 Interactions               | selection, keyboard navigation, resize, basic editing                                              | Done    |
| Phase 4 Spreadsheet workflows      | context menu, clipboard, undo/redo, fill handle, sort/filter, row/column structure, column reorder | Done    |
| Phase 5-A Merge + basic formatting | merge/unmerge, fill color, basic borders, undo/redo, Storybook coverage                            | Done    |
| Phase 5-B/C/D Advanced formatting  | advanced borders, number/date/percent/currency formats, conditional formatting                     | Planned |
| Phase 6 Schema + field types       | field editor, validation, lookup, rollup, grouping, aggregation                                    | Planned |
| Phase 7 Formulas + import/export   | formula engine, multi-sheet support, named ranges, pivot tables, charts, xlsx/csv                  | Planned |
| Phase 8 Server + multi-view        | server-paginated data sources, OPFS, collaboration, Grid/Kanban/Calendar/Gallery views             | Planned |
| Phase 9 Framework adapters         | React and Vue adapters                                                                             | Planned |
| Phase 10 AI-native workflows       | natural-language queries, insights, autocomplete, data-cleaning assistance                         | Planned |

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
bun run --filter @novasheet/core test
bun run --filter @novasheet/core typecheck
bun run --filter @novasheet/core build
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
