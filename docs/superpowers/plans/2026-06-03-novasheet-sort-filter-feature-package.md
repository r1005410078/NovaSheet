# Sort Filter Feature Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **总路线图：** phase 7。完成后在 `2026-06-02-novasheet-feature-package-roadmap.md` 将 phase 7 标 `[x]`。

**Goal:** 排序/筛选交互（列头 menu 项 + 动作 + `FilterPopover`）迁入 `@novasheet/feature-sort-filter`；`web.sort-filter` 契约；收窄 `feature-context-menu` 列头 provider 为结构项 only。

**Architecture:** `SortFilterController` 持 `FilterPopover` + 注册 `web.menu-item`（sort/filter 项与 `handleAction`）。runtime 探测 `web.sort-filter` 委托 `handleFilterPopoverApply` / `isPopoverOpen` / theme。`SortLayer`/`FilterLayer` 仍由 `Canvas2DBackend` 创建并注入 runtime deps。

**设计依据：** `docs/superpowers/specs/2026-06-03-novasheet-sort-filter-feature-package-design.md`

**已知风险（STOP+ASK）：**

- `column-default` 收窄后，**必须**默认 BOM 同时安装 sort-filter，否则列头缺 sort/filter 项。
- `getColumnHeaderContextMenuItems` 仍 exported 给 `Grid.getColumnHeaderContextMenuItems` 公共 API — 行为须仍为 pipeline+structural 完整列表（runtime 方法不变，仅 DOM menu provider 拆分）。

---

## Scope

**In:** `web.sort-filter`；`feature-sort-filter`；`feature-context-menu` 列 provider 收窄；runtime/backend 委托；测试迁移；architecture 文档。

**Out:** 迁 ViewLayer 类；structure 列动作（phase 8）。

---

## Task 1: `web.sort-filter` 契约（web 独立绿）

- Create: `packages/web/src/sort-filter/WebSortFilter.ts`
- Test: `packages/web/tests/sort-filter/WebSortFilter.test.ts`
- Export from `packages/web/src/index.ts`

`WebSortFilter`: `attach`, `destroy`, `applyTheme`, `isPopoverOpen`, `handleFilterPopoverApply(op)`, `handleColumnMenuAction(id, ctx): boolean`

---

## Task 2: `feature-sort-filter` 包 + 大原子提交

- Scaffold `packages/feature-sort-filter/`（照 feature-context-menu）
- `git mv` `FilterPopover.ts`, `filter-popover-style.ts`, `FilterPopover.test.ts`
- `SortFilterController.ts`, `installSortFilterFeature.ts`, `sortFilterMenuProvider.ts`
- `WebGridRuntime`: 探测 `sortFilterController`；委托 popover；删 `setFilterPopover`
- `ContextMenuController`: 删除列头 sort/filter 分支
- `defaultMenuProviders.ts`（context-menu）: column → `getColumnHeaderStructuralMenuItems` only
- `Canvas2DBackend`: 删 popover 构造；`installSortFilterFeature` in BOM
- `tsconfig.base.json`, sheet deps

---

## Task 3: 文档 + 路线图打勾

- `docs/architecture.md`
- roadmap phase 7 `[x]`

---

## Verification

`bun run lint` · `bun run --filter '*' typecheck` · `bun test` · build sheet + feature-sort-filter + web
