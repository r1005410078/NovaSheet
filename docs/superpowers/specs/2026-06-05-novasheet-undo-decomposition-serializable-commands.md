# Undo 收口：可序列化数据命令 + 各域 undo handler

- 日期：2026-06-05
- 状态：设计（spec）。后续出 plan。
- 相关：`refactor-default-grid-engine-decomposition` 分支；
  `selection/SelectionController`、`format/FormatController`（写入门面先例）；
  `engine/undo/UndoReplay.ts`（已存在但**未接线**的脚手架）。

## 背景：当前 undo 架构的「精神分裂」

decomposition 分支按域名词（row/column/selection/format）拆出了写入面，但 undo 这个
**跨域动词**没动，反而随更多域 push 而耦合更紧：

- **写侧**：`SelectionController` / `FormatController` 构造 `UndoCommand`（`{kind:'merge',…}`）
  并 push —— 它们知道命令 schema。
- **恢复侧**：`DefaultGridEngine.applyUndo` / `applyRedo` 是两个 ~130 行的巨型 switch，
  处理全部 21 个 kind，反手 `formatStore.restore` / `selectionController.setSelection` /
  `applyEditCellWrite` …

一个逻辑操作被劈在两个文件，用中心化的 `UndoCommand` union（21 kinds）作耦合契约。
「会做 X 的人不会逆 X」。每加一个域，中心 switch 无界增长。`FormatController` 这次**复制**了
该分裂。更糟：`engine/undo/UndoReplay.ts` 定义了 `UndoReplayContext`（本该终结分裂的受控写入面），
**但 engine 根本没用它**——抽象写好、停在路边。

## 决策前提

undo 历史**要是可序列化的数据**（给 AI 读 / 协同 / 审计）。这排除了「命令自携行为闭包」
（最彻底但不可序列化）。目标 = **B 的可序列化基底 + A 的所有权下沉**：

- `UndoCommand` 保持**纯数据**（可序列化、可被 AI 读 / 审计 / 将来过网络）。
- 恢复**不是**中心 switch，也不是哑注册表：每个域注册自己的 `UndoHandler`，只认自己的 kind，
  调自己聚合的 `restore`。命令数据与其逆操作 handler **同住该域目录**。
- engine 退成：维护栈 + 按 kind 路由 + 实现各 handler 真正需要的受控能力面。

## 目标 / 非目标

**目标**
- 消灭中心 `applyUndo`/`applyRedo` switch：恢复按 kind 派发到各域 undo handler。
- `UndoCommand` 收敛为**可 JSON 序列化**的数据（审计每个 kind，消除非序列化引用）。
- 单域 kind 的 do+undo+redo 知识收进该域目录（如 format/merge 的逆操作进 `format/`）。
- 接线 `UndoReplay`，把 `UndoReplayContext` 收窄为各 handler 实际所需能力（非 engine 镜像）。

**非目标（明确不做）**
- CRDT / 操作变换 / 网络传输 / 多人合并 —— 本 spec 只交付「可序列化命令 + 本地按域恢复」基底。
- 命令携带行为（闭包）方案（不可序列化，与前提冲突）。
- 全量事件溯源（1M 行不可能重放百万 event，违 perf 基线）。
- forward mutation 的进一步搬迁（已由各 Controller 持有，不在本 spec）。

## 设计

### 1. 命令仍为纯数据，但归属下沉
`UndoCommand` 维持判别联合。考虑把每个 kind 的定义**就近**移到其拥有域
（如 `format/FormatUndoCommand.ts` 出 `format`/`merge`/`unmerge`），由中央 `UndoCommand.ts`
re-export 聚合 —— 与 row/column 的 `*Event` re-export 模式一致。降低中央文件的耦合磁铁效应。

### 2. 各域 UndoHandler
```
interface UndoHandler {
  /** 是否处理该命令 kind。 */
  handles(kind: UndoCommand['kind']): boolean
  applyUndo(command: UndoCommand, ctx: UndoReplayContext): void
  applyRedo(command: UndoCommand, ctx: UndoReplayContext): void
}
```
- `FormatUndoHandler`（format/merge/unmerge）：住 `format/`，与 `FormatController` 同域。
- `RowUndoHandler` / `ColumnUndoHandler`（insert/delete/hide/unhide/move/resize*）：住 row/column。
- `CellUndoHandler`（editCell/clearRange）。

