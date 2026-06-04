# Row

负责 engine 空间里的行结构变化规则：

- 插入、删除、隐藏、取消隐藏、移动行。
- 保留并重映射 raw row height。
- 在结构变化后重映射隐藏的 underlying row id。
- 为移动操作提供 row order normalization 规则。

## 文件职责

- `RowStructure.ts`：行领域接口与 context 端口。
- `DefaultRowStructure.ts`：默认行领域实现；执行 row 自身状态变化，并产出 row domain event。
- `RowOperation.ts`：行领域 operation 协议，例如 `MoveRowsOperation`。
- `RowEvent.ts`：行领域事件协议，例如 `RowsMoved`。
- `*RowsCommandHandler.ts`：row operation 执行器，调用行领域并分发事件。
- `RowRules.ts`：纯规则/算法，例如 row move normalization、row height snapshot、hidden row remap。

## 边界

- 本目录不依赖 DOM、canvas、runtime 或 web 包。
- `RowStructureContext` 只暴露 row 领域需要的最小端口，不传入完整 `GridEngine`。
- selection / undo 仍由 `DefaultGridEngine` 暂时协调；后续拆出对应领域后再迁移。
- 不使用泛化 `utils`。领域算法优先放在 `RowRules.ts`；变大后再拆成 `rules/` 子目录。
