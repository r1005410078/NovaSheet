---
id: excel.L3b.merge-cells
layer: L3b
summary: mergeCells 接线
tags: [toolbar]
status: draft
---

## User Story

作为表格用户，当选中多块单元格需要合并标题或表头时，我想点工具栏合并，以便调用 `mergeCells` 形成单个合并区域。

## Given
- NovaExcel 已挂载，有选区

## When
- 点击 merge

## Then
- grid.mergeCells 被调用
