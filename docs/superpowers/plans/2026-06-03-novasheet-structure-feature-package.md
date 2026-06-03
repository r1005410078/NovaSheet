# Structure Feature Package Implementation Plan

> **总路线图：** phase 8

**Goal:** 行列结构菜单项 + 动作迁入 `@novasheet/feature-structure`；`web.structure` 契约；`feature-context-menu` 仅 cell provider。

**设计依据：** `docs/superpowers/specs/2026-06-03-novasheet-structure-feature-package-design.md`

---

## Task 1: `web.structure` + `WebMenuItemRuntimeDeps` 扩展

- `packages/web/src/structure/WebStructure.ts` + test
- `WebMenuItemRuntimeDeps`: optional `engine`, `collectHiddenInViewColRange`

## Task 2: `feature-structure` 包

- Scaffold（照 feature-sort-filter，无 DOM attach）
- `StructureController`：自 `WebGridRuntime` 迁 `invokeRow/Column` 结构分支
- `structureMenuProviders` + `installStructureFeature`
- Runtime 探测 `structureController`；context-menu 收窄；BOM 安装

## Task 3: 文档 + roadmap phase 8 `[x]`

## Verification

`bun run lint` · `typecheck` · `bun test` · build web + feature-structure + sheet
