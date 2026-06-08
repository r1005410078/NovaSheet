---
id: excel.L3b.default-range-on-format
layer: L3b
summary: 无选区时默认选区后 format
tags: [toolbar]
status: draft
---
## Given
- NovaExcel 无显式选区

## When
- 执行 format 操作

## Then
- 使用默认选区后仍调用写 API
