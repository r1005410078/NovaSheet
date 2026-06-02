# NovaSheet Fill Handle Feature Package Design

## 目标

把已验证的填充柄能力（autofill 拖拽 + 预览 + commit）从 `@novasheet/web` 的固定 runtime 构造，拆到默认安装的 feature package：`@novasheet/feature-fill-handle`。

这是路线图 phase 3，也是**首个「整竖切片」拆包**——不只搬 drag state machine，还把它自己的 DOM 层（`DomFillHandleLayer`）一起搬进包。为此 `@novasheet/web` 需要新增一个 **`WebFrameSync` 可选能力**，让 feature 拥有的 DOM overlay 能挂进 runtime 的每帧 flush。

本次只组织旧代码 + 新增最小契约，不重写填充语义。默认 `@novasheet/sheet` 用户体验保持不变。

## 交互 / 语义切分（对齐 roadmap 不变量 #2）

| 半边 | 归属 | 内容 |
|---|---|---|
| 交互 | `@novasheet/feature-fill-handle` | `FillHandleDrag` 状态机、`DomFillHandleLayer`（手柄方块 + 预览浮层）、`computeFillHandleRect` |
| 语义 | `@novasheet/core`（不动） | `computeFillTarget` / `FillTarget` / `FillSeries` / `FillStylePropagator` / `getFillMergeSnap` / `commitFill` / `cellInRange` |
| 契约 | `@novasheet/web` | `WebFrameSync` 可选能力、通用 kernel services、`computeRangeOverlayRects` / `OverlayRect`（共享） |
| 装配 | `@novasheet/sheet` | 默认 `installFillHandleFeature(ctx)`；`Canvas2DBackend` 不再 `new DomFillHandleLayer` |

> 填充的「语义半边」（计算目标区、写值、样式传播）已经全部在 `@novasheet/core`，本次**完全不动**。feature 包只拿交互半边。

## 范围

本包拥有：

- `FillHandleDrag` autofill 拖拽状态机（client 坐标入口 `tryStartFromClient` / `moveFromClient` / `commitPointer`）。
- `DomFillHandleLayer` DOM overlay：手柄方块、拖拽预览、`attach` / `sync` / `showPreview` / `hidePreview` / `destroy`。
- `computeFillHandleRect`（填充柄矩形几何，fill 专用）。
- `installFillHandleFeature(ctx)`。
- 对应单元测试 + runtime 行为测试 ownership。

本包不拥有：

- `computeFillTarget` / `FillSeries` / `commitFill` 等填充语义（留 `@novasheet/core`）。
- `computeRangeOverlayRects` / `OverlayRect`（选区/reorder 共享，留 `@novasheet/web`）。
- `mergeVisualRange`（选区 overlay 也用，提升到 `@novasheet/core`）。
- runtime orchestrator、host、scroll、scheduler（runtime kernel）。

## 包边界与依赖方向

| 包 | 职责 |
|---|---|
| `@novasheet/core` | 填充语义 mutation；新增 `mergeVisualRange`；新增填充 applied 事件（见 onFill） |
| `@novasheet/web` | `WebFrameSync` 契约、runtime flush 派发、通用 kernel services、共享 overlay util |
| `@novasheet/feature-fill-handle` | `FillHandleDrag` + `DomFillHandleLayer` + `installFillHandleFeature(ctx)` |
| `@novasheet/sheet` | 默认安装 fill feature；移除 backend 里的 fill 层构造 |

```txt
@novasheet/core
  ↑
@novasheet/web ──────────────┐
  ↑                          │
@novasheet/feature-fill-handle
  ↑
@novasheet/sheet
```

`@novasheet/web` 不依赖 `@novasheet/feature-fill-handle`。

## 核心新增：`WebFrameSync` 可选能力

填充柄不是纯 pointer drag——它有一个 DOM 层需要**每帧**根据选区/合并区重算手柄位置，并在编辑/拖拽时隐藏。现在这段逻辑（`syncFillHandle`）硬编码在 `WebGridRuntime.invalidate` / `paintSync` 里。layer 进包后，runtime 不能再认识 fill，需要一个 **feature-agnostic 的每帧同步契约**。

设计为**可选能力**，不是独立 contribution point（最小新增面）：

```ts
/** 拥有 DOM overlay 的 drag 可选实现：让 runtime 在 flush 中驱动它每帧同步。 */
export interface WebFrameSync {
  attach(container: HTMLElement): void
  syncFrame(frame: RenderFrame, status: WebInteractionStatus): void
  destroy(): void
}

export interface WebInteractionStatus {
  /** 任一 contributed drag 处于 active（拖拽进行中）。 */
  readonly interacting: boolean
  /** 引擎当前在编辑单元格。 */
  readonly editing: boolean
}
```

runtime 不引入新 registry、新 contribution id——只是在已有的 contributed drag 上**按能力探测** `WebFrameSync`（与它现在探测 resize `WebResizeDrag` 同款 capability check；但 fill 不需要 resize 那种 pointer-routing 判别器，因为 layer 自己捕获 pointer）：

