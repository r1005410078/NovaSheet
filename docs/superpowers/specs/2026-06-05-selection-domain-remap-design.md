# Selection 领域重映射设计（按 row 模板补齐领域边界）

- 日期：2026-06-05
- 状态：追补设计，已实现
- 作者：rongtaosheng + Codex
- 关联计划：`docs/superpowers/plans/2026-06-05-selection-domain-remap.md`
- 关联模板：`docs/superpowers/specs/2026-06-04-novasheet-row-aggregate-internalization-design.md`

## 背景与问题

engine 重构路线（见 `packages/core/src/engine/README.md`）第 4 步是：

> 抽离 row/column 结构变化共用的 selection remap。

第一次实现只把 `DefaultGridEngine` 里的 selection remap helper 抽成
`selection/SelectionRemap.ts` 纯函数，并让 engine 直接调用这些函数。这个形状不符合
`row/` 领域模板：row 的目标不是“函数搬家”，而是形成清晰调用链：

```txt
Grid / runtime
  -> GridEngine facade
  -> OperationCommandHandler
  -> Domain object
  -> DomainEvent
  -> GridEventPipeline
  -> other domain handlers
  -> DefaultGridEngine 收尾 undo / rebuild
```

selection 作为结构变化后的同步领域，也应有自己的领域接口、默认状态对象、纯规则和事件处理器。

## 目标

按 row 模板补齐 selection 领域边界：

- 用 `DefaultSelectionState` 封装 `SelectionModel`，让 engine 不再直接持有低层状态机。
- 用 `SelectionState` / `SelectionCommands` 区分 engine facade 能力与 event handler 所需的窄写入面。
- 用 `SelectionRules` 放纯 remap 算法，避免 `SelectionRemap` 变成无边界函数袋。
- 用 `SelectionEventHandler` 响应 row/column domain event，结构事件后的 selection 恢复走 `GridEventPipeline`。
- 保持对外 `GridEngine` / `Grid` API 与现有行为不变。

### 非目标

- 不把 edit / paste / fill / undo replay 的选区恢复一并迁入 selection；这些路径仍跟旧 `UndoCommand`
  协议耦合，留到第 5 步 undo replay 或后续拆分。
- 不扩展 row/column domain event 为开放订阅系统；仍使用固定顺序 `GridEventPipeline`。
- 不让 selection 领域依赖 `DefaultGridEngine`、DOM、canvas、runtime 或 web 包。
- 不改 `SelectionModel` 的基础选择语义；它仍是低层状态机。

## 现状关键事实（实现约束）

- `SelectionModel` 已提供基础能力：`getSelection`、`setSelection`、`selectCell`、`clear`、
  `setSelectedRange`、`navigate`，以及 insert/delete 行列后的简单偏移/收缩。
- `setViewData(...oldResolveUnderlyingRow)` 不是 row/column domain event；它来自 view pipeline 的
  sort/filter 切换，需要 engine 显式注入旧 view row → raw row 与新 raw row → view row 映射。
- `rowsMoved` event 已含 `indexMap: oldRawRow -> newRawRow`，selection 可直接按该 map 恢复。
- `columnsMoved` event 的 `indexMap` 是 raw column index map；selection 使用的是 view col index。
  在隐藏列存在时，selection 必须按可见 `fieldId` 身份恢复，而不是按 raw index map 恢复。
- `VisibleColumnsDataSource.getSchema()` 动态读取上游 schema 和隐藏列集，因此 `columnsMoved`
  dispatch 后即使 engine 尚未 `rebuildViewColsAxis()`，当前 visible fieldId 顺序也已经可读。

## 设计

### 模块（`packages/core/src/engine/selection/`）

| 文件 | 职责 |
| --- | --- |
| `SelectionState.ts` | 选区领域富接口 `SelectionState` + event handler 依赖的窄接口 `SelectionCommands`。 |
| `DefaultSelectionState.ts` | 默认 selection 聚合根；内部持有 `SelectionModel`，调用纯规则恢复选区。 |
| `SelectionRules.ts` | 纯规则/算法：view row 变化、row index map、visible fieldId 三类 remap。 |
| `SelectionEventHandler.ts` | 响应 `GridDomainEvent`，调用 `SelectionCommands`，不 dispatch 新事件。 |
| `README.md` | selection 领域职责、边界和后续拆分说明。 |

### 所有权迁移

| 状态/能力 | 迁移前 | 迁移后 |
| --- | --- | --- |
| `SelectionModel` 实例 | `DefaultGridEngine` 字段 | `DefaultSelectionState` 私有字段 |
| insert/delete 行列 selection remap | engine 直接调 `SelectionModel` | `SelectionEventHandler` 经 `SelectionCommands` 调用 |
| row move selection remap | engine 私有 helper | `SelectionRules.remapSelectionByRowIndexMap` + `DefaultSelectionState.restoreByRowIndexMap` |
| column move selection remap | engine 私有 helper | `captureVisibleFieldIdsBefore` + `SelectionEventHandler` + `SelectionRules.remapSelectionByVisibleFieldIds` |
| view data 切换 remap | engine 私有 helper | engine 注入映射函数，调用 `DefaultSelectionState.remapAfterViewRowsChanged` |

