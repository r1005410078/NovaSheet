---
id: core.L0.cell-type-store-raw-remap
layer: L0
summary: CellTypeStore 按 raw 坐标保存、清除、恢复与重映射类型覆盖
tags: [cell-type, store, remap]
status: draft
---

## User Story

作为 Core 维护者，当 cell 级类型覆盖跟随行列结构变化时，我希望 `CellTypeStore` 只按 raw 坐标保存稀疏覆盖，并能在 insert/delete/move 后正确 remap，以便 `resolveCellType` 始终返回数据行/列当前所在位置的语义类型。

## Given

- 一个空 `CellTypeStore`
- 三列 schema，列默认类型分别为 text / number / date
- raw cell `(1, 1)` 设置为 `date`，raw cell `(2, 2)` 设置为 `checkbox`

## When

- 读取显式覆盖和列默认 fallback
- snapshot 后 clear 一个 range，再 restore
- 插入、删除、移动 raw 行列

## Then

- 显式覆盖优先于列默认
- clear 后对应单元格回到列默认类型
- restore 后覆盖恢复
- insert/delete/move 后覆盖跟随 raw 坐标 remap，删除范围内的覆盖被移除
