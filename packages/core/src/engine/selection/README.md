# Selection

负责 engine 空间里的选区状态与结构变化后的恢复规则：

- 封装 `SelectionModel`，向 engine 暴露 `SelectionState` 领域接口。
- 响应 row/column 结构事件，恢复 selected cells 和 ranges。
- `SelectionRules.ts` 只放纯 remap 算法。
- `DefaultGridEngine` 只负责传入 view/raw 映射函数或 visible fieldId 快照。

## 文件职责

- `SelectionState.ts`：选区领域富接口 + event handler 依赖的窄接口 `SelectionCommands`。
- `DefaultSelectionState.ts`：默认 selection 聚合根；内部持有 `SelectionModel` 并调用纯规则恢复选区。
- `SelectionRules.ts`：纯规则/算法，例如 view row 变化、row index map、visible fieldId 的 selection remap。
- `SelectionEventHandler.ts`：响应 row/column domain event，并调用 `SelectionCommands`。

## 边界

- 本目录不依赖 DOM、canvas、runtime 或 web 包。
- 本目录不得接收完整 `DefaultGridEngine`。
- `columnsMoved` 的可见列恢复依赖 engine 在 operation 前调用
  `captureVisibleFieldIdsBefore`，event 后由 handler 读取当前 visible fieldId 完成恢复。
- undo/edit/paste/fill 的写入后选区恢复仍位于 `DefaultGridEngine`，后续可随 undo replay 拆分。
