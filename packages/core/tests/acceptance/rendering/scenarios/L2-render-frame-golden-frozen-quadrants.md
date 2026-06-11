---
id: core.L2.render-frame-golden-frozen-quadrants
layer: L2
summary: 冻结行列后的 region 象限几何快照与黄金文件一致
tags: [rendering, golden, frozen, layout]
status: implemented
---

## User Story

作为引擎维护者，当 FrozenRegions 切分或 region 几何计算被改动时，我希望冻结象限的整帧快照与黄金文件比对，以便任何象限 rect/范围/偏移的漂移立即被发现（M3 冻结绘制接入前先锁住几何契约）。

## Given

- 一个 recording backend + 滚动数据源（50 行）
- `setFrozen({ topRows: 1, leftCols: 1 })`

## When

- flush 帧并 dump

## Then

- regions 段含 main 之外的冻结象限（topLeft/topCenter/middleLeft），rect 与 ranges 与黄金文件一致
