---
id: excel.L3c.fill-reflects-toolbar
layer: L3c
summary: 填色后 toolbar 反映
status: draft
---

## User Story

作为表格用户，当我为选区填色后，我希望工具栏能显示当前填色状态，以便确认操作已生效。

## Given
- NovaExcel 有选区

## When
- 设置填色

## Then
- toolbar fillColor 更新
- onToolbarAction 触发
