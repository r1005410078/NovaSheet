# NovaSheet

> 高性能、AI-Native 数据工作台的 Spreadsheet Engine。

NovaSheet 旨在演进为 AI Native 数据工作台。它提供一个基于 Canvas 的高性能现代表格渲染引擎，目标支撑 **1,000,000+ 行 × 500+ 列** 的数据规模，支持海量数据、实时更新、多视图与 Workbench 化扩展。

---

## 当前状态

三包拆分已完成；**M2 虚拟滚动**与 **M3 冻结区域绘制**（顶 / 左 / 右）已落地。公共 API 从 `@novasheet/web` 导出。

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
| M3（部分） | 顶 / 左 / 右冻结（`FrozenRegions` + 分区域绘制 + 冻结分隔线）· `frozen` 配置 / `setFrozen()`                                                    |

### 暂未交付

| 里程碑     | 内容                                                                    |
| ---------- | ----------------------------------------------------------------------- |
| M3（剩余） | 动态行高 / 多行文本 autofit                                             |
| M4         | DOM resize handles · 选区 / 编辑 · React Wrapper                        |
| M5         | `apps/playground`（1M mock）· Playwright 跨浏览器 · iOS Safari 真机验证 |

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

- `packages/react/` (M4) — React Wrapper
- `apps/playground/` (M5) — 含 1M mock 的性能验证演示

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

- **Phase 1**（进行中）：M1 Foundation ✅ → M2 滚动 ✅ → M3 冻结（绘制 ✅，动态行高待做）→ M4 交互+React → M5 跨浏览器
- **Phase 2**：选区 / 键盘导航 / 复制粘贴 / 单元格编辑 / 字段类型专属编辑器 / 暗色主题
- **Phase 3**：排序 / 筛选 / 分组 / 列重排 / 列隐藏
- **Phase 4**：服务端分页 DataSource / OPFS / 协同
- **Phase 5**：公式引擎 / 多视图
- **Phase 6**：AI Native（自然语言查询、洞察、智能补全）

---

## License

TBD
