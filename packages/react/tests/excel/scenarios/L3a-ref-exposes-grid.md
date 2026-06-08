---
id: excel.L3a.ref-exposes-grid
layer: L3a
summary: ref 暴露 grid 与 scrollToCell
status: draft
---

## User Story

作为业务开发者，当我持有 NovaExcel 的 ref 时，我希望能直接调用底层 Grid 与滚动 API，以便在外部按钮或自动化脚本里驱动表格。

## Given
- NovaExcel 已挂载，持有 ref

## When
- 读取 ref.current

## Then
- ref.current.grid 存在
- ref.current.scrollToCell 为函数
