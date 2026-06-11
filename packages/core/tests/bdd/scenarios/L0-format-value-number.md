---
id: core.L0.format-value-number
layer: L0
summary: formatValue number 描述符输出千分位和小数位
tags: [format]
status: draft
---

## User Story

作为 Core 使用者，当我给数值应用 `ValueFormat` 的 number 描述符时，我希望输出文本遵守千分位和小数位配置，以便渲染层只消费格式化后的可见文本。

## Given

- raw value 为 1234.5
- ValueFormat 为 `{ kind: 'number', decimals: 2 }`
- locale 为 `en-US`

## When

- 调用 `formatValue`

## Then

- 返回 `1,234.50`
