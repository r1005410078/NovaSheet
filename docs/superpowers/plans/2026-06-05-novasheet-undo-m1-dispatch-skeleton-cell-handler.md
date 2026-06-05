# Plan — Undo M1：派发骨架 + CellUndoHandler + 序列化守卫

- 日期：2026-06-05
- Spec：`docs/superpowers/specs/2026-06-05-novasheet-undo-decomposition-serializable-commands.md`
- 分支：`refactor-default-grid-engine-decomposition`
- 前提：undo 历史须可序列化（AI 读 / 协同 / 审计）。方案 = 数据命令 + 各域 undo handler。

## 里程碑路线图（一次一个，本文件只详化 M1）

| 里程碑 | 范围 | 复合? |
| --- | --- | --- |
| **M1（本文件）** | `UndoReplay` 派发骨架（dual-track 回退旧 switch）+ `CellUndoHandler`（editCell/clearRange）+ 序列化 round-trip 守卫 | 否 |
| M2 | `FormatUndoHandler`（format/merge/unmerge） | 否 |
| M3 | 单域结构 handler（resizeRow/resizeColumn/resizeRowsMulti/hideRows/unhideRows） | 否 |
| M4 | 复合用例 handler（paste/fill/moveRows/moveCols/insert/delete*）+ 删除 engine 旧 switch | 是 |

M1 完成后 engine **仍保留**旧 `applyUndo`/`applyRedo`，仅 editCell/clearRange 走新路径，其余 kind
经 dual-track 回退。旧 switch 在 M4 末才删除。

## M1 设计要点

- `UndoHandler`：`handles(kind)` + `applyUndo(cmd, ctx)` + `applyRedo(cmd, ctx)`。
- `UndoReplay`：持 handler 列表 + `fallback`（未迁 kind 委回 engine 旧 switch）。
  `undo(cmd)` / `redo(cmd)` 按 kind 找唯一 handler，否则 fallback。
- `CellUndoContext`（M1 最小能力面，**不**镜像 engine）：
  `applyCellWrite(rowIndex, fieldId, value)`、
  `restoreSelectionAfterEdit(rowIndex, fieldId)`、
  `restoreSelectionForWrites(writes, fallbackRange)`。
  engine 提供实现（复用现有同名私有方法）。
- engine `undo()`/`redo()` 改调 `this.undoReplay.undo(cmd)` / `.redo(cmd)`。

> 注：现 `engine/undo/UndoReplay.ts` 只有 `UndoReplayContext` 接口、未接线。M1 在该文件加
> `UndoReplay` 派发类与 `UndoHandler` 接口；`UndoReplayContext` 暂不动（M2+ 收窄），
> M1 的 `CellUndoContext` 单独定义，避免一上来背 engine 镜像清单。

## 任务（TDD：先写失败测试 → 看红 → 实现 → 看绿 → 单任务单 commit）

### Task 1 — 序列化 round-trip 守卫
- **测试先行**：`packages/core/tests/undo/UndoCommandSerialization.test.ts`
  - `assertSerializable(cmd)` helper：`expect(JSON.parse(JSON.stringify(cmd))).toEqual(cmd)`。
  - 为 `editCell`、`clearRange` 各造样例命令 round-trip 深等。
- **实现**：helper 放 `packages/core/tests/helpers/`（测试侧，非生产代码）。
- **风险/STOP**：若任何字段含 `Date`/类实例导致 round-trip 不等 → **停并报告**（spec 已预警
  `CellValue` 的 `Date`）。M1 只覆盖 editCell/clearRange（值为 string/number/null 居多）；
  若样例命中 `Date`，记为发现、缩小 M1 样例到纯 JSON 值，把 `Date` 归一化留给后续任务。
- **commit**：`test(core): 新增 undo 命令序列化 round-trip 守卫`

### Task 2 — `UndoHandler` 接口 + `CellUndoHandler`（隔离单元）
- **测试先行**：`packages/core/tests/engine/undo/CellUndoHandler.test.ts`
  - fake `CellUndoContext` 捕获 `applyCellWrite` 调用序列与 selection 恢复调用。
  - `editCell` undo → 写 `before`、调 `restoreSelectionAfterEdit`；redo → 写 `after`。
  - `clearRange` undo → 按 `before` 逐格写回、调 `restoreSelectionForWrites(before, range)`；
    redo → 逐格写 `null`、同样恢复选区。
  - `handles('editCell')`/`handles('clearRange')` 为真，其余为假。
- **实现**：
  - `packages/core/src/engine/undo/UndoHandler.ts`：`UndoHandler` 接口 + `CellUndoContext` 接口。
  - `packages/core/src/engine/undo/CellUndoHandler.ts`：实现，逆/重做逻辑从 engine switch 的
    editCell/clearRange 分支**原样迁移**（语义不得变）。
- **plan-risk**：clearRange 的 redo 写 `null`（清空），undo 写回 `before` 值——务必与现 switch 一致
  （见 spec：次序/值敏感）。对拍现有 clearRange undo 测试。
- **commit**：`feat(core): 新增 UndoHandler 接口与 CellUndoHandler`

### Task 3 — `UndoReplay` 派发 + engine dual-track 接线
- **测试先行**：
  - `packages/core/tests/engine/undo/UndoReplay.test.ts`：注册一个假 handler + 假 fallback，
    验证「命中 kind 走 handler、未命中走 fallback、且只调用一次」。
  - engine 级回归：现有 editCell/clearRange 的 undo/redo 集成测试**保持绿**（行为不变）。
- **实现**：
  - `UndoReplay` 类（`engine/undo/UndoReplay.ts`）：构造接收 `handlers: UndoHandler[]` +
    `fallback: { applyUndo(cmd); applyRedo(cmd) }` + `ctx: CellUndoContext`（M1）。
  - engine：构造 `this.undoReplay = new UndoReplay([new CellUndoHandler()], legacyFallback, cellUndoCtx)`；
    `legacyFallback` 包 `this.applyUndo`/`this.applyRedo`（旧 switch 仍在，但 editCell/clearRange
    分支可保留作 fallback 死路或删除——**保留**以缩小本任务改动，M4 统一删）。
  - `undo()`/`redo()` 改调 `this.undoReplay.undo(cmd)` / `.redo(cmd)`。
- **plan-risk**：dual-track 下要确保 editCell/clearRange **只被新 handler 执行一次**，不重复经旧
  switch。`UndoReplay` 命中 handler 后**不得**再调 fallback。
- **commit**：`refactor(core): engine undo/redo 经 UndoReplay 派发，editCell/clearRange 走域 handler`

## M1 验收
- editCell/clearRange 的 undo/redo 经 `CellUndoHandler`，engine `undo()`/`redo()` 委派 `UndoReplay`。
- 其余 kind 经 dual-track 回退旧 switch，行为不变。
- `CellUndoHandler` 有隔离单元测试；`UndoReplay` 有派发测试；editCell/clearRange 命令有序列化 round-trip 测试。
- 全量测试（931+）、4 包 typecheck、lint 全绿。

## 自检（plan self-review）
- 占位符扫描：无 TODO/TBD 留空。
- 一致性：`CellUndoContext` 三方法与 engine 现有 `applyEditCellWrite`/`restoreSelectionForEdit`/
  `restoreSelectionForWrites` 一一对应（命名对齐，restoreSelectionAfterEdit ↔ restoreSelectionForEdit）。
- 范围：M1 不碰 format/merge/structural/composite；不删旧 switch。
- 歧义点已标 STOP：序列化遇 `Date`（Task 1）、dual-track 重复执行（Task 3）。
