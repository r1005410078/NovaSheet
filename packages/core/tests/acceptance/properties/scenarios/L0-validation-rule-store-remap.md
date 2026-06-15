---
id: core.L0.validation-rule-store-remap
layer: L0
summary: ValidationRuleStore 按 raw 坐标保存区间规则并在行列结构变化后正确 remap
tags: [validation, store, remap]
status: implemented
---

## User Story

作为 Core 维护者，当数据行/列发生 insert/delete/move 时，我希望 `ValidationRuleStore` 按 raw 坐标保存稀疏区间规则，并能正确 remap 跟随数据行/列移动，以便校验规则始终作用于原始数据所在的行/列而非视图位置。

## Given

- 一个空 `ValidationRuleStore`
- raw cell `(2, 1)` 设置 `{ type: 'number-range', options: { min: 0, max: 100 } }` 规则

## When

- 读取 `(2, 1)` 的规则
- 在 row 0 插入 2 行（`remapAfterRowsInserted(0, 2)`）
- 删除 row 2（`remapAfterRowsDeleted([2])`）
- 在 col 0 插入 1 列（`remapAfterColsInserted(0, 1)`）

## Then

- 初始读取 `(2, 1)` 返回 `{ type: 'number-range' }` 规则
- 插入 2 行后，规则移动到 `(4, 1)`，原 `(2, 1)` 返回 null
- 删除 row 2 后，规则从 `(4, 1)` 移动到 `(3, 1)`
- 插入列后，规则从 `(3, 1)` 移动到 `(3, 2)`，原 `(3, 1)` 返回 null
