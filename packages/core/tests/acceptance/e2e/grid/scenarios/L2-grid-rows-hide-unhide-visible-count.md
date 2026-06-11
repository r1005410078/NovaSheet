---
id: core.L2.grid-rows-hide-unhide-visible-count
layer: L2
summary: Grid hideRows 与 unhideRows 更新隐藏集合和 render frame row count
tags: [grid, rows, view]
status: implemented
---

## User Story

作为 Grid facade 使用者，当我隐藏或取消隐藏行时，我希望隐藏集合可通过 `getHiddenRows()` 读取，并且渲染后端收到的 frame 可见行数同步变化。

## Given

- 一个 mounted Grid
- 3 行 mutable datasource

## When

- 调用 `hideRows([1])`
- 调用 `unhideRows([1])`

## Then

- 隐藏后 `getHiddenRows()` 返回 `[1]`
- 隐藏后 render frame row count 减 1
- 取消隐藏后 hidden 集合清空，view row count 恢复
