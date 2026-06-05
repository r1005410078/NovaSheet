# Engine Refactor

`DefaultGridEngine` 正在从单个重状态实现，逐步拆成职责明确的领域模块。
对外 `GridEngine` facade 保持稳定；内部逻辑按领域迁移到 `row/`、`column/`、
`selection/`、`format/` 等目录。

目标不是“把文件拆小”，而是让每个行为有清晰调用链：

```txt
Grid / runtime
  -> GridEngine facade
  -> OperationCommandHandler
  -> Domain object
  -> DomainEvent
  -> GridEventPipeline
  -> other domain handlers
  -> DefaultGridEngine 收尾 undo / selection / rebuild
```

## 重构总进度

对照下方「迁移顺序」7 步路线（✅ 完成 / 🟡 进行中 / ⬜ 骨架待接线）：

| # | 步骤 | 状态 | 说明 |
| --- | --- | --- | --- |
| 1 | `row/` 作为领域模板 | ✅ | operation / handler / structure / rules / event 齐全。 |
| 2 | 收窄 `RowStructureContext` | ✅ | 已**彻底删除** context：`DefaultRowStructure` 自持 `rawRowsAxis` + `HideRowsLayer`，仅依赖 raw `MutableDataSource` 引用与 `resolveDefaultRowHeight` 两项（2026-06-04，超额完成，见 `row/README.md`）。 |
| 3 | 按 row 模板迁移 `column/` | ✅ | 已建 `DefaultColumnStructure` 聚合根（operation/event/rules/命令处理器齐全），内化 `rawColsAxis` + `hiddenColIds` + 列隐藏视图包装，删除死代码 `ColumnStructureContext`（2026-06-05，对称 row，见 `column/README.md`）。format/merge 列 remap 走 `FormatEventHandler`；frozen/selection/undo 留 engine。 |
| 4 | 抽离 selection remap | ✅ | 已按 row 模板建立 `SelectionState` 聚合根、`SelectionRules` 纯算法与 `SelectionEventHandler`；已删除旧 `interaction/SelectionModel` / `interaction/SelectionNavigation`，`DefaultSelectionState` 直接持有 `GridSelection` 并接管基础选择、键盘导航、结构 remap 状态机；engine 仅保留 composer / undo snapshot / view-row 映射注入职责（2026-06-05）。 |
| 5 | 抽离 undo replay | ⬜ | `undo/UndoReplay.ts` 骨架已建；`applyUndo/applyRedo` 仍在 `DefaultGridEngine`。 |
| 6 | 抽离 layout state | ⬜ | `layout/LayoutState.ts` 骨架已建（当前孤儿、引用已与 row 内化后的架构脱节），engine 未接线。 |
| 7 | 抽离 format/merge 协调 | 🟡 | `format/FormatEventHandler` 已接入 `GridEventPipeline`；`format/FormatState.ts` 未接线。 |

下一步候选：接线 undo replay（第 5 步，收缩 `DefaultGridEngine.applyUndo/applyRedo` 体积）。

## 当前原则

- `DefaultGridEngine` 暂时保留 composer 职责：组装领域对象、事件管线、undo、selection、viewport rebuild。
- 领域对象负责本领域状态变化，并产出本领域事件。
- Command handler 负责执行 operation，并把领域事件交给固定事件管线。
- Event handler 只响应已经发生的事实，不主动发起新 operation，也不再次 dispatch event。
- `UndoCommand` 仍是旧 undo 协议；它和 `GridOperation` / `GridDomainEvent` 语义不同。

## 三种协议

| 类型 | 时间点 | 作用 | 示例 |
| --- | --- | --- | --- |
| `GridOperation` | 发生前 | 描述“我要做什么”，可序列化、可回放、可协同。 | `moveRows` |
| `GridDomainEvent` | 发生后 | 描述“已经发生了什么”，供其他领域同步响应。 | `rowsMoved` |
| `UndoCommand` | 执行后 | 记录 undo / redo 所需的 before/after 或 inverse 信息。 | `unhideRows` |

约束：

- Operation 不包含执行结果，例如 `insertRows` 不应带 `newRowIds`。
- DomainEvent 可以包含执行结果，例如 `rowsInserted.newRowIds`、`rowsMoved.indexMap`。
- UndoCommand 可以包含快照、inverse 信息，但不要让领域模块直接依赖 undo 栈。
- 三者的 `kind` 字符串可以相似，但不能混用语义。

## 目录职责

