# NovaSheet Feature Package 拆分总计划

> **用途：** 这是 feature package 重构的总路线图。每完成一个大的能力拆包，就在这里打勾。具体实施细节写在对应的单项实施计划里。

**目标：** 把历史上已经做完、已经验证过的产品能力，从固定内置在 `@novasheet/web` / `DefaultGridEngine` 的形态，逐步整理成可通过 `SheetContext` 安装的 feature package。

**原则：**

- 优先移动旧代码，不重写旧功能。
- 每个 feature package 对应一个用户可感知、可安装、可替换或可禁用的能力。
- `@novasheet/core` 保持 DOM-free，只提供 contracts / context / engine kernel。
- `@novasheet/web` 提供 browser runtime contribution contracts，不默认拥有产品能力。
- `@novasheet/sheet` 是默认 assembled product，负责安装默认 features。
- 每个大的 feature 拆包必须有独立计划、独立测试、独立提交。

---

## Feature Package 架构模型

Feature package 的目标不是引入复杂插件系统，而是把“能力声明”和“默认产品装配”分开。拆出的包通过 `SheetContext` 注册能力，runtime 只消费 contribution，不反向依赖具体 feature。

### 分层职责

| 层 | 包 | 负责 | 不负责 |
|---|---|---|---|
| Kernel | `@novasheet/core` | `createSheetContext()`、extension registry、engine contracts、DOM-free 状态内核、**所有 mutation/语义状态**（不变量 #2） | 浏览器 DOM、Canvas、交互层实现 |
| Platform contracts | `@novasheet/web` / `@novasheet/canvas2d` | browser/canvas 运行时契约（contribution 词汇表：drag / frame-sync / menu / keyboard / command / cell-type）、renderer contract、DOM host、runtime kernel（orchestrator + scroll + 基线选区） | 默认安装哪些能力、具体 feature 实现 |
| Feature packages | `@novasheet/feature-*` | 一个用户可感知能力的**交互层竖切片**（drag + DOM layer/overlay + popover + style + menu/keyboard/command 贡献 + 测试）与 `installXxx(ctx)` 注册函数 | 创建 `Grid`、默认装配、跨 feature 总控、**引擎语义 mutation（留在 core engine）** |
| Product assembly | `@novasheet/sheet` | 对外 `Grid` 门面、默认 `installDefaultExtensions(ctx)` 组合（功能清单 BOM） | 具体 feature 内部实现 |

> **关键约束（2026-06-02 厘清）：** 受不变量 #2「所有 mutation 走 `DefaultGridEngine`」约束，每个能力天然被切成两半——**交互半边**（drag/overlay/popover/menu/keyboard）可进 feature 包，**语义半边**（mutation/持久状态）锁在 `@novasheet/core` engine。feature 包是「交互-only 包」，不拥有自己的 engine mutation。要让语义也进包，必须另起一轮 brainstorm 做 **engine 可扩展**（feature 向 engine 注册 mutation/command/state）——这碰锁定 ADR，目前**显式推迟**，不在本路线图范围内。

### 注册与组合方式

外部用户可以创建自己的 `SheetContext`，选择安装哪些能力：

```ts
import { createSheetContext } from '@novasheet/core'
import { installResizeFeature } from '@novasheet/feature-resize'
import { installRowColumnReorder } from '@novasheet/feature-row-column-reorder'
import { Grid } from '@novasheet/sheet'

const ctx = createSheetContext()

installResizeFeature(ctx)
installRowColumnReorder(ctx)

new Grid(container, {
  data,
  context: ctx,
})
```

默认产品包则集中组合内置能力：

```ts
export function installDefaultExtensions(ctx: SheetContext): void {
  installBasicCells(ctx)
  installResizeFeature(ctx)
  installRowColumnReorder(ctx)
}
```

### Feature 包内部形态

每个 feature 包导出一个明确的安装函数。安装函数只做注册，不主动创建 `Grid`，不直接寻找全局实例：

