# NovaSheet 当前架构设计图

- **范围**：当前仓库源码状态（`refactor/cross-platform` 分支）
- **包**：`@novasheet/core` · `@novasheet/web` · `@novasheet/canvas2d` · `@novasheet/feature-*` · `@novasheet/sheet`
- **对外入口**：`import { Grid } from '@novasheet/sheet'`（默认 `renderer: 'canvas2d'`）
- **能力状态**：M2 虚拟滚动 + 原生滚动映射已实现；M3 冻结象限 / 动态行高 / 交互 resize 仍为 planned

---

## 1. 包依赖与总体架构

```mermaid
flowchart TB
  subgraph HostLayer["宿主"]
    App["Host App / Storybook"] --> Grid["Grid 门面<br/>@novasheet/sheet"]
  end

  subgraph SheetPkg["@novasheet/sheet — 默认表格产品"]
    Grid --> Backend["Canvas2DBackend<br/>GridController 实现"]
  end

  subgraph WebPkg["@novasheet/web — 浏览器宿主/运行时"]
    Backend --> Runtime["WebGridRuntime<br/>scroll / resize / RAF"]
    Backend --> Host["DomGridHost<br/>scroll-host + spacer"]
    Runtime --> ScrollMapper["ScrollMapper"]
    Runtime --> NS["NativeScroller"]
    Host --> NS
  end

  subgraph CanvasPkg["@novasheet/canvas2d — Canvas2D 绘制"]
    Backend --> Renderer["Canvas2DRenderer<br/>WebRenderer 实现"]
    Backend --> HighDPI["HighDPI"]
    Renderer --> CellP["CellPainter"]
    Renderer --> LineP["GridLinesPainter"]
    Renderer --> HeadP["HeaderPainter"]
    HighDPI --> Canvas["HTMLCanvasElement"]
  end

  subgraph CorePkg["@novasheet/core — 平台无关引擎"]
    Backend --> Engine["DefaultGridEngine<br/>GridEngine"]
    Engine --> DS["DataSource"]
    Engine --> Theme["Theme"]
    Engine --> Rows["ChunkedAxis rows"]
    Engine --> Cols["ChunkedAxis cols"]
    Engine --> Frozen["FrozenRegions"]
    Engine --> VP["Viewport"]
    Engine --> Frame["RenderFrame<br/>getFrame() 快照"]
    Frame --> Renderer
    Runtime --> Scheduler["FrameScheduler<br/>per Grid"]
    Scheduler --> Runtime
    Scheduler --> NS
  end

  subgraph Future["Planned M3+"]
    FrozenM3["4 象限冻结绘制"]
    DynamicH["动态行高"]
    Interaction["resize / selection / editing"]
    WebGL["@novasheet/webgl"]
  end

  Frozen -.-> FrozenM3
  Grid -.-> DynamicH
  Grid -.-> Interaction
  Grid -.-> WebGL
```

**依赖方向（无环）**：`core` ← (`web`, `canvas2d`) ← `sheet` ← Storybook / 应用。
Feature package 依赖 `core` + 对应平台契约包，并由 `sheet` 默认安装。

| 包                        | 职责                                                                                                                  | 不含                        |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `@novasheet/core`         | 数据、Schema、Theme、ChunkedAxis、Viewport、FrozenRegions、`DefaultGridEngine`、`RenderFrame`、`FrameScheduler`       | DOM、Canvas、滚动容器       |
| `@novasheet/canvas2d` | `Canvas2DRenderer`、三个 painter、`HighDPI`                                                                           | Grid 门面、scrollHost、编排 |
| `@novasheet/web`          | `WebGridRuntime`、`DomGridHost`、`ScrollMapper`、`NativeScroller`、DOM 交互层、`WebRenderer` 契约                    | Grid 门面、Canvas2D 绘制    |
| `@novasheet/feature-*`    | 可安装到 `SheetContext` 的用户可见能力；复用平台契约并调用 runtime 注入的 engine/API                                | 默认产品装配、底层 host     |
| `@novasheet/sheet`        | 对外 `Grid`、`Canvas2DBackend`、默认扩展安装与默认产品装配                                                           | 引擎算法、低层宿主实现      |

