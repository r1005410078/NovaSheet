# Plan — Undo M1：派发骨架 + CellUndoHandler + 序列化守卫

- 日期：2026-06-05
- Spec：`docs/superpowers/specs/2026-06-05-novasheet-undo-decomposition-serializable-commands.md`
- 分支：`refactor-default-grid-engine-decomposition`
- 前提：undo 历史须可序列化（AI 读 / 协同 / 审计）。方案 = 数据命令 + 各域 undo handler。

## 里程碑路线图（一次一个，本文件只详化 M1）

| 里程碑 | 范围 | 复合? | 文件 |
| --- | --- | --- | --- |
| **M1（本文件）** | `UndoReplay` 派发骨架（dual-track 回退旧 switch）+ `CellUndoHandler`（editCell/clearRange/**paste**）+ 序列化 round-trip 守卫 | 否 | 本文件 |
| M2 | `FormatUndoHandler`（format/merge/unmerge） | 否 | `…-undo-m2-format-handler.md` |
| M3 | `RowUndoHandler`/`ColumnUndoHandler`（resize*/hide*/unhide* 单域结构） | 否 | `…-undo-m3-structural-handlers.md` |
| M4 | 复合用例 handler（fill/moveRows/moveCols/insert/delete{Rows,Cols}）+ 删除 engine 旧 switch | 是 | `…-undo-m4-composite-and-cleanup.md` |

**按能力面归类（route 的依据，全 21 kind）：**
- **cell-writes 族（M1）**：editCell、clearRange、paste —— 同用 `applyCellWrite` + 从 writes 派生选区，无 format/merge。
- **format 族（M2）**：format、merge、unmerge —— `formatStore`/`mergeStore` restore + `setSelection`。
- **单域结构（M3）**：resizeRow、resizeColumn、resizeRowsMulti、resizeColumnsMulti、hideRows、unhideRows、hideCols、unhideCols —— 仅结构 + rebuild + 选区，无 format/merge/frozen。
- **复合（M4）**：fill、moveRows、moveCols、insertRows、deleteRows、insertCols、deleteCols —— 跨结构 + format + merge +（cols 还有 frozen）+ 选区。

M1 完成后 engine **仍保留**旧 `applyUndo`/`applyRedo`，仅 editCell/clearRange 走新路径，其余 kind
经 dual-track 回退。旧 switch 在 M4 末才删除。

## M1 设计要点

- `UndoHandler`：`readonly domain` + `handles(kind)` + `applyUndo(cmd)` + `applyRedo(cmd)`。
  **ctx 在构造时注入并自持**，`applyUndo/Redo(cmd)` 不透传 ctx（replay 不碰 ctx）。
- `UndoRegistry`：`register(handler)` / `resolve(kind): UndoHandler | undefined` / 完整性查询。
  **这是 core undo 对「加域」的封闭/开放边界**：加域 = 注册 handler，不改 `undo/` 派发核心。
- `UndoReplay`：持 `UndoRegistry` + `fallback`（registry 未覆盖的 kind 回退 engine 旧 switch）。
  `undo(cmd)` / `redo(cmd)` 经 registry 解析唯一 handler，否则 fallback。
- 各域 **self-register**：`registerCellUndo(registry, ctx)`（构造 `CellUndoHandler(ctx)` 并 `register`）
  住 `engine/undo/`（cell 属 undo 域）。engine composition root 平铺调用各域注册函数。
- `CellUndoContext`（M1 最小能力面，**不**镜像 engine）：
  `applyCellWrite(rowIndex, fieldId, value)`、
  `restoreSelectionAfterEdit(rowIndex, fieldId)`、
  `restoreSelectionForWrites(writes, fallbackRange)`。
  engine 提供实现（复用现有同名私有方法）。三个方法即覆盖 editCell/clearRange/paste 全部所需。
- engine `undo()`/`redo()` 改调 `this.undoReplay.undo(cmd)` / `.redo(cmd)`。

> 注：现 `engine/undo/UndoReplay.ts` 只有 `UndoReplayContext` 接口、未接线。M1 在 `engine/undo/`
> 新增 `UndoHandler` 接口、`UndoRegistry`、`UndoReplay` 派发类；旧 `UndoReplayContext` 暂不动（按域 ctx
> 取代之，M2+ 逐步淘汰），M1 的 `CellUndoContext` 单独定义，避免一上来背 engine 镜像清单。

## 任务（TDD：先写失败测试 → 看红 → 实现 → 看绿 → 单任务单 commit）

### Task 1 — 序列化 round-trip 守卫
- **测试先行**：`packages/core/tests/undo/UndoCommandSerialization.test.ts`
  - `assertSerializable(cmd)` helper：`expect(JSON.parse(JSON.stringify(cmd))).toEqual(cmd)`。
  - 为 `editCell`、`clearRange`、`paste` 各造样例命令 round-trip 深等。
- **实现**：helper 放 `packages/core/tests/helpers/`（测试侧，非生产代码）。
- **风险/STOP**：若任何字段含 `Date`/类实例导致 round-trip 不等 → **停并报告**（spec 已预警
  `CellValue` 的 `Date`）。M1 只覆盖 editCell/clearRange（值为 string/number/null 居多）；
  若样例命中 `Date`，记为发现、缩小 M1 样例到纯 JSON 值，把 `Date` 归一化留给后续任务。
