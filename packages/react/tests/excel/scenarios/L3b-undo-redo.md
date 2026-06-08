---
id: excel.L3b.undo-redo
layer: L3b
summary: undo/redo 接线
tags: [toolbar]
status: draft
---
## Given
- NovaExcel 已挂载，spy grid.undo/redo

## When
- 点击 undo / redo

## Then
- grid.undo / grid.redo 被调用
- onToolbarAction 触发
