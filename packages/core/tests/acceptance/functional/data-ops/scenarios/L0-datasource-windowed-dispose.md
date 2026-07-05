---
id: core.L0.datasource-windowed-dispose
layer: L0
summary: dispose 关闭订阅、abort 未完成请求，此后到达的事件与 hintWindow 均无副作用；dispose 幂等
tags: [datasource, windowed]
status: implemented
---

## User Story

作为 Core 集成方，当我调用 `dispose()` 时，我希望订阅通道关闭、所有未完成请求被 abort，且此后到达的任何 resolve、推送事件、`hintWindow` 调用均不再产生副作用；`dispose()` 本身可重复调用且不抛错。

## Given

- `WindowedDataSource` 有一个 in-flight 的 `loadRange` 请求
- 已建立的 `provider.subscribe` 通道，其 `WindowSubscription.close` 为可观测 spy

## When

- 调用 `dispose()`
- dispose 后 resolve 那个此前处于 in-flight 状态的 `loadRange` Promise
- dispose 后调用 `hintWindow`（新窗口）
- 再次调用 `dispose()`

## Then

- `WindowSubscription.close()` 恰好被调用一次
- dispose 时 in-flight 请求的 `AbortSignal.aborted` 变为 `true`
- dispose 后到达的 resolve 不写入缓存、不 emit 任何事件
- dispose 后的 `hintWindow` 调用不触发新的 `loadRange`
- 二次调用 `dispose()` 不抛出异常
