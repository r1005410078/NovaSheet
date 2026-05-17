# NovaSheet

> 高性能、AI-Native 数据工作台的 Spreadsheet Engine。

NovaSheet 旨在演进为 AI Native 数据工作台。它提供一个基于 Canvas 的高性能现代表格渲染引擎，目标支撑 **1,000,000+ 行 × 500+ 列** 的数据规模，支持海量数据、实时更新、多视图与 Workbench 化扩展。

---

## 当前状态：Cross-platform refactor ✅

M2 能力保留；`@novasheet/core` 拆成三包，公共 `Grid` 从 `@novasheet/web-canvas2d` 导出。

| 维度 | 数值 |
|---|---|
| 包 | `@novasheet/core` · `@novasheet/web` · `@novasheet/web-canvas2d` |
| 测试 | 132 passing（bun:test，跨三包） |
| Lint / Typecheck / Build | 全部 clean |
| 公共 API | `import { Grid } from '@novasheet/web-canvas2d'`；数据/主题类型来自 `@novasheet/core` |

### M1 能力

- ✅ Canvas 单帧渲染（紧凑网格风默认主题，DPR 自适应）
- ✅ Theme Token 系统（渲染管线零硬编码视觉值）
- ✅ DataSource 抽象（同/异步双兼容签名，向 Phase 2+ 分页源开放）
- ✅ ChunkedAxis 算法（O(log n_chunks) 行/列定位，内存随实际使用自适应）
- ✅ Cell / Header / GridLines painter（含文本截断 + 千分位 + 字体度量缓存）
- ✅ 共享 FrameScheduler（同帧多源 invalidate 合并为一次 RAF）
- ✅ Grid facade（`setData` / `setTheme` / `setRowHeight` / `setColumnWidth` / `refresh` / `destroy`，destroy 幂等）

### 暂未交付（M2-M5）

| 里程碑 | 内容 |
|---|---|
| M2 | 虚拟滚动（NativeScroller + 非线性 scrollTop 映射） |
| M3 | 冻结行列（4 象限） + 动态行高交互 |
| M4 | 拖拽 / 键盘 resize · React Wrapper |
| M5 | playground（1M mock）· Playwright 跨浏览器回归 · iOS Safari 真机验证 |

---

## Quick Start

> M1 仅完成单帧静态渲染。滚动 / 选区 / 编辑等仍在路线图上。

```bash
bun install
bun run --filter @novasheet/web build
bun run --filter @novasheet/web-canvas2d build
bun run --filter @novasheet/core build
```

```ts
import { Grid } from '@novasheet/web-canvas2d'
import { InMemoryDataSource, denseGridTheme } from '@novasheet/core'

const data = new InMemoryDataSource({
  schema: {
    fields: [
      { id: 'name', name: 'Name',   type: 'text',   width: 200 },
      { id: 'age',  name: 'Age',    type: 'number', width: 80  },
      { id: 'role', name: 'Role',   type: 'text',   width: 160 },
    ],
  },
  rows: Array.from({ length: 100 }, (_, i) => ({
    name: `User ${i}`,
    age:  20 + (i % 50),
    role: i % 3 === 0 ? 'engineer' : 'designer',
  })),
})

const container = document.getElementById('app')!
const grid = new Grid(container, { data, theme: denseGridTheme })

// 程序化 API
grid.setColumnWidth('age', 120)
grid.setRowHeight(3, 60)

// 销毁
// grid.destroy()
```

---

## 架构概览

```
┌────────────────────────────────────────────────────────────┐
│   @novasheet/web-canvas2d                                  │
│   Grid (public facade) · Canvas2DRenderer · painters       │
│   HighDPI                                                  │
└────────────────────────────┬───────────────────────────────┘
                             │ depends on
                             ▼
┌────────────────────────────────────────────────────────────┐
│   @novasheet/web                                           │
│   DomGridHost · ScrollMapper · NativeScroller              │
│   WebGridRuntime · WebRenderer (interface)                 │
└────────────────────────────┬───────────────────────────────┘
                             │ depends on
                             ▼
┌────────────────────────────────────────────────────────────┐
│   @novasheet/core (no DOM, no canvas)                      │
│   DefaultGridEngine · DataSource · Theme · ChunkedAxis     │
│   RenderFrame (interface)                                  │
└────────────────────────────────────────────────────────────┘
```

详见 [docs/superpowers/specs/](docs/superpowers/specs/) 的设计文档。

---

## 仓库结构

```
novasheet/
├── packages/
│   ├── core/                @novasheet/core — 平台无关引擎
│   ├── web/                 @novasheet/web — 浏览器 host + runtime
│   └── web-canvas2d/        @novasheet/web-canvas2d — Canvas2D + 公共 Grid
├── apps/
│   └── storybook/           组件变体玩具间（vanilla HTML flavor，无 React 依赖）
├── docs/
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
bun run --filter @novasheet/web build
bun run --filter @novasheet/web-canvas2d build
bun run --filter @novasheet/core build
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

- **Phase 1**（进行中）：M1 Foundation ✅ → M2 滚动 → M3 冻结/动态 → M4 交互+React → M5 跨浏览器
- **Phase 2**：选区 / 键盘导航 / 复制粘贴 / 单元格编辑 / 字段类型专属编辑器 / 暗色主题
- **Phase 3**：排序 / 筛选 / 分组 / 列重排 / 列隐藏
- **Phase 4**：服务端分页 DataSource / OPFS / 协同
- **Phase 5**：公式引擎 / 多视图
- **Phase 6**：AI Native（自然语言查询、洞察、智能补全）

---

## License

TBD
