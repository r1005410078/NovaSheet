---
id: excel.L3c.no-toolbar-grid-ref
layer: L3c
summary: 无 toolbar 时 ref 仍可用
status: draft
---

## User Story

作为开发者，当我隐藏工具栏只保留表格时，仍希望通过 ref 调用 scrollToCell 等 API。

## Given
- showToolbar: false

## When
- 调用 ref.scrollToCell

## Then
- 不报错
