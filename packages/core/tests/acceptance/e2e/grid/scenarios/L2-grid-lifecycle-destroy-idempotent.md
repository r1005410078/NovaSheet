---
id: core.L2.grid-lifecycle-destroy-idempotent
layer: L2
summary: Grid destroy 可重复调用并清理宿主 DOM
tags: [grid, lifecycle]
status: implemented
---

## User Story

作为 Grid facade 使用者，当组件框架在 StrictMode 或卸载路径中重复调用 `destroy()` 时，我希望 Grid 完全幂等并清理它挂载的 DOM。

## Given

- 一个空 DOM container
- 一个使用 mock backend 的 `Grid`

## When

- 调用 `destroy()`
- 再次调用 `destroy()`

## Then

- 两次调用均不抛错
- container 中不再保留 Grid scroll host
- backend destroy 只需要保持安全可重复
