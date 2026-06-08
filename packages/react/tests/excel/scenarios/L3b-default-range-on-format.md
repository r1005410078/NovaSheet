---
id: excel.L3b.default-range-on-format
layer: L3b
summary: 无选区时默认选区后 format
tags: [toolbar]
status: draft
---

## User Story

作为表格用户，当我尚未明确框选却直接点填色或边框时，我希望组件先落到合理默认选区再执行格式操作，以免无反应或静默失败。

## Given
- NovaExcel 无显式选区

## When
- 执行 format 操作

## Then
- 使用默认选区后仍调用写 API
