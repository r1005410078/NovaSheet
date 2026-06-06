# Clipboard (Paste)

粘贴 commit 写入门面；merge 守卫与 undo 坐标语义在 controller 内闭环。

- `PasteController.ts`：`commitPaste` 编排——view target→raw、merge 冲突跳过、`applyPaste` 写值、`paste` undo 入栈（before/after 为 raw row）。
- `ApplyPaste.ts`：纯函数粘贴写入与 `pasteTargetConflictsWithMerges`。
- `types.ts`：`PasteSkippedCell`（`reason: 'merge' | 'type'` 等）。

`PasteControllerContext`：`getMutableData`、`viewRangeToRaw`、`getMergeSnapshot`、`getSchema`、`viewRowToRaw`、`pushUndo`。

`DefaultGridEngine.commitPaste` 一行 delegate。
