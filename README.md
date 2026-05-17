# NovaSheet

> 高性能、AI-Native 数据工作台的 Spreadsheet Engine。

NovaSheet 旨在演进为 AI Native 数据工作台。它提供一个基于 Canvas 的高性能现代表格渲染引擎，目标支撑 **1,000,000+ 行 × 500+ 列** 的数据规模，支持海量数据、实时更新、多视图与 Workbench 化扩展。

---

## 当前状态

三包拆分已完成；**M1 Foundation**、**M2 虚拟滚动**与 **M3 冻结 / 尺寸自适应** 已落地。公共 API 从 `@novasheet/web` 导出。

| 维度                     | 数值                                                                                                                 |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| 包                       | `@novasheet/core` · `@novasheet/web` · `@novasheet/web-canvas2d`                                                     |
| 测试                     | 151 passing（bun:test，跨三包）                                                                                      |
| Lint / Typecheck / Build | 全部 clean                                                                                                           |
| 公共 API                 | `import { Grid } from '@novasheet/web'`（默认 `renderer: 'canvas2d'`）；数据 / 主题 / 冻结类型来自 `@novasheet/core` |

### 已交付

| 里程碑     | 能力                                                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| M1         | Canvas 单帧渲染 · Theme Token · DataSource · ChunkedAxis · Cell / Header / GridLines painter · `FrameScheduler` · Grid facade（`destroy` 幂等） |
| M2         | 原生滚动（`NativeScroller` + `ScrollMapper` 非线性 `scrollTop` 映射）· `scrollToRow` / `scrollToCell` · 1M+ 行虚拟滚动                          |
| M3         | 顶 / 左 / 右冻结（`FrozenRegions` + 分区域绘制 + 冻结分隔线）· `frozen` 配置 / `setFrozen()` · 动态行高 / 多行文本 autofit                    |

### 暂未交付

| 阶段                 | 内容                                                                               |
| -------------------- | ---------------------------------------------------------------------------------- |
| Phase 2              | Canvas 交互绘制分层                                                                |
| Phase 3              | 选择 / 高亮 · 键盘导航 · 行列 resize handles · 基础编辑                            |
| Phase 4+             | 复制粘贴 · Undo / Redo · 单元格合并 · 字段类型编辑器 · 公式 / 导入导出 · 框架适配层 |
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

本地查看变体：`bun run storybook` → 选 **表格 / 冻结** 等分组下的 **README**，可看到说明文字、各 story 预览与默认展开的 TypeScript 示例。

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
- **Phase 2**：Canvas 交互绘制分层
- **Phase 3**：选择 / 高亮 · 键盘导航 · 行列 resize handles · 基础编辑
- **Phase 4**：复制 / 粘贴 / 剪切 · Undo / Redo · 填充柄 · 排序 / 筛选 · 插入 / 删除 / 隐藏行列
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

- 单元格 / 行 / 列 / 区域选中，选区变色，活动单元格高亮
- 鼠标拖拽框选，Shift 扩展选区
- 键盘导航：方向键、Tab、Enter、Shift + 方向键
- 行高 / 列宽 resize handles
- 基础编辑：双击 / Enter 进入编辑，Esc 取消，Enter 提交

### 暂缓的大功能

- 单元格合并会影响布局、渲染、命中测试、选区、复制粘贴、编辑与 autofit，单独放到 Phase 5。
- 公式、数据透视表、图表、xlsx 导入导出属于 Excel 高阶能力，放到 Phase 7。
- 智能表格的字段类型编辑器、关联记录、lookup / rollup 属于 Schema 层能力，放到 Phase 6。
- React Wrapper 等框架适配层待核心 API 稳定后再做，放到 Phase 9。

---

## License

TBD
