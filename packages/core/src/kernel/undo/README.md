# Undo

负责 `UndoCommand` 的 undo/redo replay。**目标形态：core 提供通用「可逆操作栈 + 注册表 + 派发」，
具体每个 kind 的逆/重做语义归各域自治** —— 派发核心不认识任何具体 kind。

- Spec：`docs/superpowers/specs/2026-06-05-novasheet-undo-decomposition-serializable-commands.md`
- Plan：`docs/superpowers/plans/2026-06-05-novasheet-undo-m1..m4-*.md`

## 现状（M1–M4 完成，全 21 kind 迁完）

**收口完成**：全部 21 个 kind 的 undo/redo 经 `UndoRegistry` 派发到各域 undo handler，
`DefaultGridEngine` **已无** `applyUndo`/`applyRedo` 中心 switch；`undo()`/`redo()` 委派 `UndoReplay`。
- `editCell`/`clearRange`/`paste` → `engine/undo/CellUndoHandler`（M1）。
- `format`/`merge`/`unmerge` → `engine/format/FormatUndoHandler`（M2，与 `FormatController` 同域）。
- `resizeRow`/`resizeRowsMulti`/`hideRows`/`unhideRows` → `features/row/RowUndoHandler`（M3）。
- `resizeColumn`/`resizeColumnsMulti`/`hideCols`/`unhideCols` → `engine/column/ColumnUndoHandler`（M3）。
- `fill` → `engine/undo/FillUndoHandler`（M4，跨域，不属行/列结构）。
- `insertRows`/`deleteRows`/`moveRows` → `features/row/RowStructureUndoHandler`（M4，复合）。
- `insertCols`/`deleteCols`/`moveCols` → `engine/column/ColumnStructureUndoHandler`（M4，复合，含 frozen）。

M3+M4 顺带修了行结构 redo 仅换 axis 引用、不重建 frozen/viewport 的 latent bug（各 `*UndoContext`
统一 `rebuildRows()` 全重建，回归测试守）。

各域经 `registerXxxUndo(registry, ctx)` 自注册，composition root 平铺调用；派发核心 `UndoReplay`/
`UndoRegistry` 不认识任何具体 kind，未随加域改动。`UndoReplay` 无 fallback，未注册 kind 直接抛错；
完整性测试（`UndoRegistryCompleteness.test.ts`）守住全 21 kind 都有 handler。迁移期的
`UndoReplayContext`/`UndoReplayFallback` 脚手架已删除。

## 目标设计

1. **命令是纯可序列化数据**（AI 读 / 协同 / 审计）。`UndoCommand` 维持判别联合（内部类型安全）；
   开放信封 `{domain, kind, payload}` 留给后期真插件（另开 spec）。
2. **各域 `UndoHandler` 自持 ctx**：`domain` + `handles(kind)` + `applyUndo(cmd)` + `applyRedo(cmd)`；
   逆/重做逻辑与该域正向写入（`*Controller`/`*CommandHandler`）**同住一域**。
3. **`UndoRegistry` = 封闭/开放边界**：`register` / `resolve(kind)` / 完整性查询。
   `UndoReplay` 持 registry，按 kind 派发；未命中抛错（迁移期曾有 fallback 回退旧 switch，M4 已删）。
4. **各域 self-register**：每域导出 `registerXxxUndo(registry, ctx)`；engine composition root 平铺调用。
   **加一个域 = 写 handler + 提供注册函数 + composition 调一次，不动本目录派发核心、不改任何 switch。**
5. **每域一个最小 ctx**（`CellUndoContext` / `FormatUndoContext` / …），engine 实现，注册时注入；
   不复用单一大 `UndoReplayContext`（避免它变成 narrow 化的 God Object）。

## 目标目录结构（M1–M4 完成后）

```
engine/
├── DefaultGridEngine.ts            ← 删 applyUndo/applyRedo switch；持栈 + 装配 registry + 实现各域 ctx
├── undo/                           ← undo「核心 + 跨域」
│   ├── UndoHandler.ts              ★M1  UndoHandler 接口
│   ├── UndoRegistry.ts             ★M1  注册表（封闭/开放边界）
│   ├── UndoReplay.ts               ★M1  派发器（registry 派发，未命中抛错；fallback 已于 M4 删）
│   ├── CellUndoHandler.ts          ★M1  editCell / clearRange / paste（+ CellUndoContext + registerCellUndo）
│   └── FillUndoHandler.ts          ★M4  fill（跨域，不属行/列结构）
├── format/
│   ├── FormatController.ts         （正向，已有）
│   └── FormatUndoHandler.ts        ★M2  format / merge / unmerge（+ FormatUndoContext + registerFormatUndo）
├── row/
│   ├── *CommandHandler.ts          （正向，已有）
│   ├── RowUndoHandler.ts           ★M3  resizeRow / resizeRowsMulti / hideRows / unhideRows
│   └── RowStructureUndoHandler.ts  ★M4  insertRows / deleteRows / moveRows（复合）
├── column/
│   ├── *CommandHandler.ts          （正向，已有）
│   ├── ColumnUndoHandler.ts        ★M3  resizeColumn / resizeColumnsMulti / hideCols / unhideCols
│   └── ColumnStructureUndoHandler.ts ★M4 insertCols / deleteCols / moveCols（复合，含 frozen）
└── …（selection / event / operation / layout 不变）

../undo/                            ← undo 数据（非 engine）
├── UndoCommand.ts                  保持纯可序列化数据（后期可按域拆 + re-export）
└── UndoStack.ts
```

★ = 新增。`*UndoContext` 与 `registerXxxUndo` 默认并入对应 handler 文件，避免文件爆炸。

## 里程碑路线（dual-track 增量，已全部完成）

| 里程碑 | handler | kind | 状态 |
| --- | --- | --- | --- |
| M1 | `CellUndoHandler` + `UndoRegistry`/`UndoReplay` 骨架 | editCell / clearRange / paste | ✅ |
| M2 | `FormatUndoHandler` | format / merge / unmerge | ✅ |
| M3 | `Row/ColumnUndoHandler` | resize* / hide* / unhide*（8 单域结构）| ✅ |
| M4 | `Fill/Row/ColumnStructureUndoHandler` + 删旧 switch | fill / move / insert / delete（7 复合）| ✅ |

M1–M3 迁移期旧 switch 作 fallback；M4 在 `UndoRegistry` 覆盖全 21 kind（完整性测试守）后已统一删除。

## 边界

- 本目录不依赖 DOM / canvas / runtime / web 包。
- 派发核心（`UndoRegistry`/`UndoReplay`）不含任何具体 kind 知识。
- 复合（跨域）命令走显式 application 用例 handler，仅**编排**能力面、不内联各域 restore 细节。
- restore 次序敏感（结构→format→merge→selection / writes→format→merge→selection），逐 kind 原样保留。
- engine 是各域 ctx 的实现宿主（合法剩余职责）；评审守「能力面实现不回流业务逻辑」。