- setup：收集实现 `WebFrameSync` 的 contributed drag，调 `attach(container)`。
- `invalidate` / `paintSync` flush：对每个调 `syncFrame(frame, status)`。
- teardown：对每个调 `destroy()`（幂等）。

这样 `WebFrameSync` 对后续 resize handle layer / reorder overlay 的回补（phase 14）同样可复用。

## Contribution 与 deps 设计

**一个对象，两种能力。** fill 只注册**一个** `web.drag` contribution，`create` 返回的 `FillHandleController`：

- `implements Drag`（含 `tryStartFromClient` 等 client 坐标入口）。
- `implements WebFrameSync`（`attach` 里构造并挂 `DomFillHandleLayer`，`syncFrame` 里同步手柄、隐藏；`destroy` 拆层）。
- 内部**独占持有**一个 `DomFillHandleLayer`，layer 的 pointer 回调直接打到 controller 自己的 pointer 方法。

> 不能注册两个 contribution（drag + overlay）共享 layer——contribution 各自 `create`，会产出两个 layer 实例；ctx 跨 Grid 共享、layer 必须 per-instance。一个对象双能力是唯一正确形态。

**feature 自定义 deps（用户决策 B）。** `@novasheet/web` 的 contribution deps 只暴露**通用 kernel services**，绝不出现 fill-named 成员（无 `fillLayer`、无 `onFill`）。fill feature 在包内定义自己的 `FillHandleDeps`，从通用 services 组装：

web 通用 services（在现有 `WebDragRuntimeDeps` 基础上补两项通用项）：

| service | 性质 | 说明 |
|---|---|---|
| `engine` / `host` | 已有 | host 经 `host.container` 暴露容器供 layer attach |
| `afterEngineMutation` / `closeContextMenu` / `requestAutoScroll` / `stopAutoScroll` / `isBlocked` | 已有 | 通用 |
| `autofitRows(options)` | **新增（通用）** | runtime autofit 服务，任何写值 drag 都可能需要；非 fill 专用命名 |
| `commitActiveEdit(moveSelection)` | **新增（通用）** | 「提交进行中的编辑」，任何 drag 起手都可能需要；非 fill 专用 |

> 这与被否决的方案 A 的区别：A 往共享 deps 塞 `fillLayer` / `onFill` 这类 fill 专名成员；这里只补**通用 kernel 能力**，fill 专属状态（layer）进包、fill 专属事件（onFill）进 engine。

**`onFill` → engine 填充事件（语义归 core）。** 当前 `grid.onFill` 经 `runtime.setOnFill` → drag 回调 `deps.onFill(event)`。填充被应用是**数据语义事件**，按切分规则归 `@novasheet/core`：

- `engine.commitFill` 应用后发出 fill-applied 事件；`Grid.onFill` 订阅引擎。
- `FillEvent` 类型移到 `@novasheet/core`（语义形状）。
- web 移除 `setOnFill` / `onFill` 字段；feature 的 drag 只调 `engine.commitFill`，不持有用户回调。

这同时解决「onFill 是 per-Grid、ctx 跨 Grid 共享」的注入难题——引擎本就 per-Grid。

## Runtime 行为

移除（fill 专用，全部下放/删除）：

- `fillLayer?` opt 与字段、`new FillHandleDrag(...)` 直接构造、`import DomFillHandleLayer` / `computeFillHandleRect`。
- public `handleFillPointerDown` / `handleFillPointerMove` / `handleFillPointerUp`（layer 自己 `setPointerCapture`，move/up 走 layer 捕获事件，不经 host；无需 runtime 中转）。
- `syncFillHandle()`、`this.activeDrag = fillHandleDrag` 记账。
- `setOnFill`。

新增/改为通用：

- `WebFrameSync` 探测 + flush 派发 + teardown destroy。
- `WebInteractionStatus.interacting` = `this.drags.some(d => d.active)`（通用聚合，替代 fill 专用 activeDrag 记账）；`editing` = `engine.isCellEditing()`。
- `mergeVisualRange` 改从 `@novasheet/core` import（`syncSelectionOverlay` 仍用它）。

行为规则：

- 未安装 fill feature：无 `WebFrameSync` contribution → flush 中无填充柄同步、无手柄渲染，不 crash；无 fill drag → 选择/滚动/编辑照常。
- 已安装：行为与现状一致——选区右下角显示手柄；拖拽中只 show 预览不 commit；松手 `engine.commitFill` + `autofitRows` + engine 发 fill 事件；编辑/任一拖拽进行中隐藏手柄。
- `DomFillHandleLayer` 保留**显式 inline `zIndex: 3`**，叠放不依赖 DOM 插入顺序，attach 时机变化不影响层级。
- `Grid.destroy()` 幂等（不变量 #6）：runtime teardown 逐个 `frameSync.destroy()`；`DomFillHandleLayer.destroy` 已有 `destroyed` 守卫。

