---
id: core.L2.grid-data-theme-refresh
layer: L2
summary: Grid setData、setTheme 与 refresh 通过 backend frame 可观测
tags: [grid, lifecycle]
status: implemented
---

## User Story

作为 Grid facade 使用者，当我替换数据、主题或主动刷新时，我希望这些变化通过渲染后端收到的 `RenderFrame` 可观测，而不是依赖内部 engine 穿透。

## Given

- 一个 recording backend
- 一个初始 2 行数据源

## When

- 调用 `setData()` 替换为 1 行数据源
- 调用 `setTheme()` 替换主题 token
- 调用 `refresh()`

## Then

- backend 收到的 frame 使用新数据源
- backend 收到的 frame 使用新主题
- `refresh()` 触发新的 render frame
