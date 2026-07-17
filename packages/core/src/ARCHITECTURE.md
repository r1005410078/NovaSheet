# `@zhiguang/core` 源码导航

> **状态：Engine 重构 7 步 + Composer Phase 2 + Web→Core（依赖反转）已完成**（分支 `refactor-default-grid-engine-decomposition`）  
> core 现含**纯层**（`kernel/features/engine/ports`）+ **DOM 壳**（`dom/`）+ 公开 `Grid` facade；`@zhiguang/web` 已并入并删除。
> 设计：`docs/superpowers/specs/2026-06-06-novasheet-web-into-core-dip-design.md`、`2026-06-06-novasheet-features-kernel-restructure-design.md`  
> 子目录：`kernel/README.md`、`features/README.md`；组合根：`engine/README.md`

---

## 分层依赖（纯层 / DOM 壳）

```text
─ 纯层（零 DOM · 可 node/worker · 脱 DOM 测）─────────────
kernel/          原语 + 跨域协议 + undo 机制 + 交互基建 + 坐标
    ↑
features/        行为领域垂直切片（含 format/merge store + mutation）
    ↑
engine/          组合根：DefaultGridEngine + GridEngine
ports/           边界契约：RenderBackend 端口（可引用 DOM 类型，不依赖 dom/）
─ DOM 壳（browser-only · 单向依赖纯层）──────────────────
    ↑
dom/             host / scroll / interaction / overlay / runtime
                 （GridRuntime + GridControllerImpl，注入 RenderBackend）
    ↑
Grid.ts          公开 facade：GridOptions.backend 注入渲染后端
```

**单向边界**：`dom/**` 可依赖纯层；纯层不得 import `dom/**`，`kernel|features|engine` 不得触碰 DOM 全局。由 `scripts/check-kernel-boundary.ts` 强制。

**渲染后端依赖反转**：`@zhiguang/canvas2d` 实现 `ports/RenderBackend`、反向依赖 core；core `src/` 永不 import canvas2d。组合根（storybook）`new Grid({ data, backend: canvas2dBackend })` 注入。

**外部包** 只从 `@zhiguang/core` 的 `index.ts` 按名导入。

---

## 迁移总进度

| 批次 | 内容 | 状态 |
| --- | --- | --- |
| kernel | 底座 + protocol/undo/interaction + coords/coordinates | ✅ |
| features | row/column/selection/layout/fill/clipboard/view/edit/context-menu | ✅ |
| features | format + merge（含 VisibleFormatResolver、MergeViewResolver） | ✅ |
| engine 第 7 步 | `DefaultFormatState` 聚合接线，收缩 DefaultGridEngine format 编排 | ✅ |
| web→core（依赖反转） | `@zhiguang/web` 并入 core `dom/` + `Grid` facade；canvas2d 经 `RenderBackend` 端口反向依赖；纯层/DOM 壳单向边界 | ✅ |

---

## 「我要找 X」

| 找什么 | 位置 |
| --- | --- |
| ChunkedAxis、Viewport、Theme、RenderFrame | `kernel/` |
| view↔raw 坐标、RawRange | `kernel/coords/` |
| GridOperation、事件管线、Undo 机制 | `kernel/protocol/`、`kernel/undo/` |
| HitTest、CellLayout | `kernel/interaction/` |
| 行/列/选区/layout/fill/clipboard/view/edit/菜单 | `features/<domain>/` |
| 格式 store + mutation + 帧解析 | `features/format/` |
| 合并 store + view 解析 | `features/merge/` |
| 组装入口 | `engine/DefaultGridEngine.ts` |
| 渲染后端端口 | `ports/RenderBackend.ts` |
| DOM host / 滚动 / 手势 / overlay | `dom/host/`、`dom/scroll/`、`dom/interaction/`、`dom/overlay/` |
| runtime 编排 + 通用装配 | `dom/runtime/GridRuntime.ts`、`dom/runtime/GridControllerImpl.ts` |
| 公开 Grid facade | `Grid.ts`（`GridOptions.backend` 注入后端） |

---

## 测试目录

- `tests/kernel/*`、`tests/features/*` — 与 `src` 对齐
- `tests/engine/*` — DefaultGridEngine 组合根回归

新测试优先放在与 `src` 目标路径一致的目录。
