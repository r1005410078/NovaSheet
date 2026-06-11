---
id: core.L2.grid-cols-move-callback
layer: L2
summary: Grid moveCols 移动列组、触发 onColumnsMoved，并支持 undo/redo
tags: [grid, columns, undo]
status: implemented
---

## User Story

作为 Grid facade 使用者，当我移动列组时，我希望 schema 顺序改变、`onColumnsMoved` 只在真实变化时触发，并且 history 可以撤销和重做。

## Given

- 一个 mounted Grid
- 4 列 mutable datasource
- 已注册 `onColumnsMoved`

## When

- 调用 `moveCols(['a'], null)`
- 调用 `undo()`
- 调用 `redo()`

## Then

- 移动后 schema 顺序为 `b,c,d,a`
- 回调收到 `{ fieldIds: ['a'], beforeFieldId: null }`
- undo / redo 还原并重放 schema 顺序
