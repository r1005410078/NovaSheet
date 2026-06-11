---
id: core.L2.grid-selection-remap-after-insert-delete
layer: L2
summary: 行列结构变更后 Grid 选区自动 remap
tags: [grid, selection, structure]
status: implemented
---

## User Story

作为 Grid facade 使用者，当我插入或删除行后，我希望当前选区通过公开 `getSelection` 仍指向正确的 view 行，以便结构变更不会留下悬空选区。

## Given

- 一个 mounted Grid
- 多行 mutable datasource
- 已设置跨行选区

## When

- 在选区上方插入行
- 将选区设置为跨越待删行后调用 `deleteRows`

## Then

- 插入后选区行索引整体下移
- 删除部分覆盖行后选区收缩到存活行
