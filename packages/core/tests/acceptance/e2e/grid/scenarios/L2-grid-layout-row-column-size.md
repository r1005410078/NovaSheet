---
id: core.L2.grid-layout-row-column-size
layer: L2
summary: Grid layout facade 更新单行、批量行、单列、批量列尺寸
tags: [grid, layout]
status: implemented
---

## User Story

作为 Grid facade 使用者，当我通过公开 API 调整行高或列宽时，我希望后端 frame 中的 axis 尺寸立即反映这些设置。

## Given

- 一个 recording backend
- 3 行 4 列数据

## When

- 调用 `setRowHeight(1, 44)`
- 调用 `setRowHeights([0, 2], 36)`
- 调用 `setColumnWidth('b', 140)`
- 调用 `setColumnWidths(['c', 'd'], 160)`

## Then

- rows axis 中 row 0 / 1 / 2 高度分别为 36 / 44 / 36
- cols axis 中 `b` / `c` / `d` 宽度分别为 140 / 160 / 160
