---
id: core.L2.grid-format-fill-color-set-clear
layer: L2
summary: Grid setFillColor 设置与清除填充色
tags: [grid, format]
status: implemented
---

## User Story

作为 Grid facade 使用者，当我设置或清除单元格填充色时，我希望 `getViewCellFormat` 能反映当前 view 坐标下的 fillColor。

## Given

- 一个 mounted Grid
- 单格选区

## When

- 调用 `setFillColor(range, '#fff2cc')`
- 再调用 `setFillColor(range, null)` 清除

## Then

- 设置后 `getViewCellFormat` 返回对应颜色
- 清除后 fillColor 消失
