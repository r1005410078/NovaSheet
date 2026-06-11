---
id: core.L2.grid-autofit-wrap-rows
layer: L2
summary: Grid autofitRows 使用 wrap 字段和 measurer 更新行高
tags: [grid, layout, autofit]
status: implemented
---

## User Story

作为 Grid facade 使用者，当列启用 wrap 且文本需要多行显示时，我希望 `autofitRows()` 通过公开 API 计算并写回行高。

## Given

- 一个包含 wrap 文本列的数据源
- 一个 backend measurer

## When

- 调用 `autofitRows({ rows: [0], maxHeight: 120 })`

## Then

- 返回结果中 `changedRows` 大于 0
- backend 下一帧中的 row 0 高度大于默认行高
