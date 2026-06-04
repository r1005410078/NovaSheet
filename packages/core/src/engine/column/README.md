# Column Structure

负责 engine 空间里的列结构变化规则：

- 插入、删除、隐藏、取消隐藏、移动列。
- 保留并重映射 field width。
- 检测列重排所需的 contiguous field group。
- 在 schema mutation 后同步 frozen-column config。

在这些规则被抽成狭窄输入/输出之前，`DefaultGridEngine` 继续持有 schema、axes
和 frozen state。

Internal column context 只应暴露 schema fields、column axes、hidden field ids，
以及 frozen config 回调。不要传入完整 `GridEngine`。

当前位于 `DefaultGridEngine` 中的候选方法：

- `captureRawColWidths`
- `buildColIndexMap`
- `isContiguousFieldGroup`
- `normalizeMoveCols`
- `syncFrozenAfterColInsert`
- `syncFrozenAfterColDelete`
- `restoreSelectionByVisibleFieldIds`
