---
id: core.L0.datasource-windowed-scroll-prefetch
layer: L0
summary: 预取区域内滚动零请求，滚出后按块对齐合并拉取，离场 in-flight 请求被 abort
tags: [datasource, windowed]
status: draft
---

## User Story

作为 Core 集成方，当用户在预取区域内滚动时，我希望零网络请求；只有滚出预取区域才触发新的 `loadRange`，且请求按缓存块对齐、合并相邻块；已发出但已离场的请求应被 abort。

## Given

- `WindowedDataSource`，`preloadScreens = 2`、`blockRows = 128`、`blockCols = 16`
- 首个 `hintWindow` 已 resolve，预取区域内的块已全部驻留

## When

- 连续多次调用 `hintWindow`，窗口始终落在已驻留的预取区域内
- 之后调用 `hintWindow`，窗口显著超出当前预取区域（触发新块规划，其中一个新块的 `loadRange` 尚未 resolve）
- 紧接着再次调用 `hintWindow`，使刚发出请求的那个新块也退出预取区域

## Then

- 预取区域内的多次 `hintWindow` 调用均不触发新的 `loadRange`
- 超出后触发的 `loadRange` 请求与块规划对齐，同一行内水平相邻的待拉取块合并为一个矩形请求
- 退出预取区域后，对应 in-flight 请求的 `AbortSignal.aborted` 变为 `true`