核心关系：

- **`Grid` 是唯一对外 mutation 入口**；内部按 `options.renderer` 选择后端（当前仅 `canvas2d` → `Canvas2DBackend`）。
- **`DefaultGridEngine`** 持有数据与布局状态；**`getFrame()`** 产出每帧不可变 `RenderFrame`（含 `viewport` 快照）。
- **`WebGridRuntime`** 连接 engine + host + renderer：滚动映射、spacer 尺寸、RAF 调度；**不**直接操作 canvas DOM。
- **`Canvas2DRenderer.render(frame)`** 只读 `RenderFrame` 绘制（spec 不变量 #1）；DOM 滚动值经 `ScrollMapper` 转成逻辑坐标后写入 engine。
- 每个 `Grid` 实例共享一个 **`FrameScheduler`**（`scroll:read` / `host:resize` / `renderer:flush` 等同帧合并）。

### Feature Packages

Feature package 拥有用户可见表格能力，并通过 `SheetContext` 安装。`@novasheet/feature-row-column-reorder`
拥有行/列表头拖拽排序：它复用 `@novasheet/web` 的 drag contribution 契约，由 `WebGridRuntime`
提供运行时依赖并调用 engine API。`@novasheet/sheet` 默认安装该能力包，默认 `Grid` 保持原有行列拖拽行为。
`@novasheet/feature-resize` 拥有行高/列宽 resize 拖拽状态机：它通过 web drag runtime deps
消费 `DomHandleLayer`，而 DOM handle layer 与 resize handle 样式仍属于 `@novasheet/web`。
`@novasheet/feature-clipboard` 拥有剪贴板交互（第三个「整竖切片」拆包）：`ClipboardController` 实现纯命令
`WebClipboard`（copy/cut/paste + onDataReplaced 缓存失效），自持 `WebClipboardAdapter`（navigator 包装）与
typed-paste 缓存，通过 `web.clipboard` 贡献点安装，无 DOM overlay / 无 `WebFrameSync`。剪贴板语义
（`commitPaste`/TSV 解析）留 `@novasheet/core`。已知债务：键盘 Cmd+C/X/V 与右键菜单入口仍在 kernel（待
keyboard/menu 契约）；`onCopy`/`onCut`/`onPaste`/`onPasteSkipped` 经 web deps 转发（待 engine 事件）。
`@novasheet/feature-editing` 拥有单元格编辑交互（第二个「整竖切片」拆包）：`EditingController`
同时实现 `WebCellEditor`(命令) 与 `WebFrameSync`(定位)，自持 `DomCellEditor`，通过 `web.cell-editor`
贡献点安装。runtime 保留键盘/双击起编入口并委托 controller，`commitActiveEdit` 重指向它；编辑语义
（`beginCellEdit`/`commitCellEdit`）留 `@novasheet/core`。已知债务：编辑键入口仍在 kernel（待 keyboard
契约）、自定义 editor 经 web `tryCustomEditor`（待 command 契约）。
`@novasheet/feature-context-menu` 拥有右键菜单交互（第四个「整竖切片」拆包）：`ContextMenuController`
通过 `web.context-menu` 安装，自持 `DomContextMenuLayer`（portal-to-body）；菜单项由 `web.menu-item`
provider 按 order 汇聚（仅 `cell-default` cut/copy/paste）。列头 sort/filter 与行列结构项分别由
`feature-sort-filter` / `feature-structure` / `feature-merge-cells` 提供（默认 BOM 须四 feature + context-menu）。已知债务：
键盘 Cmd+C/X/V 仍在 kernel；剪贴板 cell 菜单默认 provider 与 `feature-clipboard` 协同。
`@novasheet/feature-sort-filter` 拥有排序/筛选交互（第五个「整竖切片」拆包）：`SortFilterController`
通过 `web.sort-filter` 安装，自持 `FilterPopover`；列头 sort/filter 菜单项经 `web.menu-item`
provider `sort-filter-default`（调用 `ViewPipeline.collectColumnHeaderMenuItems`）。`SortLayer` /
`FilterLayer` / `ViewPipeline` 仍由 `Canvas2DBackend` 创建并注入 runtime deps。已知债务：键盘入口仍在 kernel。
`@novasheet/feature-structure` 拥有行列结构操作（第六个「整竖切片」拆包）：`StructureController`
通过 `web.structure` 安装（无 DOM）；列/行头结构菜单项经 `structure-column-default` /
`structure-row-default`；`insertRows`/`hideCols` 等 engine API 仍 core。行高/列宽 popover DOM 仍 web
（phase 14 与 resize 回补）。默认 BOM 须 context-menu + sort-filter + structure。
`@novasheet/feature-merge-cells` 拥有合并单元格交互（第七个「整竖切片」拆包）：`MergeCellsController`
通过 `web.merge-cells` 安装；单元格 merge/unmerge 菜单项经 `merge-cells-default` provider。
`MergeStore` / `engine.mergeCells` 仍 core；`Grid.mergeCells` 仍 runtime 转发。
`@novasheet/feature-fill-handle` 拥有填充柄交互（首个「整竖切片」拆包）：`FillHandleController`
同时实现 `Drag` 与 `WebFrameSync`，独占持有 `DomFillHandleLayer`，通过 `web.drag` contribution 安装。
`@novasheet/web` 为此新增 feature-agnostic 的 `WebFrameSync` 每帧同步契约（runtime 在 flush/teardown
中按能力探测并驱动 attach/syncFrame/destroy）；填充语义（`computeFillTarget` / `commitFill`）仍在
`@novasheet/core`。已知债务：`onFill` 仍走 web `setOnFill`（待 engine 事件系统专项落地后迁移）。

