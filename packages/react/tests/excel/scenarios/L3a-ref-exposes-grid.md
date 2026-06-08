---
id: excel.L3a.ref-exposes-grid
layer: L3a
summary: ref 暴露 grid 与 scrollToCell
status: draft
---
## Given
- NovaExcel 已挂载，持有 ref

## When
- 读取 ref.current

## Then
- ref.current.grid 存在
- ref.current.scrollToCell 为函数
