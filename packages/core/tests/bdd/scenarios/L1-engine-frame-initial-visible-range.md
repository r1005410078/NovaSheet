---
id: core.L1.engine-frame-initial-visible-range
layer: L1
summary: DefaultGridEngine 初始 frame 暴露可见行列和单元格
tags: [engine, frame]
status: draft
---

## User Story

作为 Core 维护者，当我用一个 2x2 数据源初始化 `DefaultGridEngine` 时，我希望 `getFrame()` 能暴露稳定的行列数量和首格数据，以便后续渲染后端和门面 runner 共享同一份引擎观测契约。

## Given

- 使用 2x2 dense data 初始化 `DefaultGridEngine`
- viewport 设置为 400 × 240

## When

- 调用 `engine.getFrame()`

## Then

- frame rowsAxis 行数为 2
- frame colsAxis 列数为 2
- view 坐标 (0,0) 的单元格值为 `Ada`
