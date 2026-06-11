---
id: core.L1.engine-structural-event-stream
layer: L1
summary: 结构 mutation + undo/redo 的 DataSource 事件流与黄金文件一致
tags: [engine, event, golden]
status: implemented
---

## User Story

作为订阅 `DataSource` 的渲染器或缓存层，当引擎执行行/列结构变更及其 undo/redo 时，我希望发出的 `DataSourceEvent` 序列由一份已 review 的黄金流锁定，以便据此重建本地缓存的订阅方在事件契约漂移时立即得到信号。

## Given

- 每个 op 用独立 `DefaultGridEngine`（fresh `newFieldCounter`，事件流确定）
- 直接 `subscribe` 原始 `InMemoryDataSource` 捕获事件

## When

- 依次执行 insertRows / deleteRows / moveRows / insertCols / deleteCols / moveCols，每个后接 undo + redo

## Then

- 整段事件流与 `__goldens__/core.L1.engine-structural-event-stream.golden.txt` 一致：
  含 rowsInserted/Deleted/Moved、colsInserted/Deleted/Moved、rowCountChanged 与 undo 逆向事件（如 deleteRows 的 undo 逐行重建 + 逐字段 rowsChanged 突发、moveRows/moveCols 的逆向锚点）
