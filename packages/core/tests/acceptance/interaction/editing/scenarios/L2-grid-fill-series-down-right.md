---
id: core.L2.grid-fill-series-down-right
layer: L2
summary: 填充柄目标计算、序列写入与 engine commitFill
tags: [grid, fill]
status: implemented
---

## User Story

作为 Core 使用者，当我向下填充数字序列时，我希望 `computeFillTarget` / `computeFillWrites` 与 `commitFill` 协同写出递增值。

## Given

- 含 number 列的 datasource
- 两行源选区与向下 fill 目标

## When

- 计算 fill target 与 writes
- 调用 `DefaultGridEngine.commitFill`

## Then

- fill target 方向为 down
- 目标格写入递增值
