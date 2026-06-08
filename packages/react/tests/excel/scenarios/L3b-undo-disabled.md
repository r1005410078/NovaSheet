---
id: excel.L3b.undo-disabled
layer: L3b
summary: canUndo false 时 undo disabled
tags: [toolbar]
status: draft
---

## User Story

作为表格用户，在没有任何可撤销操作时，我希望撤销按钮呈禁用态，以免误点无效操作并混淆当前编辑历史。

## Given
- grid.canUndo() 为 false

## When
- 读取 toolbar state

## Then
- undo 在 disabledActionIds
