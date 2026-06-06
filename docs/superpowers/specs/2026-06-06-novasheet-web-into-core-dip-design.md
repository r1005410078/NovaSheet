# Web 合并进 Core（依赖反转）— 设计

- **日期**：2026-06-06
- **状态**：设计（**已确认**，2026-06-06）
- **分支**：`refactor-default-grid-engine-decomposition`（延续 decomposition 分支；**暂不合 `main`**）
- **前置**：Engine Composer Phase 2 ✅；当前三包 `@novasheet/core` / `@novasheet/web` / `@novasheet/canvas2d`
- **相关**：`packages/core/src/ARCHITECTURE.md`、`packages/core/src/engine/README.md`、`CLAUDE.md`（依赖方向 / 不变量 #1）

---

## 1. 背景

旧分层用错了切分轴。把三条**独立**的轴混成一条「DOM vs no-DOM」，导致**确定永远是 DOM、且属于表格控件**的东西（select 层、滚动条、native scroller、手势、cell editor）被塞进 `@novasheet/web`，与**未来业务壳**（工具栏/属性栏/Vue·React）同名同包。

| 轴 | 含义 | 该不该当包边界 |
| --- | --- | --- |
| A 可替换性 | 这块画法以后会换技术吗？grid 线/单元格/文字 → canvas2d → 可能 webgl | ✅ 值得抽象 = 渲染后端 seam |
| B 平台依赖 | 碰不碰 DOM / 能不能脱 DOM 跑 | 仅对「纯模型」有意义，**不该当包边界** |
| C 领域归属 | 这是**表格控件**的事，还是**业务应用**的事 | ✅ 包边界应循此轴 |

**关键事实**：`@novasheet/web` 现在 **100% 是表格控件的 DOM host**，零业务代码。当前依赖方向 `web → canvas2d`（web `import { Canvas2DRenderer }`）。`web/render/WebRenderer.ts` 已是渲染后端的抽象接口（只 `import RenderFrame`），DIP 已半成型。

---

## 2. 决策（ADR）

1. **core 吸收 DOM**：表格控件的固定 DOM 机制（host / 手势 / overlay / popover / runtime / Grid facade）并入 `@novasheet/core`。**放弃** core「零 DOM、可 node/worker 跑」的整包不变量——改为**内部分层**保证纯模型子层仍可脱 DOM 测（见 §5）。
2. **依赖反转渲染后端**：把 `web → canvas2d` 这条边翻转为 **`canvas2d → core`**。core 定义 `RenderBackend` 端口；`@novasheet/canvas2d` 实现它并反向依赖 core；具体后端由**组合根注入**。core 零 `canvas2d` import。
3. **`@novasheet/web` 退休**：内容全部迁入 core，包删除。业务层（工具栏/属性栏/框架适配）**本次不建**，需要时再开新包（YAGNI）。
4. **纯重构、零行为变化**：延续本分支姿态。`bun test` 全绿；公共 `Grid` API 行为不变；不借机改交互行为。

### 非目标

- 不建业务层包（toolbar / property bar / Vue / React）。
- 不实现 webgl 后端（仅保证端口形状可同构接入）。
- 不改 kernel/features/engine 的领域语义；不新增 domain event。
- 不自绘滚动条、不抽象 select 层（它们是「确定」的 DOM，不做可替换 seam）。

---

## 3. 目标包拓扑与依赖

```
                 ┌─────────────────────────────────────────┐
                 │            @novasheet/core               │
                 │  纯模型(no DOM) + DOM 壳 + Grid facade    │
                 │  导出: Grid, ports/RenderBackend, 类型    │
                 └─────────────────────────────────────────┘
                        ▲                         ▲
        implements      │ depends                 │ depends
        RenderBackend   │                         │
        ┌───────────────┴────────┐      ┌─────────┴──────────┐
        │  @novasheet/canvas2d   │      │   apps/storybook   │  ← 组合根
        │  画法后端 (DIP→core)    │      │  new Grid({ data,  │
        └────────────────────────┘      │   backend:         │
                                        │   canvas2dBackend})│
                                        └────────────────────┘
```

- `core` **不** import `canvas2d`（反转后）。
- `canvas2d` 反向依赖 `core`，实现 `RenderBackend` 端口。
- `apps/storybook`（组合根）同时依赖两者，注入具体后端。
- `@novasheet/web` 删除。

---

## 4. core/src 目录结构（纯 / DOM 两段硬分）

