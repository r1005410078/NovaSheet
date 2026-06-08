---
id: excel.L3a.sparse-default
layer: L3a
summary: 无 data 时使用 SparseExcelDataSource
status: draft
---
## Given
- 渲染 NovaExcel，不传 data

## When
- 挂载完成

## Then
- canvas 可见
- 内部使用 SparseExcelDataSource
