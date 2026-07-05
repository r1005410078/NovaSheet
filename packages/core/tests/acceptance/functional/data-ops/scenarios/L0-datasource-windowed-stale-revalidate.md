---
id: core.L0.datasource-windowed-stale-revalidate
layer: L0
summary: 块离开订阅窗口超时后滚回，旧值先可读、后台重新拉取、新值到达后替换
tags: [datasource, windowed]
status: implemented
---

## User Story

作为 Core 集成方，当一个块离开订阅窗口超过 `staleAfterMs` 后再次进入预取窗口时，我希望旧值先被读取（不清空、不阻塞渲染），同时后台发起重新拉取；新响应落地后替换旧值并重绘。

## Given

- `staleAfterMs = 30000` 的 `WindowedDataSource`
- 块 A 已驻留且已完成拉取
- 可控虚拟时钟；块 A 离开订阅窗口后的新鲜时钟已超过 `staleAfterMs`

## When

- 调用 `hintWindow`，使块 A 重新进入预取窗口
- resolve 该次针对块 A 触发的新 `loadRange` 请求，返回新值

## Then

- 重新进入预取窗口的瞬间，`getCell` 仍返回块 A 的旧值（不被清空、不绘骨架）
- 重新进入触发了一次新的 `loadRange` 请求覆盖块 A
- 新请求 resolve 后 `getCell` 返回新值，且触发一次 `rowsChanged`
