---
id: excel.L3c.undo-button-state
layer: L3c
summary: undo 按钮启用/禁用
status: draft
---

## User Story

作为表格用户，当我做了可撤销的操作后，撤销按钮应变可点；撤销后若无可撤销项，按钮应变灰。

## Given
- NovaExcel 已挂载

## When
- 可撤销操作后点 undo

## Then
- undo 先 enabled 后按状态 disabled
