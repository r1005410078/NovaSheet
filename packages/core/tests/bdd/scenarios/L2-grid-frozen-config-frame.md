---
id: core.L2.grid-frozen-config-frame
layer: L2
summary: Grid setFrozen 通过 RenderFrame frozen regions 可观测
tags: [grid, layout, frozen]
status: implemented
---

## User Story

作为 Grid facade 使用者，当我设置冻结行列时，我希望渲染后端能在下一帧收到包含冻结区域的 frame。

## Given

- 一个 recording backend
- 一个多行多列数据源

## When

- 调用 `setFrozen({ topRows: 1, leftCols: 1, rightCols: 1 })`

## Then

- backend 收到的 frame 包含不止一个 viewport region
- 至少包含 main region 与 frozen region
