# Layout 抽离：DefaultLayoutState 聚合根（engine 重构第 6 步）

- 日期：2026-06-05
- 状态：设计（spec）。后续出 plan。
- 分支：`refactor-default-grid-engine-decomposition`
- 相关：engine 重构第 1–5 步已完成（row/column/selection 内化、undo 拆解）；本步对称 row/column
  内化，把 layout 初始化与 rebuild 规则从 `DefaultGridEngine` 抽成自持状态的聚合根。
- 前置阅读：`packages/core/src/engine/README.md`（重构总进度第 6 步）、
  `packages/core/src/engine/layout/README.md`（layout 领域职责与约束）。

## 背景：layout 逻辑散落在 engine

`DefaultGridEngine` 仍亲自持有并装配 layout 状态（`rowsAxis`/`colsAxis`/`frozen`/`viewport`），
相关规则散在 ~8 个私有方法里，且 `rebuildViewAxis`/`rebuildViewColsAxis` 近乎逐字重复
（snapshot → 重建 frozen+viewport → 还原 snapshot）。`engine/layout/LayoutState.ts` 已有骨架，
但只是值接口，且 `LayoutStateInput` 引用 `rawRowsAxis`/`rawColsAxis`/`hiddenFieldIds` —— 在 row/column
内化（结构自持 raw axis + hidden、对外仅给 `getViewRowsAxis()`/`getViewColsAxis()`）之后已脱节，从未接线。

row/column/selection 已走完「聚合根自持状态」路线；layout 是 engine composer 仍亲自背的最后一大块结构状态。

## 决策前提（已与用户确认）

1. **形态：有状态聚合根**，对称 row/column 内化。新建 `DefaultLayoutState` 自持
   `rowsAxis`/`colsAxis`/`frozen`/`viewport`，engine 委派；不取「无状态 builder」或「仅收敛重复」。
2. **push 模型**（遵 `layout/README.md`「layout 不直接调用 row/column/selection/undo/format mutation API」）：
   engine 从结构 pull `getViewRowsAxis()`/`getViewColsAxis()`，push 给 layout 重建；layout 不反向调结构。
3. **并入范围**：除核心 frozen+viewport+view axes + rebuild 外，下列跨切逻辑一并并入：
   - frozen 配置 remap（`syncFrozenAfterColInsert`/`syncFrozenAfterColDelete`）。
   - frozenConfig / sheet chrome 初始化（`resolveFrozenConfig` + `applySheetChrome`）。
   - theme 派生默认值（`resolveDefaultRowHeight` + `averageColWidth`）。

## 目标 / 非目标

**目标**
- 新建 `DefaultLayoutState` 聚合根（富接口 `LayoutState` + 实现），自持上述状态，对外暴露受控读写面。
- `DefaultGridEngine` 删除 4 个 layout 字段 + 8 个 layout 私有方法，改持 `private layout`，全部委派。
- 消除 `rebuildViewAxis`/`rebuildViewColsAxis` 的重复（内部共享 viewport 重建 helper）。
- 替换脱节的 `LayoutState.ts` 骨架（删 `LayoutStateInput`，代以富 `LayoutState` 接口）。

**非目标（明确不做）**
- 不引入行为变化。纯重构：rebuild 已是全重建（M3/M4 已修「redo 仅换 axis」bug），不再调整渲染/滚动语义。
- 不把 frozen 远未实现的象限绘制、frozen 交互等纳入（仍 M3 范畴）。
- 不动 row/column/selection/undo/format 领域；不改 `Viewport`/`FrozenRegions`/`ChunkedAxis` 自身实现。
- 不把 `coords`（坐标翻译器）并入 layout（其归属另议，本步不动）。

## 设计

### 两阶段生命周期（因默认值回调的鸡生蛋）

`resolveDefaultRowHeight`/`averageColWidth` 被注入 row/column 结构构造器，必须**先于**结构；而
frozen/viewport 需结构的 view axis，必须**后于**结构。故聚合根分两阶段：

1. **构造**（纯 theme/schema 派生，不需 axes）：
   ```
   new DefaultLayoutState({
     theme, explicitDefaultRowHeight, excelHeaders,
     frozenInput,                 // options.frozen，构造时归一为 {topRows,leftCols,rightCols}
     getSchema: () => Schema,     // averageColWidth 读 fields（允许读 DataSource）
   })
   ```
   构造后即可答 `resolveDefaultRowHeight()` / `averageColWidth()`。
