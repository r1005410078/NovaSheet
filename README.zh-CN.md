# NovaSheet

> 高性能、AI-Native 数据工作台的 Spreadsheet Engine。

[English README](README.md) · [Live demo](https://r1005410078.github.io/NovaSheet/) · [贡献指南](CONTRIBUTING.md)

[![CI](https://github.com/r1005410078/NovaSheet/actions/workflows/ci.yml/badge.svg)](https://github.com/r1005410078/NovaSheet/actions/workflows/ci.yml)
[![Live demo](https://img.shields.io/badge/demo-Storybook-ff4785)](https://r1005410078.github.io/NovaSheet/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**[Live demo（Storybook）](https://r1005410078.github.io/NovaSheet/)** — 在线查看表格变体（冻结、滚动、autofit、Excel 表头等）。

NovaSheet 旨在演进为 AI Native 数据工作台。它提供一个基于 Canvas 的高性能现代表格渲染引擎，目标支撑 **1,000,000+ 行 × 500+ 列** 的数据规模，支持海量数据、实时更新、多视图与 Workbench 化扩展。

NovaSheet is open source under the [MIT License](LICENSE). Contributions, bug reports, and design discussions are welcome through [issues](https://github.com/r1005410078/NovaSheet/issues) and pull requests.

---

## 当前状态

最近交付：**Phase 5-C 值格式化 · 单元格扩展 API（+ `@zhiguang/cell-kit` 富文本）· 数据校验 · `WindowedDataSource` 远程数据 · React 适配**。下一里程碑：**Phase 5-D 条件格式**。

| 维度                     | 数值                                                                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| 包                       | `@zhiguang/core` · `@zhiguang/canvas2d` · `@zhiguang/react` · `@zhiguang/cell-kit` · `@zhiguang/mbd`         |
| 测试                     | 1,797 passing（bun:test，跨 workspace，公开 API 有 BDD 验收场景背书）                                             |
| Lint / Typecheck / Build | 全部 clean                                                                                                        |
| 公共 API                 | `import { Grid } from '@zhiguang/core'` + `backend: canvas2dBackend()` 注入渲染后端；React 用 `@zhiguang/react` |
| License                  | MIT                                                                                                               |

---

## 里程碑总表

唯一权威阶段表。所有「已交付 / 计划中 / 验证项」状态以本表为准。

| 阶段                               | 范围                                                                                                                                                                              | 状态   | Spec / Plan                                                                                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1 Foundation                      | Canvas 单帧渲染 · Theme Token · DataSource · ChunkedAxis · Painters · FrameScheduler · Grid facade（destroy 幂等）                                                                | ✅     | [spec](docs/superpowers/specs/2026-05-13-novasheet-phase1-canvas-grid-design.md)                                                                                                   |
| M2 虚拟滚动                        | NativeScroller + 非线性 scrollTop 映射 · scrollToRow/Cell · 1M+ 行                                                                                                                | ✅     | [plan](docs/superpowers/plans/2026-05-15-novasheet-m2-virtualization.md)                                                                                                           |
| M3 冻结 / autofit                  | 顶 / 左 / 右冻结（FrozenRegions + 分区绘制 + 分隔线）· 动态行高 · 多行文本 autofit                                                                                                | ✅     | —                                                                                                                                                                                  |
| Phase 2 Canvas 绘制分层            | background / content / grid / overlay 层；为 Selection · Resize · Fill handle 预留接口                                                                                            | ✅     | —                                                                                                                                                                                  |
| Phase 3.1 选择模型                 | SelectionTypes · hitTestCell · 点击选中 · 选区填充 + active cell 边框                                                                                                             | ✅     | —                                                                                                                                                                                  |
| Phase 3.2 扩展选择                 | Shift+点击 · 拖拽框选 · 自动滚动 · Excel 头联动 · range overlay                                                                                                                   | ✅     | —                                                                                                                                                                                  |
| Phase 3.3 键盘导航                 | ↑↓←→ / Tab / Enter · Shift+扩展 · 滚动跟随 active cell                                                                                                                            | ✅     | —                                                                                                                                                                                  |
| Phase 3.4 行列 resize              | DOM handle 命中区 · 拖拽列宽 / 行高（最小 20px）· 冻结同步                                                                                                                        | ✅     | —                                                                                                                                                                                  |
| Phase 3.5 基础编辑                 | 选中即键入 · F2 / 双击 · Esc 取消 · Enter 提交下移 · text / number                                                                                                                | ✅     | —                                                                                                                                                                                  |
| Phase 4.0 单元格右键菜单           | ContextMenuLayer portal · Cut / Copy / Paste · `onContextMenuAction` · ARIA + 键盘                                                                                                | ✅     | [spec](docs/superpowers/specs/2026-05-17-context-menu-design.md)                                                                                                                   |
| Phase 4.1 剪贴板                   | TSV + 内部 hash · Cmd/Ctrl+X/C/V · Excel/Sheets 互通 · `onPasteSkipped` · 编程 API                                                                                                | ✅     | [spec](docs/superpowers/specs/2026-05-18-clipboard-design.md)                                                                                                                      |
| Phase 4.2 Undo / Redo              | UndoStack(100) + discriminated UndoCommand · cell / Cut / Paste / resize 进栈 · 键盘 + 事件                                                                                       | ✅     | [spec](docs/superpowers/specs/2026-05-21-undo-redo-design.md)                                                                                                                      |
| Phase 4.3 填充柄                   | 选区右下角 fill handle · 四方向 · 单值 / 数字等差 / 文本尾号 / Date 序列 · 进 undo                                                                                                | ✅     | [spec](docs/superpowers/specs/2026-05-21-fill-handle-design.md)                                                                                                                    |
| Phase 4.4 排序 / 筛选              | ViewLayer / ViewPipeline · 列头菜单 · header 图标 · DOM FilterPopover · 底层行语义                                                                                                | ✅     | [spec](docs/superpowers/specs/2026-05-22-sort-filter-design.md)                                                                                                                    |
| Phase 4.5 行结构 + 行头菜单        | 行 insert / delete / hide · 行头右键菜单 · HideRowsLayer · 三角 unhide handle · 行高弹层                                                                                          | ✅     | [spec](docs/superpowers/specs/2026-05-23-novasheet-phase-4-5-row-structural.md)                                                                                                    |
| Phase 4.6 列结构 + 列头菜单扩展    | 列 insert / delete / hide · 列头菜单新增结构项 · 列头 unhide 入口                                                                                                                 | ✅     | [spec](docs/superpowers/specs/2026-05-24-novasheet-phase-4-6-column-structural.md)                                                                                                 |
| Phase 4.7 列拖拽重排               | Google Sheets 式先选列再拖动 · DOM 目标列带 + 落点线 · 多列重排 · undo/redo                                                                                                       | ✅     | [spec](docs/superpowers/specs/2026-05-25-novasheet-phase-4-7-column-drag-reorder.md) · [plan](docs/superpowers/plans/2026-05-25-novasheet-phase-4-7-column-drag-reorder.md)        |
| Phase 5-A 合并 + 基础 Range 格式化 | 单元格合并 / 取消合并 · 填充色 · 基础边框（all/outer/inner/clear · 颜色 · thin/medium/thick · solid）· 结构变更坐标同步 · undo/redo · 内部复制粘贴合并保护 · 公开 API · Storybook | ✅     | [spec](docs/superpowers/specs/2026-05-28-novasheet-phase-5-merge-range-formatting.md) · [plan](docs/superpowers/plans/2026-05-28-novasheet-phase-5-a-merge-basic-range-styling.md) |
| Phase 5-B 高级边框                 | 单边边框 · dashed/dotted/double 线型                                                                                                                                              | ✅     | [spec](docs/superpowers/specs/2026-05-31-novasheet-phase-5-b-advanced-borders.md)                                                                                                  |
| Phase 5-C 值格式化                 | number / currency / percent / date `ValueFormat` · 自定义 formatter 注册表 · raw 值不变 · text-wrap 三态 + Alt+Enter 多行                                                         | ✅     | [spec](docs/superpowers/specs/2026-06-10-novasheet-phase-5-c-value-formatting-design.md)                                                                                           |
| 单元格扩展 API                     | `cellTypes` / `cellEditors` / `cellAttachments`（core）+ `cellRenderers`（backend）四轴注册 · per-cell `setCellType` override · `@zhiguang/cell-kit` 富文本参考实现              | ✅     | [spec](docs/superpowers/specs/2026-06-12-novasheet-cell-extension-api-design.md) · [override](docs/superpowers/specs/2026-06-14-novasheet-cell-level-type-override-design.md)      |
| 数据校验                           | sync/async `ValidatorDefinition` · 编辑/粘贴/填充/undo 全写入路径自动接线 · 批量 + 并发限流                                                                                       | ✅     | [spec](docs/superpowers/specs/2026-06-15-novasheet-cell-data-validation-design.md)                                                                                                 |
| WindowedDataSource 远程数据        | 滑动窗口 fetch/subscribe · LRU 块缓存 · stale-while-revalidate · 经 sort/filter/hide 装饰链透传                                                                                   | ✅     | [spec](docs/superpowers/specs/2026-07-05-novasheet-windowed-data-source-design.md)                                                                                                 |
| React 适配                         | `@zhiguang/react`：`<NovaExcel />` Excel 壳 · `<NovaSheetGrid />` · hooks · toolbar                                                                                              | ✅     | [README](packages/react/README.md)                                                                                                                                                 |
| Phase 5-D 条件格式                 | 条件格式规则                                                                                                                                                                      | 下一步 | [spec](docs/superpowers/specs/2026-05-28-novasheet-phase-5-merge-range-formatting.md)                                                                                              |
| Phase 6 字段类型 + Schema          | 字段编辑器 · lookup / rollup · 分组 / 聚合                                                                                                                                        | 计划中 | —                                                                                                                                                                                  |
| Phase 7 公式 / 导入导出            | 公式引擎 · 跨 sheet · 命名区域 · 透视表 · 图表 · xlsx / csv                                                                                                                       | 计划中 | —                                                                                                                                                                                  |
| Phase 8 服务端 / 多视图            | 服务端分页 DataSource · OPFS · 协同 · Grid / Kanban / Calendar / Gallery                                                                                                          | 计划中 | —                                                                                                                                                                                  |
| Phase 9 框架适配                   | Vue Wrapper                                                                                                                                                                       | 计划中 | —                                                                                                                                                                                  |
| Phase 10 AI Native                 | 自然语言查询 · 洞察 · 智能补全                                                                                                                                                    | 计划中 | —                                                                                                                                                                                  |
| 验证项（低优先级）                 | `apps/playground`（1M mock）· Playwright 跨浏览器 · iOS Safari 真机                                                                                                               | 待启动 | —                                                                                                                                                                                  |

架构细节见 [docs/architecture.md](docs/architecture.md)；设计 spec 与 plan 见 [docs/superpowers/](docs/superpowers/)。

---

## Quick Start

```bash
bun install
bun run --filter @zhiguang/core build
bun run --filter @zhiguang/canvas2d build
```

```ts
import { Grid, InMemoryDataSource, denseGridTheme } from '@zhiguang/core'
import { canvas2dBackend } from '@zhiguang/canvas2d'

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
  backend: canvas2dBackend(), // 必填：渲染后端注入
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
┌─────────────────────────────────────────────────────────────┐
│   组合根：apps/storybook · @zhiguang/react                 │
│   new Grid(container, { data, backend: canvas2dBackend() }) │
└──────────────┬──────────────────────────┬───────────────────┘
               │ 使用                     │ 注入
               ▼                          ▼
┌──────────────────────────┐   ┌─────────────────────────────┐
│   @zhiguang/core        │   │   @zhiguang/canvas2d       │
│   Grid（公开 facade）    │   │   canvas2dBackend()         │
│   DefaultGridEngine      │◄──│   Canvas2DRenderer          │
│   kernel/features/engine │   │   painters · HighDPI        │
│   DOM 壳（dom/）         │   │   实现 RenderBackend 端口   │
│   ports/RenderBackend    │   │   （反向依赖 core）         │
└──────────────────────────┘   └─────────────────────────────┘
```

**依赖方向（无环）**：`core` ← `canvas2d` ← `cell-kit`；`react` 依赖 core + canvas2d；core 永不 import 渲染器——canvas2d 实现 core 的 `RenderBackend` 端口反向依赖（依赖反转）。

---

## 仓库结构

```
novasheet/
├── packages/
│   ├── core/                @zhiguang/core — 引擎 + DOM 壳 + 公开 Grid facade
│   ├── canvas2d/            @zhiguang/canvas2d — Canvas2D 渲染后端（RenderBackend 实现）
│   ├── react/               @zhiguang/react — React 适配（NovaExcel 壳 + hooks）
│   ├── cell-kit/            @zhiguang/cell-kit — opt-in 单元格组件（富文本）
│   └── mbd/                 @zhiguang/mbd — MD 场景 BDD 工具链（dev-only）
├── apps/
│   └── storybook/           组件变体玩具间
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
bun run --filter @zhiguang/core build
bun run --filter @zhiguang/canvas2d build
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
bun run --filter @zhiguang/core test
bun run --filter @zhiguang/core typecheck
bun run --filter @zhiguang/core build
```

---

## 开源协作

NovaSheet 当前处于 pre-1.0 阶段，但仓库按长期开放基础设施项目维护：

- **License**：MIT，见 [LICENSE](LICENSE)
- **贡献指南**：见 [CONTRIBUTING.md](CONTRIBUTING.md)
- **安全报告**：见 [SECURITY.md](SECURITY.md)
- **变更记录**：见 [CHANGELOG.md](CHANGELOG.md)
- **在线演示**：GitHub Pages 自动部署 Storybook
- **CI**：PR 与 `main` push 均执行 lint、typecheck、test、build

适合提交的贡献包括：可复现 bug、性能回归、Storybook 示例、文档改进、测试覆盖，以及与里程碑表一致的引擎 / 渲染 / Web runtime 能力。

---

## License

NovaSheet is licensed under the [MIT License](LICENSE).
