# Plan — Undo M4：复合命令 handler + 删除 engine 旧 switch

- 日期：2026-06-05
- Spec：`docs/superpowers/specs/2026-06-05-novasheet-undo-decomposition-serializable-commands.md`
- 依赖：**M1、M2、M3 完成**（cell/format/结构单域已迁，旧 switch 只剩复合分支）。
- 范围：复合（跨域）kind + 收尾删除旧 switch / dual-track fallback。
  - `fill`、`moveRows`、`moveCols`、`insertRows`、`deleteRows`、`insertCols`、`deleteCols`

## 为什么是复合（逐字对照旧 switch）

| kind | undo 触达 | redo 触达 |
| --- | --- | --- |
| `fill` | applyCellWrite(before) +（可选）restoreFormat(formatBefore) +（可选）restoreMerge(mergeBefore) + restoreSelectionForWrites(before, source) | after / formatAfter / mergeAfter / result |
| `moveRows` | `applyMoveRowsCommand(inverseRowIds, inverseBeforeRowId, selectionBefore)` + restoreFormat(before) + restoreMerge(before) | `applyMoveRowsCommand(rowIds, beforeRowId, selectionAfter)` + format/merge after |
| `moveCols` | `applyMoveColsCommand(fieldIds, inverseBeforeFieldId, selectionBefore)` + format/merge before | `applyMoveColsCommand(fieldIds, beforeFieldId, selectionAfter)` + format/merge after |
| `insertRows` | deleteRowsByIds + rebuildRows + format/merge/selection before（需 MutableDataSource.deleteRows） | insertBlankRows + rebuild + after |
| `deleteRows` | reinsertDeletedRows(snapshots, deletedHeights) + rebuild + before（需 insertRows） | deleteRowsByIds(按 originalUnderlyingRow 升序) + rebuild + after |
| `insertCols` | removeFieldsByIds + **frozen.setFrozen(frozenBefore)** + rebuildCols + selection/format/merge before | insertFieldsAt + setFrozen(frozenAfter) + rebuild + after |
| `deleteCols` | reinsertDeletedCols(snapshots, deletedWidths) + setFrozen(frozenBefore) + rebuild + selection/format/merge before | removeFieldsByIds(snapshots.field.id) + setFrozen(frozenAfter) + rebuild + after |

> 它们本质跨域：结构变更**必然**伴随 format/merge（被 remap 的 store）+ 选区恢复，列还含 frozen。
> 这是 spec 承认的「复合 application 用例」，不强塞进单一域。

## ⚠ 关键风险

1. **restore 次序敏感**：每个分支内 structural → format → merge → selection（或 fill 的 writes → format → merge → selection）
   的**顺序**是既有行为，逐 kind **原样保留**，不可重排。
2. **`applyMoveRowsCommand`/`applyMoveColsCommand`** 是 engine 现有私有 helper（结构 move + 选区），
   复杂。M4 **不重写**它们：作为能力面方法暴露（`ctx.replayMoveRows(...)`），engine 实现委派现有私有 helper。
3. **MutableDataSource 守卫**：insert/delete 分支有 `isMutableDataSource` + 方法存在性判断，
   下沉到能力面实现里（handler 只调 `ctx.*`，不自己判类型）。
4. **fill 的 format/merge 可选**：仅 `formatBefore/After`、`mergeBefore/After` 存在时才 restore（非连续散裂时缺省）。

## 设计

归属（复合 handler 住其「驱动域」，跨域能力经 context 注入）：

- `engine/row/RowStructureUndoHandler.ts`：`insertRows`、`deleteRows`、`moveRows`。
- `engine/column/ColumnStructureUndoHandler.ts`：`insertCols`、`deleteCols`、`moveCols`。
- `engine/undo/FillUndoHandler.ts`：`fill`（跨域且不属行/列结构，置于 undo 域）。