---

## 2. DOM 与绘制表面

```mermaid
flowchart TB
  Container["宿主 container<br/>position: relative"] --> Canvas["canvas<br/>z-index:0, pointer-events:none"]
  Container --> ScrollHost["scroll-host<br/>overflow:auto, z-index:1"]
  ScrollHost --> Spacer["scroll-spacer<br/>虚拟内容尺寸"]

  Backend["Canvas2DBackend"] -->|"创建/销毁"| Canvas
  Backend -->|"DomGridHost.attach"| ScrollHost
  Runtime["WebGridRuntime"] -->|"setScrollSize"| Spacer
  HighDPI["HighDPI"] -->|"resize 位图"| Canvas
```

- Canvas 由 **`Canvas2DBackend`** 创建并叠在底层；scroll-host 在上层承载原生滚动条（透明，事件可穿透到 scroll）。
- **`HighDPI.resize`** 在 `host:resize` RAF 内与 **`paintSync()`** 同帧执行，避免改 `canvas.width/height` 后空一帧闪烁。

---

## 3. 滚动路径（单帧序列）

```mermaid
sequenceDiagram
  participant User as 用户 / 浏览器
  participant SH as scroll-host
  participant NS as NativeScroller
  participant RT as WebGridRuntime
  participant SM as ScrollMapper
  participant ENG as DefaultGridEngine
  participant FS as FrameScheduler
  participant R as Canvas2DRenderer
  participant C as Canvas

  User->>SH: 原生 scroll
  SH->>NS: scroll 事件
  NS->>FS: schedule("scroll:read")
  FS->>RT: handleHostScroll(scrollTop, scrollLeft)
  RT->>SM: scrollToLogical
  SM-->>RT: logicalX / logicalY
  RT->>ENG: setScroll
  RT->>FS: schedule("renderer:flush")
  FS->>RT: invalidate 回调
  RT->>ENG: getFrame()
  ENG-->>RT: RenderFrame
  RT->>R: render(frame)
  R->>C: paintFrame（painters）
```

**Resize 路径（合并，防闪烁）**：

1. `ResizeObserver` → `DomGridHost.emitResize` → `WebGridRuntime.handleHostResize`
2. `schedule("host:resize")`：同帧内 `setViewportSize` → `HighDPI.resize` → `remapScroll` → **`paintSync()`**（非异步 `renderer:flush`）

---

## 4. 模块职责（按包）

### 4.1 `@novasheet/core`

