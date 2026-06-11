---
id: core.L2.grid-fill-style-propagates
layer: L2
summary: 填充时源格填充色传播到目标格
tags: [grid, fill, format]
status: implemented
---

## User Story

作为 Core 使用者，当我向下填充带填充色的源格时，我希望 `getViewCellFormat` 在目标格反映相同 fillColor。

## Given

- headless engine
- 源格已设置 fillColor

## When

- 调用 `commitFill` 向下填充

## Then

- 目标格 `getViewCellFormat` 的 fillColor 与源格一致
