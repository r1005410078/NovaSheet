---
id: core.L2.grid-scroll-row-cell
layer: L2
summary: Grid scrollToRow 与 scrollToCell 操作原生 scroll host
tags: [grid, scroll]
status: implemented
---

## User Story

作为 Grid facade 使用者，当我调用 `scrollToRow` 或 `scrollToCell` 时，我希望 Grid 只通过公开 facade 操作宿主滚动位置，并且越界输入保持 no-op。

## Given

- 一个尺寸固定的 DOM container
- 一个多行多列数据源

## When

- 调用 `scrollToRow(10, 'start')`
- 调用 `scrollToCell(5, 'score')`
- 调用越界 `scrollToRow(-1)`

## Then

- scroll host 的 `scrollTop` 大于 0
- `scrollToCell` 同时设置横向滚动
- 越界调用不抛错
