# Selection

负责选区恢复与重映射规则：

- 在行/列结构变化后重映射 selected cells 和 ranges。
- 尽可能保留 whole-row 与 whole-column selections。
- 在 edit、paste、fill、insert、delete、move 命令后恢复选区。

本领域可以依赖 `SelectionModel` 类型，但应避免依赖完整 `DefaultGridEngine` 对象。

Internal selection context 应暴露当前 selection 和显式 row/column mapping 函数。
除非 remap 规则直接需要，否则不要读取 data、axes 或 stores。

当前位于 `DefaultGridEngine` 中的候选方法：

- `remapSelection`
- `remapCell`
- `remapRangeEndpoint`
- `remapSelectedRows`
- `restoreSelectionForWrites`
- `restoreSelectionForEdit`
