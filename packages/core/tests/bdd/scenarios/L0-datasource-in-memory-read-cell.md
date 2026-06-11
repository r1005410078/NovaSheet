---
id: core.L0.datasource-in-memory-read-cell
layer: L0
summary: InMemoryDataSource 读取单元格与 inclusive getRows
tags: [datasource]
status: draft
---

## User Story

作为 Core 使用者，当我用 `InMemoryDataSource` 承载行列数据时，我希望能同步读取单元格，并且 `getRows(start, end)` 的 end 为闭区间，以便与 `ChunkedAxis.getVisibleRange [first,last]` 的契约一致。

## Given

- 2x2 dense data
- 字段为 `name` / `score`

## When

- 读取第 0 行 `name`
- 读取第 1 行 `score`
- 调用 `getRows(0, 1)`

## Then

- 第 0 行 `name` 为 `Ada`
- 第 1 行 `score` 为 20
- `getRows(0, 1)` 返回 2 行
