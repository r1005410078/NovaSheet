---
id: core.L2.grid-cols-insert-delete-undo-redo
layer: L2
summary: Grid 列插入、删除与 undo/redo 通过 facade 保持 schema 一致
tags: [grid, columns, undo]
status: implemented
---

## User Story

作为 Grid facade 使用者，当我插入或删除列后，我希望 schema 字段数量和 `canUndo` / `canRedo` 通过公开 API 保持一致。

## Given

- 一个 mounted Grid
- 4 列 mutable datasource

## When

- 调用 `insertCols(1, 1)`
- 调用 `undo()` 和 `redo()`
- 调用 `deleteCols(['b'])`
- 再调用 `undo()` 和 `redo()`

## Then

- schema field count 随结构变更增加或减少
- `canUndo` / `canRedo` 在每步后反映 history 状态
