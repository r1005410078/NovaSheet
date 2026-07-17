---
id: core.L2.grid-header-corner-select-all
layer: L2
summary: 表头角块在 headerCorner all 时点击全选
tags: [grid, selection, header]
status: draft
---

## User Story

作为 Grid facade 使用者，当我启用 `headerCorner: 'all'` 时，我希望点击行头与列表头交叉的非数据角块选中当前 view 的全部行列，以便获得电子表格标准的全选入口且不改变未启用方的既有角块行为。

## Given

- 一个 mounted Grid，行头与列表头均可见
- `selectionBehavior.headerCorner: 'all'`
- 对照组：另一 Grid 未配置 `headerCorner`（缺省 `none`）

## When

- pointerdown 点击行头宽度 × 表头总高的交叉角块

## Then

- 启用组选区为全部 view 行 × 全部 view 列的连续范围
- 对照组点击后选区不变（保持 no-op 现状）