```ts
export function installResizeFeature(ctx: SheetContext): void {
  registerWebDrag(ctx, {
    id: 'resize',
    order: 10,
    create: (deps) => new ResizeDrag({
      engine: deps.engine,
      host: deps.host,
      handleLayer: deps.handleLayer,
    }),
  })
}
```

同一个 feature 里可以注册多个 contribution，例如 cell type、command、web drag、menu item。共享逻辑放在 feature 包内部模块里，避免把私有 helper 暴露给 `core`。

### Runtime 衔接规则

- `@novasheet/web` 不 import `@novasheet/feature-*`。
- `WebGridRuntime` 从 `ctx` 读取已注册 contribution，并在合适生命周期调用它们。
- runtime 通过 deps 注入当前实例对象，例如 `engine`、`host`、`overlay`、`handleLayer`。
- feature 不保存全局 current grid；需要实例能力时，通过 deps 或 `ctx.run(scope, fn)` 提供的 scope handle 获取。
- 未安装 feature 时，runtime 必须 no-op，不 crash。

### 默认组合与按需组合

- 用户不传 `context` 时，`@novasheet/sheet` 创建内部 ctx 并执行 `installDefaultExtensions(ctx)`，保持默认 `Grid` 行为不变。
- 用户传入自定义 `context` 时，由用户决定安装哪些 feature；这用于精简包体、禁用能力、替换能力或做实验。
- 多个 `Grid` 可以共享同一个 ctx，共享同一组 extension registry；每个 `Grid` 的运行时实例仍由 runtime deps 区分，不靠全局单例。

### 拆包边界判断

一个模块适合成为 feature package，需要同时满足：

- 用户可感知：例如拖拽排序、resize、填充柄、编辑、剪贴板、右键菜单。
- 可以通过注册点接入：例如 drag contribution、cell extension、command、menu contribution。
- 禁用后 runtime 能合理降级：没有该 contribution 时不报错。
- 内部 helper 不单独拆包：例如 normalizer、index map builder、overlay rect calculator，优先跟随所属 feature 或 engine。

---

## 隔离目标与拆包策略（2026-06-02 修订）

**北极星目标：** 扩展一个已有能力，只动它自己的包。加一个新能力，触点收敛到最小且可预测。

### 加一个功能要动哪块（终局，已排除「扩展共享契约」——那按设计不算动代码）

| 功能类型 | feature 包 | `sheet`（装配 BOM） | `core`（engine） | `web`（契约） |
|---|---|---|---|---|
| opt-in，复用现有 mutation（外部自组 ctx） | ✏️ 只这里 | — | — | 排除 |
| 默认开，复用现有 mutation | ✏️ | 1 行 `installX(ctx)` + 1 条 dep | — | 排除 |
| 引入新语义/新持久状态 | ✏️ | 1 行 install + dep | ✏️ 新 mutation/store | 排除 |

两个残留触点，各自不可消除的理由：

- **`sheet` 一行装配 = BOM 登记，不算实现改动。** 默认产品必须声明自己装了什么（同 DI 容器登记）。opt-in 功能（用户自组 ctx）连这行都不需要。
- **`core` 新 mutation = 不变量 #2 的硬地板。** 带新语义的功能其写操作必须落 core engine。这块随 engine mutation 词汇表成熟而**渐近归零**：功能若只是用新方式触发已有 mutation（`setCell`/`setTextWrap`/`mergeCells`/`setFillColor`…）就不碰 core；只有引入全新状态种类才落 core。

### 完成定义（每个 feature 对着这把尺子拆）

> - 加一个**纯交互**功能（复用现有引擎语义）= 只动它自己的包（+ 默认产品一行 BOM 登记）。
> - 加一个**带新语义**的功能 = 额外只在 `core` engine 放那条新 mutation。
> - 二者都**不**需要动 `web`——前提是它需要的交互契约已在词汇表里；新契约按规则不算动代码。

### 竖切片拆包策略（取代「只搬状态机」）

每个 feature 拆**整条交互竖切片**，不是只搬 drag state machine：drag + DOM layer/overlay + popover + style + menu/keyboard/command 贡献 + 测试，一次搬齐。