```
packages/core/src/
│  ── 纯模型层 · 零 DOM · 可 node/worker · 脱 DOM 测（维持现状）──
├── kernel/
├── features/
├── engine/
├── ports/                      端口接口(纯)
│     └── RenderBackend.ts       ← 原 web/render/WebRenderer.ts
│
│  ── DOM 壳层 · browser-only · 依赖纯模型，绝不反向 ──
├── dom/
│   ├── host/                    DomGridHost / Host(原 WebHost) / styles/*
│   ├── scroll/                  NativeScroller / ScrollMapper
│   ├── interaction/             drag/* · DomCellEditor · DomContextMenuLayer ·
│   │   └── handle/              DomHandleLayer · DomFillHandleLayer · Hide*ToggleHandle
│   ├── overlay/                 SelectionOverlay · Row/ColumnReorderOverlay ·
│   │                            RowHeight/ColumnWidthPopover · FilterPopover · RangeOverlayRects
│   ├── clipboard/               DomClipboardAdapter(原 WebClipboardAdapter)
│   └── runtime/                 GridRuntime(原 WebGridRuntime) · GridController 接口
│
├── Grid.ts                      公共 facade：通用装配 dom/ + 注入的 RenderBackend
└── index.ts                     导出 Grid / ports / engine / 公共类型
```

### 内部 import 规则（ESLint 守，§8）

- `dom/**` 可依赖 `kernel|features|engine|ports`；**反向禁止**。
- `ports/**`、`kernel/**`、`features/**`、`engine/**` 保持纯：禁 `document` / `window` / `HTMLElement` / DOM 全局。

### 文件迁移映射（全量）

| 现在 `packages/web/src/` | 落地 `packages/core/src/` |
| --- | --- |
| `Grid.ts` | `Grid.ts` |
| `backends/Canvas2DBackend.ts` | **拆**：通用装配 → `Grid.ts`；canvas2d 专有 → `canvas2d` 的 `canvas2dBackend` 工厂 |
| `render/WebRenderer.ts` | `ports/RenderBackend.ts` |
| `grid/GridController.ts` | `dom/runtime/GridController.ts` |
| `runtime/WebGridRuntime.ts` | `dom/runtime/GridRuntime.ts` |
| `host/DomGridHost.ts` `host/WebHost.ts` `host/*-style.ts` | `dom/host/*` |
| `scroll/{NativeScroller,ScrollMapper}.ts` | `dom/scroll/*` |
| `interaction/drag/*` | `dom/interaction/drag/*` |
| `interaction/Dom*Layer.ts` `interaction/DomCellEditor.ts` | `dom/interaction/*` |
| `handle/Hide*ToggleHandle.ts` | `dom/interaction/handle/*` |
| `overlay/*` `interaction/{FilterPopover,RangeOverlayRects}.ts` | `dom/overlay/*` |
| `clipboard/WebClipboardAdapter.ts` | `dom/clipboard/DomClipboardAdapter.ts` |

> 命名：`Web*`/`Dom*` 前缀逐步去掉（`WebGridRuntime → GridRuntime`、`WebHost → Host`），但不强制一次到位；保留处不阻塞迁移。

---

## 5. 纯模型为何不被污染：以 select 为范例

合并进同一个包**不**模糊纯度——边界靠**单向数据流 + 三个降解点**保持，字节不变。`features/selection/` 经 grep 验证**零 DOM**。

### 5.1 数据流

```
DOM 壳 (dom/)                       纯模型 (features/engine)            DOM 壳 (dom/overlay)
原生 PointerEvent
   │ DomGridHost 降解
   ▼
WebPointerEvent {x,y,...}  ← DOM 到此为止（纯 DTO）
   │ SelectionDrag
   │ hitTestCell(frame,{x,y}) ─────▶ kernel/interaction（纯函数）= CellAddress
   ▼
engine.selectCell(CellAddress) ───▶ SelectionController.selectCell（零 DOM）
                                     → GridSelection（坐标代数 + merge 解析）
                                     → RenderFrame.selection（纯快照, view 坐标）
                                            │ refresh()
                                            └──────────────────────▶ SelectionOverlay
                                                                     读 frame.selection
                                                                     → createElement 画矩形
```

### 5.2 框选三阶段

| 阶段 | 触发 | 壳层 | 纯模型 | 画 |
| --- | --- | --- | --- | --- |
| 锚定 | `pointerdown` | `tryStart`：降解 → hitTest → `selectCell(anchor)` | 单格选区 | 1 格 |
| 框选 | `pointermove`×N | `move`：hitTest → `selectCell(cur,{extend})` + autoScroll | `setSelectedRange(anchor→cur)` + merge 吸附 | 矩形随光标长大 |
| 收尾 | `pointerup` | `end`：清状态、停 autoScroll | 终态已在 `frame.selection` | 定格 |

### 5.3 三个降解点（切断 DOM↔feature 耦合）

| 降解点 | 位置（合并后） | 作用 |
| --- | --- | --- |
| `WebPointerEvent` | `dom/host/Host.ts` | host 把原生事件压成纯 `{x,y,...}` DTO；DOM 事件不过此线 |
| `hitTestCell` | `kernel/interaction/HitTest.ts`（纯函数） | 坐标 ↔ `CellAddress` 唯一翻译点 |
| `RenderFrame.selection` | kernel 纯快照 | feature 状态只读出口；overlay 单向消费 |

