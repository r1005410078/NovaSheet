# Undo

负责 `UndoCommand` 的 undo/redo replay 规则。

本领域应在 row、column、selection remap helpers 已存在后再抽离。如果 replay
需要的 context 接近完整 `DefaultGridEngine`，就先把 replay 方法留在
`DefaultGridEngine` 中，继续抽更小的领域规则。

Internal undo context 可以组合更小的领域回调，但不应变成 `DefaultGridEngine`
每个 private field 的镜像。

当前位于 `DefaultGridEngine` 中的候选方法：

- `applyUndo`
- `applyRedo`
- `applyMoveColsCommand`
- `applyMoveRowsCommand`
- `applyInsertCols`
- `unapplyInsertCols`
- `applyDeleteCols`
- `unapplyDeleteCols`
