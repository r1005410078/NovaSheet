---
id: core.L1.engine-rows-move-undo-redo
layer: L1
summary: DefaultGridEngine moveRows 移动连续行块并支持 undo/redo
tags: [engine, rows, undo]
status: implemented
---

## User Story

作为 Core engine 使用者，当我移动连续行块时，我希望 cell 值随行移动，并且 `undo()` / `redo()` 可以还原和重放移动。

## Given

- 一个 headless `DefaultGridEngine`
- 3 行 mutable datasource

## When

- 调用 `moveRows([1, 2], 0)`
- 调用 `undo()`
- 调用 `redo()`

## Then

- 移动后行顺序为 `r1,r2,r0`
- undo 后行顺序恢复为 `r0,r1,r2`
- redo 后再次为 `r1,r2,r0`
