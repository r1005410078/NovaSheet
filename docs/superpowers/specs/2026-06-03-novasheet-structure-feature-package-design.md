# Structure Feature Package — Design

- **Date**: 2026-06-03
- **Status**: Draft
- **Parent**: `docs/superpowers/plans/2026-06-02-novasheet-feature-package-roadmap.md` phase 8

---

## 1. Goal

把行列 **结构操作** 的菜单项与动作（insert/delete/hide/unhide/resize 菜单入口）迁到 `@novasheet/feature-structure`。`MutableDataSource` / engine 结构 API **留在 core**；行高/列宽 popover DOM **仍留 web**（phase 14 与 resize 回补）。

---

## 2. Architecture

| 层 | 职责 |
|---|---|
| `@novasheet/core` | `getColumnHeaderStructuralMenuItems` / `getRowHeaderContextMenuItems`；`getColumnHeaderContextMenuItems`（公共 API 仍含 pipeline+结构） |
| `@novasheet/web` | `web.structure`：`StructureController` 动作；`WebMenuItemRuntimeDeps` 增 `engine` + `collectHiddenInViewColRange` |
| `@novasheet/feature-structure` | `StructureController` + column/row menu providers；`installStructureFeature` |
| `@novasheet/feature-context-menu` | 仅 **cell** 默认 menu provider |
| `@novasheet/sheet` | BOM：`installStructureFeature` + context-menu + sort-filter |

### 2.1 菜单拆分

| Provider | order | getItems |
|---|---:|---|
| `sort-filter-default` | 15 | pipeline sort/filter |
| `structure-column-default` | 20 | `getColumnHeaderStructuralMenuItems` |
| `structure-row-default` | 30 | `getRowHeaderContextMenuItems` |
| `cell-default` | 10 | cell cut/copy/paste |

### 2.2 动作派发

列头：`sortFilter.handleColumnMenuAction` → `structure.handleColumnMenuAction`  
行头：`structure.handleRowHeaderMenuAction`  
`Grid.invoke*ContextMenuAction` 仍经 runtime 委托 structure controller。

---

## 3. Non-Goals

- 迁 `RowHeightPopover` / `ColumnWidthPopover`（web + phase 14）
- 改 `insertRows` / `hideCols` engine 语义

---

## 4. Acceptance

- 未安装 structure：列头/行头无结构项；`invoke*` 对结构 id no-op
- 默认 Grid 行列头菜单与拆包前一致
- `feature-context-menu` 不再注册 column/row providers
