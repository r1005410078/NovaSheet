---
id: core.L2.grid-cols-hide-unhide-visible-count
layer: L2
summary: Grid hideCols 与 unhideCols 更新隐藏集合和 render frame schema
tags: [grid, columns, view]
status: implemented
---

## User Story

作为 Grid facade 使用者，当我隐藏或取消隐藏列时，我希望隐藏列集合可通过 `getHiddenCols()` 读取，并且渲染后端收到的 frame 可见字段同步变化。

## Given

- 一个 mounted Grid
- 4 列 mutable datasource

## When

- 调用 `hideCols(['b'])`
- 调用 `unhideCols(['b'])`

## Then

- 隐藏后 `getHiddenCols()` 返回 `['b']`
- 隐藏后 render frame schema 不包含 `b`
- 取消隐藏后 hidden 集合清空，render frame schema 恢复
