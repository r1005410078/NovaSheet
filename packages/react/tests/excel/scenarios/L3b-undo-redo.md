---
id: excel.L3b.undo-redo
layer: L3b
summary: undo/redo 接线
tags: [toolbar]
status: draft
---

## User Story

作为表格用户，当我误改了内容或格式时，我想点工具栏撤销/重做，让 NovaExcel 调用底层 Grid 的 undo/redo，以便一步回退或恢复，并收到 `onToolbarAction` 通知。

## Given
- NovaExcel 已挂载，spy grid.undo/redo

## When
- 点击 undo / redo

## Then
- grid.undo / grid.redo 被调用
- onToolbarAction 触发
