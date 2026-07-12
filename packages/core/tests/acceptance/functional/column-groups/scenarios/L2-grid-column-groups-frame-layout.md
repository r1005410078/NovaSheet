---
id: core.L2.grid-column-groups-frame-layout
layer: L2
summary: 嵌套组树经 getFrame().columnGroupHeader 下发：depth/rows 区间/leafTopRowByViewCol/表头总高
tags: [column-groups, render-frame]
status: implemented
---

## User Story

作为渲染后端，我希望从 `getFrame()` 拿到解析好的组头布局（绘制级数据、view 坐标），不需要理解组树结构；表头总高与叶头行高在 viewport 中可读。

## Given

- `fields`: `[m, aXc1, aXc2, aYc1, bZc1]`（5 列）
- `columnGroups`（嵌套两层组）:
  - `{ fieldId: 'm' }`（无组列）
  - `{ id: 'a', label: 'A相', children: [{ id: 'aX', label: '堆X', children: [aXc1, aXc2] }, { id: 'aY', label: '堆Y', children: [aYc1] }] }`
  - `{ id: 'b', label: 'B相', children: [{ id: 'bZ', label: '堆Z', children: [bZc1] }] }`
- Theme 提供 `metrics.groupHeaderRowHeight` 与 `metrics.headerHeight`

## When

- 挂载 Grid 并读取 `getFrame()`

## Then

- `columnGroupHeader.depth === 2`（组层数 = 树最大组深度）
- `rows[0]`（顶层）: `a` 覆盖 view 列 `[1, 3]`，`b` 覆盖 `[4, 4]`；无组列 `m`（view 列 0）不产生任何组头 cell
- `rows[1]`: `aX` 覆盖 `[1, 2]`，`aY` 覆盖 `[3, 3]`，`bZ` 覆盖 `[4, 4]`
- `leafTopRowByViewCol === [0, 2, 2, 2, 2]`（无组列叶头从第 0 行向上伸满；组内列叶头在 2 行组头之下）
- `viewport.headerHeight === 2 × groupHeaderRowHeight + theme.metrics.headerHeight`（语义升级为总高）
- `viewport.leafHeaderHeight === theme.metrics.headerHeight`
