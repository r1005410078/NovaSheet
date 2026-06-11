---
id: core.L0.range-normalize-union-intersect
layer: L0
summary: 选区矩形 normalize、union、intersect 与 cell 命中
tags: [geometry, pure]
status: implemented
---

## User Story

作为 Core 集成方，当我处理反向拖拽选区或判断范围重叠时，我希望公开 range helper 提供稳定的归一化、并集与相交判定。

## Given

- 反向定义与正向定义的 CellRange fixture

## When

- 调用 `normalizeRange`、`unionRange`、`rangesIntersect`、`isCellInRange`

## Then

- 反向 range 归一化为最小/最大角
- union 取外接矩形
- 角接触视为相交
- 边界 cell 命中为 true
