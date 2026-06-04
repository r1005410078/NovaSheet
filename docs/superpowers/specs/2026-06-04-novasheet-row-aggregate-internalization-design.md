# RowAggregate 内化设计：消去 RowStructureContext

- 日期：2026-06-04
- 状态：设计已确认，待 writing-plans
- 作者：rongtaosheng + Claude

## 背景与问题

`packages/core/src/engine/row/DefaultRowStructure.ts` 被定位为行领域的"聚合根"，但实现单薄：它操作的三块状态都不归它所有，而由 `DefaultGridEngine` 持有，通过 9 个方法的 `RowStructureContext` 端口注入。聚合根因此只能**转发**——状态在别人手里。

`RowStructureContext` 当前暴露：

```
getRowCount()
insertRows(at, count)        // → rawData.insertRows
deleteRows(rowIds)           // → rawData.deleteRows
moveRows(rowIds, beforeRowId)// → rawData.moveRows
getRawRowsAxis()             // → rawRowsAxis (engine 字段)
setRawRowsAxis(axis)
getHiddenRows()              // → hideRowsLayer
setHiddenRows(rowIds)
resolveDefaultRowHeight()    // → theme/option
```

这 9 个成员混了两类东西：

1. **应当内化的 row 域状态**：`rawRowsAxis`（行高轴）、`HideRowsLayer`（隐藏集 + 视图包装）。
2. **真实外部依赖**：raw `MutableDataSource` 的 `insertRows/deleteRows/moveRows/getRowCount`（cell/column 域共享的单一真相源，聚合根不能独占）、以及默认行高解析（依赖 theme + option，逻辑属于 engine）。

## 目标

把 row 域**状态的所有权**迁入聚合根，使其成为持有行布局状态的富模型，彻底删除 `RowStructureContext`。仅保留两项真实依赖（raw 数据源引用 + 默认行高解析函数），经构造/`rebuild` 注入。

接受一次性彻底重构，允许 core 内部及其单测在迁移过程中暂时不可用；落地后行为等价。

### 非目标

- 不改 Sort/Filter（它们不在 engine 的数据链上，由 web 层 `Grid`/runtime 在数据源进入 engine 前包装）。
- 不改公共 `Grid` facade 与 web 包：engine 对外方法签名不变。
- 不动 frozen/viewport 组装、列隐藏（`VisibleColumnsDataSource`/`hiddenColIds`）、`resolveDefaultRowHeight` 的 theme+option 解析来源。
- 不引入 selection/undo 域拆分（沿用现状：engine 编排）。

## 现状关键事实（实现约束）

- 数据链：`rawData → hideRowsLayer.wrap(rawData) = rowViewData → wrapViewData(rowViewData) = data`。`wrapViewData` 用 `VisibleColumnsDataSource` 叠加列隐藏。
- 视图行轴：`buildViewRowsAxis()` 从 `rawRowsAxis` 按 `hideRowsLayer.getVisibleRows()` 顺序派生；`rebuildViewAxis()` 在派生后重建 frozen/viewport 引用。
- engine 内**唯一**作用于行的视图变换是 `HideRowsLayer`（+ 列隐藏），Sort/Filter 不在此路径。
- 行 undo/redo 逆操作目前在 `DefaultGridEngine` 的 `applyUndo/applyRedo` switch 中**手写**，直接戳 `rawRowsAxis`/`rawData`/`hideRowsLayer`，并穿插 `formatStore/mergeStore.restore`、`selection.setSelection`、`rebuildViewAxis`。涉及分支：`resizeRow`、`resizeRowsMulti`、`insertRows`、`deleteRows`、`hideRows`、`unhideRows`、`moveRows`。
- `HideRowsLayer` 是 `ViewLayer`（与 Sort/Filter 同协议），其 `_handleUpstreamEvent` 在 upstream 行增删/reset 时重映隐藏集。内化后此行为不变，仅持有者从 engine 改为聚合根。

## 设计

### 模块

新增/改造 `RowAggregate`（替代 `DefaultRowStructure` + `RowStructureContext`），位于 `packages/core/src/engine/row/`，仍 `implements RowStructure`（接口扩富）。`RowStructure.ts` 中的 `RowStructureContext` 删除；`RowStructure` 接口扩展为富契约。

命名：保留类名 `DefaultRowStructure` 还是更名 `RowAggregate` 在 writing-plans 阶段定；倾向保留 `DefaultRowStructure` 以缩小 diff，本文用 "RowAggregate" 指代该聚合根的角色。

### 所有权迁移

| 状态 | 现在 | 重构后 |
|---|---|---|
| `rawRowsAxis`（行高轴，按 underlying index） | `DefaultGridEngine` 字段 | RowAggregate 私有 |
| `HideRowsLayer` + hidden set | `DefaultGridEngine` 字段 | RowAggregate 私有 |
| `rowViewData`（行隐藏视图源） | engine 派生字段 | RowAggregate 派生，`getRowViewData()` 暴露 |
| view rows axis | engine `buildViewRowsAxis()` | RowAggregate `getViewRowsAxis()` |

### 注入依赖（取代 9 方法 context）

经构造与 `rebuild(rawData, resolveDefaultRowHeight)` 注入：

- raw `MutableDataSource` 引用 —— 单一真相源，聚合根只持引用，用于 `insertRows/deleteRows/moveRows/getRowCount` 与重读 cell 快照恢复。
- `resolveDefaultRowHeight: () => number` —— 依赖 theme/option，逻辑留 engine，作为函数注入。

