---
id: excel.L3b.value-format
layer: L3b
summary: value-format 菜单接线 grid.setValueFormat
tags: [toolbar, format]
status: draft
---

## User Story

作为表格用户，当某列是金额、比例或日期时，我想在工具栏选一个数字格式（货币 / 百分比 / 千分位 / 日期），让选区单元格按该格式显示，而底层数据不变，以便我既看得清又能继续排序与计算。

## Given

- NovaExcel 已挂载，有选区

## When

- 打开工具栏 value-format 菜单并选一个格式预设（如货币）

## Then

- `grid.setValueFormat` 被调用
- `onToolbarAction({ id: 'value-format', format })` 触发，`format` 为对应的 ValueFormat 描述符
