---
id: excel.L3c.currency-display
layer: L3c
summary: currency 列格式化配置生效且组件无错误
status: draft
---

## User Story

作为集成方，我希望为数据列配置 currency 值格式（`Field.format`）后，NovaExcel 能正常挂载并通过 `setValueFormat` 变更格式范围，而无任何运行时错误，以便确认 Phase 5-C currency 格式化链路在 React 层可用。

## Given
- schema 含一个 `format: { kind: 'currency', currency: 'CNY' }` 的数字列
- locale 设为 `zh-CN`

## When
- 挂载 NovaExcel
- 通过 `ref.grid.setValueFormat` 对该列第一行单元格再次设置 currency 格式

## Then
- 挂载后 `ref.grid` 可用（不为 null）
- `setValueFormat` 调用返回 `true`（格式写入成功）
- 全程无运行时抛出
