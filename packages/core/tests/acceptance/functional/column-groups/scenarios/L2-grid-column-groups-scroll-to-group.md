---
id: core.L2.grid-column-groups-scroll-to-group
layer: L2
summary: scrollToGroup 无条件按 align 把组首个可见叶列滚到位（与 scrollToRow/scrollToCell 语义一致）；不存在的 groupId no-op
tags: [column-groups, scroll]
status: implemented
---

## User Story

作为 Core 集成方，我调用 `scrollToGroup(groupId)` 时希望该组滚入视口（BMS `locateStack` 的定位半边），列宽和视口宽度变化时不需要自己算滚动坐标。

## Given

- 40 列：`m` + 组 `g1..g13` 每组 3 列（组头远超视口宽度）
- 视口宽度只容纳约 6 列；初始 `scrollX = 0`

## When / Then

1. `scrollToGroup('g10', 'start')`：`getFrame()` 可见列区间包含 `g10` 的首个可见叶列，且该列位于视口左缘（考虑冻结/行头偏移后 align start）
2. `scrollToGroup('g10', 'end')` 在 `g10` 已可见时**仍然滚动**——`scrollToGroup` 与 `scrollToRow`/`scrollToCell` 同族，均为无条件滚动到 align 位置，不做"已可见则不动"判断（那是 `ensureCellVisible` 的语义，`scrollToGroup` 不复用）；断言 `scrollX` 变为 align=end 对应的新位置，而非停留在原值
3. `scrollToGroup('ghost')`：no-op，`scrollX` 不变
4. `g10` 首叶列被 `hideCols` 后再调用：定位到 `g10` 的下一个可见叶列
