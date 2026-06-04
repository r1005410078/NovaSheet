# Layout

负责 engine 侧 layout 初始化与 rebuild 规则：

- 从 theme 派生默认行高和列宽。
- 构建 raw axis 与 view axis。
- 管理 frozen-region 与 viewport 生命周期。
- 应用 Excel 风格 row headers 等 sheet chrome 调整。
- 从 schema metadata 应用 field width。

本领域必须保持平台无关。可以使用 `ChunkedAxis`、`FrozenRegions`、`Viewport`、
`Theme` 和 `DataSource`，但不能依赖 DOM 或 canvas 类型。

Internal layout context 应拥有 axis/theme/viewport 输入，并返回 rebuilt layout state。
它不应直接调用 row、column、selection、undo 或 format mutation API。

当前位于 `DefaultGridEngine` 中的候选方法：

- `resolveDefaultRowHeight`
- `buildViewRowsAxis`
- `rebuildViewAxis`
- `buildViewColsAxis`
- `rebuildViewColsAxis`
- `resolveDefaultColWidth`
- `resolveFrozenConfig`
- `averageColWidth`
- `applySheetChrome`
- `applyFieldWidths`
