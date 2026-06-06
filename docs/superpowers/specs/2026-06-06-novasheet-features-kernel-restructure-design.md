# core 重组为 features/ + kernel/ 两层架构

- 日期：2026-06-06
- 状态：设计（spec）。后续出 plan。
- 分支：`refactor-default-grid-engine-decomposition`
- 范围：`packages/core/src/` 顶层目录重组。纯结构重命名/搬移，零行为变化。

## 背景与动机

`packages/core/src/` 当前是**混合式**组织：
- 一部分按领域（`engine/<domain>`：row/column/selection/format/layout/undo/event/operation）。
- 一部分按层/关注点（`data/`、`geometry/`、`render/`、`measure/`、`theme/`）。
- 且**同名领域被拆在两处**：`format/`（store）vs `engine/format/`（controller/handler）；
  `undo/`（命令数据 + 栈）vs `engine/undo/`（registry/replay/handler）。

用户目标（四项均认同）：消除同名分裂、统一顶层风格、提升「找某功能在哪」的可发现性、对齐
feature-sliced 的领域内聚直觉。

**决策（已确认）**：两层架构 `features/` + `kernel/`，全量终态 + 增量迁移（一域一 commit、每步绿）。

## 核心原则：单一 feature 主人测试

> 一段代码**有没有单一功能主人**——没有 → `kernel/`；有 → 那个 `features/<domain>/`。

实为**三层**（依赖单向，上层依赖下层，下层绝不反依赖）：

| 层 | 依赖 | 内容 |
| --- | --- | --- |
| `kernel/` | 不依赖任何上层 | 平台无关**原语** + **跨域协议** + undo 机制 + 交互基建 |
| `features/` | 只依赖 `kernel/` | 行/列/选区/格式/合并/填充/排序筛选/编辑等**行为领域**（垂直切片：store + controller + operation + event + handler + undo-handler + rules 合一） |
| `engine/`（组合根） | 依赖 `kernel/` + `features/` | `DefaultGridEngine`（组装各域、持事件管线/undo registry）+ `GridEngine` facade |

> **组合根悖论**：`DefaultGridEngine` import 所有 feature（它的职责就是把各域接起来），故它**不能在
> kernel**（否则 kernel 依赖 feature）。组合根天然在**最外层**，保留顶层 `engine/`，只装这两个文件。
> 顶层最终 = `kernel/` + `features/` + `engine/` + `index.ts` + `types.ts`。

典型对照：`MergeStore`（合并怎么存）→ `features/merge`；`CoordinateSpace`（坐标怎么翻译，
合并/排序/隐藏都要用）→ `kernel/coords`。

## 目标结构

### `kernel/` — 底座 + 协调 + 协议

| kernel 子目录 | 来源 | 内容 |
| --- | --- | --- |
| `geometry/` | `geometry/` | `ChunkedAxis`/`Viewport`/`FrozenRegions`/`columnLetter`/`range` |
| `data/` | `data/` | `DataSource`/`MutableDataSource`/`Schema`/`InMemoryDataSource` |
| `theme/` | `theme/` | `Theme` token 树 + `denseGridTheme` |
| `measure/` | `measure/` | 文本测量 |
| `render/` | `render/` | `RenderFrame` 输出契约 |
| `util/` | `util/` | 通用工具 |
| `coords/` | `coords/` + `view/CoordinateSpace`、`view/coordinates` | view↔raw 坐标翻译 |
| `protocol/` | `engine/operation/`（`GridOperation`/`GridTransaction`）+ `engine/event/`（`GridDomainEvent`/`GridEventPipeline`） | 跨域协议：发生前 operation / 发生后 event + 固定事件管线 |
| `undo/` | `undo/`（`UndoCommand`/`UndoStack`）+ `engine/undo/`（`UndoRegistry`/`UndoReplay`/`UndoHandler` 接口 + `registerCellUndo` 之类的机制） | undo **机制 + 栈 + 命令 union**，**不认识任何具体 kind** |

### `features/` — 行为领域

| feature | 来源（合并同名分裂） |
| --- | --- |
| `row/` | `engine/row/*` + `engine/AutofitRowHeights` + `RowUndoHandler`/`RowStructureUndoHandler` |
| `column/` | `engine/column/*`（含 `Column*UndoHandler`） |
| `selection/` | `engine/selection/*` |
| `layout/` | `engine/layout/*`（`DefaultLayoutState`） |
| `format/` | `format/*`（`CellFormat`/`RangeStyleStore`/`BorderPreset`）+ `engine/format/*`（`FormatController`/`FormatEventHandler`/`FormatUndoHandler`）+ `engine/VisibleFormatResolver` |
| `merge/` | `merge/MergeStore` + `engine/MergeViewResolver` |
| `fill/` | `fill/*` + `engine/FillStylePropagator` + `engine/undo/FillUndoHandler` |
| `clipboard/` | `clipboard/*` |
| `view/` | `view/`（`SortLayer`/`FilterLayer`/`HideRowsLayer`/`ViewLayer`/`ViewPipeline`） |
| `edit/` | `interaction/CellEdit`/`CellEditModel` + `engine/undo/CellUndoHandler` |
| `context-menu/` | `interaction/ContextMenuModel` |

### 已定的判断点

1. **undo 按职责切两半**：派发核心（`UndoRegistry`/`UndoReplay`/`UndoHandler`/`UndoStack`/`UndoCommand`）
   → `kernel/undo`；**各域逆操作 handler 跟 feature 走**（Row/Column/Format/Fill/Cell handler 各归 row/
   column/format/fill/edit）。判准：`kernel/undo` 不认识任何具体 kind；一段代码知道「某 kind 怎么逆」就有
   feature 主人。**本次重组顺带让第 5 步更彻底**——今 `engine/undo/` 残留的 `CellUndoHandler`/`FillUndoHandler`
   各归 edit/fill，`kernel/undo` 变成纯机制、零具体 handler。`UndoCommand` 中央 union 暂留 kernel（「按域拆 +
   re-export」是第 5 步 spec 提过的可选后续，本次不做，避免范围爆炸）。
