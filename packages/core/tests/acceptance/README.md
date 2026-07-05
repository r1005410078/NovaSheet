# Core Acceptance Tests

`@novasheet/core` 的 BDD 验收根目录。场景用 MBD Markdown 写契约，测试用手写 `bun:test` 执行；与 `tests/kernel`、`tests/features`、`tests/engine` 的 TDD 单元测并列。

| 项 | 路径 |
| --- | --- |
| 场景规格 | `**/scenarios/*.md`（frontmatter `layer` = L0/L1/L2） |
| 机读清单 | `scenarios.manifest.json` |
| 配置 | `packages/core/mbd.config.ts` |

**约定：** `it()` 标题以 scenario `id` 开头；禁止 `delegate.engine` 穿透。

---

## 目录 taxonomy

按 **测试类型 + 行为域** 分层，而非按源码包名分层：

```text
acceptance/
├── _helpers/fixtures.ts
├── functional/                 # 功能行为：求值、重算、数据运算
│   ├── formula/                #   公式语义（占位）
│   ├── recalculation/          #   依赖重算、脏区传播（占位）
│   └── data-ops/               #   数据源、工作区、排序、筛选
├── interaction/                # 交互行为：键盘、选区、撤销、填充柄
│   ├── selection/
│   ├── editing/
│   └── undo/
├── rendering/                  # 视觉 / 渲染回归（占位）
│   └── __goldens__/
├── contract/                   # 对外契约：文件格式、插件 API、事件
│   ├── file-format/
│   ├── plugin-api/
│   └── events/
├── performance/                # 性能基准（占位）
├── properties/                 # 属性 / 不变量（公开纯函数）
├── e2e/                        # Core 端到端：Grid + backend 可观测旅程
│   ├── engine/
│   └── grid/
├── scenarios.manifest.json
└── SCENARIOS.md
```

空目录带 `README.md` 占位，避免后续域落盘时改 taxonomy。

---

## 测试文件职责（当前 75 条场景）

| 测试文件 | 场景数 | Layer | 职责 |
| --- | ---: | --- | --- |
| [`functional/data-ops/bdd.test.ts`](./functional/data-ops/bdd.test.ts) | 13 | L0+L2 | DataSource / Workspace / `formatValue`；View pipeline 排序、筛选、hide 组合、format/merge raw 键 |
| [`functional/data-ops/windowed-bdd.test.ts`](./functional/data-ops/windowed-bdd.test.ts) | 8 | L0 | `WindowedDataSource`：骨架优先、overscan 预取、推送更新、订阅跟随、SWR 新鲜度、epoch 收缩、resync、dispose |
| [`e2e/engine/bdd.test.ts`](./e2e/engine/bdd.test.ts) | 3 | L1 | `DefaultGridEngine` headless oracle：`getFrame` golden、`moveRows` undo/redo、结构 mutation 事件流 golden |
| [`e2e/grid/bdd.test.ts`](./e2e/grid/bdd.test.ts) | 20 | L2 | `Grid` 门面旅程：生命周期、data/theme、布局/冻结/滚动、autofit、行列结构、表头菜单、格式、合并 |
| [`properties/spatial.test.ts`](./properties/spatial.test.ts) | 4 | L0 | 坐标 / range / scroll / hit-test 不变量 |
| [`properties/inventory.test.ts`](./properties/inventory.test.ts) | 7 | L0 | 主题 token（golden）、几何原语、resize handle、context menu 清单（golden）、文本换行；frozen-regions 几何已并入 rendering 冻结象限 golden |
| [`contract/file-format/bdd.test.ts`](./contract/file-format/bdd.test.ts) | 3 | L0 | TSV 往返（serialize golden）、parse 类型矩阵 golden、paste×merge 线性格式冲突 |
| [`contract/plugin-api/bdd.test.ts`](./contract/plugin-api/bdd.test.ts) | 1 | type-only | 公开类型可导入、可构造 |
| [`contract/events/bdd.test.ts`](./contract/events/bdd.test.ts) | 1 | L2 | `Grid.on` / `onUndo` / `onRedo` / `onFill` 订阅与退订 |
| [`interaction/selection/bdd.test.ts`](./interaction/selection/bdd.test.ts) | 3 | L0+L2 | 选区 set/get、结构变更 remap、方向键导航 |
| [`interaction/editing/bdd.test.ts`](./interaction/editing/bdd.test.ts) | 6 | L0+L2 | 剪贴板 facade、paste skipped、编辑解析、填充柄、fill-series 外推矩阵 golden |
| [`interaction/undo/bdd.test.ts`](./interaction/undo/bdd.test.ts) | 2 | L0 | undo 命令 JSON 可序列化、全 21 kind 字段集 golden |
| [`rendering/bdd.test.ts`](./rendering/bdd.test.ts) | 4 | L2 | RenderFrame 黄金快照：基础布局、fill×merge×值格式、冻结象限、hide×sort 视图组合（`GOLDEN_UPDATE=1` 重生成） |

---

## 场景落盘规则

| 行为 | 场景目录 |
| --- | --- |
| 数据源读写、稀疏工作区、自动扩容 | `functional/data-ops/scenarios/` |
| 排序 / 筛选 / view compose | `functional/data-ops/scenarios/` |
| 公式 / 重算（未来） | `functional/formula/`、`functional/recalculation/` |
| 选区、键盘导航 | `interaction/selection/scenarios/` |
| 剪贴板、填充柄、单元格编辑 | `interaction/editing/scenarios/` |
| undo 序列化 | `interaction/undo/scenarios/` |
| TSV、粘贴线性格式 | `contract/file-format/scenarios/` |
| 公开类型面 | `contract/plugin-api/scenarios/` |
| 事件订阅契约 | `contract/events/scenarios/` |
| 几何 / 主题 / 菜单等不变量 | `properties/scenarios/` |
| Engine / Grid 端到端旅程 | `e2e/engine/`、`e2e/grid/scenarios/` |

场景 **id**（`core.L0.*` 等）全局唯一，与目录正交。

---

## 共享夹具

[`_helpers/fixtures.ts`](./_helpers/fixtures.ts)：`mountRecordingGrid`、`createDenseData`、`withManualRaf`、`fillRange` 等。L2 场景依赖 `packages/core/tests/setup.ts` 的 happy-dom。

---

## 常用命令

```bash
bun run --filter @novasheet/core lint:mbd
bun run --filter @novasheet/core manifest:mbd
bun test packages/core/tests/acceptance
bun test packages/core/tests/acceptance/e2e/grid
```
