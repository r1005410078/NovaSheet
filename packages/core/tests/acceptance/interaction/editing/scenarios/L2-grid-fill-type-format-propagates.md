---
id: core.L2.grid-fill-type-format-propagates
layer: L2
summary: fill 跨列传播值序列、resolved scalar type 与 valueFormat
tags: [grid, fill, cell-type, format]
status: implemented
---

## User Story

作为 Core 使用者，当我把源格拖拽填充到不同类型的目标列时，我希望目标格不仅获得外推后的值，还获得源 tile 的 resolved 标量类型和 valueFormat，以便跨列 fill 的可观测行为对齐 Google 表格。

## Given

- 一个 headless engine
- A 列默认类型为 date，B 列默认类型为 text
- A1 / A2 是 date serial 序列，并带有 date valueFormat
- B 列目标格预先有不同的 cell type override 与 valueFormat

## When

- 从 A1:A2 向右或向下跨列 `commitFill`

## Then

- 目标值继续 date/number series
- 目标格 resolved type 等于源 tile 的 resolved type
- 目标格 valueFormat 等于源 tile 的 valueFormat
- 源 tile 无 valueFormat 的格会清除目标陈旧 valueFormat
- undo / redo 同时恢复值、type override 与 valueFormat