### 3. UndoReplay = 派发器（取代中心 switch）
`UndoReplay` 持有 handler 列表 + `UndoReplayContext`，`undo(cmd)`/`redo(cmd)` 按 kind 找到
唯一 handler 委派。engine 的 `applyUndo`/`applyRedo` 删除，`undo()`/`redo()` 改调 `UndoReplay`。

### 4. 受控能力面收窄
现有 `UndoReplayContext`（applyCellWrite / restoreSelection / restoreFormat / restoreMerge /
rebuildRows / rebuildCols）是「engine 能力清单」。按 handler 实际所需拆分或收窄，避免它变成
另一个「narrow 化的 God Object」。engine 提供其实现。

### 复合命令问题（设计难点，须正面处理）
部分 kind **跨域**：`paste`（cells+格式+合并+选区）、`fill`（cells+格式+合并+选区）、
`moveRows`/`moveCols`（结构+格式+合并+选区）、`insert/deleteRows`（结构+格式+合并+选区）。
它们不属单一域。方案：

- **CompositeUndoHandler / 用例对象**：一个明确的「跨域用例」handler，按固定次序调用
  `ctx.restoreFormat` / `restoreMerge` / `restoreSelection` / `applyCellWrite` / `rebuild*`。
  它是合法的 application 用例（不是 engine），承认「这些操作本质跨域」。
- 关键：复合 handler 仅做**编排**（调能力面），不内联各域 restore 细节 —— 细节仍在各域。

> 取舍：纯「一 kind 一域」对复合命令不成立。承认复合用例的存在，比硬塞进某个域更诚实。

### 序列化审计（前提的硬约束）
逐 kind 核查并消除非 JSON-native 引用：
- `CellValue` 含 `Date` → JSON 非原生，需约定归一化（ISO string）或声明用 structured-clone。
- `deleteRows.snapshots: DeletedRowSnapshot[]`、`insertCols.newFields: Field[]` → 确认为纯数据。
- `FormatLayer[]` 快照 → 确认无类实例 / Map / 函数；`sameFormatLayers` 按引用比较暗示层为不可变对象，需验证其可序列化。
- `MergeRegion[]`、`GridSelection`、`CellRange`、`CellWrite` → 已是纯数据。
- 产出：一个 `assertSerializable(command)` 测试 helper + 每 kind round-trip（`JSON.parse(JSON.stringify(cmd))` 深等）测试，作为「可被 AI 读 / 审计」的可执行保证。

## 方案对比（恢复侧）

| 维度 | 现状中心 switch | 各域 handler + 派发（本案） | 命令自携行为（A） |
| --- | --- | --- | --- |
| 中心增长 | 无界 | 无（加域=加 handler） | 无 |
| 局部性 | 差 | 好（do/undo 同域） | 最好 |
| 可序列化 | 是（数据） | 是（数据） | **否（闭包）** |
| AI 读 / 协同 / 审计 | 可 | 可 | 不可 |
| 复合命令 | 内联 switch 分支 | 显式 composite 用例 | 命令内闭包 |
| 推荐 | — | ✅ | 与前提冲突 |

## 验收
- engine 不再有 `applyUndo`/`applyRedo` 巨型 switch；`undo()`/`redo()` 委派 `UndoReplay`。
- 每个 kind 有 round-trip 序列化测试（JSON 深等），CI 守住「命令是可序列化数据」。
- 各域 undo handler 有独立单元测试（不经 engine）。
- 现有 undo/redo 行为全绿（931+ 测试不回归）。
- `UndoReplay` 被 engine 接线，`UndoReplayContext` 按实际所需收窄并有文档。

## 风险
- **复合命令的次序**：undo/redo 中 format/merge/structural/selection 的 restore 次序敏感
  （现 switch 里已隐含固定次序），迁移须逐 kind 对拍，不可批量。
- **序列化审计可能暴露既有非数据引用**（如 Date / 类实例），需就地归一化，属真实工作量。
- **复合 handler 的归属争议**：它跨域，评审时需就「application 用例对象」达成一致，避免回流 engine。

## 迁移策略（增量、逐 kind、保持绿）
1. 先接 `UndoReplay` 派发骨架 + `CellUndoHandler`（editCell/clearRange，最简），engine 双轨。
2. 逐域迁 format/merge → row → column；每迁一组对拍 undo/redo 测试。
3. 复合命令（paste/fill/move/insert/delete）最后，引入 composite 用例 handler。
4. 全部迁完删除 engine 旧 switch。
5. 全程补 round-trip 序列化测试。
