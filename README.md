# NovaSheet

> 高性能、AI-Native 数据工作台的 Spreadsheet Engine。

**[Live demo（Storybook）](https://r1005410078.github.io/NovaSheet/)** — 在线查看表格变体（冻结、滚动、autofit、Excel 表头等）。

NovaSheet 旨在演进为 AI Native 数据工作台。它提供一个基于 Canvas 的高性能现代表格渲染引擎，目标支撑 **1,000,000+ 行 × 500+ 列** 的数据规模，支持海量数据、实时更新、多视图与 Workbench 化扩展。

---

## 当前状态

三包拆分已完成；**M1 Foundation**、**M2 虚拟滚动**、**M3 冻结 / 尺寸自适应**、**Phase 2 Canvas 交互绘制分层** 与 **Phase 3.1/3.2 选择交互** 已落地。公共 API 从 `@novasheet/web` 导出。

| 维度                     | 数值                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| 包                       | `@novasheet/core` · `@novasheet/web` · `@novasheet/web-canvas2d`                                                     |
| 测试                     | 235 passing（bun:test，跨三包）                                                                                      |
| Lint / Typecheck / Build | 全部 clean                                                                                                           |
| 公共 API                 | `import { Grid } from '@novasheet/web'`（默认 `renderer: 'canvas2d'`）；数据 / 主题 / 冻结类型来自 `@novasheet/core` |

### 已交付

| 里程碑     | 能力                                                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| M1         | Canvas 单帧渲染 · Theme Token · DataSource · ChunkedAxis · Cell / Header / GridLines painter · `FrameScheduler` · Grid facade（`destroy` 幂等） |
| M2         | 原生滚动（`NativeScroller` + `ScrollMapper` 非线性 `scrollTop` 映射）· `scrollToRow` / `scrollToCell` · 1M+ 行虚拟滚动                          |
| M3         | 顶 / 左 / 右冻结（`FrozenRegions` + 分区域绘制 + 冻结分隔线）· `frozen` 配置 / `setFrozen()` · 动态行高 / 多行文本 autofit                    |
| Phase 2    | Canvas 交互绘制分层：background / content / grid / overlay · overlay 层入口预留                                      |
| Phase 3.1  | `SelectionModel` · `hitTestCell` · 点击单元格选中 · overlay 层绘制选区填充与 active cell 边框                    |
| Phase 3.2  | Shift + 点击扩展选区 · pointer 拖拽框选 · 拖选边缘自动滚动 · Excel 行列头联动高亮 · 多格 selectedRange overlay 绘制 |
| Phase 3.3  | 方向键 / Tab / Enter 移动 active cell · Shift + 方向键扩展选区 · 滚动跟随焦点格                         |
| Phase 3.4  | DOM resize handle：列头拖列宽、行号列拖行高（最小 20px）· 冻结区与普通区同步                           |
| Phase 3.5  | 基础编辑：选中即打字（Sheets 式）· F2/双击原位编辑 · Esc 取消 · Enter 提交下移 · text/number 列      |

### 暂未交付

| 阶段                 | 内容                                                                               |
| -------------------- | ---------------------------------------------------------------------------------- |
| Phase 4+             | 单元格右键菜单 · 复制粘贴 · Undo / Redo · 填充柄（序列填充）· 排序筛选 · 行列结构操作 |
| 低优先级验证项       | `apps/playground`（1M mock）· Playwright 跨浏览器 · iOS Safari 真机验证             |

架构细节见 [docs/architecture.md](docs/architecture.md)。

---

## Quick Start

```bash
bun install
bun run --filter @novasheet/core build
bun run --filter @novasheet/web-canvas2d build
bun run --filter @novasheet/web build
```

```ts
import { Grid } from '@novasheet/web'
import { InMemoryDataSource, denseGridTheme } from '@novasheet/core'

const data = new InMemoryDataSource({
  schema: {
    fields: [
      { id: 'employee', name: 'Employee', type: 'text', width: 160 },
      { id: 'team', name: 'Team', type: 'text', width: 120 },
      { id: 'region', name: 'Region', type: 'text', width: 100 },
      { id: 'revenue', name: 'Revenue', type: 'number', width: 120 },
      { id: 'growth', name: 'Growth', type: 'number', width: 100 },
      { id: 'owner', name: 'Owner', type: 'text', width: 140 },
      { id: 'status', name: 'Status', type: 'text', width: 100 },
      { id: 'notes', name: 'Notes', type: 'text', width: 240 },
    ],
  },
  rows: Array.from({ length: 100_000 }, (_, i) => ({
    employee: `Employee ${i}`,
    team: ['Platform', 'Data', 'Design'][i % 3],
    region: ['NA', 'EU', 'APAC'][i % 3],
    revenue: i * 1_000 + 250,
    growth: (i % 20) - 10,
    owner: `Owner ${i % 12}`,
    status: ['On track', 'Watch', 'Blocked'][i % 3],
    notes: `Quarterly note ${i}`,
  })),
})

const container = document.getElementById('app')!
const grid = new Grid(container, {
  data,
  theme: denseGridTheme,
  frozen: { topRows: 1, leftCols: 1, rightCols: 1 }, // 顶行 + 左/右列冻结，中间列可横滚
})

grid.scrollToCell(500, 'owner') // 滚到中间列，观察左右冻结列固定
grid.setColumnWidth('revenue', 140)
grid.setFrozen({ topRows: 2, leftCols: 1, rightCols: 1 })

// grid.destroy()
```

本地查看变体：`bun run storybook` → 选 **表格 /** 分组下的 **README**（如 **表格/选择与键盘**）查看说明与快捷键表；各 story 画布可交互，**Show code** 可复制源码。

### 选择与键盘（Phase 3）

无需额外 API：挂载 `Grid` 后，**先点击表格**获得焦点，即可使用：

| 操作 | 效果 |
|------|------|
| 单击 / Shift+单击 / 拖拽 | 单选、扩展选区、框选（3.1 / 3.2） |
| ↑↓←→ | 移动 active cell |
| Shift + ↑↓←→ | 扩展选区 |
| Tab / Shift+Tab | 右移 / 左移（末列换行） |
| Enter / Shift+Enter | 下移 / 上移 |

焦点格滚出视口时会自动滚入可见区域。完整说明见 Storybook **表格/选择与键盘**。

### 行列 resize（Phase 3.4）

- **列宽**：列头底边 8px 命中区，`col-resize` 拖拽（拖中竖线预览，松手提交列宽）
- **行高**：需 `excelHeaders: true`（或 `withExcelHeaders()`），行号列右缘 `row-resize` 拖拽（同上）
- 最小 20px；handle 聚焦后可用方向键微调（Shift 加大步长）

详见 Storybook **表格/行列 resize**。

在线 demo 由 GitHub Pages 托管（push `main` 后自动部署）。首次启用需在仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。

---

## 架构概览

```
┌────────────────────────────────────────────────────────────┐
│   @novasheet/web                                           │
│   Grid (public facade) · Canvas2DBackend · WebGridRuntime  │
│   DomGridHost · ScrollMapper · NativeScroller              │
└────────────────────────────┬───────────────────────────────┘
                             │ depends on
                             ▼
┌────────────────────────────────────────────────────────────┐
│   @novasheet/web-canvas2d                                  │
│   Canvas2DRenderer · Cell / Header / GridLines painters    │
│   HighDPI                                                  │
└────────────────────────────┬───────────────────────────────┘
                             │ depends on
                             ▼
┌────────────────────────────────────────────────────────────┐
│   @novasheet/core (no DOM, no canvas)                      │
│   DefaultGridEngine · DataSource · Theme · ChunkedAxis     │
│   FrozenRegions · Viewport · RenderFrame                     │
└────────────────────────────────────────────────────────────┘
```

**依赖方向（无环）**：`core` ← `web-canvas2d` ← `web` ← 应用 / Storybook。

设计 spec：[docs/superpowers/specs/](docs/superpowers/specs/)。

---

## 仓库结构

```
novasheet/
├── packages/
│   ├── core/                @novasheet/core — 平台无关引擎
│   ├── web/                 @novasheet/web — 对外 Grid + 浏览器编排
│   └── web-canvas2d/        @novasheet/web-canvas2d — Canvas2D 渲染器
├── apps/
│   └── storybook/           组件变体玩具间（vanilla HTML，无 React 依赖）
├── docs/
│   ├── architecture.md      当前架构图（Mermaid + 单帧序列）
│   └── superpowers/
│       ├── specs/           设计 spec
│       └── plans/           实现 plan + 里程碑追踪
├── bunfig.toml
├── bun.lock
└── package.json
```

后续会陆续加入：

- `packages/react/` (Phase 9) — React Wrapper
- `apps/playground/` (M5，低优先级) — 含 1M mock 的性能验证演示

---

## 开发脚本

```bash
bun install                # 安装依赖
bun test                   # 跑全部包测试
bun run --filter @novasheet/core build
bun run --filter @novasheet/web-canvas2d build
bun run --filter @novasheet/web build
bun run lint               # ESLint
bun run format             # Prettier 全量格式化
bun run storybook          # 启动组件变体玩具间（localhost:6006）
bun run build-storybook    # 构建静态 storybook 站点
# 本地预览 GitHub Pages 路径（与 CI 一致）：
STORYBOOK_BASE_PATH=/NovaSheet/ bun run build-storybook
bunx serve apps/storybook/storybook-static
```

针对单包：

```bash
bun run --filter @novasheet/core test
bun run --filter @novasheet/core typecheck
bun run --filter @novasheet/core build
```

---

## 路线图

详见 [Phase 1 设计文档](docs/superpowers/specs/2026-05-13-novasheet-phase1-canvas-grid-design.md) 附录 B：

- **Phase 1**（已完成）：M1 Foundation ✅ → M2 滚动 ✅ → M3 冻结 / 尺寸自适应 ✅
- **Phase 2**：Canvas 交互绘制分层 ✅
- **Phase 3**：基础交互（3.1–3.5 ✅：选择 · 键盘导航 · resize · 基础编辑）
- **Phase 4**：4.0 单元格右键菜单 · 4.1 复制 / 粘贴 / 剪切 · 4.2 Undo / Redo · 4.3 填充柄（序列填充）· 4.4 排序 / 筛选 · 4.5 插入 / 删除 / 隐藏行列（含列头 / 行头右键菜单）
- **Phase 5**：单元格合并 / 取消合并 · 对齐方式 · 数字 / 日期 / 百分比 / 货币格式化 · 条件格式
- **Phase 6**：字段类型专属编辑器 · Schema 校验 · 单元格校验规则 · 关联记录 / lookup / rollup · 分组 / 聚合 / 统计行
- **Phase 7**：公式引擎 · 跨 sheet 引用 · 命名区域 · 数据透视表 · 图表 · 导入导出 xlsx/csv
- **Phase 8**：服务端分页 DataSource / OPFS / 协同 · 多视图（Grid / Kanban / Calendar / Gallery）
- **Phase 9**：React Wrapper / Vue Wrapper / 框架适配层
- **Phase 10**：AI Native（自然语言查询、洞察、智能补全）
- **低优先级验证项**：M5 `apps/playground`（1M mock）· Playwright 跨浏览器 · iOS Safari 真机验证

### Phase 2 Canvas 交互绘制分层

Phase 2 先整理交互绘制的层级边界，为选区、hover、active cell、resize handle 等功能提供稳定落点：

- background layer：背景 / 行 hover / 选区填充
- cell content layer：文本 / 数字 / checkbox 等内容
- grid line layer：普通网格线 / 冻结分隔线
- overlay layer：选区边框 / active cell / resize handle / drag fill handle
- 为 `SelectionOverlayPainter` / `ResizeHandlePainter` / `HitTest` 预留接口

### Phase 3 基础交互范围

Phase 3 聚焦“用户能像表格一样操作当前画布”，不承载复杂数据结构能力：

| 子阶段    | 范围                     | 交付内容                                                                                                                                      |
| --------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 3.1 | 选择模型 / 点击高亮      | 引入 `SelectionModel` / active cell / selected range；点击单元格后 overlay 层绘制选区填充与活动单元格边框。                                  |
| Phase 3.2 | Shift / 拖拽扩展选择 ✅  | 基于 3.1 的 anchor / extent 扩展区域选择；支持 Shift + 点击、Shift + 方向键的数据状态、鼠标拖拽框选、拖选边缘自动滚动，以及 Excel 行列头联动高亮。 |
| Phase 3.3 | 键盘导航 ✅              | 方向键、Tab、Enter 移动 active cell；Shift + 方向键扩展 selected range；滚动跟随 active cell。                                                |
| Phase 3.4 | 行高 / 列宽 resize ✅    | DOM handle 层（列头 / 行号列命中区）；拖拽调整行高列宽；冻结与普通区每帧 sync。                                      |
| Phase 3.5 | 基础编辑 ✅              | 选中后直接键入进入编辑（Sheets 式）；F2 / 双击在原内容末尾编辑；Esc 取消；编辑中 Enter 提交并下移。                                        |

### Phase 4 剪贴板与结构操作

设计文档：[Phase 4.0 右键菜单](docs/superpowers/specs/2026-05-17-context-menu-design.md)

| 子阶段    | 范围                         | 交付内容                                                                                    |
| --------- | ---------------------------- | ------------------------------------------------------------------------------------------- |
| Phase 4.0 | 单元格右键菜单               | DOM `ContextMenuLayer`；Cut / Copy / Paste 条目（4.1 前可 disabled）；仅 body 单元格命中。 |
| Phase 4.1 | 剪贴板                       | `cut` / `copy` / `paste` 引擎 + Ctrl+X/C/V；与菜单共用命令。                                |
| Phase 4.2 | Undo / Redo                  | 命令栈；与编辑 / 剪贴板操作挂钩。                                                           |
| Phase 4.3 | 填充柄                       | 选区右下角 drag fill（overlay 层）——序列 / 公式外推，**不是**填充颜色（颜色属 Phase 5 cell formatting）。 |
| Phase 4.4 | 排序 / 筛选                  | 列头排序指示；筛选 UI（视 DataSource 能力）。                                               |
| Phase 4.5 | 行列结构 + 头区右键菜单      | 插入 / 删除 / 隐藏行列；**列头 / 行头** context menu（依赖本阶段 API）。                  |

Phase 3.1 会先把“后续 Shift 扩展选择、拖拽选择的基础状态”建好，但不会一次性交付全部选择手势。这个基础状态主要包括：

- `activeCell`：当前键盘焦点所在的单元格，也是编辑入口。
- `anchorCell`：扩展选择的起点；拖拽或 Shift 扩展时保持不动。
- `extentCell`：扩展选择的终点；鼠标拖到哪里或 Shift 扩展到哪里，它就更新到哪里。
- `selectedRange`：当前被选中的矩形区域，overlay layer 根据它绘制选区填充和边框。

也就是说：**activeCell / anchorCell 留在选择起点，extentCell 表示拖拽或 Shift 扩展终点，selectedRange 由 anchor → extent 计算**。这样从 A 拖到 C 时，活动单元格仍在 A，选区扩展到 A..C。

### 暂缓的大功能

- 单元格合并会影响布局、渲染、命中测试、选区、复制粘贴、编辑与 autofit，单独放到 Phase 5。
- 公式、数据透视表、图表、xlsx 导入导出属于 Excel 高阶能力，放到 Phase 7。
- 智能表格的字段类型编辑器、关联记录、lookup / rollup 属于 Schema 层能力，放到 Phase 6。
- React Wrapper 等框架适配层待核心 API 稳定后再做，放到 Phase 9。

---

## License

TBD
