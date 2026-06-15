---
id: core.L1.validation-write-paths-trigger
layer: L1
summary: commitCellEdit / commitCellValue / commitPaste / commitFill / undo / redo 均触发受影响格重校验
tags: [validation, write-path, engine]
status: implemented
---

## User Story

作为应用开发者，我希望每次向单元格写入数据（编辑提交、粘贴、填充、undo/redo）后都自动触发受影响格的校验，以便不需要手动调用 `validateAll()` 就能看到实时的错误状态。

## Given

- 一个 `DefaultGridEngine`，设置了 `number-range` 规则（min: 0, max: 100）
- `ValidationScheduler` 的 `push` 方法被监听（通过 spy 或 mock）

## When

- `commitCellValue` 写入越界值
- `commitPaste` 粘贴包含越界值的区域
- `commitFill` 填充越界值
- `undo` 撤销上述操作

## Then

- 每次写入操作后，受影响的格被推入调度器（`push` 被调用）
- undo 后，同一批格再次被推入（以便重新校验撤销后的值）
- 写入合法值后，格的校验状态变为 null（ok）
