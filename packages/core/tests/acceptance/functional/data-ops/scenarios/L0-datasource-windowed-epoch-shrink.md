---
id: core.L0.datasource-windowed-epoch-shrink
layer: L0
summary: 拉取响应捎带的 rowCount 收缩时整体软失效，rowCountChanged 广播且驻留块标 stale 优先重拉
tags: [datasource, windowed]
status: implemented
---

## User Story

作为 Core 集成方，当拉取响应携带的 `rowCount` 小于当前值（服务端删行导致行号整体收缩）时，我希望 `rowCount` 立即更新、全部驻留块标记为 stale 并优先重拉当前预取窗口；不清空当前显示（stale-while-revalidate），也不需要细粒度结构事件。

## Given

- `WindowedDataSource` 初始 `rowCount = 1000`，多个块已驻留（分布在预取窗口内外）
- 一次新的 `loadRange` 请求即将 resolve，其 `RangeSlice.rowCount = 800`（无 `version`，走弱 epoch 判定）

## When

- resolve 该请求，携带 `rowCount = 800`

## Then

- `getRowCount()` 立即返回 `800`
- 订阅的 listener 收到一次 `rowCountChanged(800)`
- 此前驻留的其他块（非本次落地块）被标记为 stale：此刻读取仍返回旧值（不清空），但会在下次进入预取窗口时触发重新拉取
- 当前预取窗口内的 stale 块被立即优先重新规划拉取（不等待用户再次滚动）
