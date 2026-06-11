---
id: core.L0.datasource-in-memory-get-rows-inclusive
layer: L0
summary: InMemoryDataSource getRows 使用闭区间并钳制越界范围
tags: [datasource]
status: implemented
---

## User Story

作为 Core 使用者，当我按可见区间读取内存数据源时，我希望 `getRows(start, end)` 的 `end` 是闭区间，并且越界范围会被安全钳制，以便调用方可以直接传入 visible range。

## Given

- 3 行 dense data

## When

- 调用 `getRows(0, 2)`
- 调用 `getRows(-5, 20)`
- 调用 `getRows(2, 1)`

## Then

- `getRows(0, 2)` 返回 3 行
- 越界读取被钳制为全部 3 行
- 空区间返回空数组
