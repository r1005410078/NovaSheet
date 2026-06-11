---
id: core.L0.datasource-in-memory-insert-delete-fields
layer: L0
summary: InMemoryDataSource 插入与删除字段保持 schema 顺序和列快照
tags: [datasource, schema]
status: implemented
---

## User Story

作为 Core 使用者，当我修改 `InMemoryDataSource` 的字段结构时，我希望 schema 顺序立即可观测，已有行的新增字段为空值，删除字段会返回列值快照。

## Given

- 2 行 dense data
- 字段为 `name` / `score`

## When

- 在 `score` 前插入 `city`
- 删除 `score`

## Then

- schema 顺序为 `name` / `city` / `score`
- 已有行的 `city` 值为 `undefined`
- 删除 `score` 返回原字段定义和每行列值
