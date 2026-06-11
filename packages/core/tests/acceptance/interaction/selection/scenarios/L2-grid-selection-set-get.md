---
id: core.L2.grid-selection-set-get
layer: L2
summary: Grid setSelection 与 getSelection 往返选区状态
tags: [grid, selection]
status: implemented
---

## User Story

作为 Grid facade 使用者，当我通过公开 API 设置选区后，我希望 `getSelection` 能返回一致的 active cell 与 selected range，以便外层 UI 同步高亮。

## Given

- 一个 mounted Grid
- 单格选区 fixture

## When

- 调用 `setSelection(selection)`
- 调用 `getSelection()`

## Then

- `activeCell` 与输入一致
- `selectedRange` 与输入一致
