---
id: core.L2.grid-view-hide-sort-filter-compose
layer: L2
summary: hideRows 与 Sort/Filter 组合后的 view 行数
tags: [grid, view, hide, sort, filter]
status: implemented
---

## User Story

作为 Grid facade 使用者，当我同时隐藏行、排序并筛选时，我希望渲染帧中的 view 行数与单元格值反映三层组合结果。

## Given

- 一个 mounted Grid
- 4 行 number 列数据

## When

- `hideRows([0, 1])`
- `getSortLayer().setSpec({ direction: 'desc' })`
- `getFilterLayer().setSpec({ number-equals: 4 })`

## Then

- 帧内仅剩 1 行且值为 4
