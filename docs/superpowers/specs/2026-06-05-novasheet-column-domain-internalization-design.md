# 列领域抽取与内化设计（建 DefaultColumnStructure，删 ColumnStructureContext）

- 日期：2026-06-05
- 状态：设计已确认，待 writing-plans
- 作者：rongtaosheng + Claude
- 关联：`docs/superpowers/specs/2026-06-04-novasheet-row-aggregate-internalization-design.md`（row 是本设计的模板）

## 背景与问题

engine 重构路线（见 `packages/core/src/engine/README.md` 重构总进度）第 3 步：按 row 模板迁移 `column/`。

现状与 row 完全不是一个量级：

- `packages/core/src/engine/column/ColumnStructure.ts` 只有一个**悬空未用**的 `ColumnStructureContext` 接口 + 一个 `ColumnMovePlan` 类型。grep 确认无人 `implements`/消费 `ColumnStructureContext`——它是死代码。
- **没有 `DefaultColumnStructure` 聚合根**，没有列 operation/event/rules/命令处理器。
- 所有列逻辑（`insertCols`/`deleteCols`/`hideCols`/`unhideCols`/`moveCols`/列宽 `setColumnWidths`/`commitColumnResize` + 各自 undo/redo 分支）**内联在 `DefaultGridEngine`**，直接操作 `rawColsAxis`、`hiddenColIds`（裸 `Set<string>`）、`rawData`，并内联做 frozen 同步、format/merge/selection remap、undo push。

因此第 3 步实际是：**从零搭整套列领域 + 直接走 row 终态（自持状态、无 context）**。这是一个 milestone，约等于「当年拆 row 领域操作」+「row 内化」两步合并。

## 目标

把列结构领域从 `DefaultGridEngine` 抽出为自持状态的聚合根 `DefaultColumnStructure`，严格对称 row 终态：

- 聚合根自持 `rawColsAxis`（列宽轴）+ `hiddenColIds`（隐藏列集）+ `VisibleColumnsDataSource`（列隐藏视图包装）。
- 列 operation 经命令处理器执行并 dispatch 列 domain event；format/merge 列 remap 走 `GridEventPipeline`（`FormatEventHandler` 扩列分支）。
- 删除死代码 `ColumnStructureContext`；聚合根仅注入 raw `MutableDataSource` 引用 + `resolveDefaultColWidth: () => number`。
- 行为等价：所有现有 engine 列行为级测试保持绿。

### 非目标

- 不动 frozen 的所有权：`FrozenRegions` 跨行+列，由 `DefaultGridEngine` 持有，列结构事件后由 engine `syncFrozenAfterCol*` 调整。
- 不动 selection remap / undo 栈 / viewport rebuild：留 engine 门面方法编排（同 row）。
- 不动 row 领域、公共 `Grid` facade、web 包（engine 对外方法签名不变）。
- 不引入 `field.width` 与 `rawColsAxis` 的去重（列宽双存是既有事实，保持；见下）。

## 现状关键事实（实现约束）

- 数据链：`rawData → rowStructure.getRowViewData() = rowViewData → wrapViewData(rowViewData) = data`。`wrapViewData` 用 `new VisibleColumnsDataSource(data, () => this.hiddenColIds)` 叠列隐藏。内化后列隐藏包装移入列聚合根，engine 改为 `columnStructure.wrapVisibleColumns(rowViewData)`（或等价）。
- 视图列轴：`buildViewColsAxis()` 从 `rawColsAxis` 按非隐藏 field 顺序派生；`rebuildViewColsAxis()` 派生后重建 frozen/viewport。
- `hiddenColIds` 被两处共享读取：`CoordinateSpace`（`isColHidden: (id) => this.hiddenColIds.has(id)`）与 `VisibleColumnsDataSource`。内化后这两处改读聚合根（`columnStructure.isColHidden(id)` / `columnStructure.getColViewData()`）。
- 列宽双存：`rawColsAxis.setSize(idx, w)` 与 `field.width = w`（schema 上）。`commitColumnResize` 与 `setColumnWidths` 同时写两者；`applyFieldWidths`（rebuild 时）从 `field.width` 回填轴。聚合根自持 `rawColsAxis`，并经 rawData 引用写 `field.width`（列宽是列域 concern）。
- 列结构操作内联做的事（以 `insertCols` 为例，line 580-624）：建 field → `rawData.insertField` → `rawColsAxis.insertRange` → `syncFrozenAfterColInsert` → `rebuildViewColsAxis` → `formatStore/mergeStore/selection.remapAfterColsInserted` → `undoStack.push`。其中 `formatStore.remapAfterColsInserted` / `mergeStore.remapAfterColsInserted` 已存在（row 路径经 `FormatEventHandler` 调它们的 row 版本）。
- `moveCols`（line 752-787）走 fieldId 路径：`normalizeMoveCols` 不产数值 index map；在 `moveFields` 前后取 raw 字段序，`buildColIndexMap` 配对 oldRawIndex→newRawIndex；`captureRawColWidths`/`rebuildRawColsAxisFromWidths` 按 fieldId 锚定列宽。这些私有 helper 迁入 `ColumnRules` / 聚合根。
- 列 undo/redo 分支：`resizeColumn`、`resizeColumnsMulti`、`insertCols`（`applyInsertCols`/`unapplyInsertCols`）、`deleteCols`（`applyDeleteCols`/`unapplyDeleteCols`）、`hideCols`、`unhideCols`、`moveCols`（`applyMoveColsCommand`）。逆变迁里 frozen/format/merge/selection 的恢复留 engine，仅 raw 列状态变迁交聚合根。

