---
id: excel.L3a.props-callbacks
layer: L3a
summary: onSelectionChange 等回调
status: draft
---

## User Story

作为集成方，当我监听 `onSelectionChange` 等 props 回调时，我希望用户或程序改变选区后回调能触发，以便同步外部状态栏或协同编辑逻辑。

## Given
- NovaExcel 传入 onSelectionChange

## When
- 触发选区变化

## Then
- onSelectionChange 被调用
