---
id: core.L2.grid-header-menu-row-actions
layer: L2
summary: Grid row header menu 暴露结构项并能执行 insert-above
tags: [grid, rows, menu]
status: implemented
---

## User Story

作为 Grid facade 使用者，当我从行头菜单读取和执行动作时，我希望菜单项与当前选区匹配，并且动作只通过公开 `Grid` API 修改行结构。

## Given

- 一个 mounted Grid
- 选中第 1 行

## When

- 调用 `getRowHeaderContextMenuItems({ targetRowIndex: 1 })`
- 调用 `invokeRowHeaderContextMenuAction('insert-above', { targetRowIndex: 1 })`

## Then

- 菜单包含 insert/delete/hide/resize 结构项
- 执行 insert-above 后 datasource row count 增加