## 设计

### 模块（`packages/core/src/engine/column/`）

| 文件 | 动作 | 职责 |
|---|---|---|
| `ColumnOperation.ts` | Create | 列 operation 协议：`InsertColsOperation`/`DeleteColsOperation`/`HideColsOperation`/`UnhideColsOperation`/`MoveColsOperation`（列宽不走 op/event，见下，对称 row 的 resize 直走聚合根） |
| `ColumnEvent.ts` | Create | 列 event 协议：`ColsInserted`(at,count,newFields)/`ColsDeleted`(removedIndices,snapshots,deletedWidths)/`ColsHidden`/`ColsUnhidden`(fieldIds)/`ColsMoved`(fieldIds,colIndexMap) |
| `ColumnRules.ts` | Create | 纯规则：`normalizeMoveCols`、`buildColIndexMap`、`captureRawColWidths`、`buildRawColsAxisFromWidths`、`normalizeDeleteCols`、`getNewlyHiddenCols`/`getNewlyVisibleCols`（从 engine 私有方法/内联逻辑抽出） |
| `ColumnStructure.ts` | Rewrite | 删 `ColumnStructureContext`；定义富接口 `ColumnStructure` + 窄接口 `ColumnCommands`（命令处理器依赖）；保留/迁移 `ColumnMovePlan` 到 `ColumnRules.ts` |
| `DefaultColumnStructure.ts` | Create | 聚合根：自持 `rawColsAxis` + `hiddenColIds` + `VisibleColumnsDataSource`；正向 op、派生读、逆变迁 |
| `InsertColsCommandHandler.ts` 等 | Create | 5 个 op 执行器，dispatch 列事件入 `GridEventPipeline` |
| `README.md` | Modify | 对照 row 模板更新列领域职责与边界 |

### 所有权迁移

| 状态 | 现在 | 重构后 |
|---|---|---|
| `rawColsAxis` | engine 字段 | `DefaultColumnStructure` 私有 |
| `hiddenColIds`（`Set<string>`） | engine 字段 | `DefaultColumnStructure` 私有 |
| 列隐藏视图源（`VisibleColumnsDataSource`） | engine `wrapViewData` 派生 | 聚合根 `getColViewData()` |
| view cols axis | engine `buildViewColsAxis()` | 聚合根 `getViewColsAxis()` |
| 折叠列 gap（`computeCollapsedColGaps`） | engine | 聚合根 `getCollapsedColGaps()` |

### 注入依赖（取代死 context）

经构造与 `rebuild(rawData, resolveDefaultColWidth)`：

- raw `MutableDataSource` 引用——`insertField/removeField/moveFields/getSchema` 与 `field.width` 写入。
- `resolveDefaultColWidth: () => number`——依赖 schema 平均/默认列宽逻辑，逻辑留 engine 作为函数注入。

### `ColumnStructure` 富接口（对称 `RowStructure`）

| 类别 | 方法 |
|---|---|
| 生命周期 | `rebuild(rawData, resolveDefaultColWidth)`、`clearHidden()` |
| 正向（`ColumnCommands`） | `insertCols/deleteCols/hideCols/unhideCols/moveCols` → 返回列 event |
| 列宽（直走，对称 row 的 setRowHeight） | `getColWidth(rawColIndex)`、`setColWidth(rawColIndex, w)`、`setColWidthsMulti(fieldIds, w)`、`setDefaultColWidth(w)`。`commitColumnResize`/`setColumnWidths` 由 engine 直接调这些方法 + undo push，不经命令处理器/事件（同 row `commitRowResize`） |
| 派生读 | `getViewColsAxis()`、`getColViewData()`、`getHiddenCols()`、`getCollapsedColGaps()`、`isColHidden(fieldId)`、`getRawColumnIndex(fieldId)` |
| 逆变迁（undo/redo） | `insertFieldsAt(at, fields, widths)`、`removeFieldsByIds(fieldIds)`、`reinsertDeletedCols(snapshots, widths)`、`addHidden(fieldIds)`、`removeHidden(fieldIds)`、`applyMove(fieldIds, beforeFieldId)` |

逆变迁只动 **raw 列状态**（轴 + 字段增删/移动 + 隐藏集 + field.width）；frozen/format/merge/selection 恢复留 engine。

### 职责切分（每个列 op，严格对称 row）

