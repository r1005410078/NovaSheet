---
id: excel.L3c.external-on-undo-on-redo
layer: L3c
summary: onUndo/onRedo 与 toolbar 联动
status: draft
---

## User Story

作为集成方，我希望在外部监听 onUndo/onRedo 时，与工具栏撤销重做保持同一触发路径。

## Given
- 传入 onUndo/onRedo

## When
- toolbar 点 undo/redo

## Then
- onUndo/onRedo 各触发
