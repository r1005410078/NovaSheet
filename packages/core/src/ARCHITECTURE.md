# `@novasheet/core` 源码导航

> **状态：plan 本批 scope 已完成**（分支 `refactor-default-grid-engine-decomposition`）  
> **范围外仍待迁：** `format/`、`merge/`、`engine/format/*`（engine 第 7 步）  
> 设计：`docs/superpowers/specs/2026-06-06-novasheet-features-kernel-restructure-design.md`  
> 计划：`docs/superpowers/plans/2026-06-06-novasheet-features-kernel-restructure.md`  
> 子目录说明：`kernel/README.md`、`features/README.md`；组合根：`engine/README.md`

---

## 三层依赖

```text
kernel/          原语 + 跨域协议 + undo 机制 + 交互基建
    ↑
features/        行为领域垂直切片
    ↑
engine/          组合根：DefaultGridEngine + GridEngine
```

**外部包** 只从 `@novasheet/core` 的 `index.ts` 按名导入。

---

## 迁移总进度

| 批次 | 内容 | 状态 |
| --- | --- | --- |
| kernel 底座 + 协议/undo/interaction | `kernel/*` | ✅ |
| features（plan 范围） | row/column/selection/layout/fill/clipboard/view/edit/context-menu | ✅ |
| format + merge | store + engine/format + MergeViewResolver | ⬜ 范围外 |
| 坐标余留 | `view/coordinates.ts`、`view/CoordinateSpace.ts` | 🟡 仍顶层 `view/`（Task 9 注：可后续并入 `kernel/coords`） |

Engine 行为 refactor 第 7 步 format/merge 协调：**🟡 未收口**。

---

## 「我要找 X」

| 找什么 | 位置 |
| --- | --- |
| ChunkedAxis、Viewport、Theme、RenderFrame | `kernel/` |
| GridOperation、事件管线、Undo 机制 | `kernel/protocol/`、`kernel/undo/` |
| HitTest、CellLayout、HandleLayout | `kernel/interaction/` |
| 行/列/选区/layout/fill/clipboard/view/edit/菜单 | `features/<domain>/` |
| 格式 store | `format/`（待 `features/format/`） |
| 格式 mutation | `engine/format/`（待并入 format feature） |
| 合并 store | `merge/`（待 `features/merge/`） |
| merge view 解析 | `engine/MergeViewResolver.ts` |
| view↔raw 坐标 | `view/coordinates.ts`、`view/CoordinateSpace.ts` |
| 组装入口 | `engine/DefaultGridEngine.ts` |

---

## 测试目录

- `tests/kernel/*`、`tests/features/*` — 与 `src` 对齐
- `tests/engine/*` — DefaultGridEngine 等组合根回归
- `tests/view/coordinates*.test.ts` — 坐标协议（`view/` 未全迁）

新测试优先放在与 `src` 目标路径一致的目录。
