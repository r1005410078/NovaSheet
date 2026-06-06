# Edit

单元格编辑写入门面；engine 经 `EditController` 委派，不直连 `CellEditModel`。

- `EditController.ts`：`beginCellEdit` / `updateDraft` / `commit` / `cancel` / `clearRange` 编排；undo 入栈 `editCell` / `clearRange`，`rowIndex` 为 **raw**。
- `CellEditModel.ts`：编辑会话状态（draft、active cell）。
- `registerCellUndo.ts`：`editCell` / `clearRange` undo handler。

`EditControllerContext`：`getData`、`resolveEditCell`（merge anchor）、`viewRowToRaw`、`pushUndo`。

`DefaultGridEngine` 保留：`beginCellEdit` 等 facade 方法一行 delegate；`getFrame` 读 `editController.getSession()`。