### 结构事件数据流

行插入/删除/移动：

```txt
engine.insertRows/deleteRows/moveRows
  -> row command handler
  -> row structure
  -> rowsInserted/rowsDeleted/rowsMoved event
  -> GridEventPipeline
       -> SelectionEventHandler
       -> FormatEventHandler
  -> engine rebuild rows axis / frozen / viewport
  -> engine push UndoCommand with selectionBefore/selectionAfter
```

列插入/删除/移动：

```txt
engine.insertCols/deleteCols/moveCols
  -> column command handler
  -> column structure
  -> columnsInserted/columnsDeleted/columnsMoved event
  -> GridEventPipeline
       -> SelectionEventHandler
       -> FormatEventHandler
  -> engine sync frozen + rebuild cols axis / viewport
  -> engine push UndoCommand with selectionBefore/selectionAfter
```

`moveCols` 额外需要：

```txt
engine.moveCols
  -> selection.captureVisibleFieldIdsBefore(current visible ids)
  -> moveColsCommand.execute(...)
  -> columnsMoved event
  -> SelectionEventHandler.restoreByCapturedVisibleFieldIds(next visible ids)
```

这样 selection 领域只接收可描述的最小数据，不接收完整 engine 或 column structure。

### view data 切换数据流

`setViewData` 不是 domain event，仍由 engine 显式编排：

```txt
engine.setViewData(newData, { oldResolveUnderlyingRow })
  -> rebuildData(newData)
  -> selection.remapAfterViewRowsChanged({
       oldViewRowToRaw: oldResolveUnderlyingRow,
       rawRowToView: coords.rawRowToView
     })
```

该路径用于 sort/filter/view pipeline 切换后，把 active/range selection 锚定到相同 raw row；
若 range 映射后不连续，则退回 active cell；若 active raw row 被过滤掉，则清空 selection。

## 错误处理与边界

- 不完整 selection（任一 endpoint/range 缺失）在 remap 时清空，保持 `SelectionModel` 的完整状态契约。
- view row remap 若 active row 不可见，清空 selection；若 range 行映射不连续，退回 active cell。
- row move 若 `indexMap` 找不到 endpoint，清空 selection。
- column move 若捕获的 visible fieldId 在当前 visible schema 中不可见，清空 selection。
- hide/unhide 行列事件当前不做 selection remap；engine 仍按既有行为在 rebuild 后记录 selection 快照。
- `restoreSelectionForWrites` / `restoreSelectionForEdit` 仍在 `DefaultGridEngine`，避免本步骤扩大到 undo/edit 协议。

## 测试策略

- `SelectionRules.test.ts`：覆盖 view row contiguous / non-contiguous / filtered out、row index map、
  visible fieldId remap。
- `DefaultSelectionState.test.ts`：覆盖基础 selection model 包装、row move 恢复、column move visible
  fieldId 快照恢复、空 selection contract。
- `SelectionEventHandler.test.ts`：覆盖 row/column 结构事件分发、hide/unhide no-op。
- engine 回归：
  - `setViewData` 后 active/range selection 按 raw row 锚定。
  - `moveRows` 后 selection 按 row index map 恢复。
  - `moveCols` 后 selection 按 visible fieldId 恢复，包含隐藏列存在的边界。
- 全量 gate：`bun run lint`、`bun run --filter '*' typecheck`、`bun test`、
  `bun run --filter @novasheet/web build && bun run --filter @novasheet/web-canvas2d build && bun run --filter @novasheet/core build`。

## 影响面汇总

- 公共 `GridEngine` / `Grid` API 不变。
- `DefaultGridEngine` 删除 selection remap 私有 helper，改为持有 `DefaultSelectionState` 并在
  `GridEventPipeline` 中注册 `SelectionEventHandler`。
- selection 领域新增四个文件，边界对称 row/column 当前领域拆分风格。
- undo replay 第 5 步仍未开始；本设计只为后续 undo 领域拆分收缩 engine 中的 selection 结构变化逻辑。

## 任务分解（已落实到 plan）

1. `SelectionRemap.ts` 更名为 `SelectionRules.ts`，明确纯规则定位。
2. 新增 `SelectionState` / `DefaultSelectionState` 聚合根。
3. 新增 `SelectionEventHandler` 接入结构事件。
4. `DefaultGridEngine` 改用 selection 领域，并补隐藏列 + column move 回归。
5. 更新 `selection/README.md` 与 engine 进度表。
6. 跑四项 gate。

## Spec 自检

| 检查项 | 结果 |
| --- | --- |
| Placeholder scan | 无 `TBD` / `TODO` / 未决占位。 |
| Internal consistency | 文件职责、数据流与现有实现一致；`columnsMoved` 的 visible fieldId 快照风险已显式处理。 |
| Scope check | 仅覆盖第 4 项 selection remap 领域化；不进入 undo replay。 |
| Ambiguity check | `setViewData` 非 event 路径、hide/unhide no-op、write/edit restore 留 engine 均已写明。 |
