# Layout

负责 engine 侧 layout 初始化与 rebuild 规则：

- 从 theme 派生默认行高和列宽。
- 构建 raw axis 与 view axis。
- 管理 frozen-region 与 viewport 生命周期。
- 应用 Excel 风格 row headers 等 sheet chrome 调整。
- 从 schema metadata 应用 field width。

本领域必须保持平台无关。可以使用 `ChunkedAxis`、`FrozenRegions`、`Viewport`、
`Theme` 和 `DataSource`，但不能依赖 DOM 或 canvas 类型。

## 现状（已抽离至 `DefaultLayoutState` 聚合根）

`DefaultLayoutState`（富接口 `LayoutState` + 实现，`LayoutState.ts`）自持 view axes + frozen + viewport，
对称 row/column 内化。engine 改持 `private layout` 并全部委派，已删除原 layout 字段与方法。

- **两阶段生命周期**：构造后即可答默认值派生（`resolveDefaultRowHeight`/`averageColWidth`，供 row/column
  结构构造回调）；待结构产出 view axis 后调 `initView(rowsAxis, colsAxis)` 装配 frozen+viewport+chrome。
- **push 模型**：engine 从结构 pull `getViewRowsAxis()`/`getViewColsAxis()` 传入 `rebuildRows`/`rebuildCols`，
  本领域**不反调** row/column。
- **两种 rebuild 语义**：`initView` 用 theme header + 默认尺寸（首次用 options 冻结配置、后续用 live 配置）；
  `rebuildRows`/`rebuildCols` 经共享 `recreateViewportPreserving` 重建并**保留** viewport snapshot（消除原
  `rebuildViewAxis`/`rebuildViewColsAxis` 两份复制）。

已抽离的原 engine 方法：`resolveDefaultRowHeight`、`rebuildViewAxis`、`rebuildViewColsAxis`、
`resolveFrozenConfig`、`averageColWidth`、`applySheetChrome`、`syncFrozenAfterColInsert`、
`syncFrozenAfterColDelete`（后两者 → `remapFrozenAfterColInsert`/`remapFrozenAfterColDelete`，
`oldTotalCols`/`totalColsBefore` 改由 engine 调用点显式传入）。
