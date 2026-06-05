# selection

Selection 领域负责选区状态机、键盘导航、结构变化后的 selection remap：

- 直接持有 `GridSelection` 状态，向 engine 暴露 `SelectionState` 领域接口。
- 响应 row/column 结构事件，恢复 selected cells 和 ranges。
- `SelectionNavigation.ts` 只放键盘导航纯规则。
- `SelectionRules.ts` 只放结构 remap 纯规则。
- `DefaultGridEngine` 只负责传入 view/raw 映射函数或 visible fieldId 快照。

## 文件职责

- `SelectionTypes.ts`：selection 公共类型。
- `DefaultSelectionState.ts`：selection 聚合根，直接持有 `GridSelection`。
- `SelectionNavigation.ts`：键盘导航纯规则。
- `SelectionRules.ts`：结构变化后的 selection remap 纯规则。
- `SelectionState.ts`：聚合根富接口 + event handler 窄接口 `SelectionCommands`。
- `SelectionEventHandler.ts`：响应 row/column domain event。

## 边界

- 本目录不依赖 DOM、canvas、runtime 或 web 包。
- 本目录不得接收完整 `DefaultGridEngine`。
- `columnsMoved` 的可见列恢复依赖 engine 在 operation 前调用
  `captureVisibleFieldIdsBefore`，event 后由 handler 读取当前 visible fieldId 完成恢复。
- undo/edit/paste/fill 的写入后选区恢复仍位于 `DefaultGridEngine`，后续可随 undo replay 拆分。
