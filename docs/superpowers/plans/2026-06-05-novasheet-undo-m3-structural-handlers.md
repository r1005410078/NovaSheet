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

## ⚠ STOP（已调查并定调 — 2026-06-05）

**结论：不等价，且行侧 redo 是 latent bug，范围比原标注广。**

- `rebuildViewAxis()`（`DefaultGridEngine.ts:1339`）= 新 axis + **重建 `frozen` 和 `viewport`**（保留
  viewport snapshot：headerHeight / rowHeaderWidth / size / scroll）。
- 行 redo 的裸式 `this.rowsAxis = this.rowStructure.getViewRowsAxis()` 只换 axis 引用，**不**重建
  frozen/viewport。而 `getViewRowsAxis()`（`row/DefaultRowStructure.ts:131`）**每次 new 一个
  `ChunkedAxis`**，故 redo 后 `this.frozen` / `this.viewport` 仍持旧 axis 引用 → `getFrame()` 读
  viewport，渲染仍是 redo 前的行高/可见性，直到下次任何 `rebuildViewAxis`。
- 范围：不止 `resizeRow`，**4 个行 kind 的 redo 全中**（resizeRow/hideRows/unhideRows/resizeRowsMulti，
  行 1158/1190/1195/1200）。列侧两边都 `rebuildViewColsAxis()`（全重建），对称且正确。
- 既有测试全绿因为没有断言「行 redo 后的 viewport 几何/frame」。

**决策（用户拍板 2026-06-05）：M3 内顺手修正。** `RowUndoContext` 只暴露单一 `rebuildRows()`
（= 全重建语义），行 undo/redo 都走它，与 undo 侧和列侧一致——修掉 latent bug。这是受控的行为变更，
故 **TDD 先加一条回归测试**：断言「行 resize/hide 的 redo 后 viewport（经 `getFrame`）反映新行高/可见性」，
看红 → 接 handler（redo 改全重建）→ 看绿。该测试随 Task 2 一并提交（与 RowUndoHandler 同 commit）。

> 注：insertRows/deleteRows redo 也用裸式（行 1169/1182），属 M4 复合范围，本里程碑不动；M4 迁移时
> 沿用相同「全重建」修正。

## 设计

- `RowUndoContext`：`setRowHeight(rowIndex, h)`、`setRowHeightsMulti(rowIds, h)`、
  `addHiddenRows(ids)`、`removeHiddenRows(ids)`、`rebuildRows()`、`restoreSelection(sel)`、
  `resolveDefaultRowHeight()`。
- `ColumnUndoContext`：`setColWidth(colIndex, w)`、`setColWidthById(id, w)`、
  `addHiddenCols(ids)`、`removeHiddenCols(ids)`、`rebuildCols()`、`restoreSelection(sel)`、
  `getDefaultColWidth()`。
- `RowUndoHandler`（住 `engine/row/`）、`ColumnUndoHandler`（住 `engine/column/`）。
- `row/registerRowUndo.ts` / `column/registerColumnUndo.ts`：各域 `registerXxxUndo(registry, ctx)`
  自注册，engine composition 各调一次；旧 switch 分支保留至 M4。**不动派发核心。**

## 任务（TDD，单任务单 commit）

### Task 0 — 解决 resizeRow rebuild 不对称（已触发，结论见上「⚠ STOP」）
- 调查完成：不等价，行侧 4 个 kind 的 redo 均缺 frozen/viewport 重建（latent bug）。
- 决策：M3 内顺手修正，`RowUndoContext` 单一 `rebuildRows()` 全重建，redo 回归测试守。
- **commit**：`docs(plan): 厘清行结构 undo/redo rebuild 不对称并定 M3 内修正`

### Task 1 — 序列化 round-trip：8 个结构 kind
- 扩 `UndoCommandSerialization.test.ts`，8 kind 样例 round-trip 深等（均为 number/string/数组，预期通过）。
- **commit**：`test(core): 扩展 undo 序列化守卫覆盖结构 resize/hide kind`

### Task 2 — `RowUndoHandler` + 隔离单元测试 + redo 回归测试
- **测试**：`packages/core/tests/engine/row/RowUndoHandler.test.ts`，fake `RowUndoContext` 捕获调用。
  覆盖 4 个行 kind 的 undo/redo 调用序列与选区恢复（resizeRow 无选区）；undo/redo 均调单一 `rebuildRows()`。
- **回归测试（修 latent bug）**：engine 级断言「行 resize/hide 的 redo 后 `getFrame()`/viewport 反映新
  行高或可见性」——先看红（旧裸式 redo 留陈旧 viewport），接 handler 后看绿。可放
  `DefaultGridEngine.*-undo` 既有结构 undo 测试文件或新增。
- **实现**：`engine/row/RowUndoHandler.ts`（+ `RowUndoContext`，单一 `rebuildRows()`）。
- **commit**：`feat(core): 新增 RowUndoHandler（resize/hide 行结构）并修 redo viewport 不重建`

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