2. **`interaction/` 拆分**：`CellEdit`/`CellEditModel` → `features/edit`，`ContextMenuModel` → `features/context-menu`；
   `HitTest`/`CellLayout`/`HandleLayout`/`scrollCellIntoView` 是交互基建 → `kernel/interaction`（非 feature）。
3. **`coords` 归 kernel**：坐标翻译被引擎与各域共用。
4. **第 7 步折进本次**：engine 重构第 7 步（format/merge 协调收口）本就要落到 format/merge 域；直接在
   `features/format`、`features/merge` 的迁移里一并完成，不做两遍。

## 不变量与边界

- **公共 API 不变**：`packages/core/src/index.ts` 按**名字** re-export；`@novasheet/web` /
  `@novasheet/web-canvas2d` / storybook 都从 `@novasheet/core` 桶导入，不深引内部路径 → 外部包零改动。
  本次只改 core **内部相对 import 路径** + `index.ts` 的内部来源路径。
- **feature 之间不直接相互 import mutation API**：跨域通信仍走 `kernel/protocol` 的事件管线（已有约束，
  迁移须保持）。feature 可依赖 kernel；kernel 不依赖 feature。
- **engine 领域不变量保留**（见 `engine/README.md`）：固定事件管线、operation/event/undo 三协议区分、
  领域对象不接收完整 engine 等——只换位置，不换规则。

## 非目标（明确不做）

- 不改任何运行时行为、不改公共 API 形状、不动 `Viewport`/`ChunkedAxis`/各 store 的实现。
- 不把 `UndoCommand` union 按域拆（留作后续可选）。
- 不拆 `view/` 的 sort/filter/hide 为三个独立 feature（保持 ViewPipeline 一体；如需再议）。
- 不引入运行时插件系统（feature 仍是内部模块，非动态插件）。
- 不动 `@novasheet/web` / `@novasheet/web-canvas2d` 内部结构（本 spec 只管 core）。

## 迁移策略（增量、逐域、保持绿）

每步一个 `git mv` 批次 + import 路径重写 + 全量验证（`bun test` / 4 包 typecheck / lint），单 commit。
建议顺序（先 kernel 底座、后 features，依赖在前）：

1. **kernel 底座搬移**：`geometry`/`data`/`theme`/`measure`/`render`/`util`/`coords` → `kernel/*`
   （这些被广泛依赖，先落位减少后续反复）。
2. **kernel 协调 + 协议**：`engine/{DefaultGridEngine,GridEngine}` → `kernel/engine`；
   `engine/operation` + `engine/event` → `kernel/protocol`；`engine/undo` 派发核心 + `undo/*` → `kernel/undo`；
   `interaction` 基建（HitTest/CellLayout/HandleLayout/scrollCellIntoView）→ `kernel/interaction`。
3. **features 逐域**：row → column → selection → layout → format（折第 7 步）→ merge → fill → clipboard →
   view → edit → context-menu。每域把 `engine/<domain>` + 对应顶层 store + 对应 undo-handler + 对应 engine
   helper（resolver/propagator）搬到 `features/<domain>`，重写 import，单 commit。
4. **收尾**：更新 `index.ts` 内部来源路径；重写 `engine/README.md` → 顶层 `ARCHITECTURE` 或 `kernel/`+`features/`
   各自 README（两层职责、单一主人判准、feature 模板）；更新 `CLAUDE.md`「What goes where」表与
   `docs/architecture.md` 路径。

> 每个 feature 目录沿用 row 域模板（operation/event/rules/handler/undo-handler + README）；本次只搬移与并合，
> 不为对称硬造空文件。

## 风险

- **改动面大**：触及 core 几乎整张内部 import 图（数百处）+ 多个 README。机械但量大；逐域分批 + typecheck
  兜底 + 每步全绿是控险手段（参照本分支 geometry 改名的成功先例）。
- **与第 7 步耦合**：format/merge 域迁移与第 7 步协调收口同时发生，须先有第 7 步的设计共识再迁该域（format
  迁移任务前置一个第 7 步小设计，或把第 7 步并入 format feature 的 plan）。
- **目录边界争议**：interaction 拆分、view 是否再拆、undo-handler 归属——本 spec 已定调，执行中如发现更优归类，
  按 CLAUDE.md「先改 spec/plan 再实现」处理。
- **`git mv` 嵌套坑**：目标目录若已存在会被套成子目录（geometry 改名时已踩过）——plan 每步先确认目标目录状态。

## 验收

- `packages/core/src/` 顶层只剩 `kernel/`、`features/`、`engine/`（仅组合根 `DefaultGridEngine`/`GridEngine`）、
  `index.ts`、`types.ts`（无散落的按层/按域混合目录）。依赖单向：`kernel/` ← `features/` ← `engine/`。
- 同名分裂消除：`format`/`undo`/`merge` 各自一处。
- `kernel/undo` 不含任何具体 kind handler（纯机制）；各域 undo-handler 在对应 `features/<domain>`。
- 公共 API（`index.ts` 导出名）不变；`@novasheet/web`/`web-canvas2d`/storybook 零改动。
- 全程纯重构零行为变化：每步 `bun test` 全绿（当前 1028）、4 包 typecheck、lint 全绿。
- 文档同步：两层 README + `CLAUDE.md` + `docs/architecture.md`。
