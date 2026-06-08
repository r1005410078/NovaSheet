---
id: excel.L3b.borders
layer: L3b
summary: setBorders 接线
tags: [toolbar]
status: draft
---

## User Story

作为表格用户，当选中区域需要框线时，我想从工具栏选择边框预设，以便为选区设置边框样式并调用 `setBorders`。

## Given
- NovaExcel 已挂载，有选区

## When
- toolbar 设置边框

## Then
- grid.setBorders 被调用
