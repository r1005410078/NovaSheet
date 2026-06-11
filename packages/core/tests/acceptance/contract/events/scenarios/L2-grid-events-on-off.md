---
id: core.L2.grid-events-on-off
layer: L2
summary: Grid event facade 支持 on、onUndo、onRedo 与 onFill 的取消订阅
tags: [grid, events]
status: implemented
---

## User Story

作为 Grid facade 使用者，当我订阅公开事件时，我希望事件可触发、可取消订阅，并且 history 事件通过公开 `undo` / `redo` 链路发出。

## Given

- 一个 mutable datasource
- 一个 mounted Grid

## When

- 用 `on('sortChange')` 订阅排序事件并取消订阅
- 用 `onUndo` / `onRedo` 订阅 history 事件
- 用 `onFill` 注册并取消 fill handler

## Then

- sort event 只在取消订阅前触发
- `undo()` / `redo()` 触发对应 history handler
- `onFill` 返回可调用的 unsubscribe
