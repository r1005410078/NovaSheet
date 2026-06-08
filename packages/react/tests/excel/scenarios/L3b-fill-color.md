---
id: excel.L3b.fill-color
layer: L3b
summary: setFillColor 接线
tags: [toolbar]
status: draft
---

## User Story

作为表格用户，当选中要突出显示的单元格区域时，我想从工具栏选填色，以便快速套用背景色并触发引擎的 `setFillColor`。

## Given
- NovaExcel 已挂载，有选区

## When
- toolbar 设置填色

## Then
- grid.setFillColor 被调用
