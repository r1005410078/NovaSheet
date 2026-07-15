---
id: excel.L3a.custom-row-header-field
layer: L3a
summary: Excel 行头从数据字段显示自定义标签
tags: [excel, row-header]
status: implemented
---

## User Story

作为业务表格使用者，当每行数据包含设备编码时，我希望 Excel 最左侧行头显示该编码，以便排序、筛选或移动行后仍能识别对应业务记录。

## Given

- `NovaExcel` 接收包含 `deviceCode` 附加字段的数据
- `rowHeaderField="deviceCode"`
- `deviceCode` 不在 `schema.fields` 中

## When

- 组件挂载并完成首帧绘制

## Then

- 左侧行头显示 `设备-001` 和 `设备-002`
- `rowHeaderField` 不落到宿主 grid DOM attribute