> **历史债务：** phase 1（reorder）/ phase 2（resize）只搬了 drag state machine，overlay/popover/menu/keyboard/style 仍赖在 `@novasheet/web`，属**半拆**状态。需在对应契约就绪后**回补**为整竖切片，否则「改 resize 只动 resize 包」仍不成立。见 phase 14 回补项。

### 契约词汇表先行（决定 phase 顺序）

「只动自己的包」要求 feature 需要的交互契约已存在。词汇表建设状态：

| 契约 | 状态 / 由谁建 | 解锁谁的完整隔离 |
|---|---|---|
| drag | ✅ phase 0 | reorder / resize / fill / selection |
| cell-type | ✅ 已有 | basic-cells |
| frame-sync（overlay 每帧同步生命周期） | ⏳ phase 3（fill 这轮造，作为可选能力探测，非独立 contribution point） | fill / resize handle / reorder overlay |
| menu-item | ❌ phase 6（context-menu 造） | resize 菜单 / structure / sort-filter / merge / format |
| keyboard | ❌ 待建（建议并入 context-menu 或独立小 task） | 键盘 resize / 编辑快捷键 |
| command | ❌ 待建 | undo/redo 决策、跨 feature 动作 |

排序原则升级为：**先建契约词汇表，再让消费它的 feature 整竖切片落地。** menu/keyboard 契约就绪前，resize/structure/sort-filter 无法真正隔离，只能维持半拆。

---

## 总进度

状态图例：`[x]` 完成（满足下方「打勾规则」） · `[~]` 半拆（仅搬部分竖切片，余下待回补） · `[ ]` 未开始。

| 状态 | 阶段 | Feature | 目标包 | 实施计划 | 验收口径 |
|---|---:|---|---|---|---|
| [x] | 0 | Feature contribution 基座 | `@novasheet/core` / `@novasheet/web` | `2026-06-02-novasheet-row-column-reorder-feature-package.md` Task 1-2 | `SheetContext` 支持 generic contributions；`web` 支持 typed drag contributions |
| [~] | 1 | 行列拖拽排序 | `@novasheet/feature-row-column-reorder` | `2026-06-02-novasheet-row-column-reorder-feature-package.md` | **半拆**：drag 已进包；`ColumnReorderOverlay`/`RowReorderOverlay` 仍在 web，待 phase 14 回补 |
| [~] | 2 | 行高列宽 resize | `@novasheet/feature-resize` | `2026-06-02-novasheet-resize-feature-package.md` | **半拆**：`ResizeDrag` 已进包；`DomHandleLayer`/popover/style/键盘/菜单仍在 web，待 phase 14 回补 |
| [x] | 3 | 填充柄 | `@novasheet/feature-fill-handle` | `2026-06-02-novasheet-fill-handle-feature-package.md` | 首个**整竖切片**：`FillHandleController`(Drag+WebFrameSync) + `DomFillHandleLayer` 进包；web 新增 `WebFrameSync` 可选能力；`computeFillTarget`/`commitFill` 等语义留 core；onFill 暂留 web（决策 B 债务） |
| [x] | 4 | 单元格编辑 | `@novasheet/feature-editing` | `2026-06-03-novasheet-editing-feature-package.md` | 第二个**整竖切片**：`EditingController`(WebCellEditor+WebFrameSync) + `DomCellEditor` 进包；新增 `web.cell-editor` 贡献点；定位复用 `WebFrameSync`；`commitActiveEdit` 重指向 editing。键盘入口/自定义 editor 暂留 web（债务） |
| [x] | 5 | 剪贴板 | `@novasheet/feature-clipboard` | `2026-06-03-novasheet-clipboard-feature-package.md` | 第三个**整竖切片**：`ClipboardController`(WebClipboard，纯命令、无 WebFrameSync) + `WebClipboardAdapter` 进包；新增 `web.clipboard` 贡献点；commitPaste/TSV 语义留 core。键盘/菜单入口 + 4 个事件回调暂留 web（债务） |
| [ ] | 6 | 右键菜单 | `@novasheet/feature-context-menu` | 未开始：实施前单独写计划 | 菜单项通过 contribution 汇聚，DOM menu layer 不硬编码产品菜单 |
| [ ] | 7 | 排序筛选 | `@novasheet/feature-sort-filter` | 未开始：实施前单独写计划 | `SortLayer` / `FilterLayer` / popover 通过 feature 安装 |
| [ ] | 8 | 行列结构操作 | `@novasheet/feature-structure` | 未开始：实施前单独写计划 | 插入、删除、隐藏、取消隐藏行列从默认菜单动作中拆包 |
| [ ] | 9 | 合并单元格 | `@novasheet/feature-merge-cells` | 未开始：实施前单独写计划 | merge/unmerge API 和菜单动作成为可安装能力 |
| [ ] | 10 | 格式化 | `@novasheet/feature-formatting` | 未开始：实施前单独写计划 | fill/border/textWrap 等格式 API 与 UI action 成为可安装能力 |
| [ ] | 11 | undo/redo | `@novasheet/feature-undo-redo` 或保留 kernel | 未开始：阶段 11 前先做架构决策 | 明确 undo 是 feature 还是 engine transaction kernel |
| [ ] | 12 | 默认 cell types | `@novasheet/feature-basic-cells` | 未开始：实施前单独写计划 | `installBasicCells` 从 `sheet/defaults` 迁为 feature |
| [ ] | 13 | 默认组装收口 | `@novasheet/sheet` | 未开始：实施前单独写计划 | `installDefaultExtensions(ctx)` 只组合 feature installers；评估 web 改名 `@novasheet/runtime-web`（runtime kernel） |
| [ ] | 14 | 半拆回补 | `feature-resize` / `feature-row-column-reorder` | 未开始：menu/keyboard 契约就绪后写计划 | 把 phase 1/2 残留在 web 的 overlay/popover/style/menu/keyboard 整竖切片回补进各自包 |

