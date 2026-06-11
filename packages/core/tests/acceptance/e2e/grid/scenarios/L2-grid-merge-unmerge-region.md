---
id: core.L2.grid-merge-unmerge-region
layer: L2
summary: Grid mergeCells / unmergeCells / getViewMergeRegion
tags: [grid, merge]
status: implemented
---

## User Story

作为 Grid facade 使用者，当我合并或取消合并单元格时，我希望 `getViewMergeRegion` 在 view 坐标下返回正确区域。

## Given

- 一个 mounted Grid
- 2×2 可合并选区

## When

- 调用 `mergeCells(range)`
- 在合并区内调用 `getViewMergeRegion`
- 调用 `unmergeCells(range)`

## Then

- 合并后 interior 格解析到同一 merge region
- 取消合并后 region 为 null
