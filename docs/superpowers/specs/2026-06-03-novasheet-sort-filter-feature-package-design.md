# Sort Filter Feature Package — Design

- **Date**: 2026-06-03
- **Status**: Draft
- **Parent**: `docs/superpowers/plans/2026-06-02-novasheet-feature-package-roadmap.md` phase 7
- **Prior art**: `docs/superpowers/specs/2026-05-22-sort-filter-design.md`（ViewLayer 语义）

---

## 1. Goal

把排序/筛选的 **交互竖切片**（列头 menu 项 + 菜单动作 + `FilterPopover` DOM）迁到 `@novasheet/feature-sort-filter`。`SortLayer` / `FilterLayer` / `ViewPipeline` 组合 **留在 core + sheet backend**（ViewLayer 语义不变）。

---

## 2. Architecture

| 层 | 职责 |
|---|---|
| `@novasheet/core` | `SortLayer` / `FilterLayer` / `ViewPipeline` / `FilterOp`；`getColumnHeaderStructuralMenuItems` |
| `@novasheet/web` | 新增 `web.sort-filter` 贡献点（`WebSortFilter`：popover 生命周期 + 列头 sort/filter 动作） |
| `@novasheet/feature-sort-filter` | `SortFilterController` + `FilterPopover`；`web.menu-item` provider；`installSortFilterFeature` |
| `@novasheet/feature-context-menu` | 列头 provider 收窄为 **仅结构项**（insert/delete/hide/resize） |
| `@novasheet/sheet` | 仍 `new SortLayer()` / `new FilterLayer()` 并 `pipeline.add`；BOM 安装 sort-filter feature |

### 2.1 菜单拆分

| Provider | order | getItems | handleAction |
|---|---:|---|---|
| `sort-filter-default` | 15 | `viewPipeline.collectColumnHeaderMenuItems(ctx)` | sort-asc/desc/none、filter-open/clear |
| `column-default`（context-menu） | 20 | `getColumnHeaderStructuralMenuItems` only | —（结构项仍由 context-menu controller 派发） |

### 2.2 动作派发

- sort/filter：`SortFilterController.handleColumnMenuAction`（经 `web.sort-filter` 或 menu-item `handleAction`）
- 列结构：保留 `ContextMenuController` → runtime `invokeColumnHeaderContextMenuAction`

---

## 3. Non-Goals

- 迁 `SortLayer` / `FilterLayer` 类到 feature 包
- 改 `Grid.getSortLayer()` / `on('sortChange')` 公共 API
- HideRowsLayer / 行头菜单（phase 8 structure）

---

## 4. Acceptance

- `FilterPopover` / `filter-popover-style` 仅在 `feature-sort-filter`
- 未安装 feature：列头无 sort/filter 项；`filter-open` no-op；键盘 gate 不挡 grid
- 默认 Grid 列头 sort/filter/popover 行为与拆包前一致
- `feature-context-menu` 列头菜单不再含 sort/filter 项（由 sort-filter provider 提供）
