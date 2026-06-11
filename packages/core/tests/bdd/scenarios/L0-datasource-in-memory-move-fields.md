---
id: core.L0.datasource-in-memory-move-fields
layer: L0
summary: InMemoryDataSource 移动字段只改变 schema 顺序，cell 值按 fieldId 锚定
tags: [datasource, schema]
status: implemented
---

## User Story

作为 Core 使用者，当我重排列结构时，我希望字段组移动只改变 schema 顺序，不改写行对象中的 cell 值，以便数据始终按 fieldId 锚定。

## Given

- 1 行 dense data
- 字段为 `a` / `b` / `c` / `d`

## When

- 移动 `b,c` 到 `a` 前
- 再移动 `a,b` 到末尾；字段组按当前 schema 顺序移动

## Then

- 第一次 schema 顺序为 `b,c,a,d`
- `b` 单元格仍为原值
- 第二次 schema 顺序为 `c,d,b,a`
