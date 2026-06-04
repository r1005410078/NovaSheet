# Operation / Transaction

负责描述可序列化、可传输、可回放的 engine 操作。

`GridOperation` 是顶层聚合协议：它描述“要应用什么原子变化”。具体领域 operation
优先放回对应领域目录，例如 row operation 位于 `engine/row/RowOperation.ts`。
`GridTransaction` 把一次用户动作中的多个 operation 组合成一个原子批次。应用
operation 后，engine 可以产生本地 `GridDomainEvent`，再由固定事件管线同步
selection、format、merge、undo 等领域。

## 使用规则

- Operation 应尽量使用稳定 identity：underlying row id、fieldId、raw range。
- Operation 必须可 JSON 序列化；不要包含 `Map`、函数、class 实例或 live engine state。
- Transaction 表示一次用户动作或远端同步批次，不等同于 undo command。
- `GridDomainEvent` 是本地应用 operation 后产生的事实，不直接作为协同协议。

## 推荐流程

```txt
Command / remote payload
  -> GridTransaction
  -> apply operations
  -> GridDomainEvent
  -> coordinator 同步相关领域
  -> undo / trace / render
```