## 当前执行焦点

进度（注意 phase 1/2 是**半拆**，不是完成）：

- phase 0 ✅ 完成：`SheetContext` generic contributions + `@novasheet/web` typed drag contributions。
- phase 1 `[~]` 半拆：`feature-row-column-reorder` 只搬了 drag；reorder overlay 仍在 web。
- phase 2 `[~]` 半拆：`feature-resize` 只搬了 `ResizeDrag`；handle layer / popover / style / 键盘 / 菜单仍在 web。
- phase 3 ✅ 完成：`@novasheet/feature-fill-handle`（首个整竖切片）。`FillHandleController`(Drag+WebFrameSync) + `DomFillHandleLayer` 进包；`@novasheet/web` 新增可复用 `WebFrameSync` 每帧同步基座（phase 14 回补 resize/reorder overlay 时复用）；`mergeVisualRange` 提升 core。决策 B 债务：`onFill` 暂留 web `setOnFill`，待 engine 事件系统专项再迁。
- phase 4 ✅ 完成：`@novasheet/feature-editing`（第二个整竖切片）。`EditingController`(WebCellEditor+WebFrameSync) + `DomCellEditor` 进包；新增 `web.cell-editor` 贡献点；定位复用 `WebFrameSync`；`commitActiveEdit` 重指向 editing controller（兑现 fill 的 follow-up）。债务：编辑键入口仍在 kernel（待 keyboard 契约）、自定义 editor 经 web `tryCustomEditor`（待 command 契约）。
- phase 5 ✅ 完成：`@novasheet/feature-clipboard`（第三个整竖切片）。`ClipboardController`(WebClipboard 纯命令) + `WebClipboardAdapter` + typed 缓存进包；新增 `web.clipboard` 贡献点（无 WebFrameSync）；`setData`/`updateViewData` 改 `onDataReplaced` 失效缓存。债务：键盘 Cmd+C/X/V 与右键菜单入口仍在 kernel；`onCopy`/`onCut`/`onPaste`/`onPasteSkipped` 经 web deps 转发（待 engine 事件）。

