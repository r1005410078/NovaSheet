---
id: excel.L3b.selection-sync
layer: L3b
summary: 选区变化同步 toolbar state
tags: [toolbar]
status: draft
---

## User Story

作为表格用户，当我点击不同单元格时，我希望工具栏上的填色、换行等状态随当前格格式更新，以便一眼看出正在编辑的单元格样式。

## Given
- NovaExcel 已挂载

## When
- 改变选区

## Then
- onSelectionChange 触发
- toolbar state 同步
