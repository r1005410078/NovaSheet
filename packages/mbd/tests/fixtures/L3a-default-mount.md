---
id: excel.L3a.default-mount
layer: L3a
summary: 默认挂载 excel/grid/toolbar/canvas
status: draft
---

## Given
- 渲染 `<NovaExcel data={denseFixture} />`

## When
- 挂载完成

## Then
- 存在 `data-novasheet-react-excel`、grid、toolbar、canvas
