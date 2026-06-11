---
id: core.L0.geometry-viewport
layer: L0
summary: Viewport snapshot 反映滚动与可见区域
tags: [geometry, pure]
status: implemented
---

## User Story

作为 Core 集成方，当我查询 viewport 快照时，我希望 main 区域的 rowRange 随 scrollY 变化。

## Given

- ChunkedAxis 行/列轴
- Viewport 已设置尺寸与 header

## When

- 设置 `scrollY` 后调用 `snapshot()`

## Then

- main 区域 `rowRange[0]` 随滚动下移
