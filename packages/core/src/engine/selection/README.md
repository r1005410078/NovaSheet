# selection

Selection 领域负责选区状态机、键盘导航、结构变化后的 selection remap：

- 聚合根直接持有 `GridSelection` 状态，向命令处理器/事件处理器暴露 `SelectionState` 接口。
- engine/facade 的选区**写入**一律经 `SelectionCommandHandler`，不直连聚合 mutation（invariant #3）；读路径仍可直接 `SelectionState.getSelection()`。
- 响应 row/column 结构事件，恢复 selected cells 和 ranges。
- `SelectionNavigation.ts` 只放键盘导航纯规则（含 merge 感知步进）。
- `SelectionRules.ts` 只放结构 remap 纯规则。
- `DefaultGridEngine` 只负责传入 view/raw 映射函数、visible fieldId 快照，以及 view 坐标的 merge 查询。

## 文件职责

- `SelectionTypes.ts`：selection 公共类型。
- `DefaultSelectionState.ts`：selection 聚合根，直接持有 `GridSelection`。
- `SelectionCommandHandler.ts`：selection 领域命令处理器；engine 经此写选区，集中 merge 吸附。
- `SelectionNavigation.ts`：键盘导航纯规则；接受注入的 `SelectionMergeLookup` 做合并区边缘步进与落点吸附。
- `SelectionRules.ts`：结构变化后的 selection remap 纯规则。
- `SelectionState.ts`：聚合根富接口 + event handler 窄接口 `SelectionCommands`。
- `SelectionEventHandler.ts`：响应 row/column domain event。

## 边界

- 本目录不依赖 DOM、canvas、runtime 或 web 包。
- 本目录不得接收完整 `DefaultGridEngine`；merge 查询经窄接口 `SelectionMergeLookup` 注入，纯规则不依赖 `MergeStore`。
- `columnsMoved` 的可见列恢复依赖 engine 在 operation 前调用
  `captureVisibleFieldIdsBefore`，event 后由 handler 读取当前 visible fieldId 完成恢复。
- undo/edit/paste/fill 的写入后选区恢复仍位于 `DefaultGridEngine`，后续可随 undo replay 拆分。

## 已知限制

- 键盘导航的 merge 感知仅覆盖**非 extend**（方向键/Tab 整块跨越、落入合并区吸附为整块）；
  Shift+方向键的 extend 仍按索引推进，未做「扩展到完整覆盖合并块」的 Sheets 语义。
- `SelectionMergeLookup` 沿用 engine 既有约定：直接以 **view 坐标**查 `MergeStore`
  （sort/filter/隐藏列下 view≠raw 时的合并吸附为既有行为，本次未改坐标翻译）。
