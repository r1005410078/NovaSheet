---
id: excel.L3a.default-mount
layer: L3a
summary: 默认挂载 excel/grid/toolbar/canvas
status: draft
---

## User Story

作为业务开发者，当我把 NovaExcel 放进页面时，我希望开箱即见完整的 Excel 壳层（表格、工具栏、画布），以便确认组件已正确挂载并可继续交互。

## Given
- 渲染 NovaExcel，dense data

## When
- 挂载完成

## Then
- 存在 data-novasheet-react-excel、grid、toolbar、canvas