| 目录 | 职责 |
| --- | --- |
| `row/` | 行领域：行插入、删除、隐藏、取消隐藏、移动，row axis 和 hidden rows 重映射。 |
| `column/` | 列领域：列插入、删除、隐藏、取消隐藏、移动，field width 和 frozen columns 同步。 |
| `selection/` | 选区领域：结构变化、视图变化后的选区恢复和重映射。 |
| `format/` | 格式领域：format / merge store mutation，响应 row/column 结构事件。 |
| `layout/` | 布局领域：axis、theme、frozen-region、viewport、sheet chrome 初始化和 rebuild。 |
| `undo/` | 撤销领域：后续承接 `UndoCommand` replay 与 inverse replay。 |
| `operation/` | 顶层 operation / transaction 聚合协议；具体领域 operation 优先放回领域目录。 |
| `event/` | 顶层 domain event 聚合协议和固定同步事件管线。 |

## 领域目录模板

以 `row/` 为当前模板：

```txt
row/
  README.md
  RowStructure.ts              # 领域富接口 + RowCommands 窄接口（已去除 context 端口）
  DefaultRowStructure.ts       # 领域实现
  RowRules.ts                  # 纯规则/算法
  RowOperation.ts              # 领域 operation 协议
  RowEvent.ts                  # 领域 event 协议
  *RowsCommandHandler.ts       # operation 执行器
```

后续领域应优先模仿这个结构，而不是把逻辑继续塞回 `DefaultGridEngine`。

## 硬约束

- 不在 `engine/` 下创建泛化 `utils`、`helpers`、`common` 目录。
- 纯算法放到领域内 `*Rules.ts`；变大后再拆成领域内 `rules/` 子目录。
- 领域模块不得依赖 DOM、canvas、runtime、web 包。
- 领域模块不得接收完整 `GridEngine` 或 `DefaultGridEngine`。
- Internal context 必须是最小端口；优先暴露领域能力，不暴露底层实现对象。
- 事件只能由领域对象产出，由 command handler dispatch。
- 只有 composer 可以创建 `GridEventPipeline` 并决定 handler 顺序。
- Event handler 不允许 dispatch 新事件。
- Operation 必须可 JSON 序列化：不包含 `Map`、函数、class instance、live engine state。
- DomainEvent 不要求完全 JSON 化；但若未来要用于 trace / devtools，应避免无法描述的 live object。
- 结构 mutation 必须保持 data、axis、hidden rows、format、merge、selection、undo 一致。
- 任何迁移必须补最小回归测试，覆盖正常路径和一个边界路径。

## Context 约束

Internal context 是领域对象读写 engine 状态的唯一入口。

推荐：

```ts
interface RowStructureContext {
  getRowCount(): number
  insertRows(at: number, count: number): readonly number[]
  deleteRows(rowIds: readonly number[]): readonly DeletedRowSnapshot[]
}
```

避免：

```ts
interface BadContext {
  engine: DefaultGridEngine
  grid: GridEngine
}
```

后续应继续收窄 context。column 领域当前仍走 `ColumnStructureContext`，是中间态。

> 注：row 领域已走完这条路线的终点——不再有 `RowStructureContext`，聚合根
> 自持状态、仅注入 raw 数据源引用与默认行高解析。column 可参照 row 内化。

## Event 约束

DomainEvent 表达已经发生的事实。

推荐：

```ts
{
  kind: 'rowsInserted',
  at: actualInsertedAt,
  count,
  newRowIds,
}
```

避免：

```ts
{
  kind: 'rowsInserted',
  at: requestedAt,
}
```

如果底层实现会 clamp、normalize 或 reject，事件必须使用实际结果，而不是原始请求。

## 测试约束

每次迁移至少覆盖：

- 领域对象测试：验证领域状态变化和事件 payload。
- command handler 测试：验证 event dispatch / no-op 不 dispatch。
- engine 回归测试：验证 facade 行为、undo、axis、format/merge 没有错位。
- 边界测试：至少覆盖一个 invalid / no-op / clamp 场景。

测试导入规则：

- 领域测试直接导入领域文件，例如 `engine/row/DefaultRowStructure`。
- facade 回归测试继续通过 `DefaultGridEngine`。
- 不为了测试暴露完整 engine 内部对象。

## 迁移顺序

1. 完成 `row/` 作为模板：operation、handler、structure、rules、event。
2. 收窄 `RowStructureContext`，避免暴露 `ChunkedAxis` 实现细节。
3. 按 row 模板迁移 `column/`。
4. 抽离 row/column 结构变化共用的 selection remap。
5. 抽离 undo replay，减少 `DefaultGridEngine.applyUndo/applyRedo` 体积。
6. 抽离 layout state 初始化与 rebuild 规则。
7. 抽离 format/merge mutation 协调逻辑。

## 禁止事项

- 不为了“少文件”把多个 operation 合并成一个大 switch，除非它们长期没有独立增长点。
- 不让 event bus 变成开放订阅系统；当前只允许固定 handler 顺序。
- 不把 undo 快照塞进 operation。
- 不把 operation 当 event 用，也不把 event 当 operation 回放。
- 不在领域模块里直接调用 render、scroll、DOM、runtime invalidate。
- 不为了拆分引入行为变化；任何行为变化必须有测试先覆盖。
