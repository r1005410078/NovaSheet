---
id: core.L2.grid-cell-type-edit-display
layer: L2
summary: cell type override 驱动显示默认格式与编辑解析
tags: [grid, cell-type, edit, format]
status: draft
---

## User Story

作为 Grid facade 使用者，当我把单个单元格覆盖为 date 或 number 时，我希望显示和编辑都按该单元格的 resolved type 工作，而不是继续使用列默认类型，以便同一列中的混合类型可被正确查看和修改。

## Given

- 一个 mounted Grid
- text 列中某格的 raw value 是 date serial
- date 列中某格的 raw value 是字符串非法日期

## When

- 对 text 列 serial 单元格调用 `setCellType(..., 'date')`
- 读取 `getFrame().formatCell` 输出
- 打开并提交该单元格的编辑 draft
- 对非法字符串单元格设置 `number` 或 `date` override

## Then

- date override 且无显式 valueFormat 时显示默认 `YYYY-MM-DD`
- 显式 valueFormat 优先于默认 date pattern
- 编辑器按 resolved type 格式化 draft 并解析提交值
- 非法现有值不被 `setCellType` 转换或清空，显示走 fallback