下一个执行焦点是 phase 6：`@novasheet/feature-context-menu`（菜单项经 contribution 汇聚，DOM menu layer 不硬编码产品菜单）——这一包将**建立 menu 契约词汇表**，解锁 resize/structure/sort-filter 以及 editing/clipboard 的菜单/键盘入口回收。每个 feature 仍需单独计划。

## 大能力拆包顺序

推荐顺序：

1. `row-column-reorder`（半拆，待 phase 14 回补）
2. `resize`（半拆，待 phase 14 回补）
3. `fill-handle`（含 frame-sync 基座，整竖切片）
4. `editing`
5. `clipboard`
6. `context-menu`（建 menu 契约）
7. `sort-filter`
8. `structure`
9. `merge-cells`
10. `formatting`
11. `basic-cells`
12. `undo-redo` 决策
13. `sheet` 默认组装收口（+ 评估 web 改名 runtime kernel）
14. `半拆回补`：用 frame-sync / menu / keyboard 契约把 reorder、resize 补成整竖切片

排序依据（2026-06-02 升级为契约词汇表先行）：

- **契约先行**：先让某个 feature 把它需要的新交互契约建进 `@novasheet/web` 词汇表（fill→frame-sync、context-menu→menu-item、待建 keyboard/command），后续消费该契约的 feature 才能整竖切片落地。
- 先拆边界清晰、已有独立 drag state machine 的能力。
- 再拆依赖 runtime lifecycle 的能力。
- 最后拆 `undo/redo`、format/merge 这类跨 feature 状态能力。
- phase 14 回补 phase 1/2 的半拆债务，须等 menu/keyboard 契约就绪。

## 每个 feature 拆包的固定验收清单

每个大 feature 完成前，都必须满足：

- [ ] 旧实现优先 `git mv`，没有无必要重写。
- [ ] 新 package 有 `package.json`、`build.ts`、`tsconfig.json`、`tsconfig.build.json`。
- [ ] 新 package 有 `src/index.ts` 和 `installXxx(ctx)`。
- [ ] 默认 `@novasheet/sheet` 通过 `installDefaultExtensions(ctx)` 安装该 feature。
- [ ] 原行为测试迁移或保留到正确 ownership。
- [ ] 禁用该 feature 时不会让 runtime crash。
- [ ] `bun run lint` 通过。
- [ ] `bun run --filter '*' typecheck` 通过。
- [ ] `bun test` 通过。
- [ ] 相关 package build 通过。
- [ ] `docs/architecture.md` 记录新的 package 边界。

## Feature 候选边界

| Feature | 用户是否感知 | 是否可禁用 | 是否可替换 | 是否应该拆包 |
|---|---|---:|---:|---:|
| 行列拖拽排序 | 是 | 是 | 是 | 是 |
| 行高列宽 resize | 是 | 是 | 是 | 是 |
| 填充柄 | 是 | 是 | 是 | 是 |
| 单元格编辑 | 是 | 部分 | 是 | 是 |
| 剪贴板 | 是 | 是 | 是 | 是 |
| 右键菜单 | 是 | 是 | 是 | 是 |
| 排序筛选 | 是 | 是 | 是 | 是 |
| 行列结构操作 | 是 | 是 | 部分 | 是 |
| 合并单元格 | 是 | 是 | 部分 | 是 |
| 格式化 | 是 | 是 | 部分 | 是 |
| 默认 cell types | 是 | 是 | 是 | 是 |
| `ColumnMoveNormalizer` 等 helper | 否 | 否 | 否 | 否，属于 feature/engine 内部实现 |

## 不做事项

- 不在本轮把所有 feature 一次性拆完。
- 不为了插件化重写已验证行为。
- 不让 `@novasheet/core` import DOM / web 类型。
- 不让 `@novasheet/web` 依赖具体 feature package。
- 不在没有单项计划的情况下继续新增 feature package。

## 打勾规则

只有满足以下条件，才能把总进度里的对应阶段打勾：

1. 对应单项计划全部 Task 完成。
2. 默认 sheet 行为测试通过。
3. 全量 gates 至少跑过一次并通过。
4. 文档记录了新的包边界。
5. 工作区干净，且该阶段有明确提交记录。
