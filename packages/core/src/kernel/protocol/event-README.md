# Domain Event

负责 engine 内部同步分发的领域事件。

`GridDomainEvent` 不是 Redux action，也不是全局 event bus。只有 coordinator 可以
dispatch，handler 在 engine 组装时固定注册，并按固定顺序同步执行。

## 使用规则

- 只覆盖高扇出的结构变化：row/column insert、delete、move、hide、unhide。
- 不为 scroll、resize、hover、edit draft、frame invalidation 等低价值内部状态建事件。
- handler 不允许再 dispatch 新事件；跨领域更新由 `GridEventPipeline` 固定顺序调用。
- event 可以用于 debug trace、monitoring、devtools timeline，但 observer 只能观察，不能 mutation。
- undo 仍以 `UndoCommand` 的 before/after 快照为准，`GridDomainEvent` 只辅助表达事实。
- `GridOperation` / `GridTransaction` 是可序列化协议层对象；`GridDomainEvent`
  是本地应用 operation 后产生的同步事实。

## 模块边界

| 文件 | 职责 |
| --- | --- |
| `GridDomainEvent.ts` | 定义已经发生的领域事实。 |
| `GridEventPipeline.ts` | 按固定顺序同步调用领域 event handler。 |

## 推荐流程

```txt
Command / GridTransaction
  -> domain plan
  -> coordinator 执行核心 mutation
  -> GridDomainEvent
  -> GridEventPipeline 同步分发给固定 handler
  -> undo push
  -> rebuild frame
```

