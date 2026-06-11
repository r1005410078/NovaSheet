---
id: core.L2.grid-view-sort-ascending-descending
layer: L2
summary: Grid SortLayer 升序/降序重排 view 行
tags: [grid, view, sort]
status: implemented
---

## User Story

作为 Grid facade 使用者，当我通过 `getSortLayer().setSpec` 排序时，我希望 `getViewPipeline().getComposed()` 按 score 升序或降序返回行。

## Given

- 一个 mounted Grid
- 多行含 number 列的数据源

## When

- 设置 `direction: 'asc'` 后读取 composed 数据
- 切换为 `direction: 'desc'`

## Then

- 升序 score 为 `[1, 2, 3]`
- 降序 score 为 `[3, 2, 1]`
