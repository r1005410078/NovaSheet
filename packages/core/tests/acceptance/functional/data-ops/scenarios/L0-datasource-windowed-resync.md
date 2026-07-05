---
id: core.L0.datasource-windowed-resync
layer: L0
summary: resync 事件 abort 全部 in-flight、清缓存、广播 reset 并重拉当前窗口，可携新 rowCount
tags: [datasource, windowed]
status: implemented
---

## User Story

作为 Core 集成方，当推送通道发出 `resync` 事件（如断线重连）时，我希望所有 in-flight 请求被 abort、缓存与 pending buffer 清空、广播一次 `reset`，并对当前预取窗口发起全新拉取；若 `resync` 携带 `rowCount`，一并更新并广播 `rowCountChanged`。

## Given

- `WindowedDataSource` 有若干驻留块，且至少一个 `loadRange` 请求处于 in-flight
- 已建立 `provider.subscribe` 通道

## When

- 触发 `onEvent({ type: 'resync', rowCount: 500 })`

## Then

- in-flight 请求的 `AbortSignal.aborted` 变为 `true`
- 缓存被清空：resync 后立即读取此前驻留块的单元格返回 `undefined`
- `getRowCount()` 返回 `500`，订阅的 listener 收到一次 `rowCountChanged(500)`
- 订阅的 listener 收到一次 `reset`
- 当前预取窗口触发一次新的 `loadRange` 请求