| 模块              | 路径                                              | 职责                                                 |
| ----------------- | ------------------------------------------------- | ---------------------------------------------------- |
| DataSource        | `src/data/DataSource.ts`, `InMemoryDataSource.ts` | 数据读取；`getCell` 同步热路径；`getRows` 闭区间预热 |
| Schema            | `src/data/Schema.ts`                              | 字段类型、列宽、行结构                               |
| ChunkedAxis       | `src/layout/ChunkedAxis.ts`                       | 行/列尺寸 → 像素位置；`CHUNK_SIZE = 1024`            |
| Viewport          | `src/layout/Viewport.ts`                          | 尺寸、滚动、可见区；`snapshot()` 供渲染              |
| FrozenRegions     | `src/layout/FrozenRegions.ts`                     | 象限切分；**当前仅返回 `main`**                      |
| DefaultGridEngine | `src/engine/DefaultGridEngine.ts`                 | 引擎状态；`getFrame()` 快照                          |
| RenderFrame       | `src/render/RenderFrame.ts`                       | 跨平台每帧输入（data / theme / axes / viewport）     |
| Theme             | `src/theme/`                                      | 全部视觉 token                                       |
| FrameScheduler    | `src/util/raf.ts`                                 | per-Grid RAF 合并（导出供 web 使用）                 |

### 4.2 `@novasheet/sheet`

| 模块            | 路径                              | 职责                                                               |
| --------------- | --------------------------------- | ------------------------------------------------------------------ |
| Grid            | `src/Grid.ts`                     | 对外门面；转发至 `GridController`                                  |
| Canvas2DBackend | `src/backends/Canvas2DBackend.ts` | 装配 engine + host + runtime + canvas + HighDPI + Canvas2DRenderer |

### 4.3 `@novasheet/web`

| 模块            | 路径                              | 职责                                                               |
| --------------- | --------------------------------- | ------------------------------------------------------------------ |
| WebGridRuntime  | `src/runtime/WebGridRuntime.ts`   | 编排、滚动映射、spacer、RAF、`setData` 换 renderer                 |
| DomGridHost     | `src/host/DomGridHost.ts`         | scroll-host / spacer、ResizeObserver、DPR 监听                     |
| ScrollMapper    | `src/scroll/ScrollMapper.ts`      | DOM scroll ↔ 逻辑坐标；`SAFE_MAX = 6_000_000`                      |
| NativeScroller  | `src/scroll/NativeScroller.ts`    | 原生 scroll 事件 → RAF 节流                                        |
| WebRenderer     | `src/render/WebRenderer.ts`       | 渲染后端接口（Canvas2D / 未来 WebGL）                              |

### 4.4 `@novasheet/canvas2d`

| 模块             | 路径                               | 职责                                          |
| ---------------- | ---------------------------------- | --------------------------------------------- |
| Canvas2DRenderer | `src/render/Canvas2DRenderer.ts`   | `render(frame)` 绘制管线；`paint()` 测试/兜底 |
| CellPainter      | `src/painters/CellPainter.ts`      | 单元格内容与截断                              |
| GridLinesPainter | `src/painters/GridLinesPainter.ts` | 批量网格线                                    |
| HeaderPainter    | `src/painters/HeaderPainter.ts`    | 列头                                          |
| HighDPI          | `src/surface/HighDPI.ts`           | CSS 尺寸 × DPR 位图 + transform               |

### 4.5 应用层

| 模块      | 路径              | 职责                                              |
| --------- | ----------------- | ------------------------------------------------- |
| Storybook | `apps/storybook/` | 变体演示；`import { Grid } from '@novasheet/sheet'` |

---

## 5. 数据与布局模型

```mermaid
flowchart LR
  Schema["Schema"] --> ColAxis["列 ChunkedAxis"]
  Rows["行数据"] --> DS["DataSource"]
  DS --> Engine["DefaultGridEngine"]
  Engine --> RowAxis["行 ChunkedAxis"]
  Engine --> ColAxis
  RowAxis --> VP["Viewport"]
  ColAxis --> VP
  VP --> Snap["ViewportSnapshot"]
  Snap --> Frame["RenderFrame"]
  Frame --> Renderer["Canvas2DRenderer"]
```

