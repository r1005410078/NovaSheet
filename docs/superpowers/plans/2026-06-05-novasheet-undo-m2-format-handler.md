# Plan — Undo M2：FormatUndoHandler（format/merge/unmerge）

- 日期：2026-06-05
- Spec：`docs/superpowers/specs/2026-06-05-novasheet-undo-decomposition-serializable-commands.md`
- 依赖：**M1 完成**（`UndoReplay` 派发骨架 + dual-track 已就位）。
- 范围：把 format / merge / unmerge 三个 kind 的 undo/redo 迁出 engine 旧 switch。

## 现状（engine 旧 switch 的目标分支，逐字对照）

undo：
- `format`：`formatStore.restore(before)` + `selection.setSelection(selectionBefore)`
- `merge` / `unmerge`：`mergeStore.restore(before)` + `selection.setSelection(selectionBefore)`

redo：
- `format`：`formatStore.restore(after)` + `setSelection(selectionAfter)`
- `merge` / `unmerge`：`mergeStore.restore(after)` + `setSelection(selectionAfter)`

> 三个 kind 都只动 **一个 store + 选区**，是单域，迁移最干净。命令已在 `FormatController` push。

## 设计

- `FormatUndoContext`（最小能力面）：
  `restoreFormat(layers)`、`restoreMerge(regions)`、`restoreSelection(selection)`。
  engine 实现（`formatStore.restore` / `mergeStore.restore` / `selectionController.setSelection`）。
- `FormatUndoHandler`（住 `engine/format/`，与 `FormatController` 同域）：
  `handles('format'|'merge'|'unmerge')`；undo/redo 按上面分支原样实现。
- 在 engine 构造的 `UndoReplay` handler 列表中**追加** `FormatUndoHandler`。
- engine 旧 switch 的 format/merge/unmerge 分支**保留**（dual-track fallback，M4 末统一删）；
  但因 handler 命中，fallback 不会被走到。

## 任务（TDD，单任务单 commit）

### Task 1 — 序列化 round-trip：format/merge/unmerge
- **测试**：扩 `UndoCommandSerialization.test.ts`，为三 kind 造样例 round-trip 深等。
- **STOP**：`FormatLayer[]` 快照若含**非 JSON 数据**（Map / 类实例 / 函数）→ round-trip 不等 →
  **停并报告**（spec 已预警）。先查 `RangeStyleStore.snapshot()` 返回结构；若是不可变纯对象数组则通过，
  否则把「FormatLayer 序列化归一化」作为发现单列，不在本 task 强行展开。
- **commit**：`test(core): 扩展 undo 序列化守卫覆盖 format/merge/unmerge`

### Task 2 — `FormatUndoHandler` + 隔离单元测试
- **测试**：`packages/core/tests/engine/format/FormatUndoHandler.test.ts`，fake `FormatUndoContext`
  捕获 restoreFormat/restoreMerge/restoreSelection 调用与参数。
  - format undo → `restoreFormat(before)` + `restoreSelection(selectionBefore)`；redo → after/After。
  - merge/unmerge undo → `restoreMerge(before)` + `restoreSelection(selectionBefore)`；redo → after/After。
  - `handles` 仅这三 kind 为真。
- **实现**：
  - `packages/core/src/engine/format/FormatUndoContext.ts`（或并入 handler 文件）。
  - `packages/core/src/engine/format/FormatUndoHandler.ts`。
- **commit**：`feat(core): 新增 FormatUndoHandler（format/merge/unmerge）`

### Task 3 — 注册进 UndoReplay + 回归
- **测试**：engine 级 format/merge/unmerge 的 undo/redo 集成测试保持绿（行为不变）。
- **实现**：engine 构造 `UndoReplay([..., new FormatUndoHandler()], …)`，注入 `FormatUndoContext`
  实现；engine 旧 switch 分支保留。
- **plan-risk**：确认命中 handler 后**不再**走 fallback（M1 的 UndoReplay 已保证；此处只验证三 kind 不双跑）。
- **commit**：`refactor(core): format/merge/unmerge undo 经 FormatUndoHandler`

## M2 验收
- format/merge/unmerge 的 undo/redo 经 `FormatUndoHandler`，engine 旧 switch 这三分支不再被触达。
- 三 kind 有序列化 round-trip 测试与隔离单元测试。
- 全量测试、4 包 typecheck、lint 全绿。

## 自检
- 一致性：`FormatUndoContext` 三方法 ↔ 旧 switch 的 `formatStore.restore`/`mergeStore.restore`/`setSelection`。
- 范围：不碰 cell/结构/复合；不删旧 switch。
- STOP 点：`FormatLayer` 序列化（Task 1）。
