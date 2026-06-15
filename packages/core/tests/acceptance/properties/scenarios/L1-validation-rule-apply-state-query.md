---
id: core.L1.validation-rule-apply-state-query
layer: L1
summary: Grid.setValidation 设置区间规则后 validateAll 触发校验，getValidationState 返回 invalid/null
tags: [validation, grid-api, engine]
status: implemented
---

## User Story

作为应用开发者，当我为单元格区间设置验证规则后，我希望通过 `Grid.validateAll()` 触发全量校验，并能通过 `Grid.getValidationState(row, col)` 查询每个单元格的校验状态，以便在 UI 层根据状态渲染错误指示器。

## Given

- 一个 `DefaultGridEngine`，数据源有 3 行 2 列（number 列 + text 列）
- number 列包含值：50, 150, -10

## When

- 通过 `Grid.setValidation` 为 number 列所有行设置 `{ type: 'number-range', options: { min: 0, max: 100 } }`
- 调用 `Grid.validateAll()` 并等待异步校验完成

## Then

- `getValidationState(0, 0)` 返回 null（50 在范围内，ok）
- `getValidationState(1, 0)` 返回 `{ status: 'invalid', message: '值必须在 0 到 100 之间' }`（150 超出）
- `getValidationState(2, 0)` 返回 `{ status: 'invalid', message: '值必须在 0 到 100 之间' }`（-10 超出）
- text 列（col 1）状态均为 null（无规则）
