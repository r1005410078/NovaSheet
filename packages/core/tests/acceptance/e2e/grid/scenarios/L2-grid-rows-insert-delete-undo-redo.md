---
id: core.L2.grid-rows-insert-delete-undo-redo
layer: L2
summary: Grid 行插入、删除与 undo/redo 通过 facade 保持 rowCount 一致
tags: [grid, rows, undo]
status: implemented
---

## User Story

作为 Grid facade 使用者，当我插入或删除行后，我希望 `canUndo` / `canRedo` 和数据行数通过公开 API 保持一致，以便外层 UI 可以可靠更新撤销按钮状态。

## Given

- 一个 mounted Grid
- 3 行 mutable datasource

## When

- 调用 `insertRows(1, 1)`
- 调用 `undo()` 和 `redo()`
- 调用 `deleteRows([0])`
- 再调用 `undo()` 和 `redo()`

## Then

- row count 随结构变更增加或减少
- `canUndo` / `canRedo` 在每步后反映 history 状态
