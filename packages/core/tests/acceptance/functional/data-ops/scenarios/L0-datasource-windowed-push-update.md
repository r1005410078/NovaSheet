---
id: core.L0.datasource-windowed-push-update
layer: L0
summary: cells 推送对已驻留块立即生效，对 in-flight 块进 pending buffer 回放，对未加载块安全丢弃
tags: [datasource, windowed]
status: draft
---

## User Story

作为 Core 集成方，当订阅通道推送 `cells` 事件时，我希望已驻留块立即改值并广播一次 `rowsChanged`；正在拉取中的块把更新暂存，等拉取落地后回放（避免被拉取快照覆盖）；从未加载的块的推送被安全丢弃。

## Given

- `WindowedDataSource` 已建立 `provider.subscribe` 通道
- 块 A 已驻留（`loadRange` 已 resolve）
- 块 B 正在 in-flight（`loadRange` 尚未 resolve）
- 块 C 从未被拉取

## When

- 触发 `onEvent({ type: 'cells', updates: [块A内一格, 块B内一格, 块C内一格] })`
- 之后 resolve 块 B 的 `loadRange`（响应中该格的值是拉取发起时的旧值，不含推送值）

## Then

- 块 A 对应单元格立即变为推送值，触发一次 `rowsChanged`
- 块 B 落地前该格仍不可读（未加载）；`loadRange` resolve 后该格以推送值为准（pending buffer 回放覆盖了响应中的旧值）
- 块 C 对应单元格保持 `undefined`，且不产生任何可观测副作用（不 emit 事件、不建缓存条目）
