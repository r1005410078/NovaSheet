---
id: core.L2.grid-view-format-uses-raw-keys
layer: L2
summary: 排序后 getViewCellFormat 仍按 raw 键命中格式
tags: [grid, view, format]
status: implemented
---

## User Story

作为 Grid facade 使用者，当我对某行设置填充色后再排序时，我希望 `getViewCellFormat` 在新 view 坐标下仍能命中同一底层行的格式。

## Given

- 一个 mounted Grid
- 已对 view row 0 设置 fillColor

## When

- 按 score 升序排序

## Then

- 原底层行在新 view 位置仍可读到 fillColor
- 原 view 位置不再误命中