```
engine.insertCols() 门面
  ├─ 快照 selection/format/merge/frozen
  ├─ insertColsCommand.execute(op)
  │     ├─ columnStructure.insertCols() ← 改 raw 列状态（聚合根）
  │     └─ eventPipeline.dispatch(ColsInserted)
  │           └─ FormatEventHandler → format/merge col remap（走管线）
  ├─ syncFrozenAfterColInsert() + rebuildViewColsAxis()     ← 留 engine（frozen 跨两轴）
  ├─ selection.remapAfterColsInserted()                     ← 留 engine
  └─ undoStack.push()                                       ← 留 engine
```

### `FormatEventHandler` 扩列分支

`FormatEventHandlerContext` 增 `remapFormatAfterColsInserted/Deleted`、`remapMergeAfterColsInserted/Deleted`、`remapFormatCols`/`remapMergeCols`（by colIndexMap）；handler 的 switch 增 `colsInserted`/`colsDeleted`/`colsMoved` 分支。这些 store 方法已存在（engine 当前内联调用），只是改由列事件经管线触发。engine 构造 `FormatEventHandler` 时补列回调，复用同一条 `eventPipeline`。

### engine 侧改动边界

- 删字段 `rawColsAxis`、`hiddenColIds`，全改读 `columnStructure`。
- 构造/`rebuildData`：`columnStructure.rebuild(rawData, () => this.resolveDefaultColWidth())`；`data = columnStructure.getColViewData()`（叠在 `rowStructure.getRowViewData()` 之上）；`colsAxis = columnStructure.getViewColsAxis()`。
- `setData`：`columnStructure.clearHidden()`。
- 列门面方法（insertCols/deleteCols/hideCols/unhideCols/setColumnWidths/moveCols/commitColumnResize）：瘦成「快照 → command.execute → frozen 同步 + selection remap + undo push」。
- `CoordinateSpace` 的 `isColHidden` 改读 `columnStructure.isColHidden`；`getHiddenCols`/`getFrozenConfig` 保持（frozen 仍 engine）。
- undo/redo 列分支：raw 列状态变迁调聚合根逆变迁；frozen/format/merge/selection 恢复保留。
- `buildViewColsAxis`/`computeCollapsedColGaps` 迁入聚合根；`rebuildViewColsAxis` 改为读 `columnStructure.getViewColsAxis()` + 重建 frozen/viewport（engine）。
- 私有 helper `normalizeMoveCols`/`buildColIndexMap`/`captureRawColWidths`/`rebuildRawColsAxisFromWidths` 迁入 `ColumnRules.ts` / 聚合根。

### 数据流（重构后）

```
rawData (engine 持有, 注入两个聚合根)
  └─ rowStructure: HideRowsLayer.wrap(rawData) = rowViewData      [row 聚合根]
        └─ columnStructure: VisibleColumnsDataSource(rowViewData) = data  [col 聚合根]
rowStructure.getViewRowsAxis() + columnStructure.getViewColsAxis() ──► engine frozen/viewport
```

## 错误处理与边界

- 非 `MutableDataSource` 或缺 `insertField/removeField/moveFields`：聚合根方法返回空/`false`/`null`，与现状一致（行为不变）。
- `moveCols` 的 fieldId 路径：`normalizeMoveCols` 非法或无序变化时返回 `null`（同现状）。
- `rebuild` 重绑 raw 数据源、重置列隐藏视图包装、重建列宽轴（从 `field.width` 回填，对应 `applyFieldWidths`）；`setData` 另调 `clearHidden()`（`setViewData` 不清隐藏，同 row 语义）。
- frozen 跨两轴：聚合根不碰 frozen；列结构事件由 engine 决定 frozen 调整与 viewport 重建。

## 测试策略

- TDD：先为 `ColumnRules`、`DefaultColumnStructure`、列命令处理器写单测（注入轻量 `MutableDataSource`），覆盖正向 op + 逆变迁 + 派生读，看红再实现。
- `FormatEventHandler` 列分支：单测验证列事件触发对应 store remap。
- engine 行为级测试（insertCols/deleteCols/hideCols/unhideCols/moveCols、列宽、undo/redo、frozen 同步、setData/setViewData 重建）必须保持绿——行为等价是验收门槛。
- lint / typecheck / test / build 四项全绿后方可落地。

## 影响面汇总

- 公共 `Grid` facade 与 web 包：不受影响（engine 方法签名不变）。
- blast radius 集中在 `DefaultGridEngine`（删两字段 + 列门面瘦身 + 列 undo/redo 改写）与新建的 `column/` 领域文件；`FormatEventHandler` 扩列分支。
- 删除死代码 `ColumnStructureContext`。

## 任务分解（writing-plans 细化）

1. `ColumnOperation` + `ColumnEvent` + `ColumnRules`（抽纯规则）+ 单测。
2. `DefaultColumnStructure` 聚合根（自持状态、正向 op、派生读、逆变迁）+ 单测；含 `ColumnStructure`/`ColumnCommands` 接口。
3. 列命令处理器 + `FormatEventHandler` 扩列分支 + 单测。
4. engine 门面接线（删字段、列 op 走聚合根+管线、frozen/selection/undo 编排保留、删死 context）——原子提交，恢复全绿。
5. 文档（`column/README.md` + engine 进度表）+ 四项全绿回归。
