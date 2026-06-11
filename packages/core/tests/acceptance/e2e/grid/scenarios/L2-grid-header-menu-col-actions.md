---
id: core.L2.grid-header-menu-col-actions
layer: L2
summary: Grid column header menu 暴露结构项并能执行 insert-col-left
tags: [grid, columns, menu]
status: implemented
---

## User Story

作为 Grid facade 使用者，当我从列头菜单读取和执行动作时，我希望菜单项与当前选区匹配，并且动作只通过公开 `Grid` API 修改列结构。

## Given

- 一个 mounted Grid
- 选中第 1 列

## When

- 调用 `getColumnHeaderContextMenuItems({ targetColIndex: 1 })`
- 调用 `invokeColumnHeaderContextMenuAction('insert-col-left', { targetColIndex: 1 })`

## Then

- 菜单包含 insert/delete/hide/resize 结构项
- 执行 insert-col-left 后 datasource schema field count 增加
