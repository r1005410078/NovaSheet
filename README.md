# NovaSheet

> 高性能、AI-Native 数据工作台的 Spreadsheet Engine。

**[Live demo（Storybook）](https://r1005410078.github.io/NovaSheet/)** — 在线查看表格变体（冻结、滚动、autofit、Excel 表头等）。

NovaSheet 旨在演进为 AI Native 数据工作台。它提供一个基于 Canvas 的高性能现代表格渲染引擎，目标支撑 **1,000,000+ 行 × 500+ 列** 的数据规模，支持海量数据、实时更新、多视图与 Workbench 化扩展。

---

## 当前状态

最近交付：**Phase 4.7 列拖拽重排**。下一里程碑：**Phase 5 合并 / 格式化**。

| 维度                     | 数值                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| 包                       | `@novasheet/core` · `@novasheet/web` · `@novasheet/web-canvas2d`                                                     |
| 测试                     | 693 passing（bun:test，跨三包）                                                                                      |
| Lint / Typecheck / Build | 全部 clean                                                                                                           |
| 公共 API                 | `import { Grid } from '@novasheet/web'`（默认 `renderer: 'canvas2d'`）；数据 / 主题 / 冻结类型来自 `@novasheet/core` |

---

## 里程碑总表

唯一权威阶段表。所有「已交付 / 计划中 / 验证项」状态以本表为准。

| 阶段                              | 范围                                                                                                          | 状态      | Spec / Plan                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------ |
| M1 Foundation                     | Canvas 单帧渲染 · Theme Token · DataSource · ChunkedAxis · Painters · FrameScheduler · Grid facade（destroy 幂等） | ✅        | [spec](docs/superpowers/specs/2026-05-13-novasheet-phase1-canvas-grid-design.md)                       |
| M2 虚拟滚动                       | NativeScroller + 非线性 scrollTop 映射 · scrollToRow/Cell · 1M+ 行                                            | ✅        | [plan](docs/superpowers/plans/2026-05-15-novasheet-m2-virtualization.md)                               |
| M3 冻结 / autofit                 | 顶 / 左 / 右冻结（FrozenRegions + 分区绘制 + 分隔线）· 动态行高 · 多行文本 autofit                            | ✅        | —                                                                                                      |
| Phase 2 Canvas 绘制分层           | background / content / grid / overlay 层；为 Selection · Resize · Fill handle 预留接口                        | ✅        | —                                                                                                      |
| Phase 3.1 选择模型                | SelectionModel · hitTestCell · 点击选中 · 选区填充 + active cell 边框                                         | ✅        | —                                                                                                      |
| Phase 3.2 扩展选择                | Shift+点击 · 拖拽框选 · 自动滚动 · Excel 头联动 · range overlay                                               | ✅        | —                                                                                                      |
| Phase 3.3 键盘导航                | ↑↓←→ / Tab / Enter · Shift+扩展 · 滚动跟随 active cell                                                        | ✅        | —                                                                                                      |
| Phase 3.4 行列 resize             | DOM handle 命中区 · 拖拽列宽 / 行高（最小 20px）· 冻结同步                                                    | ✅        | —                                                                                                      |
| Phase 3.5 基础编辑                | 选中即键入 · F2 / 双击 · Esc 取消 · Enter 提交下移 · text / number                                            | ✅        | —                                                                                                      |
| Phase 4.0 单元格右键菜单          | ContextMenuLayer portal · Cut / Copy / Paste · `onContextMenuAction` · ARIA + 键盘                            | ✅        | [spec](docs/superpowers/specs/2026-05-17-context-menu-design.md)                                       |
| Phase 4.1 剪贴板                  | TSV + 内部 hash · Cmd/Ctrl+X/C/V · Excel/Sheets 互通 · `onPasteSkipped` · 编程 API                            | ✅        | [spec](docs/superpowers/specs/2026-05-18-clipboard-design.md)                                          |
| Phase 4.2 Undo / Redo             | UndoStack(100) + discriminated UndoCommand · cell / Cut / Paste / resize 进栈 · 键盘 + 事件                   | ✅        | [spec](docs/superpowers/specs/2026-05-21-undo-redo-design.md)                                          |
| Phase 4.3 填充柄                  | 选区右下角 fill handle · 四方向 · 单值 / 数字等差 / 文本尾号 / Date 序列 · 进 undo                            | ✅        | [spec](docs/superpowers/specs/2026-05-21-fill-handle-design.md)                                        |
| Phase 4.4 排序 / 筛选             | ViewLayer / ViewPipeline · 列头菜单 · header 图标 · DOM FilterPopover · 底层行语义                            | ✅        | [spec](docs/superpowers/specs/2026-05-22-sort-filter-design.md)                                        |
| Phase 4.5 行结构 + 行头菜单       | 行 insert / delete / hide · 行头右键菜单 · HideRowsLayer · 三角 unhide handle · 行高弹层                      | ✅        | [spec](docs/superpowers/specs/2026-05-23-novasheet-phase-4-5-row-structural.md)                       |
| Phase 4.6 列结构 + 列头菜单扩展   | 列 insert / delete / hide · 列头菜单新增结构项 · 列头 unhide 入口                                             | ✅        | [spec](docs/superpowers/specs/2026-05-24-novasheet-phase-4-6-column-structural.md)                       |
| Phase 4.7 列拖拽重排              | Google Sheets 式先选列再拖动 · DOM 目标列带 + 落点线 · 多列重排 · undo/redo                                 | ✅        | [spec](docs/superpowers/specs/2026-05-25-novasheet-phase-4-7-column-drag-reorder.md) · [plan](docs/superpowers/plans/2026-05-25-novasheet-phase-4-7-column-drag-reorder.md) |
| Phase 5 合并 / 格式化             | 单元格合并 / 对齐 / 数字 · 日期 · 百分比 · 货币格式化 · 条件格式                                              | 计划中    | —                                                                                                      |
| Phase 6 字段类型 + Schema         | 字段编辑器 · Schema 校验 · 单元格校验 · lookup / rollup · 分组 / 聚合                                         | 计划中    | —                                                                                                      |
| Phase 7 公式 / 导入导出           | 公式引擎 · 跨 sheet · 命名区域 · 透视表 · 图表 · xlsx / csv                                                   | 计划中    | —                                                                                                      |
| Phase 8 服务端 / 多视图           | 服务端分页 DataSource · OPFS · 协同 · Grid / Kanban / Calendar / Gallery                                      | 计划中    | —                                                                                                      |
| Phase 9 框架适配                  | React Wrapper · Vue Wrapper · 框架适配层                                                                      | 计划中    | —                                                                                                      |
| Phase 10 AI Native                | 自然语言查询 · 洞察 · 智能补全                                                                                | 计划中    | —                                                                                                      |
| 验证项（低优先级）                | `apps/playground`（1M mock）· Playwright 跨浏览器 · iOS Safari 真机                                           | 待启动    | —                                                                                                      |

架构细节见 [docs/architecture.md](docs/architecture.md)；设计 spec 与 plan 见 [docs/superpowers/](docs/superpowers/)。

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

### 键盘 / 选择速查

挂载 `Grid` 后，**先点击表格**获得焦点，即可使用：

| 操作                     | 效果                              |
| ------------------------ | --------------------------------- |
| 单击 / Shift+单击 / 拖拽 | 单选、扩展选区、框选              |
| ↑↓←→                     | 移动 active cell                  |
| Shift + ↑↓←→             | 扩展选区                          |
| Tab / Shift+Tab          | 右移 / 左移（末列换行）           |
| Enter / Shift+Enter      | 下移 / 上移                       |
| F2 / 双击                | 在原内容末尾进入编辑              |
| 任意可打印字符           | 选中即键入（Sheets 式）           |
| Esc                      | 取消编辑                          |
| Cmd/Ctrl+X / C / V       | 剪切 / 复制 / 粘贴（含 TSV 互通） |
| Cmd/Ctrl+Z / Shift+Z     | Undo / Redo                       |

焦点格滚出视口时会自动滚入可见区域。完整说明见 Storybook **表格/选择与键盘**。

### 行列 resize 速查

- **列宽**：列头底边 8px 命中区，`col-resize` 拖拽（拖中竖线预览，松手提交）
- **行高**：需 `excelHeaders: true`（或 `withExcelHeaders()`），行号列右缘 `row-resize` 拖拽
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
│   FrozenRegions · Viewport · RenderFrame · ViewPipeline    │
└────────────────────────────────────────────────────────────┘
```

**依赖方向（无环）**：`core` ← `web-canvas2d` ← `web` ← 应用 / Storybook。

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

---

## 开发脚本

```bash
bun install                # 安装依赖
bun test                   # 跑全部包测试
bun run --filter @novasheet/core build
bun run --filter @novasheet/web-canvas2d build
bun run --filter @novasheet/web build
bun run lint               # oxlint
bun run format             # Prettier 全量格式化（带 --cache）
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

## License

TBD
