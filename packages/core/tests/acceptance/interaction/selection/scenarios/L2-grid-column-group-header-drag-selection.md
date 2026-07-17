---
id: core.L2.grid-column-group-header-drag-selection
layer: L2
summary: 同层分组表头支持连续拖选且不依赖列换位配置
tags: [grid, selection, column-groups, drag]
status: draft
---

## User Story

作为带多级列表头的 Grid 使用者，我希望从一个分组表头横向拖到同层另一个分组表头时，选中两组之间全部连续叶列，以便在关闭列换位的只读监控表中连续高亮多个业务列组。

## Given

- 一个 mounted Grid，schema 为无组指标列 + `堆1 → 簇1/簇2` + `堆2 → 簇1/簇2`
- 无组指标列通过 `frozen: { leftCols: 1 }` 冻结在左侧
- `interactions: { reorder: false }`
- 每列宽度 100，三行数据

## When

- pointerdown 第一层组头 `堆1`
- pointermove 横向到第一层组头 `堆2`，期间 pointer 的 y 移入叶头行
- pointerup

## Then

- 最终 `selectedRange` 覆盖全部数据行与 `堆1`、`堆2` 的四个叶列
- 无组指标列不在选区内
- 组头拖选不改变 schema 字段顺序
- `reorder: false` 不阻止上述连续选择
