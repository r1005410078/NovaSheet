---
id: core.L2.grid-lifecycle-refresh-destroy
layer: L2
summary: Grid refresh 与 destroy 生命周期可重复调用
tags: [grid, lifecycle]
status: draft
---

## User Story

作为集成方，当我用注入式后端挂载 Core `Grid` 时，我希望 `refresh()` 可触发门面刷新，`destroy()` 可重复调用且不抛错，以便 React StrictMode 或外部生命周期重复清理时保持安全。

## Given

- 使用 2x2 dense data 创建 `Grid`
- 注入 no-op RenderBackendFactory

## When

- 调用 `grid.refresh()`
- 连续调用两次 `grid.destroy()`

## Then

- 操作不抛错
- Grid 生命周期清理保持幂等
