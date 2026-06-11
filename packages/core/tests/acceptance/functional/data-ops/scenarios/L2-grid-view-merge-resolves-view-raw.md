---
id: core.L2.grid-view-merge-resolves-view-raw
layer: L2
summary: 排序后 getViewMergeRegion 解析 view/raw 合并区
tags: [grid, view, merge]
status: implemented
---

## User Story

作为 Grid facade 使用者，当我合并相邻行后再排序时，我希望 `getViewMergeRegion` 在 view 坐标下返回 remap 后的合并矩形。

## Given

- 一个 mounted Grid
- 两行同 score 的合并区

## When

- `mergeCells` 后按 score 降序排序

## Then

- interior 格 `getViewMergeRegion` 返回连续 view range