聚合根**不**持有 `data`（列过滤后的视图源），也不持有 frozen/viewport。

### RowAggregate 接口（富）

| 类别 | 方法 | 说明 |
|---|---|---|
| 结构正向 | `insertRows / deleteRows / hideRows / unhideRows / moveRows` | 返回 domain event（签名与现状一致） |
| 逆变迁 | `reinsertDeletedRows(snapshots, heights)` | delete 的逆：按原 underlying 位置回插并恢复 cell（含 `updateCellByUnderlyingRow` 优先逻辑） |
| 逆变迁 | `deleteRowsByIds(ids)` | insert 的逆 / delete 的 redo：按 underlying id 删除 + axis `deleteRange` |
| 逆变迁 | `insertBlankRows(at, count)` | insert 的 redo：插空行 + axis `insertRange` |
| 逆变迁 | `addHidden(ids) / removeHidden(ids)` | hide/unhide 的逆与 redo |
| 逆变迁 | `applyMove(rowIds, beforeRowId)` | moveRows 的正/逆复用 |
| 行高 | `setRowHeight(underlyingRow, h) / getRowHeight(underlyingRow)` | |
| 行高 | `setRowHeightsMulti(ids, h)` | resizeRowsMulti 用 |
| 行高 | `setDefaultRowHeight(h)` | theme 变更时同步 axis 默认值 |
| 派生读 | `getViewRowsAxis()` | engine 据此重建 frozen/viewport |
| 派生读 | `getRowViewData()` | engine 据此 `wrapViewData` 叠加列隐藏 |
| 派生读 | `getHiddenRows() / getCollapsedGaps()` | |
| 生命周期 | `rebuild(rawData, resolveDefaultRowHeight)` | setData/rebuildData 调用，重建 axis + HideRowsLayer wrap |

逆变迁方法只做 **row raw 状态**的变迁（axis + data 行增删 + hidden 集），**不**触碰 format/merge/selection/frozen/viewport——这些跨域编排留在 engine。

### engine 侧改动边界

- 删除字段 `rawRowsAxis`、`hideRowsLayer`、`rowViewData`，全部改读 `rowAggregate`。
- 构造与 `rebuildData`：`rowAggregate.rebuild(rawData, () => this.resolveDefaultRowHeight())`；`this.data = this.wrapViewData(rowAggregate.getRowViewData())`；`this.rowsAxis = rowAggregate.getViewRowsAxis()`。
- `setRowHeight` / `getRowHeight` / `getHiddenRows` / `getCollapsedGaps` / theme 改默认行高：委托聚合根。
- `buildViewRowsAxis` 移入聚合根（`getViewRowsAxis`）；engine 的 `rebuildViewAxis` 改为「读 `rowAggregate.getViewRowsAxis()` + 重建 frozen/viewport」。
- undo/redo 行分支：行状态变迁调聚合根逆变迁方法；`formatStore/mergeStore.restore`、`selection.setSelection`、frozen/viewport 重建**保持在 engine**。
- frozen/viewport 组装、`wrapViewData`（列隐藏）、`hiddenColIds`、`resolveDefaultRowHeight`（theme+option）**不动**。

### 数据流（重构后）

```
rawData (engine 持有, 注入聚合根)
  └─ rowAggregate: HideRowsLayer.wrap(rawData) = rowViewData  [聚合根私有派生]
        └─ engine: wrapViewData(rowViewData) = data           [列隐藏, engine]
rowAggregate.getViewRowsAxis()  ──► engine 重建 frozen/viewport
```

## 错误处理与边界

- 非 `MutableDataSource` 或缺 `insertRows/deleteRows/moveRows`：聚合根方法返回 `null`/`false`/空，与现状一致（行为不变）。
- `rebuild` 在 setData/rebuildData 重新绑定 raw 数据源并重置 HideRowsLayer 包装；engine 在构造期 frozen/viewport 尚未就绪，沿用现状由调用方处理（聚合根只产 axis/view 数据，不触 viewport）。
- `HideRowsLayer._handleUpstreamEvent` 的隐藏集重映行为随层一并内化，语义不变。

## 测试策略

- TDD：先为 `RowAggregate` 写注入 `(rawData, resolveDefaultRowHeight)` 的单测，覆盖正向操作 + 逆变迁 + 派生读（`getViewRowsAxis`/`getRowViewData`/`getCollapsedGaps`），看红再实现。
- 重写原 `DefaultRowStructure` 的 mock-context 单测为注入真实/轻量 `MutableDataSource`。
- engine 行为级测试（hide/unhide、insert/delete、moveRows、setRowHeight、undo/redo、setData 重建）必须保持绿——行为等价是验收门槛。
- lint / typecheck / test / build 四项全绿后方可落地。

## 影响面汇总

- 公共 `Grid` facade 与 web 包：不受影响（engine 方法签名不变）。
- "暂时不可用"窗口仅限 core 内部实现 + 其单测，落地后行为等价。
- blast radius 集中在 `DefaultGridEngine`（字段删除 + undo/redo 行分支改写）与 `row/` 目录（聚合根扩富、context 删除、`HideRowsLayer` 持有者迁移）。

## 后续

进入 writing-plans，按 TDD 节奏分解为 milestone 任务：聚合根扩富与状态内化 → undo 逆变迁内化 → engine 字段删除与重接线 → 测试迁移与回归。