## 共享 util 归属

| util | 去向 | 理由 |
|---|---|---|
| `mergeVisualRange` | runtime 私有 → `@novasheet/core` | 纯 range 几何；`syncFillHandle`（走）与 `syncSelectionOverlay`（留）都用 |
| `computeRangeOverlayRects` / `OverlayRect` | 留 `@novasheet/web`，导出 | 选区/reorder/fill 共享；feature 从 web import |
| `computeFillHandleRect` | `@novasheet/web` → feature | fill 专用几何 |

## 分阶段（frame-sync 基座先行）

复刻 phase 0→1 的「先基座后 feature」节奏，避免在一个 feature task 里改穿中央 flush：

1. **frame-sync 基座（独立 commit）**：在 `@novasheet/web` 加 `WebFrameSync` / `WebInteractionStatus` 契约 + runtime flush/teardown 探测派发 + 通用 services（`autofitRows` / `commitActiveEdit`）。此时无 contribution 实现它 → 全 no-op，现有 drag 不回归。
2. **core 语义事件 + util 提升（独立 commit）**：`mergeVisualRange` 提升到 core；engine 新增 fill-applied 事件 + `FillEvent` 移到 core；`Grid.onFill` 改订阅引擎。
3. **fill feature 整竖切片**：建包，`git mv` `FillHandleDrag` + `DomFillHandleLayer` + `computeFillHandleRect` 进包，合成 `FillHandleController`，注册 `web.drag`；runtime 删除 fill 专用方法；测试迁移。
4. **默认安装**：`@novasheet/sheet` 装 `installFillHandleFeature`，backend 删除 `DomFillHandleLayer` 构造。

## 测试策略

- feature installer test：`installFillHandleFeature(ctx)` 注册一个含 fill drag 能力的 `web.drag` contribution。
- `FillHandleDrag` / `DomFillHandleLayer` / `computeFillHandleRect` 单测从 web 迁到 feature，保留旧断言。
- runtime frame-sync 基座 test（留 web）：未安装时 flush 不 crash、无手柄同步；安装一个假 `WebFrameSync` drag 时 `attach` / `syncFrame` / `destroy` 被按生命周期调用。
- fill 行为 test（迁 feature）：显式 `installFillHandleFeature(ctx)`，验证拖拽只预览、松手 commit、编辑/拖拽时隐藏。
- core test：`mergeVisualRange` 行为；engine fill-applied 事件在 `commitFill` 后触发、未 commit 不触发。
- sheet test：默认 `Grid` 的 context 含 fill drag contribution；`Grid.onFill` 仍能收到事件。

`@novasheet/web` 保留：`computeRangeOverlayRects` / `OverlayRect` 测试、selection overlay 测试、host/scroll 测试。

## 验收

- `@novasheet/feature-fill-handle` 有独立 `package.json` / `build.ts` / `tsconfig.json` / `tsconfig.build.json` / `src/index.ts` / `installFillHandleFeature`。
- `FillHandleDrag` / `DomFillHandleLayer` 用 `git mv` 迁移，不重写填充语义。
- `@novasheet/web` 不出现任何 fill 专名成员；新增的是通用 `WebFrameSync` + 通用 services。
- `@novasheet/sheet` 默认安装 fill feature，backend 不再构造 fill 层；默认行为不变。
- 不安装 fill feature 时 runtime flush / pointer 路径不 crash。
- `Grid.onFill` 经引擎事件仍可用。
- `Grid.destroy()` 幂等，frame-sync overlay 被 destroy。
- `bun run lint` / `bun run --filter '*' typecheck` / `bun test` 通过。
- `@novasheet/core` / `@novasheet/web` / `@novasheet/feature-fill-handle` / `@novasheet/canvas2d` / `@novasheet/sheet` build 通过。
- `docs/architecture.md` 与 feature 路线图更新。

## 后续不在本轮（已知 follow-up）

- **跨 feature 依赖**：`commitActiveEdit` 实为 editing（phase 4）能力、`closeContextMenu` 实为 context-menu（phase 6）能力，目前作为通用 runtime services 暴露；phase 4/6 拆包时 fill 对它们的依赖需重新指向（届时可能改为 command/contract）。spec 标注，不阻塞 phase 3。
- phase 14 用同款 `WebFrameSync` 回补 resize handle layer / reorder overlay 的半拆债务。
- keyboard / menu / command 契约词汇表建设（phase 6 及之后）。

## 自检

- 没有重写填充语义；core fill kernel 完全不动。
- 没有让 `@novasheet/web` 依赖具体 feature，也没在共享 deps 留 fill 专名成员。
- DOM 层、几何、事件按交互/语义切分各归其位（layer→feature、mergeVisualRange→core、onFill→engine）。
- 中央 flush 改动隔离在「frame-sync 基座」独立 commit，fill task 回归搬运本质。
- 未安装 feature 的 no-op 与 destroy 幂等有显式测试。
