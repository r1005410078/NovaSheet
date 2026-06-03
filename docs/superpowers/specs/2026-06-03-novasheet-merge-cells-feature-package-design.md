# Merge Cells Feature Package — Design

- **Date**: 2026-06-03
- **Status**: Draft
- **Parent**: `docs/superpowers/plans/2026-06-02-novasheet-feature-package-roadmap.md` phase 9

---

## 1. Goal

把 **合并/取消合并** 的单元格右键菜单项与动作迁到 `@novasheet/feature-merge-cells`。`MergeStore` / `engine.mergeCells` / `unmergeCells` **留在 core**；`Grid.mergeCells` 公共 API 仍经 runtime 转发 engine。

---

## 2. Architecture

| 层 | 职责 |
|---|---|
| `@novasheet/core` | `getCellMergeMenuItems`；`ContextMenuAction` 增 `merge-cells` / `unmerge-cells` |
| `@novasheet/web` | `web.merge-cells`：`MergeCellsController` 单元格菜单动作 |
| `@novasheet/feature-merge-cells` | menu provider + `installMergeCellsFeature` |
| `@novasheet/feature-context-menu` | 仍仅 `cell-default`（cut/copy/paste）；合并项由 merge feature 提供 |
| `@novasheet/sheet` | BOM 安装 merge-cells；`mergeCells`/`unmergeCells` 仍 `WebGridRuntime` → engine |

### 2.1 菜单

| Provider | order | getItems |
|---|---:|---|
| `cell-default` | 10 | cut/copy/paste（paste `separatorAfter: true`） |
| `merge-cells-default` | 12 | `getCellMergeMenuItems` |

### 2.2 动作

单元格：`handleCellMenuAction` → `MergeCellsController`（在 clipboard provider 之前）。

---

## 3. Non-Goals

- 迁 `MergeStore` 类
- 格式化菜单（phase 10）
- Storybook toolbar（仍直接 `grid.mergeCells`）

---

## 4. Acceptance

- 未安装 feature：单元格菜单无 merge/unmerge 项
- 默认 Grid 安装后：选区右键含合并/取消合并；行为与 `grid.mergeCells` 一致
- `Grid.mergeCells` / `unmergeCells` 签名不变
