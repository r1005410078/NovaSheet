---
id: core.L0.datasource-windowed-subscription-follow
layer: L0
summary: 滚动停稳超过防抖时限后 setWindow 收到最新可视窗口，连续滚动期间不触发
tags: [datasource, windowed]
status: implemented
---

## User Story

作为 Core 集成方，当用户滚动停稳超过 `subscribeDebounceMs` 后，我希望 `WindowSubscription.setWindow` 被调用且参数是最新的可视窗口（而非预取窗口）；连续滚动期间不应频繁调用，避免刷屏式订阅切换。

## Given

- `subscribeDebounceMs = 150` 的 `WindowedDataSource`
- 可控的虚拟时钟
- `WindowSubscription.setWindow` 为可观测 spy

## When

- 在 150ms 内连续多次调用 `hintWindow`（模拟连续滚动），每次窗口不同
- 停止调用后，虚拟时钟推进超过 150ms

## Then

- 连续滚动期间 `setWindow` 不被调用
- 停稳超时后 `setWindow` 恰好调用一次
- 该次调用参数为最后一次 `hintWindow` 的可视窗口本身，不含 `preloadScreens` 外扩
