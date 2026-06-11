---
id: core.L2.grid-merge-format-survives-structure-undo
layer: L2
summary: 结构变更与 undo 后格式/合并 store 对齐
tags: [grid, merge, format, undo]
status: implemented
---

## User Story

作为 Core 使用者，当插入行或删除列触发结构变更后，我希望 undo/redo 能恢复格式与合并区到正确的 raw/view 坐标。

## Given

- headless engine
- 已设置 fillColor 或 merge region

## When

- 调用 `insertRows` 或 `deleteCols` 后 `undo()` / `redo()`

## Then

- 格式在 remap 后仍可通过 `getCellFormat` 命中
- 合并区在 undo 后恢复
