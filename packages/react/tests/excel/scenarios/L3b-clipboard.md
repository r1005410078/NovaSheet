---
id: excel.L3b.clipboard
layer: L3b
summary: copy/cut/paste 接线
tags: [toolbar]
status: draft
---

## User Story

作为表格用户，当选中单元格后我想用工具栏复制、剪切或粘贴，以便在表内或与应用剪贴板之间搬运数据，而无需自己调用 Grid API。

## Given
- NovaExcel 已挂载，有选区

## When
- 点击 copy / cut / paste

## Then
- grid.copy / cut / paste 被调用