**结论**：feature 处理的是坐标与选区代数，不碰 DOM；DOM 壳不持选区状态、不算选区逻辑。这条天然单向链即 `dom/** → features/**` 单向 lint 规则的根据。所有交互（edit / fill / reorder / context-menu / resize）同构。

---

## 6. RenderBackend 端口与组合根

### 6.1 端口（即现成的 WebRenderer，移入 ports 并改名）

```ts
// core/src/ports/RenderBackend.ts —— 纯接口，只依赖 RenderFrame
export interface RenderBackend {
  mount(surfaceSlot: HTMLElement): void
  resize(width: number, height: number, dpr: number): void
  render(frame: RenderFrame): void
  destroy(): void
}
export type RenderBackendFactory = (deps: RenderBackendDeps) => RenderBackend
```

- `RenderBackendDeps` 携带后端绘制所需的纯依赖（theme、text measurer 入口等），由 core 装配层提供。
- text measurer 同样以端口形式由后端工厂提供（canvas2d 用 `Canvas2DTextMeasurer`），core 的 autofit/measure 经端口调用，不 import canvas2d。

### 6.2 surface 归属

- **host 拥有**：挂载容器、DOM overlay（select 层 / 滚动条）、scroll host。
- **backend 拥有**：自己的绘制 surface（canvas）。webgl 后端换 surface 不动 host。

### 6.3 组合根

```ts
// apps/storybook（及未来 app）
import { Grid } from '@novasheet/core'
import { canvas2dBackend } from '@novasheet/canvas2d'

new Grid({ data, backend: canvas2dBackend })   // 换 webgl 只换工厂
```

`@novasheet/canvas2d` 新增导出 `canvas2dBackend`（工厂：建 canvas/HighDPI/Canvas2DRenderer/TextMeasurer，返回 `RenderBackend` + measurer）。`Canvas2DBackend.ts` 现有装配里**通用部分**（host + runtime + 全部 DOM 交互层）上移进 core `Grid.ts`；**canvas2d 专有部分**收敛成该工厂。

---

## 7. 迁移姿态

- **增量**：按 §4 映射逐目录搬移 + 重接线，每步保持 `bun test` 全绿；不做单 commit 大爆炸。
- **零行为变化**：公共 `Grid` API 行为、事件、undo kind/payload 不变。
- **DIP 边先立**：先把 `WebRenderer → ports/RenderBackend`、`canvas2dBackend` 工厂、组合根注入落地（翻转依赖方向），再搬其余 DOM 壳；避免中途 core↔canvas2d 双向依赖。

---

## 8. 工具链与文档改写

| 项 | 变更 |
| --- | --- |
| 测试 setup | core 测试 preload 分两档：纯引擎测试走无 DOM setup；`dom/**` 测试引入 happy-dom。`bunfig.toml` 去掉 web 段、并入 core 段 |
| build 顺序 | `core` 不再 externalize web；`canvas2d` 反向依赖 core，build 顺序 `core → canvas2d` |
| ESLint | 新增 import 边界规则：`kernel|features|engine|ports` 禁 DOM 全局 + 禁依赖 `dom/**`；`dom/**` 禁被纯层依赖 |
| `CLAUDE.md` | 重写「依赖方向 / core 平台无关 / 无 DOM」三段；不变量 #1 措辞（Renderer 仍只读 engine frame，但 host 在 core 内）；记录本 ADR「core 吸收 DOM」 |
| `packages/web/*` | 删除；storybook / 测试 import 从 `@novasheet/web` 改为 `@novasheet/core` |

---

## 9. 风险

| 风险 | 缓解 |
| --- | --- |
| 搬移中途 core↔canvas2d 双向依赖、循环 | §7 先翻转 DIP 边再搬壳；CI 加循环依赖检查 |
| core 测试引入 happy-dom 拖慢纯引擎测试 | 两档 setup 隔离；纯层测试不加载 happy-dom |
| `Canvas2DBackend` 通用/专有拆分遗漏 canvas 所有权语义 | 保持「canvas 由 backend 拥有」不变量；host 只给 surface slot |
| 大量 import 路径变更引入笔误 | 增量分步 + 全程 test 绿 + typecheck 守 |

---

## 10. 验收

- `@novasheet/web` 已删除；无任何代码 import 它。
- `core` 不 import `canvas2d`；`canvas2d` 依赖 `core` 实现 `RenderBackend`。
- `apps/storybook` 经 `new Grid({ ..., backend: canvas2dBackend })` 注入后端，所有 story 行为不变。
- 四关（lint / typecheck / test / build）全绿；交互行为零变化。
- ESLint 边界规则生效：纯层任一 DOM 引用或对 `dom/**` 的依赖报错。