关键约定：

- `DataSource.getRows(start, end)` 的 **`endIndex` inclusive**，与 `ChunkedAxis.getVisibleRange()` 一致。
- `ChunkedAxis.getSize(index)` 是单项尺寸唯一安全来源（末行不能用 position 差分）。
- Painter 依赖 **`Axis`** 只读接口，不依赖 `MutableAxis`。

---

## 6. 渲染管线（Canvas2D）

```mermaid
flowchart TB
  Entry["Canvas2DRenderer.render(frame)"] --> Sync["syncFromFrame（theme/data/axes）"]
  Sync --> Paint["paintFrame"]
  Paint --> Clear["1. 清背景"]
  Clear --> Font["2. 设置字体"]
  Font --> Warm["3. getRows 预热可见行"]
  Warm --> Main["4. paintQuadrant(main)"]
  Main --> Header["5. HeaderPainter"]
  Main --> CellP["CellPainter"]
  Main --> LineP["GridLinesPainter"]
```

- 生产路径：`WebGridRuntime` → `engine.getFrame()` → `renderer.render(frame)`。
- 当前仅绘制 **`main` 象限**；M3 在 `paintFrame` 中扩展多象限 + `FrozenPainter`。
- `Canvas2DRenderer.mount/resize` 仍为过渡 stub；canvas 生命周期由 `Canvas2DBackend` + `HighDPI` 管理。

---

## 7. 关键不变量

| 不变量                                   | 说明                                                                          |
| ---------------------------------------- | ----------------------------------------------------------------------------- |
| 对外 mutation 走 `Grid`                  | painter / runtime 不自行改数据源或布局                                        |
| 渲染只读 `RenderFrame` / `viewport` 快照 | 每帧单一读取源，避免绘制中状态撕裂                                            |
| Theme 为视觉唯一来源                     | `canvas2d` 的 painter 不硬编码颜色/尺寸                                   |
| 每 Grid 一个 `FrameScheduler`            | `scroll:read`、`host:resize`、`renderer:flush` 同帧合并；禁止跨 Grid 共用单例 |
| `Grid.destroy()` 幂等                    | 取消 pending RAF、移除 canvas 与 scroll-host、恢复 container `position`       |
| `ScrollMapper.SAFE_MAX = 6_000_000`      | 避开 Firefox / iOS Safari scrollHeight 上限                                   |
| 包依赖无环                               | `core` ← (`web`, `canvas2d`) ← `sheet`；core 不得 import DOM/Canvas 类型  |

---

## 8. 能力边界

| 能力                                      | 状态                              |
| ----------------------------------------- | --------------------------------- |
| 三包拆分 + `Grid` 门面在 `@novasheet/sheet` | ✅                                |
| Canvas2D 渲染 + Theme + HighDPI           | ✅                                |
| ChunkedAxis 双轴虚拟化                    | ✅                                |
| 原生滚动 + 非线性 `ScrollMapper`          | ✅                                |
| `scrollToRow` / `scrollToCell`            | ✅                                |
| Resize 合并绘制（无空白帧闪烁）           | ✅                                |
| 冻结 4 象限真实绘制                       | planned（`FrozenRegions` 已预留） |
| 动态行高 autofit                          | planned                           |
| resize handle / selection / editing       | planned（M4，`handle-layer` DOM） |
| WebGL 后端                                | planned（`WebRenderer` 第二实现） |
| React wrapper                             | planned                           |
| Playground 1M 性能验证                    | planned                           |

---

## 9. 对外使用速查

```ts
import { Grid } from '@novasheet/sheet'
import { InMemoryDataSource, denseGridTheme } from '@novasheet/core'

const grid = new Grid(container, {
  data,
  theme: denseGridTheme,
  renderer: 'canvas2d', // 默认，可省略
})
```

- 类型与数据：`@novasheet/core`
- 表格组件：`@novasheet/sheet`
- 高级定制（自定义后端装配）：可单独使用 `WebGridRuntime` + `DomGridHost` + 自实现 `WebRenderer`
