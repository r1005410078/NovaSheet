---
id: core.L0.coords-resolve-underlying-row
layer: L0
summary: view/raw 行坐标互转与 identity 回退
tags: [coords, pure]
status: implemented
---

## User Story

作为 Core 集成方，当我需要在 view 行与底层 raw 行之间转换时，我希望公开坐标 helper 优先使用 DataSource 装饰方法，并在无装饰时保持 identity。

## Given

- 无装饰 DataSource
- 带 `resolveUnderlyingRow` / `findViewRow` 的装饰 DataSource

## When

- 调用 `resolveUnderlyingRow` 与 `findViewRow`

## Then

- 无装饰时输入等于输出
- 有装饰时使用装饰映射
