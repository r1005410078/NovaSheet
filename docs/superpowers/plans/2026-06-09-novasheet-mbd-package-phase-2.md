# @novasheet/mbd Phase 2 — React 消费者 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `@novasheet/react` 落地场景结构覆盖率脚本，并将 21 条 excel 行为场景以 `it('excel.L3x…')` 前缀写入 `tests/excel/`。

**Architecture:** `check-scenario-coverage.ts` 读 mbd 导出的 `scenarios.manifest.json`，用 §6.1 正则扫描 `tests/excel/**/*.test.ts`；行为测试分三文件（L3a 壳层 / L3b 接线 / L3c 旅程），共享 `tests/excel/helpers.ts` 挂载工具。

**Tech Stack:** bun:test、`@novasheet/mbd`（readManifest）、happy-dom（core preload）、spyOn/mock

**前置：** Phase 1 已完成（`packages/mbd` + 21 `scenarios/*.md` + manifest 产物）

---

## 文件地图

| 文件 | 职责 |
| --- | --- |
| `packages/react/scripts/check-scenario-coverage.ts` | 扫描测试 title、对比 manifest、CLI 出口码 |
| `packages/react/tests/scripts/check-scenario-coverage.test.ts` | 覆盖率算法单测 |
| `packages/react/tests/excel/helpers.ts` | 共享 fixture / mount 辅助 |
| `packages/react/tests/excel/NovaExcel.test.ts` | L3a×6 |
| `packages/react/tests/excel/NovaExcel.wiring.test.ts` | L3b×10 |
| `packages/react/tests/excel/NovaExcel.journeys.test.ts` | L3c×5 |
| `packages/react/package.json` | `lint:scenario-coverage` + devDep `@novasheet/mbd` |

---

### Task 1: 场景结构覆盖率脚本

**Files:**
- Create: `packages/react/scripts/check-scenario-coverage.ts`
- Create: `packages/react/tests/scripts/check-scenario-coverage.test.ts`
- Modify: `packages/react/package.json`

- [x] **Step 1:** 写失败测试（scan 正则、missing/orphan、byLayer）
- [x] **Step 2:** 实现 `scanScenarioIdsFromSource` / `computeScenarioCoverage` / `runScenarioCoverageCheck`
- [x] **Step 3:** 添加 `lint:scenario-coverage`（默认 warn missing；`--fail-on-missing` 阻断）
- [x] **Step 4:** `bun test packages/react/tests/scripts/check-scenario-coverage.test.ts` 绿

---

### Task 2: L3a 壳层（6 场景）

**Files:**
- Create: `packages/react/tests/excel/helpers.ts`
- Modify: `packages/react/tests/excel/NovaExcel.test.ts`

- [x] **Step 1:** 现有 5 条 `it` 改 `excel.L3a.*` title；删除不在 manifest 的 SparseExcelDataSource 显式传入测
- [x] **Step 2:** 补 `excel.L3a.strict-mode-remount`、`excel.L3a.props-callbacks`
- [x] **Step 3:** `bun test packages/react/tests/excel/NovaExcel.test.ts` 绿

---

### Task 3: L3b 接线（10 场景）

**Files:**
- Create: `packages/react/tests/excel/NovaExcel.wiring.test.ts`

- [x] **Step 1:** 写失败测试（undo-redo spy `grid.undo`/`grid.redo` + `onToolbarAction`）
- [x] **Step 2:** 逐条实现 clipboard / fill / borders / merge / unmerge / text-wrap / default-range / undo-disabled / selection-sync
- [x] **Step 3:** `bun test packages/react/tests/excel/NovaExcel.wiring.test.ts` 绿

---

### Task 4: L3c 旅程（5 场景）

**Files:**
- Create: `packages/react/tests/excel/NovaExcel.journeys.test.ts`

- [x] **Step 1:** 写失败测试（填色反映 toolbar、undo 按钮态、无 toolbar ref、稀疏 ref、onUndo/onRedo）
- [x] **Step 2:** 实现浅断言（toolbar 状态 / 回调，不断言引擎数据）
- [x] **Step 3:** `bun test packages/react/tests/excel/NovaExcel.journeys.test.ts` 绿

---

### Task 5: 门禁验证

- [x] `bun run --filter @novasheet/react lint:scenario-coverage` — structuralRate 100%
- [x] `bun test packages/react` 全绿
- [x] `bun run --filter @novasheet/react typecheck` 绿

### Task 6: 根 lint 门禁（后续）

- [x] 根 `lint` 串联 `lint:mbd` + `lint:scenario-coverage --fail-on-missing`

---

## 风险点（STOP+ASK）

| 风险 | 处理 |
| --- | --- |
| toolbar undo 不触发 `onUndo` prop | 实测 `grid.undo()` 经 runtime 会触发 `onUndo`；已通过 |
| 程序化 mutation 后 undo 按钮态不同步 | **已解决**：`syncToolbarViaFill` 已移除，改为 NovaExcel compose 回调同步 toolbar；详见 `2026-06-10-novasheet-react-behavioral-testing-consolidation-design.md` |
| fill/borders 需 palette 交互 | 复用 `NovaSheetToolbar.test.ts` 点击模式 |
| `it` title 与 manifest id 不一致 | 以 manifest 为准，coverage 脚本精确前缀匹配 |
