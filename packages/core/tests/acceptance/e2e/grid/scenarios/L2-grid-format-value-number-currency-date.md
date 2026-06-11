---
id: core.L2.grid-format-value-number-currency-date
layer: L2
summary: setValueFormat 经 Grid facade 持久化值格式描述符
tags: [grid, format]
status: implemented
---

## User Story

作为 Grid facade 使用者，当我为单元格设置值格式时，我希望 `getViewCellFormat` 持久化描述符。（`formatValue` 各 kind 的输出文本由 `core.L0.format-value-number` 黄金矩阵锁定，此场景不重复断言。）

## Given

- 一个 mounted Grid（含 number 列）
- percent ValueFormat 描述符

## When

- 调用 `setValueFormat`

## Then

- `getViewCellFormat` 含对应 valueFormat
