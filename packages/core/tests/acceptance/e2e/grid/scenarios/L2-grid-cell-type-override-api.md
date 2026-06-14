---
id: core.L2.grid-cell-type-override-api
layer: L2
summary: Grid cell type override API 使用 view 坐标设置、清除并读取 resolved type
tags: [grid, cell-type, api]
status: draft
---

## User Story

作为 Grid facade 使用者，当我对选区设置单元格类型覆盖时，我希望 `setCellType` / `clearCellType` / `getCellType` 都使用 view 坐标，并在排序或隐藏后的视图中仍写到正确 raw 单元格，以便 UI 选区语义与用户看到的位置一致。

## Given

- 一个 mounted Grid
- schema 包含 text、number、date 列
- 当前 view 经过 sort/filter 或隐藏列组合后与 raw 顺序不同

## When

- 调用 `grid.setCellType(viewRange, 'date')`
- 调用 `grid.getCellType(viewRow, viewCol)`
- 调用 `grid.clearCellType(viewRange)`

## Then

- `getCellType` 返回 override 后的 resolved type
- clear 后返回该 view cell 所在列的默认类型 fallback
- view→raw 非连续 range 返回 `false` 且不写入 override
- undo / redo 能恢复 `setCellType` 与 `clearCellType` 的前后状态
