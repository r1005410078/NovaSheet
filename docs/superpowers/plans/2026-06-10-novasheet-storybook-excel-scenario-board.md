# Storybook Excel Scenario Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Storybook 用 NovaExcel 展示 21 条 L3 行为场景，测试覆盖列以填色标记完成/缺失。

**Architecture:** `sync-excel-scenario-board.ts` 读 manifest + 复用 `computeScenarioCoverage` 生成 `src/generated/excel-scenario-board.ts`；`ExcelScenarioBoardHost` 挂载 NovaExcel 后 `setFillColor` / `setTextWrap`。

**Tech Stack:** bun, Storybook HTML+Vite, NovaExcel, InMemoryDataSource, @novasheet/mbd

**Spec:** `docs/superpowers/specs/2026-06-10-novasheet-storybook-excel-scenario-board-design.md`

---

### Task 1: 生成脚本 + 产物

**Files:**
- Create: `apps/storybook/scripts/sync-excel-scenario-board.ts`
- Create: `apps/storybook/src/generated/excel-scenario-board.ts`（生成）
- Modify: `packages/react/scripts/check-scenario-coverage.ts`（export `collectScenarioIdsFromTestRoots`）
- Modify: `apps/storybook/package.json`（`sync:excel-scenario-board`, `prestorybook`, `prebuild-storybook`, mbd devDep）

- [x] 实现并运行 `bun run --filter @novasheet/storybook sync:excel-scenario-board`

### Task 2: Story + Host

**Files:**
- Create: `apps/storybook/src/excel-scenario-board-host.tsx`
- Create: `apps/storybook/src/stories/ExcelScenarioBoard.stories.ts`

- [x] `Table/React → Excel Scenario Board`，`showToolbar: false`，`excelWorkspace: false`

### Task 3: Smoke test

**Files:**
- Create: `apps/storybook/src/stories/ExcelScenarioBoard.stories.test.ts`

- [x] 断言 21/21 covered、22 行、无 toolbar、有 canvas

### Task 4: 验证

- [x] `bun test apps/storybook/src/stories/ExcelScenarioBoard.stories.test.ts`
- [ ] `bun test` 全量
- [ ] `bun run lint`
