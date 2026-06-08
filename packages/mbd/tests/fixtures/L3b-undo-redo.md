---
id: excel.L3b.undo-redo
layer: L3b
tags: [toolbar, undo]
summary: toolbar 点 undo 调用 grid.undo
status: draft
---

## User Story

作为表格用户，当我误改了单元格内容或套用了错误格式时，我想点击工具栏撤销按钮一步步回退，以便恢复上一步状态，而不必手动逐项改回。

撤销后，工具栏按钮的可用状态也应与当前能否继续撤销/重做保持一致，避免我以为还能撤销却按钮已灰掉。

## Given
- NovaExcel 已挂载，dense data

## When
- 点击 `[data-action-id="undo"]`

## Then
- `grid.undo` 被调用
- `onToolbarAction({ id: 'undo' })` 触发
