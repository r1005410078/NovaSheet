---
id: core.L0.datasource-in-memory-insert-delete-rows
layer: L0
summary: InMemoryDataSource 插入与删除行保持 rowCount、默认值和事件一致
tags: [datasource, rows]
status: implemented
---

## User Story

作为 Core 使用者，当我通过 `InMemoryDataSource` 修改行结构时，我希望插入行获得稳定的新 row ids，默认值按 schema 生成，并且删除行返回可用于 undo 的快照。

## Given

- 2 行 dense data
- `score` 字段有 `defaultValue: 0`
- 已订阅 datasource events

## When

- 在 row 1 前插入 2 行
- 删除原 row 0 和尾部原 row 1

## Then

- 插入返回 `[1, 2]`
- 新行 `score` 为 0
- 删除返回原始行快照
- datasource 发出行结构与 rowCount 事件
