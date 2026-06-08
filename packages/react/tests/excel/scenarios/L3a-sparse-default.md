---
id: excel.L3a.sparse-default
layer: L3a
summary: 无 data 时使用 SparseExcelDataSource
status: draft
---

## User Story

作为用户，当我打开空白工作簿且未传入数据源时，我希望看到可滚动的 A–Z × 1000 行稀疏工作区，以便像 Excel 一样从空表开始录入。

## Given
- 渲染 NovaExcel，不传 data

## When
- 挂载完成

## Then
- canvas 可见
- 内部使用 SparseExcelDataSource
