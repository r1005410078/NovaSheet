# Column

负责 engine 空间里的列结构变化规则：

- 插入、删除、隐藏、取消隐藏、移动列。
- 保留并重映射 field width（列宽双存：`rawColsAxis` + schema 上的 `field.width`）。
- 派生视图列轴、列隐藏视图源、折叠列 gap。
- 为列移动提供 contiguous field group 检测与 fieldId→raw index 配对。

## 文件职责

- `ColumnStructure.ts`：列领域富接口（聚合根）+ 命令处理器依赖的窄接口 `ColumnCommands`（5 个正向方法）。
- `DefaultColumnStructure.ts`：默认列领域实现（聚合根）；自持 `rawColsAxis` 与 `hiddenColIds`，执行正向结构变迁、列宽读写、派生视图列轴/列隐藏视图源，并提供 undo/redo 逆变迁；产出 column domain event。
- `ColumnOperation.ts`：列领域 operation 协议，例如 `MoveColsOperation`。
- `ColumnEvent.ts`：列领域事件协议，例如 `ColumnsMoved`（kind 命名对齐 `event/GridDomainEvent.ts` 的 `columns*`，由本文件 re-export）。
- `*ColsCommandHandler.ts`：列 operation 执行器，调用列领域并 dispatch 事件入 `GridEventPipeline`。
- `ColumnRules.ts`：纯规则/算法，例如 column move normalization、col index map、列宽快照、delete 归一化、hide/unhide 过滤。

## 边界

- 本目录不依赖 DOM、canvas、runtime 或 web 包。
- 聚合根仅依赖两项：raw `MutableDataSource` 引用 + `resolveDefaultColWidth: () => number`（注入 schema 派生平均列宽用于 seed 列宽轴默认值），经构造/`rebuild` 注入。已删除旧的 `ColumnStructureContext`。
- `frozen`（跨行+列，`FrozenRegions`）、selection remap、undo 栈、viewport rebuild 仍由 `DefaultGridEngine` 编排：列结构事件后 engine 调 `syncFrozenAfterCol*` 调整 frozen，并做 selection remap / undo push。
- format/merge 列 remap 走 `GridEventPipeline`（`FormatEventHandler` 的 `columnsInserted`/`columnsDeleted`/`columnsMoved` 分支）；列隐藏不改 raw 坐标，故 `columnsHidden`/`columnsUnhidden` 对 format/merge 为 no-op。
- 列宽 resize（`commitColumnResize`/`setColumnWidths`）直走聚合根 `setColWidth`/`setColWidthsMulti`，不经命令处理器/事件（对称 row 的 `commitRowResize`）。
- 不使用泛化 `utils`。领域算法优先放在 `ColumnRules.ts`；变大后再拆成 `rules/` 子目录。
