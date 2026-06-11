---
id: core.L0.cell-hit-test
layer: L0
summary: hitTestCell 与 computeCellRect 公开几何契约
tags: [interaction, pure]
status: implemented
---

## User Story

作为 Core 集成方，当我从 canvas 坐标命中单元格或查询 cell 矩形时，我希望公开 helper 忽略列头区域并返回 body cell 索引与 scrollHost 内矩形。

## Given

- 带 scroll 与 header 的 RenderFrame fixture

## When

- 在列头 y 坐标调用 `hitTestCell`
- 在 body 区域调用 `hitTestCell`
- 对 body cell 调用 `computeCellRect`

## Then

- 列头命中返回 null
- body 命中返回 row/col 索引
- computeCellRect 返回非 null 且 height/width 与轴尺寸一致