2. engine 用这两个回调建 `DefaultRowStructure` / `DefaultColumnStructure`。
3. **initView**：`layout.initView(viewRowsAxis, viewColsAxis)` —— 建 frozen（从持有的 frozenConfig）+
   viewport（`setHeaderHeight(theme.metrics.headerHeight)`）+ `applySheetChrome()`。

### 聚合根接口面（`LayoutState`）

| 方法 | 职责 | 替代 engine 现状 |
| --- | --- | --- |
| `resolveDefaultRowHeight(): number` | `explicitDefaultRowHeight ?? theme.metrics.rowHeight` | 同名私有方法 |
| `averageColWidth(): number` | schema fields 平均宽（空 schema → 100，下界 1） | 同名私有方法 |
| `initView(rowsAxis, colsAxis): void` | 全新装配 frozen+viewport+chrome，保留持有的 frozenConfig | constructor 尾段 + `rebuildData` 尾段 |
| `rebuildRows(rowsAxis): void` | 换 rowsAxis + 重建 frozen/viewport **保留当前 snapshot** | `rebuildViewAxis`（去重） |
| `rebuildCols(colsAxis): void` | 换 colsAxis + 重建 frozen/viewport **保留当前 snapshot** | `rebuildViewColsAxis`（去重） |
| `applyTheme(theme): void` | 更新持有 theme，`viewport.setHeaderHeight(theme header)` + `applySheetChrome()` | `setTheme` 中 viewport/chrome 段 |
| `remapFrozenAfterColInsert(at, count, oldTotalCols): void` | frozen 配置左/右冻结列随插入移位 | `syncFrozenAfterColInsert`（参数显式化） |
| `remapFrozenAfterColDelete(removedIndices, totalColsBefore): void` | frozen 配置随删除收缩 | `syncFrozenAfterColDelete` |
| `setFrozenConfig(config): void` | 直接设置 frozen 配置（undo `restoreFrozen` 用） | `frozen.setFrozen(config)` |
| `setViewportSize(w, h)` / `setScroll(x, y)` / `setHeaderHeight(h)` | viewport mutator 委派 | 同名 engine 方法改委派 |
| `getRowsAxis()` / `getColsAxis()` / `getViewportSnapshot()` | getFrame / getRowsTotalSize 读取面 | 字段直读 |
| `getFrozenConfig()` | 读当前 frozen 配置（部分远程/调试） | `frozen.getFrozenConfig()` |

- `initView`、`rebuildRows`、`rebuildCols` 内部共享私有 `recreateViewport(opts)`：构造 `FrozenRegions` +
  `Viewport`，按 `opts` 决定 header/尺寸/滚动是「取 theme + 默认」（initView）还是「保留传入 snapshot」（rebuild*）。
  这是消除当前两份逐字复制的落点。
- `remapFrozenAfter*` 接收**显式数值参数**（`oldTotalCols` / `totalColsBefore`），不在 layout 内读 schema 的
  「当前/之前」时机（现 `syncFrozenAfterColInsert` 读 `schema.fields.length - count` 推断 oldTotal，易错）；
  由 engine 在调用点算好传入，layout 只做配置数学。

### 平台无关边界（已是 `layout/README.md` 约束）

- layout 仅依赖 `ChunkedAxis`/`FrozenRegions`/`Viewport`/`Theme`/`DataSource`（读 schema），**不依赖** DOM/canvas。
- layout **不调用** row/column/selection/undo/format 的 mutation API（push 模型保证）。
- 事件/undo/坐标翻译不在本领域。

### engine 改造

- 删字段：`rowsAxis` / `colsAxis` / `frozen` / `viewport`；改持 `private layout: DefaultLayoutState`。
- 删方法：`resolveDefaultRowHeight` / `rebuildViewAxis` / `rebuildViewColsAxis` / `resolveFrozenConfig` /
  `averageColWidth` / `applySheetChrome` / `syncFrozenAfterColInsert` / `syncFrozenAfterColDelete`。
- 构造：先建 `layout`，用 `layout.resolveDefaultRowHeight` / `layout.averageColWidth` 建结构，再
  `layout.initView(rowStructure.getViewRowsAxis(), columnStructure.getViewColsAxis())`。
