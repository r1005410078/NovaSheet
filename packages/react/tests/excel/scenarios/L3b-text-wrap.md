---
id: excel.L3b.text-wrap
layer: L3b
summary: setTextWrap 循环接线
tags: [toolbar]
status: draft
---

## User Story

作为表格用户，当单元格文字过长时，我想在工具栏循环切换溢出/换行/裁剪，以便控制文本在格内的显示方式并调用 `setTextWrap`。

## Given
- NovaExcel 已挂载，有选区

## When
- 循环切换 text-wrap

## Then
- grid.setTextWrap 被调用
