---
id: excel.L3b.unmerge-cells
layer: L3b
summary: unmergeCells 接线
tags: [toolbar]
status: draft
---

## User Story

作为表格用户，当合并区域需要拆回独立单元格时，我想点工具栏取消合并，以便调用 `unmergeCells` 恢复可单独编辑的格子。

## Given
- NovaExcel 已挂载，合并选区

## When
- 点击 unmerge

## Then
- grid.unmergeCells 被调用
