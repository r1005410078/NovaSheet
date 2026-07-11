---
id: core.L2.grid-column-groups-bms-smoke
layer: L2
summary: BMS 形态冒烟：两层组 + 无组冻结指标列 + locateStack 等价流（scrollToGroup + selectGroup）
tags: [column-groups, smoke, frozen]
status: draft
---

## User Story

作为 SlickBmsTablePanel 的替换方，我需要：冻结的无组指标列 + 滚动区内两层组头（堆→簇），并用 `scrollToGroup + selectGroup` 复刻 `locateStack`（定位到堆并高亮整堆）。

## Given

- `fields`: `metric` + 8 个堆 × 各 4 簇列（共 33 列）
- `columnGroups`: `[{ fieldId: 'metric' }, { id: 'stack-1', label: '堆1', children: [4 簇] }, ..., { id: 'stack-8', ... }]`（单层组，depth = 1）
- `frozen: { leftCols: 1 }`（指标列冻结）；视口宽度容纳约 2 个堆

## When

- `scrollToGroup('stack-6', 'start')` 然后 `selectGroup('stack-6')`

## Then

- `getFrame()` 可见列包含 `stack-6` 首簇列且对齐视口滚动区左缘；冻结指标列始终可见
- `getSelection().selectedRange` 为覆盖 `stack-6` 全部 4 簇列的整列 range
- frame 中 `stack-6.selected === true`，其余组 `false`
- `leafTopRowByViewCol`：指标列为 `0`（叶头伸满全表头高），簇列为 `1`
- `viewport.headerHeight === groupHeaderRowHeight + leafHeaderHeight`
