# Plan — Undo M3：RowUndoHandler / ColumnUndoHandler（单域结构）

- 日期：2026-06-05
- Spec：`docs/superpowers/specs/2026-06-05-novasheet-undo-decomposition-serializable-commands.md`
- 依赖：**M1、M2 完成**。
- 范围：单域结构 kind（无 format/merge/frozen），按行/列两域各一 handler。
  - 行：`resizeRow`、`resizeRowsMulti`、`hideRows`、`unhideRows`
  - 列：`resizeColumn`、`resizeColumnsMulti`、`hideCols`、`unhideCols`

## 现状（逐字对照旧 switch）

行 undo / redo：
- `resizeRow`：undo `setRowHeight(i, before)` + `rebuildViewAxis()`；redo `setRowHeight(i, after)` +
  **`rowsAxis = getViewRowsAxis()`**（⚠ 见 STOP）。**无选区恢复**。
- `resizeRowsMulti`：undo 循环 `setRowHeight(rowIds[i], oldHeights[i] ?? resolveDefaultRowHeight())` +
  rebuild + `setSelection(before)`；redo `setRowHeightsMulti(rowIds, newHeight)` + rebuild + `setSelection(after)`。
- `hideRows`：undo `removeHidden(ids)` + rebuild + `setSelection(before)`；redo `addHidden(ids)` + rebuild + after。
- `unhideRows`：undo `addHidden` + rebuild + before；redo `removeHidden` + rebuild + after。

列 undo / redo（rebuild 两侧均 `rebuildViewColsAxis()`，一致）：
- `resizeColumn`：undo `setColWidth(i, before)`；redo `setColWidth(i, after)`。**无选区恢复**。
- `resizeColumnsMulti`：undo 循环 `setColWidthById(fieldIds[i], oldWidths[i] ?? getDefaultColWidth())` +
  rebuild + before；redo `setColWidthById(id, newWidth)` 循环 + rebuild + after。
- `hideCols`：undo `removeHidden(fieldIds)` + rebuild + before；redo `addHidden` + rebuild + after。
- `unhideCols`：undo `addHidden` + rebuild + before；redo `removeHidden` + rebuild + after。

## ⚠ STOP（必须先解决再迁 resizeRow）

`resizeRow` 的 **undo 走 `rebuildViewAxis()`，redo 走 `rowsAxis = getViewRowsAxis()`**——两者
是否等价？列侧两边都用 `rebuildViewColsAxis()`，行侧不对称，疑似既有 latent 不一致。
迁移前**停并确认**：
- 若等价 → `RowUndoContext.rebuildRows()` 统一封装，undo/redo 都用它（顺手抹平不一致，**在 plan 里记一笔**）。
- 若不等价（`rebuildViewAxis` 多做 frozen sync 等）→ 暴露两个能力或保留差异，**不得擅自归一**，按 CLAUDE.md
  「plan bug 先改 plan 再实现」处理：先 `docs(plan)` 记录结论，再实现。

## 设计

- `RowUndoContext`：`setRowHeight(rowIndex, h)`、`setRowHeightsMulti(rowIds, h)`、
  `addHiddenRows(ids)`、`removeHiddenRows(ids)`、`rebuildRows()`、`restoreSelection(sel)`、
  `resolveDefaultRowHeight()`。
- `ColumnUndoContext`：`setColWidth(colIndex, w)`、`setColWidthById(id, w)`、
  `addHiddenCols(ids)`、`removeHiddenCols(ids)`、`rebuildCols()`、`restoreSelection(sel)`、
  `getDefaultColWidth()`。
- `RowUndoHandler`（住 `engine/row/`）、`ColumnUndoHandler`（住 `engine/column/`）。
- 追加进 engine 的 `UndoReplay` handler 列表；旧 switch 分支保留至 M4。

## 任务（TDD，单任务单 commit）

### Task 0 — 解决 resizeRow rebuild 不对称（仅当 STOP 触发）
- 调查 `rebuildViewAxis()` vs `rowsAxis = getViewRowsAxis()` 差异，结论写入本 plan 的 `docs(plan)` commit。
- **commit**（按需）：`docs(plan): 厘清 resizeRow undo/redo rebuild 不对称`

### Task 1 — 序列化 round-trip：8 个结构 kind
- 扩 `UndoCommandSerialization.test.ts`，8 kind 样例 round-trip 深等（均为 number/string/数组，预期通过）。
- **commit**：`test(core): 扩展 undo 序列化守卫覆盖结构 resize/hide kind`

### Task 2 — `RowUndoHandler` + 隔离单元测试
- **测试**：`packages/core/tests/engine/row/RowUndoHandler.test.ts`，fake `RowUndoContext` 捕获调用。
  覆盖 4 个行 kind 的 undo/redo 调用序列与选区恢复（resizeRow 无选区）。
- **实现**：`engine/row/RowUndoHandler.ts`（+ `RowUndoContext`）。逻辑原样迁移。
- **commit**：`feat(core): 新增 RowUndoHandler（resize/hide 行结构）`

### Task 3 — `ColumnUndoHandler` + 隔离单元测试
- **测试**：`packages/core/tests/engine/column/ColumnUndoHandler.test.ts`，覆盖 4 个列 kind。
- **实现**：`engine/column/ColumnUndoHandler.ts`（+ `ColumnUndoContext`）。
- **commit**：`feat(core): 新增 ColumnUndoHandler（resize/hide 列结构）`

### Task 4 — 注册进 UndoReplay + 回归
- engine 构造追加两 handler + 注入两 context 实现；旧 switch 保留。
- 现有结构 resize/hide 的 undo/redo 集成测试保持绿。
- **commit**：`refactor(core): resize/hide 结构 undo 经 Row/Column UndoHandler`

## M3 验收
- 8 个单域结构 kind 的 undo/redo 经各自 handler；engine 旧 switch 这些分支不再被触达。
- 各 handler 有隔离单元测试；8 kind 有序列化 round-trip 测试。
- resizeRow rebuild 不对称已澄清（等价则抹平并记录）。
- 全量测试、4 包 typecheck、lint 全绿。

## 自检
- 范围：不碰复合 kind（fill/move/insert/delete）；不删旧 switch。
- STOP 点：resizeRow rebuild 不对称（Task 0）。
- 一致性：两 context 方法 ↔ 旧 switch 调用一一对应；resizeRow/resizeColumn **无**选区恢复，勿误加。