能力面（按 handler 收窄，engine 实现）：
- 行结构：`reinsertRows(snapshots, heights)`、`deleteRowsByIds(ids)`、`insertBlankRows(at, count)`、
  `replayMoveRows(rowIds, beforeRowId, selection)`、`rebuildRows()`、`restoreFormat`、`restoreMerge`、`restoreSelection`。
- 列结构：`reinsertCols(snapshots, widths)`、`removeFieldsByIds(ids)`、`insertFieldsAt(at, fields, widths)`、
  `replayMoveCols(fieldIds, beforeFieldId, selection)`、`restoreFrozen(config)`、`rebuildCols()`、
  `restoreFormat`、`restoreMerge`、`restoreSelection`。
- fill：`applyCellWrite`、`restoreSelectionForWrites`、`restoreFormat`、`restoreMerge`（后两者可选调用）。

## 任务（TDD，单任务单 commit）

### Task 1 — 序列化 round-trip：7 个复合 kind
- 扩 `UndoCommandSerialization.test.ts`。
- **STOP**：`deleteRows.snapshots: DeletedRowSnapshot[]`、`insertCols.newFields: Field[]`、
  `deleteCols.snapshots: RemovedFieldSnapshot[]`、`frozenBefore/After: FrozenConfig`、fill 的
  `FormatLayer[]/MergeRegion[]` —— 逐一核查是否纯 JSON 数据；遇 `Date`/类实例/函数 → **停并报告**，
  把归一化单列为发现，不在本 task 强行展开。
- **commit**：`test(core): 扩展 undo 序列化守卫覆盖复合 kind`

### Task 2 — `FillUndoHandler` + 单元测试
- fake context 验证 undo/redo 的 writes + 可选 format/merge + 选区次序。
- **commit**：`feat(core): 新增 FillUndoHandler（fill 复合 undo）`

### Task 3 — `RowStructureUndoHandler` + 单元测试
- 覆盖 insertRows/deleteRows/moveRows 的 undo/redo 调用序列与次序。
- **commit**：`feat(core): 新增 RowStructureUndoHandler（insert/delete/move 行）`

### Task 4 — `ColumnStructureUndoHandler` + 单元测试
- 覆盖 insertCols/deleteCols/moveCols，含 frozen restore。
- **commit**：`feat(core): 新增 ColumnStructureUndoHandler（insert/delete/move 列）`

### Task 5 — 注册 + 回归
- engine 构造把三 handler 追加进 `UndoReplay`，注入能力面实现（委派现有私有 helper）。
- 现有 fill/move/insert/delete 的 undo/redo 集成测试保持绿。
- **commit**：`refactor(core): 复合 undo 经 Fill/Row/Column 结构 handler`

### Task 6 — 删除 engine 旧 switch + dual-track fallback
- 删 `applyUndo`/`applyRedo` 两个 switch；`UndoReplay` 去掉 `fallback`（已无未迁 kind）。
- 删除迁移后变 dead 的 engine 私有方法（核查 `applyEditCellWrite` 等是否仍被能力面实现引用——
  **被引用则保留**）。
- **plan-risk**：删 fallback 后任何遗漏 kind 会运行期无声 no-op；先加一个「全 21 kind 都被某 handler `handles`」
  的断言测试（registry 完整性），再删 fallback。
- **commit**：`refactor(core): 删除 engine undo/redo 旧 switch，UndoReplay 全量接管`

## M4 验收
- 全部 21 kind 的 undo/redo 经各自 handler；engine 无 `applyUndo`/`applyRedo` switch。
- registry 完整性测试覆盖全 21 kind（无 handler 漏网）。
- 各复合 handler 有隔离单元测试；复合 kind 有序列化 round-trip 测试。
- engine 行数显著下降；无 dead code。
- 全量测试、4 包 typecheck、lint 全绿。

## 自检
- 次序敏感：每 kind restore 顺序原样保留（结构→format→merge→selection / writes→format→merge→selection）。
- move helper 不重写，经能力面委派。
- 删 fallback 前先有 registry 完整性测试兜底。
- 归属：复合 handler 住驱动域，跨域能力经 context 注入（评审确认不回流 engine 业务逻辑）。