- `rebuildData`（setData）：重建结构后 `layout.initView(...)`（initView 保留持有的 frozenConfig，
  与现状 `this.frozen.getFrozenConfig()` 语义一致；viewport 用 theme header + 默认尺寸，与现状一致）。
- mutation 路径 / undo ctx 的 `rebuildRows`/`rebuildCols`/`restoreFrozen`：改指
  `layout.rebuildRows(this.rowStructure.getViewRowsAxis())` / `layout.rebuildCols(...)` /（frozen restore 经
  `layout` 暴露的 frozen 写入，见下）。
- `setTheme`：`layout.applyTheme(theme)`；条件「无显式行高 → `rowStructure.setDefaultRowHeight` +
  `layout.rebuildRows(...)`」留 engine（触 rowStructure）。
- 列结构事件后的 frozen remap：engine 在调用点算 `oldTotalCols`/`totalColsBefore`，调
  `layout.remapFrozenAfterColInsert/Delete(...)`。
- `getFrame` / `getRowsTotalSize` / `getColsTotalSize` / viewport mutator：改读/委派 `layout`。

> frozen restore（undo `restoreFrozen(config)`，现为 `this.frozen.setFrozen(config)`）：engine undo ctx 改指
> `layout.setFrozenConfig(config)`（见接口表）。

## 方案对比（形态）

| 维度 | 有状态聚合根（本案） | 无状态 builder | 仅收敛重复 |
| --- | --- | --- | --- |
| 与 row/column 一致 | ✅ 对称 | 部分 | 否 |
| engine composer 瘦身 | 大（删 4 字段 + 8 方法） | 中 | 小 |
| 改动面 / 风险 | 大但纯重构 | 中 | 小 |
| 后续可演进（layout 自治） | 最好 | 中 | 差 |
| 推荐 | ✅ | — | — |

## 验收

- `DefaultGridEngine` 无 layout 字段（rowsAxis/colsAxis/frozen/viewport）与上述 8 个 layout 私有方法；
  改持 `layout` 并全部委派。
- `rebuildViewAxis`/`rebuildViewColsAxis` 的重复消除（聚合根内单一 `recreateViewport`）。
- `LayoutState.ts` 脱节的 `LayoutStateInput` 删除，代以富 `LayoutState` 接口 + `DefaultLayoutState` 实现。
- `DefaultLayoutState` 有隔离单元测试（initView 装配 / rebuild 保留 snapshot / frozen remap / 默认值派生 /
  applyTheme）；engine 回归全绿（getFrame 几何、resize/hide redo viewport 不陈旧的既有回归测试、setData/setTheme/
  列插删 frozen remap）。
- **零行为变化**：现有 1017 测试不回归；4 包 typecheck、lint 全绿。

## 风险

- **构造顺序**：两阶段（默认值回调先于结构、initView 后于结构）必须保持；plan 须把构造序列写死并测。
- **两种 rebuild 语义**：initView（theme header + 默认尺寸）vs rebuild*（保留 snapshot）不可混用，逐路径对拍现状。
- **frozen remap 参数**：把 `oldTotalCols`/`totalColsBefore` 的计算从 layout 移到 engine 调用点，须与现
  `syncFrozenAfterCol*` 的取数逐字对拍，避免 off-by-count。
- **改动面大**：getFrame / 所有 mutation 路径 / undo ctx 都改读 layout；逐组迁移、保持绿，不可批量。

## 迁移策略（增量、保持绿）

1. 先建 `DefaultLayoutState` + 富 `LayoutState` 接口（含 `recreateViewport`），隔离单元测试覆盖
   initView / rebuildRows/Cols（snapshot 保留）/ frozen remap / 默认值 / applyTheme。**engine 暂不接线**。
2. engine 构造与 `rebuildData` 改用 `layout`（默认值回调 + initView），删对应字段/方法，回归对拍。
3. mutation 路径 + undo ctx 的 rebuild/frozen restore 改指 layout，回归对拍。
4. `setTheme` / 列插删 frozen remap / viewport mutator / getFrame 读取面改委派，删剩余 layout 私有方法。
5. 删 `LayoutStateInput` 脱节骨架；engine README 第 6 步标 ✅，下一步候选改第 7 步。