- **commit**：`test(core): 新增 undo 命令序列化 round-trip 守卫`

### Task 2 — `UndoHandler` 接口 + `CellUndoHandler`（自持 ctx，隔离单元）
- **测试先行**：`packages/core/tests/engine/undo/CellUndoHandler.test.ts`
  - 用 fake `CellUndoContext` **构造** `CellUndoHandler(ctx)`，捕获 `applyCellWrite` 序列与 selection 恢复。
  - `editCell` undo → 写 `before`、调 `restoreSelectionAfterEdit`；redo → 写 `after`。
  - `clearRange` undo → 按 `before` 逐格写回、调 `restoreSelectionForWrites(before, range)`；
    redo → 逐格写 `null`、同样恢复选区。
  - `paste` undo → 逐格写 `before`、调 `restoreSelectionForWrites(before, target)`；
    redo → 逐格写 `after`、调 `restoreSelectionForWrites(after, target)`。
  - `handles('editCell'|'clearRange'|'paste')` 为真，其余为假；`domain === 'cell'`。
- **实现**：
  - `packages/core/src/engine/undo/UndoHandler.ts`：`UndoHandler` 接口（`domain`/`handles`/
    `applyUndo(cmd)`/`applyRedo(cmd)`）+ `CellUndoContext` 接口。
  - `packages/core/src/engine/undo/CellUndoHandler.ts`：构造注入 `CellUndoContext`；逆/重做逻辑从
    engine switch 的 editCell/clearRange/paste 分支**原样迁移**（语义不得变）。
- **plan-risk**：clearRange 的 redo 写 `null`、undo 写 `before`；paste undo 用 `before`、redo 用 `after`
  ——务必与现 switch 一致（见 spec：次序/值敏感）。对拍现有 undo 测试。
- **commit**：`feat(core): 新增 UndoHandler 接口与 CellUndoHandler`

### Task 3 — `UndoRegistry` + `UndoReplay` 派发 + 各域 self-register + dual-track 接线
- **测试先行**：
  - `packages/core/tests/engine/undo/UndoRegistry.test.ts`：`register` 后 `resolve(kind)` 命中正确
    handler；未注册 kind `resolve` 返回 `undefined`；完整性查询正确。
  - `packages/core/tests/engine/undo/UndoReplay.test.ts`：registry 命中 → 走 handler；未命中 → 走
    `fallback`；**命中后不得再调 fallback**（只执行一次）。
  - engine 级回归：现有 editCell/clearRange/paste 的 undo/redo 集成测试**保持绿**。
- **实现**：
  - `engine/undo/UndoRegistry.ts`：`register` / `resolve` / 完整性查询。
  - `engine/undo/UndoReplay.ts`：构造接收 `registry: UndoRegistry` + `fallback`；
    `undo(cmd)`/`redo(cmd)` 经 `registry.resolve(cmd.kind)`，否则 fallback。**不持 ctx**。
  - `engine/undo/registerCellUndo.ts`（或并入 CellUndoHandler 文件）：
    `registerCellUndo(registry, ctx)` 构造 `CellUndoHandler(ctx)` 并 `registry.register(it)`。
  - engine composition：`this.undoRegistry = new UndoRegistry(); registerCellUndo(this.undoRegistry, cellUndoCtx);`
    `this.undoReplay = new UndoReplay(this.undoRegistry, legacyFallback)`。
    `legacyFallback` 包 `this.applyUndo`/`this.applyRedo`（旧 switch 仍在，M4 统一删）。
  - `undo()`/`redo()` 改调 `this.undoReplay.undo(cmd)` / `.redo(cmd)`。
- **plan-risk**：dual-track 下 editCell/clearRange/paste **只被 handler 执行一次**，不重复经旧 switch。
- **设计验收点**：此后「加一个域」= 写该域 handler + 提供 `registerXxxUndo` + 在 composition 调一次注册，
  **不动 `engine/undo/` 的 `UndoRegistry`/`UndoReplay` 派发核心**。
- **commit**：`refactor(core): 引入 UndoRegistry，undo/redo 经各域自注册 handler 派发`

## M1 验收
- editCell/clearRange/paste 的 undo/redo 经 `CellUndoHandler`（经 `UndoRegistry` 解析），
  engine `undo()`/`redo()` 委派 `UndoReplay`。
- 其余 kind 经 dual-track 回退旧 switch，行为不变。
- `UndoRegistry` 立起来：「加域 = 自注册 handler」成立，`engine/undo/` 派发核心不含具体 kind。
- `CellUndoHandler`/`UndoRegistry`/`UndoReplay` 各有隔离单元测试；editCell/clearRange/paste 有序列化 round-trip 测试。
- 全量测试（931+）、4 包 typecheck、lint 全绿。

## 自检（plan self-review）
- 占位符扫描：无 TODO/TBD 留空。
- 一致性：`CellUndoContext` 三方法与 engine 现有 `applyEditCellWrite`/`restoreSelectionForEdit`/
  `restoreSelectionForWrites` 一一对应（命名对齐，restoreSelectionAfterEdit ↔ restoreSelectionForEdit）。
- 范围：M1 不碰 format/merge/structural/composite；不删旧 switch。
- 歧义点已标 STOP：序列化遇 `Date`（Task 1）、dual-track 重复执行（Task 3）。
